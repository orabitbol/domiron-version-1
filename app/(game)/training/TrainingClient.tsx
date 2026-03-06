'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import { useFreeze } from '@/lib/hooks/useFreeze'
import type { Training } from '@/types/game'

type BasicUnit = 'soldier' | 'slave' | 'spy' | 'scout' | 'cavalry'
type AdvancedType  = 'attack' | 'defense' | 'spy' | 'scout'

const UNIT_LABELS: Record<BasicUnit, string> = {
  soldier: 'Soldier',
  slave:   'Slave',
  spy:     'Spy',
  scout:   'Scout',
  cavalry: 'Cavalry',
}

const ADVANCED_LABELS: Record<AdvancedType, string> = {
  attack:  'Attack',
  defense: 'Defense',
  spy:     'Spy',
  scout:   'Scout',
}

export function TrainingClient() {
  const { army, training, resources, refresh, applyPatch } = usePlayer()
  const isFrozen = useFreeze()

  const [trainAmts,   setTrainAmts]   = useState<Record<BasicUnit, string>>({
    soldier: '', slave: '', spy: '', scout: '', cavalry: '',
  })
  const [loadingUnit, setLoadingUnit] = useState<string | null>(null)
  const [loadingAdv,  setLoadingAdv]  = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

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
        if (data.data?.army)      applyPatch({ army: data.data.army })
        if (data.data?.resources) applyPatch({ resources: data.data.resources })
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
        setMessage({ text: `${ADVANCED_LABELS[type]} upgraded to Lv ${(training?.[`${type}_level` as keyof Training] as number ?? 0) + 1}`, type: 'success' })
        if (data.data?.resources) applyPatch({ resources: data.data.resources })
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
    if ((resources?.gold ?? 0) < goldCost) return false
    if (unit === 'cavalry') {
      const cavCfg = unitCost(unit) as { gold: number; capacityCost: number; popCost: number }
      return (army?.free_population ?? 0) >= amt * cavCfg.popCost
    }
    return (army?.free_population ?? 0) >= amt
  }

  function canAffordAdv(type: AdvancedType) {
    const level = (training?.[`${type}_level` as keyof Training] as number) ?? 0
    const cost = BALANCE.training.advancedCost
    return (resources?.gold ?? 0) >= cost.gold * (level + 1) &&
           (resources?.food ?? 0) >= cost.food * (level + 1)
  }

  const advCost = BALANCE.training.advancedCost
  const advMult = BALANCE.training.advancedMultiplierPerLevel

  // Units to show (filter cavalry if disabled)
  const units = (['soldier', 'slave', 'spy', 'scout', 'cavalry'] as BasicUnit[]).filter(
    (u) => !(u === 'cavalry' && !BALANCE.training.enableCavalry)
  )

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
          Training Grounds
        </h1>
        <p className="text-game-xs text-game-text-muted font-body mt-0.5">
          Training is permanent and irreversible.
        </p>
      </div>

      {/* ── Message ─────────────────────────────────────────────────────── */}
      {message && (
        <div
          className={`rounded-game-lg border px-4 py-2.5 font-body text-game-sm ${
            message.type === 'success'
              ? 'bg-game-green/10 border-green-900 text-game-green-bright'
              : 'bg-game-red/10 border-red-900 text-game-red-bright'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ── Resource Economy Strip ──────────────────────────────────────── */}
      <div className="rounded-game-lg border border-game-gold/30 bg-gradient-to-r from-game-gold/8 via-game-surface/80 to-game-surface/80 shadow-emboss overflow-hidden">
        <div className="flex divide-x divide-game-gold/15">
          {[
            { icon: '🪙', label: 'Gold', value: resources?.gold ?? 0, color: 'text-res-gold' },
            { icon: '⚙️', label: 'Iron', value: resources?.iron ?? 0, color: 'text-res-iron' },
            { icon: '🪵', label: 'Wood', value: resources?.wood ?? 0, color: 'text-res-wood' },
            { icon: '🌾', label: 'Food', value: resources?.food ?? 0, color: 'text-res-food' },
          ].map(({ icon, label, value, color }) => (
            <div key={label} className="flex-1 flex flex-col items-center py-3 px-2 gap-1 min-w-0">
              <span className="text-base leading-none">{icon}</span>
              <span className={`font-heading text-game-sm font-bold tabular-nums leading-none ${color}`}>
                {formatNumber(value)}
              </span>
              <span className="text-game-xs text-game-text-muted font-body uppercase tracking-wider leading-none">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Current Army ────────────────────────────────────────────────── */}
      <div className="rounded-game-lg border border-game-border bg-gradient-to-b from-game-elevated to-game-surface shadow-engrave overflow-hidden">
        <div className="px-4 py-2 bg-game-bg/50 border-b border-game-border/60 flex items-center gap-2">
          <span className="text-sm leading-none">⚔️</span>
          <span className="font-heading text-game-xs uppercase tracking-widest text-game-text-secondary">Current Army</span>
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          {[
            { icon: '🗡️', label: 'Soldiers', value: army?.soldiers        ?? 0 },
            ...(BALANCE.training.enableCavalry
              ? [{ icon: '🐴', label: 'Cavalry', value: army?.cavalry ?? 0 }]
              : []),
            { icon: '👁️', label: 'Spies',    value: army?.spies           ?? 0 },
            { icon: '🧭', label: 'Scouts',   value: army?.scouts          ?? 0 },
            { icon: '⛏️', label: 'Slaves',   value: army?.slaves          ?? 0 },
            { icon: '👥', label: 'Free Pop', value: army?.free_population ?? 0 },
          ].map(({ icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 bg-game-bg/40 border border-game-border/60 rounded-game px-3 py-1.5"
            >
              <span className="text-sm leading-none">{icon}</span>
              <span className="text-game-xs text-game-text-muted font-body">{label}</span>
              <span className="font-heading text-game-sm text-game-text-white font-semibold tabular-nums">{formatNumber(value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Basic Training ──────────────────────────────────────────────── */}
      <div className="panel-ornate rounded-game-lg shadow-engrave overflow-hidden">
        <div className="px-4 py-3 border-b border-game-border">
          <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold">Basic Training</h2>
        </div>

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[1fr_80px_140px_180px_auto] gap-3 px-4 py-2 border-b border-game-border/50 bg-game-bg/40">
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">Unit</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted text-center">Owned</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">Cost / Unit</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">Amount</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted"></span>
        </div>

        <div className="divide-y divide-game-border/40">
          {units.map((unit) => {
            const cfg = unitCost(unit)
            const amt = parseInt(trainAmts[unit] || '0') || 0
            const isCavalry = unit === 'cavalry'
            const cavCfg = isCavalry ? (cfg as { gold: number; capacityCost: number; popCost: number }) : null
            const popPerUnit = isCavalry && cavCfg ? cavCfg.popCost : 1
            const goldTotal = cfg.gold * amt
            const popTotal  = popPerUnit * amt
            const ownedCount = unit === 'soldier' ? (army?.soldiers ?? 0)
                             : unit === 'slave'   ? (army?.slaves   ?? 0)
                             : unit === 'spy'     ? (army?.spies    ?? 0)
                             : unit === 'scout'   ? (army?.scouts   ?? 0)
                                                  : (army?.cavalry  ?? 0)

            const goldOk = amt === 0 || (resources?.gold ?? 0) >= goldTotal
            const popOk  = amt === 0 || (army?.free_population ?? 0) >= popTotal

            return (
              <div
                key={unit}
                className="grid grid-cols-1 sm:grid-cols-[1fr_80px_140px_180px_auto] gap-2 sm:gap-3 items-center px-4 py-3 hover:bg-game-elevated/30 transition-colors"
              >
                {/* Unit name */}
                <div>
                  <span className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                    {UNIT_LABELS[unit]}
                  </span>
                  {/* Mobile: show owned inline */}
                  <span className="sm:hidden ml-2 text-game-xs text-game-text-muted font-body">
                    ×{formatNumber(ownedCount)}
                  </span>
                </div>

                {/* Owned count (desktop column) */}
                <div className="hidden sm:flex justify-center">
                  <span className="font-heading text-game-sm text-game-text-secondary">
                    {formatNumber(ownedCount)}
                  </span>
                </div>

                {/* Cost per unit */}
                <div className="text-game-xs font-body text-game-text-secondary space-y-0.5">
                  {unit === 'slave' ? (
                    <span className="text-game-gold-bright font-semibold">Free</span>
                  ) : (
                    <span className="text-res-gold font-semibold">{formatNumber(cfg.gold)} Gold</span>
                  )}
                  <span className="block text-game-text-muted">
                    {popPerUnit === 1 ? '1 Pop' : `${popPerUnit} Pop`}
                  </span>
                  {/* Total preview when amount entered */}
                  {amt > 0 && (
                    <span className="block pt-0.5">
                      <span className={goldOk ? 'text-game-green-bright' : 'text-game-red-bright'}>
                        {formatNumber(goldTotal)}G
                      </span>
                      {' · '}
                      <span className={popOk ? 'text-game-green-bright' : 'text-game-red-bright'}>
                        {formatNumber(popTotal)} Pop
                      </span>
                    </span>
                  )}
                </div>

                {/* Amount input */}
                <div>
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={trainAmts[unit]}
                    min={1}
                    onChange={(e) => setTrainAmts((prev) => ({ ...prev, [unit]: e.target.value }))}
                    className="w-full sm:w-36"
                  />
                </div>

                {/* Train button */}
                <div>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={loadingUnit === unit}
                    disabled={isFrozen || !canAffordTrain(unit) || !!loadingUnit}
                    onClick={() => trainUnit(unit)}
                    className="w-full sm:w-auto whitespace-nowrap"
                  >
                    Train
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Advanced Training ────────────────────────────────────────────── */}
      <div className="panel-ornate rounded-game-lg shadow-engrave overflow-hidden">
        <div className="px-4 py-3 border-b border-game-border">
          <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold">Advanced Training</h2>
          <p className="text-game-xs text-game-text-muted font-body mt-0.5">
            Each level costs {formatNumber(advCost.gold)} Gold + {formatNumber(advCost.food)} Food × (level + 1).
          </p>
        </div>

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[1fr_100px_160px_200px_auto] gap-3 px-4 py-2 border-b border-game-border/50 bg-game-bg/40">
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">Skill</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted text-center">Level</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">Next Gain</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">Next Cost</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted"></span>
        </div>

        <div className="divide-y divide-game-border/40">
          {(['attack', 'defense', 'spy', 'scout'] as AdvancedType[]).map((type) => {
            const level    = (training?.[`${type}_level` as keyof Training] as number) ?? 0
            const nextGold = advCost.gold * (level + 1)
            const nextFood = advCost.food * (level + 1)
            const currentMult = (1 + level * advMult).toFixed(2)
            const nextMult    = (1 + (level + 1) * advMult).toFixed(2)
            const gainPct     = (advMult * 100).toFixed(0)

            return (
              <div
                key={type}
                className="grid grid-cols-1 sm:grid-cols-[1fr_100px_160px_200px_auto] gap-2 sm:gap-3 items-center px-4 py-3 hover:bg-game-elevated/30 transition-colors"
              >
                {/* Skill name */}
                <div>
                  <span className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                    {ADVANCED_LABELS[type]}
                  </span>
                  {/* Mobile: level inline */}
                  <span className="sm:hidden ml-2 text-game-xs text-game-text-muted font-body">
                    Lv {level}
                  </span>
                </div>

                {/* Current level (desktop) */}
                <div className="hidden sm:flex justify-center">
                  <span className="font-heading text-game-base text-game-gold font-semibold">
                    {level}
                  </span>
                </div>

                {/* Next gain */}
                <div className="text-game-xs font-body space-y-0.5">
                  <span className="text-game-text-secondary">
                    ×{currentMult} → <span className="text-game-green-bright font-semibold">×{nextMult}</span>
                  </span>
                  <span className="block text-game-text-muted">+{gainPct}% power</span>
                </div>

                {/* Next cost */}
                <div className="flex flex-wrap gap-1.5">
                  <ResourceBadge type="gold" amount={nextGold} />
                  <ResourceBadge type="food" amount={nextFood} />
                </div>

                {/* Upgrade button */}
                <div>
                  <Button
                    variant="success"
                    size="sm"
                    loading={loadingAdv === type}
                    disabled={isFrozen || !canAffordAdv(type) || !!loadingAdv}
                    onClick={() => upgradeAdvanced(type)}
                    className="w-full sm:w-auto whitespace-nowrap"
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
