'use client'

/**
 * GuideRestartButton — shown only when inside OnboardingProvider (auth users).
 * Guests get null because useOnboardingMaybe() returns null outside the provider.
 */

import React from 'react'
import { useOnboardingMaybe } from '@/components/onboarding/OnboardingProvider'

export function GuideRestartButton() {
  const ob = useOnboardingMaybe()
  if (!ob) return null

  return (
    <button
      onClick={ob.restart}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-game font-heading text-game-sm uppercase tracking-wide border transition-all duration-200"
      style={{
        background:   'rgba(201,144,26,0.08)',
        borderColor:  'rgba(201,144,26,0.3)',
        color:        'rgba(240,192,48,0.75)',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        el.style.background   = 'rgba(201,144,26,0.18)'
        el.style.borderColor  = 'rgba(201,144,26,0.55)'
        el.style.color        = 'rgba(240,192,48,1)'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.background   = 'rgba(201,144,26,0.08)'
        el.style.borderColor  = 'rgba(201,144,26,0.3)'
        el.style.color        = 'rgba(240,192,48,0.75)'
      }}
    >
      ↺ חזור לסיור
    </button>
  )
}
