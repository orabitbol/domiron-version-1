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
import { AttackDialog } from '@/components/game/AttackDialog'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import { useFreeze } from '@/lib/hooks/useFreeze'
import type { BattleReport, BattleReportReason, SpyResult } from '@/types/game'

interface Target {
  id: string
  army_name: string
  rank_city: number | null
  tribe_name: string | null
  soldiers: number
  gold: number
  is_vacation: boolean
  resource_shield_active: boolean
  soldier_shield_active: boolean
  /** True if this target is within the new-player protection window. */
  is_protected: boolean
  /** True if the logged-in player has an active kill cooldown on this target (6 h). */
  kill_cooldown_active: boolean
}

interface Props {
  targets: Target[]
}

const ATTACK_PAGE_SIZE = 20

function buildPageRange(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | null)[] = [1]
  if (current > 3) pages.push(null)
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p)
  }
  if (current < total - 2) pages.push(null)
  pages.push(total)
  return pages
}

function AtkPageBtn({ label, onClick, disabled, active }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || active}
      style={{
        minWidth: 32, height: 32,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6,
        border: active ? '1px solid rgba(240,192,48,0.5)' : '1px solid rgba(255,255,255,0.08)',
        background: active ? 'rgba(240,192,48,0.12)' : disabled ? 'transparent' : 'rgba(255,255,255,0.03)',
        color: active ? '#F0C030' : disabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontFamily: 'var(--font-body, sans-serif)',
        fontWeight: active ? 700 : 400,
        cursor: (disabled || active) ? 'default' : 'pointer',
        transition: 'all 0.12s ease',
      }}
    >
      {label}
    </button>
  )
}

const OUTCOME_COLORS: Record<string, string> = {
  WIN:  'text-game-green-bright',
  LOSS: 'text-game-red-bright',
}

const OUTCOME_LABELS: Record<string, string> = {
  WIN:  'Victory',
  LOSS: 'Defeat',
}

