'use client'

import React, { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  id:          string
  username:    string
  email:       string
  army_name:   string
  city:        number
  race:        string
  role:        string
  rank_global: number | null
  power_total: number
}

interface PlayerResources {
  gold: number
  iron: number
  wood: number
  food: number
}

interface PlayerArmy {
  free_population: number
  soldiers:        number
  cavalry:         number
  spies:           number
  scouts:          number
  slaves:          number
}

interface PlayerHero {
  level:        number
  mana:         number
  mana_per_tick: number
  spell_points: number
}

interface PlayerDetail {
  player:    SearchResult & { turns: number; season_id: number; created_at: string }
  resources: PlayerResources | null
  army:      PlayerArmy      | null
  hero:      PlayerHero      | null
}

type GrantField = 'gold' | 'iron' | 'wood' | 'food' | 'free_population' | 'mana'

const GRANT_FIELDS: { value: GrantField; label: string; table: string }[] = [
  { value: 'gold',            label: 'Gold',            table: 'resources' },
  { value: 'iron',            label: 'Iron',            table: 'resources' },
  { value: 'wood',            label: 'Wood',            table: 'resources' },
  { value: 'food',            label: 'Food',            table: 'resources' },
  { value: 'free_population', label: 'Free Population', table: 'army'      },
  { value: 'mana',            label: 'Mana',            table: 'hero'      },
]

