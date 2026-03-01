'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Tabs } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import { useFreeze } from '@/lib/hooks/useFreeze'
import type { Weapons, Resources } from '@/types/game'

interface Props {
  weapons: Weapons
  resources: Resources
}

type TabKey = 'attack' | 'defense' | 'spy' | 'scout'

const TABS = [
  { key: 'attack',  label: 'Attack Weapons' },
  { key: 'defense', label: 'Defense Weapons' },
  { key: 'spy',     label: 'Spy Gear' },
  { key: 'scout',   label: 'Scout Gear' },
]

const ATTACK_WEAPONS = [
  { key: 'slingshot',    label: 'Slingshot' },
  { key: 'boomerang',    label: 'Boomerang' },
  { key: 'pirate_knife', label: 'Pirate Knife' },
  { key: 'axe',          label: 'Axe' },
  { key: 'master_knife', label: 'Master Knife' },
  { key: 'knight_axe',   label: 'Knight Axe' },
  { key: 'iron_ball',    label: 'Iron Ball' },
] as const

const DEFENSE_WEAPONS = [
  { key: 'wood_shield',   label: 'Wood Shield' },
  { key: 'iron_shield',   label: 'Iron Shield' },
  { key: 'leather_armor', label: 'Leather Armor' },
  { key: 'chain_armor',   label: 'Chain Armor' },
  { key: 'plate_armor',   label: 'Plate Armor' },
  { key: 'mithril_armor', label: 'Mithril Armor' },
  { key: 'gods_armor',    label: "God's Armor" },
] as const

const SPY_WEAPONS = [
  { key: 'shadow_cloak', label: 'Shadow Cloak' },
  { key: 'dark_mask',    label: 'Dark Mask' },
  { key: 'elven_gear',   label: 'Elven Gear' },
] as const

const SCOUT_WEAPONS = [
  { key: 'scout_boots', label: 'Scout Boots' },
  { key: 'scout_cloak', label: 'Scout Cloak' },
  { key: 'elven_boots', label: 'Elven Boots' },
] as const

// Spy/Scout weapons mirror defense: max 1 each, cost gold
const SPY_PRICES: Record<string, number> = {
  shadow_cloak: 5000,
  dark_mask: 20000,
  elven_gear: 80000,
}
const SCOUT_PRICES: Record<string, number> = {
  scout_boots: 5000,
  scout_cloak: 20000,
  elven_boots: 80000,
}

