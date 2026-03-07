/**
 * useTickCountdown — internal implementation of the server-authoritative countdown.
 *
 * Do NOT call from UI components. Call once via TickProvider; consume via useTickCountdownState().
 *
 * ms is null until the first /api/tick-status response — no local-clock estimate is ever used.
 */
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

export interface TickCountdownState {
  ms:         number | null
  nextTickAt: string | null
  serverNow:  string | null
}

export function useTickCountdown(): TickCountdownState {
  const [nextTickAt, setNextTickAt] = useState<string | null>(null)
  const [serverNow, setServerNow]   = useState<string | null>(null)
  const [ms, setMs]                 = useState<number | null>(null)
  const overduePollerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const syncFromServer = useCallback(() => {
    fetch('/api/tick-status')
      .then(r => r.json())
      .then((data: { server_now: string; next_tick_at: string | null }) => {
        if (data.next_tick_at) setNextTickAt(data.next_tick_at)
        if (data.server_now)   setServerNow(data.server_now)
      })
      .catch(() => {})
  }, [])

  // Initial fetch + 5-minute heartbeat for drift correction
  useEffect(() => {
    syncFromServer()
    const heartbeat = setInterval(syncFromServer, 5 * 60 * 1000)
    return () => clearInterval(heartbeat)
  }, [syncFromServer])

  // Update nextTickAt when a tick-completed Realtime event arrives
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ next_tick_at: string }>).detail
      if (detail?.next_tick_at) {
        setNextTickAt(detail.next_tick_at)
        if (overduePollerRef.current) {
          clearInterval(overduePollerRef.current)
          overduePollerRef.current = null
        }
      }
    }
    window.addEventListener('domiron:tick-completed', handler)
    return () => window.removeEventListener('domiron:tick-completed', handler)
  }, [])

  // Count down every second. When overdue, poll every 5 s until next_tick_at advances.
  useEffect(() => {
    if (!nextTickAt) return

    const tick = () => {
      const raw = new Date(nextTickAt).getTime() - Date.now()
      setMs(Math.max(0, raw))

      if (raw <= 0 && !overduePollerRef.current) {
        overduePollerRef.current = setInterval(syncFromServer, 5_000)
      } else if (raw > 0 && overduePollerRef.current) {
        clearInterval(overduePollerRef.current)
        overduePollerRef.current = null
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => {
      clearInterval(id)
      if (overduePollerRef.current) {
        clearInterval(overduePollerRef.current)
        overduePollerRef.current = null
      }
    }
  }, [nextTickAt, syncFromServer])

  return { ms, nextTickAt, serverNow }
}
