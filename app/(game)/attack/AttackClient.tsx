'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
import { useFreeze } from '@/lib/hooks/useFreeze'
import type { Player, Resources, BattleReport, BattleReportReason } from '@/types/game'

interface Target {
  id: string
  army_name: string
  rank_city: number | null
  tribe_name: string | null
  soldiers: number
  /** Unbanked gold visible to all players in the same city — mirrors reference game. */
  gold: number
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
  WIN:     'text-game-green-bright',
  PARTIAL: 'text-game-gold-bright',
  LOSS:    'text-game-red-bright',
}

const OUTCOME_LABELS: Record<string, string> = {
  WIN:     'Victory',
  PARTIAL: 'Draw',
  LOSS:    'Defeat',
}

/** Human-readable labels for each reason code. i18n-ready: replace values with t() calls. */
const REASON_LABELS: Record<BattleReportReason, string> = {
  OUTCOME_LOSS_NO_LOOT:         'You lost the battle — no loot is gained on defeat',
  DEFENDER_PROTECTED:           'Target has New Player Protection (24h) — no loot, no soldier losses',
  RESOURCE_SHIELD_ACTIVE:       'Enemy Resource Shield was active — resources were protected',
  NO_UNBANKED_RESOURCES:        'Enemy had no unbanked resources to steal',
  KILL_COOLDOWN_NO_LOSSES:      `Kill Cooldown active (${BALANCE.combat.KILL_COOLDOWN_HOURS}h) — defender soldier losses blocked`,
  ATTACKER_PROTECTED_NO_LOSSES: 'You are under New Player Protection — your soldiers took no losses',
  SOLDIER_SHIELD_NO_LOSSES:     'Enemy Soldier Shield was active — their soldiers were protected',
  LOOT_DECAY_REDUCED:           'Repeated attacks on same target reduce plunder (anti-farm)',
}

// ─────────────────────────────────────────
// BATTLE REPORT MODAL — renders from BattleReport type only, no guessing
// ─────────────────────────────────────────

