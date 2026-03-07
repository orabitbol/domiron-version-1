'use client'

// Single shared countdown state for the game layout.
// TickProvider (in GameLayout) calls useTickCountdown() once.
// UI components read via useTickCountdownState() — never call useTickCountdown() directly.

import React, { createContext, useContext } from 'react'
import { useTickCountdown } from '@/lib/hooks/useTickCountdown'
import type { TickCountdownState } from '@/lib/hooks/useTickCountdown'

const TickContext = createContext<TickCountdownState>({
  ms:         null,
  nextTickAt: null,
  serverNow:  null,
})

export function TickProvider({ children }: { children: React.ReactNode }) {
  const state = useTickCountdown()
  return <TickContext.Provider value={state}>{children}</TickContext.Provider>
}

export function useTickCountdownState(): TickCountdownState {
  return useContext(TickContext)
}
