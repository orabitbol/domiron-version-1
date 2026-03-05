'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { UpgradeCard } from '@/components/ui/upgrade-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GameTable } from '@/components/ui/game-table'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { Development, Resources } from '@/types/game'

type DevField = 'gold_level' | 'food_level' | 'wood_level' | 'iron_level' | 'population_level' | 'fortification_level'

interface DevConfig {
  field: DevField
  title: string
  description: string
  maxLevel: number
  resourceType: 'gold' | 'iron' | 'wood' | 'food'
  costKey: keyof typeof BALANCE.production.developmentUpgradeCost
  productionLabel: string
}

const DEV_CARDS: DevConfig[] = [
  {
    field: 'gold_level',
    title: 'Gold Mine',
    description: 'Increases gold production per slave assigned to gold.',
    maxLevel: 10,
    resourceType: 'gold',
    costKey: 'level10',
    productionLabel: 'Gold/tick per slave',
  },
  {
    field: 'food_level',
    title: 'Farmlands',
    description: 'Increases food production per food slave assigned.',
    maxLevel: 10,
    resourceType: 'food',
    costKey: 'level10',
    productionLabel: 'Food/tick per slave',
  },
  {
    field: 'wood_level',
    title: 'Lumber Mill',
    description: 'Increases wood production per slave assigned to woodcutting.',
    maxLevel: 10,
    resourceType: 'wood',
    costKey: 'level10',
    productionLabel: 'Wood/tick per slave',
  },
  {
    field: 'iron_level',
    title: 'Iron Foundry',
    description: 'Increases iron production per slave assigned to iron.',
    maxLevel: 10,
    resourceType: 'iron',
    costKey: 'level10',
    productionLabel: 'Iron/tick per slave',
  },
  {
    field: 'fortification_level',
    title: 'Fortifications',
    description: 'Strengthens your city defenses. Increases capacity.',
    maxLevel: 5,
    resourceType: 'gold',
    costKey: 'level5',
    productionLabel: 'Defense bonus',
  },
]

function getUpgradeCost(field: DevField, currentLevel: number): { gold: number; resource: number; resourceType: string } {
  const isForti = field === 'fortification_level'
  const maxLevel = isForti ? 5 : 10
  if (currentLevel >= maxLevel) return { gold: 0, resource: 0, resourceType: 'gold' }

  const next = currentLevel + 1
  let costConfig: { gold: number; resource: number }
  if (next <= 2) costConfig = BALANCE.production.developmentUpgradeCost.level2
  else if (next <= 3) costConfig = BALANCE.production.developmentUpgradeCost.level3
  else if (next <= 5) costConfig = BALANCE.production.developmentUpgradeCost.level5
  else costConfig = BALANCE.production.developmentUpgradeCost.level10

  const multiplier = next
  const resourceMap: Record<DevField, string> = {
    gold_level: 'gold',
    food_level: 'food',
    wood_level: 'wood',
    iron_level: 'iron',
    population_level: 'food',
    fortification_level: 'gold',
  }

  return {
    gold: costConfig.gold * multiplier,
    resource: costConfig.resource * multiplier,
    resourceType: resourceMap[field],
  }
}

function PopStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex-1 min-w-[120px] bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-4 shadow-engrave text-center">
      <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">{label}</p>
      <p className="font-heading text-game-2xl text-game-gold-bright">{value}</p>
      {sub && <p className="text-game-xs text-game-text-muted font-body mt-0.5">{sub}</p>}
    </div>
  )
}

