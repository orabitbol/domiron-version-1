'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  max?: number
  color?: 'gold' | 'red' | 'green' | 'purple' | 'blue' | 'mana'
  label?: string
  showValue?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ProgressBar({
  value,
  max = 100,
  color = 'gold',
  label,
  showValue = false,
  size = 'md',
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  }

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span className="text-game-xs font-heading text-game-text-secondary uppercase tracking-wider">
              {label}
            </span>
          )}
          {showValue && (
            <span className="text-game-xs font-body text-game-text-secondary tabular-nums">
              {value} / {max}
            </span>
          )}
        </div>
      )}
      <div className={cn('progress-bar', sizeClasses[size])}>
        <div
          className={cn('progress-fill', `progress-fill-${color}`)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
