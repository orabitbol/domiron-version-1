'use client'

import React, { createContext, useCallback, useContext, useState } from 'react'
import type { PlayerData } from '@/types/game'

interface PlayerContextValue extends PlayerData {
  refresh: () => Promise<void>
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

  return (
    <PlayerContext.Provider value={{ ...data, refresh }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider')
  return ctx
}
