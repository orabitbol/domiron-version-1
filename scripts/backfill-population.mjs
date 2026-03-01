/**
 * One-time backfill: set free_population = 50 for all army rows that are still at 0.
 *
 * Safe conditions:
 *   - Only updates rows where free_population = 0 (never explicitly initialized).
 *   - Does NOT touch rows where free_population > 0 (already have valid data).
 *
 * Run once:
 *   node scripts/backfill-population.mjs
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const STARTING_POPULATION = 50

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(url, key)

async function run() {
  // Count affected rows first so we can report accurately
  const { count, error: countErr } = await supabase
    .from('army')
    .select('*', { count: 'exact', head: true })
    .eq('free_population', 0)

  if (countErr) {
    console.error('Count query failed:', countErr.message)
    process.exit(1)
  }

  if (count === 0) {
    console.log('No rows need backfill — all players already have free_population > 0.')
    process.exit(0)
  }

  console.log(`Found ${count} army row(s) with free_population = 0. Backfilling to ${STARTING_POPULATION}...`)

  const { error: updateErr } = await supabase
    .from('army')
    .update({ free_population: STARTING_POPULATION })
    .eq('free_population', 0)

  if (updateErr) {
    console.error('Backfill failed:', updateErr.message)
    process.exit(1)
  }

  console.log(`Done. ${count} player(s) now have free_population = ${STARTING_POPULATION}.`)
}

run()
