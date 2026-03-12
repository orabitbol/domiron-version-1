/**
 * GET /api/admin/logs
 *
 * Returns admin action logs (last 100), enriched with admin usernames.
 * Auth: admin role required.
 */

import { NextResponse }      from 'next/server'
import { getServerSession }  from 'next-auth'
import { authOptions }       from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  // Fetch logs
  const { data: logs, error: logsError } = await supabase
    .from('admin_logs')
    .select('id, admin_id, action, target_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  if (logsError) {
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
  }

  const logList = logs ?? []

  // Fetch admin usernames
  const adminIds = Array.from(new Set(logList.map(l => l.admin_id).filter(Boolean)))
  let usernameMap: Record<string, string> = {}

  if (adminIds.length > 0) {
    const { data: admins } = await supabase
      .from('players')
      .select('id, username')
      .in('id', adminIds)

    if (admins) {
      usernameMap = Object.fromEntries(admins.map(a => [a.id, a.username]))
    }
  }

  // Enrich logs with username
  const enrichedLogs = logList.map(log => ({
    ...log,
    admin_username: usernameMap[log.admin_id] ?? null,
  }))

  return NextResponse.json({ data: { logs: enrichedLogs } })
}
