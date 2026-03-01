import * as React from 'react'
import { cn, formatNumber } from '@/lib/utils'

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
  red:    { border: 'border-game-red/60',         accent: 'from-game-red-bright/20',   title: 'text-game-red-bright',    icon: 'text-game-red-bright' },
  blue:   { border: 'border-game-blue/60',        accent: 'from-game-blue-bright/20',  title: 'text-game-blue-bright',   icon: 'text-game-blue-bright' },
  green:  { border: 'border-game-green/60',       accent: 'from-game-green-bright/20', title: 'text-game-green-bright',  icon: 'text-game-green-bright' },
  purple: { border: 'border-game-purple/60',      accent: 'from-game-purple-bright/20',title: 'text-game-purple-bright', icon: 'text-game-purple-bright' },
  gold:   { border: 'border-game-border-gold',    accent: 'from-game-gold/15',         title: 'text-game-gold-bright',   icon: 'text-game-gold-bright' },
}

export function StatBox({ title, icon, color = 'gold', stats, className }: StatBoxProps) {
  const colors = colorMap[color]

  return (
    <div
      className={cn(
        'rounded-game-lg border bg-gradient-to-b to-game-surface p-4',
        colors.border,
        colors.accent,
        'shadow-[0_2px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.03)]',
        className
      )}
    >
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-game-border/50">
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
