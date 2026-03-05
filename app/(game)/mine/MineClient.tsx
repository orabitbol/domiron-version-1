'use client'

import { useState, useCallback } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import { useFreeze } from '@/lib/hooks/useFreeze'
import type { Development } from '@/types/game'

type JobKey = 'gold' | 'iron' | 'wood' | 'food'

interface JobConfig {
  key:           JobKey
  armyField:     'slaves_gold' | 'slaves_iron' | 'slaves_wood' | 'slaves_food'
  devLevelField: keyof Development
  label:         string
  resourceType:  'gold' | 'iron' | 'wood' | 'food'
  icon:          string
}

const JOBS: JobConfig[] = [
  { key: 'gold', armyField: 'slaves_gold', devLevelField: 'gold_level', label: 'Gold Mine',    resourceType: 'gold', icon: '⛏' },
  { key: 'iron', armyField: 'slaves_iron', devLevelField: 'iron_level', label: 'Iron Foundry', resourceType: 'iron', icon: '🔩' },
  { key: 'wood', armyField: 'slaves_wood', devLevelField: 'wood_level', label: 'Lumber Camp',  resourceType: 'wood', icon: '🪵' },
  { key: 'food', armyField: 'slaves_food', devLevelField: 'food_level', label: 'Farmlands',    resourceType: 'food', icon: '🌾' },
]

const MAX_DEV_LEVEL = 10

function calcProdRange(slaves: number, devLevel: number, city: number): { min: number; max: number } {
  const { baseMin, baseMax } = BALANCE.production
  const cityMult  = BALANCE.cities.slaveProductionMultByCity[city] ?? 1
  const level     = Math.max(1, devLevel || 1)
  const devOffset = (level - 1) * BALANCE.production.DEV_OFFSET_PER_LEVEL
  return {
    min: Math.floor(slaves * (baseMin + devOffset) * cityMult),
    max: Math.floor(slaves * (baseMax + devOffset) * cityMult),
  }
}

function perSlaveRateAt(devLevel: number, city: number): string {
  const { baseMin, baseMax } = BALANCE.production
  const cityMult  = BALANCE.cities.slaveProductionMultByCity[city] ?? 1
  const level     = Math.max(1, devLevel || 1)
  const devOffset = (level - 1) * BALANCE.production.DEV_OFFSET_PER_LEVEL
  const lo = ((baseMin + devOffset) * cityMult).toFixed(1)
  const hi = ((baseMax + devOffset) * cityMult).toFixed(1)
  return `${lo}–${hi}`
}

