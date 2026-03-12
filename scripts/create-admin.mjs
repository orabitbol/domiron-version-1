/**
 * scripts/create-admin.mjs
 *
 * Standalone script to promote a player to admin role.
 *
 * Usage:
 *   node scripts/create-admin.mjs                   — list all players + roles
 *   node scripts/create-admin.mjs --email foo@bar   — promote that player to admin
 *
 * Reads credentials from .env file in the project root.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const envPath    = join(__dirname, '..', '.env')

// ── Load .env ────────────────────────────────────────────────────────────────

let envContent
try {
  envContent = readFileSync(envPath, 'utf8')
} catch {
  console.error(`ERROR: Could not read .env at ${envPath}`)
  process.exit(1)
}

const getEnv = (key) => envContent.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1]?.trim()

const supabaseUrl     = getEnv('NEXT_PUBLIC_SUPABASE_URL')
const serviceRoleKey  = getEnv('SUPABASE_SERVICE_ROLE_KEY')

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

// ── Parse arguments ──────────────────────────────────────────────────────────

const args  = process.argv.slice(2)
const emailIdx = args.indexOf('--email')
const email = emailIdx !== -1 ? args[emailIdx + 1] : null

// ── Main logic ───────────────────────────────────────────────────────────────

async function listPlayers() {
  const { data: players, error } = await supabase
    .from('players')
    .select('id, email, username, role, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('ERROR: Failed to fetch players:', error.message)
    process.exit(1)
  }

  if (!players || players.length === 0) {
    console.log('\nNo players found in the database.\n')
    return
  }

  console.log('\n── Players ─────────────────────────────────────────────────────────────')
  console.log(`${'Email'.padEnd(35)} ${'Username'.padEnd(20)} ${'Role'.padEnd(8)} ID`)
  console.log('─'.repeat(100))

  for (const p of players) {
    const roleLabel = p.role === 'admin' ? '[ADMIN]' : 'player'
    console.log(`${p.email.padEnd(35)} ${(p.username ?? '—').padEnd(20)} ${roleLabel.padEnd(8)} ${p.id}`)
  }

  const adminCount = players.filter(p => p.role === 'admin').length
  console.log(`\nTotal: ${players.length} player(s), ${adminCount} admin(s)`)
  console.log('\nTo promote a player: node scripts/create-admin.mjs --email <email>\n')
}

async function promoteToAdmin(targetEmail) {
  console.log(`\nLooking up player with email: ${targetEmail}`)

  // Check if player exists
  const { data: player, error: lookupError } = await supabase
    .from('players')
    .select('id, email, username, role')
    .eq('email', targetEmail)
    .maybeSingle()

  if (lookupError) {
    console.error('ERROR: DB lookup failed:', lookupError.message)
    process.exit(1)
  }

  if (!player) {
    console.error(`ERROR: No player found with email "${targetEmail}"`)
    console.log('Tip: Run without --email to list all players.\n')
    process.exit(1)
  }

  if (player.role === 'admin') {
    console.log(`\nPlayer "${player.username}" (${player.email}) is already an admin. Nothing to do.\n`)
    process.exit(0)
  }

  // Check if any other admin already exists
  const { data: existingAdmins, error: adminCheckError } = await supabase
    .from('players')
    .select('id, email, username')
    .eq('role', 'admin')

  if (adminCheckError) {
    console.error('ERROR: Failed to check existing admins:', adminCheckError.message)
    process.exit(1)
  }

  if (existingAdmins && existingAdmins.length > 0) {
    console.log(`\nWARNING: ${existingAdmins.length} admin(s) already exist:`)
    for (const a of existingAdmins) {
      console.log(`  - ${a.username} (${a.email})`)
    }
    console.log('\nProceeding to add an additional admin...')
  }

  // Promote the player
  const { data: updated, error: updateError } = await supabase
    .from('players')
    .update({ role: 'admin' })
    .eq('id', player.id)
    .select('id, email, username, role')
    .single()

  if (updateError || !updated) {
    console.error('ERROR: Failed to promote player:', updateError?.message)
    process.exit(1)
  }

  console.log(`\nSUCCESS: "${updated.username}" (${updated.email}) is now an admin.`)
  console.log(`Player ID: ${updated.id}`)
  console.log('\nThe player must log out and log back in for the role change to take effect.\n')
}

// ── Entry point ───────────────────────────────────────────────────────────────

if (email) {
  await promoteToAdmin(email)
} else {
  await listPlayers()
}
