'use client'

/**
 * components/onboarding/OnboardingProvider.tsx
 *
 * Manages the first-time player tour lifecycle:
 *   - Shows the tour once per player (has_completed_onboarding = false in DB)
 *   - Never shows to admin accounts
 *   - Persists the current step index in localStorage so a page refresh
 *     during the tour resumes where the player left off
 *   - Navigates to each step's target route on Next / Back
 *   - Marks the tour complete in the DB on Finish or Skip
 *
 * Consumed by:
 *   - OnboardingTour — renders the floating panel
 *   - Guide page — exposes restart() for the "Replay Tour" button
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { usePlayer } from '@/lib/context/PlayerContext'
import { ONBOARDING_STEPS } from '@/lib/onboarding/steps'

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_KEY = 'domiron_onboarding_step'

// ── Context ───────────────────────────────────────────────────────────────────

export interface OnboardingContextValue {
  isActive:  boolean
  stepIndex: number
  total:     number
  goNext:    () => void
  goBack:    () => void
  skip:      () => void
  restart:   () => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider')
  return ctx
}

// ── localStorage helpers ──────────────────────────────────────────────────────

function readStoredStep(): number {
  if (typeof window === 'undefined') return 0
  const raw = localStorage.getItem(LS_KEY)
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 && n < ONBOARDING_STEPS.length ? n : 0
}

function saveStep(index: number): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(LS_KEY, String(index))
}

function clearStep(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(LS_KEY)
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { player, refresh } = usePlayer()
  const router   = useRouter()
  const pathname = usePathname()

  const [isActive,  setIsActive]  = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  // Guards against double-invocation in React strict-mode and hot-reload.
  const initialized = useRef(false)

  // Show for new players only — admins never see the tour.
  const shouldShow = !player.has_completed_onboarding && player.role !== 'admin'

  // ── Mount: restore state and start tour if needed ─────────────────────────
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    if (!shouldShow) return

    const saved = readStoredStep()
    setStepIndex(saved)
    setIsActive(true)

    // Navigate to the saved step's page if we're not already there.
    const route = ONBOARDING_STEPS[saved].route
    if (route && route !== pathname) {
      router.push(route)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // Intentionally empty: this must only run once on mount.

  // ── Mark tour complete in DB + clean up ───────────────────────────────────
  const markComplete = useCallback(async () => {
    setIsActive(false)
    clearStep()
    try {
      await fetch('/api/onboarding/complete', { method: 'POST' })
      // Sync PlayerContext so has_completed_onboarding flips to true in memory.
      refresh()
    } catch {
      // Non-fatal — the DB state will sync correctly on the next page load.
    }
  }, [refresh])

  // ── Navigation ────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    const next = stepIndex + 1

    // Last step → finish the tour.
    if (next >= ONBOARDING_STEPS.length) {
      markComplete()
      return
    }

    setStepIndex(next)
    saveStep(next)

    const route = ONBOARDING_STEPS[next].route
    if (route && route !== pathname) {
      router.push(route)
    }
  }, [stepIndex, pathname, router, markComplete])

  const goBack = useCallback(() => {
    if (stepIndex <= 0) return

    const prev = stepIndex - 1
    setStepIndex(prev)
    saveStep(prev)

    const route = ONBOARDING_STEPS[prev].route
    if (route && route !== pathname) {
      router.push(route)
    }
  }, [stepIndex, pathname, router])

  // skip = finish the tour immediately without visiting remaining steps.
  const skip = markComplete

  // restart = reset to step 0 and re-open the panel.
  const restart = useCallback(() => {
    saveStep(0)
    setStepIndex(0)
    setIsActive(true)

    const route = ONBOARDING_STEPS[0].route
    if (route && route !== pathname) {
      router.push(route)
    }
  }, [pathname, router])

  // ── Context value ─────────────────────────────────────────────────────────

  return (
    <OnboardingContext.Provider
      value={{ isActive, stepIndex, total: ONBOARDING_STEPS.length, goNext, goBack, skip, restart }}
    >
      {children}
    </OnboardingContext.Provider>
  )
}
