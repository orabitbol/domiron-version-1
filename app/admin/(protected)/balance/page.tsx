import React from 'react'
import { createAdminClient } from '@/lib/supabase/server'

export default async function BalancePage() {
  const supabase = createAdminClient()

  // Fetch any existing balance overrides
  const { data: overrides, error } = await supabase
    .from('balance_overrides')
    .select('id, key, value, updated_at')
    .order('updated_at', { ascending: false })

  const overrideList = overrides ?? []

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Balance &amp; Economy</h1>
        <p className="text-sm text-slate-500 mt-1">
          Runtime balance overrides and game economy configuration.
        </p>
      </div>

      {/* Info card */}
      <div className="bg-indigo-950/20 border border-indigo-800/30 rounded-lg p-5 flex items-start gap-3">
        <svg className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm text-slate-400 space-y-1">
          <p className="font-semibold text-indigo-300">This section is reserved for runtime balance overrides.</p>
          <p>
            The <code className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded text-indigo-300">balance_overrides</code> table
            exists in the database and can store per-key JSONB overrides that shadow the static config at runtime.
            The override system is not yet implemented in the game engine.
          </p>
          <p className="text-slate-500">
            To modify game balance now, edit{' '}
            <code className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">config/balance.config.ts</code>
            {' '}and redeploy.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
          Failed to load balance overrides: {error.message}
        </div>
      )}

      {/* Balance overrides table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Balance Overrides
          </h2>
          <span className="text-xs text-slate-600">
            {overrideList.length === 0 ? 'No overrides' : `${overrideList.length} override${overrideList.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        {overrideList.length === 0 ? (
          <div className="p-8 text-center text-slate-600 text-sm">
            No balance overrides configured. The game is using the static{' '}
            <code className="font-mono text-xs">balance.config.ts</code> values.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Key</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Value</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {overrideList.map(row => (
                  <tr key={row.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                    <td className="px-4 py-3 font-mono text-indigo-300 text-xs">{row.key}</td>
                    <td className="px-4 py-3">
                      <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-all">
                        {JSON.stringify(row.value, null, 2)}
                      </pre>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-700 text-center">
        Runtime override management UI coming in a future update.
      </p>
    </div>
  )
}
