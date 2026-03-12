import React from 'react'
import { createAdminClient } from '@/lib/supabase/server'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default async function LogsPage() {
  const supabase = createAdminClient()

  // Fetch logs
  const { data: logs, error } = await supabase
    .from('admin_logs')
    .select('id, admin_id, action, target_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const logList = logs ?? []

  // Build admin_id → username map
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Admin Logs</h1>
        <p className="text-sm text-slate-500 mt-1">
          Audit trail of admin actions. Showing up to the last 100 entries.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
          Failed to load logs: {error.message}
        </div>
      )}

      {/* Empty state */}
      {!error && logList.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-slate-300 font-semibold text-sm">No admin actions have been logged yet.</p>
              <p className="text-slate-500 text-xs mt-1">
                Logs are written when admins perform actions via the dashboard (e.g. repair players).
                Season hard resets are intentionally not logged (no admin player exists after reset).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Logs table */}
      {logList.length > 0 && (
        <>
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">Timestamp</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Admin</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Action</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Target ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logList.map(log => (
                    <tr key={log.id} className="border-b border-slate-800/50 hover:bg-slate-800/20 align-top">
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap font-mono">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-sm">
                        <div>{usernameMap[log.admin_id] ?? <span className="text-slate-600">Unknown</span>}</div>
                        <div className="text-xs text-slate-600 font-mono">{log.admin_id.slice(0, 8)}…</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block text-xs font-mono bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800/40 whitespace-nowrap">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                        {log.target_id ? (
                          <span title={log.target_id}>{log.target_id.slice(0, 8)}…</span>
                        ) : (
                          <span className="text-slate-700">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        {log.details ? (
                          <pre className="text-xs text-slate-500 font-mono whitespace-pre-wrap break-all leading-relaxed">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        ) : (
                          <span className="text-slate-700 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {logList.length === 100 && (
            <p className="text-xs text-slate-600 text-center">
              Showing last 100 entries. Older entries are stored in the database but not displayed here.
            </p>
          )}
        </>
      )}
    </div>
  )
}
