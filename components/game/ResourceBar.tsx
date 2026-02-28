'use client'

import React, { useState, useEffect } from 'react'
import { cn, formatNumber, formatCountdown, getTimeUntilNextTick } from '@/lib/utils'
import { Crown, Trophy, Map, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePlayer } from '@/lib/context/PlayerContext'

// Navigation links displayed in the top bar
const TOP_NAV = [
  { href: '/rankings', icon: Trophy,   label: 'Rankings', labelHe: 'דירוג' },
  { href: '/map',      icon: Map,      label: 'Map',      labelHe: 'מפה' },
  { href: '/settings', icon: Settings, label: 'Settings', labelHe: 'הגדרות' },
]

// Mobile-only tick countdown (keeps its own timer)
function MobileTickCountdown() {
  const [ms, setMs] = useState<number | null>(null)

  useEffect(() => {
    setMs(getTimeUntilNextTick())
    const id = setInterval(() => setMs(getTimeUntilNextTick()), 1000)
    return () => clearInterval(id)
  }, [])

  return <span className="tabular-nums">{ms === null ? '--:--' : formatCountdown(ms)}</span>
}

export function ResourceBar() {
  const pathname = usePathname()
  const { player, resources } = usePlayer()

  return (
    <header
      className={cn(
        'fixed top-0 start-0 end-0 z-40',
        'h-header flex items-center px-3 md:px-5 gap-3',
        'bg-game-surface/90 backdrop-blur-game',
        'border-b border-game-border',
        'shadow-[0_2px_20px_rgba(0,0,0,0.5)]'
      )}
    >
      {/* Logo */}
      <Link
        href="/base"
        className="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity"
      >
        <Crown className="size-4 text-game-gold-bright" />
        <span className="font-display text-game-sm text-game-gold-bright uppercase tracking-widest">
          Domiron
        </span>
      </Link>

      {/* ── Mobile-only compact status strip ── */}
      <div className="md:hidden flex items-center gap-2 flex-1 overflow-x-auto scrollbar-none">
        {/* Gold */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs leading-none">🪙</span>
          <span className="font-body text-game-xs text-res-gold font-semibold tabular-nums">
            {formatNumber(resources?.gold ?? 0, true)}
          </span>
        </div>
        <span className="text-game-border-gold/60 text-game-xs shrink-0">·</span>
        {/* Turns */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs leading-none">⚡</span>
          <span className="font-body text-game-xs text-res-turns font-semibold tabular-nums">
            {player?.turns ?? 0}
          </span>
        </div>
        <span className="text-game-border-gold/60 text-game-xs shrink-0">·</span>
        {/* Tick */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs leading-none">⏱</span>
          <span className="font-body text-game-xs text-game-gold-bright font-semibold">
            <MobileTickCountdown />
          </span>
        </div>
      </div>

      {/* Spacer (desktop only) */}
      <div className="hidden md:flex flex-1" />

      {/* ── Top nav links ── */}
      <nav className="flex items-center gap-0.5 shrink-0">
        {TOP_NAV.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
                'font-heading text-[10px] uppercase tracking-wide',
                'transition-colors duration-150',
                isActive
                  ? 'bg-game-gold/15 text-game-gold-bright border border-game-border-gold/40'
                  : 'text-game-text-secondary hover:text-game-text hover:bg-game-elevated/60'
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
