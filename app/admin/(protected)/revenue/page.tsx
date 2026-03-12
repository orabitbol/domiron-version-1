'use client'

import React, { useState, useEffect, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecentTransaction {
  id:            string
  player_id:     string | null
  amount_cents:  number
  currency:      string
  product_key:   string
  provider:      string
  status:        string
  created_at:    string
  completed_at:  string | null
}

interface RevenueSummary {
  totalRevenueCents:  number
  totalTransactions:  number
  completedCount:     number
  payingUsersCount:   number
  avgOrderValueCents: number
  revenueByProduct:   Record<string, { count: number; totalCents: number }>
  recentTransactions: RecentTransaction[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCents(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style:    'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-900/40 border-emerald-700/40 text-emerald-300',
  pending:   'bg-amber-900/30  border-amber-700/40  text-amber-300',
  failed:    'bg-red-900/30    border-red-700/40    text-red-300',
  refunded:  'bg-slate-800     border-slate-600     text-slate-400',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RevenuePage() {
  const [summary,  setSummary]  = useState<RevenueSummary | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const loadRevenue = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/admin/revenue')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load revenue data')
      setSummary(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRevenue() }, [loadRevenue])

  const noData = summary && summary.totalTransactions === 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Revenue</h1>
          <p className="text-sm text-slate-500 mt-1">
            Financial dashboard. Infrastructure is ready for payment integration.
          </p>
        </div>
        <button
          onClick={loadRevenue}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-40"
        >
          Refresh
        </button>
      </div>

      {/* Integration notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-950/20 border border-amber-800/30">
        <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-xs text-amber-300/80">
          <span className="font-semibold text-amber-300">Payment integration not active.</span>
          {' '}The revenue infrastructure is in place (
          <code className="font-mono text-amber-400/90">payments</code> table,
          {' '}<code className="font-mono text-amber-400/90">GET /api/admin/revenue</code>).
          Connect a payment provider (Stripe, etc.) to start recording transactions.
          All values below reflect real DB data — none are fabricated.
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-10 text-center text-slate-500 text-sm">
          Loading revenue data…
        </div>
      )}

      {!loading && summary && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Total Revenue</p>
              <p className="text-2xl font-bold text-emerald-400">
                {noData ? '—' : formatCents(summary.totalRevenueCents)}
              </p>
              <p className="text-xs text-slate-600 mt-1">Completed payments</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Transactions</p>
              <p className="text-2xl font-bold text-indigo-400">
                {summary.totalTransactions}
              </p>
              <p className="text-xs text-slate-600 mt-1">All statuses</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Paying Users</p>
              <p className="text-2xl font-bold text-amber-400">
                {summary.payingUsersCount}
              </p>
              <p className="text-xs text-slate-600 mt-1">Unique customers</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Avg. Order</p>
              <p className="text-2xl font-bold text-slate-300">
                {noData ? '—' : formatCents(summary.avgOrderValueCents)}
              </p>
              <p className="text-xs text-slate-600 mt-1">Per completed order</p>
            </div>
          </div>

          {/* Revenue by product */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Revenue by Product</h2>
            </div>
            {Object.keys(summary.revenueByProduct).length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 mb-3">
                  <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500">No product revenue recorded yet.</p>
                <p className="text-xs text-slate-600 mt-1">Data will appear here once payments are processed.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Product</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Orders</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.revenueByProduct)
                    .sort((a, b) => b[1].totalCents - a[1].totalCents)
                    .map(([key, val]) => (
                      <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-300 font-mono text-xs">{key}</td>
                        <td className="px-4 py-3 text-slate-400 text-right">{val.count}</td>
                        <td className="px-4 py-3 text-emerald-400 text-right font-semibold">{formatCents(val.totalCents)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Chart placeholder */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Revenue Over Time</h2>
            <div className="h-32 flex items-center justify-center rounded-md bg-slate-800/40 border border-dashed border-slate-700">
              <div className="text-center">
                <svg className="w-6 h-6 text-slate-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                <p className="text-xs text-slate-600">Chart available once payment data exists</p>
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Recent Transactions</h2>
              {summary.recentTransactions.length > 0 && (
                <span className="text-xs text-slate-500">{summary.recentTransactions.length} shown</span>
              )}
            </div>

            {summary.recentTransactions.length === 0 ? (
              <div className="p-8 text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800 mb-3">
                  <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <p className="text-sm text-slate-500">No transactions recorded yet.</p>
                <p className="text-xs text-slate-600 mt-1">
                  Completed purchases will appear here once payment integration is active.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Product</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Provider</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentTransactions.map(tx => (
                    <tr key={tx.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDate(tx.created_at)}</td>
                      <td className="px-4 py-3 text-slate-300 font-mono text-xs">{tx.product_key}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{tx.provider}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs px-1.5 py-0.5 rounded border ${STATUS_STYLES[tx.status] ?? STATUS_STYLES.pending}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-300 font-semibold text-xs">
                        {formatCents(tx.amount_cents, tx.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
