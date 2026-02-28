import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import {
  calculateAttackPower,
  calculateDefensePower,
  resolveCombat,
} from '@/lib/game/combat'
import { recalculatePower } from '@/lib/game/power'

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
    ] = await Promise.all([
      supabase.from('players').select('*').eq('id', playerId).single(),
      supabase.from('army').select('*').eq('player_id', playerId).single(),
      supabase.from('weapons').select('*').eq('player_id', playerId).single(),
      supabase.from('training').select('*').eq('player_id', playerId).single(),
      supabase.from('development').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
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
      supabase.from('tribe_members').select('tribe_id').eq('player_id', defender_id).single(),
    ])

    if (!defPlayer || !defArmy || !defWeapons || !defTraining || !defDev || !defResources) {
      return NextResponse.json({ error: 'Defender not found' }, { status: 404 })
    }

    // Count today's attacks by this attacker on this defender (for no-damage mode)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count: attacksToday } = await supabase
      .from('attacks')
      .select('*', { count: 'exact', head: true })
      .eq('attacker_id', playerId)
      .eq('defender_id', defender_id)
      .gte('created_at', todayStart.toISOString())

    const isNoDamageMode = (attacksToday ?? 0) >= BALANCE.combat.maxDamageAttacksPerDay

    // Tribe defense bonus: 5% of each member's defense power (simplified: total * 5% * members)
    let tribeDefenseBonus = 0
    if (defTribeMember?.tribe_id) {
      const { count: memberCount } = await supabase
        .from('tribe_members')
        .select('*', { count: 'exact', head: true })
        .eq('tribe_id', defTribeMember.tribe_id)

      // Check for active tribe_shield spell
      const { data: tribeShield } = await supabase
        .from('tribe_spells')
        .select('id')
        .eq('tribe_id', defTribeMember.tribe_id)
        .eq('spell_key', 'tribe_shield')
        .gt('expires_at', new Date().toISOString())
        .single()

      const defenseSpellBonus = tribeShield ? BALANCE.tribe.spells.tribe_shield.defenseBonus : 0
      tribeDefenseBonus = Math.floor(
        defPlayer.power_defense *
          (BALANCE.tribe.defenseContributionPercent * (memberCount ?? 0) + defenseSpellBonus)
      )
    }

    // Calculate powers
    const atkPower = calculateAttackPower(
      { army: attArmy as never, weapons: attWeapons as never, training: attTraining as never, development: attDev as never, player: attPlayer as never },
      turnsUsed
    )
    const defPower = calculateDefensePower(
      { army: defArmy as never, weapons: defWeapons as never, training: defTraining as never, development: defDev as never, player: defPlayer as never, tribeDefenseBonus }
    )

    // Resolve combat
    const result = resolveCombat(
      atkPower,
      defPower,
      attArmy as never,
      defArmy as never,
      { gold: defResources.gold, iron: defResources.iron, wood: defResources.wood, food: defResources.food },
      isNoDamageMode
    )

    // Ensure stolen resources don't exceed what defender has
    const goldStolen = Math.min(result.goldStolen, defResources.gold)
    const ironStolen = Math.min(result.ironStolen, defResources.iron)
    const woodStolen = Math.min(result.woodStolen, defResources.wood)
    const foodStolen = Math.min(result.foodStolen, defResources.food)

    // Ensure defender soldiers don't go below 0
    const totalDefenderLost = result.defenderLosses + result.slavesTaken
    const safeDefenderLosses = Math.min(result.defenderLosses, defArmy.soldiers)
    const safeSlavesTaken = Math.min(result.slavesTaken, Math.max(0, defArmy.soldiers - safeDefenderLosses))

    // Attacker loses soldiers, gains slaves + resources; loses food and turns
    const newAttSoldiers = Math.max(0, attArmy.soldiers - result.attackerLosses)
    const newAttSlaves = attArmy.slaves + safeSlavesTaken
    const newAttGold = attResources.gold + goldStolen
    const newAttIron = attResources.iron + ironStolen
    const newAttWood = attResources.wood + woodStolen
    const newAttFood = Math.max(0, attResources.food - foodCost + foodStolen)
    const newAttTurns = attPlayer.turns - turnsUsed

    // Defender loses soldiers + resources
    const newDefSoldiers = Math.max(0, defArmy.soldiers - safeDefenderLosses - safeSlavesTaken)
    const newDefGold = Math.max(0, defResources.gold - goldStolen)
    const newDefIron = Math.max(0, defResources.iron - ironStolen)
    const newDefWood = Math.max(0, defResources.wood - woodStolen)
    const newDefFood = Math.max(0, defResources.food - foodStolen)

    // Get active season
    const { data: season } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .single()
    const seasonId = season?.id ?? 1

    const now = new Date().toISOString()

    // Apply all changes in parallel
    await Promise.all([
      // Update attacker
      supabase.from('players').update({ turns: newAttTurns }).eq('id', playerId),
      supabase.from('army').update({
        soldiers: newAttSoldiers,
        slaves: newAttSlaves,
        updated_at: now,
      }).eq('player_id', playerId),
      supabase.from('resources').update({
        gold: newAttGold,
        iron: newAttIron,
        wood: newAttWood,
        food: newAttFood,
        updated_at: now,
      }).eq('player_id', playerId),

      // Update defender
      supabase.from('army').update({
        soldiers: newDefSoldiers,
        updated_at: now,
      }).eq('player_id', defender_id),
      supabase.from('resources').update({
        gold: newDefGold,
        iron: newDefIron,
        wood: newDefWood,
        food: newDefFood,
        updated_at: now,
      }).eq('player_id', defender_id),

      // Record attack
      supabase.from('attacks').insert({
        attacker_id: playerId,
        defender_id,
        turns_used: turnsUsed,
        atk_power: atkPower,
        def_power: defPower,
        outcome: result.outcome,
        attacker_losses: result.attackerLosses,
        defender_losses: safeDefenderLosses,
        slaves_taken: safeSlavesTaken,
        gold_stolen: goldStolen,
        iron_stolen: ironStolen,
        wood_stolen: woodStolen,
        food_stolen: foodStolen,
        season_id: seasonId,
      }),
    ])

    // Recalculate power for both sides (army counts changed after battle)
    await Promise.all([
      recalculatePower(playerId, supabase),
      recalculatePower(defender_id, supabase),
    ])

    return NextResponse.json({
      result: {
        outcome: result.outcome,
        atk_power: atkPower,
        def_power: defPower,
        attacker_losses: result.attackerLosses,
        defender_losses: safeDefenderLosses,
        slaves_taken: safeSlavesTaken,
        gold_stolen: goldStolen,
        iron_stolen: ironStolen,
        wood_stolen: woodStolen,
        food_stolen: foodStolen,
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
