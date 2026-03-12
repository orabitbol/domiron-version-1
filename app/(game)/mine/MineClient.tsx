'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { formatNumber, isVipActive } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import { useFreeze } from '@/lib/hooks/useFreeze'
import { calcSlaveProduction } from '@/lib/game/tick'
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
  { key: 'gold', armyField: 'slaves_gold', devLevelField: 'gold_level', label: 'מכרה זהב',    resourceType: 'gold', icon: '⛏' },
  { key: 'iron', armyField: 'slaves_iron', devLevelField: 'iron_level', label: 'יציקת ברזל', resourceType: 'iron', icon: '🔩' },
  { key: 'wood', armyField: 'slaves_wood', devLevelField: 'wood_level', label: 'מחנה עצים',  resourceType: 'wood', icon: '🪵' },
  { key: 'food', armyField: 'slaves_food', devLevelField: 'food_level', label: 'שדות חקלאים',    resourceType: 'food', icon: '🌾' },
]

const MAX_DEV_LEVEL = 10

// Returns the per-slave rate range as a display string, matching the tick formula exactly.
// slaveBonus (hero effects) is not included — it's transient and not in PlayerContext.
function perSlaveRateAt(
  devLevel: number,
  city: number,
  vipUntil: string | null,
  raceGoldBonus: number,
): string {
  const { baseMin, baseMax } = BALANCE.production
  const cityMult  = BALANCE.cities.slaveProductionMultByCity[city] ?? 1
  const vipMult   = isVipActive(vipUntil) ? BALANCE.vip.productionMultiplier : 1.0
  const level     = Math.max(1, devLevel || 1)
  const devOffset = (level - 1) * BALANCE.production.DEV_OFFSET_PER_LEVEL
  const lo = ((baseMin + devOffset) * cityMult * vipMult * (1 + raceGoldBonus)).toFixed(1)
  const hi = ((baseMax + devOffset) * cityMult * vipMult * (1 + raceGoldBonus)).toFixed(1)
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

  // ── Persistent assignments — what is actually allocated (sent to server on Save)
  const [assignments, setAssignments] = useState<Record<JobKey, number>>({
    gold: army.slaves_gold,
    iron: army.slaves_iron,
    wood: army.slaves_wood,
    food: army.slaves_food,
  })

  // ── Temporary adjustments — how many to send/return right now (resets after each action)
  const [adjustments, setAdjustments] = useState<Record<JobKey, number>>({
    gold: 0, iron: 0, wood: 0, food: 0,
  })

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const totalSlaves   = army.slaves
  const totalAssigned = assignments.gold + assignments.iron + assignments.wood + assignments.food
  const idleSlaves    = totalSlaves - totalAssigned

  // ── Send: add adjustment amount to a job's assignment, clamp to idle, reset adjustment
  function handleSend(job: JobKey) {
    const adj = adjustments[job]
    if (adj <= 0) return
    setAssignments(prev => {
      const currentIdle = totalSlaves - (prev.gold + prev.iron + prev.wood + prev.food)
      const toAdd       = Math.min(adj, Math.max(0, currentIdle))
      if (toAdd <= 0) return prev
      return { ...prev, [job]: prev[job] + toAdd }
    })
    setAdjustments(prev => ({ ...prev, [job]: 0 }))
  }

  // ── Return: subtract adjustment amount from a job's assignment, clamp to 0, reset adjustment
  function handleReturn(job: JobKey) {
    const adj = adjustments[job]
    if (adj <= 0) return
    setAssignments(prev => ({
      ...prev,
      [job]: Math.max(0, prev[job] - adj),
    }))
    setAdjustments(prev => ({ ...prev, [job]: 0 }))
  }

  // ── Step the temporary adjustment input
  function stepAdjust(job: JobKey, delta: number) {
    setAdjustments(prev => ({ ...prev, [job]: Math.max(0, prev[job] + delta) }))
  }

  // ── Set adjustment from typed input
  function setAdjustInput(job: JobKey, raw: string) {
    const parsed = parseInt(raw, 10)
    setAdjustments(prev => ({
      ...prev,
      [job]: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
    }))
  }

  // ── Save to server — identical logic, also resets all adjustments on success
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
        const msg = data.details ? `${data.error}: ${data.details}` : (data.error ?? 'הקצאה נכשלה')
        setMessage({ text: msg, type: 'error' })
      } else {
        setMessage({ text: 'הקצאת עבדים נשמרה!', type: 'success' })
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
        // Reset all temporary adjustments after successful save
        setAdjustments({ gold: 0, iron: 0, wood: 0, food: 0 })
        refresh()
      }
    } catch {
      setMessage({ text: 'שגיאת רשת', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const city            = player?.city ?? 1
  const vipUntil        = player?.vip_until ?? null
  const playerRace      = player?.race ?? ''
  // Race gold bonus: human +15%, dwarf +3% — mirrors tick.ts logic exactly
  const baseRaceGoldBonus = playerRace === 'human' ? BALANCE.raceBonuses.human.goldProductionBonus
                          : playerRace === 'dwarf'  ? BALANCE.raceBonuses.dwarf.goldProductionBonus
                          : 0

  let grandMin = 0
  let grandMax = 0
  for (const job of JOBS) {
    const devLevel     = ((development?.[job.devLevelField] as number) || 1)
    const jobRaceBonus = job.key === 'gold' ? baseRaceGoldBonus : 0
    const { min, max } = calcSlaveProduction(assignments[job.key], devLevel, city, vipUntil, jobRaceBonus, 0)
    grandMin += min
    grandMax += max
  }

  return (
    <div className="space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
          Slave Workforce
        </h1>
      </div>

      {/* ── Message ─────────────────────────────────────────────────────── */}
      {message && (
        <div className={`rounded-game-lg border px-4 py-2.5 font-body text-game-sm ${
          message.type === 'success'
            ? 'bg-game-green/10 border-green-900 text-game-green-bright'
            : 'bg-game-red/10 border-red-900 text-game-red-bright'
        }`}>
          {message.text}
        </div>
      )}

      {/* ── Workforce summary strip ──────────────────────────────────────── */}
      <div className="rounded-game-lg border border-game-border overflow-hidden bg-gradient-to-b from-game-elevated to-game-surface">
        <div className="flex divide-x divide-game-border/50">
          {[
            { label: 'סה"כ',    value: totalSlaves,             color: 'text-game-gold' },
            { label: 'מוקצים', value: totalAssigned,           color: 'text-game-text-white' },
            { label: 'פנויים',  value: Math.max(0, idleSlaves), color: idleSlaves > 0 ? 'text-amber-400' : 'text-game-text-muted' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex-1 flex flex-col items-center py-3 px-2 gap-0.5 min-w-0">
              <span className={`font-heading text-game-lg font-bold tabular-nums leading-none ${color}`}>
                {formatNumber(value)}
              </span>
              <span className="text-game-xs text-game-text-muted font-body uppercase tracking-wider leading-none mt-0.5">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Workforce allocation panel ───────────────────────────────────── */}
      <div className="rounded-game-lg border border-game-border overflow-hidden bg-gradient-to-b from-game-elevated to-game-surface shadow-engrave">

        {/* Desktop column headers */}
        <div className="hidden sm:grid grid-cols-[1fr_96px_136px_152px] gap-0 px-4 py-2 bg-game-bg/55 border-b border-game-border/60">
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">עבודה</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted text-center">מוקצים</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted text-center">כמות</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted text-center">פעולה</span>
        </div>

        {/* Job allocation rows */}
        <div className="divide-y divide-game-border/40">
          {JOBS.map((job) => {
            const devLevel     = ((development?.[job.devLevelField] as number) || 1)
            const assigned     = assignments[job.key]
            const adjAmt       = adjustments[job.key]
            const jobRaceBonus = job.key === 'gold' ? baseRaceGoldBonus : 0
            const atMax        = devLevel >= MAX_DEV_LEVEL
            const currentRate  = perSlaveRateAt(devLevel, city, vipUntil, jobRaceBonus)
            const canSend      = adjAmt > 0 && idleSlaves > 0
            const canReturn    = adjAmt > 0 && assigned > 0

            // Shared adjustment stepper control
            const adjControl = (
              <div className="flex items-center gap-1 justify-center">
                <button
                  type="button"
                  className="w-9 h-9 sm:w-7 sm:h-7 rounded border border-game-border bg-game-bg text-game-text-white font-bold text-sm sm:text-xs hover:border-game-gold/50 hover:text-game-gold transition-colors disabled:opacity-30 flex items-center justify-center shrink-0"
                  onClick={() => stepAdjust(job.key, -1)}
                  disabled={adjAmt <= 0}
                  aria-label="Decrease"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={adjAmt}
                  onChange={(e) => setAdjustInput(job.key, e.target.value)}
                  className="w-14 sm:w-12 text-center bg-game-surface border border-game-border/70 rounded text-game-sm text-game-text-white font-body py-1.5 sm:py-0.5 focus:outline-none focus:border-game-gold/60"
                />
                <button
                  type="button"
                  className="w-9 h-9 sm:w-7 sm:h-7 rounded border border-game-border bg-game-bg text-game-text-white font-bold text-sm sm:text-xs hover:border-game-gold/50 hover:text-game-gold transition-colors disabled:opacity-30 flex items-center justify-center shrink-0"
                  onClick={() => stepAdjust(job.key, 1)}
                  disabled={false}
                  aria-label="Increase"
                >
                  +
                </button>
              </div>
            )

            return (
              <div key={job.key} className="hover:bg-game-elevated/20 transition-colors">

                {/* ── Desktop row ── */}
                <div className="hidden sm:grid grid-cols-[1fr_96px_136px_152px] items-center px-4 py-3 gap-0">

                  {/* Job name + dev level + rate */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{job.icon}</span>
                      <span className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                        {job.label}
                      </span>
                      <span className={`text-game-xs font-heading px-1.5 py-0.5 rounded border ${
                        atMax
                          ? 'border-game-gold/40 text-game-gold bg-game-gold/8'
                          : 'border-game-border/60 text-game-text-muted bg-game-bg/40'
                      }`}>
                        Lv {devLevel}
                      </span>
                    </div>
                    <span className="text-game-xs text-game-text-muted font-body ps-6">
                      {currentRate} / worker
                    </span>
                  </div>

                  {/* Currently assigned — static, prominent */}
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <span className={`font-heading text-game-xl font-bold tabular-nums leading-none ${
                      assigned > 0 ? 'text-game-gold' : 'text-game-text-muted'
                    }`}>
                      {formatNumber(assigned)}
                    </span>
                    <span className="text-game-xs text-game-text-muted font-body leading-none">
                      {assigned === 1 ? 'worker' : 'workers'}
                    </span>
                  </div>

                  {/* Adjustment input — temporary */}
                  {adjControl}

                  {/* Send / Return action buttons */}
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSend(job.key)}
                      disabled={!canSend || isFrozen}
                      className="px-2.5 py-1.5 text-game-xs font-heading uppercase tracking-wide rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                        border-game-gold/35 bg-game-gold/8 text-game-gold
                        hover:bg-game-gold/18 hover:border-game-gold/55 enabled:cursor-pointer"
                    >
                      + שלח
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReturn(job.key)}
                      disabled={!canReturn || isFrozen}
                      className="px-2.5 py-1.5 text-game-xs font-heading uppercase tracking-wide rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed
                        border-game-border bg-game-elevated text-game-text-muted
                        hover:border-game-border-hover hover:text-game-text-secondary enabled:cursor-pointer"
                    >
                      − החזר
                    </button>
                  </div>
                </div>

                {/* ── Mobile row ── */}
                <div className="sm:hidden px-3 py-3 space-y-2">
                  {/* Line 1: job name + dev level (left) | assigned count (right) */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-base leading-none flex-shrink-0">{job.icon}</span>
                      <span className="font-heading text-game-sm uppercase tracking-wide text-game-text-white truncate">
                        {job.label}
                      </span>
                      <span className={`text-game-xs font-heading px-1.5 py-0.5 rounded border flex-shrink-0 ${
                        atMax
                          ? 'border-game-gold/40 text-game-gold bg-game-gold/8'
                          : 'border-game-border/60 text-game-text-muted bg-game-bg/40'
                      }`}>
                        Lv {devLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={`font-heading text-game-base font-bold tabular-nums ${
                        assigned > 0 ? 'text-game-gold' : 'text-game-text-muted'
                      }`}>
                        {formatNumber(assigned)}
                      </span>
                      <span className="text-game-xs text-game-text-muted font-body">workers</span>
                    </div>
                  </div>
                  {/* Line 2: adjustment stepper + action buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {adjControl}
                    <button
                      type="button"
                      onClick={() => handleSend(job.key)}
                      disabled={!canSend || isFrozen}
                      className="px-3 py-2 min-h-[40px] text-game-xs font-heading uppercase tracking-wide rounded border transition-colors disabled:opacity-30
                        border-game-gold/35 bg-game-gold/8 text-game-gold
                        hover:bg-game-gold/18 hover:border-game-gold/55"
                    >
                      + שלח
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReturn(job.key)}
                      disabled={!canReturn || isFrozen}
                      className="px-3 py-2 min-h-[40px] text-game-xs font-heading uppercase tracking-wide rounded border transition-colors disabled:opacity-30
                        border-game-border bg-game-elevated text-game-text-muted
                        hover:border-game-border-hover hover:text-game-text-secondary"
                    >
                      − החזר
                    </button>
                    <span className="text-game-xs text-game-text-muted font-body ms-1">
                      {currentRate}/worker
                    </span>
                  </div>
                </div>

              </div>
            )
          })}
        </div>

        {/* ── Footer: idle warning + grand total + save ── */}
        <div className="border-t border-game-gold/15 bg-game-bg/45 px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-game-xs font-heading uppercase tracking-wide text-game-text-muted">סה"כ / טיק</span>
              <span className="font-heading text-game-base font-bold tabular-nums text-game-gold-bright">
                {formatNumber(grandMin)}–{formatNumber(grandMax)}
              </span>
            </div>
            {idleSlaves > 0 && (
              <span className="text-game-xs font-body text-amber-400/80">
                ⚠ {formatNumber(idleSlaves)} idle
              </span>
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            disabled={isFrozen || loading}
            loading={loading}
            onClick={handleSave}
            className="shrink-0"
          >
            Save Assignment
          </Button>
        </div>
      </div>

      {/* ── Output summary — compact always-visible reference grid ────────── */}
      <div className="rounded-game-lg border border-game-border/50 overflow-hidden">
        <div className="px-4 py-2 bg-game-bg/50 border-b border-game-border/50 flex items-center gap-2">
          <span className="font-heading text-game-xs uppercase tracking-widest text-game-text-muted">סיכום תפוקה</span>
        </div>
        <div className="divide-y divide-game-border/30">
          {JOBS.map((job) => {
            const devLevel     = ((development?.[job.devLevelField] as number) || 1)
            const assigned     = assignments[job.key]
            const jobRaceBonus = job.key === 'gold' ? baseRaceGoldBonus : 0
            const { min, max } = calcSlaveProduction(assigned, devLevel, city, vipUntil, jobRaceBonus, 0)
            const rate         = perSlaveRateAt(devLevel, city, vipUntil, jobRaceBonus)
            return (
              <div
                key={job.key}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm leading-none flex-shrink-0">{job.icon}</span>
                  <span className="font-body text-game-xs text-game-text-secondary truncate">{job.label}</span>
                  <span className="text-game-xs text-game-text-muted font-body flex-shrink-0">Lv {devLevel}</span>
                </div>
                <span className="text-game-xs text-game-text-muted font-body tabular-nums flex-shrink-0">
                  {rate}/worker
                </span>
                <span className={`text-game-xs font-heading tabular-nums flex-shrink-0 text-right min-w-[80px] ${
                  assigned > 0 ? 'text-game-gold' : 'text-game-text-muted'
                }`}>
                  {assigned > 0 ? `${formatNumber(min)}–${formatNumber(max)}/tick` : '—'}
                </span>
              </div>
            )
          })}
          {/* Grand total row */}
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-2 bg-game-bg/30">
            <span className="font-heading text-game-xs uppercase tracking-wide text-game-text-muted">סה"כ כולל</span>
            <span />
            <span className="text-game-xs font-heading tabular-nums text-game-gold-bright text-right min-w-[80px]">
              {formatNumber(grandMin)}–{formatNumber(grandMax)}/tick
            </span>
          </div>
        </div>
      </div>

    </div>
  )
}
