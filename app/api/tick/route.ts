import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  calcTurnsToAdd,
  calcPopulationGrowth,
  calcSlaveProduction,
  calcTribeManaGain,
  calcHeroManaGain,
  calcBankInterest,
  isTickDuplicateRun,
  DUPLICATE_GUARD_THRESHOLD_MINUTES,
} from '@/lib/game/tick'
import { calcActiveHeroEffects } from '@/lib/game/hero-effects'
import type { PlayerHeroEffect } from '@/lib/game/hero-effects'
import { BALANCE } from '@/lib/game/balance'
import { recalculatePower } from '@/lib/game/power'
import { broadcastTickCompleted } from '@/lib/game/realtime'

const TICK_DEBUG = process.env.TICK_DEBUG === '1'

// Minutes until the next tick after this one completes.
// Single source of truth: BALANCE.tick.intervalMinutes (30).
// Must always match the pg_cron schedule in supabase/migrations/0024_pg_cron_jobs.sql ("*/30 * * * *").
// There is no env-var override — change BALANCE.tick.intervalMinutes + the pg_cron schedule together.
const TICK_INTERVAL_MINUTES = BALANCE.tick.intervalMinutes

// GET /api/tick — called by pg_cron via pg_net (see supabase/migrations/0024_pg_cron_jobs.sql)
// In local dev, called by instrumentation.ts setInterval instead.
// Protected by CRON_SECRET header (x-cron-secret)
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Duplicate-run guard — see isTickDuplicateRun() in lib/game/tick.ts ──────
  // pg_cron does not deduplicate concurrent/overlapping fires the way Vercel
  // Cron did. world_state.next_tick_at is set to now+30min after each tick.
  // If it is still > DUPLICATE_GUARD_THRESHOLD_MINUTES (5) in the future, the
  // last tick ran too recently — skip this invocation.
  {
    const supabaseGuard = createAdminClient()
    const { data: wsGuard } = await supabaseGuard
      .from('world_state')
      .select('next_tick_at')
      .eq('id', 1)
      .maybeSingle()
    if (isTickDuplicateRun(wsGuard?.next_tick_at, Date.now())) {
      const minutesUntilNext =
        (new Date(wsGuard!.next_tick_at).getTime() - Date.now()) / 60_000
      console.warn(
        `[TICK] Duplicate-run guard: skipping — ` +
        `${(TICK_INTERVAL_MINUTES - minutesUntilNext).toFixed(1)}min since last tick, ` +
        `next scheduled at ${wsGuard!.next_tick_at}`
      )
      return NextResponse.json({
        data: { skipped: true, reason: 'duplicate_guard', next_tick_at: wsGuard!.next_tick_at },
      })
    }
  }

  // Always visible — confirms the tick route is actually being called
  console.log('[TICK] auth=ok — tick starting at', new Date().toISOString())

  const startTime = Date.now()
  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  try {
    // Fetch all active players with their related data
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select(`
        id, city, race, turns, is_vacation, vip_until,
        power_attack, power_defense, power_spy, power_scout,
        army:army!inner(slaves, slaves_gold, slaves_iron, slaves_wood, slaves_food, free_population),
        development:development!inner(
          gold_level, iron_level, wood_level, food_level, population_level
        ),
        hero:hero!inner(level, mana, mana_per_tick),
        bank:bank!inner(balance, interest_level, last_deposit_reset, deposits_today),
        resources:resources!inner(gold, iron, wood, food),
        tribe_members:tribe_members(tribe_id)
      `)

    if (playersError) throw playersError

    // ── STEP 0: Player integrity check (detect only — no writes) ────────────────
    // Compare the strict !inner-join result against all active-season players.
    // Any mismatch means a player is missing a required related row and has been
    // silently excluded from this tick. We log the exact missing rows and do nothing
    // else. Repair is handled out-of-band via POST /api/admin/repair-players.
    {
      const { data: activeSeason } = await supabase
        .from('seasons').select('id').eq('status', 'active').maybeSingle()

      if (activeSeason) {
        const { data: allSeasonPlayers } = await supabase
          .from('players').select('id').eq('season_id', activeSeason.id)

        if (allSeasonPlayers) {
          const joinedIds = new Set((players ?? []).map(p => p.id))
          const excluded = allSeasonPlayers.filter(p => !joinedIds.has(p.id))

          if (excluded.length > 0) {
            console.error(`[TICK] INTEGRITY: ${excluded.length} player(s) excluded from this tick — run POST /api/admin/repair-players to fix`)

            for (const ep of excluded) {
              // Probe each table: data=null + error=null → row missing; error≠null → query failed
              const [armyR, devR, heroR, bankR, resR, weaponsR, trainingR] = await Promise.all([
                supabase.from('army')       .select('player_id').eq('player_id', ep.id).maybeSingle(),
                supabase.from('development').select('player_id').eq('player_id', ep.id).maybeSingle(),
                supabase.from('hero')       .select('player_id').eq('player_id', ep.id).maybeSingle(),
                supabase.from('bank')       .select('player_id').eq('player_id', ep.id).maybeSingle(),
                supabase.from('resources')  .select('player_id').eq('player_id', ep.id).maybeSingle(),
                supabase.from('weapons')    .select('player_id').eq('player_id', ep.id).maybeSingle(),
                supabase.from('training')   .select('player_id').eq('player_id', ep.id).maybeSingle(),
              ])

              const probeErrors = [
                armyR.error     && `army: ${armyR.error.message}`,
                devR.error      && `development: ${devR.error.message}`,
                heroR.error     && `hero: ${heroR.error.message}`,
                bankR.error     && `bank: ${bankR.error.message}`,
                resR.error      && `resources: ${resR.error.message}`,
                weaponsR.error  && `weapons: ${weaponsR.error.message}`,
                trainingR.error && `training: ${trainingR.error.message}`,
              ].filter(Boolean)
              if (probeErrors.length > 0) {
                console.error(`[TICK] INTEGRITY: probe failed for player ${ep.id}: ${probeErrors.join(' | ')}`)
                continue
              }

              const missingRows = [
                !armyR.data     && 'army',
                !devR.data      && 'development',
                !heroR.data     && 'hero',
                !bankR.data     && 'bank',
                !resR.data      && 'resources',
                !weaponsR.data  && 'weapons',
                !trainingR.data && 'training',
              ].filter(Boolean)

              if (missingRows.length === 0) {
                console.error(`[TICK] INTEGRITY: player ${ep.id} excluded by !inner but all rows present — check RLS policies`)
              } else {
                console.error(`[TICK] INTEGRITY: player ${ep.id} missing [${missingRows.join(', ')}] — excluded from this tick`)
              }
            }
          }
        }
      }
    }

    // Always log how many players the join returned
    console.log(`[TICK] playersFound=${players?.length ?? 0}`)

    if (!players || players.length === 0) {
      // Integrity check above has already diagnosed the cause (see INTEGRITY log lines).
      // If rawCount > 0, players exist but are all missing related rows — repair them first.
      const { count: rawCount } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
      console.log(
        `[TICK] Raw players table count (no joins): ${rawCount}.` +
        (rawCount && rawCount > 0
          ? ' Players exist but all excluded — see INTEGRITY logs above, run POST /api/admin/repair-players.'
          : ' Players table is empty.')
      )

      // Still advance world_state so the UI timer never stays at 00:00
      const emptyNextTickAt = new Date(Date.now() + TICK_INTERVAL_MINUTES * 60_000).toISOString()
      const { error: emptyWsErr } = await supabase
        .from('world_state')
        .upsert({ id: 1, next_tick_at: emptyNextTickAt })
      if (emptyWsErr) {
        console.error('[TICK] world_state upsert FAILED (empty tick):', emptyWsErr)
      } else {
        await broadcastTickCompleted(supabase, emptyNextTickAt)
        console.log('[TICK] world_state next=', emptyNextTickAt)
      }
      return NextResponse.json({ data: { processed: 0, duration: 0 } })
    }

    // Normalize to a guaranteed array (Supabase types data as T[] | null; never null after error check above).
    const activePlayers = players ?? []

    console.log(`[TICK] Processing ${activePlayers.length} player(s) at ${new Date().toISOString()}`)

    // Process each player
    const now = new Date().toISOString()
    const tickTime = new Date()

    // Batch-fetch all active hero effects (slave bonuses)
    const { data: heroEffectsRows } = await supabase
      .from('player_hero_effects')
      .select('player_id, type, starts_at, ends_at, cooldown_ends_at, metadata, id')
      .gt('ends_at', tickTime.toISOString())

    const heroEffectsByPlayer = new Map<string, PlayerHeroEffect[]>()
    for (const row of heroEffectsRows ?? []) {
      const list = heroEffectsByPlayer.get(row.player_id) ?? []
      list.push(row as PlayerHeroEffect)
      heroEffectsByPlayer.set(row.player_id, list)
    }

    // Batch-fetch active tribe production spells
    const { data: activeTribeSpells } = await supabase
      .from('tribe_spells')
      .select('tribe_id, spell_key')
      .gt('expires_at', tickTime.toISOString())

    const productionBlessingTribes = new Set(
      activeTribeSpells?.filter(s => s.spell_key === 'production_blessing').map(s => s.tribe_id) ?? []
    )

    let playerIdx = 0
    for (const player of activePlayers) {
      const army = player.army as unknown as {
        slaves: number; free_population: number
        slaves_gold: number; slaves_iron: number; slaves_wood: number; slaves_food: number
      }
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

      // Per-player log added below, after goldGained is computed

      // 3. Slave production — per-resource assignment (each slave produces one resource)
      // slaves_gold/iron/wood/food are the assigned counts; idle slaves produce nothing.

      // Hero slave bonus (pre-clamped 0–0.50)
      const playerEffects = heroEffectsByPlayer.get(player.id) ?? []
      const heroEffects = calcActiveHeroEffects(playerEffects, tickTime)
      const slaveBonus = heroEffects.totalSlaveBonus

      // Race gold production bonus (human: 0.15, dwarf: 0.03, others: 0)
      const race = (player as unknown as { race: string }).race ?? ''
      const raceGoldBonus = race === 'human' ? BALANCE.raceBonuses.human.goldProductionBonus
                          : race === 'dwarf'  ? BALANCE.raceBonuses.dwarf.goldProductionBonus
                          : 0

      // Tribe production blessing multiplier
      const tribeId = (player.tribe_members as unknown as { tribe_id: string }[])?.[0]?.tribe_id
      const tribeProdMult = tribeId && productionBlessingTribes.has(tribeId)
        ? BALANCE.tribe.spellEffects.production_blessing.productionMultiplier
        : 1.0

      const goldProd = calcSlaveProduction(army.slaves_gold, dev.gold_level, player.city, player.vip_until, raceGoldBonus, slaveBonus)
      const ironProd = calcSlaveProduction(army.slaves_iron, dev.iron_level, player.city, player.vip_until, 0, slaveBonus)
      const woodProd = calcSlaveProduction(army.slaves_wood, dev.wood_level, player.city, player.vip_until, 0, slaveBonus)
      const foodProd = calcSlaveProduction(army.slaves_food, dev.food_level, player.city, player.vip_until, 0, slaveBonus)

      // Random production within range, apply tribe blessing
      const goldGained = Math.floor((goldProd.min + Math.random() * (goldProd.max - goldProd.min)) * tribeProdMult)
      const ironGained = Math.floor((ironProd.min + Math.random() * (ironProd.max - ironProd.min)) * tribeProdMult)
      const woodGained = Math.floor((woodProd.min + Math.random() * (woodProd.max - woodProd.min)) * tribeProdMult)
      const foodGained = Math.floor((foodProd.min + Math.random() * (foodProd.max - foodProd.min)) * tribeProdMult)

      // Always log first 3 players — proof that mutations will happen
      if (playerIdx < 3) {
        console.log(
          `[TICK] player[${playerIdx}]=${player.id.slice(0, 8)}` +
          ` turns: ${player.turns}→${newTurns}` +
          ` gold: ${res.gold}→${res.gold + goldGained}(+${goldGained})` +
          ` freePop: ${army.free_population}→${army.free_population + popGrowth}`
        )
      } else if (TICK_DEBUG) {
        console.log(
          `[TICK] player=${player.id.slice(0, 8)}` +
          ` turns: ${player.turns}→${newTurns}` +
          ` gold+${goldGained} freePop: ${army.free_population}→${army.free_population + popGrowth}`
        )
      }

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

      // Update everything in parallel per player; surface any errors immediately
      const [turnsRes, resRes, armyRes, heroRes, bankRes] = await Promise.all([
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
          : Promise.resolve({ error: null }),
      ])

      // Log any failed updates so they are never silently swallowed
      const updateErrs = [
        turnsRes.error && `players(turns): ${turnsRes.error.message}`,
        resRes.error   && `resources: ${resRes.error.message}`,
        armyRes.error  && `army: ${armyRes.error.message}`,
        heroRes.error  && `hero: ${heroRes.error.message}`,
        (bankRes as { error: unknown }).error &&
          `bank: ${((bankRes as { error: { message: string } }).error).message}`,
      ].filter(Boolean)
      if (updateErrs.length > 0) {
        console.error(`[TICK] player=${player.id.slice(0, 8)} UPDATE ERRORS:`, updateErrs)
      }

      playerIdx++
    }

    // 6. Daily tribe tax collection (Israel time)
    //
    // Runs when clock in Asia/Jerusalem is at or past taxCollectionHour.
    // One collection per tribe per calendar day (guarded by last_tax_collected_date).
    // For each eligible tribe, calls tribe_collect_member_tax() per taxable member.
    // Idempotency: the RPC's UNIQUE (tribe_id, player_id, collected_date) prevents double-collection.
    {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
      }).formatToParts(new Date())
      const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
      const israelDate = `${get('year')}-${get('month')}-${get('day')}`
      const israelHour = parseInt(get('hour'), 10)

      if (israelHour >= BALANCE.tribe.taxCollectionHour) {
        const { data: taxTribes } = await supabase
          .from('tribes')
          .select('id, leader_id, tax_amount, season_id')
          .gt('tax_amount', 0)
          .or(`last_tax_collected_date.is.null,last_tax_collected_date.neq.${israelDate}`)

        if (taxTribes && taxTribes.length > 0) {
          for (const tribe of taxTribes) {
            const { data: taxableMembers } = await supabase
              .from('tribe_members')
              .select('player_id')
              .eq('tribe_id', tribe.id)
              .eq('role', 'member')
              .eq('tax_exempt', false)

            if (taxableMembers && taxableMembers.length > 0) {
              await Promise.all(
                taxableMembers.map(m =>
                  supabase.rpc('tribe_collect_member_tax', {
                    p_member_player_id: m.player_id,
                    p_tribe_id:         tribe.id,
                    p_leader_id:        tribe.leader_id,
                    p_tax_amount:       tribe.tax_amount,
                    p_collected_date:   israelDate,
                    p_season_id:        tribe.season_id,
                  })
                )
              )
            }

            await supabase
              .from('tribes')
              .update({ last_tax_collected_date: israelDate })
              .eq('id', tribe.id)
          }
          console.log(`[TICK] Tax collected for ${taxTribes.length} tribe(s) on ${israelDate}`)
        }
      }
    }

    // 8. Update tribe mana
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

    // 9. Recalculate power for all players, then update rankings.
    // Scoped to activePlayers — the set that passed the !inner join (current season, complete rows).
    // Old-season players and players with missing rows are intentionally excluded.
    const activePlayerIds = activePlayers.map(p => p.id)

    if (activePlayerIds.length > 0) {
      // Recalculate power for every player that passed the strict join.
      await Promise.all(activePlayers.map(p => recalculatePower(p.id, supabase)))

      // Re-fetch updated power_total values for ranking (scoped to active players only)
      const { data: powered } = await supabase
        .from('players')
        .select('id, power_total, city, joined_at')
        .in('id', activePlayerIds)

      if (powered) {
        // Sort globally for rank_global
        // Primary: power_total DESC — Tie-break: joined_at ASC (earlier join = higher rank)
        const sorted = [...powered].sort((a, b) => {
          if (b.power_total !== a.power_total) return b.power_total - a.power_total
          return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
        })
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

    // 10. Aggregate tribe power_total from current member power_total values (intentional staleness)
    const { data: tribeMembers } = await supabase
      .from('tribe_members')
      .select('tribe_id, players!inner(power_total)')

    if (tribeMembers) {
      const tribeAgg = new Map<string, number>()
      for (const row of tribeMembers) {
        const pt = (row.players as unknown as { power_total: number }).power_total
        tribeAgg.set(row.tribe_id, (tribeAgg.get(row.tribe_id) ?? 0) + pt)
      }
      await Promise.all(
        Array.from(tribeAgg.entries()).map(([tribeId, total]) =>
          supabase.from('tribes').update({ power_total: total }).eq('id', tribeId)
        )
      )
    }

    // 11. Compute next_tick_at and persist to world_state (server-authoritative timer)
    //
    // Use UPSERT (not update) so the row is guaranteed to exist even if the
    // migration was never applied or the seed INSERT failed.
    // NOTE: Supabase `.update().eq()` returns { error: null } even when 0 rows
    // match — it silently does nothing.  Upsert avoids this entire class of bug.
    const tickDoneAt = new Date()
    const nextTickAt = new Date(tickDoneAt.getTime() + TICK_INTERVAL_MINUTES * 60_000).toISOString()

    const { data: wsData, error: wsError } = await supabase
      .from('world_state')
      .upsert({ id: 1, next_tick_at: nextTickAt })
      .select('next_tick_at')

    if (wsError) {
      console.error('[TICK] world_state upsert FAILED:', wsError)
      throw new Error(`world_state upsert failed: ${wsError.message}`)
    }

    // Verify the value actually landed — log both what we sent and what the DB confirms
    const confirmedAt = (wsData as { next_tick_at: string }[] | null)?.[0]?.next_tick_at ?? '(no row returned)'
    const diffSec = Math.round((new Date(nextTickAt).getTime() - tickDoneAt.getTime()) / 1000)
    console.log(
      `[TICK] world_state OK: sent=${nextTickAt} confirmed=${confirmedAt} diffSec=${diffSec}`
    )
    if (confirmedAt !== nextTickAt) {
      console.error('[TICK] world_state MISMATCH — upsert did not persist the value!')
    }

    // 12. Broadcast tick event — includes next_tick_at so clients reset their countdown
    await broadcastTickCompleted(supabase, nextTickAt)

    const duration = Date.now() - startTime
    console.log(`[TICK] Completed: ${activePlayers.length} player(s) in ${duration}ms — next tick at ${nextTickAt}`)

    return NextResponse.json({
      data: {
        processed: activePlayers.length,
        duration,
        timestamp: now,
      },
    })

  } catch (err) {
    console.error('[TICK] Fatal error:', err)
    return NextResponse.json({ error: 'Tick failed' }, { status: 500 })
  }
}
