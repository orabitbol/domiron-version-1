'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StatBox } from '@/components/ui/stat-box'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { Player, Army, Training, Resources } from '@/types/game'

interface Props {
  player: Player
  army: Army
  training: Training
  resources: Resources
}

const UNIT_LABELS: Record<string, string> = {
  soldier: 'Soldier',
  spy: 'Spy',
  scout: 'Scout',
  cavalry: 'Cavalry',
  farmer: 'Farmer',
}

const ADVANCED_LABELS: Record<string, string> = {
  attack: 'Attack Training',
  defense: 'Defense Training',
  spy: 'Spy Training',
  scout: 'Scout Training',
}

type BasicUnit = 'soldier' | 'spy' | 'scout' | 'cavalry' | 'farmer'
type AdvancedType = 'attack' | 'defense' | 'spy' | 'scout'

export function TrainingClient({ player: initialPlayer, army: initialArmy, training: initialTraining, resources: initialResources }: Props) {
  const { player: ctxPlayer, army: ctxArmy, training: ctxTraining, resources: ctxResources, refresh } = usePlayer()
  const player = ctxPlayer ?? initialPlayer
  const army = ctxArmy ?? initialArmy
  const training = ctxTraining ?? initialTraining
  const resources = ctxResources ?? initialResources

  const [amounts, setAmounts] = useState<Record<BasicUnit, string>>({
    soldier: '',
    spy: '',
    scout: '',
    cavalry: '',
    farmer: '',
  })
  const [loadingUnit, setLoadingUnit] = useState<string | null>(null)
  const [loadingAdv, setLoadingAdv] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const combatUnits = army.soldiers + army.spies + army.scouts
  const capacityPct = Math.min(100, Math.round((combatUnits / player.capacity) * 100))

  async function trainUnit(unit: BasicUnit) {
    const amt = parseInt(amounts[unit] || '0')
    if (!amt || amt <= 0) return
    setLoadingUnit(unit)
    setMessage(null)
    try {
      const res = await fetch('/api/training/basic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit, amount: amt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Training failed', type: 'error' })
      } else {
        setMessage({ text: `Trained ${formatNumber(amt)} ${UNIT_LABELS[unit]}(s)`, type: 'success' })
        setAmounts((prev) => ({ ...prev, [unit]: '' }))
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoadingUnit(null)
    }
  }

  async function upgradeAdvanced(type: AdvancedType) {
    setLoadingAdv(type)
    setMessage(null)
    try {
      const res = await fetch('/api/training/advanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Upgrade failed', type: 'error' })
      } else {
        setMessage({ text: `${ADVANCED_LABELS[type]} upgraded!`, type: 'success' })
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoadingAdv(null)
    }
  }

  const advCost = BALANCE.training.advanced.costPerLevel

  function canAffordUnit(unit: BasicUnit) {
    const amt = parseInt(amounts[unit] || '0')
    if (!amt) return false
    const costGold = BALANCE.training.units[unit].goldCost * amt
    return resources.gold >= costGold
  }

  function canAffordAdv(type: AdvancedType) {
    const level = training[`${type}_level` as keyof Training] as number
    const totalGold = advCost.gold * (level + 1)
    const totalFood = advCost.food * (level + 1)
    return resources.gold >= totalGold && resources.food >= totalFood
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-game-3xl text-game-gold-bright uppercase tracking-wide">
          Training Grounds
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          Train your army and upgrade combat skills
        </p>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`rounded border px-4 py-3 font-body text-game-sm ${
            message.type === 'success'
              ? 'bg-game-green/10 border-green-900 text-game-green-bright'
              : 'bg-game-red/10 border-red-900 text-game-red-bright'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Army Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatBox
          title="Current Army"
          color="red"
          stats={[
            { label: 'Soldiers',        value: army.soldiers },
            { label: 'Cavalry',         value: army.cavalry },
            { label: 'Spies',           value: army.spies },
            { label: 'Scouts',          value: army.scouts },
            { label: 'Slaves',          value: army.slaves },
            { label: 'Farmers',         value: army.farmers },
            { label: 'Free Population', value: army.free_population },
          ]}
        />
        <div className="bg-game-surface border border-game-border rounded-lg p-4 space-y-3">
          <h3 className="font-heading text-game-sm uppercase tracking-wider text-game-gold-bright">
            Capacity
          </h3>
          <div className="flex justify-between text-game-sm font-body text-game-text-secondary">
            <span>Combat Units</span>
            <span className="text-game-text-white font-semibold">
              {formatNumber(combatUnits)} / {formatNumber(player.capacity)}
            </span>
          </div>
          <div className="w-full bg-game-elevated rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all ${
                capacityPct >= 90
                  ? 'bg-game-red'
                  : capacityPct >= 70
                  ? 'bg-game-gold'
                  : 'bg-game-green'
              }`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
          <p className="text-game-xs text-game-text-muted font-body">
            {capacityPct}% capacity used
          </p>
          <div className="pt-2 border-t border-game-border space-y-1">
            <div className="flex justify-between text-game-sm font-body">
              <span className="text-game-text-secondary">Gold</span>
              <ResourceBadge type="gold" amount={resources.gold} />
            </div>
            <div className="flex justify-between text-game-sm font-body">
              <span className="text-game-text-secondary">Food</span>
              <ResourceBadge type="food" amount={resources.food} />
            </div>
          </div>
        </div>
      </div>

      {/* Basic Training */}
      <div className="bg-game-surface border border-game-border rounded-lg p-4">
        <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white mb-4">
          Basic Training
        </h2>
        <div className="space-y-4">
          {(['soldier', 'spy', 'scout', 'cavalry', 'farmer'] as BasicUnit[]).map((unit) => {
            const cfg = BALANCE.training.units[unit]
            const amt = parseInt(amounts[unit] || '0') || 0
            const totalCost = cfg.goldCost * amt
            return (
              <div
                key={unit}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-game-elevated border border-game-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                    {UNIT_LABELS[unit]}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-1 text-game-xs font-body text-game-text-muted">
                    <span>
                      Cost:{' '}
                      <span className="text-res-gold font-semibold">
                        {formatNumber(cfg.goldCost)} Gold
                      </span>
                      {' '}each
                    </span>
                    {unit === 'cavalry' && 'soldierRatio' in cfg && (
                      <Badge variant="default">1 per {(cfg as { goldCost: number; capacityCost: number; soldierRatio: number }).soldierRatio} soldiers</Badge>
                    )}
                    {cfg.capacityCost > 0 && (
                      <span>Capacity: {cfg.capacityCost}</span>
                    )}
                  </div>
                  {amt > 0 && (
                    <p className="text-game-xs font-body mt-1">
                      <span className="text-game-text-secondary">Total: </span>
                      <span className={resources.gold >= totalCost ? 'text-game-green-bright' : 'text-game-red-bright'}>
                        {formatNumber(totalCost)} Gold
                      </span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:w-52">
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={amounts[unit]}
                    min={1}
                    onChange={(e) => setAmounts((prev) => ({ ...prev, [unit]: e.target.value }))}
                    className="w-28"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={loadingUnit === unit}
                    disabled={!canAffordUnit(unit) || !!loadingUnit}
                    onClick={() => trainUnit(unit)}
                  >
                    Train
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Advanced Training */}
      <div className="bg-game-surface border border-game-border rounded-lg p-4">
        <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white mb-1">
          Advanced Training
        </h2>
        <p className="text-game-sm text-game-text-muted font-body mb-4">
          Each level costs {formatNumber(advCost.gold)} Gold +{' '}
          {formatNumber(advCost.food)} Food × (current level + 1). Adds{' '}
          {(BALANCE.training.advanced.multiplierPerLevel * 100).toFixed(0)}% power per level.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(['attack', 'defense', 'spy', 'scout'] as AdvancedType[]).map((type) => {
            const level = training[`${type}_level` as keyof Training] as number
            const nextLevelCostGold = advCost.gold * (level + 1)
            const nextLevelCostFood = advCost.food * (level + 1)
            const multiplier = (1 + level * BALANCE.training.advanced.multiplierPerLevel).toFixed(2)
            return (
              <div
                key={type}
                className="p-3 rounded-lg bg-game-elevated border border-game-border"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                      {ADVANCED_LABELS[type]}
                    </p>
                    <p className="text-game-xs text-game-text-secondary font-body mt-0.5">
                      Level {level} · ×{multiplier} power
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <ResourceBadge type="gold" amount={nextLevelCostGold} />
                      <ResourceBadge type="food" amount={nextLevelCostFood} />
                    </div>
                  </div>
                  <Button
                    variant="success"
                    size="sm"
                    loading={loadingAdv === type}
                    disabled={!canAffordAdv(type) || !!loadingAdv}
                    onClick={() => upgradeAdvanced(type)}
                  >
                    Upgrade
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
