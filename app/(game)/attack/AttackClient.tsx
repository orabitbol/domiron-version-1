'use client'

import { useState, useMemo } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { GameTable } from '@/components/ui/game-table'
import { EmptyState } from '@/components/ui/game-table'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { Player, Resources, AttackResult, AttackBlocker } from '@/types/game'

interface Target {
  id: string
  army_name: string
  rank_city: number | null
  tribe_name: string | null
  soldiers: number
  is_vacation: boolean
  resource_shield_active: boolean
  soldier_shield_active: boolean
}

interface Props {
  player: Player
  targets: Target[]
  resources: Resources | null
}

const OUTCOME_COLORS: Record<string, string> = {
  win:     'text-game-green-bright',
  partial: 'text-game-gold-bright',
  loss:    'text-game-red-bright',
}

const OUTCOME_LABELS: Record<string, string> = {
  win:     'Victory',
  partial: 'Draw',
  loss:    'Defeat',
}

/** Human-readable explanation for each blocker. i18n-ready: replace values with t() calls. */
const BLOCKER_LABELS: Record<AttackBlocker, string> = {
  resource_shield:    'Enemy Resource Shield was active — resources were protected',
  soldier_shield:     'Enemy Soldier Shield was active — soldiers were protected',
  defender_protected: 'Target is under New Player Protection (24h)',
  kill_cooldown:      `Kill Cooldown active — you recently killed their troops (${BALANCE.combat.KILL_COOLDOWN_HOURS}h cooldown)`,
  attacker_protected: 'You are under New Player Protection — your soldiers took no losses',
  loot_decay:         'Loot Decay — repeated attacks on same target reduce plunder (anti-farm)',
}

// ─────────────────────────────────────────
// BATTLE REPORT — extracted component for clarity
// ─────────────────────────────────────────