function BattleReportModal({ report, onClose }: { report: BattleReport; onClose: () => void }) {
  const allGainsZero =
    report.gained.loot.gold === 0 &&
    report.gained.loot.iron === 0 &&
    report.gained.loot.wood === 0 &&
    report.gained.loot.food === 0

  const outcomeColor = OUTCOME_COLORS[report.outcome] ?? 'text-game-text-white'
  const outcomeLabel = OUTCOME_LABELS[report.outcome] ?? report.outcome

  return (
    <div className="space-y-4">

      {/* ── A: Outcome header ──────────────────────────────────────── */}
      <div className="text-center space-y-1">
        <p className={`font-display text-game-4xl uppercase tracking-wide text-title-glow ${outcomeColor}`}>
          {outcomeLabel}
        </p>
        <p className="text-game-text-muted font-body text-game-xs">
          Power Ratio: <span className="font-semibold text-game-text-white">{report.ratio.toFixed(2)}×</span>
        </p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">Your Attack</p>
            <p className={`font-semibold text-game-lg ${outcomeColor}`}>{formatNumber(report.attacker.ecp_attack)}</p>
          </div>
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">Enemy Defense</p>
            <p className="font-semibold text-game-lg text-game-text-white">{formatNumber(report.defender.ecp_defense)}</p>
          </div>
        </div>
      </div>

      {/* ── B: You Spent ───────────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
        <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">You Spent</p>
        <div className="flex gap-4 font-body text-game-sm">
          <span className="flex items-center gap-1.5">
            <span className="text-game-text-muted">Turns:</span>
            <span className="text-game-text-white font-semibold">{report.attacker.turns_spent}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-game-text-muted">Food:</span>
            <ResourceBadge type="food" amount={report.attacker.food_spent} />
          </span>
        </div>
      </div>

      {/* ── C: Combat Results ──────────────────────────────────────── */}
      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
        <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">Combat Results</p>
        <div className="font-body text-game-sm">
          <div className="grid grid-cols-3 gap-2 text-game-xs text-game-text-muted font-heading uppercase pb-1 mb-2">
            <span>Unit</span>
            <span>You Lost</span>
            <span>Enemy Lost</span>
          </div>
          <div className="divider-ornate mb-2" />
          <div className="grid grid-cols-3 gap-2 py-1">
            <span className="text-game-text-secondary">Soldiers</span>
            <span className={report.attacker.losses.soldiers > 0 ? 'text-game-red-bright font-semibold' : 'text-game-text-muted'}>
              {formatNumber(report.attacker.losses.soldiers)}
            </span>
            <span className={report.defender.losses.soldiers > 0 ? 'text-game-green-bright font-semibold' : 'text-game-text-muted'}>
              {formatNumber(report.defender.losses.soldiers)}
            </span>
          </div>
        </div>
      </div>

      {/* ── D: You Gained — always shown, even when all zeros ─────── */}
      <div className={`border rounded-game-lg p-3 shadow-engrave ${allGainsZero ? 'bg-gradient-to-b from-game-elevated to-game-surface border-game-border' : 'bg-game-green/5 border-green-900'}`}>
        <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">You Gained</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-body text-game-sm">
          {(['gold', 'iron', 'wood', 'food'] as const).map((res) => (
            <div key={res} className="flex justify-between">
              <span className="text-game-text-secondary capitalize">{res}</span>
              <span className={report.gained.loot[res] > 0 ? 'text-game-gold-bright font-semibold' : 'text-game-text-muted'}>
                {formatNumber(report.gained.loot[res])}
              </span>
            </div>
          ))}
        </div>
        {!allGainsZero && report.flags.anti_farm_decay_mult < 1 && (
          <p className="mt-2 text-game-xs text-game-text-muted font-body italic">
            Anti-farm decay applied (×{report.flags.anti_farm_decay_mult.toFixed(2)})
          </p>
        )}
      </div>

      {/* ── WHY box — shown prominently BELOW the gains section whenever nothing was gained ── */}
      {allGainsZero && (
        <div className="border border-amber-900/60 bg-amber-950/20 rounded-game-lg p-3 shadow-engrave">
          <p className="font-heading text-game-xs uppercase tracking-wide text-game-gold-bright mb-2">
            Why Nothing Was Gained
          </p>
          {report.reasons.length > 0 ? (
            <ul className="space-y-2">
              {report.reasons.map((reason) => (
                <li key={reason} className="font-body text-game-sm text-game-text-secondary flex items-start gap-2">
                  <span className="mt-0.5 shrink-0 text-game-gold-primary">›</span>
                  <span>{REASON_LABELS[reason]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-body text-game-sm text-game-text-secondary">
              The enemy had no resources available to plunder.
            </p>
          )}
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
        className={`inline-block w-3 h-3 rounded-full border shadow-emboss ${
          resource
            ? 'bg-game-gold-bright border-game-gold-bright'
            : 'bg-transparent border-game-border'
        }`}
      />
      <span
        title="Soldier Shield"
        className={`inline-block w-3 h-3 rounded-full border shadow-emboss ${
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
  const router = useRouter()
  const isFrozen = useFreeze()
  const [search, setSearch] = useState('')
  const [localTargets, setLocalTargets] = useState<Target[]>(targets)
  const [turns, setTurns] = useState<Record<string, string>>({})
  const [confirmTarget, setConfirmTarget] = useState<Target | null>(null)
  const [battleReport, setBattleReport] = useState<BattleReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [playerTurns, setPlayerTurns] = useState(player.turns)
  const [playerResources, setPlayerResources] = useState(resources)

  const filtered = useMemo(
    () =>
      localTargets.filter((t) =>
        t.army_name.toLowerCase().includes(search.toLowerCase())
      ),
    [localTargets, search]
  )

  function getTargetTurns(targetId: string) {
    return Math.max(1, Math.min(10, parseInt(turns[targetId] || '1') || 1))
  }

  function foodCost(t: number) {
    return t * BALANCE.combat.foodCostPerTurn
  }

  async function executeAttack() {
    if (!confirmTarget) return
    if (confirmTarget.id === player.id) return
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
        const report = data.battleReport
        setBattleReport(report)
        setConfirmTarget(null)
        if (data.turns !== undefined) setPlayerTurns(data.turns)
        if (data.resources) setPlayerResources(data.resources)
        setLocalTargets((prev) =>
          prev.map((t) => {
            if (t.id === player.id)
              return { ...t, soldiers: report.attacker.after.soldiers }
            if (t.id === confirmTarget.id)
              return { ...t, soldiers: report.defender.after.soldiers, gold: report.defender.after.gold }
            return t
          })
        )
        router.refresh()
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
          <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
            Attack
          </h1>
          <p className="text-game-text-secondary font-body mt-1">
            City {player.city} — {filtered.filter((t) => t.id !== player.id).length} targets available
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg px-3 py-2 text-center shadow-emboss">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">Turns</p>
            <p className="text-game-base text-game-gold font-semibold">{playerTurns} / {BALANCE.tick.maxTurns}</p>
          </div>
          {playerResources && (
            <ResourceBadge type="food" amount={playerResources.food} showLabel />
          )}
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

      {/* Search */}
      <Input
        placeholder="Search by army name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Shield legend */}
      <div className="flex gap-4 text-game-xs font-body text-game-text-muted">
        <span className="flex gap-1.5 items-center">
          <span className="inline-block w-3 h-3 rounded-full bg-game-gold-bright shadow-emboss" />
          Resource Shield
        </span>
        <span className="flex gap-1.5 items-center">
          <span className="inline-block w-3 h-3 rounded-full bg-blue-400 shadow-emboss" />
          Soldier Shield
        </span>
        <span className="flex gap-1.5 items-center">
          <span className="inline-block w-3 h-3 rounded-full border border-game-border" />
          Inactive
        </span>
      </div>

      {/* Targets table */}
      <div className="panel-ornate rounded-game-lg shadow-engrave overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            title="No Targets Found"
            description="No enemies match your search or are available to attack."
          />
        ) : (
          <GameTable
            headers={['Rank', 'Army Name', 'Tribe', 'Soldiers', 'Gold', 'Shields', 'Turns', 'Food Cost', 'Action']}
            striped
            hoverable
            rows={filtered.map((target) => {
              const isSelf = target.id === player.id
              const t = getTargetTurns(target.id)
              const cost = foodCost(t)
              const canAttack =
                !isSelf &&
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
                  {isSelf && (
                    <Badge variant="green" className="ml-2">You</Badge>
                  )}
                </div>,
                <span key="tribe" className="text-game-sm font-body text-game-text-muted">
                  {target.tribe_name ?? '—'}
                </span>,
                <span key="soldiers" className="text-game-sm font-body tabular-nums">
                  {formatNumber(target.soldiers)}
                </span>,
                <span key="gold" className="text-game-sm font-body tabular-nums text-res-gold">
                  {isSelf ? '—' : formatNumber(target.gold)}
                </span>,
                <ShieldIndicators
                  key="shields"
                  resource={target.resource_shield_active}
                  soldier={target.soldier_shield_active}
                />,
                isSelf ? (
                  <span key="turns" />
                ) : (
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
                  />
                ),
                isSelf ? (
                  <span key="cost" />
                ) : (
                  <ResourceBadge key="cost" type="food" amount={cost} />
                ),
                isSelf ? (
                  <span key="action" className="text-game-xs text-game-text-muted font-body">—</span>
                ) : (
                  <Button
                    key="attack"
                    variant="danger"
                    size="sm"
                    disabled={isFrozen || !canAttack}
                    onClick={() => setConfirmTarget(target)}
                  >
                    Attack
                  </Button>
                ),
              ]
            })}
          />
        )}
      </div>

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
              <div className="divider-ornate my-1" />
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Turns</span>
                <span className="text-game-gold font-semibold">{getTargetTurns(confirmTarget.id)}</span>
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
                disabled={isFrozen}
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
        isOpen={!!battleReport}
        onClose={() => setBattleReport(null)}
        title="Battle Report"
        size="md"
      >
        {battleReport && <BattleReportModal report={battleReport} onClose={() => setBattleReport(null)} />}
      </Modal>
    </div>
  )
}
