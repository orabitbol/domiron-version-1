'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StatBox } from '@/components/ui/stat-box'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { Tabs } from '@/components/ui/tabs'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import { useFreeze } from '@/lib/hooks/useFreeze'
import type { Player, Army, Training, Resources } from '@/types/game'

interface Props {
  player: Player
  army: Army
  training: Training
  resources: Resources
}

type BasicUnit = 'soldier' | 'slave' | 'spy' | 'scout' | 'cavalry' | 'farmer'
type UntrainUnit = 'soldier' | 'spy' | 'scout' | 'farmer'
type AdvancedType = 'attack' | 'defense' | 'spy' | 'scout'

const UNIT_LABELS: Record<BasicUnit, string> = {
  soldier: 'Soldier',
  slave:   'Slave',
  spy:     'Spy',
  scout:   'Scout',
  cavalry: 'Cavalry',
  farmer:  'Farmer',
}

const UNTRAIN_LABELS: Record<UntrainUnit, string> = {
  soldier: 'Soldiers',
  spy:     'Spies',
  scout:   'Scouts',
  farmer:  'Farmers',
}

const ADVANCED_LABELS: Record<AdvancedType, string> = {
  attack:  'Attack Training',
  defense: 'Defense Training',
  spy:     'Spy Training',
  scout:   'Scout Training',
}

const TRAIN_TABS = [
  { key: 'train',    label: 'Train Units' },
  { key: 'untrain',  label: 'Untrain' },
  { key: 'advanced', label: 'Advanced Training' },
]

