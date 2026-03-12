/**
 * POST /api/admin/grant
 *
 * Grants (adds) a positive integer amount to a specific field for a given
 * player. This is an ADDITIVE, ATOMIC operation — each field update is a
 * single UPDATE ... RETURNING inside a DB-side RPC, eliminating the
 * read-then-write race condition.
 *
 * Body: { playerId: string, field: GrantField, amount: number }
 *
 * Allowed fields and their source tables / RPCs:
 *   resources table : gold | iron | wood | food  → admin_grant_resource()
 *   army table      : free_population             → admin_grant_free_population()
 *   hero table      : mana                        → admin_grant_mana()
 *
 * Returns: { data: { field, amount, newValue } }
 *
 * Auth: admin role required.
 * Logging: writes to admin_logs via writeAdminLog.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { writeAdminLog } from '@/lib/admin/log'

const RESOURCE_FIELDS = ['gold', 'iron', 'wood', 'food'] as const
const ARMY_FIELDS     = ['free_population']               as const
const HERO_FIELDS     = ['mana']                          as const

type ResourceField = typeof RESOURCE_FIELDS[number]
type GrantField    = ResourceField | typeof ARMY_FIELDS[number] | typeof HERO_FIELDS[number]

const ALL_ALLOWED_FIELDS: readonly string[] = [
  ...RESOURCE_FIELDS,
  ...ARMY_FIELDS,
  ...HERO_FIELDS,
]

function isGrantField(v: unknown): v is GrantField {
  return typeof v === 'string' && ALL_ALLOWED_FIELDS.includes(v)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { playerId, field, amount } = (body ?? {}) as Record<string, unknown>

  if (typeof playerId !== 'string' || !playerId) {
    return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  }
  if (!isGrantField(field)) {
    return NextResponse.json(
      { error: `field must be one of: ${ALL_ALLOWED_FIELDS.join(', ')}` },
      { status: 400 },
    )
  }
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json(
      { error: 'amount must be a positive integer' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()
  let newValue = 0

  // ── resources table: gold | iron | wood | food ────────────────────────────
  // Single atomic UPDATE ... RETURNING inside admin_grant_resource().
  if ((RESOURCE_FIELDS as readonly string[]).includes(field)) {
    const { data, error } = await supabase.rpc('admin_grant_resource', {
      p_player_id: playerId,
      p_field:     field as ResourceField,
      p_amount:    amount,
    })

    if (error) {
      const status = error.message.includes('no resources row') ? 404 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    newValue = data as number
  }

  // ── army table: free_population ───────────────────────────────────────────
  // Single atomic UPDATE ... RETURNING inside admin_grant_free_population().
  else if ((ARMY_FIELDS as readonly string[]).includes(field)) {
    const { data, error } = await supabase.rpc('admin_grant_free_population', {
      p_player_id: playerId,
      p_amount:    amount,
    })

    if (error) {
      const status = error.message.includes('no army row') ? 404 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    newValue = data as number
  }

  // ── hero table: mana ──────────────────────────────────────────────────────
  // Single atomic UPDATE ... RETURNING inside admin_grant_mana().
  else if ((HERO_FIELDS as readonly string[]).includes(field)) {
    const { data, error } = await supabase.rpc('admin_grant_mana', {
      p_player_id: playerId,
      p_amount:    amount,
    })

    if (error) {
      const status = error.message.includes('no hero row') ? 404 : 500
      return NextResponse.json({ error: error.message }, { status })
    }

    newValue = data as number
  }

  // Log the grant action (never throws)
  await writeAdminLog(
    session.user.id,
    'grant_resource',
    { field, amount, newValue },
    playerId,
  )

  return NextResponse.json({ data: { field, amount, newValue } })
}
