import React from 'react'
import { createAdminClient } from '@/lib/supabase/server'

interface CityCount {
  city:  string
  count: number
}

export default async function StatsPage() {
  const supabase = createAdminClient()

  // Active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id, number, starts_at, ends_at')
    .eq('status', 'active')
    .maybeSingle()

  const seasonId = activeSeason?.id ?? 0

  // Total player count
  const { count: playerCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', seasonId)

  // Players by city
  const { data: playersByCityRaw } = await supabase
    .from('players')
    .select('city')
    .eq('season_id', seasonId)

  // Build city count map manually (no group-by in Supabase JS client without RPC)
  const cityCounts: Record<string, number> = {}
  for (const row of playersByCityRaw ?? []) {
    const city = row.city ?? 'unknown'
    cityCounts[city] = (cityCounts[city] ?? 0) + 1
  }
  const playersByCity: CityCount[] = Object.entries(cityCounts)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)

  // Tribe count
  const { count: tribeCount } = await supabase
    .from('tribes')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', seasonId)

  // Attacks in last 24h
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentAttacks } = await supabase
    .from('attacks')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since24h)

  // Top 5 players by power
  const { data: topPlayers } = await supabase
    .from('players')
    .select('id, username, army_name, city, power_total, rank_global')
    .eq('season_id', seasonId)
    .order('power_total', { ascending: false })
    .limit(5)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Stats</h1>
        <p className="text-sm text-slate-500 mt-1">
          {activeSeason ? `Season ${activeSeason.number} — live statistics` : 'No active season'}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Total Players</p>
          <p className="text-3xl font-bold text-indigo-400">{playerCount ?? 0}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Tribes</p>
          <p className="text-3xl font-bold text-emerald-400">{tribeCount ?? 0}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Attacks (24h)</p>
          <p className="text-3xl font-bold text-red-400">{recentAttacks ?? 0}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Cities</p>
          <p className="text-3xl font-bold text-amber-400">{playersByCity.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Players by City */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Players by City</h2>
          </div>
          {playersByCity.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-600">No data</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">City</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Players</th>
                </tr>
              </thead>
              <tbody>
                {playersByCity.map(({ city, count }) => (
                  <tr key={city} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                    <td className="px-4 py-2.5 text-slate-300 capitalize">{city}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400 font-mono">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top Players */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Top 5 by Power</h2>
          </div>
          {!topPlayers || topPlayers.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate-600">No players</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800/60">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">#</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Player</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Power</th>
                </tr>
              </thead>
              <tbody>
                {topPlayers.map((p, i) => (
                  <tr key={p.id} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      <div className="text-slate-200">{p.username}</div>
                      <div className="text-xs text-slate-600 capitalize">{p.city ?? '—'}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-amber-300 font-mono font-semibold">
                      {(p.power_total ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
