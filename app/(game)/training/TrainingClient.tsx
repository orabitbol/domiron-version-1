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
  soldier: 'חייל',
  slave:   'עבד',
  spy:     'מרגל',
  scout:   'סייר',
  cavalry: 'פרש',
}

const ADVANCED_LABELS: Record<AdvancedType, string> = {
  attack:  'תקיפה',
  defense: 'הגנה',
  spy:     'ריגול',
  scout:   'סיור',
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
        setMessage({ text: data.error ?? 'אימון נכשל', type: 'error' })
      } else {
        setMessage({ text: `אומן ${formatNumber(amt)} ${UNIT_LABELS[unit]}`, type: 'success' })
        setTrainAmts((prev) => ({ ...prev, [unit]: '' }))
        if (data.data?.army)      applyPatch({ army: data.data.army })
        if (data.data?.resources) applyPatch({ resources: data.data.resources })
        refresh()
      }
    } catch {
      setMessage({ text: 'שגיאת רשת', type: 'error' })
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
        setMessage({ text: data.error ?? 'שדרוג נכשל', type: 'error' })
      } else {
        setMessage({ text: `${ADVANCED_LABELS[type]} שודרג לרמה ${(training?.[`${type}_level` as keyof Training] as number ?? 0) + 1}`, type: 'success' })
        if (data.data?.resources) applyPatch({ resources: data.data.resources })
        refresh()
      }
    } catch {
      setMessage({ text: 'שגיאת רשת', type: 'error' })
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
            { iconSrc: '/icons/gold.png', label: 'זהב',  value: resources?.gold ?? 0, color: 'text-res-gold', iconSize: 64 },
            { iconSrc: '/icons/iron.png', label: 'ברזל', value: resources?.iron ?? 0, color: 'text-res-iron', iconSize: 74 },
            { iconSrc: '/icons/wood.png', label: 'עץ',   value: resources?.wood ?? 0, color: 'text-res-wood', iconSize: 74 },
            { iconSrc: '/icons/food.png', label: 'מזון', value: resources?.food ?? 0, color: 'text-res-food', iconSize: 64 },
          ].map(({ iconSrc, label, value, color, iconSize }) => (
            <div key={label} className="flex-1 flex flex-col items-center py-3 px-2 gap-1.5 min-w-0">
              <img src={iconSrc} alt={label} style={{ width: iconSize, height: iconSize, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 0 10px rgba(255,255,255,0.70)) drop-shadow(0 2px 6px rgba(0,0,0,0.45))` }} />
              <span className={`font-heading text-game-lg font-bold tabular-nums leading-none ${color}`}>
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
          <img src="/icons/attack-power.png" alt="" style={{ width: 20, height: 20, objectFit: 'contain', verticalAlign: 'middle' }} />
          <span className="font-heading text-game-xs uppercase tracking-widest text-game-text-secondary">צבא נוכחי</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-3">
          {[
            { iconSrc: '/icons/solders.png', label: 'חיילים',     value: army?.soldiers        ?? 0, colorRgb: '220,60,60',   iconSize: 100 },
            ...(BALANCE.training.enableCavalry
              ? [{ iconSrc: '/icons/cavalry.png', label: 'פרשים', value: army?.cavalry ?? 0,         colorRgb: '200,150,30',  iconSize: 100 }]
              : []),
            { iconSrc: '/icons/spy.png',     label: 'מרגלים',     value: army?.spies           ?? 0, colorRgb: '160,80,220',  iconSize: 96  },
            { iconSrc: '/icons/renger.png',  label: 'סיירים',     value: army?.scouts          ?? 0, colorRgb: '220,130,30',  iconSize: 80  },
            { iconSrc: '/icons/slave.png',   label: 'עבדים',      value: army?.slaves          ?? 0, colorRgb: '130,130,110', iconSize: 80  },
            { iconSrc: '' as string,         label: 'אוכ׳ חופשית', value: army?.free_population ?? 0, colorRgb: '60,180,80',  iconSize: 80  },
          ].map(({ iconSrc, label, value, colorRgb, iconSize }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-game bg-game-bg/30 border border-game-border/40">
              {iconSrc ? (
                <img src={iconSrc} alt={label} style={{ width: iconSize, height: iconSize, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 0 14px rgba(${colorRgb},0.70)) drop-shadow(0 3px 8px rgba(0,0,0,0.45))` }} />
              ) : (
                <span style={{ fontSize: 60, opacity: 0.5 }}>👥</span>
              )}
              <span className="font-heading text-game-xl text-game-text-white font-bold tabular-nums leading-none">
                {formatNumber(value)}
              </span>
              <span className="text-game-2xs text-game-text-muted font-body uppercase tracking-wide leading-none text-center">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Basic Training ──────────────────────────────────────────────── */}
      <div className="panel-ornate rounded-game-lg shadow-engrave overflow-hidden">
        <div className="px-4 py-3 border-b border-game-border">
          <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold">אימון בסיסי</h2>
        </div>

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[1fr_80px_140px_180px_auto] gap-3 px-4 py-2 border-b border-game-border/50 bg-game-bg/40">
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">יחידה</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted text-center">ברשותך</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">עלות / יחידה</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">כמות</span>
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
                  <span className="sm:hidden ms-2 text-game-xs text-game-text-muted font-body">
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
                    <span className="text-game-gold-bright font-semibold">חינם</span>
                  ) : (
                    <span className="text-res-gold font-semibold">{formatNumber(cfg.gold)} זהב</span>
                  )}
                  <span className="block text-game-text-muted">
                    {popPerUnit === 1 ? '1 אוכ׳' : `${popPerUnit} אוכ׳`}
                  </span>
                  {/* Total preview when amount entered */}
                  {amt > 0 && (
                    <span className="block pt-0.5">
                      <span className={goldOk ? 'text-game-green-bright' : 'text-game-red-bright'}>
                        {formatNumber(goldTotal)}ז
                      </span>
                      {' · '}
                      <span className={popOk ? 'text-game-green-bright' : 'text-game-red-bright'}>
                        {formatNumber(popTotal)} אוכ׳
                      </span>
                    </span>
                  )}
                </div>

                {/* Amount input */}
                <div>
                  <Input
                    type="number"
                    placeholder="כמות"
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
                    אמן
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
          <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold">אימון מתקדם</h2>
          <p className="text-game-xs text-game-text-muted font-body mt-0.5">
            כל רמה עולה {formatNumber(advCost.gold)} זהב + {formatNumber(advCost.food)} מזון × (רמה + 1).
          </p>
        </div>

        {/* Column headers */}
        <div className="hidden sm:grid grid-cols-[1fr_100px_160px_200px_auto] gap-3 px-4 py-2 border-b border-game-border/50 bg-game-bg/40">
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">כישור</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted text-center">רמה</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">רווח הבא</span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">עלות הבאה</span>
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
                  <span className="sm:hidden ms-2 text-game-xs text-game-text-muted font-body">
                    רמה {level}
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
                  <span className="block text-game-text-muted">+{gainPct}% כוח</span>
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
                    שדרג
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
