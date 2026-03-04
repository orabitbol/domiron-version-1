/**
 * Domiron — Supabase Realtime Event Handlers
 * Used in ToastSystem.tsx to subscribe to live events.
 */
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js'
import type { ToastType } from '@/types/game'

export interface GameToast {
  type: ToastType
  title: string
  message?: string
  duration: number
  navigateTo?: string
}

type ToastCallback = (toast: GameToast) => void

// Subscribe to all realtime events for a player
export function subscribeToPlayerEvents(
  supabase: SupabaseClient,
  playerId: string,
  tribeId: string | null,
  onToast: ToastCallback,
  onTickCompleted?: () => void,
): RealtimeChannel[] {
  const channels: RealtimeChannel[] = []

  // 1. Incoming attacks (defender)
  const attackChannel = supabase
    .channel(`attacks:defender:${playerId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'attacks',
        filter: `defender_id=eq.${playerId}`,
      },
      () => {
        onToast({
          type: 'attack',
          title: '⚔️ You\'re being attacked!',
          message: 'Check your battle history',
          duration: 8000,
          navigateTo: '/history',
        })
      }
    )
    .subscribe()
  channels.push(attackChannel)

  // 2. Resource updates (own resources)
  const resourceChannel = supabase
    .channel(`resources:${playerId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'resources',
        filter: `player_id=eq.${playerId}`,
      },
      () => {
        // Resource bar updates itself via the realtime subscription
        // No toast needed here — the UI reacts automatically
      }
    )
    .subscribe()
  channels.push(resourceChannel)

  // 3. Tribe spell activations (if in a tribe)
  if (tribeId) {
    const tribeChannel = supabase
      .channel(`tribe_spells:${tribeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tribe_spells',
          filter: `tribe_id=eq.${tribeId}`,
        },
        () => {
          onToast({
            type: 'magic',
            title: '✨ Tribe Spell Activated',
            message: 'A tribe spell is now active',
            duration: 5000,
          })
        }
      )
      .subscribe()
    channels.push(tribeChannel)

    // 4. Tribe kick (own membership deleted)
    const kickChannel = supabase
      .channel(`tribe_kick:${playerId}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'tribe_members',
          filter: `player_id=eq.${playerId}`,
        },
        () => {
          onToast({
            type: 'error',
            title: '⛔ Kicked from Tribe',
            message: 'You were removed from your tribe',
            duration: 8000,
          })
        }
      )
      .subscribe()
    channels.push(kickChannel)
  }

  // 5. Tick broadcast (all players)
  const tickChannel = supabase
    .channel('tick:broadcast')
    .on('broadcast', { event: 'tick_completed' }, () => {
      onTickCompleted?.()
      onToast({
        type: 'info',
        title: '⏱ Tick Completed',
        message: 'Resources and turns updated',
        duration: 4000,
      })
    })
    .subscribe()
  channels.push(tickChannel)

  return channels
}

// Unsubscribe from all channels
export async function unsubscribeAll(
  supabase: SupabaseClient,
  channels: RealtimeChannel[]
): Promise<void> {
  await Promise.all(channels.map(ch => supabase.removeChannel(ch)))
}

// Broadcast tick completed event (called from API route after tick)
export async function broadcastTickCompleted(supabase: SupabaseClient): Promise<void> {
  await supabase.channel('tick:broadcast').send({
    type: 'broadcast',
    event: 'tick_completed',
    payload: { timestamp: new Date().toISOString() },
  })
}
