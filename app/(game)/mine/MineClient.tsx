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

  const cityMult = BALANCE.production.cityMultipliers[player.city as keyof typeof BALANCE.production.cityMultipliers]
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
        <h1 className="font-display text-game-3xl text-game-gold-bright uppercase tracking-wide">
          Resource Allocation
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          Assign slaves and farmers to maximize production
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

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-game-surface border border-game-border rounded-lg p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">Slaves</p>
          <p className="text-game-lg text-game-text-white font-body font-semibold mt-0.5">{formatNumber(totalSlaves)}</p>
        </div>
        <div className="bg-game-surface border border-game-border rounded-lg p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">Farmers</p>
          <p className="text-game-lg text-game-text-white font-body font-semibold mt-0.5">{formatNumber(totalFarmers)}</p>
        </div>
        <div className="bg-game-surface border border-game-border rounded-lg p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">City</p>
          <p className="text-game-lg text-game-text-white font-body font-semibold mt-0.5">×{cityMult}</p>
        </div>
        <div className="bg-game-surface border border-game-border rounded-lg p-3 text-center">
          <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">Base Prod</p>
          <p className="text-game-lg text-game-text-white font-body font-semibold mt-0.5">{baseMin}–{baseMax}/unit</p>
        </div>
      </div>

      {/* Allocation form */}
      <div className="bg-game-surface border border-game-border rounded-lg p-4 space-y-4">
        <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
          Assign Workers
        </h2>

        <div className="space-y-4">
          {MINES.map(({ key, label, resourceType, description, available }) => {
            const assigned = parseInt(allocation[key]) || 0
            const prod = production(assigned)

            return (
              <div
                key={key}
                className="p-3 rounded-lg bg-game-elevated border border-game-border space-y-2"
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
                    <span className="text-game-text-white font-semibold">{prod}/tick</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Slave balance indicator */}
        <div
          className={`flex items-center justify-between rounded px-3 py-2 text-game-sm font-body ${
            isOverAllocated
              ? 'bg-game-red/10 border border-red-900 text-game-red-bright'
              : 'bg-game-elevated border border-game-border text-game-text-secondary'
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
      <div className="bg-game-surface border border-game-border rounded-lg p-4">
        <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white mb-3">
          Production Formula
        </h2>
        <div className="space-y-2 text-game-sm font-body text-game-text-secondary">
          <p>
            Production per tick = Units × random({baseMin}–{baseMax}) × City Multiplier (×{cityMult})
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
            {Object.entries(BALANCE.production.cityMultipliers).map(([city, mult]) => (
              <div
                key={city}
                className={`text-center rounded px-2 py-1 border ${
                  Number(city) === player.city
                    ? 'border-game-border-gold bg-game-gold/10 text-game-gold-bright'
                    : 'border-game-border bg-game-elevated text-game-text-muted'
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
