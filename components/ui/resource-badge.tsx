import * as React from 'react'
import { cn, formatNumber } from '@/lib/utils'
import type { ResourceType } from '@/types/game'

const RESOURCE_ICONS: Record<ResourceType, string> = {
  gold:  '🪙',
  iron:  '⚙️',
  wood:  '🪵',
  food:  '🌾',
  turns: '⚡',
  mana:  '🔮',
}

const RESOURCE_COLORS: Record<ResourceType, string> = {
  gold:  'text-res-gold',
  iron:  'text-res-iron',
  wood:  'text-res-wood',
  food:  'text-res-food',
  turns: 'text-res-turns',
  mana:  'text-res-mana',
}

const RESOURCE_BG: Record<ResourceType, string> = {
  gold:  'bg-res-gold/8',
  iron:  'bg-res-iron/8',
  wood:  'bg-res-wood/8',
  food:  'bg-res-food/8',
  turns: 'bg-res-turns/8',
  mana:  'bg-res-mana/8',
}

interface ResourceBadgeProps {
  type: ResourceType
  amount: number
  compact?: boolean
  className?: string
  showLabel?: boolean
}

export function ResourceBadge({ type, amount, compact = false, className, showLabel }: ResourceBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-body tabular-nums',
        'px-2 py-0.5 rounded-full',
        RESOURCE_BG[type],
        'border border-game-border/40',
        RESOURCE_COLORS[type],
        className
      )}
    >
      <span className="text-sm leading-none">{RESOURCE_ICONS[type]}</span>
      <span className="font-semibold">{formatNumber(amount, compact)}</span>
      {showLabel && (
        <span className="text-game-text-muted text-game-xs capitalize">{type}</span>
      )}
    </span>
  )
}