export function ShopClient({ weapons, resources }: Props) {
  const { refresh } = usePlayer()
  const isFrozen = useFreeze()
  const [activeTab, setActiveTab] = useState<TabKey>('attack')
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [weaponState, setWeaponState] = useState(weapons)
  const [resourceState, setResourceState] = useState(resources)

  async function handleBuy(weaponKey: string, category: string) {
    const amt = parseInt(amounts[weaponKey] || '1') || 1
    setLoading(`buy-${weaponKey}`)
    setMessage(null)
    try {
      const res = await fetch('/api/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weapon: weaponKey, amount: amt, category }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Purchase failed', type: 'error' })
      } else {
        setMessage({ text: `Purchased ${amt}x ${weaponKey.replace(/_/g, ' ')}`, type: 'success' })
        if (data.weapons) setWeaponState(data.weapons)
        if (data.resources) setResourceState(data.resources)
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handleSell(weaponKey: string, category: string) {
    const amt = parseInt(amounts[weaponKey] || '1') || 1
    setLoading(`sell-${weaponKey}`)
    setMessage(null)
    try {
      const res = await fetch('/api/shop/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weapon: weaponKey, amount: amt, category }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Sale failed', type: 'error' })
      } else {
        setMessage({ text: `Sold ${amt}x ${weaponKey.replace(/_/g, ' ')}`, type: 'success' })
        if (data.weapons) setWeaponState(data.weapons)
        if (data.resources) setResourceState(data.resources)
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
            Weapons Shop
          </h1>
          <p className="text-game-text-secondary font-body mt-1">
            Equip your army with powerful weapons and gear
          </p>
        </div>
        <div className="flex flex-wrap gap-3 card-game p-2.5">
          <ResourceBadge type="gold" amount={resourceState.gold} showLabel />
          <ResourceBadge type="iron" amount={resourceState.iron} showLabel />
        </div>
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

      {/* Refund notice */}
      <div className="text-game-xs text-game-text-muted font-body card-game px-3 py-2">
        Sell refund: {(BALANCE.weapons.sellRefundPercent * 100).toFixed(0)}% of original cost
      </div>

      {/* Tabs */}
      <Tabs
        tabs={TABS}
        activeTab={activeTab}
        onChange={(k) => setActiveTab(k as TabKey)}
      />

      {/* Attack Weapons */}
      {activeTab === 'attack' && (
        <div className="panel-ornate p-5 space-y-3">
          <p className="text-game-xs text-game-text-muted font-body">Cost paid in Iron.</p>
          <div className="divider-gold" />
          {ATTACK_WEAPONS.map(({ key, label }) => {
            const cfg = BALANCE.weapons.attack[key]
            const owned = weaponState[key] as number
            const costIron = cfg.costIron
            const refund = Math.floor(costIron * BALANCE.weapons.sellRefundPercent)
            const amt = parseInt(amounts[key] || '1') || 1
            const canBuy = resourceState.iron >= costIron * amt && owned + amt <= cfg.maxPerPlayer
            const canSell = owned >= amt

            return (
              <div
                key={key}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-game-lg card-game"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                      {label}
                    </p>
                    <Badge variant="red">+{cfg.power} ATK power</Badge>
                    <Badge variant="default">Max {cfg.maxPerPlayer}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-game-xs font-body text-game-text-muted">
                    <span>
                      Cost: <span className="text-res-iron font-semibold">{formatNumber(costIron)} Iron</span>
                    </span>
                    <span>
                      Sell: <span className="text-res-iron font-semibold">{formatNumber(refund)} Iron</span>
                    </span>
                    <span>
                      Owned: <span className="text-game-gold font-semibold">{owned}</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Qty"
                    value={amounts[key] ?? ''}
                    min={1}
                    max={cfg.maxPerPlayer}
                    onChange={(e) => setAmounts((p) => ({ ...p, [key]: e.target.value }))}
                    className="w-20"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isFrozen || !canBuy || !!loading}
                    loading={loading === `buy-${key}`}
                    onClick={() => handleBuy(key, 'attack')}
                  >
                    Buy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isFrozen || !canSell || !!loading}
                    loading={loading === `sell-${key}`}
                    onClick={() => handleSell(key, 'attack')}
                  >
                    Sell
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Defense Weapons */}
      {activeTab === 'defense' && (
        <div className="panel-ornate p-5 space-y-3">
          <p className="text-game-xs text-game-text-muted font-body">Defense armor — max 1 each. Cost paid in Gold.</p>
          <div className="divider-gold" />
          {DEFENSE_WEAPONS.map(({ key, label }) => {
            const cfg = BALANCE.weapons.defense[key]
            const owned = weaponState[key] as number
            const costGold = cfg.costGold
            const refund = Math.floor(costGold * BALANCE.weapons.sellRefundPercent)
            const isGodsArmor = key === 'gods_armor'
            const canBuy = !owned && resourceState.gold >= costGold &&
              (!isGodsArmor || (resourceState.iron >= 500000 && resourceState.wood >= 300000))
            const canSell = owned > 0

            return (
              <div
                key={key}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-game-lg card-game"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                      {label}
                    </p>
                    <Badge variant="gold">×{cfg.multiplier} DEF</Badge>
                    {owned > 0 && <Badge variant="green">Owned</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-3 text-game-xs font-body text-game-text-muted">
                    <span>
                      Cost: <span className="text-res-gold font-semibold">{formatNumber(costGold)} Gold</span>
                    </span>
                    {isGodsArmor && (
                      <>
                        <span className="text-res-iron font-semibold">+ 500K Iron</span>
                        <span className="text-res-wood font-semibold">+ 300K Wood</span>
                      </>
                    )}
                    <span>
                      Sell: <span className="text-res-gold font-semibold">{formatNumber(refund)} Gold</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isFrozen || !canBuy || !!loading}
                    loading={loading === `buy-${key}`}
                    onClick={() => handleBuy(key, 'defense')}
                  >
                    {owned > 0 ? 'Owned' : 'Buy'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isFrozen || !canSell || !!loading}
                    loading={loading === `sell-${key}`}
                    onClick={() => handleSell(key, 'defense')}
                  >
                    Sell
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Spy Gear */}
      {activeTab === 'spy' && (
        <div className="panel-ornate p-5 space-y-3">
          <p className="text-game-xs text-game-text-muted font-body">Spy gear — max 1 each. Enhances spy power.</p>
          <div className="divider-gold" />
          {SPY_WEAPONS.map(({ key, label }) => {
            const owned = weaponState[key] as number
            const costGold = SPY_PRICES[key] ?? 0
            const refund = Math.floor(costGold * BALANCE.weapons.sellRefundPercent)
            const canBuy = !owned && resourceState.gold >= costGold
            const canSell = owned > 0

            return (
              <div
                key={key}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-game-lg card-game"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                      {label}
                    </p>
                    <Badge variant="purple">Spy Gear</Badge>
                    {owned > 0 && <Badge variant="green">Owned</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-3 text-game-xs font-body text-game-text-muted">
                    <span>
                      Cost: <span className="text-res-gold font-semibold">{formatNumber(costGold)} Gold</span>
                    </span>
                    <span>
                      Sell: <span className="text-res-gold font-semibold">{formatNumber(refund)} Gold</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="magic"
                    size="sm"
                    disabled={isFrozen || !canBuy || !!loading}
                    loading={loading === `buy-${key}`}
                    onClick={() => handleBuy(key, 'spy')}
                  >
                    {owned > 0 ? 'Owned' : 'Buy'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isFrozen || !canSell || !!loading}
                    loading={loading === `sell-${key}`}
                    onClick={() => handleSell(key, 'spy')}
                  >
                    Sell
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Scout Gear */}
      {activeTab === 'scout' && (
        <div className="panel-ornate p-5 space-y-3">
          <p className="text-game-xs text-game-text-muted font-body">Scout gear — max 1 each. Enhances scout power.</p>
          <div className="divider-gold" />
          {SCOUT_WEAPONS.map(({ key, label }) => {
            const owned = weaponState[key] as number
            const costGold = SCOUT_PRICES[key] ?? 0
            const refund = Math.floor(costGold * BALANCE.weapons.sellRefundPercent)
            const canBuy = !owned && resourceState.gold >= costGold
            const canSell = owned > 0

            return (
              <div
                key={key}
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-game-lg card-game"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                      {label}
                    </p>
                    <Badge variant="blue">Scout Gear</Badge>
                    {owned > 0 && <Badge variant="green">Owned</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-3 text-game-xs font-body text-game-text-muted">
                    <span>
                      Cost: <span className="text-res-gold font-semibold">{formatNumber(costGold)} Gold</span>
                    </span>
                    <span>
                      Sell: <span className="text-res-gold font-semibold">{formatNumber(refund)} Gold</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isFrozen || !canBuy || !!loading}
                    loading={loading === `buy-${key}`}
                    onClick={() => handleBuy(key, 'scout')}
                  >
                    {owned > 0 ? 'Owned' : 'Buy'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isFrozen || !canSell || !!loading}
                    loading={loading === `sell-${key}`}
                    onClick={() => handleSell(key, 'scout')}
                  >
                    Sell
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
