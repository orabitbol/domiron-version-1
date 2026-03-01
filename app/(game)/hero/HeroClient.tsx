'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { Hero, HeroSpell } from '@/types/game'
import type { PlayerHeroEffect } from '@/lib/game/hero-effects'

// ─────────────────────────────────────────
// DEFENSIVE CONFIG READ — never crash if config key changes
// ─────────────────────────────────────────
const CFG = {
  SOLDIER_MANA:  BALANCE.hero.SOLDIER_SHIELD_MANA  ?? 10,
  RESOURCE_MANA: BALANCE.hero.RESOURCE_SHIELD_MANA ?? 10,
  SHIELD_HOURS:  BALANCE.hero.SHIELD_ACTIVE_HOURS   ?? 23,
  XP_PER_LEVEL:  BALANCE.hero.xpPerLevel            ?? 100,
} as const

// ─────────────────────────────────────────
// SPELL TREE CONFIG
// ─────────────────────────────────────────
const SPELL_CATEGORIES = [
  { key: 'combat',     label: 'Combat',     color: 'text-game-red-bright' },
  { key: 'defense',    label: 'Defense',    color: 'text-game-gold-bright' },
  { key: 'spy',        label: 'Espionage',  color: 'text-game-purple-bright' },
  { key: 'scout',      label: 'Scouting',   color: 'text-blue-400' },
  { key: 'production', label: 'Production', color: 'text-game-green-bright' },
  { key: 'utility',    label: 'Utility',    color: 'text-game-text-secondary' },
]

function buildSpellKey(category: string, col: number, row: number) {
  return `${category}_${col}_${row}`
}

// ─────────────────────────────────────────
// SHIELD STATUS HELPERS
// ─────────────────────────────────────────

/** Returns remaining time as a human-readable string. Null if expired. */
function timeRemaining(endsAt: string): string | null {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

type ShieldStatus =
  | { state: 'active';    endsAt: string }
  | { state: 'cooldown';  cooldownEndsAt: string }
  | { state: 'available' }

function getShieldStatus(
  effects: PlayerHeroEffect[],
  type: 'SOLDIER_SHIELD' | 'RESOURCE_SHIELD',
): ShieldStatus {
  const now = Date.now()
  const matching = effects.filter((e) => e.type === type)
  if (matching.length === 0) return { state: 'available' }

  // Sort most recent first
  const sorted = [...matching].sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
  )
  const latest = sorted[0]

  if (now < new Date(latest.ends_at).getTime()) {
    return { state: 'active', endsAt: latest.ends_at }
  }
  if (latest.cooldown_ends_at && now < new Date(latest.cooldown_ends_at).getTime()) {
    return { state: 'cooldown', cooldownEndsAt: latest.cooldown_ends_at }
  }
  return { state: 'available' }
}

// ─────────────────────────────────────────
// PROPS
// ─────────────────────────────────────────

