'use client'

import React, { useState, useEffect } from 'react'
import { cn, formatNumber, formatCountdown, getTimeUntilNextTick } from '@/lib/utils'
import { Crown, Trophy, Map, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePlayer } from '@/lib/context/PlayerContext'

const TOP_NAV = [
  { href: '/rankings', icon: Trophy,   label: 'Rankings', labelHe: 'דירוג' },
  { href: '/map',      icon: Map,      label: 'Map',      labelHe: 'מפה' },
  { href: '/settings', icon: Settings, label: 'Settings', labelHe: 'הגדרות' },
]

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
          <span className="text-xs leading-none">🪙</span>
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
      </div>

      <div className="hidden md:flex flex-1" />

      {/* Top nav links */}
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
