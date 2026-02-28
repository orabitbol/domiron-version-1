'use client'

import React, { useState, useEffect, useRef } from 'react'
import { cn, formatNumber, formatCountdown, getTimeUntilNextTick } from '@/lib/utils'
import { Crown } from 'lucide-react'
import Link from 'next/link'

interface ResourceBarProps {
  gold: number
  iron: number
  wood: number
  food: number
  turns: number
  maxTurns: number
  mana?: number
}

function AnimatedNumber({ value, compact = false }: { value: number; compact?: boolean }) {
  const [displayed, setDisplayed] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const prev = prevRef.current
    if (prev === value) return
    prevRef.current = value
    const diff = value - prev
    const steps = 18
    const stepSize = diff / steps
    let step = 0
    const interval = setInterval(() => {
      step++
      setDisplayed(Math.round(prev + stepSize * step))
      if (step >= steps) { clearInterval(interval); setDisplayed(value) }
    }, 16)
    return () => clearInterval(interval)
  }, [value])

  return <span className="tabular-nums">{formatNumber(displayed, compact)}</span>
}

function TickCountdown() {
  const [ms, setMs] = useState<number | null>(null)

  useEffect(() => {
    setMs(getTimeUntilNextTick())
    const id = setInterval(() => setMs(getTimeUntilNextTick()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="tabular-nums font-semibold text-game-gold-bright">
      {ms === null ? '--:--' : formatCountdown(ms)}
    </span>
  )
}

interface ResourceItemProps {
  emoji: string
  label: string
  value: number
  color: string
}

function ResourceItem({ emoji, label, value, color }: ResourceItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md',
        'bg-game-elevated/60 border border-game-border/60',
        'hover:border-game-border-gold/50 transition-colors duration-150'
      )}
      title={label}
    >
      <span className="text-sm leading-none select-none">{emoji}</span>
      <span className={cn('font-semibold font-body text-game-sm tabular-nums', color)}>
        <AnimatedNumber value={value} compact />
      </span>
    </div>
  )
}

export function ResourceBar({ gold, iron, wood, food, turns, maxTurns, mana }: ResourceBarProps) {
  return (
    <header
      className={cn(
        'fixed top-0 start-0 end-0 z-40',
        'h-header flex items-center px-3 md:px-5 gap-2',
        'bg-game-surface/90 backdrop-blur-game',
        'border-b border-game-border',
        'shadow-[0_2px_20px_rgba(0,0,0,0.5)]'
      )}
    >
      {/* Logo (desktop only) */}
      <Link
        href="/base"
        className="hidden md:flex items-center gap-1.5 shrink-0 me-3 hover:opacity-80 transition-opacity"
      >
        <Crown className="size-4 text-game-gold-bright" />
        <span className="font-display text-game-sm text-game-gold-bright uppercase tracking-widest">
          Domiron
        </span>
      </Link>

      {/* Thin gold separator */}
      <div className="hidden md:block h-5 w-px bg-game-border-gold/30 shrink-0" />

      {/* Resources */}
      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-none">
        <ResourceItem emoji="🪙" label="זהב"   value={gold}  color="text-res-gold" />
        <ResourceItem emoji="⚙️" label="ברזל"  value={iron}  color="text-res-iron" />
        <ResourceItem emoji="🪵" label="עץ"    value={wood}  color="text-res-wood" />
        <ResourceItem emoji="🌾" label="מזון"  value={food}  color="text-res-food" />
        {mana !== undefined && (
          <ResourceItem emoji="🔮" label="מאנה" value={mana}  color="text-res-mana" />
        )}
      </div>

      {/* Turns */}
      <div
        className={cn(
          'flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-md',
          'bg-game-elevated/60 border border-game-border/60'
        )}
      >
        <span className="text-sm leading-none">⚡</span>
        <span className="font-semibold font-body text-game-sm text-res-turns tabular-nums">
          {turns}
        </span>
        <span className="text-game-xs text-game-text-muted font-body">/{maxTurns}</span>
      </div>

      {/* Gold separator */}
      <div className="h-5 w-px bg-game-border-gold/30 shrink-0" />

      {/* Tick timer */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-game-xs text-game-text-muted font-body hidden sm:inline">⏱</span>
        <TickCountdown />
      </div>
    </header>
  )
}
