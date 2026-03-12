'use client'

/**
 * components/onboarding/OnboardingTour.tsx
 *
 * The visual layer of the first-time player tour.
 * Renders a fixed, floating bottom-center panel via createPortal so it sits
 * above all game UI (sidebar, resource bar, modals) without affecting layout.
 *
 * Design deliberately mirrors the game's Modal component:
 *   - Same #1A1510 dark background
 *   - Same gold border + inset glow
 *   - Same font-heading titles
 * It feels native to the game, not like a generic onboarding widget.
 *
 * Reads state from OnboardingContext — this component is pure presentation.
 */

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { useOnboarding } from './OnboardingProvider'
import { ONBOARDING_STEPS } from '@/lib/onboarding/steps'

// ── Step icons (inline SVG, one per step id) ──────────────────────────────────

const STEP_ICONS: Record<string, React.ReactNode> = {
  welcome:  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
  base:     <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
  mine:     <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zm-7.518-.267A8.25 8.25 0 1120.25 10.5M8.288 14.212A5.25 5.25 0 1117.25 10.5" />,
  develop:  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />,
  training: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />,
  attack:   <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.773 4.773zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  bank:     <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />,
  tribe:    <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />,
  rankings: <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />,
  finish:   <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />,
}

function StepIcon({ id }: { id: string }) {
  const path = STEP_ICONS[id] ?? STEP_ICONS.welcome
  return (
    <svg
      className="w-5 h-5 text-[rgba(240,192,48,0.85)] shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      {path}
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function OnboardingTour() {
  const { isActive, stepIndex, total, goNext, goBack, skip } = useOnboarding()

  // Defer portal mount to after hydration — createPortal needs document.body.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!isActive || !mounted) return null

  const step    = ONBOARDING_STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast  = stepIndex === total - 1

  const panel = (
    <div
      // On mobile: sits above the bottom nav bar (≈56px) + safe area; on sm+ it's 24px from bottom.
      // Outer: positions the card, lets pointer events through underneath
      className="fixed bottom-[calc(3.75rem+env(safe-area-inset-bottom))] sm:bottom-6 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-3 sm:px-4 pointer-events-none"
      // Prevent the tour panel from picking up RTL from the page root
      dir="ltr"
    >
      <div
        className="pointer-events-auto rounded-xl overflow-hidden"
        style={{
          background:  '#1A1510',
          border:      '1px solid rgba(201,144,26,0.55)',
          boxShadow:   '0 0 0 1px rgba(201,144,26,0.15), 0 25px 50px -12px rgba(0,0,0,0.95), inset 0 1px 0 rgba(240,192,48,0.10)',
        }}
      >
        {/* ── Header: step dots + skip ───────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width:      i === stepIndex ? 16 : 8,
                  height:     8,
                  background: i === stepIndex
                    ? 'rgba(240,192,48,1)'
                    : i < stepIndex
                    ? 'rgba(201,144,26,0.45)'
                    : 'rgba(255,255,255,0.09)',
                }}
              />
            ))}
            <span
              className="ml-2 tabular-nums"
              style={{ fontSize: 11, color: 'rgba(201,144,26,0.55)' }}
            >
              {stepIndex + 1} / {total}
            </span>
          </div>

          {/* Skip — hidden on the last step */}
          {!isLast && (
            <button
              onClick={skip}
              className="transition-colors px-2 py-2 min-h-[44px] flex items-center"
              style={{
                fontSize:      11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color:         'rgba(201,144,26,0.45)',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(201,144,26,0.85)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(201,144,26,0.45)')}
            >
              דלג על הסיור
            </button>
          )}
        </div>

        {/* Gold divider */}
        <div
          className="mx-4"
          style={{
            height:     1,
            background: 'linear-gradient(to right, transparent, rgba(201,144,26,0.45), transparent)',
          }}
        />

        {/* ── Step content ──────────────────────────────────────────────── */}
        <div className="px-4 py-3.5">
          <div className="flex items-start gap-2.5 mb-2">
            <StepIcon id={step.id} />
            <h3
              className="font-heading uppercase tracking-wider leading-tight mt-0.5"
              style={{ fontSize: 15, color: 'rgba(240,192,48,0.95)' }}
            >
              {step.title}
            </h3>
          </div>
          <p
            className="leading-relaxed"
            style={{ fontSize: 13, color: 'rgba(220,200,160,0.88)', lineHeight: '1.6' }}
          >
            {step.body}
          </p>
        </div>

        {/* Gold divider */}
        <div
          className="mx-4"
          style={{
            height:     1,
            background: 'linear-gradient(to right, transparent, rgba(201,144,26,0.2), transparent)',
          }}
        />

        {/* ── Navigation ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 gap-3">
          <Button
            variant="ghost"
            size="md"
            onClick={goBack}
            disabled={isFirst}
            className="text-sm flex-shrink-0"
          >
            ← חזור
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={goNext}
            className="text-sm flex-1"
          >
            {isLast ? 'התחל לשחק →' : 'הבא →'}
          </Button>
        </div>
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
