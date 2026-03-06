/**
 * GET /api/tribe/audit-log
 *
 * Returns the last 50 audit log entries for the player's tribe.
 * Any tribe member can view the log.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()

    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', playerId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    const { data: logs, error } = await supabase
      .from('tribe_audit_log')
      .select(`
        id,
        action,
        details,
        created_at,
        actor:players!actor_id(id, username),
        target:players!target_id(id, username)
      `)
      .eq('tribe_id', membership.tribe_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[tribe/audit-log] fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
    }

    return NextResponse.json({ data: { logs: logs ?? [] } })
  } catch (err) {
    console.error('Tribe/audit-log error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
