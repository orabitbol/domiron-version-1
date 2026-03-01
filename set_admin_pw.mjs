import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import bcrypt from 'bcryptjs'

const env = readFileSync('/Users/orabitbol/Desktop/domiron-1/.env', 'utf8')
const getEnv = (key) => env.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()
const supabase = createClient(getEnv('NEXT_PUBLIC_SUPABASE_URL'), getEnv('SUPABASE_SERVICE_ROLE_KEY'))

const hash = await bcrypt.hash('TestAdmin1!', 12)
const { data, error } = await supabase
  .from('players')
  .update({ password_hash: hash })
  .eq('email', 'david@gmail.com')
  .select('id, email, role')
  .single()

console.log('Updated:', JSON.stringify(data), 'error:', error?.message)
