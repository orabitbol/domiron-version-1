import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  calcTurnsToAdd,
  calcPopulationGrowth,
  calcSlaveProduction,
  calcTribeManaGain,
  calcHeroManaGain,
  calcBankInterest,
} from '@/lib/game/tick'
import { recalculatePower } from '@/lib/game/power'
import { broadcastTickCompleted } from '@/lib/game/realtime'

// GET /api/tick — called by Vercel Cron every 30 minutes
// Protected by CRON_SECRET header
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  try {
    // Fetch all active players with their related data
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select(`
        id, city, turns, max_turns, is_vacation, vip_until,
        power_attack, power_defense, power_spy, power_scout,
        army:army!inner(slaves, farmers, free_population),
        development:development!inner(
          gold_level, iron_level, wood_level, food_level, population_level
        ),
        hero:hero!inner(level, mana, mana_per_tick),
        bank:bank!inner(balance, interest_level, last_deposit_reset, deposits_today),
        resources:resources!inner(gold, iron, wood, food),
        tribe_members:tribe_members(tribe_id)
      `)

    if (playersError) throw playersError

    if (!players || players.length === 0) {
      return NextResponse.json({ data: { processed: 0, duration: 0 } })
    }

    // Process each player
    const now = new Date().toISOString()

    for (const player of players) {
      const army = player.army as unknown as { slaves: number; farmers: number; free_population: number }
      const dev = player.development as unknown as {
        gold_level: number; iron_level: number; wood_level: number;
        food_level: number; population_level: number
      }
      const hero = player.hero as unknown as { level: number; mana: number; mana_per_tick: number }
      const bank = player.bank as unknown as {
        balance: number; interest_level: number;
        last_deposit_reset: string; deposits_today: number
      }
      const res  = player.resources as unknown as { gold: number; iron: number; wood: number; food: number }

      // 1. Turns
      const newTurns = calcTurnsToAdd(player.turns, player.is_vacation)

      // 2. Population growth
      const popGrowth = calcPopulationGrowth(dev.population_level, player.vip_until)

      // 3. Slave production (random within range — use average for consistency)
      const goldProd = calcSlaveProduction(army.slaves, dev.gold_level, player.city, player.vip_until)
      const ironProd = calcSlaveProduction(army.slaves, dev.iron_level, player.city, player.vip_until)
      const woodProd = calcSlaveProduction(army.slaves, dev.wood_level, player.city, player.vip_until)
      const foodProd = calcSlaveProduction(army.farmers, dev.food_level, player.city, player.vip_until)

      // Random production within range
      const goldGained = Math.floor(goldProd.min + Math.random() * (goldProd.max - goldProd.min))
      const ironGained = Math.floor(ironProd.min + Math.random() * (ironProd.max - ironProd.min))
      const woodGained = Math.floor(woodProd.min + Math.random() * (woodProd.max - woodProd.min))
      const foodGained = Math.floor(foodProd.min + Math.random() * (foodProd.max - foodProd.min))

      // 4. Hero mana
      const manaGain = calcHeroManaGain(hero.level, player.vip_until)

      // 5. Bank interest (daily reset check)
      let bankUpdate: Record<string, unknown> = { updated_at: now }
      if (bank.last_deposit_reset !== today) {
        // New day — apply interest + reset deposits
        const interest = calcBankInterest(bank.balance, bank.interest_level, player.vip_until)
        bankUpdate = {
          ...bankUpdate,
          balance: bank.balance + interest,
          deposits_today: 0,
          last_deposit_reset: today,
        }
      }

      // Update everything in parallel per player
      await Promise.all([
        supabase
          .from('players')
          .update({ turns: newTurns } as Record<string, unknown>)
          .eq('id', player.id),

        supabase
          .from('resources')
          .update({
            gold: res.gold + goldGained,
            iron: res.iron + ironGained,
            wood: res.wood + woodGained,
            food: res.food + foodGained,
            updated_at: now,
          })
          .eq('player_id', player.id),

        supabase
          .from('army')
          .update({ free_population: army.free_population + popGrowth, updated_at: now })
          .eq('player_id', player.id),

        supabase
          .from('hero')
          .update({ mana: hero.mana + manaGain, updated_at: now })
          .eq('player_id', player.id),

        Object.keys(bankUpdate).length > 1
          ? supabase.from('bank').update(bankUpdate).eq('player_id', player.id)
          : Promise.resolve(),
      ])
    }

    // 6. Update tribe mana
    const { data: tribes } = await supabase
      .from('tribes')
      .select('id, mana, tribe_members(count)')

    if (tribes) {
      await Promise.all(
        tribes.map(tribe => {
          const memberCount = (tribe.tribe_members as unknown as { count: number }[])[0]?.count ?? 0
          const manaGain = calcTribeManaGain(memberCount)
          return supabase
            .from('tribes')
            .update({ mana: tribe.mana + manaGain })
            .eq('id', tribe.id)
        })
      )
    }

    // 7. Recalculate power for all players, then update rankings
    const { data: allPlayers } = await supabase
      .from('players')
      .select('id, city')

    if (allPlayers) {
      // Recalculate all power columns for every player
      await Promise.all(allPlayers.map(p => recalculatePower(p.id, supabase)))

      // Re-fetch updated power_total values for ranking
      const { data: powered } = await supabase
        .from('players')
        .select('id, power_total, city')

      if (powered) {
        // Sort globally for rank_global
        const sorted = [...powered].sort((a, b) => b.power_total - a.power_total)
        const globalRanks = new Map(sorted.map((p, i) => [p.id, i + 1]))

        // Sort per city for rank_city
        const cityRanks = new Map<string, number>()
        for (const city of [1, 2, 3, 4, 5]) {
          const cityPlayers = sorted.filter(p => p.city === city)
          cityPlayers.forEach((p, i) => cityRanks.set(p.id, i + 1))
        }

        // Batch update rankings
        await Promise.all(
          powered.map(p =>
            supabase
              .from('players')
              .update({
                rank_global: globalRanks.get(p.id),
                rank_city:   cityRanks.get(p.id),
              })
              .eq('id', p.id)
          )
        )
      }
    }

    // 8. Broadcast tick event to all connected players
    await broadcastTickCompleted(supabase)

    const duration = Date.now() - startTime
    console.log(`Tick completed: ${players.length} players processed in ${duration}ms`)

    return NextResponse.json({
      data: {
        processed: players.length,
        duration,
        timestamp: now,
      },
    })

  } catch (err) {
    console.error('Tick error:', err)
    return NextResponse.json({ error: 'Tick failed' }, { status: 500 })
  }
}
