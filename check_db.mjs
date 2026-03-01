import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = readFileSync('/Users/orabitbol/Desktop/domiron-1/.env', 'utf8')
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()
const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))

// Check if newly inserted player from test exists
const { data: players } = await supabase.from('players').select('id,username,role,season_id').limit(10)
console.log('Players in DB:', JSON.stringify(players))

// Check player policies (RLS)
const { data: seasons } = await supabase.from('seasons').select('id,number,status,ends_at')
console.log('Seasons:', JSON.stringify(seasons))
