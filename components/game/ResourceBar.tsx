'use client'

import React, { useState, useEffect } from 'react'
import { cn, formatNumber, formatCountdown } from '@/lib/utils'
import { useTickCountdownState } from '@/lib/context/TickContext'
import { useTranslations } from 'next-intl'
import { Crown, Trophy, Scroll } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePlayer } from '@/lib/context/PlayerContext'

// Reads from shared TickContext — always identical to the Sidebar countdown.
function MobileTickCountdown() {
  const { ms } = useTickCountdownState()
  return <span className="tabular-nums">{ms === null ? '--:--' : formatCountdown(ms)}</span>
}

// ─── Season countdown (desktop center, hydration-safe) ────────────────────────

function formatSeasonMs(ms: number, seasonEndedText: string): string {
  if (ms <= 0) return seasonEndedText
  const s   = Math.floor(ms / 1000)
  const d   = Math.floor(s / 86400)
  const h   = Math.floor((s % 86400) / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const hh  = String(h).padStart(2, '0')
  const mm  = String(m).padStart(2, '0')
  const ss  = String(sec).padStart(2, '0')
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`
}

function SeasonCountdown({ endsAt, seasonEndedText, seasonLabel }: { endsAt: string; seasonEndedText: string; seasonLabel: string }) {
  const [display, setDisplay] = useState<string | null>(null)

  useEffect(() => {
    function update() {
      setDisplay(formatSeasonMs(new Date(endsAt).getTime() - Date.now(), seasonEndedText))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [endsAt, seasonEndedText])

  // null on first render → avoid hydration mismatch
  if (display === null) return <div className="hidden md:flex flex-1" />

  const isEnded = display === seasonEndedText
  return (
    <div className="hidden md:flex flex-1 flex-col items-center gap-0.5 pointer-events-none select-none">
      <span className="font-heading text-[9px] uppercase tracking-widest text-game-text-muted">
        ⚔ {seasonLabel}
      </span>
      <span
        className={cn(
          'font-body text-game-xs tabular-nums font-semibold',
          isEnded
            ? 'text-red-400'
            : 'text-game-gold-bright drop-shadow-[0_0_6px_rgba(240,192,48,0.3)]',
        )}
      >
        {display}
      </span>
    </div>
  )
}

// ─── Mobile season badge ──────────────────────────────────────────────────────

function MobileSeasonCountdown({ endsAt, seasonEndedText }: { endsAt: string; seasonEndedText: string }) {
  const [display, setDisplay] = useState<string | null>(null)

  useEffect(() => {
    function update() {
      setDisplay(formatSeasonMs(new Date(endsAt).getTime() - Date.now(), seasonEndedText))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [endsAt, seasonEndedText])

  if (display === null) return null

  const isEnded = display === seasonEndedText
  return (
    <div className={cn(
      'flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full',
      isEnded ? 'bg-red-900/20' : 'bg-game-gold/8',
    )}>
      <span className="text-xs leading-none">⌛</span>
      <span className={cn(
        'font-body text-game-xs font-semibold tabular-nums',
        isEnded ? 'text-red-400' : 'text-game-gold-bright',
      )}>
        {display}
      </span>
    </div>
  )
}

// ─── ResourceBar ──────────────────────────────────────────────────────────────

export function ResourceBar() {
  const pathname = usePathname()
  const { player, resources, season } = usePlayer()
  const t = useTranslations()

  const TOP_NAV = [
    { href: '/rankings',   icon: Trophy, label: t('nav.rankings')    },
    { href: '/halloffame', icon: Scroll, label: t('nav.halloffame')  },
  ]

  const seasonEndedText = t('season.ended')
  const seasonLabel = t('season.label')

  return (
    <header
      className={cn(
        'fixed top-0 start-0 end-0 z-40',
        'h-header flex items-center px-3 md:px-5 gap-3',
        'bg-gradient-to-b from-game-surface/95 to-game-surface/90',
        'backdrop-blur-game',
        'border-b border-game-border-gold/30',
        'shadow-[0_2px_24px_rgba(0,0,0,0.6),inset_0_-1px_0_rgba(201,144,26,0.08)]'
      )}
    >
      {/* Logo */}
      <Link
        href="/base"
        className="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity"
      >
        <Crown className="size-4 text-game-gold-bright drop-shadow-[0_0_6px_rgba(240,192,48,0.4)]" />
        <span className="font-display text-game-sm text-game-gold-bright uppercase tracking-widest text-title-glow">
          Domiron
        </span>
      </Link>

      {/* Mobile compact status strip */}
      <div className="md:hidden flex items-center gap-2.5 flex-1 overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full bg-res-gold/8">
          <img src="/icons/gold.png" alt="" aria-hidden style={{ width: 36, height: 36, objectFit: 'contain', verticalAlign: 'middle', flexShrink: 0 }} />
          <span className="font-body text-game-xs text-res-gold font-semibold tabular-nums">
            {formatNumber(resources?.gold ?? 0, true)}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full bg-res-turns/8">
          <span className="text-xs leading-none">⚡</span>
          <span className="font-body text-game-xs text-res-turns font-semibold tabular-nums">
            {player?.turns ?? 0}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full bg-game-gold/8">
          <span className="text-xs leading-none">⏱</span>
          <span className="font-body text-game-xs text-game-gold-bright font-semibold">
            <MobileTickCountdown />
          </span>
        </div>
        {season?.ends_at && <MobileSeasonCountdown endsAt={season.ends_at} seasonEndedText={seasonEndedText} />}
      </div>

      {/* Desktop: centered season countdown (replaces empty flex-1 spacer) */}
      {season?.ends_at
        ? <SeasonCountdown endsAt={season.ends_at} seasonEndedText={seasonEndedText} seasonLabel={seasonLabel} />
        : <div className="hidden md:flex flex-1" />
      }

      {/* Top nav links — Rankings + Hall of Fame */}
      <nav className="flex items-center gap-1 shrink-0">
        {TOP_NAV.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-game',
                'font-heading text-[10px] uppercase tracking-wide',
                'transition-all duration-200 border',
                isActive
                  ? [
                      'bg-gradient-to-b from-game-gold/15 to-game-gold/5',
                      'text-game-gold-bright border-game-border-gold/40',
                      'shadow-gold-glow-sm',
                    ]
                  : 'text-game-text-secondary hover:text-game-text hover:bg-game-elevated/50 border-transparent'
              )}
            >
              <Icon className={cn('size-3.5 shrink-0', isActive && 'drop-shadow-[0_0_4px_rgba(240,192,48,0.4)]')} />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          )
        })}
      </nav>

    </header>
  )
}