export function TrainingClient({
  player:    initialPlayer,
  army:      initialArmy,
  training:  initialTraining,
  resources: initialResources,
}: Props) {
  const { player: ctxPlayer, army: ctxArmy, training: ctxTraining, resources: ctxResources, refresh } = usePlayer()
  const isFrozen = useFreeze()

  // Prefer context (kept fresh by refresh()) but fall back to SSR props on first render
  const player   = ctxPlayer   ?? initialPlayer
  const training = ctxTraining ?? initialTraining

  // Local army/resources state that we update immediately from API responses
  const [army,      setArmy]      = useState<Army>(ctxArmy      ?? initialArmy)
  const [resources, setResources] = useState<Resources>(ctxResources ?? initialResources)

  const [activeTab,   setActiveTab]   = useState('train')
  const [trainAmts,   setTrainAmts]   = useState<Record<BasicUnit, string>>({
    soldier: '', slave: '', spy: '', scout: '', cavalry: '', farmer: '',
  })
  const [untrainAmts, setUntrainAmts] = useState<Record<UntrainUnit, string>>({
    soldier: '', spy: '', scout: '', farmer: '',
  })
  const [loadingUnit, setLoadingUnit] = useState<string | null>(null)
  const [loadingAdv,  setLoadingAdv]  = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const combatUnits = army.soldiers + army.spies + army.scouts
  const capacityPct = Math.min(100, Math.round((combatUnits / player.capacity) * 100))

  // ── Train ─────────────────────────────────────────────────────────────────

  async function trainUnit(unit: BasicUnit) {
    const amt = parseInt(trainAmts[unit] || '0')
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
        setTrainAmts((prev) => ({ ...prev, [unit]: '' }))
        // Immediate state update from API response — no wait for refresh()
        if (data.data?.army)      setArmy(data.data.army)
        if (data.data?.resources) setResources(data.data.resources)
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoadingUnit(null)
    }
  }

  // ── Untrain ───────────────────────────────────────────────────────────────

  async function untrainUnit(unit: UntrainUnit) {
    const amt = parseInt(untrainAmts[unit] || '0')
    if (!amt || amt <= 0) return
    setLoadingUnit(`untrain_${unit}`)
    setMessage(null)
    try {
      const res = await fetch('/api/training/untrain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit, amount: amt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Untrain failed', type: 'error' })
      } else {
        setMessage({
          text: `${formatNumber(amt)} ${UNTRAIN_LABELS[unit]} returned to free population`,
          type: 'success',
        })
        setUntrainAmts((prev) => ({ ...prev, [unit]: '' }))
        if (data.data?.army) setArmy(data.data.army)
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoadingUnit(null)
    }
  }

  // ── Advanced ──────────────────────────────────────────────────────────────

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
        if (data.data?.resources) setResources(data.data.resources)
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoadingAdv(null)
    }
  }

  // ── Cost helpers ──────────────────────────────────────────────────────────

  function unitCost(unit: BasicUnit) {
    return BALANCE.training.unitCost[unit as keyof typeof BALANCE.training.unitCost]
  }

  function canAffordTrain(unit: BasicUnit) {
    const amt = parseInt(trainAmts[unit] || '0')
    if (!amt) return false
    const goldCost = unitCost(unit).gold * amt
    if (resources.gold < goldCost) return false
    // Cavalry: requires soldiers, no free pop
    if (unit === 'cavalry') {
      const cavCfg = unitCost(unit) as { gold: number; capacityCost: number; soldierRatio: number }
      return army.soldiers >= amt * cavCfg.soldierRatio
    }
    // All others: requires free population
    return army.free_population >= amt
  }

  function canAffordAdv(type: AdvancedType) {
    const level = training[`${type}_level` as keyof Training] as number
    const cost = BALANCE.training.advancedCost
    return resources.gold >= cost.gold * (level + 1) && resources.food >= cost.food * (level + 1)
  }

  function untrainableCount(unit: UntrainUnit): number {
    if (unit === 'spy')    return army.spies
    if (unit === 'scout')  return army.scouts
    if (unit === 'farmer') return army.farmers
    return army.soldiers
  }

  function canUntrain(unit: UntrainUnit): boolean {
    const amt = parseInt(untrainAmts[unit] || '0')
    if (!amt || amt <= 0) return false
    return untrainableCount(unit) >= amt
  }

  const advCost = BALANCE.training.advancedCost

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
          Training Grounds
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          Train your army and upgrade combat skills
        </p>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`rounded-game-lg border px-4 py-3 font-body text-game-sm ${
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
            { label: 'Soldiers',          value: army.soldiers },
            { label: 'Cavalry',           value: army.cavalry },
            { label: 'Spies',             value: army.spies },
            { label: 'Scouts',            value: army.scouts },
            { label: 'Slaves (workers)',  value: army.slaves },
            { label: 'Farmers',           value: army.farmers },
            { label: 'Free Population',   value: army.free_population },
          ]}
        />
        <div className="space-y-4">
          {/* Capacity */}
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-4 space-y-3 shadow-emboss">
            <h3 className="font-heading text-game-sm uppercase tracking-wider text-game-gold">
              Capacity
            </h3>
            <div className="flex justify-between text-game-sm font-body text-game-text-secondary">
              <span>Combat Units</span>
              <span className="text-game-text-white font-semibold">
                {formatNumber(combatUnits)} / {formatNumber(player.capacity)}
              </span>
            </div>
            <div className="progress-bar">
              <div
                className={`progress-fill ${
                  capacityPct >= 90 ? 'progress-fill-red' : capacityPct >= 70 ? 'progress-fill-gold' : 'progress-fill-green'
                }`}
                style={{ width: `${capacityPct}%` }}
              />
            </div>
            <p className="text-game-xs text-game-text-muted font-body">{capacityPct}% capacity used</p>
          </div>

          {/* Available Population + Slaves panel */}
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-4 space-y-2 shadow-emboss">
            <h3 className="font-heading text-game-sm uppercase tracking-wider text-game-gold">
              Workforce
            </h3>
            <div className="space-y-1 text-game-sm font-body">
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Free Population</span>
                <span className="text-game-text-white font-semibold">{formatNumber(army.free_population)}</span>
              </div>
              <p className="text-game-xs text-game-text-muted">
                Each unit trained costs 1 free population (except cavalry).
              </p>
              <div className="divider-ornate my-1" />
              <div className="flex justify-between pt-1">
                <span className="text-game-text-secondary">Slaves</span>
                <span className="text-game-text-white font-semibold">{formatNumber(army.slaves)}</span>
              </div>
              <p className="text-game-xs text-game-text-muted">
                Slaves work mines and produce resources per tick.
                Captured from combat or trained from free population.
              </p>
            </div>
          </div>

          {/* Resources */}
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 space-y-2 shadow-engrave">
            <div className="flex justify-between text-game-sm font-body">
              <span className="text-game-text-secondary font-heading">Gold</span>
              <ResourceBadge type="gold" amount={resources.gold} />
            </div>
            <div className="divider-ornate" />
            <div className="flex justify-between text-game-sm font-body">
              <span className="text-game-text-secondary font-heading">Food</span>
              <ResourceBadge type="food" amount={resources.food} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs tabs={TRAIN_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── TRAIN TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'train' && (
        <div className="panel-ornate rounded-game-lg p-4 shadow-engrave">
          <div className="panel-header">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold mb-1">
              Basic Training
            </h2>
          </div>
          <div className="divider-gold mb-4" />
          <div className="space-y-3">
            {(['soldier', 'slave', 'spy', 'scout', 'cavalry', 'farmer'] as BasicUnit[]).map((unit) => {
              const cfg = unitCost(unit)
              const amt = parseInt(trainAmts[unit] || '0') || 0
              const goldTotal = cfg.gold * amt
              const isCavalry = unit === 'cavalry'

              return (
                <div
                  key={unit}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-game-lg bg-gradient-to-b from-game-elevated to-game-surface border border-game-border shadow-emboss"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                      {UNIT_LABELS[unit]}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-1 text-game-xs font-body text-game-text-muted">
                      {unit === 'slave' ? (
                        <span className="text-game-gold-bright font-semibold">
                          Free — converts 1 Untrained Population → 1 Idle Slave
                        </span>
                      ) : (
                        <span>
                          Cost:{' '}
                          <span className="text-res-gold font-semibold">
                            {formatNumber(cfg.gold)} Gold
                          </span>{' '}
                          each
                        </span>
                      )}
                      {isCavalry && 'soldierRatio' in cfg && (
                        <Badge variant="default">
                          1 per {(cfg as { gold: number; capacityCost: number; soldierRatio: number }).soldierRatio} soldiers
                        </Badge>
                      )}
                      {!isCavalry && (
                        <span>Requires 1 free population</span>
                      )}
                    </div>
                    {amt > 0 && (
                      <p className="text-game-xs font-body mt-1">
                        <span className="text-game-text-secondary">Total: </span>
                        <span className={resources.gold >= goldTotal ? 'text-game-green-bright' : 'text-game-red-bright'}>
                          {formatNumber(goldTotal)} Gold
                        </span>
                        {!isCavalry && (
                          <span className={army.free_population >= amt ? ' text-game-green-bright' : ' text-game-red-bright'}>
                            {' · '}{formatNumber(amt)} Pop
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:w-52">
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={trainAmts[unit]}
                      min={1}
                      onChange={(e) => setTrainAmts((prev) => ({ ...prev, [unit]: e.target.value }))}
                      className="w-28"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      loading={loadingUnit === unit}
                      disabled={isFrozen || !canAffordTrain(unit) || !!loadingUnit}
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
      )}

      {/* ── UNTRAIN TAB ───────────────────────────────────────────────────── */}
      {activeTab === 'untrain' && (
        <div className="panel-ornate rounded-game-lg p-4 shadow-engrave">
          <div className="panel-header">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold mb-2">
              Untrain Units
            </h2>
          </div>
          <div className="divider-gold mb-4" />
          <div className="mb-4 p-3 rounded-game-lg bg-gradient-to-b from-game-elevated to-game-surface border border-amber-900/40 text-game-xs font-body text-amber-300/90 space-y-1 shadow-emboss">
            <p className="font-semibold">Important: Untrained units return to free population.</p>
            <p>Once a soldier, spy, scout, or farmer is untrained they return to your untrained population pool.
              From there they can be retrained into any unit type, including slaves.
              Cavalry cannot be untrained.</p>
          </div>
          <div className="space-y-3">
            {(['soldier', 'spy', 'scout', 'farmer'] as UntrainUnit[]).map((unit) => {
              const current = untrainableCount(unit)
              const amt = parseInt(untrainAmts[unit] || '0') || 0

              return (
                <div
                  key={unit}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-game-lg bg-gradient-to-b from-game-elevated to-game-surface border border-game-border shadow-emboss"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                      {UNTRAIN_LABELS[unit]}
                    </p>
                    <p className="text-game-xs text-game-text-muted font-body mt-1">
                      Available: <span className="text-game-text-white font-semibold">{formatNumber(current)}</span>
                      {' · '}Will gain: <span className="text-game-gold font-semibold">{formatNumber(amt)} Slaves</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:w-52">
                    <Input
                      type="number"
                      placeholder="Amount"
                      value={untrainAmts[unit]}
                      min={1}
                      max={current}
                      onChange={(e) => setUntrainAmts((prev) => ({ ...prev, [unit]: e.target.value }))}
                      className="w-28"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={loadingUnit === `untrain_${unit}`}
                      disabled={isFrozen || !canUntrain(unit) || !!loadingUnit}
                      onClick={() => untrainUnit(unit)}
                    >
                      Untrain
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── ADVANCED TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'advanced' && (
        <div className="panel-ornate rounded-game-lg p-4 shadow-engrave">
          <div className="panel-header">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold mb-1">
              Advanced Training
            </h2>
          </div>
          <p className="text-game-sm text-game-text-muted font-body mb-2">
            Each level costs {formatNumber(advCost.gold)} Gold + {formatNumber(advCost.food)} Food × (current level + 1).
            Adds {(BALANCE.training.advancedMultiplierPerLevel * 100).toFixed(0)}% power per level.
          </p>
          <div className="divider-gold mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(['attack', 'defense', 'spy', 'scout'] as AdvancedType[]).map((type) => {
              const level = training[`${type}_level` as keyof Training] as number
              const nextGold = advCost.gold * (level + 1)
              const nextFood = advCost.food * (level + 1)
              const multiplier = (1 + level * BALANCE.training.advancedMultiplierPerLevel).toFixed(2)
              return (
                <div key={type} className="p-3 rounded-game-lg bg-gradient-to-b from-game-elevated to-game-surface border border-game-border shadow-emboss">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                        {ADVANCED_LABELS[type]}
                      </p>
                      <p className="text-game-xs text-game-text-secondary font-body mt-0.5">
                        Level <span className="text-game-gold font-semibold">{level}</span> · ×{multiplier} power
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <ResourceBadge type="gold" amount={nextGold} />
                        <ResourceBadge type="food" amount={nextFood} />
                      </div>
                    </div>
                    <Button
                      variant="success"
                      size="sm"
                      loading={loadingAdv === type}
                      disabled={isFrozen || !canAffordAdv(type) || !!loadingAdv}
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
      )}
    </div>
  )
}
