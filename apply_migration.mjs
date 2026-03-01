import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('/Users/orabitbol/Desktop/domiron-1/.env', 'utf8')
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()
const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))

// Apply migration 0004 step by step
const steps = [
  "ALTER TABLE seasons RENAME COLUMN started_at TO starts_at",
  "ALTER TABLE seasons ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ",
  "UPDATE seasons SET ends_at = starts_at + INTERVAL '90 days' WHERE ends_at IS NULL",
  "ALTER TABLE seasons ALTER COLUMN ends_at SET NOT NULL",
  "ALTER TABLE seasons ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'active' CONSTRAINT chk_season_status CHECK (status IN ('active', 'ended'))",
  "UPDATE seasons SET status = CASE WHEN true THEN 'active' ELSE 'ended' END",
  "ALTER TABLE seasons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now()",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_one_active ON seasons (status) WHERE status = 'active'",
]

for (const sql of steps) {
  const { error } = await supabase.rpc('exec_sql', { sql_query: sql })
  if (error) {
    console.log(`STEP FAILED: ${sql.substring(0, 60)}...`)
    console.log('Error:', error.message)
  } else {
    console.log(`OK: ${sql.substring(0, 60)}`)
  }
}

// Verify result
const { data, error } = await supabase.from('seasons').select('*').limit(5)
console.log('\nSeasons after migration:', JSON.stringify(data, null, 2))
console.log('Error:', error?.message)
