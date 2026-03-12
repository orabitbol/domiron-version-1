'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface SeasonInfo {
  id:        number
  number:    number
  starts_at: string
  ends_at:   string
  status:    string
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function SeasonsPage() {
  const [season,      setSeason]      = useState<SeasonInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [confirmed,   setConfirmed]   = useState('')
  const [loading,     setLoading]     = useState(false)
  const [result,      setResult]      = useState<{ newSeason: { number: number; id: number } } | null>(null)
  const [error,       setError]       = useState<string | null>(null)

  // Fetch current season on mount
  useEffect(() => {
    async function fetchSeason() {
      try {
        const res  = await fetch('/api/admin/stats')
        const json = await res.json()
        if (res.ok && json.data?.season) {
          setSeason(json.data.season)
        }
      } catch {
        // silently ignore — we'll just show no season
      } finally {
        setLoadingInfo(false)
      }
    }
    fetchSeason()
  }, [])

  async function handleReset() {
    if (confirmed !== 'RESET') return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res  = await fetch('/api/admin/season/reset', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Reset failed')
      setResult(json)
      setConfirmed('')
      setSeason(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const canReset = confirmed === 'RESET' && !loading

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Season Management</h1>
        <p className="text-sm text-slate-500 mt-1">View current season info and perform hard resets.</p>
      </div>

      {/* Current Season Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Current Season</h2>
        {loadingInfo ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : season ? (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Season ID</dt>
              <dd className="text-slate-200 font-mono mt-0.5">{season.id}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Number</dt>
              <dd className="text-slate-200 mt-0.5">Season #{season.number}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Status</dt>
              <dd className="mt-0.5">
                <span className={[
                  'text-xs px-2 py-0.5 rounded font-semibold uppercase',
                  season.status === 'active'
                    ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/40'
                    : 'bg-slate-800 text-slate-400 border border-slate-700',
                ].join(' ')}>
                  {season.status}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Started</dt>
              <dd className="text-slate-200 mt-0.5">{formatDate(season.starts_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Ends</dt>
              <dd className="text-slate-200 mt-0.5">{formatDate(season.ends_at)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-slate-500">No active season found.</p>
        )}
      </div>

      {/* Success state */}
      {result && (
        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-4">
          <p className="text-emerald-300 font-semibold text-sm mb-1">Hard reset completed successfully.</p>
          <p className="text-xs text-emerald-600">
            Fresh Season {result.newSeason.number} created (ID: {result.newSeason.id}).
          </p>
          <p className="text-xs text-emerald-600 mt-2">
            Next steps: re-register a player at <code className="font-mono">/register</code>, then run{' '}
            <code className="font-mono">node scripts/create-admin.mjs --email &lt;your-email&gt;</code>
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Hard Reset Section */}
      <div className="bg-slate-900 border border-red-900/40 rounded-lg overflow-hidden">
        {/* Warning header */}
        <div className="bg-red-950/30 border-b border-red-900/40 px-5 py-3 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-red-300 font-bold text-sm uppercase tracking-wide">
            Destructive — Hard Reset
          </span>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-sm text-slate-400 space-y-1">
            <p className="text-red-300 font-semibold">This will permanently delete:</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-400 text-xs">
              <li>ALL registered players and their accounts</li>
              <li>ALL game data (army, resources, tribe, bank, hero, weapons, training…)</li>
              <li>ALL attack history, spy history, hall of fame</li>
              <li>ALL seasons</li>
              <li>A fresh Season 1 will be created immediately after</li>
            </ul>
            <p className="mt-2 text-amber-400 font-semibold text-xs uppercase tracking-wide">
              DEV MODE ONLY. Do not use in production.
            </p>
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-3">
            <p className="text-sm text-slate-300">
              Type <code className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-red-300 text-xs">RESET</code> to confirm:
            </p>
            <input
              type="text"
              value={confirmed}
              onChange={e => setConfirmed(e.target.value)}
              placeholder="Type RESET here"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 placeholder:text-slate-600 text-sm font-mono focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition-colors"
            />
            <Button
              variant="danger"
              size="md"
              onClick={handleReset}
              disabled={!canReset}
              loading={loading}
              className="w-full"
            >
              Execute Hard Reset
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-600 text-center">
        After reset: re-register at <code className="font-mono">/register</code> and run <code className="font-mono">scripts/create-admin.mjs</code>
      </p>
    </div>
  )
}
