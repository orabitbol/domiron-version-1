/**
 * useTickCountdown — server-authoritative tick countdown hook.
 *
 * Source of truth: `world_state.next_tick_at` exposed by GET /api/tick-status.
 * All players see the identical countdown because it counts down from the
 * same server timestamp, not from the local wall-clock.
 *
 * Update paths:
 *   1. On mount:       fetch /api/tick-status → set nextTickAt
 *   2. On tick event:  window "domiron:tick-completed" (dispatched by RealtimeSync
 *                      from the Supabase Realtime broadcast payload) → update nextTickAt
 *   3. Heartbeat:      re-sync every 5 minutes to correct any clock drift
 *   4. Overdue poll:   when ms reaches 0, poll every 5 s until next_tick_at
 *                      advances (tick ran + world_state updated)
 *   5. Fallback:       if /api/tick-status fails, getTimeUntilNextTick() is used
 *                      as a local-clock estimate until the next successful sync
 *
 * Returned values:
 *   ms          — milliseconds until next tick (0 while overdue, null before first sync)
 *   nextTickAt  — raw ISO string from server (null before first sync)
 *   serverNow   — server's current time from last sync (null before first sync)
 */
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getTimeUntilNextTick } from '@/lib/utils'

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
        if (process.env.NODE_ENV === 'development') {
          const d    = data.next_tick_at ? new Date(data.next_tick_at) : null
          const diff = d ? d.getTime() - Date.now() : null
          console.log('[useTickCountdown] server_now', data.server_now)
          console.log('[useTickCountdown] next_tick_at', data.next_tick_at)
          console.log('[useTickCountdown] diff ms', diff, diff !== null ? (diff > 0 ? 'FUTURE ✓' : 'PAST ✗') : '—')
        }
        if (data.next_tick_at) setNextTickAt(data.next_tick_at)
        if (data.server_now)   setServerNow(data.server_now)
      })
      .catch(() => { /* fallback to local clock via null nextTickAt */ })
  }, [])

  // Mount: initial fetch + heartbeat every 5 minutes
  useEffect(() => {
    syncFromServer()
    const heartbeat = setInterval(syncFromServer, 5 * 60 * 1000)
    return () => clearInterval(heartbeat)
  }, [syncFromServer])

  // Listen for tick_completed window event dispatched by RealtimeSync
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ next_tick_at: string }>).detail
      if (detail?.next_tick_at) {
        setNextTickAt(detail.next_tick_at)
        // Stop any overdue poller — a fresh next_tick_at just arrived
        if (overduePollerRef.current) {
          clearInterval(overduePollerRef.current)
          overduePollerRef.current = null
        }
      }
    }
    window.addEventListener('domiron:tick-completed', handler)
    return () => window.removeEventListener('domiron:tick-completed', handler)
  }, [])

  // Count down every second; when overdue, start polling every 5 s
  useEffect(() => {
    const compute = () =>
      nextTickAt
        ? new Date(nextTickAt).getTime() - Date.now()
        : getTimeUntilNextTick()

    const tick = () => {
      const raw = compute()
      setMs(Math.max(0, raw))

      if (raw <= 0 && !overduePollerRef.current) {
        // Tick is overdue — poll server every 5 s until next_tick_at advances
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
