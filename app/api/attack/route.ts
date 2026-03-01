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
} from '@/lib/game/combat'
import type { ClanContext } from '@/lib/game/combat'
import { getActiveHeroEffects, clampBonus } from '@/lib/game/hero-effects'
import { recalculatePower } from '@/lib/game/power'
import type { AttackBlocker } from '@/types/game'

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
    const attackerProtected = isNewPlayerProtected(new Date(attPlayer.created_at), now)
    const defenderProtected = isNewPlayerProtected(new Date(defPlayer.created_at), now)

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

    // Safety clamps — never steal more than defender has
    const goldStolen = Math.min(result.loot.gold, defResources.gold)
    const ironStolen = Math.min(result.loot.iron, defResources.iron)
    const woodStolen = Math.min(result.loot.wood, defResources.wood)
    const foodStolen = Math.min(result.loot.food, defResources.food)

    // Safety clamps — never lose more soldiers than available
    const safeDefLosses = Math.min(result.defenderLosses, defArmy.soldiers)
    const safeSlaves    = Math.min(result.slavesCreated, Math.max(0, defArmy.soldiers - safeDefLosses))

    // New resource values
    const newAttSoldiers = Math.max(0, attArmy.soldiers - result.attackerLosses)
    const newAttSlaves   = attArmy.slaves + safeSlaves
    const newAttGold     = attResources.gold + goldStolen
    const newAttIron     = attResources.iron + ironStolen
    const newAttWood     = attResources.wood + woodStolen
    const newAttFood     = Math.max(0, attResources.food - foodCost + foodStolen)
    const newAttTurns    = attPlayer.turns - turnsUsed

    const newDefSoldiers = Math.max(0, defArmy.soldiers - safeDefLosses - safeSlaves)
    const newDefGold     = Math.max(0, defResources.gold - goldStolen)
    const newDefIron     = Math.max(0, defResources.iron - ironStolen)
    const newDefWood     = Math.max(0, defResources.wood - woodStolen)
    const newDefFood     = Math.max(0, defResources.food - foodStolen)

    // Season ID
    const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).single()
    const seasonId = season?.id ?? 1

    const nowIso = now.toISOString()

    // Map 'partial' → 'draw' for DB constraint compatibility
    const dbOutcome = result.outcome === 'partial' ? 'draw' : result.outcome

    await Promise.all([
      supabase.from('players').update({ turns: newAttTurns }).eq('id', playerId),
      supabase.from('army').update({ soldiers: newAttSoldiers, slaves: newAttSlaves, updated_at: nowIso }).eq('player_id', playerId),
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
        slaves_taken:    safeSlaves,
        gold_stolen:     goldStolen,
        iron_stolen:     ironStolen,
        wood_stolen:     woodStolen,
        food_stolen:     foodStolen,
        season_id:       seasonId,
      }),
    ])

    // Recalculate stored power for both sides (army counts changed)
    await Promise.all([
      recalculatePower(playerId, supabase),
      recalculatePower(defender_id, supabase),
    ])

    // Derive blockers: explains to the UI why gains/losses may be zeroed
    const blockers: AttackBlocker[] = []
    if (defHero.resourceShieldActive)  blockers.push('resource_shield')
    if (defHero.soldierShieldActive)   blockers.push('soldier_shield')
    if (defenderProtected)             blockers.push('defender_protected')
    if (killCooldown)                  blockers.push('kill_cooldown')
    if (attackerProtected)             blockers.push('attacker_protected')
    if ((attacksInWindow ?? 0) > 1)    blockers.push('loot_decay')

    return NextResponse.json({
      result: {
        outcome:         result.outcome,
        ratio:           result.ratio,
        attacker_ecp:    result.attackerECP,
        defender_ecp:    result.defenderECP,
        attacker_losses: result.attackerLosses,
        defender_losses: safeDefLosses,
        slaves_created:  safeSlaves,
        gold_stolen:     goldStolen,
        iron_stolen:     ironStolen,
        wood_stolen:     woodStolen,
        food_stolen:     foodStolen,
        turns_used:      turnsUsed,
        food_cost:       foodCost,
        blockers,
      },
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
