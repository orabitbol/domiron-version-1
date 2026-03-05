'use client'

import React, { createContext, useCallback, useContext, useState } from 'react'
import type { PlayerData } from '@/types/game'

interface PlayerContextValue extends PlayerData {
  refresh: () => Promise<void>
  /**
   * Immediately merge a partial patch into the store.
   * Call this right after a mutation API call succeeds so the UI updates
   * without waiting for the async refresh() network round-trip.
   *
   * Rules enforced here:
   *  - `player.rank_global` and `player.rank_city` are NEVER updated from
   *    patches — they are tick-only values computed by the server.
   *  - All other top-level fields (resources, army, weapons, etc.) are
   *    replaced in full when present in the patch.
   *  - `player` itself is shallow-merged (partial player patches are safe).
   */
  applyPatch: (patch: Partial<PlayerData>) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function PlayerProvider({
  children,
  initial,
}: {
  children: React.ReactNode
  initial: PlayerData
}) {
  const [data, setData] = useState<PlayerData>(initial)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/player')
      if (!res.ok) return
      const json = await res.json()
      if (json.data) setData(json.data)
    } catch {
      // silently ignore network errors
    }
  }, [])

  const applyPatch = useCallback((patch: Partial<PlayerData>) => {
    setData(prev => {
      const next = { ...prev }

      if (patch.player) {
        // Shallow merge player — but NEVER overwrite rank fields from patches.
        // Ranks are computed during tick only.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { rank_global, rank_city, ...safePlayerPatch } = patch.player
        next.player = { ...prev.player, ...safePlayerPatch }
      }

      // Replace other fields in full when present in the patch.
      if (patch.resources  !== undefined) next.resources  = patch.resources
      if (patch.army       !== undefined) next.army       = patch.army
      if (patch.weapons    !== undefined) next.weapons    = patch.weapons
      if (patch.training   !== undefined) next.training   = patch.training
      if (patch.development !== undefined) next.development = patch.development
      if (patch.hero       !== undefined) next.hero       = patch.hero
      if (patch.bank       !== undefined) next.bank       = patch.bank
      if (patch.tribe      !== undefined) next.tribe      = patch.tribe
      if (patch.season     !== undefined) next.season     = patch.season

      return next
    })
  }, [])

  return (
    <PlayerContext.Provider value={{ ...data, refresh, applyPatch }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
