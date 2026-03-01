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

// ─── Spy / scout weapon multipliers (mirrors power.ts) ────────────────────
const SPY_WEAPON_MULT = {
  shadow_cloak: 1.15,
  dark_mask:    1.30,
  elven_gear:   1.50,
} as const

const SCOUT_WEAPON_MULT = {
  scout_boots:  1.15,
  scout_cloak:  1.30,
  elven_boots:  1.50,
} as const

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
  return Math.floor(scouts * trainMult * weapMult * raceMult)
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

    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // ── Fetch attacker data ───────────────────────────────────────────────
    const [
      { data: attPlayer },
      { data: attArmy },
      { data: attWeapons },
      { data: attTraining },
    ] = await Promise.all([
      supabase.from('players').select('turns, city, race').eq('id', playerId).single(),
      supabase.from('army').select('spies, slaves').eq('player_id', playerId).single(),
      supabase.from('weapons').select('shadow_cloak, dark_mask, elven_gear').eq('player_id', playerId).single(),
      supabase.from('training').select('spy_level').eq('player_id', playerId).single(),
    ])

    if (!attPlayer || !attArmy || !attWeapons || !attTraining) {
      return NextResponse.json({ error: 'Attacker data not found' }, { status: 404 })
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
    ] = await Promise.all([
      supabase.from('players').select('city, race, army_name, power_attack, power_defense, power_spy, power_scout, power_total').eq('id', target_id).single(),
      supabase.from('army').select('*').eq('player_id', target_id).single(),
      supabase.from('weapons').select('scout_boots, scout_cloak, elven_boots').eq('player_id', target_id).single(),
      supabase.from('training').select('scout_level').eq('player_id', target_id).single(),
      supabase.from('resources').select('gold, iron, wood, food').eq('player_id', target_id).single(),
      getActiveHeroEffects(supabase, target_id),
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

    const scoutDefense = calcScoutDefense(
      defArmy.scouts,
      defTraining.scout_level,
      defWeapons as Record<string, number>,
      defPlayer.race,
    )

    const success = spyPower > scoutDefense

    // ── Calculate spies caught (on failure) ───────────────────────────────
    let spiesCaught = 0
    if (!success) {
      const ratio     = scoutDefense > 0 ? Math.min(scoutDefense / Math.max(spyPower, 1), 1) : 1
      const rawCatch  = Math.floor(spies_sent * BALANCE.spy.catchRate * ratio)
      spiesCaught     = Math.min(rawCatch, Math.floor(spies_sent * BALANCE.spy.MAX_CATCH_RATE))
    }

    const nowIso = new Date().toISOString()

    const seasonId = activeSeason.id

    // ── Build revealed data (only on success) ─────────────────────────────
    const revealed = success ? {
      army_name:       defPlayer.army_name,
      soldiers:        defArmy.soldiers,
      spies:           defArmy.spies,
      scouts:          defArmy.scouts,
      cavalry:         defArmy.cavalry,
      slaves:          defArmy.slaves,
      farmers:         defArmy.farmers,
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
    } : null

    // ── Apply changes ─────────────────────────────────────────────────────
    const newSpies = Math.max(0, attArmy.spies - spiesCaught)
    const newTurns = attPlayer.turns - turnCost

    await Promise.all([
      supabase.from('players').update({ turns: newTurns }).eq('id', playerId),
      ...(spiesCaught > 0
        ? [supabase.from('army').update({ spies: newSpies, updated_at: nowIso }).eq('player_id', playerId)]
        : []),
      supabase.from('spy_history').insert({
        spy_owner_id:  playerId,
        target_id,
        success,
        spies_caught:  spiesCaught,
        data_revealed: revealed,
        season_id:     seasonId,
      }),
    ])

    // Recalculate attacker power if spies were lost
    if (spiesCaught > 0) {
      await recalculatePower(playerId, supabase)
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
    })
  } catch (err) {
    console.error('Spy error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
