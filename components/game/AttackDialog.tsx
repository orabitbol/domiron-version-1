'use client'

import { useState, useEffect } from 'react'
import { Sword, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { BALANCE } from '@/lib/game/balance'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'

// Minimal target shape needed by this dialog (subset of the full Target in AttackClient)
interface DialogTarget {
  id: string
  army_name: string
  rank_city: number | null
  tribe_name: string | null
  soldiers: number
  is_vacation: boolean
}

interface AttackDialogProps {
  target: DialogTarget | null
  onClose: () => void
  /** Attacker's soldier count */
  armySoldiers: number
  /** Attacker's spy count */
  armySpies: number
  /** Attacker's current food */
  playerFood: number
  /** Attacker's remaining turns */
  playerTurns: number
  /** Called when the user confirms an attack with the selected turns */
  onAttack: (turns: number) => void
  /** Called when the user confirms a spy mission with the selected spy count */
  onSpy: (spiesSent: number) => void
  loading: boolean
  isFrozen: boolean
}

type ActionTab = 'attack' | 'spy'

export function AttackDialog({
  target,
  onClose,
  armySoldiers,
  armySpies,
  playerFood,
  playerTurns,
  onAttack,
  onSpy,
  loading,
  isFrozen,
}: AttackDialogProps) {
  const [tab, setTab] = useState<ActionTab>('attack')
  const [turns, setTurns] = useState(1)
  const [spiesSent, setSpiesSent] = useState(1)

  // Reset to defaults whenever a new target is opened
  useEffect(() => {
    if (target) {
      setTab('attack')
      setTurns(1)
      setSpiesSent(1)
    }
  }, [target?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Attack cost (canonical formula: soldiers × FOOD_PER_SOLDIER × turns) ──
  const foodCost = armySoldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns

  // ── Attack validations ────────────────────────────────────────────────────
  const noSoldiers     = armySoldiers <= 0
  const notEnoughFood  = playerFood < foodCost
  const notEnoughTurns = playerTurns < turns
  const attackDisabled = isFrozen || noSoldiers || notEnoughFood || notEnoughTurns || (target?.is_vacation ?? false)

  // ── Spy validations ───────────────────────────────────────────────────────
  const spyTurnCost       = BALANCE.spy.turnCost
  const notEnoughSpyTurns = playerTurns < spyTurnCost
  const notEnoughSpies    = armySpies < BALANCE.spy.minSpies || spiesSent > armySpies
  const spyDisabled       = isFrozen || notEnoughSpyTurns || notEnoughSpies || (target?.is_vacation ?? false)

  function clampTurns(v: number) {
    setTurns(Math.max(1, Math.min(10, v)))
  }

  function clampSpies(v: number) {
    setSpiesSent(Math.max(1, Math.min(Math.max(1, armySpies), v)))
  }

  return (
    <Modal isOpen={!!target} onClose={onClose} title="Action" size="md">
      {target && (
        <div className="space-y-4">

          {/* ── Target info ───────────────────────────────────────────────── */}
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-heading text-game-base uppercase text-game-text-white tracking-wide">
                  {target.army_name}
                </p>
                {target.tribe_name && (
                  <p className="font-body text-game-xs text-game-text-muted">{target.tribe_name}</p>
                )}
              </div>
              <div className="text-right space-y-0.5">
                {target.rank_city != null && (
                  <p className="font-body text-game-xs text-game-text-muted">
                    Rank <span className="text-game-gold font-semibold">#{target.rank_city}</span>
                  </p>
                )}
                <p className="font-body text-game-xs text-game-text-muted">
                  Soldiers: <span className="text-game-text-white font-semibold">{formatNumber(target.soldiers)}</span>
                </p>
              </div>
            </div>
          </div>

          {/* ── Tab selector ──────────────────────────────────────────────── */}
          <div className="flex rounded-game overflow-hidden border border-game-border">
            <button
              onClick={() => setTab('attack')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 font-heading text-game-sm uppercase tracking-wide transition-colors border-e border-game-border ${
                tab === 'attack'
                  ? 'bg-game-red/20 text-game-red-bright'
                  : 'bg-game-surface text-game-text-muted hover:text-game-text'
              }`}
            >
              <Sword className="size-4" />
              Attack
            </button>
            <button
              onClick={() => setTab('spy')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 font-heading text-game-sm uppercase tracking-wide transition-colors ${
                tab === 'spy'
                  ? 'bg-game-purple/20 text-game-purple-bright'
                  : 'bg-game-surface text-game-text-muted hover:text-game-text'
              }`}
            >
              <Eye className="size-4" />
              Spy
            </button>
          </div>

          {/* ── ATTACK TAB ────────────────────────────────────────────────── */}
          {tab === 'attack' && (
            <div className="space-y-4">

              {/* Turn stepper + range slider */}
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">Turns</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => clampTurns(turns - 1)}
                    disabled={turns <= 1}
                    className="w-8 h-8 flex items-center justify-center rounded-game border border-game-border bg-game-elevated text-game-text-muted hover:text-game-gold hover:border-game-border-gold disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="flex-1 text-center font-heading text-game-xl text-game-gold font-bold tabular-nums">
                    {turns}
                  </span>
                  <button
                    onClick={() => clampTurns(turns + 1)}
                    disabled={turns >= 10}
                    className="w-8 h-8 flex items-center justify-center rounded-game border border-game-border bg-game-elevated text-game-text-muted hover:text-game-gold hover:border-game-border-gold disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={turns}
                  onChange={(e) => clampTurns(parseInt(e.target.value))}
                  className="w-full mt-2 accent-[#C9901A]"
                />
              </div>

              {/* Cost preview */}
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">Cost Preview</p>
                <div className="space-y-1.5 font-body text-game-sm">
                  <div className="flex justify-between">
                    <span className="text-game-text-secondary">Turns</span>
                    <span className={notEnoughTurns ? 'text-game-red-bright font-semibold' : 'text-game-text-white'}>
                      {turns} / {playerTurns} available
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-game-text-secondary">Soldiers</span>
                    <span className={noSoldiers ? 'text-game-red-bright font-semibold' : 'text-game-text-white'}>
                      {formatNumber(armySoldiers)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-game-text-secondary">Food Cost</span>
                    <span className={notEnoughFood ? 'text-game-red-bright font-semibold' : undefined}>
                      <ResourceBadge type="food" amount={foodCost} />
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-game-text-secondary">Food Available</span>
                    <ResourceBadge type="food" amount={playerFood} />
                  </div>
                </div>
              </div>

              {/* Outcome descriptions */}
              <div className="grid grid-cols-2 gap-2 text-game-xs font-body">
                <div className="bg-game-green/5 border border-green-900/40 rounded-game-lg p-2.5">
                  <p className="font-heading uppercase text-game-green-bright mb-1.5">Victory</p>
                  <ul className="space-y-0.5 text-game-text-secondary">
                    <li>› Enemy soldiers lost</li>
                    <li>› You gain loot</li>
                    <li>› Captives possible</li>
                  </ul>
                </div>
                <div className="bg-game-red/5 border border-red-900/40 rounded-game-lg p-2.5">
                  <p className="font-heading uppercase text-game-red-bright mb-1.5">Defeat</p>
                  <ul className="space-y-0.5 text-game-text-secondary">
                    <li>› Your soldiers lost</li>
                    <li>› No loot gained</li>
                    <li>› Food still spent</li>
                  </ul>
                </div>
              </div>

              {/* Validation errors */}
              {(noSoldiers || notEnoughFood || notEnoughTurns) && (
                <div className="rounded-game-lg border border-red-900/60 bg-red-950/20 px-3 py-2 font-body text-game-sm text-game-red-bright space-y-0.5">
                  {noSoldiers && <p>Not enough soldiers</p>}
                  {!noSoldiers && notEnoughFood && <p>Not enough food</p>}
                  {notEnoughTurns && <p>Not enough turns</p>}
                </div>
              )}
              {target.is_vacation && (
                <div className="rounded-game-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 font-body text-game-sm text-amber-400">
                  This target is on vacation — cannot attack
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  variant="danger"
                  loading={loading}
                  disabled={attackDisabled}
                  onClick={() => onAttack(turns)}
                  className="flex-1"
                >
                  <Sword className="size-4" />
                  Attack!
                </Button>
                <Button variant="ghost" disabled={loading} onClick={onClose}>Cancel</Button>
              </div>
            </div>
          )}

          {/* ── SPY TAB ───────────────────────────────────────────────────── */}
          {tab === 'spy' && (
            <div className="space-y-4">

              {/* Spies stepper */}
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">Spies to Send</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => clampSpies(spiesSent - 1)}
                    disabled={spiesSent <= 1}
                    className="w-8 h-8 flex items-center justify-center rounded-game border border-game-border bg-game-elevated text-game-text-muted hover:text-game-purple-bright hover:border-purple-700 disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="flex-1 text-center font-heading text-game-xl text-game-purple-bright font-bold tabular-nums">
                    {spiesSent}
                  </span>
                  <button
                    onClick={() => clampSpies(spiesSent + 1)}
                    disabled={spiesSent >= Math.max(1, armySpies)}
                    className="w-8 h-8 flex items-center justify-center rounded-game border border-game-border bg-game-elevated text-game-text-muted hover:text-game-purple-bright hover:border-purple-700 disabled:opacity-30 transition-colors"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>

              {/* Requirements */}
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">Requirements</p>
                <div className="space-y-1.5 font-body text-game-sm">
                  <div className="flex justify-between">
                    <span className="text-game-text-secondary">Turn Cost</span>
                    <span className={notEnoughSpyTurns ? 'text-game-red-bright font-semibold' : 'text-game-text-white'}>
                      {spyTurnCost} turn ({playerTurns} available)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-game-text-secondary">Spies Available</span>
                    <span className={notEnoughSpies ? 'text-game-red-bright font-semibold' : 'text-game-text-white'}>
                      {formatNumber(armySpies)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Outcome descriptions */}
              <div className="space-y-2 text-game-xs font-body">
                <div className="bg-game-green/5 border border-green-900/40 rounded-game-lg p-2.5">
                  <p className="font-heading uppercase text-game-green-bright mb-1.5">Success</p>
                  <ul className="space-y-0.5 text-game-text-secondary">
                    <li>› Reveals enemy army size</li>
                    <li>› Reveals enemy resources</li>
                    <li>› Reveals active shields</li>
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-game-red/5 border border-red-900/40 rounded-game-lg p-2.5">
                    <p className="font-heading uppercase text-game-red-bright mb-1.5">Failure</p>
                    <ul className="space-y-0.5 text-game-text-secondary">
                      <li>› Spies caught</li>
                      <li>› No intel gained</li>
                    </ul>
                  </div>
                  <div className="bg-amber-950/20 border border-amber-900/40 rounded-game-lg p-2.5">
                    <p className="font-heading uppercase text-amber-400 mb-1.5">Critical</p>
                    <ul className="space-y-0.5 text-game-text-secondary">
                      <li>› All spies lost</li>
                      <li>› Enemy alerted</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Validation errors */}
              {(notEnoughSpyTurns || notEnoughSpies) && (
                <div className="rounded-game-lg border border-red-900/60 bg-red-950/20 px-3 py-2 font-body text-game-sm text-game-red-bright space-y-0.5">
                  {notEnoughSpyTurns && <p>Not enough turns (need {spyTurnCost})</p>}
                  {!notEnoughSpyTurns && notEnoughSpies && (
                    <p>
                      {armySpies < BALANCE.spy.minSpies
                        ? `Need at least ${BALANCE.spy.minSpies} spy`
                        : `Cannot send more spies than you have (${armySpies} available)`}
                    </p>
                  )}
                </div>
              )}
              {target.is_vacation && (
                <div className="rounded-game-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 font-body text-game-sm text-amber-400">
                  This target is on vacation — cannot spy
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button
                  variant="magic"
                  loading={loading}
                  disabled={spyDisabled}
                  onClick={() => onSpy(spiesSent)}
                  className="flex-1"
                >
                  <Eye className="size-4" />
                  Send Spies
                </Button>
                <Button variant="ghost" disabled={loading} onClick={onClose}>Cancel</Button>
              </div>
            </div>
          )}

        </div>
      )}
    </Modal>
  )
}
