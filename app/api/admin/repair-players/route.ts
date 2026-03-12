/**
 * POST /api/admin/repair-players
 *
 * Detects active-season players that are missing one or more required related rows
 * (army / development / hero / bank / resources / weapons / training) and creates
 * the missing rows with safe defaults sourced from the current registration flow
 * and DB schema.
 *
 * GET  → dry-run: returns which players are broken and which rows are missing (no writes)
 * POST → repairs all detected broken players and returns a per-player report
 *
 * Auth: admin role required.
 *
 * Defaults used on repair (mirrors app/api/auth/register/route.ts + DB schema):
 *   army        → free_population = BALANCE.startingResources.startingPopulation (50); all units 0
 *   development → all levels 1 (DB default)
 *   hero        → level 1, mana 0, mana_per_tick 1 (DB default)
 *   bank        → balance 0, interest_level 0 (DB default)
 *   resources   → gold/iron/wood/food = 5000 (DB column default; no catch-up multiplier applied)
 *   weapons     → all 0 (DB default)
 *   training    → all levels 0 (DB default)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { writeAdminLog } from '@/lib/admin/log'

// ── Types ────────────────────────────────────────────────────────────────────

interface BrokenPlayer {
  id: string
  username: string
  army_name: string
  missingRows: string[]
}

interface RepairResult extends BrokenPlayer {
  repairedRows: string[]
  failedRows:   string[]
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Returns all active-season players that are missing at least one required related row.
 * Probe errors (query failures) are treated as unknown state and reported separately.
 */
async function detectBrokenPlayers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ broken: BrokenPlayer[]; probeErrors: string[]; seasonId: number | null }> {
  const { data: activeSeason } = await supabase
    .from('seasons').select('id').eq('status', 'active').maybeSingle()

  if (!activeSeason) {
    return { broken: [], probeErrors: [], seasonId: null }
  }

  const { data: allPlayers, error: playersError } = await supabase
    .from('players')
    .select('id, username, army_name')
    .eq('season_id', activeSeason.id)

  if (playersError || !allPlayers) {
    return { broken: [], probeErrors: [`players query failed: ${playersError?.message}`], seasonId: activeSeason.id }
  }

  const broken: BrokenPlayer[] = []
  const probeErrors: string[] = []

  for (const player of allPlayers) {
    const [armyR, devR, heroR, bankR, resR, weaponsR, trainingR] = await Promise.all([
      supabase.from('army')       .select('player_id').eq('player_id', player.id).maybeSingle(),
      supabase.from('development').select('player_id').eq('player_id', player.id).maybeSingle(),
      supabase.from('hero')       .select('player_id').eq('player_id', player.id).maybeSingle(),
      supabase.from('bank')       .select('player_id').eq('player_id', player.id).maybeSingle(),
      supabase.from('resources')  .select('player_id').eq('player_id', player.id).maybeSingle(),
      supabase.from('weapons')    .select('player_id').eq('player_id', player.id).maybeSingle(),
      supabase.from('training')   .select('player_id').eq('player_id', player.id).maybeSingle(),
    ])

    const rowProbeErrors = [
      armyR.error     && `army: ${armyR.error.message}`,
      devR.error      && `development: ${devR.error.message}`,
      heroR.error     && `hero: ${heroR.error.message}`,
      bankR.error     && `bank: ${bankR.error.message}`,
      resR.error      && `resources: ${resR.error.message}`,
      weaponsR.error  && `weapons: ${weaponsR.error.message}`,
      trainingR.error && `training: ${trainingR.error.message}`,
    ].filter(Boolean) as string[]

    if (rowProbeErrors.length > 0) {
      probeErrors.push(`player ${player.id} (${player.username}): ${rowProbeErrors.join(' | ')}`)
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
    ].filter(Boolean) as string[]

    if (missingRows.length > 0) {
      broken.push({ id: player.id, username: player.username, army_name: player.army_name, missingRows })
    }
  }

  return { broken, probeErrors, seasonId: activeSeason.id }
}

/**
 * Creates missing related rows for a single player.
 * Returns which rows were successfully created and which failed.
 */
