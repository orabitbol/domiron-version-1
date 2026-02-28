import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils'
import type { ResourceType } from '@/types/game'

// Unicode/emoji icons for resources (no SVG file needed)
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
        'inline-flex items-center gap-1 font-body tabular-nums',
        RESOURCE_COLORS[type],
        className
      )}
    >
      <span className="text-base leading-none">{RESOURCE_ICONS[type]}</span>
      <span className="font-semibold">{formatNumber(amount, compact)}</span>
      {showLabel && (
        <span className="text-game-text-muted text-game-xs capitalize">{type}</span>
      )}
    </span>
  )
}