export function MineClient() {
  const { player, army: ctxArmy, development, refresh, applyPatch } = usePlayer()
  const isFrozen = useFreeze()

  // Normalize slave assignment columns (INT NOT NULL DEFAULT 0 in DB, but guard against nulls)
  const army = {
    ...(ctxArmy ?? { slaves: 0, slaves_gold: 0, slaves_iron: 0, slaves_wood: 0, slaves_food: 0 }),
    slaves_gold: ctxArmy?.slaves_gold ?? 0,
    slaves_iron: ctxArmy?.slaves_iron ?? 0,
    slaves_wood: ctxArmy?.slaves_wood ?? 0,
    slaves_food: ctxArmy?.slaves_food ?? 0,
  }

  const [assignments, setAssignments] = useState<Record<JobKey, number>>({
    gold: army.slaves_gold,
    iron: army.slaves_iron,
    wood: army.slaves_wood,
    food: army.slaves_food,
  })

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const totalSlaves   = army.slaves
  const totalAssigned = assignments.gold + assignments.iron + assignments.wood + assignments.food
  const idleSlaves    = totalSlaves - totalAssigned

  const adjust = useCallback((job: JobKey, delta: number) => {
    setAssignments(prev => {
      const prevTotal = prev.gold + prev.iron + prev.wood + prev.food
      const newVal    = Math.max(0, prev[job] + delta)
      const newTotal  = prevTotal - prev[job] + newVal
      if (newTotal > totalSlaves) return prev
      return { ...prev, [job]: newVal }
    })
  }, [totalSlaves])

  const handleInput = useCallback((job: JobKey, raw: string) => {
    const parsed = parseInt(raw, 10)
    const val    = Number.isNaN(parsed) ? 0 : Math.max(0, parsed)
    setAssignments(prev => {
      const otherAssigned = prev.gold + prev.iron + prev.wood + prev.food - prev[job]
      const clamped = Math.min(val, totalSlaves - otherAssigned)
      return { ...prev, [job]: clamped }
    })
  }, [totalSlaves])

  async function handleSave() {
    if (isFrozen) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/mine/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignments),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg = data.details ? `${data.error}: ${data.details}` : (data.error ?? 'Allocation failed')
        setMessage({ text: msg, type: 'error' })
      } else {
        setMessage({ text: 'Slave assignment saved!', type: 'success' })
        if (data.data?.army) {
          const a = data.data.army
          applyPatch({ army: a })
          setAssignments({
            gold: typeof a.slaves_gold === 'number' ? a.slaves_gold : 0,
            iron: typeof a.slaves_iron === 'number' ? a.slaves_iron : 0,
            wood: typeof a.slaves_wood === 'number' ? a.slaves_wood : 0,
            food: typeof a.slaves_food === 'number' ? a.slaves_food : 0,
          })
        }
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const city = player?.city ?? 1

  let grandMin = 0
  let grandMax = 0
  for (const job of JOBS) {
    const devLevel = ((development?.[job.devLevelField] as number) || 1)
    const { min, max } = calcProdRange(assignments[job.key], devLevel, city)
    grandMin += min
    grandMax += max
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
          Slave Workforce
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          Assign slaves to resource jobs. Each slave produces only one resource per tick.
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

      {/* Slave summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-game p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">Total Slaves</p>
          <p className="text-game-xl text-game-gold font-body font-semibold mt-0.5">{formatNumber(totalSlaves)}</p>
        </div>
        <div className="card-game p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">Idle Slaves</p>
          <p className={`text-game-xl font-body font-semibold mt-0.5 ${idleSlaves < 0 ? 'text-game-red-bright' : 'text-game-gold'}`}>
            {formatNumber(Math.max(0, idleSlaves))}
          </p>
        </div>
        <div className="card-game p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">Assigned</p>
          <p className="text-game-xl text-game-gold font-body font-semibold mt-0.5">{formatNumber(totalAssigned)}</p>
        </div>
      </div>

      {/* Assignment rows */}
      <div className="panel-ornate p-5 space-y-4">
        <h2 className="panel-header text-game-gold">Job Assignment</h2>
        <div className="divider-gold" />

        <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-1 text-game-xs font-heading uppercase tracking-wider text-game-text-muted">
          <span>Job</span>
          <span className="text-center w-32">Assigned</span>
          <span className="text-right w-36">Rate / Slave</span>
          <span className="text-right w-36">Total / Tick</span>
        </div>

        {JOBS.map((job) => {
          const devLevel  = ((development?.[job.devLevelField] as number) || 1)
          const assigned  = assignments[job.key]
          const { min, max } = calcProdRange(assigned, devLevel, city)

          const currentRate = perSlaveRateAt(devLevel, city)
          const atMax       = devLevel >= MAX_DEV_LEVEL
          const nextRate    = atMax ? null : perSlaveRateAt(devLevel + 1, city)

          return (
            <div
              key={job.key}
              className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-3 sm:gap-4 items-center p-3 rounded-game-lg card-game"
            >
              <div>
                <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                  {job.icon} {job.label}
                </p>
                <p className="text-game-xs text-game-text-muted font-body mt-0.5">
                  Dev Level {devLevel} · <ResourceBadge type={job.resourceType} amount={0} showLabel compact />
                </p>
                {nextRate && (
                  <p className="text-game-xs text-game-text-muted font-body mt-1">
                    Next level ({devLevel}→{devLevel + 1}):{' '}
                    <span className="text-game-green-bright font-semibold">{nextRate}</span>
                    {' '}
                    <span className="opacity-60">(+0.5 per slave)</span>
                  </p>
                )}
                {atMax && (
                  <p className="text-game-xs text-game-green-bright font-body mt-1">Max development reached</p>
                )}
              </div>

              <div className="flex items-center gap-1.5 w-36">
                <button
                  className="w-7 h-7 rounded-game border border-game-border bg-game-elevated text-game-text-white font-bold text-game-sm hover:border-game-gold hover:text-game-gold transition-colors disabled:opacity-40"
                  onClick={() => adjust(job.key, -1)}
                  disabled={assigned <= 0}
                  aria-label={`Decrease ${job.label} assignment`}
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={totalSlaves}
                  value={assigned}
                  onChange={(e) => handleInput(job.key, e.target.value)}
                  className="w-16 text-center bg-game-surface border border-game-border rounded-game text-game-sm text-game-text-white font-body py-1 focus:outline-none focus:border-game-gold"
                />
                <button
                  className="w-7 h-7 rounded-game border border-game-border bg-game-elevated text-game-text-white font-bold text-game-sm hover:border-game-gold hover:text-game-gold transition-colors disabled:opacity-40"
                  onClick={() => adjust(job.key, 1)}
                  disabled={idleSlaves <= 0}
                  aria-label={`Increase ${job.label} assignment`}
                >
                  +
                </button>
              </div>

              <div className="text-game-sm font-body text-right w-36">
                <span className="text-game-text-muted">Rate: </span>
                <span className="text-game-gold-bright font-semibold">{currentRate}</span>
              </div>

              <div className="text-game-sm font-body text-right w-36">
                {assigned === 0 ? (
                  <span className="text-game-text-muted">—</span>
                ) : (
                  <span className="text-game-gold font-semibold">
                    {formatNumber(min)}–{formatNumber(max)}/tick
                  </span>
                )}
              </div>
            </div>
          )
        })}

        <div className="divider-gold" />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <p className="text-game-sm font-heading text-game-text-white uppercase tracking-wide">
              Grand Total Production / Tick
            </p>
            <p className="text-game-xl font-body font-semibold text-game-gold-bright">
              {formatNumber(grandMin)}–{formatNumber(grandMax)}
            </p>
          </div>

          {idleSlaves > 0 && (
            <div className="text-game-xs font-body text-amber-400/80 border border-amber-900/40 rounded-game-lg px-3 py-2 bg-amber-950/20">
              ⚠ {formatNumber(idleSlaves)} idle slave{idleSlaves !== 1 ? 's' : ''} — not producing
            </div>
          )}
        </div>

        <Button variant="primary" disabled={isFrozen || loading} loading={loading} onClick={handleSave}>
          Save Assignment
        </Button>
      </div>

      {/* Production reference */}
      <div className="panel-ornate p-4">
        <h2 className="panel-header text-game-gold mb-3">Production Reference</h2>
        <div className="space-y-2 text-game-sm font-body text-game-text-secondary">
          <p>
            Each assigned slave produces <strong className="text-game-text-white">one resource</strong> per tick. Idle slaves produce nothing.
          </p>
          <p>
            Output per slave = random({BALANCE.production.baseMin}–{BALANCE.production.baseMax}) × City Mult × Dev Offset × VIP Mult
          </p>
          <p className="text-game-xs text-game-text-muted">
            Dev Offset: each development level adds +0.5 to the production range (Level 1 = 1.0–3.0, Level 2 = 1.5–3.5, …).
            City multiplier is applied after all offsets. VIP and hero slave bonuses are additional tick-side multipliers.
          </p>
        </div>
      </div>
    </div>
  )
}
