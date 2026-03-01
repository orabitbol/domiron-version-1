'use client'

import { useState, useMemo } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { GameTable } from '@/components/ui/game-table'
import { EmptyState } from '@/components/ui/game-table'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { SpyResult, SpyRevealedData } from '@/types/game'

interface Target {
  id:          string
  army_name:   string
  rank_city:   number | null
  scouts:      number
  is_vacation: boolean
}

interface Props {
  player: {
    id:        string
    army_name: string
    city:      number
    turns:     number
    max_turns: number
    race:      string
  }
  army: {
    spies:  number
    scouts: number
  }
  training: {
    spy_level:   number
    scout_level: number
  }
  targets: Target[]
}

export function SpyClient({ player, army, training, targets }: Props) {
  const { refresh } = usePlayer()

  const [search,       setSearch]       = useState('')
  const [spiesSent,    setSpiesSent]    = useState<Record<string, string>>({})
  const [confirmTarget, setConfirmTarget] = useState<Target | null>(null)
  const [spyResult,    setSpyResult]    = useState<SpyResult | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [message,      setMessage]      = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [playerTurns,  setPlayerTurns]  = useState(player.turns)
  const [mySpies,      setMySpies]      = useState(army.spies)

  const filtered = useMemo(
    () => targets.filter((t) => t.army_name.toLowerCase().includes(search.toLowerCase())),
    [targets, search],
  )

  const turnCost = BALANCE.spy.turnCost

  function getSpiesSent(targetId: string): number {
    return Math.max(1, Math.min(mySpies, parseInt(spiesSent[targetId] || '1') || 1))
  }

  async function executeSpy() {
    if (!confirmTarget) return
    const sent = getSpiesSent(confirmTarget.id)
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/spy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: confirmTarget.id, spies_sent: sent }),
      })
      const data = await res.json()
      setConfirmTarget(null)
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Spy mission failed', type: 'error' })
      } else {
        setSpyResult(data.result)
        if (data.turns !== undefined) setPlayerTurns(data.turns)
        if (data.result.spies_caught > 0) {
          setMySpies((prev) => Math.max(0, prev - data.result.spies_caught))
        }
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
            Espionage
          </h1>
          <p className="text-game-text-secondary font-body mt-1">
            City {player.city} — {filtered.length} targets available
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg px-3 py-2 text-center">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">Turns</p>
            <p className="text-game-base text-game-gold font-semibold">
              {playerTurns} / {player.max_turns}
            </p>
          </div>
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg px-3 py-2 text-center">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">Spies</p>
            <p className="text-game-base text-game-gold font-semibold">{formatNumber(mySpies)}</p>
          </div>
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg px-3 py-2 text-center">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">Spy Lvl</p>
            <p className="text-game-base text-game-gold font-semibold">{training.spy_level}</p>
          </div>
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

      {/* How spy works */}
      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-4 text-game-xs font-body text-game-text-muted space-y-1">
        <p className="font-heading text-game-sm text-game-gold uppercase tracking-wide mb-2">How Espionage Works</p>
        <p>Your <span className="text-game-text-white">Spy Power</span> is compared against the target&apos;s <span className="text-game-text-white">Scout Defense</span>.</p>
        <p>
          Spy Power = Spies × Training Multiplier × Weapon Multiplier × Race Bonus
          <br />
          Scout Defense = Scouts × Training Multiplier × Weapon Multiplier × Race Bonus
        </p>
        <p>
          <span className="text-game-green-bright">Success:</span> Spy Power &gt; Scout Defense → reveal target&apos;s army, resources, and power.
          <br />
          <span className="text-game-red-bright">Failure:</span> Some spies are caught. Nothing is revealed.
          Each mission costs <span className="text-game-text-white">{turnCost} turn{turnCost !== 1 ? 's' : ''}</span>.
        </p>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by army name..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Targets table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No Targets Found"
          description="No enemies match your search or are available to spy on."
        />
      ) : (
        <GameTable
          headers={['Rank', 'Army Name', 'Their Scouts', 'Spies to Send', 'Turn Cost', 'Action']}
          striped
          hoverable
          rows={filtered.map((target) => {
            const sent = getSpiesSent(target.id)
            const canSpy = playerTurns >= turnCost && mySpies >= BALANCE.spy.minSpies && !target.is_vacation

            return [
              <span key="rank" className="text-game-sm font-body tabular-nums">
                {target.rank_city ? `#${target.rank_city}` : '—'}
              </span>,
              <div key="army">
                <span className="font-heading text-game-sm uppercase text-game-text-white">
                  {target.army_name}
                </span>
                {target.is_vacation && (
                  <Badge variant="blue" className="ms-2">Vacation</Badge>
                )}
              </div>,
              <span key="scouts" className="text-game-sm font-body tabular-nums text-game-text-muted">
                {formatNumber(target.scouts)}
              </span>,
              <Input
                key="spies"
                type="number"
                value={spiesSent[target.id] ?? '1'}
                min={1}
                max={mySpies}
                onChange={(e) =>
                  setSpiesSent((prev) => ({ ...prev, [target.id]: e.target.value }))
                }
                className="w-20"
              />,
              <span key="cost" className="text-game-sm font-body text-game-text-secondary">
                {turnCost} turn{turnCost !== 1 ? 's' : ''}
              </span>,
              <Button
                key="spy"
                variant="primary"
                size="sm"
                disabled={!canSpy}
                onClick={() => setConfirmTarget(target)}
              >
                Send Spies
              </Button>,
            ]
          })}
        />
      )}

      {/* Confirmation modal */}
      <Modal
        isOpen={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title="Confirm Spy Mission"
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
                <span className="text-game-text-secondary">Spies Sent</span>
                <span className="text-game-text-white font-semibold">{getSpiesSent(confirmTarget.id)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Turn Cost</span>
                <span className="text-game-text-white">{turnCost}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Your Turns</span>
                <span className="text-game-text-white">{playerTurns}</span>
              </div>
            </div>
            <p className="text-game-xs text-game-text-muted font-body">
              Success reveals enemy army, resources, and power values.
              Failure may cost you some spies.
            </p>
            <div className="flex gap-3 pt-2">
              <Button variant="primary" loading={loading} onClick={executeSpy}>
                Send
              </Button>
              <Button variant="ghost" disabled={loading} onClick={() => setConfirmTarget(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Spy result modal */}
      <Modal
        isOpen={!!spyResult}
        onClose={() => setSpyResult(null)}
        title="Mission Report"
        size="md"
      >
        {spyResult && (
          <div className="space-y-4">
            {/* Outcome */}
            <div className="text-center">
              <p
                className={`font-display text-game-2xl uppercase tracking-wide ${
                  spyResult.success ? 'text-game-green-bright' : 'text-game-red-bright'
                }`}
              >
                {spyResult.success ? 'Mission Success' : 'Mission Failed'}
              </p>
            </div>

            {/* Power comparison */}
            <div className="grid grid-cols-2 gap-3 text-game-sm font-body">
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">
                  Your Spy Power
                </p>
                <p className="text-game-gold font-semibold text-game-lg">
                  {formatNumber(spyResult.spy_power)}
                </p>
              </div>
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">
                  Defender Scout Defense
                </p>
                <p className="text-game-gold font-semibold text-game-lg">
                  {formatNumber(spyResult.scout_defense)}
                </p>
              </div>
            </div>

            {/* Explanation */}
            <div
              className={`rounded border px-3 py-2 font-body text-game-xs ${
                spyResult.success
                  ? 'bg-game-green/10 border-green-900 text-game-green-bright'
                  : 'bg-game-red/10 border-red-900 text-game-red-bright'
              }`}
            >
              {spyResult.success
                ? `Your spy power (${formatNumber(spyResult.spy_power)}) exceeded the defender's scout defense (${formatNumber(spyResult.scout_defense)}). Intelligence gathered successfully.`
                : `Mission failed. Defender scout defense (${formatNumber(spyResult.scout_defense)}) exceeded your spy power (${formatNumber(spyResult.spy_power)}). Train more spies or upgrade spy level.`
              }
            </div>

            {/* Spy losses */}
            <div className="space-y-2 text-game-sm font-body">
              <div className="flex justify-between">
                <span className="text-game-text-secondary">Spies Sent</span>
                <span className="text-game-text-white">{formatNumber(spyResult.spies_sent)}</span>
              </div>
              {spyResult.spies_caught > 0 && (
                <div className="flex justify-between">
                  <span className="text-game-text-secondary">Spies Caught</span>
                  <span className="text-game-red-bright font-semibold">
                    {formatNumber(spyResult.spies_caught)}
                  </span>
                </div>
              )}
            </div>

            {/* Revealed intel */}
            {spyResult.success && spyResult.revealed && (
              <RevealedIntel data={spyResult.revealed} />
            )}

            <Button variant="ghost" onClick={() => setSpyResult(null)}>
              Close
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── Revealed intel panel ──────────────────────────────────────────────────

function RevealedIntel({ data }: { data: SpyRevealedData }) {
  return (
    <div className="pt-3 space-y-3">
      <div className="divider-ornate mb-3" />
      <p className="text-game-xs text-game-gold font-heading uppercase tracking-wide">
        Intelligence Report — {data.army_name}
      </p>

      {/* Army */}
      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
        <p className="text-game-xs font-heading uppercase tracking-wide text-game-gold mb-2">Army</p>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-game-xs font-body">
          <div className="flex justify-between"><span className="text-game-text-secondary">Soldiers</span><span className="text-game-text-white">{formatNumber(data.soldiers)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">Cavalry</span><span className="text-game-text-white">{formatNumber(data.cavalry)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">Spies</span><span className="text-game-text-white">{formatNumber(data.spies)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">Scouts</span><span className="text-game-text-white">{formatNumber(data.scouts)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">Slaves</span><span className="text-game-text-white">{formatNumber(data.slaves)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">Farmers</span><span className="text-game-text-white">{formatNumber(data.farmers)}</span></div>
        </div>
      </div>

      {/* Resources */}
      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
        <p className="text-game-xs font-heading uppercase tracking-wide text-game-gold mb-2">Resources</p>
        <div className="flex flex-wrap gap-3">
          <ResourceBadge type="gold" amount={data.gold} showLabel />
          <ResourceBadge type="iron" amount={data.iron} showLabel />
          <ResourceBadge type="wood" amount={data.wood} showLabel />
          <ResourceBadge type="food" amount={data.food} showLabel />
        </div>
      </div>

      {/* Power */}
      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
        <p className="text-game-xs font-heading uppercase tracking-wide text-game-gold mb-2">Power</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-game-xs font-body">
          <div className="flex justify-between"><span className="text-game-text-secondary">Attack</span><span className="text-game-text-white">{formatNumber(data.power_attack)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">Defense</span><span className="text-game-text-white">{formatNumber(data.power_defense)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">Spy</span><span className="text-game-text-white">{formatNumber(data.power_spy)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">Scout</span><span className="text-game-text-white">{formatNumber(data.power_scout)}</span></div>
          <div className="flex justify-between col-span-2 divider-gold pt-1 mt-1">
            <span className="text-game-text-secondary font-semibold">Total Power</span>
            <span className="text-game-gold-bright font-semibold">{formatNumber(data.power_total)}</span>
          </div>
        </div>
      </div>

      {/* Shields */}
      <div className="flex gap-4 text-game-xs font-body">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-full border ${
            data.soldier_shield ? 'bg-blue-400 border-blue-400' : 'bg-transparent border-game-border'
          }`} />
          <span className={data.soldier_shield ? 'text-blue-400' : 'text-game-text-muted'}>
            Soldier Shield {data.soldier_shield ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-full border ${
            data.resource_shield ? 'bg-game-gold-bright border-game-gold-bright' : 'bg-transparent border-game-border'
          }`} />
          <span className={data.resource_shield ? 'text-game-gold-bright' : 'text-game-text-muted'}>
            Resource Shield {data.resource_shield ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
    </div>
  )
}
