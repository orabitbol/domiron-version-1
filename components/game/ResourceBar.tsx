'use client'

import React, { useState, useEffect, useRef } from 'react'
import { cn, formatNumber, formatCountdown, getTimeUntilNextTick } from '@/lib/utils'

interface ResourceBarProps {
  gold: number
  iron: number
  wood: number
  food: number
  turns: number
  maxTurns: number
  mana?: number
}

// Animate a number count up/down when value changes
function AnimatedNumber({ value, compact = false }: { value: number; compact?: boolean }) {
  const [displayed, setDisplayed] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const prev = prevRef.current
    if (prev === value) return
    prevRef.current = value

    const diff = value - prev
    const steps = 20
    const stepSize = diff / steps
    let step = 0

    const interval = setInterval(() => {
      step++
      setDisplayed(Math.round(prev + stepSize * step))
      if (step >= steps) {
        clearInterval(interval)
        setDisplayed(value)
      }
    }, 16)

    return () => clearInterval(interval)
  }, [value])

  return <span className="tabular-nums">{formatNumber(displayed, compact)}</span>
}

// Countdown timer to next tick
function TickCountdown() {
  const [ms, setMs] = useState<number | null>(null)

  useEffect(() => {
    setMs(getTimeUntilNextTick())
    const interval = setInterval(() => {
      setMs(getTimeUntilNextTick())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <span className="tabular-nums font-semibold text-res-turns">
      {ms === null ? '--:--' : formatCountdown(ms)}
    </span>
  )
}

interface ResourceItemProps {
  emoji: string
  label: string
  value: number
  color: string
  compact?: boolean
}

function ResourceItem({ emoji, label, value, color, compact }: ResourceItemProps) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      <span className="text-base leading-none">{emoji}</span>
      <span className={cn('font-semibold font-body text-game-sm', color)}>
        <AnimatedNumber value={value} compact={compact} />
      </span>
    </div>
  )
}

export function ResourceBar({ gold, iron, wood, food, turns, maxTurns, mana }: ResourceBarProps) {
  return (
    <header
      className={cn(
        'fixed top-0 start-0 end-0 z-40',
        'h-header flex items-center px-4 gap-4',
        'bg-game-surface border-b border-game-border',
        'shadow-lg'
      )}
    >
      {/* Resource icons */}
      <div className="flex items-center gap-4 flex-1 overflow-x-auto scrollbar-none">
        <ResourceItem emoji="🪙" label="Gold"  value={gold}  color="text-res-gold"  compact />
        <ResourceItem emoji="⚙️" label="Iron"  value={iron}  color="text-res-iron"  compact />
        <ResourceItem emoji="🪵" label="Wood"  value={wood}  color="text-res-wood"  compact />
        <ResourceItem emoji="🌾" label="Food"  value={food}  color="text-res-food"  compact />
        {mana !== undefined && (
          <ResourceItem emoji="🔮" label="Mana" value={mana} color="text-res-mana" />
        )}
      </div>

      {/* Separator */}
      <div className="h-6 w-px bg-game-border shrink-0" />

      {/* Turns */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-base leading-none">⚡</span>
        <span className="font-semibold font-body text-game-sm text-res-turns tabular-nums">
          {turns}
        </span>
        <span className="text-game-xs text-game-text-muted font-body">/{maxTurns}</span>
      </div>

      {/* Separator */}
      <div className="h-6 w-px bg-game-border shrink-0" />

      {/* Tick timer */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-game-xs text-game-text-muted font-body">Next:</span>
        <TickCountdown />
      </div>
    </header>
  )
}
