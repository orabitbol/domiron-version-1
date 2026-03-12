/**
 * GET  /api/spy   — List spyable targets in same city
 * POST /api/spy   — Execute a spy mission against a target
 *
 * Spy formula:
 *   spyPower    = spies × spyTrainMult × spyWeaponMult × raceMult
 *   scoutDefense = scouts × scoutTrainMult × scoutWeaponMult × raceMult
 *
 *   success  ← spyPower > scoutDefense
 *   failure  ← spyPower ≤ scoutDefense → spies caught ∝ power gap
 *
 * Turn cost: BALANCE.spy.turnCost (paid regardless of outcome).
 * Attacker must have ≥ BALANCE.spy.minSpies spies.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { recalculatePower } from '@/lib/game/power'
import { getActiveHeroEffects } from '@/lib/game/hero-effects'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

// ─── Spy / scout weapon multipliers — read from BALANCE (single source of truth) ─
const SPY_WEAPON_MULT   = BALANCE.pp.SPY_GEAR_MULT
const SCOUT_WEAPON_MULT = BALANCE.pp.SCOUT_GEAR_MULT

function calcSpyPower(
  spies:        number,
  spyLevel:     number,
  weapons:      Record<string, number>,
  race:         string,
): number {
  const trainMult = 1 + spyLevel * BALANCE.training.advancedMultiplierPerLevel
  let weapMult = 1.0
  if ((weapons.shadow_cloak ?? 0) > 0) weapMult *= SPY_WEAPON_MULT.shadow_cloak
  if ((weapons.dark_mask    ?? 0) > 0) weapMult *= SPY_WEAPON_MULT.dark_mask
  if ((weapons.elven_gear   ?? 0) > 0) weapMult *= SPY_WEAPON_MULT.elven_gear
  const raceMult = race === 'elf' ? 1 + BALANCE.raceBonuses.elf.spyBonus : 1.0
  return Math.floor(spies * trainMult * weapMult * raceMult)
}

function calcScoutDefense(
  scouts:       number,
  scoutLevel:   number,
  weapons:      Record<string, number>,
  race:         string,
): number {
  const trainMult = 1 + scoutLevel * BALANCE.training.advancedMultiplierPerLevel
  let weapMult = 1.0
  if ((weapons.scout_boots  ?? 0) > 0) weapMult *= SCOUT_WEAPON_MULT.scout_boots
  if ((weapons.scout_cloak  ?? 0) > 0) weapMult *= SCOUT_WEAPON_MULT.scout_cloak
  if ((weapons.elven_boots  ?? 0) > 0) weapMult *= SCOUT_WEAPON_MULT.elven_boots
  const raceMult = race === 'elf' ? 1 + BALANCE.raceBonuses.elf.scoutBonus : 1.0
  return Math.floor(scouts * BALANCE.pp.SCOUT_UNIT_VALUE * trainMult * weapMult * raceMult)
}

// ── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id
  const supabase = createClient()

  const { data: attPlayer } = await supabase
    .from('players')
    .select('city, army_name')
    .eq('id', playerId)
    .single()

  if (!attPlayer) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const { data: cityPlayers } = await supabase
    .from('players')
    .select('id, army_name, city, rank_city, power_total, is_vacation')
    .eq('city', attPlayer.city)
    .neq('id', playerId)
    .order('rank_city', { ascending: true })
    .limit(100)

  if (!cityPlayers || cityPlayers.length === 0) {
    return NextResponse.json({ data: { targets: [] } })
  }

  const playerIds = cityPlayers.map((p) => p.id)

  // Fetch army (spy/scout counts for each target)
  const { data: armyRows } = await supabase
    .from('army')
    .select('player_id, scouts')
    .in('player_id', playerIds)

  const targets = cityPlayers.map((p) => ({
    id:          p.id,
    army_name:   p.army_name,
    rank_city:   p.rank_city,
    scouts:      armyRows?.find((a) => a.player_id === p.id)?.scouts ?? 0,
    is_vacation: p.is_vacation,
  }))

  return NextResponse.json({ data: { targets } })
}

// ── POST ───────────────────────────────────────────────────────────────────

const spySchema = z.object({
  target_id:   z.string().uuid(),
  spies_sent:  z.number().int().min(1),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const body = await request.json()
    const parsed = spySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { target_id, spies_sent } = parsed.data

    if (target_id === playerId) {
      return NextResponse.json({ error: 'Cannot spy on yourself' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const now = new Date()

    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // ── Fetch attacker data ───────────────────────────────────────────────
    const [
      { data: attPlayer },
      { data: attArmy },
      { data: attWeapons },
      { data: attTraining },
    ] = await Promise.all([
      supabase.from('players').select('turns, city, race, last_spy_at').eq('id', playerId).single(),
      supabase.from('army').select('spies, slaves').eq('player_id', playerId).single(),
      supabase.from('weapons').select('shadow_cloak, dark_mask, elven_gear').eq('player_id', playerId).single(),
      supabase.from('training').select('spy_level').eq('player_id', playerId).single(),
    ])

    if (!attPlayer || !attArmy || !attWeapons || !attTraining) {
      return NextResponse.json({ error: 'Attacker data not found' }, { status: 404 })
    }

    // Rate limiting — 1 s cooldown between spy missions (server authority)
    if (attPlayer.last_spy_at &&
        now.getTime() - new Date(attPlayer.last_spy_at).getTime() < 1_000) {
      return NextResponse.json({ error: 'Spy cooldown active' }, { status: 429 })
    }

    const turnCost = BALANCE.spy.turnCost
    if (attPlayer.turns < turnCost) {
      return NextResponse.json({ error: `Not enough turns (need ${turnCost})` }, { status: 400 })
    }
    if (attArmy.spies < BALANCE.spy.minSpies) {
      return NextResponse.json({
        error: `Need at least ${BALANCE.spy.minSpies} spy to send a mission`,
      }, { status: 400 })
    }
    if (spies_sent > attArmy.spies) {
      return NextResponse.json({
        error: `Cannot send more spies than you have (${attArmy.spies} available)`,
      }, { status: 400 })
    }

    // ── Fetch defender data ───────────────────────────────────────────────
    const [
      { data: defPlayer },
      { data: defArmy },
      { data: defWeapons },
      { data: defTraining },
      { data: defResources },
      defHero,
      { data: defBank },
      { data: defTribeMember },
    ] = await Promise.all([
      supabase.from('players').select('city, race, army_name, power_attack, power_defense, power_spy, power_scout, power_total').eq('id', target_id).single(),
      supabase.from('army').select('*').eq('player_id', target_id).single(),
      supabase.from('weapons').select('*').eq('player_id', target_id).single(),
      supabase.from('training').select('scout_level, spy_level, attack_level, defense_level').eq('player_id', target_id).single(),
      supabase.from('resources').select('gold, iron, wood, food').eq('player_id', target_id).single(),
      getActiveHeroEffects(supabase, target_id),
      supabase.from('bank').select('balance, interest_level').eq('player_id', target_id).maybeSingle(),
      supabase.from('tribe_members').select('tribe_id').eq('player_id', target_id).maybeSingle(),
    ])

    if (!defPlayer || !defArmy || !defWeapons || !defTraining || !defResources) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 })
    }

    if (defPlayer.city !== attPlayer.city) {
      return NextResponse.json({ error: 'Target is in a different city' }, { status: 400 })
    }

    // ── Calculate spy vs scout power ──────────────────────────────────────
    const spyPower = calcSpyPower(
      spies_sent,
      attTraining.spy_level,
      attWeapons as Record<string, number>,
      attPlayer.race,
    )

    let scoutDefense = calcScoutDefense(
      defArmy.scouts,
      defTraining.scout_level,
      defWeapons as Record<string, number>,
      defPlayer.race,
    )

    // Apply spy_veil tribe spell multiplier (boosts defender's scout defense)
    // Also fetch tribe name/level for strategic intel reveal.
    let tribeIntel: { name: string; level: number } | null = null
    if (defTribeMember?.tribe_id) {
      const [{ data: spyVeilSpell }, { data: tribeData }] = await Promise.all([
        supabase
          .from('tribe_spells')
          .select('id')
          .eq('tribe_id', defTribeMember.tribe_id)
          .eq('spell_key', 'spy_veil')
          .gt('expires_at', now.toISOString())
          .maybeSingle(),
        supabase
          .from('tribes')
          .select('name, level')
          .eq('id', defTribeMember.tribe_id)
          .single(),
      ])
      if (spyVeilSpell) {
        scoutDefense = Math.floor(
          scoutDefense * BALANCE.tribe.spellEffects.spy_veil.scoutDefenseMultiplier
        )
      }
      tribeIntel = tribeData ? { name: tribeData.name, level: tribeData.level } : null
    }

    const success = spyPower > scoutDefense

    // ── Calculate spies caught (on failure) ───────────────────────────────
    let spiesCaught = 0
    if (!success) {
      const ratio     = scoutDefense > 0 ? Math.min(scoutDefense / Math.max(spyPower, 1), 1) : 1
      const rawCatch  = Math.floor(spies_sent * BALANCE.spy.catchRate * ratio)
      spiesCaught     = Math.min(rawCatch, Math.floor(spies_sent * BALANCE.spy.MAX_CATCH_RATE))
    }

    const seasonId = activeSeason.id

    // ── Build revealed data (only on success) ─────────────────────────────
    const w = defWeapons as Record<string, number>
    const t = defTraining as Record<string, number>
    const revealed = success ? {
      army_name:       defPlayer.army_name,
      city:            defPlayer.city,
      soldiers:        defArmy.soldiers,
      cavalry:         defArmy.cavalry,
      spies:           defArmy.spies,
      scouts:          defArmy.scouts,
      slaves:          defArmy.slaves,
      free_population: defArmy.free_population,
      gold:            defResources.gold,
      iron:            defResources.iron,
      wood:            defResources.wood,
      food:            defResources.food,
      power_attack:    defPlayer.power_attack,
      power_defense:   defPlayer.power_defense,
      power_spy:       defPlayer.power_spy,
      power_scout:     defPlayer.power_scout,
      power_total:     defPlayer.power_total,
      soldier_shield:  defHero.soldierShieldActive,
      resource_shield: defHero.resourceShieldActive,
      // ── Extended intel ──────────────────────────────────────────────────
      bank_gold:          defBank?.balance ?? 0,
      bank_interest_level: defBank?.interest_level ?? 0,
      attack_weapons: {
        slingshot:    w.slingshot    ?? 0,
        boomerang:    w.boomerang    ?? 0,
        pirate_knife: w.pirate_knife ?? 0,
        axe:          w.axe          ?? 0,
        master_knife: w.master_knife ?? 0,
        knight_axe:   w.knight_axe   ?? 0,
        iron_ball:    w.iron_ball    ?? 0,
      },
      defense_weapons: {
        wood_shield:   w.wood_shield   ?? 0,
        iron_shield:   w.iron_shield   ?? 0,
        leather_armor: w.leather_armor ?? 0,
        chain_armor:   w.chain_armor   ?? 0,
        plate_armor:   w.plate_armor   ?? 0,
        mithril_armor: w.mithril_armor ?? 0,
        gods_armor:    w.gods_armor    ?? 0,
      },
      spy_weapons: {
        shadow_cloak: w.shadow_cloak ?? 0,
        dark_mask:    w.dark_mask    ?? 0,
        elven_gear:   w.elven_gear   ?? 0,
      },
      scout_weapons: {
        scout_boots:  w.scout_boots  ?? 0,
        scout_cloak:  w.scout_cloak  ?? 0,
        elven_boots:  w.elven_boots  ?? 0,
      },
      attack_level:  t.attack_level  ?? 0,
      defense_level: t.defense_level ?? 0,
      spy_level:     t.spy_level     ?? 0,
      scout_level:   t.scout_level   ?? 0,
      tribe_name:    tribeIntel?.name  ?? null,
      tribe_level:   tribeIntel?.level ?? null,
    } : null

    // ── Atomic DB write via RPC ───────────────────────────────────────────────
    // spy_resolve_apply() acquires FOR UPDATE locks on attacker's players + army,
    // re-validates turns and spies count under lock (TOCTTOU-safe), then applies
    // all three writes in one Postgres transaction:
    //   players.turns -= turnCost
    //   army.spies -= spiesCaught  (only if caught > 0)
    //   spy_history INSERT
    // See: supabase/migrations/0014_spy_resolve_rpc.sql
    const { data: rpcResult, error: rpcError } = await supabase.rpc('spy_resolve_apply', {
      p_spy_owner_id:  playerId,
      p_target_id:     target_id,
      p_spies_sent:    spies_sent,
      p_turn_cost:     turnCost,
      p_spies_caught:  spiesCaught,
      p_success:       success,
      p_data_revealed: revealed,
      p_season_id:     seasonId,
    })

    if (rpcError) {
      console.error('[spy] RPC error:', rpcError.code, rpcError.message)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    // RPC re-validated constraints under lock — map error codes to HTTP 400.
    if (!rpcResult?.ok) {
      const code = rpcResult?.error ?? 'unknown'
      const SPY_RPC_ERROR_MAP: Record<string, string> = {
        not_enough_turns: `Not enough turns (need ${turnCost})`,
        not_enough_spies: `Cannot send more spies than you have (${attArmy.spies} available)`,
      }
      return NextResponse.json(
        { error: SPY_RPC_ERROR_MAP[code] ?? 'Spy mission failed' },
        { status: 400 },
      )
    }

    const newTurns = rpcResult.new_turns as number
    const newSpies = rpcResult.new_spies as number

    // Recalculate attacker power if spies were lost (non-fatal, self-corrects on next tick)
    if (spiesCaught > 0) {
      try {
        await recalculatePower(playerId, supabase)
      } catch (powerErr) {
        console.error('[spy] Power recalculation failed (non-fatal):', powerErr)
      }
    }

    return NextResponse.json({
      result: {
        success,
        spy_power:     spyPower,
        scout_defense: scoutDefense,
        spies_sent,
        spies_caught:  spiesCaught,
        revealed,
      },
      turns: newTurns,
      spies: newSpies,
    })
  } catch (err) {
    console.error('Spy error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
