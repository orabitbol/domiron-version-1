'use client'

import * as React from 'react'
import { Button } from './button'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils'

interface CostItem {
  gold?: number
  iron?: number
  wood?: number
  food?: number
}

interface UpgradeCardProps {
  title: string
  description?: string
  currentLevel: number
  maxLevel?: number
  cost: CostItem
  canAfford: boolean
  onUpgrade: () => void
  loading?: boolean
  className?: string
}

export function UpgradeCard({
  title,
  description,
  currentLevel,
  maxLevel,
  cost,
  canAfford,
  onUpgrade,
  loading,
  className,
}: UpgradeCardProps) {
  const isMaxed = maxLevel !== undefined && currentLevel >= maxLevel

  return (
    <div
      className={cn(
        'rounded-lg border border-game-border bg-game-surface p-4',
        'hover:border-game-border-gold transition-colors duration-150',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-heading text-game-base text-game-text-white uppercase tracking-wide truncate">
              {title}
            </h3>
            <span className="shrink-0 text-game-xs font-body text-game-text-secondary">
              Lvl {currentLevel}{maxLevel && ` / ${maxLevel}`}
            </span>
          </div>
          {description && (
            <p className="text-game-sm text-game-text-secondary font-body leading-snug">
              {description}
            </p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {cost.gold  !== undefined && cost.gold  > 0 && <CostPill label="Gold"  amount={cost.gold}  color="text-res-gold" />}
            {cost.iron  !== undefined && cost.iron  > 0 && <CostPill label="Iron"  amount={cost.iron}  color="text-res-iron" />}
            {cost.wood  !== undefined && cost.wood  > 0 && <CostPill label="Wood"  amount={cost.wood}  color="text-res-wood" />}
            {cost.food  !== undefined && cost.food  > 0 && <CostPill label="Food"  amount={cost.food}  color="text-res-food" />}
          </div>
        </div>
        <Button
          variant="success"
          size="sm"
          disabled={!canAfford || isMaxed}
          loading={loading}
          onClick={onUpgrade}
          className="shrink-0"
        >
          {isMaxed ? 'Max' : 'Upgrade'}
        </Button>
      </div>
    </div>
  )
}

function CostPill({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <span className="flex items-center gap-1 text-game-xs font-body bg-game-elevated rounded px-2 py-0.5">
      <span className={cn('font-semibold', color)}>{formatNumber(amount)}</span>
      <span className="text-game-text-muted">{label}</span>
    </span>
  )
}