export function DevelopClient() {
  const { player, development, resources, army, refresh, applyPatch } = usePlayer()
  const [loading, setLoading] = useState<string | null>(null)
  const [loadingCity, setLoadingCity] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  async function handleUpgrade(field: DevField) {
    setLoading(field)
    setMessage(null)
    try {
      const res = await fetch('/api/develop/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Upgrade failed', type: 'error' })
      } else {
        setMessage({ text: 'Upgrade successful!', type: 'success' })
        // Apply development level increment + resource deduction immediately
        if (development) {
          applyPatch({
            development: { ...development, [field]: (development[field] as number) + 1 },
          })
        }
        if (data.data?.resources) applyPatch({ resources: data.data.resources })
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handlePromoteCity() {
    setLoadingCity(true)
    setMessage(null)
    try {
      const res = await fetch('/api/city/promote', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Failed to promote city', type: 'error' })
      } else {
        setMessage({ text: `Promoted to ${data.data.city_name}!`, type: 'success' })
        if (data.data?.resources) applyPatch({ resources: data.data.resources })
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoadingCity(false)
    }
  }

  const currentCity     = player?.city ?? 1
  const currentCityName = BALANCE.cities.names[currentCity] ?? `City ${currentCity}`
  const currentCityMult = BALANCE.cities.slaveProductionMultByCity[currentCity] ?? 1
  const hasNextCity     = currentCity < BALANCE.cities.maxCity
  const nextCityNum     = currentCity + 1
  const nextCityName    = hasNextCity ? (BALANCE.cities.names[nextCityNum] ?? `City ${nextCityNum}`) : null
  const nextCityMult    = hasNextCity ? (BALANCE.cities.slaveProductionMultByCity[nextCityNum] ?? 1) : null

  const nextReq         = hasNextCity ? BALANCE.cities.promotion.soldiersRequiredByCity[nextCityNum] : null
  const nextCost        = hasNextCity ? BALANCE.cities.promotion.resourceCostByCity[nextCityNum] : null

  const meetsArmy = nextReq != null && (army?.soldiers ?? 0) >= nextReq
  const meetsGold = nextCost != null && (resources?.gold ?? 0) >= nextCost.gold
  const meetsWood = nextCost != null && (resources?.wood ?? 0) >= nextCost.wood
  const meetsIron = nextCost != null && (resources?.iron ?? 0) >= nextCost.iron
  const meetsFood = nextCost != null && (resources?.food ?? 0) >= nextCost.food
  const canPromote = hasNextCity && meetsArmy && meetsGold && meetsWood && meetsIron && meetsFood

  const popLevel    = (development?.population_level ?? 0)
  const popPerTick  = BALANCE.training.populationPerTick[popLevel] ?? 1
  const maxPopLevel = 10
  const popIsMaxed  = popLevel >= maxPopLevel
  const popCost     = getUpgradeCost('population_level', popLevel)
  const popCanAfford =
    !popIsMaxed &&
    (resources?.gold ?? 0) >= popCost.gold &&
    (resources?.food ?? 0) >= popCost.resource

  const popPerTickEntries = Object.entries(BALANCE.training.populationPerTick) as [string, number][]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
          Development
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          Upgrade your city infrastructure and production
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

      {/* Resources */}
      <div className="flex flex-wrap gap-4 card-game p-4">
        <ResourceBadge type="gold" amount={resources?.gold ?? 0} showLabel />
        <ResourceBadge type="iron" amount={resources?.iron ?? 0} showLabel />
        <ResourceBadge type="wood" amount={resources?.wood ?? 0} showLabel />
        <ResourceBadge type="food" amount={resources?.food ?? 0} showLabel />
      </div>

      {/* ── Population Overview ─────────────────────────────────────────────────── */}
      <div className="panel-ornate p-4 space-y-4">
        <h2 className="panel-header text-game-gold">Population Overview</h2>
        <div className="flex flex-wrap gap-3">
          <PopStat label="Untrained Population" value={formatNumber(army?.free_population ?? 0)} sub="available to train" />
          <PopStat label="Population / Tick" value={`+${popPerTick}`} sub="every 30 minutes" />
          <PopStat
            label="Growth Level"
            value={popLevel}
            sub={popIsMaxed ? 'MAX LEVEL' : `next: +${BALANCE.training.populationPerTick[popLevel + 1] ?? '—'}/tick`}
          />
        </div>

        <div className="divider-gold" />

        {popIsMaxed ? (
          <div className="flex items-center gap-3">
            <Badge variant="gold">MAX</Badge>
            <span className="font-body text-game-sm text-game-text-secondary">
              Population Growth is fully upgraded.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                Upgrade Population Growth
              </p>
              <p className="font-body text-game-xs text-game-text-muted">
                Level {popLevel} → {popLevel + 1} · Gain{' '}
                <span className="text-game-gold-bright font-semibold">
                  +{BALANCE.training.populationPerTick[popLevel + 1] ?? '?'} pop/tick
                </span>{' '}
                after upgrade
              </p>
              <div className="flex items-center gap-3 mt-1">
                <ResourceBadge type="gold" amount={popCost.gold} />
                <ResourceBadge type="food" amount={popCost.resource} />
              </div>
            </div>
            <Button
              variant="primary"
              disabled={!popCanAfford}
              loading={loading === 'population_level'}
              onClick={() => handleUpgrade('population_level')}
            >
              Upgrade Population Rate
            </Button>
          </div>
        )}
      </div>

      {/* ── Infrastructure Upgrades ─────────────────────────────────────────────── */}
      <div>
        <h2 className="panel-header text-game-gold mb-3">Infrastructure Upgrades</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DEV_CARDS.map((card) => {
            const currentLevel = (development?.[card.field] as number) ?? 0
            const cost = getUpgradeCost(card.field, currentLevel)
            const isMaxed = currentLevel >= card.maxLevel

            let canAfford = false
            if (!isMaxed) {
              const resAmt = (resources as Resources | null)?.[cost.resourceType as keyof Resources] as number ?? 0
              canAfford = (resources?.gold ?? 0) >= cost.gold && (cost.resourceType === 'gold' || resAmt >= cost.resource)
            }

            const prodMin = BALANCE.production.baseMin
            const prodMax = BALANCE.production.baseMax
            const cityMult = BALANCE.cities.slaveProductionMultByCity[player?.city ?? 1] ?? 1
            const description = `${card.description} Base: ${prodMin}–${prodMax} × City ×${cityMult}`

            return (
              <UpgradeCard
                key={card.field}
                title={card.title}
                description={description}
                currentLevel={currentLevel}
                maxLevel={card.maxLevel}
                cost={
                  isMaxed
                    ? { gold: 0 }
                    : cost.resourceType === 'gold'
                    ? { gold: cost.gold }
                    : { gold: cost.gold, [cost.resourceType]: cost.resource }
                }
                canAfford={canAfford}
                onUpgrade={() => handleUpgrade(card.field)}
                loading={loading === card.field}
              />
            )
          })}
        </div>
      </div>

      <div className="divider-ornate" />

      {/* ── Population Growth Rate Table ─────────────────────────────────────────── */}
      <div className="panel-ornate p-4">
        <h2 className="panel-header text-game-gold mb-3">Population Growth Rate (by Level)</h2>
        <GameTable
          headers={['Level', 'Population / Tick']}
          striped
          rows={popPerTickEntries.map(([lvl, pop]) => {
            const isCurrent = Number(lvl) === popLevel
            return [
              <span key="lvl" className={`font-heading text-game-sm flex items-center gap-2 ${isCurrent ? 'text-game-gold-bright' : 'text-game-text'}`}>
                {lvl}
                {isCurrent && <Badge variant="gold">Current</Badge>}
              </span>,
              <span key="pop" className={`font-semibold ${isCurrent ? 'text-game-gold-bright' : 'text-game-text-white'}`}>
                +{pop}
              </span>,
            ]
          })}
        />
      </div>

      {/* ── City Progression ─────────────────────────────────────────────────────── */}
      <div className="panel-ornate p-4">
        <h2 className="panel-header text-game-gold mb-3">City Progression</h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant="gold">City {currentCity}</Badge>
            <span className="font-heading text-game-base text-game-text-white uppercase">{currentCityName}</span>
            <span className="text-game-text-muted text-game-sm font-body">×{currentCityMult} slave production</span>
          </div>

          <div className="divider-gold" />

          {hasNextCity && nextCityName && nextCost && nextReq !== null ? (
            <div className="card-game p-4 space-y-3">
              <p className="font-heading text-game-sm uppercase tracking-wide text-game-gold">
                Next: City {nextCityNum} — {nextCityName}
              </p>
              <p className="text-game-text-muted text-game-xs font-body">
                Slave production: ×{currentCityMult} → ×{nextCityMult}
              </p>
              <div className="space-y-2 text-game-sm font-body">
                <div className="flex items-center justify-between">
                  <span className="text-game-text-secondary">Soldiers required</span>
                  <span className={meetsArmy ? 'text-game-green-bright' : 'text-game-red-bright'}>
                    {formatNumber(army?.soldiers ?? 0)} / {formatNumber(nextReq)}
                    {meetsArmy ? ' ✓' : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-game-text-secondary">Gold cost</span>
                  <span className={meetsGold ? 'text-game-green-bright' : 'text-game-red-bright'}>
                    {formatNumber(resources?.gold ?? 0)} / {formatNumber(nextCost.gold)}
                    {meetsGold ? ' ✓' : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-game-text-secondary">Wood cost</span>
                  <span className={meetsWood ? 'text-game-green-bright' : 'text-game-red-bright'}>
                    {formatNumber(resources?.wood ?? 0)} / {formatNumber(nextCost.wood)}
                    {meetsWood ? ' ✓' : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-game-text-secondary">Iron cost</span>
                  <span className={meetsIron ? 'text-game-green-bright' : 'text-game-red-bright'}>
                    {formatNumber(resources?.iron ?? 0)} / {formatNumber(nextCost.iron)}
                    {meetsIron ? ' ✓' : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-game-text-secondary">Food cost</span>
                  <span className={meetsFood ? 'text-game-green-bright' : 'text-game-red-bright'}>
                    {formatNumber(resources?.food ?? 0)} / {formatNumber(nextCost.food)}
                    {meetsFood ? ' ✓' : ''}
                  </span>
                </div>
              </div>
              <p className="text-game-xs text-game-text-muted font-body italic">
                You cannot promote while in a clan/tribe. Promotion is irreversible.
              </p>
              <Button variant="primary" disabled={!canPromote} loading={loadingCity} onClick={handlePromoteCity}>
                Promote to {nextCityName}
              </Button>
            </div>
          ) : (
            <div className="text-game-sm text-game-text-muted font-body">
              You are in the highest city — {currentCityName}.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
