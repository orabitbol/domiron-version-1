import React from 'react'
import { createAdminClient } from '@/lib/supabase/server'

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default async function PlayersPage() {
  const supabase = createAdminClient()

  // Get active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id, number')
    .eq('status', 'active')
    .maybeSingle()

  // Get all players in active season
  const { data: players, error } = activeSeason
    ? await supabase
        .from('players')
        .select('id, username, army_name, email, race, city, role, power_total, turns, is_vacation, rank_global, rank_city, joined_at, created_at')
        .eq('season_id', activeSeason.id)
        .order('rank_global', { ascending: true, nullsFirst: false })
    : { data: [], error: null }

  const playerList = players ?? []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Players</h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeSeason
              ? `Season ${activeSeason.number} — ${playerList.length} player${playerList.length !== 1 ? 's' : ''}`
              : 'No active season'}
          </p>
        </div>
        <span className="text-sm font-semibold px-3 py-1 rounded-full bg-indigo-900/40 border border-indigo-700/40 text-indigo-300">
          {playerList.length}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-sm">
          Failed to load players: {error.message}
        </div>
      )}

      {/* No season */}
      {!activeSeason && !error && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-500 text-sm">
          No active season. Run a season reset to create Season 1.
        </div>
      )}

      {/* No players */}
      {activeSeason && playerList.length === 0 && !error && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-8 text-center text-slate-500 text-sm">
          No players registered this season.
        </div>
      )}

      {/* Players table */}
      {playerList.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Username</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Army Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Race</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">City</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Power</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Turns</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Joined</th>
                </tr>
              </thead>
              <tbody>
                {playerList.map(player => (
                  <tr key={player.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">
                      {player.rank_global ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-200 font-medium">{player.username}</div>
                      <div className="text-xs text-slate-600 font-mono">{player.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{player.army_name}</td>
                    <td className="px-4 py-3 text-slate-400 capitalize">{player.race ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400 capitalize">{player.city ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-300 font-mono">
                      {(player.power_total ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400 font-mono">
                      {player.turns ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      {player.role === 'admin' ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-900/40 border border-amber-700/40 text-amber-300">
                          admin
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">player</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {formatDate(player.joined_at ?? player.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
