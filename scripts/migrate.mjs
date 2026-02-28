/**
 * Domiron — Database Migration Runner
 * Uses Supabase management API to execute the SQL migration.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load env vars from .env file
const envPath = join(__dirname, '..', '.env')
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const [key, ...rest] = trimmed.split('=')
  if (key) env[key.trim()] = rest.join('=').trim()
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

// Read SQL migration file
const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '0001_initial.sql')
const fullSQL = readFileSync(sqlPath, 'utf-8')

// Split into individual statements (split on semicolons followed by newline)
// Filter out empty statements and comment-only blocks
function splitStatements(sql) {
  const statements = []
  let current = ''
  let inBlock = false

  for (const line of sql.split('\n')) {
    const trimmed = line.trim()
    // Skip pure comment lines for splitting purposes but keep them in statements
    if (trimmed.startsWith('--')) {
      current += line + '\n'
      continue
    }
    current += line + '\n'
    // Count semicolons not inside strings
    if (trimmed.endsWith(';')) {
      const stmt = current.trim()
      if (stmt && !stmt.match(/^--/)) {
        statements.push(stmt)
      }
      current = ''
    }
  }

  return statements.filter(s => {
    const noComments = s.replace(/--[^\n]*/g, '').trim()
    return noComments.length > 0
  })
}

async function runSQL(sql) {
  // Use Supabase's REST API with the service role to execute SQL
  // This uses the pg_dump/restore endpoint via the management API
  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0]

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`HTTP ${response.status}: ${text}`)
  }

  return response.json()
}

async function main() {
  console.log(`🔗 Connecting to: ${SUPABASE_URL}`)
  console.log('📋 Reading migration file...')

  const statements = splitStatements(fullSQL)
  console.log(`📝 Found ${statements.length} SQL statements to execute\n`)

  let succeeded = 0
  let skipped = 0

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const preview = stmt.replace(/\s+/g, ' ').substring(0, 80)

    try {
      await runSQL(stmt)
      console.log(`✅ [${i + 1}/${statements.length}] ${preview}`)
      succeeded++
    } catch (err) {
      const msg = err.message || ''
      // Ignore "already exists" errors — safe to re-run
      if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('42P07') || msg.includes('42710')) {
        console.log(`⏭️  [${i + 1}/${statements.length}] Already exists, skipping: ${preview.substring(0, 50)}`)
        skipped++
      } else {
        console.error(`❌ [${i + 1}/${statements.length}] FAILED: ${preview}`)
        console.error(`   Error: ${msg.substring(0, 200)}`)
      }
    }
  }

  console.log(`\n🎉 Migration complete: ${succeeded} executed, ${skipped} skipped`)
}

main().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
