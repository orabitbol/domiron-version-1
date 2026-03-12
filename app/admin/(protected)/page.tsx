import React from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  })
}

function daysRemaining(endsAt: string | null | undefined): string {
  if (!endsAt) return '—'
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return 'Ended'
  return `${Math.ceil(diff / 86_400_000)} days`
}

export default async function AdminOverviewPage() {
  const supabase = createAdminClient()

  // Active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id, number, starts_at, ends_at, status')
    .eq('status', 'active')
    .maybeSingle()

  // Player count in active season
  const { count: playerCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', activeSeason?.id ?? 0)

  // Recent admin logs (last 5)
  const { data: recentLogs } = await supabase
    .from('admin_logs')
    .select('id, action, details, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  const logCount = recentLogs?.length ?? 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Domiron administration dashboard</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Active Season */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Active Season</p>
          {activeSeason ? (
            <>
              <p className="text-2xl font-bold text-indigo-400">Season {activeSeason.number}</p>
              <p className="text-xs text-slate-500 mt-1">{daysRemaining(activeSeason.ends_at)} remaining</p>
            </>
          ) : (
            <p className="text-2xl font-bold text-slate-600">None</p>
          )}
        </div>

        {/* Players */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Players</p>
          <p className="text-2xl font-bold text-emerald-400">{playerCount ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Registered this season</p>
        </div>

        {/* Recent Actions */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Recent Actions</p>
          <p className="text-2xl font-bold text-amber-400">{logCount}</p>
          <p className="text-xs text-slate-500 mt-1">Last 5 log entries</p>
        </div>
      </div>

      {/* Season Details */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Season Details</h2>
        {activeSeason ? (
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <dt className="text-xs text-slate-500">Season ID</dt>
              <dd className="text-sm text-slate-200 font-mono mt-0.5">{activeSeason.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Number</dt>
              <dd className="text-sm text-slate-200 mt-0.5">#{activeSeason.number}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Started</dt>
              <dd className="text-sm text-slate-200 mt-0.5">{formatDate(activeSeason.starts_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Ends</dt>
              <dd className="text-sm text-slate-200 mt-0.5">{formatDate(activeSeason.ends_at)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">No active season found.</p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/repairs"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-200 hover:bg-slate-700 hover:border-slate-600 transition-colors"
          >
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Run Player Repairs
          </Link>
          <Link
            href="/admin/players"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-800 border border-slate-700 text-sm text-slate-200 hover:bg-slate-700 hover:border-slate-600 transition-colors"
          >
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            View Players
          </Link>
          <Link
            href="/admin/seasons"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-800 border border-red-900/40 text-sm text-red-300 hover:bg-red-950/40 hover:border-red-800 transition-colors"
          >
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Season Reset
          </Link>
        </div>
      </div>

      {/* Recent Logs */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Recent Admin Logs</h2>
          <Link href="/admin/logs" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            View all →
          </Link>
        </div>

        {!recentLogs || recentLogs.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No admin actions logged yet.</p>
        ) : (
          <div className="space-y-2">
            {recentLogs.map(log => (
              <div key={log.id} className="flex items-start gap-3 py-2 border-b border-slate-800 last:border-0">
                <div className="flex-1 min-w-0">
                  <span className="inline-block text-xs font-mono bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800/40">
                    {log.action}
                  </span>
                  {log.details && (
                    <p className="text-xs text-slate-500 mt-1 truncate font-mono">
                      {JSON.stringify(log.details).slice(0, 120)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-slate-600 whitespace-nowrap shrink-0">
                  {new Date(log.created_at).toLocaleString('en-GB', {
                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
