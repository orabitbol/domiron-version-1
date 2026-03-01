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
import type { Player, Resources, AttackResult } from '@/types/game'

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
  crushing_win:  'text-game-green-bright',
  win:           'text-game-green-bright',
  partial:       'text-game-gold-bright',
  draw:          'text-game-gold-bright',
  loss:          'text-game-red-bright',
  crushing_loss: 'text-game-red-bright',
}

const OUTCOME_LABELS: Record<string, string> = {
  crushing_win:  'Crushing Victory',
  win:           'Victory',
  partial:       'Draw',
  draw:          'Draw',
  loss:          'Defeat',
  crushing_loss: 'Crushing Defeat',
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
        {attackResult && (
          <div className="space-y-4">
            {/* Outcome headline */}
            <div className="text-center">
              <p
                className={`font-display text-game-2xl uppercase tracking-wide ${
                  OUTCOME_COLORS[attackResult.outcome] ?? 'text-game-text-white'
                }`}
              >
                {OUTCOME_LABELS[attackResult.outcome] ?? attackResult.outcome}
              </p>
            </div>

            {/* Power comparison — ECP vs ECP */}
            <div className="grid grid-cols-2 gap-3 text-game-sm font-body">
              <div className="bg-game-elevated border border-game-border rounded p-3">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">
                  Your Attack Power
                </p>
                <p className="text-game-text-white font-semibold text-game-lg">
                  {formatNumber(attackResult.attacker_ecp)}
                </p>
              </div>
              <div className="bg-game-elevated border border-game-border rounded p-3">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">
                  Defender Power
                </p>
                <p className="text-game-text-white font-semibold text-game-lg">
                  {formatNumber(attackResult.defender_ecp)}
                </p>
              </div>
            </div>

            {/* Contextual outcome explanation */}
            <div
              className={`rounded border px-3 py-2 font-body text-game-xs ${
                attackResult.outcome === 'win'
                  ? 'bg-game-green/10 border-green-900 text-game-green-bright'
                  : attackResult.outcome === 'partial'
                  ? 'bg-game-gold/10 border-yellow-900 text-yellow-300'
                  : 'bg-game-red/10 border-red-900 text-game-red-bright'
              }`}
            >
              {attackResult.outcome === 'win' && (
                <>Your attack power ({formatNumber(attackResult.attacker_ecp)}) overwhelmed the defender&apos;s defense ({formatNumber(attackResult.defender_ecp)}) by a ratio of {attackResult.ratio.toFixed(2)}×.</>
              )}
              {attackResult.outcome === 'partial' && (
                <>The battle was evenly matched. Your attack power ({formatNumber(attackResult.attacker_ecp)}) was close to the defender&apos;s defense ({formatNumber(attackResult.defender_ecp)}). Increase your training and troop count to achieve full victory.</>
              )}
              {attackResult.outcome === 'loss' && (
                <>Your attack power ({formatNumber(attackResult.attacker_ecp)}) was lower than the defender&apos;s defense power ({formatNumber(attackResult.defender_ecp)}). You need at least {formatNumber(Math.ceil(attackResult.defender_ecp * 1.3))} attack power to break through.</>
              )}
            </div>

            {/* Soldier losses */}
            <div className="space-y-2 text-game-sm font-body">
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Your Losses</span>
                <span className="text-game-red-bright font-semibold">{formatNumber(attackResult.attacker_losses)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Enemy Losses</span>
                <span className="text-game-green-bright font-semibold">{formatNumber(attackResult.defender_losses)}</span>
              </div>
              {attackResult.slaves_created > 0 && (
                <div className="flex justify-between">
                  <span className="text-game-text-secondary">Slaves Taken</span>
                  <span className="text-game-gold-bright font-semibold">{formatNumber(attackResult.slaves_created)}</span>
                </div>
              )}
            </div>

            {/* Plunder */}
            {(attackResult.gold_stolen > 0 || attackResult.iron_stolen > 0 ||
              attackResult.wood_stolen > 0 || attackResult.food_stolen > 0) && (
              <div className="border-t border-game-border pt-3">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">
                  Plundered
                </p>
                <div className="flex flex-wrap gap-3">
                  {attackResult.gold_stolen > 0 && <ResourceBadge type="gold" amount={attackResult.gold_stolen} showLabel />}
                  {attackResult.iron_stolen > 0 && <ResourceBadge type="iron" amount={attackResult.iron_stolen} showLabel />}
                  {attackResult.wood_stolen > 0 && <ResourceBadge type="wood" amount={attackResult.wood_stolen} showLabel />}
                  {attackResult.food_stolen > 0 && <ResourceBadge type="food" amount={attackResult.food_stolen} showLabel />}
                </div>
              </div>
            )}

            {/* No plunder note */}
            {attackResult.outcome !== 'loss' &&
              attackResult.gold_stolen === 0 && attackResult.iron_stolen === 0 &&
              attackResult.wood_stolen === 0 && attackResult.food_stolen === 0 && (
              <p className="text-game-xs text-game-text-muted font-body border-t border-game-border pt-3">
                No resources plundered — the defender&apos;s resource shield was active or their treasury was empty.
              </p>
            )}

            <Button variant="ghost" onClick={() => setAttackResult(null)}>
              Close
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
