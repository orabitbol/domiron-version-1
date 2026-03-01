'use client'

import { usePlayer } from '@/lib/context/PlayerContext'

/**
 * Returns true when the game is in freeze mode (season ended or no active season).
 *
 * Matches server-side logic in lib/game/season.ts:
 *   frozen = no season with status='active' AND ends_at > now
 *
 * Used to disable action buttons across client pages.
 */
export function useFreeze(): boolean {
  const { season } = usePlayer()
  if (!season || season.status !== 'active') return true
  return new Date(season.ends_at).getTime() <= Date.now()
}
