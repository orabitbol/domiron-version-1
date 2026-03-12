'use client'

import * as React from 'react'
import { Button } from './button'
import { cn, formatNumber } from '@/lib/utils'

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
  const progress = maxLevel ? (currentLevel / maxLevel) * 100 : 0

  return (
    <div
      className={cn(
        'panel-ornate p-4 transition-all duration-200',
        canAfford && !isMaxed && 'hover:shadow-[0_6px_40px_rgba(0,0,0,0.7),0_0_12px_rgba(201,144,26,0.15),inset_0_1px_0_rgba(240,192,48,0.1)]',
        isMaxed && 'opacity-60',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-heading text-game-base text-game-text-white uppercase tracking-wide truncate">
              {title}
            </h3>
            <span className="shrink-0 text-game-xs font-heading text-game-gold uppercase">
              רמה {currentLevel}{maxLevel && ` / ${maxLevel}`}
            </span>
          </div>

          {maxLevel && (
            <div className="progress-bar h-1.5 mb-2">
              <div
                className="progress-fill progress-fill-gold"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {description && (
            <p className="text-game-sm text-game-text-secondary font-body leading-snug mb-2">
              {description}
            </p>
          )}

          {!isMaxed && (
            <div className="flex flex-wrap gap-2 mt-2">
              {cost.gold  !== undefined && cost.gold  > 0 && <CostPill label="זהב"   amount={cost.gold}  color="text-res-gold"  affordable={canAfford} />}
              {cost.iron  !== undefined && cost.iron  > 0 && <CostPill label="ברזל"  amount={cost.iron}  color="text-res-iron"  affordable={canAfford} />}
              {cost.wood  !== undefined && cost.wood  > 0 && <CostPill label="עץ"    amount={cost.wood}  color="text-res-wood"  affordable={canAfford} />}
              {cost.food  !== undefined && cost.food  > 0 && <CostPill label="מזון"  amount={cost.food}  color="text-res-food"  affordable={canAfford} />}
            </div>
          )}
        </div>
        <Button
          variant="success"
          size="sm"
          disabled={!canAfford || isMaxed}
          loading={loading}
          onClick={onUpgrade}
          className="shrink-0"
        >
          {isMaxed ? 'מקס' : 'שדרג'}
        </Button>
      </div>
    </div>
  )
}

function CostPill({ label, amount, color, affordable }: { label: string; amount: number; color: string; affordable: boolean }) {
  return (
    <span className={cn(
      'flex items-center gap-1 text-game-xs font-body rounded-full px-2.5 py-0.5',
      'bg-game-bg/60 border border-game-border/60',
      !affordable && 'opacity-60'
    )}>
      <span className={cn('font-semibold', color)}>{formatNumber(amount)}</span>
      <span className="text-game-text-muted">{label}</span>
    </span>
  )
}
