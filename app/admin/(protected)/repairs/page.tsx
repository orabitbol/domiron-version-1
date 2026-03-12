'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface BrokenPlayer {
  id:          string
  username:    string
  army_name:   string
  missingRows: string[]
}

interface RepairResult extends BrokenPlayer {
  repairedRows: string[]
  failedRows:   string[]
}

interface DryRunData {
  seasonId:    number | null
  totalBroken: number
  broken:      BrokenPlayer[]
  probeErrors: string[]
}

interface RepairData {
  seasonId:     number | null
  totalRepaired: number
  totalFailed:  number
  results:      RepairResult[]
  probeErrors:  string[]
}

export default function RepairsPage() {
  const [dryRunData,  setDryRunData]  = useState<DryRunData | null>(null)
  const [repairData,  setRepairData]  = useState<RepairData | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const runDryRun = useCallback(async () => {
    setLoading(true)
    setError(null)
    setRepairData(null)
    try {
      const res  = await fetch('/api/admin/repair-players')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Dry-run failed')
      setDryRunData(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-run dry-run on mount
  useEffect(() => { runDryRun() }, [runDryRun])

  async function handleRepair() {
    if (!window.confirm(
      `This will attempt to repair ${dryRunData?.totalBroken} broken player(s) by creating missing DB rows.\n\nProceed?`
    )) return

    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/admin/repair-players', { method: 'POST' })
      const json = await res.json()
      if (!res.ok && res.status !== 207) throw new Error(json.error ?? 'Repair failed')
      setRepairData(json.data)
      // Re-run dry-run to show updated state
      await runDryRun()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const hasBroken = (dryRunData?.totalBroken ?? 0) > 0

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Player Repairs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Detects players missing required related rows (army, bank, hero, etc.) and repairs them with safe defaults.
            This is non-destructive — it only inserts missing rows, never overwrites existing ones.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={runDryRun}
          loading={loading}
          className="shrink-0 border-slate-700 text-slate-300 bg-slate-800 hover:bg-slate-700"
        >
          Re-run Check
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Repair result */}
      {repairData && (
        <div className={[
          'p-4 rounded-lg border text-sm',
          repairData.totalFailed > 0
            ? 'bg-amber-950/30 border-amber-700/50 text-amber-200'
            : 'bg-emerald-950/30 border-emerald-700/50 text-emerald-200',
        ].join(' ')}>
          <p className="font-semibold mb-2">
            Repair complete — {repairData.totalRepaired} repaired, {repairData.totalFailed} failed
          </p>
          {repairData.results.map(r => (
            <div key={r.id} className="mt-2">
              <span className="font-mono text-xs">{r.username}</span>
              {r.repairedRows.length > 0 && (
                <span className="ml-2 text-xs text-emerald-300">
                  Fixed: {r.repairedRows.join(', ')}
                </span>
              )}
              {r.failedRows.length > 0 && (
                <span className="ml-2 text-xs text-red-300">
                  Failed: {r.failedRows.join(', ')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && !dryRunData && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-500 text-sm">
          Scanning players…
        </div>
      )}

      {/* Dry-run results */}
      {dryRunData && (
        <>
          {/* Season info */}
          <div className="text-xs text-slate-500">
            Season ID: <span className="font-mono text-slate-400">{dryRunData.seasonId ?? 'none'}</span>
          </div>

          {/* Probe errors */}
          {dryRunData.probeErrors.length > 0 && (
            <div className="p-3 rounded bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs font-mono space-y-1">
              <p className="font-semibold text-amber-200">Probe errors:</p>
              {dryRunData.probeErrors.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          {/* All healthy */}
          {dryRunData.totalBroken === 0 && (
            <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg p-6 flex items-center gap-3">
              <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-emerald-300 font-semibold text-sm">All players are healthy</p>
                <p className="text-emerald-600 text-xs mt-0.5">No missing rows detected in active season.</p>
              </div>
            </div>
          )}

          {/* Broken players table */}
          {dryRunData.totalBroken > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <p className="text-sm font-semibold text-slate-300">
                  {dryRunData.totalBroken} broken player{dryRunData.totalBroken !== 1 ? 's' : ''} detected
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRepair}
                  loading={loading}
                >
                  Run Repair
                </Button>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Username</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Army Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Player ID</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Missing Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {dryRunData.broken.map(p => (
                    <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-200 font-medium">{p.username}</td>
                      <td className="px-4 py-3 text-slate-400">{p.army_name}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.id}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {p.missingRows.map(row => (
                            <span
                              key={row}
                              className="inline-block text-xs px-1.5 py-0.5 rounded bg-red-950/60 border border-red-800/40 text-red-300 font-mono"
                            >
                              {row}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!hasBroken && dryRunData && (
        <p className="text-xs text-slate-600 text-center">
          Repairs button only shown when broken players are detected.
        </p>
      )}
    </div>
  )
}