async function repairPlayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof createAdminClient>,
  playerId: string,
  missingRows: string[]
): Promise<{ repairedRows: string[]; failedRows: string[] }> {
  // Build parallel arrays: inserts[i] ↔ rowNames[i]
  // PromiseLike (not Promise) — PostgrestFilterBuilder is thenable but lacks .catch/.finally
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inserts: PromiseLike<any>[] = []
  const rowNames: string[] = []

  if (missingRows.includes('army')) {
    inserts.push(supabase.from('army').insert({ player_id: playerId, free_population: BALANCE.startingResources.startingPopulation }))
    rowNames.push('army')
  }
  if (missingRows.includes('development')) {
    inserts.push(supabase.from('development').insert({ player_id: playerId }))
    rowNames.push('development')
  }
  if (missingRows.includes('hero')) {
    inserts.push(supabase.from('hero').insert({ player_id: playerId }))
    rowNames.push('hero')
  }
  if (missingRows.includes('bank')) {
    inserts.push(supabase.from('bank').insert({ player_id: playerId }))
    rowNames.push('bank')
  }
  if (missingRows.includes('resources')) {
    // DB column default: 5000 each — base starting amount without catch-up multiplier.
    // Catch-up mult is not applied here: we do not know when the player originally registered
    // relative to season start, and retroactively inflating resources would be unfair.
    inserts.push(supabase.from('resources').insert({ player_id: playerId }))
    rowNames.push('resources')
  }
  if (missingRows.includes('weapons')) {
    inserts.push(supabase.from('weapons').insert({ player_id: playerId }))
    rowNames.push('weapons')
  }
  if (missingRows.includes('training')) {
    inserts.push(supabase.from('training').insert({ player_id: playerId }))
    rowNames.push('training')
  }

  const results = await Promise.all(inserts) as { error: { message: string } | null }[]
  const repairedRows: string[] = []
  const failedRows:   string[] = []

  results.forEach((r, i) => {
    if (r.error) {
      failedRows.push(`${rowNames[i]}: ${r.error.message}`)
    } else {
      repairedRows.push(rowNames[i])
    }
  })

  return { repairedRows, failedRows }
}

// ── Route handlers ───────────────────────────────────────────────────────────

// GET — dry-run: detect and report, no writes
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { broken, probeErrors, seasonId } = await detectBrokenPlayers(supabase)

  return NextResponse.json({
    data: {
      seasonId,
      totalBroken: broken.length,
      broken,
      probeErrors,
    },
  })
}

// POST — detect and repair
export async function POST(_request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { broken, probeErrors, seasonId } = await detectBrokenPlayers(supabase)

  if (broken.length === 0) {
    return NextResponse.json({
      data: {
        seasonId,
        message: 'No broken players found — nothing to repair.',
        repaired: [],
        probeErrors,
      },
    })
  }

  const results: RepairResult[] = []

  for (const player of broken) {
    const { repairedRows, failedRows } = await repairPlayer(supabase, player.id, player.missingRows)
    results.push({ ...player, repairedRows, failedRows })

    if (failedRows.length > 0) {
      console.error(`[REPAIR] player ${player.id} (${player.username}): repair partial — failed: ${failedRows.join(', ')}`)
    } else {
      console.log(`[REPAIR] player ${player.id} (${player.username}): repaired [${repairedRows.join(', ')}]`)
    }
  }

  const totalRepaired = results.filter(r => r.failedRows.length === 0).length
  const totalFailed   = results.filter(r => r.failedRows.length  >  0).length

  // Write admin log (never throws — logging must not interrupt the response)
  await writeAdminLog(
    session.user.id,
    'repair_players',
    {
      totalRepaired,
      totalFailed,
      repaired: results.map(r => ({
        id:           r.id,
        username:     r.username,
        repairedRows: r.repairedRows,
        failedRows:   r.failedRows,
      })),
    },
  )

  return NextResponse.json({
    data: {
      seasonId,
      totalRepaired,
      totalFailed,
      results,
      probeErrors,
    },
  }, { status: totalFailed > 0 ? 207 : 200 })
}
