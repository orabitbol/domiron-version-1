'use client'

/**
 * RealtimeSync — wires Supabase Realtime subscriptions for the current player.
 *
 * Mounted once inside GameLayout (inside PlayerProvider + ToastProvider).
 * On tick_completed:  calls refresh() so Sidebar / ResourceBar show updated
 *                     turns and resources without a full page reload.
 * On other events:    fires the appropriate toast.
 *
 * Unmounts cleanly on navigation (channels are removed in useEffect cleanup).
 */

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { subscribeToPlayerEvents, unsubscribeAll } from '@/lib/game/realtime'
import { usePlayer } from '@/lib/context/PlayerContext'
import { useToast } from '@/components/game/ToastSystem'

export function RealtimeSync() {
  const { player, tribe, refresh } = usePlayer()
  const { addToast } = useToast()

  useEffect(() => {
    const supabase = createClient()
    const tribeId = tribe?.id ?? null

    const channels = subscribeToPlayerEvents(
      supabase,
      player.id,
      tribeId,
      addToast,
      refresh,   // called on tick_completed — updates turns + resources in UI
    )

    return () => {
      unsubscribeAll(supabase, channels).catch(console.error)
    }
  // Re-subscribe only if the player or tribe changes (login / tribe join / leave).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id, tribe?.id])

  return null
}
