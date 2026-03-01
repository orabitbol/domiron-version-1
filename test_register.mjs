import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import bcrypt from 'bcryptjs'

const env = readFileSync('/Users/orabitbol/Desktop/domiron-1/.env', 'utf8')
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()
const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))

// Get active season
const { data: season, error: sErr } = await supabase
  .from('seasons').select('id, starts_at').eq('status', 'active').single()
console.log('Season:', season, sErr?.message)

// Try inserting a player
const pw = await bcrypt.hash('TestPass123!', 12)
const { data: player, error: pErr } = await supabase
  .from('players')
  .insert({
    username: 'testuser1',
    email: 'testuser1@test.com',
    password_hash: pw,
    race: 'human',
    army_name: 'Test Army',
    season_id: season?.id,
    turns: 10,
  })
  .select('id')
  .single()
console.log('Player:', player, 'Error:', pErr?.message)