const CITY_NAMES: Record<number, string> = { 1: 'City 1', 2: 'City 2', 3: 'City 3', 4: 'City 4', 5: 'City 5' }

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GrantsPage() {
  const [query,          setQuery]          = useState('')
  const [searching,      setSearching]      = useState(false)
  const [searchResults,  setSearchResults]  = useState<SearchResult[] | null>(null)
  const [searchError,    setSearchError]    = useState<string | null>(null)

  const [selectedId,     setSelectedId]     = useState<string | null>(null)
  const [playerDetail,   setPlayerDetail]   = useState<PlayerDetail | null>(null)
  const [loadingDetail,  setLoadingDetail]  = useState(false)

  const [grantField,     setGrantField]     = useState<GrantField>('gold')
  const [grantAmount,    setGrantAmount]    = useState('')
  const [granting,       setGranting]       = useState(false)
  const [grantSuccess,   setGrantSuccess]   = useState<string | null>(null)
  const [grantError,     setGrantError]     = useState<string | null>(null)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Search ──────────────────────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSearchResults(null)
      setSearchError(null)
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const res  = await fetch(`/api/admin/player-search?q=${encodeURIComponent(q.trim())}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Search failed')
      setSearchResults(json.data)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }, [])

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setQuery(val)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => doSearch(val), 300)
  }

  // ── Load player detail ──────────────────────────────────────────────────────

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true)
    setGrantSuccess(null)
    setGrantError(null)
    try {
      const res  = await fetch(`/api/admin/player-search?id=${encodeURIComponent(id)}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load player')
      setPlayerDetail(json.data)
    } catch (err) {
      setPlayerDetail(null)
      setGrantError(err instanceof Error ? err.message : 'Failed to load player')
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  function handleSelectPlayer(id: string) {
    setSelectedId(id)
    loadDetail(id)
    setGrantAmount('')
    setGrantSuccess(null)
    setGrantError(null)
  }

  // ── Grant ───────────────────────────────────────────────────────────────────

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return

    const parsed = parseInt(grantAmount, 10)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setGrantError('Amount must be a positive integer.')
      return
    }

    setGranting(true)
    setGrantSuccess(null)
    setGrantError(null)

    try {
      const res = await fetch('/api/admin/grant', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ playerId: selectedId, field: grantField, amount: parsed }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Grant failed')

      const { field, amount, newValue } = json.data as { field: string; amount: number; newValue: number }
      setGrantSuccess(`Granted +${amount.toLocaleString()} ${field}. New value: ${newValue.toLocaleString()}`)
      setGrantAmount('')
      // Refresh player detail to show updated values
      await loadDetail(selectedId)
    } catch (err) {
      setGrantError(err instanceof Error ? err.message : 'Grant failed')
    } finally {
      setGranting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const detail = playerDetail

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Player Grants</h1>
        <p className="text-sm text-slate-500 mt-1">
          Search for a player, inspect their current state, and grant additional resources or population.
          Grants are additive — they never overwrite existing values.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* ── LEFT: Search panel ─────────────────────────────────────────────── */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Player Search</h2>
          </div>
          <div className="p-4 space-y-3">
            <div className="relative">
              <Input
                placeholder="Search by username, army name, or email…"
                value={query}
                onChange={handleQueryChange}
                className="bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500"
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                  Searching…
                </span>
              )}
            </div>

            {searchError && (
              <p className="text-xs text-red-400">{searchError}</p>
            )}

            {query.trim().length > 0 && query.trim().length < 2 && (
              <p className="text-xs text-slate-500">Type at least 2 characters to search.</p>
            )}

            {/* Results */}
            {searchResults !== null && (
              <div className="space-y-1">
                {searchResults.length === 0 ? (
                  <p className="text-sm text-slate-500 py-4 text-center">No players found.</p>
                ) : (
                  searchResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectPlayer(p.id)}
                      className={[
                        'w-full text-left px-3 py-2.5 rounded-md transition-colors',
                        selectedId === p.id
                          ? 'bg-indigo-600/25 border border-indigo-600/40 text-indigo-200'
                          : 'bg-slate-800/60 border border-slate-700/40 text-slate-300 hover:bg-slate-800 hover:border-slate-600',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-medium text-sm">{p.username}</span>
                          <span className="ml-2 text-xs text-slate-500">{p.army_name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-500 capitalize">{p.race}</span>
                          <span className="text-xs text-slate-600">C{p.city}</span>
                          {p.role === 'admin' && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/40 text-amber-300">
                              admin
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 truncate font-mono">{p.email}</p>
                    </button>
                  ))
                )}
              </div>
            )}

            {searchResults === null && query.trim().length < 2 && (
              <p className="text-xs text-slate-600 text-center py-6">
                Search results will appear here.
              </p>
            )}
          </div>
        </div>

        {/* ── RIGHT: Detail + Grant panel ────────────────────────────────────── */}
        <div className="space-y-4">
          {!selectedId && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-600 text-sm">
              Select a player from the search results to view their state and grant resources.
            </div>
          )}

          {selectedId && loadingDetail && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-500 text-sm">
              Loading player data…
            </div>
          )}

          {selectedId && !loadingDetail && detail && (
            <>
              {/* Player summary card */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-200">{detail.player.username}</span>
                    <span className="ml-2 text-slate-500 text-sm">{detail.player.army_name}</span>
                  </div>
                  {detail.player.role === 'admin' && (
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 border border-amber-700/40 text-amber-300">
                      admin
                    </span>
                  )}
                </div>

                <div className="p-4 space-y-4">
                  {/* Identity row */}
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <dt className="text-slate-500 mb-0.5">Player ID</dt>
                      <dd className="text-slate-300 font-mono text-[11px] break-all">{detail.player.id}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 mb-0.5">Email</dt>
                      <dd className="text-slate-300 truncate">{detail.player.email}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 mb-0.5">Race / City</dt>
                      <dd className="text-slate-300 capitalize">{detail.player.race} — {CITY_NAMES[detail.player.city] ?? detail.player.city}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 mb-0.5">Rank (Global)</dt>
                      <dd className="text-slate-300">{detail.player.rank_global ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 mb-0.5">Power Total</dt>
                      <dd className="text-slate-300">{fmt(detail.player.power_total)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 mb-0.5">Turns</dt>
                      <dd className="text-slate-300">{detail.player.turns}</dd>
                    </div>
                  </dl>

                  {/* Resources */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Resources</p>
                    {detail.resources ? (
                      <div className="grid grid-cols-4 gap-2">
                        {(['gold', 'iron', 'wood', 'food'] as const).map(res => (
                          <div key={res} className="bg-slate-800/60 rounded px-2 py-1.5 text-center">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{res}</p>
                            <p className="text-sm font-semibold text-slate-200">{fmt(detail.resources?.[res])}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">No resources row found.</p>
                    )}
                  </div>

                  {/* Army / Population */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Army</p>
                    {detail.army ? (
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            ['free_population', 'Free Pop'],
                            ['soldiers',        'Soldiers'],
                            ['cavalry',         'Cavalry'],
                            ['spies',           'Spies'],
                            ['scouts',          'Scouts'],
                            ['slaves',          'Slaves'],
                          ] as [keyof PlayerArmy, string][]
                        ).map(([key, label]) => (
                          <div key={key} className="bg-slate-800/60 rounded px-2 py-1.5 text-center">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
                            <p className="text-sm font-semibold text-slate-200">{fmt(detail.army?.[key])}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">No army row found.</p>
                    )}
                  </div>

                  {/* Hero */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Hero</p>
                    {detail.hero ? (
                      <div className="grid grid-cols-4 gap-2">
                        {(
                          [
                            ['level',        'Level'],
                            ['mana',         'Mana'],
                            ['mana_per_tick', 'Mana/Tick'],
                            ['spell_points', 'Spell Pts'],
                          ] as [keyof PlayerHero, string][]
                        ).map(([key, label]) => (
                          <div key={key} className="bg-slate-800/60 rounded px-2 py-1.5 text-center">
                            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
                            <p className="text-sm font-semibold text-slate-200">{fmt(detail.hero?.[key])}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600">No hero row found.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Grant form */}
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-800">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Grant Resources</h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Adds the amount to the player&apos;s current value. Cannot be undone.
                  </p>
                </div>

                <form onSubmit={handleGrant} className="p-4 space-y-4">
                  {/* Field selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Field
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {GRANT_FIELDS.map(f => (
                        <button
                          key={f.value}
                          type="button"
                          onClick={() => setGrantField(f.value)}
                          className={[
                            'px-3 py-1.5 rounded text-xs font-medium border transition-colors',
                            grantField === f.value
                              ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600',
                          ].join(' ')}
                        >
                          {f.label}
                          <span className="ml-1 text-[10px] opacity-50">({f.table})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount input */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      Amount (positive integer)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      placeholder="e.g. 5000"
                      value={grantAmount}
                      onChange={e => setGrantAmount(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-slate-200 w-48"
                    />
                  </div>

                  {/* Feedback */}
                  {grantSuccess && (
                    <div className="p-3 rounded bg-emerald-950/30 border border-emerald-700/40 text-emerald-300 text-sm">
                      {grantSuccess}
                    </div>
                  )}
                  {grantError && (
                    <div className="p-3 rounded bg-red-950/30 border border-red-700/40 text-red-300 text-sm">
                      {grantError}
                    </div>
                  )}

                  {/* Submit */}
                  <Button
                    type="submit"
                    variant="primary"
                    loading={granting}
                    disabled={!grantAmount || granting}
                  >
                    Grant +{grantAmount || '0'} {GRANT_FIELDS.find(f => f.value === grantField)?.label}
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
