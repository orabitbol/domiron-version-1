'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { Player, Army, Resources } from '@/types/game'

interface Props {
  player: Player
  army: Army
  resources: Resources
}

interface Allocation {
  gold_mine: string
  iron_mine: string
  woodcutters: string
  farmers: string
}

export function MineClient({ player, army, resources }: Props) {
  const { refresh } = usePlayer()
  const [allocation, setAllocation] = useState<Allocation>({
    gold_mine: String(Math.floor(army.slaves / 4)),
    iron_mine: String(Math.floor(army.slaves / 4)),
    woodcutters: String(Math.floor(army.slaves / 4)),
    farmers: String(army.farmers),
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const totalSlaves = army.slaves
  const totalFarmers = army.farmers

  const cityMult = BALANCE.cities.CITY_PRODUCTION_MULT[player.city as keyof typeof BALANCE.cities.CITY_PRODUCTION_MULT] ?? 1
  const baseMin = BALANCE.production.baseMin
  const baseMax = BALANCE.production.baseMax

  const slaveAssigned =
    (parseInt(allocation.gold_mine) || 0) +
    (parseInt(allocation.iron_mine) || 0) +
    (parseInt(allocation.woodcutters) || 0)
  const slaveRemaining = totalSlaves - slaveAssigned
  const isOverAllocated = slaveAssigned > totalSlaves

  function production(units: number) {
    const minProd = units * baseMin * cityMult
    const maxProd = units * baseMax * cityMult
    return `${formatNumber(Math.floor(minProd))} – ${formatNumber(Math.floor(maxProd))}`
  }

  async function handleAllocate() {
    if (isOverAllocated) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/mine/allocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gold_mine: parseInt(allocation.gold_mine) || 0,
          iron_mine: parseInt(allocation.iron_mine) || 0,
          woodcutters: parseInt(allocation.woodcutters) || 0,
          farmers: parseInt(allocation.farmers) || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Allocation failed', type: 'error' })
      } else {
        setMessage({ text: 'Allocation saved!', type: 'success' })
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const MINES = [
    {
      key: 'gold_mine' as keyof Allocation,
      label: 'Gold Mine',
      resourceType: 'gold' as const,
      description: 'Slaves assigned to gold mining',
      available: totalSlaves,
    },
    {
      key: 'iron_mine' as keyof Allocation,
      label: 'Iron Foundry',
      resourceType: 'iron' as const,
      description: 'Slaves assigned to iron smelting',
      available: totalSlaves,
    },
    {
      key: 'woodcutters' as keyof Allocation,
      label: 'Lumber Camp',
      resourceType: 'wood' as const,
      description: 'Slaves assigned to woodcutting',
      available: totalSlaves,
    },
    {
      key: 'farmers' as keyof Allocation,
      label: 'Farmlands',
      resourceType: 'food' as const,
      description: 'Farmers assigned to food production',
      available: totalFarmers,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
          Resource Allocation
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          Assign slaves and farmers to maximize production
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

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-game p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">Slaves</p>
          <p className="text-game-lg text-game-gold font-body font-semibold mt-0.5">{formatNumber(totalSlaves)}</p>
        </div>
        <div className="card-game p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">Farmers</p>
          <p className="text-game-lg text-game-gold font-body font-semibold mt-0.5">{formatNumber(totalFarmers)}</p>
        </div>
        <div className="card-game p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">City</p>
          <p className="text-game-lg text-game-gold font-body font-semibold mt-0.5">×{cityMult}</p>
        </div>
        <div className="card-game p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">Base Prod</p>
          <p className="text-game-lg text-game-gold font-body font-semibold mt-0.5">{baseMin}–{baseMax}/unit</p>
        </div>
      </div>

      {/* Allocation form */}
      <div className="panel-ornate p-5 space-y-4">
        <h2 className="panel-header text-game-gold">
          Assign Workers
        </h2>
        <div className="divider-gold" />

        <div className="space-y-4">
          {MINES.map(({ key, label, resourceType, description, available }) => {
            const assigned = parseInt(allocation[key]) || 0
            const prod = production(assigned)

            return (
              <div
                key={key}
                className="p-3 rounded-game-lg card-game space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                      {label}
                    </p>
                    <p className="text-game-xs text-game-text-muted font-body">{description}</p>
                  </div>
                  <ResourceBadge type={resourceType} amount={resources[resourceType]} compact />
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    placeholder="0"
                    value={allocation[key]}
                    min={0}
                    max={available}
                    onChange={(e) => setAllocation((prev) => ({ ...prev, [key]: e.target.value }))}
                    hint={`Max: ${formatNumber(available)}`}
                    className="w-36"
                  />
                  <div className="text-game-sm font-body">
                    <span className="text-game-text-muted">Estimated: </span>
                    <span className="text-game-gold font-semibold">{prod}/tick</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="divider-gold" />

        {/* Slave balance indicator */}
        <div
          className={`flex items-center justify-between rounded-game-lg px-3 py-2 text-game-sm font-body ${
            isOverAllocated
              ? 'bg-game-red/10 border border-red-900 text-game-red-bright'
              : 'card-game text-game-text-secondary'
          }`}
        >
          <span>Slaves: {formatNumber(slaveAssigned)} assigned</span>
          <span className={isOverAllocated ? 'text-game-red-bright' : 'text-game-green-bright'}>
            {isOverAllocated
              ? `Over by ${formatNumber(Math.abs(slaveRemaining))}`
              : `${formatNumber(slaveRemaining)} unassigned`}
          </span>
        </div>

        <Button
          variant="primary"
          disabled={isOverAllocated}
          loading={loading}
          onClick={handleAllocate}
        >
          Save Allocation
        </Button>
      </div>

      {/* Production rates info */}
      <div className="panel-ornate p-4">
        <h2 className="panel-header text-game-gold mb-3">
          Production Formula
        </h2>
        <div className="space-y-2 text-game-sm font-body text-game-text-secondary">
          <p>
            Production per tick = Units × random({baseMin}–{baseMax}) × City Multiplier (×{cityMult})
          </p>
          <div className="divider-gold" />
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
            {Object.entries(BALANCE.cities.CITY_PRODUCTION_MULT).map(([city, mult]) => (
              <div
                key={city}
                className={`text-center rounded-game-lg px-2 py-1 shadow ${
                  Number(city) === player.city
                    ? 'border border-game-border-gold bg-game-gold/10 text-game-gold-bright'
                    : 'card-game text-game-text-muted'
                }`}
              >
                <p className="text-game-xs font-heading uppercase">City {city}</p>
                <p className="font-semibold">×{mult}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
