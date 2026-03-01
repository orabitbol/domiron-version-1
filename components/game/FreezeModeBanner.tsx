'use client'

import { useFreeze } from '@/lib/hooks/useFreeze'

/**
 * Fixed banner shown when the game is in freeze mode (season ended).
 * Positioned just below the top header (top-header).
 * Allows navigation but signals that all write actions are blocked.
 */
export function FreezeModeBanner() {
  const isFrozen = useFreeze()
  if (!isFrozen) return null

  return (
    <div
      className="fixed top-header z-30 inset-x-0 py-1.5 px-4 text-center"
      style={{ background: 'rgba(69,10,10,0.92)', borderBottom: '1px solid rgba(185,28,28,0.5)' }}
    >
      <p className="font-heading text-[11px] uppercase tracking-widest text-red-300">
        ❄ Season Ended — Freeze Mode · Browse freely, all actions are locked
      </p>
    </div>
  )
}