function BattleReport({ result, onClose }: { result: AttackResult; onClose: () => void }) {
  const hasLoot = result.gold_stolen > 0 || result.iron_stolen > 0 ||
                  result.wood_stolen > 0 || result.food_stolen > 0
  const hasGains = hasLoot || result.slaves_created > 0
  const showGainedSection = result.outcome !== 'loss'

  // Loot decay multiplier for display
  const decayIndex = result.blockers.includes('loot_decay')
    ? Math.min((BALANCE.antiFarm?.LOOT_DECAY_STEPS?.length ?? 1) - 1, 1)
    : -1
  const decayMult = decayIndex >= 0
    ? (BALANCE.antiFarm?.LOOT_DECAY_STEPS?.[decayIndex] ?? 0.7)
    : null

  const outcomeColor = OUTCOME_COLORS[result.outcome] ?? 'text-game-text-white'
  const outcomeLabel = OUTCOME_LABELS[result.outcome] ?? result.outcome

  return (
    <div className="space-y-4">

      {/* ── Section 1: Outcome headline ──────────────────────────────── */}
      <div className="text-center space-y-1">
        <p className={`font-display text-game-3xl uppercase tracking-wide ${outcomeColor}`}>
          {outcomeLabel}
        </p>
        <p className="text-game-text-muted font-body text-game-xs">
          Power ratio: <span className="font-semibold text-game-text-white">{result.ratio.toFixed(2)}×</span>
        </p>
      </div>

      {/* ── Section 2: Power comparison ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-game-elevated border border-game-border rounded p-3">
          <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">Your Attack Power</p>
          <p className={`font-semibold text-game-lg ${outcomeColor}`}>{formatNumber(result.attacker_ecp)}</p>
        </div>
        <div className="bg-game-elevated border border-game-border rounded p-3">
          <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">Defender Power</p>
          <p className="font-semibold text-game-lg text-game-text-white">{formatNumber(result.defender_ecp)}</p>
        </div>
      </div>

      {/* ── Section 3: Contextual explanation ───────────────────────── */}
      <div className={`rounded border px-3 py-2 font-body text-game-xs ${
        result.outcome === 'win'
          ? 'bg-game-green/10 border-green-900 text-game-green-bright'
          : result.outcome === 'partial'
          ? 'bg-game-gold/10 border-yellow-900 text-yellow-300'
          : 'bg-game-red/10 border-red-900 text-game-red-bright'
      }`}>
        {result.outcome === 'win' && (
          `Your attack power overwhelmed the defender's defense (${formatNumber(result.attacker_ecp)} vs ${formatNumber(result.defender_ecp)}).`
        )}
        {result.outcome === 'partial' && (
          `Close battle. Your power (${formatNumber(result.attacker_ecp)}) nearly matched their defense (${formatNumber(result.defender_ecp)}). Train more troops for a full victory.`
        )}
        {result.outcome === 'loss' && (
          `Your power (${formatNumber(result.attacker_ecp)}) was outmatched. You need at least ${formatNumber(Math.ceil(result.defender_ecp * BALANCE.combat.WIN_THRESHOLD))} attack power to win.`
        )}
      </div>

      {/* ── Section 4: You Spent ─────────────────────────────────────── */}
      <div className="bg-game-surface border border-game-border rounded p-3">
        <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">You Spent</p>
        <div className="flex gap-4 font-body text-game-sm">
          <span className="flex items-center gap-1.5">
            <span className="text-game-text-muted">Turns:</span>
            <span className="text-game-text-white font-semibold">{result.turns_used}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-game-text-muted">Food:</span>
            <ResourceBadge type="food" amount={result.food_cost} />
          </span>
        </div>
      </div>

      {/* ── Section 5: Combat results (losses) ──────────────────────── */}
      <div className="bg-game-surface border border-game-border rounded p-3 space-y-2">
        <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">Combat Results</p>
        <div className="flex justify-between font-body text-game-sm">
          <span className="text-game-text-secondary">Your Losses</span>
          <span className={`font-semibold ${result.attacker_losses > 0 ? 'text-game-red-bright' : 'text-game-text-muted'}`}>
            {formatNumber(result.attacker_losses)} soldiers
          </span>
        </div>
        <div className="flex justify-between font-body text-game-sm">
          <span className="text-game-text-secondary">Enemy Losses</span>
          <span className={`font-semibold ${result.defender_losses > 0 ? 'text-game-green-bright' : 'text-game-text-muted'}`}>
            {formatNumber(result.defender_losses)} soldiers
          </span>
        </div>
        {result.slaves_created > 0 && (
          <div className="flex justify-between font-body text-game-sm">
            <span className="text-game-text-secondary">Slaves Taken</span>
            <span className="font-semibold text-game-gold-bright">{formatNumber(result.slaves_created)}</span>
          </div>
        )}
      </div>

      {/* ── Section 6: You Gained ────────────────────────────────────── */}
      {showGainedSection && (
        <div className={`border rounded p-3 ${
          hasGains
            ? 'bg-game-green/5 border-green-900'
            : 'bg-game-surface border-game-border'
        }`}>
          <p className="text-game-xs font-heading uppercase tracking-wide mb-2 text-game-text-muted">
            You Gained
          </p>
          {hasGains ? (
            <div className="space-y-2">
              {result.slaves_created > 0 && (
                <div className="flex items-center gap-2 font-body text-game-sm">
                  <span className="text-game-text-secondary">Slaves:</span>
                  <span className="text-game-gold-bright font-semibold">{formatNumber(result.slaves_created)}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                {result.gold_stolen > 0 && <ResourceBadge type="gold" amount={result.gold_stolen} showLabel />}
                {result.iron_stolen > 0 && <ResourceBadge type="iron" amount={result.iron_stolen} showLabel />}
                {result.wood_stolen > 0 && <ResourceBadge type="wood" amount={result.wood_stolen} showLabel />}
                {result.food_stolen > 0 && <ResourceBadge type="food" amount={result.food_stolen} showLabel />}
              </div>
            </div>
          ) : (
            <p className="text-game-sm text-game-text-muted font-body">Nothing gained this battle.</p>
          )}
        </div>
      )}

      {/* ── Section 7: Why box (blockers) ────────────────────────────── */}
      {result.blockers.length > 0 && (
        <div className="bg-game-surface border border-game-border rounded p-3">
          <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">Why</p>
          <ul className="space-y-1.5">
            {result.blockers.map((blocker) => {
              const label = blocker === 'loot_decay' && decayMult !== null
                ? `${BLOCKER_LABELS.loot_decay} (×${decayMult})`
                : BLOCKER_LABELS[blocker]
              return (
                <li key={blocker} className="font-body text-game-xs text-game-text-secondary flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">•</span>
                  <span>{label}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <Button variant="ghost" onClick={onClose}>Close</Button>
    </div>
  )
}

/** Two small dots: resource shield (gold) + soldier shield (blue) */
function ShieldIndicators({ resource, soldier }: { resource: boolean; soldier: boolean }) {
  return (
    <div className="flex gap-1.5 items-center">
      <span
        title="Resource Shield"
        className={`inline-block w-2.5 h-2.5 rounded-full border ${
          resource
            ? 'bg-game-gold-bright border-game-gold-bright'
            : 'bg-transparent border-game-border'
        }`}
      />
      <span
        title="Soldier Shield"
        className={`inline-block w-2.5 h-2.5 rounded-full border ${
          soldier
            ? 'bg-blue-400 border-blue-400'
            : 'bg-transparent border-game-border'
        }`}
      />
    </div>
  )
}

export function AttackClient({ player, targets, resources }: Props) {
  const { refresh } = usePlayer()
  const [search, setSearch] = useState('')
  const [turns, setTurns] = useState<Record<string, string>>({})
  const [confirmTarget, setConfirmTarget] = useState<Target | null>(null)
  const [attackResult, setAttackResult] = useState<AttackResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [playerTurns, setPlayerTurns] = useState(player.turns)
  const [playerResources, setPlayerResources] = useState(resources)

  const filtered = useMemo(
    () =>
      targets.filter((t) =>
        t.army_name.toLowerCase().includes(search.toLowerCase())
      ),
    [targets, search]
  )

  function getTargetTurns(targetId: string) {
    return Math.max(1, Math.min(10, parseInt(turns[targetId] || '1') || 1))
  }

  function foodCost(t: number) {
    return t * BALANCE.combat.foodCostPerTurn
  }

  async function executeAttack() {
    if (!confirmTarget) return
    const t = getTargetTurns(confirmTarget.id)
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defender_id: confirmTarget.id, turns: t }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Attack failed', type: 'error' })
        setConfirmTarget(null)
      } else {
        setAttackResult(data.result)
        setConfirmTarget(null)
        if (data.turns !== undefined) setPlayerTurns(data.turns)
        if (data.resources) setPlayerResources(data.resources)
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-game-3xl text-game-gold-bright uppercase tracking-wide">
            Attack
          </h1>
          <p className="text-game-text-secondary font-body mt-1">
            City {player.city} — {filtered.length} targets available
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-game-surface border border-game-border rounded-lg px-3 py-2 text-center">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">Turns</p>
            <p className="text-game-base text-game-text-white font-semibold">{playerTurns} / {player.max_turns}</p>
          </div>
          {playerResources && (
            <ResourceBadge type="food" amount={playerResources.food} showLabel />
          )}
        </div>
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

      {/* Search */}
      <Input
        placeholder="Search by army name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Shield legend */}
      <div className="flex gap-4 text-game-xs font-body text-game-text-muted">
        <span className="flex gap-1.5 items-center">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-game-gold-bright" />
          Resource Shield
        </span>
        <span className="flex gap-1.5 items-center">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400" />
          Soldier Shield
        </span>
        <span className="flex gap-1.5 items-center">
          <span className="inline-block w-2.5 h-2.5 rounded-full border border-game-border" />
          Inactive
        </span>
      </div>

      {/* Targets table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No Targets Found"
          description="No enemies match your search or are available to attack."
        />
      ) : (
        <GameTable
          headers={['Rank', 'Army Name', 'Tribe', 'Soldiers', 'Shields', 'Turns', 'Food Cost', 'Action']}
          striped
          hoverable
          rows={filtered.map((target) => {
            const t = getTargetTurns(target.id)
            const cost = foodCost(t)
            const canAttack =
              playerTurns >= t &&
              (playerResources?.food ?? 0) >= cost &&
              !target.is_vacation

            return [
              <span key="rank" className="text-game-sm font-body tabular-nums">
                {target.rank_city ? `#${target.rank_city}` : '—'}
              </span>,
              <div key="army">
                <span className="font-heading text-game-sm uppercase text-game-text-white">
                  {target.army_name}
                </span>
                {target.is_vacation && (
                  <Badge variant="blue" className="ml-2">Vacation</Badge>
                )}
              </div>,
              <span key="tribe" className="text-game-sm font-body text-game-text-muted">
                {target.tribe_name ?? '—'}
              </span>,
              <span key="soldiers" className="text-game-sm font-body tabular-nums">
                {formatNumber(target.soldiers)}
              </span>,
              <ShieldIndicators
                key="shields"
                resource={target.resource_shield_active}
                soldier={target.soldier_shield_active}
              />,
              <Input
                key="turns"
                type="number"
                value={turns[target.id] ?? '1'}
                min={1}
                max={10}
                onChange={(e) =>
                  setTurns((prev) => ({ ...prev, [target.id]: e.target.value }))
                }
                className="w-16"
              />,
              <ResourceBadge key="cost" type="food" amount={cost} />,
              <Button
                key="attack"
                variant="danger"
                size="sm"
                disabled={!canAttack}
                onClick={() => setConfirmTarget(target)}
              >
                Attack
              </Button>,
            ]
          })}
        />
      )}

      {/* Attack confirmation modal */}
      <Modal
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title="Confirm Attack"
        size="sm"
      >
        {confirmTarget && (
          <div className="space-y-4">
            <div className="space-y-2 text-game-sm font-body">
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Target</span>
                <span className="text-game-text-white font-heading uppercase">{confirmTarget.army_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Shields</span>
                <ShieldIndicators
                  resource={confirmTarget.resource_shield_active}
                  soldier={confirmTarget.soldier_shield_active}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Turns</span>
                <span className="text-game-text-white font-semibold">{getTargetTurns(confirmTarget.id)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Food Cost</span>
                <ResourceBadge type="food" amount={foodCost(getTargetTurns(confirmTarget.id))} />
              </div>
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Your Turns</span>
                <span className="text-game-text-white">{playerTurns}</span>
              </div>
            </div>
            <p className="text-game-xs text-game-text-muted font-body">
              Victory grants resources and slaves. Defeat costs soldiers. Choose wisely.
            </p>
            <div className="flex gap-3 pt-2">
              <Button
                variant="danger"
                loading={loading}
                onClick={executeAttack}
              >
                Attack!
              </Button>
              <Button
                variant="ghost"
                disabled={loading}
                onClick={() => setConfirmTarget(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Battle result modal */}
      <Modal
        isOpen={!!attackResult}
        onClose={() => setAttackResult(null)}
        title="Battle Report"
        size="md"
      >
        {attackResult && <BattleReport result={attackResult} onClose={() => setAttackResult(null)} />}
      </Modal>
    </div>
  )
}