interface Props {
  hero:          Hero
  heroSpells:    HeroSpell[]
  activeEffects: PlayerHeroEffect[]  // owner's own effects — allows shield status + countdown
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function HeroClient({ hero: initialHero, heroSpells: initialSpells, activeEffects }: Props) {
  const { refresh } = usePlayer()
  const [hero, setHero] = useState(initialHero)
  const [purchasedSpells, setPurchasedSpells] = useState<Set<string>>(
    new Set<string>(initialSpells.map((s) => s.spell_key))
  )
  const [localEffects, setLocalEffects] = useState<PlayerHeroEffect[]>(activeEffects)
  const [loading, setLoading]           = useState<string | null>(null)
  const [shieldLoading, setShieldLoading] = useState<string | null>(null)
  const [message, setMessage]           = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const xpForNextLevel = hero.level * CFG.XP_PER_LEVEL
  const xpPct          = Math.min(100, Math.round((hero.xp / xpForNextLevel) * 100))
  const manaPct        = Math.min(100, Math.round((hero.mana / 100) * 100))

  const manaPerTickTotal =
    (BALANCE.hero.manaPerTick?.base ?? 1) +
    (hero.level >= 10 ? (BALANCE.hero.manaPerTick?.level10bonus ?? 0) : 0) +
    (hero.level >= 50 ? (BALANCE.hero.manaPerTick?.level50bonus ?? 0) : 0)

  // Current shield statuses from local effects (updated optimistically on activation)
  const soldierStatus   = getShieldStatus(localEffects, 'SOLDIER_SHIELD')
  const resourceStatus  = getShieldStatus(localEffects, 'RESOURCE_SHIELD')

  // ── Spell purchase ─────────────────────────────────────────────────────────
  async function handlePurchaseSpell(spellKey: string) {
    if (hero.spell_points <= 0) return
    setLoading(spellKey)
    setMessage(null)
    try {
      const res = await fetch('/api/hero/spell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spell_key: spellKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Failed to purchase spell', type: 'error' })
      } else {
        setMessage({ text: 'Spell learned!', type: 'success' })
        setPurchasedSpells((prev) => new Set<string>([...Array.from(prev), spellKey]))
        setHero((prev) => ({ ...prev, spell_points: prev.spell_points - 1 }))
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  // ── Shield activation ──────────────────────────────────────────────────────
  async function handleActivateShield(shieldType: 'soldier_shield' | 'resource_shield') {
    const manaCost = shieldType === 'soldier_shield' ? CFG.SOLDIER_MANA : CFG.RESOURCE_MANA
    if (hero.mana < manaCost) return
    setShieldLoading(shieldType)
    setMessage(null)
    try {
      // Canonical endpoint: POST /api/hero/activate-shield
      // shield_type must be 'soldier_shield' | 'resource_shield' (matches route schema)
      const res = await fetch('/api/hero/activate-shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shield_type: shieldType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Failed to activate shield', type: 'error' })
      } else {
        const label = shieldType === 'soldier_shield' ? 'Soldier Shield' : 'Resource Shield'
        setMessage({ text: `${label} activated for ${CFG.SHIELD_HOURS}h!`, type: 'success' })
        setHero((prev) => ({ ...prev, mana: prev.mana - manaCost }))
        // Immediately reflect new shield in local effects so status badge updates without waiting for refresh
        const effectType = shieldType === 'soldier_shield' ? 'SOLDIER_SHIELD' : 'RESOURCE_SHIELD' as const
        setLocalEffects((prev) => [
          ...prev,
          {
            id:               `local-${Date.now()}`,
            player_id:        '',
            type:             effectType,
            starts_at:        new Date().toISOString(),
            ends_at:          data.data.ends_at,
            cooldown_ends_at: data.data.cooldown_ends_at,
            metadata:         null,
          },
        ])
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setShieldLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-game-3xl text-game-gold-bright uppercase tracking-wide">
          Hero
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          Level up your hero and master powerful spells
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

      {/* Hero Stats */}
      <div className="bg-game-surface border-2 border-game-purple rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-heading text-game-xl text-game-purple-bright uppercase tracking-wide">
              Level {hero.level}
            </h2>
            {hero.spell_points > 0 && (
              <Badge variant="gold" className="mt-1">{hero.spell_points} Spell Points Available</Badge>
            )}
          </div>
          <div className="text-right">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">Mana</p>
            <ResourceBadge type="mana" amount={hero.mana} />
            <p className="text-game-xs text-game-text-muted font-body mt-0.5">+{manaPerTickTotal}/tick</p>
          </div>
        </div>

        {/* XP Bar */}
        <div>
          <div className="flex justify-between text-game-xs font-body text-game-text-muted mb-1">
            <span>XP</span>
            <span>{formatNumber(hero.xp)} / {formatNumber(xpForNextLevel)}</span>
          </div>
          <div className="w-full bg-game-elevated rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-game-purple to-game-purple-bright transition-all"
              style={{ width: `${xpPct}%` }}
            />
          </div>
          <p className="text-game-xs text-game-text-muted font-body mt-1">{xpPct}% to level {hero.level + 1}</p>
        </div>

        {/* Mana Bar */}
        <div>
          <div className="flex justify-between text-game-xs font-body text-game-text-muted mb-1">
            <span>Mana</span>
            <span>{hero.mana} / 100</span>
          </div>
          <div className="w-full bg-game-elevated rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full bg-gradient-to-r from-blue-700 to-blue-400 transition-all"
              style={{ width: `${manaPct}%` }}
            />
          </div>
        </div>

        {/* Mana regen info */}
        <div className="grid grid-cols-3 gap-3 text-game-xs font-body text-game-text-muted pt-2 border-t border-game-border">
          <div>
            <span className="font-semibold text-game-text">Base: </span>
            +{BALANCE.hero.manaPerTick?.base ?? 1}/tick
          </div>
          {hero.level >= 10 && (
            <div>
              <span className="font-semibold text-game-text">Lvl 10+: </span>
              +{BALANCE.hero.manaPerTick?.level10bonus ?? 0}/tick
            </div>
          )}
          {hero.level >= 50 && (
            <div>
              <span className="font-semibold text-game-text">Lvl 50+: </span>
              +{BALANCE.hero.manaPerTick?.level50bonus ?? 0}/tick
            </div>
          )}
        </div>
      </div>

      {/* Shields */}
      <div className="bg-game-surface border border-game-border rounded-lg p-4">
        <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white mb-3">
          Active Shields
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Soldier Shield */}
          <ShieldCard
            label="Soldier Shield"
            description={`Protects soldiers from attack losses for ${CFG.SHIELD_HOURS}h`}
            accentClass="text-game-red-bright"
            manaCost={CFG.SOLDIER_MANA}
            currentMana={hero.mana}
            status={soldierStatus}
            loading={shieldLoading === 'soldier_shield'}
            onActivate={() => handleActivateShield('soldier_shield')}
            buttonVariant="danger"
          />

          {/* Resource Shield */}
          <ShieldCard
            label="Resource Shield"
            description={`Protects resources from theft for ${CFG.SHIELD_HOURS}h`}
            accentClass="text-game-gold-bright"
            manaCost={CFG.RESOURCE_MANA}
            currentMana={hero.mana}
            status={resourceStatus}
            loading={shieldLoading === 'resource_shield'}
            onActivate={() => handleActivateShield('resource_shield')}
            buttonVariant="primary"
          />

        </div>
        <p className="text-game-xs text-game-text-muted font-body mt-3">
          Shield duration: {CFG.SHIELD_HOURS}h active + {BALANCE.hero.SHIELD_COOLDOWN_HOURS ?? 1}h cooldown.
          Your shield status is visible to other players (active/inactive only — no timer shown).
        </p>
      </div>

      {/* Spell Tree */}
      <div className="bg-game-surface border border-game-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
            Spell Tree
          </h2>
          <Badge variant={hero.spell_points > 0 ? 'gold' : 'default'}>
            {hero.spell_points} Points
          </Badge>
        </div>

        <div className="space-y-6">
          {SPELL_CATEGORIES.map((category) => (
            <div key={category.key}>
              <h3 className={`font-heading text-game-sm uppercase tracking-wider mb-3 ${category.color}`}>
                {category.label}
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((col) => (
                  <div key={col} className="space-y-2">
                    {[1, 2, 3, 4, 5].map((row) => {
                      const spellKey    = buildSpellKey(category.key, col, row)
                      const isPurchased = purchasedSpells.has(spellKey)
                      const prevKey     = row > 1 ? buildSpellKey(category.key, col, row - 1) : null
                      const isUnlocked  = !prevKey || purchasedSpells.has(prevKey)

                      return (
                        <button
                          key={row}
                          disabled={isPurchased || !isUnlocked || hero.spell_points <= 0 || loading === spellKey}
                          onClick={() => handlePurchaseSpell(spellKey)}
                          className={`w-full rounded border p-2 text-center transition-colors duration-150 font-body text-game-xs cursor-pointer disabled:cursor-not-allowed ${
                            isPurchased
                              ? 'bg-game-purple/30 border-game-purple text-game-purple-bright'
                              : isUnlocked && hero.spell_points > 0
                              ? 'bg-game-elevated border-game-border text-game-text hover:border-game-border-gold hover:text-game-text-white'
                              : 'bg-game-bg border-game-border/50 text-game-text-muted opacity-50'
                          }`}
                        >
                          {isPurchased ? '✓' : isUnlocked ? `Tier ${row}` : '🔒'}
                          <span className="block text-game-xs opacity-70">
                            {category.key.slice(0, 3)} {col}-{row}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-game-xs text-game-text-muted font-body mt-4">
          Unlock spells from top to bottom in each column. Each spell costs 1 spell point (gained on level up).
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// SHIELD CARD — extracted to keep JSX readable
// ─────────────────────────────────────────

interface ShieldCardProps {
  label:         string
  description:   string
  accentClass:   string
  manaCost:      number
  currentMana:   number
  status:        ShieldStatus
  loading:       boolean
  onActivate:    () => void
  buttonVariant: 'danger' | 'primary'
}

function ShieldCard({
  label, description, accentClass,
  manaCost, currentMana, status,
  loading, onActivate, buttonVariant,
}: ShieldCardProps) {
  const canActivate = status.state === 'available' && currentMana >= manaCost && !loading

  return (
    <div className="p-3 rounded-lg bg-game-elevated border border-game-border">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`font-heading text-game-sm uppercase tracking-wide ${accentClass}`}>
              {label}
            </p>
            {/* Status badge — owner sees active/cooldown/available */}
            {status.state === 'active' && (
              <span className="inline-flex items-center gap-1 text-game-xs text-game-green-bright font-body">
                <span className="inline-block w-2 h-2 rounded-full bg-game-green-bright" />
                Active
              </span>
            )}
            {status.state === 'cooldown' && (
              <span className="text-game-xs text-game-text-muted font-body">Cooldown</span>
            )}
          </div>

          <p className="text-game-xs text-game-text-muted font-body mt-0.5">{description}</p>

          {/* Countdown — visible only to shield owner */}
          {status.state === 'active' && (
            <p className="text-game-xs text-game-green-bright font-body mt-1">
              Expires in {timeRemaining(status.endsAt) ?? 'soon'}
            </p>
          )}
          {status.state === 'cooldown' && (
            <p className="text-game-xs text-game-text-muted font-body mt-1">
              Available in {timeRemaining(status.cooldownEndsAt) ?? 'soon'}
            </p>
          )}

          <div className="mt-2">
            <ResourceBadge type="mana" amount={manaCost} showLabel />
          </div>
        </div>

        <Button
          variant={buttonVariant}
          size="sm"
          disabled={!canActivate}
          loading={loading}
          onClick={onActivate}
        >
          {status.state === 'active'   ? 'Active'   :
           status.state === 'cooldown' ? 'Cooldown' : 'Activate'}
        </Button>
      </div>
    </div>
  )
}