const REASON_LABELS: Record<BattleReportReason, string> = {
  OUTCOME_LOSS_NO_LOOT:         'You lost the battle — no loot is gained on defeat',
  DEFENDER_PROTECTED:           `Target has New Player Protection (${BALANCE.combat.PROTECTION_HOURS}h) — no loot and no soldier losses to defender`,
  RESOURCE_SHIELD_ACTIVE:       'Enemy Resource Shield active — resources were protected from theft',
  NO_UNBANKED_RESOURCES:        'Enemy had no unbanked resources to steal',
  KILL_COOLDOWN_NO_LOSSES:      `Kill Cooldown (${BALANCE.combat.KILL_COOLDOWN_HOURS}h) — you killed this target's soldiers recently; defender loses no soldiers this attack`,
  ATTACKER_PROTECTED_NO_LOSSES: `You are under New Player Protection (${BALANCE.combat.PROTECTION_HOURS}h) — your soldiers took no losses`,
  SOLDIER_SHIELD_NO_LOSSES:     'Enemy Soldier Shield active — their soldiers were protected from losses',
  LOOT_DECAY_REDUCED:           'Repeated attacks on same target reduce plunder (anti-farm decay active)',
}

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
      <div className="text-center space-y-1">
        <p className={`font-display text-game-4xl uppercase tracking-wide text-title-glow ${outcomeColor}`}>{outcomeLabel}</p>
        <p className="text-game-text-muted font-body text-game-xs">
          Power Ratio: <span className="font-semibold text-game-text-white">{report.ratio.toFixed(2)}×</span>
        </p>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {/* Your Attack breakdown */}
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">Your Attack</p>
            <div className="space-y-0.5">
              <p className="text-game-xs text-game-text-muted font-body">
                Power <span className="text-game-text-secondary">{formatNumber(report.attacker.pp_attack)}</span>
              </p>
              {report.attacker.clan_bonus_attack > 0 && (
                <p className="text-game-xs text-blue-400 font-body">
                  Clan <span className="font-semibold">+{formatNumber(report.attacker.clan_bonus_attack)}</span>
                </p>
              )}
              {report.attacker.ecp_attack !== report.attacker.base_ecp_attack && (
                <p className="text-game-xs text-game-gold font-body">
                  Tribe <span className="font-semibold">+{formatNumber(report.attacker.ecp_attack - report.attacker.base_ecp_attack)}</span>
                </p>
              )}
              <p className={`font-semibold text-game-lg ${outcomeColor}`}>{formatNumber(report.attacker.ecp_attack)}</p>
            </div>
          </div>
          {/* Enemy Defense breakdown */}
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">Enemy Defense</p>
            <div className="space-y-0.5">
              <p className="text-game-xs text-game-text-muted font-body">
                Power <span className="text-game-text-secondary">{formatNumber(report.defender.pp_defense)}</span>
              </p>
              {report.defender.clan_bonus_defense > 0 && (
                <p className="text-game-xs text-blue-400 font-body">
                  Clan <span className="font-semibold">+{formatNumber(report.defender.clan_bonus_defense)}</span>
                </p>
              )}
              {report.defender.ecp_defense !== report.defender.base_ecp_defense && (
                <p className="text-game-xs text-amber-400 font-body">
                  Tribe <span className="font-semibold">+{formatNumber(report.defender.ecp_defense - report.defender.base_ecp_defense)}</span>
                </p>
              )}
              <p className="font-semibold text-game-lg text-game-text-white">{formatNumber(report.defender.ecp_defense)}</p>
            </div>
          </div>
        </div>
      </div>

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

      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
        <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">Combat Results</p>
        <div className="font-body text-game-sm">
          <div className="grid grid-cols-3 gap-2 text-game-xs text-game-text-muted font-heading uppercase pb-1 mb-2">
            <span>Unit</span><span>You Lost</span><span>Enemy Lost</span>
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

      <div className={`border rounded-game-lg p-3 shadow-engrave ${allGainsZero && report.gained.captives === 0 ? 'bg-gradient-to-b from-game-elevated to-game-surface border-game-border' : 'bg-game-green/5 border-green-900'}`}>
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
          <div className="flex justify-between col-span-2 border-t border-game-border mt-1 pt-1">
            <span className="text-game-text-secondary">Captives</span>
            <span className={report.gained.captives > 0 ? 'text-game-gold-bright font-semibold' : 'text-game-text-muted'}>
              {formatNumber(report.gained.captives)}
            </span>
          </div>
        </div>
        {!allGainsZero && report.flags.anti_farm_decay_mult < 1 && (
          <p className="mt-2 text-game-xs text-game-text-muted font-body italic">
            Anti-farm decay applied (×{report.flags.anti_farm_decay_mult.toFixed(2)})
          </p>
        )}
      </div>

      {(allGainsZero || report.reasons.length > 0) && (
        <div className={`border rounded-game-lg p-3 shadow-engrave ${
          allGainsZero
            ? 'border-amber-900/60 bg-amber-950/20'
            : 'border-game-border bg-gradient-to-b from-game-elevated to-game-surface'
        }`}>
          <p className="font-heading text-game-xs uppercase tracking-wide text-game-gold-bright mb-2">
            {allGainsZero ? 'Why Nothing Was Gained' : 'Combat Modifiers'}
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
            <p className="font-body text-game-sm text-game-text-secondary">The enemy had no resources available to plunder.</p>
          )}
        </div>
      )}

      <Button variant="ghost" onClick={onClose}>Close</Button>
    </div>
  )
}

