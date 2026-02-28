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
import type { Player, Development, Resources, Army } from '@/types/game'

interface Props {
  player: Player
  development: Development
  resources: Resources
  army: Army
}

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
    description: 'Increases food production per farmer assigned.',
    maxLevel: 10,
    resourceType: 'food',
    costKey: 'level10',
    productionLabel: 'Food/tick per farmer',
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
    field: 'population_level',
    title: 'Population Growth',
    description: 'Increases free population gained per tick.',
    maxLevel: 10,
    resourceType: 'food',
    costKey: 'level10',
    productionLabel: 'Pop/tick',
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

export function DevelopClient({ player, development, resources, army }: Props) {
  const { refresh } = usePlayer()
  const [loading, setLoading] = useState<string | null>(null)
  const [loadingCity, setLoadingCity] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [devState, setDevState] = useState(development)

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
        setDevState((prev) => ({ ...prev, [field]: (prev[field] as number) + 1 }))
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handleMoveCity() {
    setLoadingCity(true)
    setMessage(null)
    try {
      const res = await fetch('/api/develop/move-city', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Failed to move city', type: 'error' })
      } else {
        setMessage({ text: `Moved to ${data.cityName}!`, type: 'success' })
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoadingCity(false)
    }
  }

  const currentCityName = BALANCE.cities.names[player.city] ?? `City ${player.city}`
  const currentCityMult = BALANCE.cities.CITY_PRODUCTION_MULT[player.city] ?? 1
  const hasNextCity = player.city < BALANCE.cities.total
  const nextCityNum  = player.city + 1
  const nextCityReqs = hasNextCity ? BALANCE.cities.promotionRequirements[nextCityNum] : null
  const nextCityName = hasNextCity ? (BALANCE.cities.names[nextCityNum] ?? `City ${nextCityNum}`) : null

  const totalResources = resources.gold + resources.iron + resources.wood + resources.food
  const meetsResources = nextCityReqs ? totalResources >= (nextCityReqs.requiredResources ?? Infinity) : false
  const meetsSoldiers  = nextCityReqs ? army.soldiers   >= (nextCityReqs.requiredSoldiers  ?? Infinity) : false
  const canMoveCity    = meetsResources && meetsSoldiers && hasNextCity

  // Population per tick table
  const popPerTickEntries = Object.entries(BALANCE.training.populationPerTick) as [string, number][]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-game-3xl text-game-gold-bright uppercase tracking-wide">
          Development
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          Upgrade your city infrastructure and production
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

      {/* Resources */}
      <div className="flex flex-wrap gap-4 bg-game-surface border border-game-border rounded-lg p-4">
        <ResourceBadge type="gold" amount={resources.gold} showLabel />
        <ResourceBadge type="iron" amount={resources.iron} showLabel />
        <ResourceBadge type="wood" amount={resources.wood} showLabel />
        <ResourceBadge type="food" amount={resources.food} showLabel />
      </div>

      {/* Upgrade Cards */}
      <div>
        <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white mb-3">
          Infrastructure Upgrades
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DEV_CARDS.map((card) => {
            const currentLevel = devState[card.field] as number
            const cost = getUpgradeCost(card.field, currentLevel)
            const isMaxed = currentLevel >= card.maxLevel

            let canAfford = false
            if (!isMaxed) {
              const resAmt = resources[cost.resourceType as keyof Resources] as number
              canAfford = resources.gold >= cost.gold && (cost.resourceType === 'gold' || resAmt >= cost.resource)
            }

            const prodMin = BALANCE.production.baseMin
            const prodMax = BALANCE.production.baseMax
            const cityMult = BALANCE.cities.CITY_PRODUCTION_MULT[player.city] ?? 1
            const description =
              card.field === 'population_level'
                ? `${card.description} Level ${currentLevel}: ${BALANCE.training.populationPerTick[currentLevel] ?? '?'} pop/tick`
                : `${card.description} Base: ${prodMin}–${prodMax} × City ×${cityMult}`

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

      {/* Population Per Tick Table */}
      <div className="bg-game-surface border border-game-border rounded-lg p-4">
        <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white mb-3">
          Population Per Tick (by Level)
        </h2>
        <GameTable
          headers={['Level', 'Population / Tick']}
          striped
          rows={popPerTickEntries.map(([lvl, pop]) => [
            <span key="lvl" className={`font-heading text-game-sm ${Number(lvl) === devState.population_level ? 'text-game-gold-bright' : 'text-game-text'}`}>
              {lvl} {Number(lvl) === devState.population_level && <Badge variant="gold">Current</Badge>}
            </span>,
            <span key="pop" className="text-game-text-white font-semibold">{pop}</span>,
          ])}
        />
      </div>

      {/* City Progression */}
      <div className="bg-game-surface border border-game-border rounded-lg p-4">
        <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white mb-3">
          City Progression
        </h2>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant="gold">City {player.city}</Badge>
            <span className="font-heading text-game-base text-game-text-white uppercase">
              {currentCityName}
            </span>
            <span className="text-game-text-muted text-game-sm font-body">
              ×{currentCityMult} production
            </span>
          </div>

          {hasNextCity ? (
            <div className="border border-game-border rounded-lg p-4 space-y-3">
              <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-secondary">
                Next: City {nextCityNum} — {nextCityName}
              </p>
              <div className="space-y-2 text-game-sm font-body">
                <div className="flex items-center justify-between">
                  <span className="text-game-text-secondary">Soldiers required</span>
                  <span className={meetsSoldiers ? 'text-game-green-bright' : 'text-game-red-bright'}>
                    {formatNumber(army.soldiers)} / {nextCityReqs?.requiredSoldiers != null ? formatNumber(nextCityReqs.requiredSoldiers) : '—'}
                    {meetsSoldiers ? ' ✓' : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-game-text-secondary">Total resources required</span>
                  <span className={meetsResources ? 'text-game-green-bright' : 'text-game-red-bright'}>
                    {formatNumber(totalResources)} / {nextCityReqs?.requiredResources != null ? formatNumber(nextCityReqs.requiredResources) : '—'}
                    {meetsResources ? ' ✓' : ''}
                  </span>
                </div>
              </div>
              <Button
                variant="primary"
                disabled={!canMoveCity}
                loading={loadingCity}
                onClick={handleMoveCity}
              >
                Move to {nextCityName}
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
