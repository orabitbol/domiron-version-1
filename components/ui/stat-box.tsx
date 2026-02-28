import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils'

interface StatItem {
  label: string
  value: string | number
}

interface StatBoxProps {
  title: string
  icon?: React.ReactNode
  color?: 'red' | 'blue' | 'green' | 'purple' | 'gold'
  stats: StatItem[]
  className?: string
}

const colorMap = {
  red:    { border: 'border-game-red',      title: 'text-game-red-bright',     icon: 'text-game-red-bright' },
  blue:   { border: 'border-game-blue',     title: 'text-blue-400',            icon: 'text-blue-400' },
  green:  { border: 'border-game-green',    title: 'text-game-green-bright',   icon: 'text-game-green-bright' },
  purple: { border: 'border-game-purple',   title: 'text-game-purple-bright',  icon: 'text-game-purple-bright' },
  gold:   { border: 'border-game-border-gold', title: 'text-game-gold-bright', icon: 'text-game-gold-bright' },
}

export function StatBox({ title, icon, color = 'gold', stats, className }: StatBoxProps) {
  const colors = colorMap[color]

  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-game-surface p-4',
        colors.border,
        className
      )}
    >
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-game-border">
        {icon && <span className={cn('size-5', colors.icon)}>{icon}</span>}
        <h3 className={cn('font-heading text-game-sm uppercase tracking-wider', colors.title)}>
          {title}
        </h3>
      </div>
      <dl className="space-y-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex justify-between items-center gap-2">
            <dt className="text-game-sm text-game-text-secondary font-body">{stat.label}</dt>
            <dd className="text-game-sm text-game-text-white font-body font-semibold tabular-nums">
              {typeof stat.value === 'number' ? formatNumber(stat.value) : stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