function SpyResultModal({ result, onClose }: { result: SpyResult; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className={`font-display text-game-3xl uppercase tracking-wide text-title-glow ${result.success ? 'text-game-green-bright' : 'text-game-red-bright'}`}>
          {result.success ? 'Mission Success' : 'Mission Failed'}
        </p>
      </div>

      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
        <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">Mission Summary</p>
        <div className="space-y-1.5 font-body text-game-sm">
          <div className="flex justify-between">
            <span className="text-game-text-secondary">Spies Sent</span>
            <span className="text-game-text-white font-semibold">{formatNumber(result.spies_sent)}</span>
          </div>
          {result.spies_caught > 0 && (
            <div className="flex justify-between">
              <span className="text-game-text-secondary">Spies Caught</span>
              <span className="text-game-red-bright font-semibold">{formatNumber(result.spies_caught)}</span>
            </div>
          )}
        </div>
      </div>

      {result.success && result.revealed && (
        <div className="bg-game-green/5 border border-green-900 rounded-game-lg p-3 shadow-engrave">
          <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">Intel Revealed</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-body text-game-sm">
            <div className="flex justify-between">
              <span className="text-game-text-secondary">Soldiers</span>
              <span className="text-game-text-white font-semibold">{formatNumber(result.revealed.soldiers)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-game-text-secondary">Spies</span>
              <span className="text-game-text-white font-semibold">{formatNumber(result.revealed.spies)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-game-text-secondary">Gold</span>
              <span className="text-res-gold font-semibold">{formatNumber(result.revealed.gold)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-game-text-secondary">Iron</span>
              <span className="text-res-iron font-semibold">{formatNumber(result.revealed.iron)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-game-text-secondary">Wood</span>
              <span className="text-res-wood font-semibold">{formatNumber(result.revealed.wood)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-game-text-secondary">Food</span>
              <span className="text-res-food font-semibold">{formatNumber(result.revealed.food)}</span>
            </div>
            {(result.revealed.resource_shield || result.revealed.soldier_shield) && (
              <div className="col-span-2 border-t border-game-border mt-1 pt-1 flex gap-4">
                {result.revealed.resource_shield && (
                  <span className="text-game-gold-bright text-game-xs font-heading uppercase">Resource Shield Active</span>
                )}
                {result.revealed.soldier_shield && (
                  <span className="text-blue-400 text-game-xs font-heading uppercase">Soldier Shield Active</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <Button variant="ghost" onClick={onClose}>Close</Button>
    </div>
  )
}

interface StatusIndicatorProps {
  resource: boolean
  soldier: boolean
  protected: boolean
  cooldown: boolean
}

const STATUS_DOTS = [
  { key: 'resource',  activeClass: 'bg-game-gold-bright border-game-gold-bright', title: 'Resource Shield active — resources protected'  },
  { key: 'soldier',   activeClass: 'bg-blue-400 border-blue-400',                 title: 'Soldier Shield active — soldiers protected'     },
  { key: 'protected', activeClass: 'bg-green-400 border-green-400',               title: `New Player Protection (${BALANCE.combat.PROTECTION_HOURS}h) — no loot/losses`   },
  { key: 'cooldown',  activeClass: 'bg-amber-400 border-amber-400',               title: `Kill Cooldown (${BALANCE.combat.KILL_COOLDOWN_HOURS}h) — defender loses no soldiers` },
] as const

function StatusIndicators({ resource, soldier, protected: isProtected, cooldown }: StatusIndicatorProps) {
  const values: Record<typeof STATUS_DOTS[number]['key'], boolean> = {
    resource, soldier, protected: isProtected, cooldown,
  }
  return (
    <div className="flex gap-1.5 items-center">
      {STATUS_DOTS.map(({ key, activeClass, title }) => (
        <span
          key={key}
          title={title}
          className={`inline-block w-3 h-3 rounded-full border shadow-emboss ${values[key] ? activeClass : 'bg-transparent border-game-border'}`}
        />
      ))}
    </div>
  )
}

export function AttackClient({ targets }: Props) {
  const { player, resources, army, refresh, applyPatch } = usePlayer()
  const isFrozen = useFreeze()

  const [search, setSearch] = useState('')
  const [attackPage, setAttackPage] = useState(1)
  // localTargets: updated optimistically after battle to reflect fight result (soldiers/gold).
  const [localTargets, setLocalTargets] = useState<Target[]>(targets)
  const [dialogTarget, setDialogTarget] = useState<Target | null>(null)
  const [battleReport, setBattleReport] = useState<BattleReport | null>(null)
  const [spyResult, setSpyResult] = useState<SpyResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const playerTurns = player?.turns ?? 0
  const playerResources = resources

  const filtered = useMemo(
    () => localTargets.filter((t) => t.army_name.toLowerCase().includes(search.toLowerCase())),
    [localTargets, search]
  )

  const totalAttackPages = Math.max(1, Math.ceil(filtered.length / ATTACK_PAGE_SIZE))
  const paginated = useMemo(() => {
    const from = (attackPage - 1) * ATTACK_PAGE_SIZE
    return filtered.slice(from, from + ATTACK_PAGE_SIZE)
  }, [filtered, attackPage])

  async function executeAttack(turns: number) {
    if (!dialogTarget || !player || !army || !resources) return
    if (dialogTarget.id === player.id) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defender_id: dialogTarget.id, turns }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Attack failed', type: 'error' })
        setDialogTarget(null)
      } else {
        const report = data.battleReport
        setBattleReport(report)
        setDialogTarget(null)

        // Immediate context update — turns, resources, soldiers
        applyPatch({
          player:    { ...player, turns: data.turns },
          resources: { ...resources, ...data.resources },
          army:      { ...army, soldiers: report.attacker.after.soldiers },
        })

        // Optimistically update defender's visible stats in the target list
        setLocalTargets((prev) =>
          prev.map((tgt) => {
            if (tgt.id === dialogTarget.id)
              return { ...tgt, soldiers: report.defender.after.soldiers, gold: report.defender.after.gold }
            return tgt
          })
        )

        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function executeSpy(spiesSent: number) {
    if (!dialogTarget || !player || !army) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/spy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: dialogTarget.id, spies_sent: spiesSent }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Spy mission failed', type: 'error' })
        setDialogTarget(null)
      } else {
        setSpyResult(data.result)
        setDialogTarget(null)
        applyPatch({
          player: { ...player, turns: data.turns },
          army:   { ...army, spies: data.spies },
        })
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
            City {player?.city ?? '—'} — {filtered.length} targets available
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
      <Input placeholder="Search by army name..." value={search} onChange={(e) => { setSearch(e.target.value); setAttackPage(1) }} />

      {/* Status legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-game-xs font-body text-game-text-muted">
        {STATUS_DOTS.map(({ key, activeClass, title }) => (
          <span key={key} className="flex gap-1.5 items-center">
            <span className={`inline-block w-3 h-3 rounded-full border shadow-emboss ${activeClass}`} />
            {title.split(' — ')[0]}
          </span>
        ))}
        <span className="flex gap-1.5 items-center">
          <span className="inline-block w-3 h-3 rounded-full border border-game-border" /> None
        </span>
      </div>

      {/* Targets table */}
      <div className="panel-ornate rounded-game-lg shadow-engrave overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="No Targets Found" description="No enemies match your search or are available to attack." />
        ) : (
          <GameTable
            headers={['Rank', 'Army Name', 'Tribe', 'Soldiers', 'Gold', 'Status', 'Action']}
            striped
            hoverable
            rows={paginated.map((target) => {
              const isSelf = target.id === player?.id

              return [
                <span key="rank" className="text-game-sm font-body tabular-nums">
                  {target.rank_city ? `#${target.rank_city}` : '—'}
                </span>,
                <div key="army">
                  <span className="font-heading text-game-sm uppercase text-game-text-white">{target.army_name}</span>
                  {target.is_vacation && <Badge variant="blue" className="ml-2">Vacation</Badge>}
                  {isSelf && <Badge variant="green" className="ml-2">You</Badge>}
                </div>,
                <span key="tribe" className="text-game-sm font-body text-game-text-muted">{target.tribe_name ?? '—'}</span>,
                <span key="soldiers" className="text-game-sm font-body tabular-nums">{formatNumber(target.soldiers)}</span>,
                <span key="gold" className="text-game-sm font-body tabular-nums text-res-gold">
                  {isSelf ? '—' : formatNumber(target.gold)}
                </span>,
                <StatusIndicators key="status" resource={target.resource_shield_active} soldier={target.soldier_shield_active} protected={target.is_protected} cooldown={target.kill_cooldown_active} />,
                isSelf ? (
                  <span key="action" className="text-game-xs text-game-text-muted font-body">—</span>
                ) : (
                  <Button key="action" variant="danger" size="sm" disabled={isFrozen} onClick={() => setDialogTarget(target)}>
                    Attack
                  </Button>
                ),
              ]
            })}
          />
        )}
      </div>

      {/* Pagination */}
      {totalAttackPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-body, sans-serif)' }}>
            Page {attackPage} of {totalAttackPages} &middot; {filtered.length} targets
          </span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <AtkPageBtn label="&#8249;" onClick={() => setAttackPage((p) => Math.max(1, p - 1))} disabled={attackPage <= 1} />
            {buildPageRange(attackPage, totalAttackPages).map((p, i) =>
              p === null
                ? <span key={`ellipsis-${i}`} style={{ padding: '0 4px', color: 'rgba(255,255,255,0.2)', fontSize: 12, fontFamily: 'var(--font-body, sans-serif)' }}>&#8230;</span>
                : <AtkPageBtn key={p} label={String(p)} onClick={() => setAttackPage(p)} active={p === attackPage} />
            )}
            <AtkPageBtn label="&#8250;" onClick={() => setAttackPage((p) => Math.min(totalAttackPages, p + 1))} disabled={attackPage >= totalAttackPages} />
          </div>
        </div>
      )}

      {/* Attack / Spy dialog */}
      <AttackDialog
        target={dialogTarget}
        onClose={() => setDialogTarget(null)}
        armySoldiers={army?.soldiers ?? 0}
        armySpies={army?.spies ?? 0}
        playerFood={resources?.food ?? 0}
        playerTurns={playerTurns}
        onAttack={executeAttack}
        onSpy={executeSpy}
        loading={loading}
        isFrozen={isFrozen}
      />

      {/* Battle result modal */}
      <Modal isOpen={!!battleReport} onClose={() => setBattleReport(null)} title="Battle Report" size="md">
        {battleReport && <BattleReportModal report={battleReport} onClose={() => setBattleReport(null)} />}
      </Modal>

      {/* Spy result modal */}
      <Modal isOpen={!!spyResult} onClose={() => setSpyResult(null)} title="Spy Report" size="sm">
        {spyResult && <SpyResultModal result={spyResult} onClose={() => setSpyResult(null)} />}
      </Modal>
    </div>
  )
}
