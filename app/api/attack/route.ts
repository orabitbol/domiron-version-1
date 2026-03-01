import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import {
  calculatePersonalPower,
  resolveCombat,
  isKillCooldownActive,
  isNewPlayerProtected,
  getLootDecayMultiplier,
} from '@/lib/game/combat'
import type { ClanContext } from '@/lib/game/combat'
import { getActiveHeroEffects, clampBonus } from '@/lib/game/hero-effects'
import { recalculatePower } from '@/lib/game/power'
import type { BattleReport, BattleReportReason } from '@/types/game'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const attackSchema = z.object({
  defender_id: z.string().uuid(),
  turns: z.number().int().min(1).max(10),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const body = await request.json()
    const parsed = attackSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { defender_id, turns: turnsUsed } = parsed.data

    if (defender_id === playerId) {
      return NextResponse.json({ error: 'Cannot attack yourself' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Fetch active season — also acts as freeze guard (returns null if ended/expired)
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // Fetch attacker data
    const [
      { data: attPlayer },
      { data: attArmy },
      { data: attWeapons },
      { data: attTraining },
      { data: attDev },
      { data: attResources },
      { data: attTribeMember },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('id', playerId).single(),
      supabase.from('army').select('*').eq('player_id', playerId).single(),
      supabase.from('weapons').select('*').eq('player_id', playerId).single(),
      supabase.from('training').select('*').eq('player_id', playerId).single(),
      supabase.from('development').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
      supabase.from('tribe_members').select('tribe_id').eq('player_id', playerId).maybeSingle(),
    ])

    if (!attPlayer || !attArmy || !attWeapons || !attTraining || !attDev || !attResources) {
      return NextResponse.json({ error: 'Attacker data not found' }, { status: 404 })
    }

    const foodCost = turnsUsed * BALANCE.combat.foodCostPerTurn

    if (attPlayer.turns < turnsUsed) {
      return NextResponse.json({ error: 'Not enough turns' }, { status: 400 })
    }
    if (attResources.food < foodCost) {
      return NextResponse.json({ error: 'Not enough food' }, { status: 400 })
    }
    if (attArmy.soldiers <= 0) {
      return NextResponse.json({ error: 'No soldiers to attack with' }, { status: 400 })
    }

    // Fetch defender data
    const [
      { data: defPlayer },
      { data: defArmy },
      { data: defWeapons },
      { data: defTraining },
      { data: defDev },
      { data: defResources },
      { data: defTribeMember },
    ] = await Promise.all([
      supabase.from('players').select('*').eq('id', defender_id).single(),
      supabase.from('army').select('*').eq('player_id', defender_id).single(),
      supabase.from('weapons').select('*').eq('player_id', defender_id).single(),
      supabase.from('training').select('*').eq('player_id', defender_id).single(),
      supabase.from('development').select('*').eq('player_id', defender_id).single(),
      supabase.from('resources').select('*').eq('player_id', defender_id).single(),
      supabase.from('tribe_members').select('tribe_id').eq('player_id', defender_id).maybeSingle(),
    ])

    if (!defPlayer || !defArmy || !defWeapons || !defTraining || !defDev || !defResources) {
      return NextResponse.json({ error: 'Defender not found' }, { status: 404 })
    }

    const now = new Date()

    // Fetch tribe data for ClanContext (power_total + level)
    const tribeIds = [attTribeMember?.tribe_id, defTribeMember?.tribe_id].filter(Boolean) as string[]
    let attClanCtx: ClanContext | null = null
    let defClanCtx: ClanContext | null = null

    if (tribeIds.length > 0) {
      const { data: tribes } = await supabase
        .from('tribes')
        .select('id, power_total, level')
        .in('id', tribeIds)

      if (tribes) {
        const attTribe = attTribeMember?.tribe_id ? tribes.find((t) => t.id === attTribeMember.tribe_id) : null
        const defTribe = defTribeMember?.tribe_id ? tribes.find((t) => t.id === defTribeMember.tribe_id) : null
        if (attTribe) attClanCtx = { totalClanPP: attTribe.power_total, developmentLevel: attTribe.level }
        if (defTribe) defClanCtx = { totalClanPP: defTribe.power_total, developmentLevel: defTribe.level }
      }
    }

    // Kill cooldown window and loot decay window
    const killCooldownStart  = new Date(now.getTime() - BALANCE.combat.KILL_COOLDOWN_HOURS * 3_600_000)
    const decayWindowStart   = new Date(now.getTime() - BALANCE.antiFarm.DECAY_WINDOW_HOURS * 3_600_000)

    const [
      { count: killCount },
      { count: attacksInWindow },
      attHero,
      defHero,
    ] = await Promise.all([
      supabase
        .from('attacks')
        .select('*', { count: 'exact', head: true })
        .eq('attacker_id', playerId)
        .eq('defender_id', defender_id)
        .gt('defender_losses', 0)
        .gte('created_at', killCooldownStart.toISOString()),
      supabase
        .from('attacks')
        .select('*', { count: 'exact', head: true })
        .eq('attacker_id', playerId)
        .eq('defender_id', defender_id)
        .gte('created_at', decayWindowStart.toISOString()),
      getActiveHeroEffects(supabase, playerId),
      getActiveHeroEffects(supabase, defender_id),
    ])

    const killCooldown      = (killCount ?? 0) > 0
    const seasonStartedAt   = new Date(activeSeason.starts_at)
    const attackerProtected = isNewPlayerProtected(new Date(attPlayer.created_at), seasonStartedAt, now)
    const defenderProtected = isNewPlayerProtected(new Date(defPlayer.created_at), seasonStartedAt, now)

    // ── DIAGNOSTIC LOGGING — remove after root cause is identified ────────────
    console.log('[ATK_DIAG] === ATTACK DIAGNOSTIC START ===')
    console.log('[ATK_DIAG] Attacker ID:', playerId, '| Defender ID:', defender_id)
    console.log('[ATK_DIAG] Defender resources (unbanked):', {
      gold: defResources.gold,
      iron: defResources.iron,
      wood: defResources.wood,
      food: defResources.food,
    })
    console.log('[ATK_DIAG] Defender army:', {
      soldiers: defArmy.soldiers,
      slaves: defArmy.slaves,
    })
    console.log('[ATK_DIAG] Combat flags:', {
      killCooldown,
      attackerProtected,
      defenderProtected,
      defenderCreatedAt: defPlayer.created_at,
      resourceShieldActive: defHero.resourceShieldActive,
      soldierShieldActive:  defHero.soldierShieldActive,
      attackerTotalAttackBonus: attHero.totalAttackBonus,
      defenderTotalDefenseBonus: defHero.totalDefenseBonus,
    })
    console.log('[ATK_DIAG] attackCountInWindow (incl. current):', (attacksInWindow ?? 0) + 1)
    // ─────────────────────────────────────────────────────────────────────────

    // PersonalPower — computed fresh from stored stat rows
    const attackerPP = calculatePersonalPower({
      army:        attArmy,
      weapons:     attWeapons,
      training:    attTraining,
      development: attDev,
    })
    const defenderPP = calculatePersonalPower({
      army:        defArmy,
      weapons:     defWeapons,
      training:    defTraining,
      development: defDev,
    })

    // Resolve full combat
    const result = resolveCombat({
      attackerPP,
      defenderPP,
      deployedSoldiers:    attArmy.soldiers,
      defenderSoldiers:    defArmy.soldiers,
      attackerClan:        attClanCtx,
      defenderClan:        defClanCtx,
      defenderUnbanked:    { gold: defResources.gold, iron: defResources.iron, wood: defResources.wood, food: defResources.food },
      attackCountInWindow: (attacksInWindow ?? 0) + 1,
      killCooldownActive:  killCooldown,
      attackerIsProtected: attackerProtected,
      defenderIsProtected: defenderProtected,
      attackBonus:         clampBonus(attHero.totalAttackBonus),
      defenseBonus:        clampBonus(defHero.totalDefenseBonus),
      soldierShieldActive: defHero.soldierShieldActive,
      resourceShieldActive: defHero.resourceShieldActive,
    })

    // ── DIAGNOSTIC LOGGING — remove after root cause is identified ────────────
    console.log('[ATK_DIAG] attackerPP:', attackerPP, '| defenderPP:', defenderPP)
    console.log('[ATK_DIAG] resolveCombat result:', {
      outcome:        result.outcome,
      ratio:          result.ratio,
      attackerECP:    result.attackerECP,
      defenderECP:    result.defenderECP,
      loot:           result.loot,
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
    })
    // ─────────────────────────────────────────────────────────────────────────

    // Safety clamps — never steal more than defender has
    const goldStolen = Math.min(result.loot.gold, defResources.gold)
    const ironStolen = Math.min(result.loot.iron, defResources.iron)
    const woodStolen = Math.min(result.loot.wood, defResources.wood)
    const foodStolen = Math.min(result.loot.food, defResources.food)

    // Safety clamp — never lose more soldiers than available
    const safeDefLosses = Math.min(result.defenderLosses, defArmy.soldiers)

    // New resource values
    const newAttSoldiers = Math.max(0, attArmy.soldiers - result.attackerLosses)
    const newAttGold     = attResources.gold + goldStolen
    const newAttIron     = attResources.iron + ironStolen
    const newAttWood     = attResources.wood + woodStolen
    const newAttFood     = Math.max(0, attResources.food - foodCost + foodStolen)
    const newAttTurns    = attPlayer.turns - turnsUsed

    const newDefSoldiers = Math.max(0, defArmy.soldiers - safeDefLosses)
    const newDefGold     = Math.max(0, defResources.gold - goldStolen)
    const newDefIron     = Math.max(0, defResources.iron - ironStolen)
    const newDefWood     = Math.max(0, defResources.wood - woodStolen)
    const newDefFood     = Math.max(0, defResources.food - foodStolen)

    // Season ID — already fetched at top of handler
    const seasonId = activeSeason.id

    const nowIso = now.toISOString()

    // Map 'partial' → 'draw' for DB constraint compatibility
    const dbOutcome = result.outcome === 'partial' ? 'draw' : result.outcome

    // ── Pre-commit invariant assertions ──────────────────────────────────────
    // These are always true by construction. They catch future coding mistakes
    // (wrong formula rewrites) before they reach the DB.
    if (goldStolen > defResources.gold) throw new Error('Attack invariant: goldStolen > defResources.gold')
    if (ironStolen > defResources.iron)  throw new Error('Attack invariant: ironStolen > defResources.iron')
    if (woodStolen > defResources.wood)  throw new Error('Attack invariant: woodStolen > defResources.wood')
    if (foodStolen > defResources.food)  throw new Error('Attack invariant: foodStolen > defResources.food')
    if (safeDefLosses > defArmy.soldiers) throw new Error('Attack invariant: safeDefLosses > defArmy.soldiers')
    if (newDefSoldiers < 0) throw new Error('Attack invariant: newDefSoldiers < 0')
    if (newAttSoldiers < 0) throw new Error('Attack invariant: newAttSoldiers < 0')
    if (newAttFood     < 0) throw new Error('Attack invariant: newAttFood < 0')

    // ── DB writes ────────────────────────────────────────────────────────────
    // NOTE: These run as 6 separate HTTP calls — PostgREST does not support
    // cross-call transactions. A partial failure leaves an inconsistent state.
    // True atomicity requires migrating this to a supabase.rpc() stored function.
    // Error checking below ensures we return 500 (not 200) if any write fails.
    const [
      attPlayerRes,
      attArmyRes,
      attResourcesRes,
      defArmyRes,
      defResourcesRes,
      attackInsertRes,
    ] = await Promise.all([
      supabase.from('players').update({ turns: newAttTurns }).eq('id', playerId),
      supabase.from('army').update({ soldiers: newAttSoldiers, updated_at: nowIso }).eq('player_id', playerId),
      supabase.from('resources').update({ gold: newAttGold, iron: newAttIron, wood: newAttWood, food: newAttFood, updated_at: nowIso }).eq('player_id', playerId),
      supabase.from('army').update({ soldiers: newDefSoldiers, updated_at: nowIso }).eq('player_id', defender_id),
      supabase.from('resources').update({ gold: newDefGold, iron: newDefIron, wood: newDefWood, food: newDefFood, updated_at: nowIso }).eq('player_id', defender_id),
      supabase.from('attacks').insert({
        attacker_id:     playerId,
        defender_id,
        turns_used:      turnsUsed,
        atk_power:       result.attackerECP,
        def_power:       result.defenderECP,
        outcome:         dbOutcome,
        attacker_losses: result.attackerLosses,
        defender_losses: safeDefLosses,
        slaves_taken:    0,
        gold_stolen:     goldStolen,
        iron_stolen:     ironStolen,
        wood_stolen:     woodStolen,
        food_stolen:     foodStolen,
        season_id:       seasonId,
      }),
    ])

    // Abort if any write failed — prevents phantom battleReport on DB error
    const writeErrors = [
      attPlayerRes.error,
      attArmyRes.error,
      attResourcesRes.error,
      defArmyRes.error,
      defResourcesRes.error,
      attackInsertRes.error,
    ].filter(Boolean)
    if (writeErrors.length > 0) {
      console.error('Attack DB write failures:', writeErrors)
      throw new Error(`Attack DB write failed (${writeErrors.length} errors)`)
    }

    // Recalculate stored power for both sides (army counts changed)
    await Promise.all([
      recalculatePower(playerId, supabase),
      recalculatePower(defender_id, supabase),
    ])

    // ── DIAGNOSTIC: DB re-fetch + delta verification ──────────────────────────
    // Re-read DB truth and compare against what we computed. Remove after confirmed.
    const [
      { data: dbAttRes },
      { data: dbAttArmy },
      { data: dbDefRes },
      { data: dbDefArmy },
    ] = await Promise.all([
      supabase.from('resources').select('gold,iron,wood,food').eq('player_id', playerId).single(),
      supabase.from('army').select('soldiers').eq('player_id', playerId).single(),
      supabase.from('resources').select('gold,iron,wood,food').eq('player_id', defender_id).single(),
      supabase.from('army').select('soldiers').eq('player_id', defender_id).single(),
    ])

    // attDelta = dbAfter − before (positive = attacker gained)
    // food delta = foodStolen − foodCost, not just foodStolen — this is expected and correct
    const attDelta = dbAttRes && dbAttArmy ? {
      gold:     dbAttRes.gold     - attResources.gold,
      iron:     dbAttRes.iron     - attResources.iron,
      wood:     dbAttRes.wood     - attResources.wood,
      food:     dbAttRes.food     - attResources.food,
      soldiers: dbAttArmy.soldiers - attArmy.soldiers,
    } : null

    // defDelta = before − dbAfter (positive = stolen from defender / lost by defender)
    const defDelta = dbDefRes && dbDefArmy ? {
      gold:     defResources.gold     - dbDefRes.gold,
      iron:     defResources.iron     - dbDefRes.iron,
      wood:     defResources.wood     - dbDefRes.wood,
      food:     defResources.food     - dbDefRes.food,
      soldiers: defArmy.soldiers      - dbDefArmy.soldiers,
    } : null

    console.log('[ATK_DIAG] DB_DELTA attacker :', attDelta)
    console.log('[ATK_DIAG] DB_DELTA defender :', defDelta)
    console.log('[ATK_DIAG] Report gained     :', {
      loot: { gold: goldStolen, iron: ironStolen, wood: woodStolen, food: foodStolen },
    })
    console.log('[ATK_DIAG] Expected att delta:', {
      gold: goldStolen, iron: ironStolen, wood: woodStolen,
      food: foodStolen - foodCost,   // net: loot food minus food spent
      soldiers: -result.attackerLosses,
    })
    console.log('[ATK_DIAG] Expected def delta:', {
      gold: goldStolen, iron: ironStolen, wood: woodStolen, food: foodStolen,
      soldiers: safeDefLosses,
    })

    // Invariant checks: DB truth must match report exactly
    const violations: string[] = []
    if (attDelta) {
      if (attDelta.gold   !== goldStolen)  violations.push(`att.gold   DB=${attDelta.gold}   report=${goldStolen}`)
      if (attDelta.iron   !== ironStolen)  violations.push(`att.iron   DB=${attDelta.iron}   report=${ironStolen}`)
      if (attDelta.wood   !== woodStolen)  violations.push(`att.wood   DB=${attDelta.wood}   report=${woodStolen}`)
    }
    if (defDelta) {
      if (defDelta.gold     !== goldStolen)  violations.push(`def.gold     DB=${defDelta.gold}     report=${goldStolen}`)
      if (defDelta.iron     !== ironStolen)  violations.push(`def.iron     DB=${defDelta.iron}     report=${ironStolen}`)
      if (defDelta.wood     !== woodStolen)  violations.push(`def.wood     DB=${defDelta.wood}     report=${woodStolen}`)
      if (defDelta.food     !== foodStolen)  violations.push(`def.food     DB=${defDelta.food}     report=${foodStolen}`)
      if (defDelta.soldiers !== safeDefLosses) violations.push(`def.soldiers DB=${defDelta.soldiers} report=${safeDefLosses}`)
    }

    if (violations.length > 0) {
      console.error('[ATK_DIAG] *** DB INVARIANT VIOLATIONS — DB ≠ Report ***')
      violations.forEach((v) => console.error('[ATK_DIAG]   ✗', v))
    } else {
      console.log('[ATK_DIAG] ✓ All DB deltas match report — no desync')
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Build battleReport: structured result the client renders directly
    const attackCount   = (attacksInWindow ?? 0) + 1
    const decayMult     = getLootDecayMultiplier(attackCount)
    // defUnbanked: used only for the flags field — reflects pre-attack state
    const defUnbanked   = defResources.gold === 0 && defResources.iron === 0 &&
                          defResources.wood === 0 && defResources.food === 0
    // allStolenZero: true when the player gained literally nothing (covers both empty
    // resources AND the case where small values floor-round to 0 loot)
    const allStolenZero = goldStolen === 0 && ironStolen === 0 && woodStolen === 0 && foodStolen === 0


    const reasons: BattleReportReason[] = []
    if (result.outcome === 'loss')        reasons.push('OUTCOME_LOSS_NO_LOOT')
    if (defenderProtected)                reasons.push('DEFENDER_PROTECTED')
    if (defHero.resourceShieldActive)     reasons.push('RESOURCE_SHIELD_ACTIVE')
    if (defHero.soldierShieldActive)      reasons.push('SOLDIER_SHIELD_NO_LOSSES')
    if (killCooldown)                     reasons.push('KILL_COOLDOWN_NO_LOSSES')
    if (attackerProtected)                reasons.push('ATTACKER_PROTECTED_NO_LOSSES')
    if (attackCount > 1)                  reasons.push('LOOT_DECAY_REDUCED')
    // NO_UNBANKED_RESOURCES fires when loot is actually zero (post-floor) and no
    // higher-priority condition already explains it. Covers both empty banks and
    // resources so small they round to 0 after BASE_LOOT_RATE × floor().
    if (allStolenZero &&
        result.outcome !== 'loss' && !defenderProtected && !defHero.resourceShieldActive) {
      reasons.push('NO_UNBANKED_RESOURCES')
    }

    const outcomeMap = { win: 'WIN', partial: 'PARTIAL', loss: 'LOSS' } as const
    const battleReport: BattleReport = {
      outcome: outcomeMap[result.outcome],
      ratio:   result.ratio,
      attacker: {
        name:        attPlayer.army_name,
        ecp_attack:  result.attackerECP,
        turns_spent: turnsUsed,
        food_spent:  foodCost,
        losses:      { soldiers: result.attackerLosses, cavalry: 0 },
        before: {
          gold: attResources.gold, iron: attResources.iron,
          wood: attResources.wood, food: attResources.food,
          soldiers: attArmy.soldiers, cavalry: attArmy.cavalry, slaves: attArmy.slaves,
        },
        after: {
          gold: newAttGold, iron: newAttIron,
          wood: newAttWood, food: newAttFood,
          soldiers: newAttSoldiers, cavalry: attArmy.cavalry, slaves: attArmy.slaves,
        },
      },
      defender: {
        name:        defPlayer.army_name,
        ecp_defense: result.defenderECP,
        losses:      { soldiers: safeDefLosses, cavalry: 0 },
        before: {
          gold: defResources.gold, iron: defResources.iron,
          wood: defResources.wood, food: defResources.food,
          soldiers: defArmy.soldiers, cavalry: defArmy.cavalry, slaves: defArmy.slaves,
        },
        after: {
          gold: newDefGold, iron: newDefIron,
          wood: newDefWood, food: newDefFood,
          soldiers: newDefSoldiers, cavalry: defArmy.cavalry, slaves: defArmy.slaves,
        },
      },
      gained: {
        loot: { gold: goldStolen, iron: ironStolen, wood: woodStolen, food: foodStolen },
      },
      flags: {
        defender_protected:              defenderProtected,
        attacker_protected:              attackerProtected,
        defender_resource_shield_active: defHero.resourceShieldActive,
        defender_soldier_shield_active:  defHero.soldierShieldActive,
        kill_cooldown_active:            killCooldown,
        anti_farm_decay_mult:            decayMult,
        defender_unbanked_empty:         defUnbanked,
      },
      reasons,
    }

    // ── DIAGNOSTIC ───────────────────────────────────────────────────────────
    console.log('[ATK_DIAG] battleReport.reasons:', reasons)
    console.log('[ATK_DIAG] === ATTACK DIAGNOSTIC END ===')
    // ─────────────────────────────────────────────────────────────────────────

    return NextResponse.json({
      battleReport,
      turns: newAttTurns,
      resources: {
        gold: newAttGold,
        iron: newAttIron,
        wood: newAttWood,
        food: newAttFood,
      },
    })
  } catch (err) {
    console.error('Attack error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
