'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Sword, Eye, Shield, CheckCircle, AlertCircle, Skull } from 'lucide-react'
import { BALANCE } from '@/lib/game/balance'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'

interface DialogTarget {
  id: string
  army_name: string
  rank_city: number | null
  tribe_name: string | null
  soldiers: number
  gold: number
  is_vacation: boolean
  resource_shield_active: boolean
  soldier_shield_active: boolean
  is_protected: boolean
  kill_cooldown_active: boolean
}

interface AttackDialogProps {
  target: DialogTarget | null
  onClose: () => void
  armySoldiers: number
  armySpies: number
  playerFood: number
  playerTurns: number
  onAttack: (turns: number) => void
  onSpy: (spiesSent: number) => void
  loading: boolean
  isFrozen: boolean
}

type ActionTab = 'attack' | 'spy'

// ── TurnChip (defined OUTSIDE parent to prevent remount) ──────────────────────
interface TurnChipProps {
  n: number
  selected: boolean
  affordable: boolean
  enoughTurns: boolean
  onClick: () => void
}

function TurnChip({ n, selected, affordable, enoughTurns, onClick }: TurnChipProps) {
  const isUnavailable = !affordable || !enoughTurns
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        h-9 rounded-game font-heading text-game-sm font-bold transition-all border
        ${selected
          ? 'bg-amber-950/70 border-amber-500/70 text-game-gold-bright shadow-emboss'
          : isUnavailable
          ? 'bg-transparent border-game-border/25 text-game-text-muted/25 cursor-pointer'
          : 'bg-game-elevated border-game-border text-game-text-secondary hover:border-amber-700/50 hover:text-game-gold hover:bg-amber-950/20'
        }
      `}
    >
      {n}
    </button>
  )
}

// ── SpyStepBtn (defined OUTSIDE to prevent remount) ───────────────────────────
interface SpyStepProps { onClick: () => void; disabled: boolean; label: string }
function SpyStepBtn({ onClick, disabled, label }: SpyStepProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-10 h-10 flex items-center justify-center rounded-game border border-game-border bg-game-elevated text-game-text-muted hover:text-game-purple-bright hover:border-purple-700 disabled:opacity-20 transition-colors font-heading text-game-base"
    >
      {label}
    </button>
  )
}

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
  const t = useTranslations()
  const [tab, setTab]           = useState<ActionTab>('attack')
  const [turns, setTurns]       = useState(1)
  const [spiesSent, setSpiesSent] = useState(1)

  useEffect(() => {
    if (target) { setTab('attack'); setTurns(1); setSpiesSent(1) }
  }, [target?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const foodPerTurn = Math.ceil(armySoldiers * BALANCE.combat.FOOD_PER_SOLDIER)
  const foodCost    = Math.ceil(armySoldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)

  const noSoldiers     = armySoldiers <= 0
  const notEnoughFood  = playerFood < foodCost
  const notEnoughTurns = playerTurns < turns
  const attackDisabled = isFrozen || noSoldiers || notEnoughFood || notEnoughTurns || (target?.is_vacation ?? false)

  const spyTurnCost       = BALANCE.spy.turnCost
  const notEnoughSpyTurns = playerTurns < spyTurnCost
  const notEnoughSpies    = armySpies < BALANCE.spy.minSpies || spiesSent > armySpies
  const spyDisabled       = isFrozen || notEnoughSpyTurns || notEnoughSpies || (target?.is_vacation ?? false)

  function clampSpies(v: number) {
    setSpiesSent(Math.max(1, Math.min(Math.max(1, armySpies), v)))
  }

  const MAX_TURNS = BALANCE.combat.MAX_TURNS_PER_ATTACK

  // Determine which chips are "affordable" (food + turns)
  function chipAffordable(n: number) {
    const cost = Math.ceil(armySoldiers * BALANCE.combat.FOOD_PER_SOLDIER * n)
    return playerFood >= cost
  }

  return (
    <Modal isOpen={!!target} onClose={onClose} title={t('dialog.action_title')} size="md">
      {target && (
        <div className="space-y-3">

          {/* ── Target identity ─────────────────────────────────────── */}
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3.5 shadow-engrave">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-display text-game-xl uppercase tracking-wide text-game-text-white leading-tight truncate">
                  {target.army_name}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {target.rank_city != null && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-amber-700/40 bg-amber-950/30 font-heading text-game-xs text-game-gold">
                      #{target.rank_city}
                    </span>
                  )}
                  {target.tribe_name && (
                    <span className="font-body text-game-xs text-game-text-muted">{target.tribe_name}</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0 space-y-1">
                <div className="flex items-center gap-1.5 justify-end">
                  <Shield className="size-3 text-game-text-muted opacity-60" />
                  <span className="font-body text-game-xs text-game-text-muted">{t('dialog.soldiers_label')}</span>
                  <span className="font-heading text-game-sm text-game-text-white tabular-nums">{formatNumber(target.soldiers)}</span>
                </div>
                {/* Status indicators */}
                {(target.resource_shield_active || target.soldier_shield_active || target.is_protected || target.kill_cooldown_active) && (
                  <div className="flex gap-1 justify-end flex-wrap">
                    {target.resource_shield_active && (
                      <span className="px-1.5 py-0.5 rounded border border-amber-700/40 bg-amber-950/30 font-body text-game-xs text-game-gold whitespace-nowrap">
                        {t('attack.resource_shield_active')}
                      </span>
                    )}
                    {target.soldier_shield_active && (
                      <span className="px-1.5 py-0.5 rounded border border-blue-700/40 bg-blue-950/30 font-body text-game-xs text-blue-300 whitespace-nowrap">
                        {t('attack.soldier_shield_active')}
                      </span>
                    )}
                    {target.is_protected && (
                      <span className="px-1.5 py-0.5 rounded border border-green-700/40 bg-green-950/30 font-body text-game-xs text-green-300 whitespace-nowrap">
                        הגנת שחקן חדש
                      </span>
                    )}
                    {target.kill_cooldown_active && (
                      <span className="px-1.5 py-0.5 rounded border border-orange-700/40 bg-orange-950/30 font-body text-game-xs text-orange-300 whitespace-nowrap">
                        קוּלדאון הריגה
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Tab selector ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 rounded-game overflow-hidden border border-game-border">
            <button
              type="button"
              onClick={() => setTab('attack')}
              className={`flex items-center justify-center gap-2 py-2.5 font-heading text-game-sm uppercase tracking-wide transition-colors border-e border-game-border ${
                tab === 'attack'
                  ? 'bg-gradient-to-b from-red-950/60 to-red-950/20 text-game-red-bright border-e-game-border'
                  : 'bg-game-surface text-game-text-muted hover:text-game-text-secondary'
              }`}
            >
              <Sword className="size-4" />
              {t('dialog.tab_attack')}
            </button>
            <button
              type="button"
              onClick={() => setTab('spy')}
              className={`flex items-center justify-center gap-2 py-2.5 font-heading text-game-sm uppercase tracking-wide transition-colors ${
                tab === 'spy'
                  ? 'bg-gradient-to-b from-purple-950/60 to-purple-950/20 text-game-purple-bright'
                  : 'bg-game-surface text-game-text-muted hover:text-game-text-secondary'
              }`}
            >
              <Eye className="size-4" />
              {t('dialog.tab_spy')}
            </button>
          </div>

          {/* ── ATTACK TAB ──────────────────────────────────────────── */}
          {tab === 'attack' && (
            <div className="space-y-3">

              {/* Turn chips */}
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">{t('dialog.battle_duration')}</p>
                  <span className="font-heading text-game-base text-game-gold font-bold tabular-nums">
                    {turns} {turns === 1 ? t('dialog.turn_singular') : t('dialog.turns_header').toLowerCase()}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: MAX_TURNS }, (_, i) => i + 1).map((n) => (
                    <TurnChip
                      key={n}
                      n={n}
                      selected={turns === n}
                      affordable={chipAffordable(n)}
                      enoughTurns={playerTurns >= n}
                      onClick={() => setTurns(n)}
                    />
                  ))}
                </div>
              </div>

              {/* Cost card */}
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">{t('dialog.cost_preview')}</p>
                <div className="space-y-1.5 font-body text-game-sm">
                  <div className="flex justify-between">
                    <span className="text-game-text-secondary">{t('dialog.turns_row')}</span>
                    <span className={notEnoughTurns ? 'text-game-red-bright font-semibold tabular-nums' : 'text-game-text-white tabular-nums'}>
                      {turns} / {playerTurns} {t('dialog.available')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-game-text-secondary">{t('dialog.soldiers_row')}</span>
                    <span className={noSoldiers ? 'text-game-red-bright font-semibold tabular-nums' : 'text-game-text-white tabular-nums'}>
                      {formatNumber(armySoldiers)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-game-text-secondary">
                      {t('dialog.food_cost')}
                      {armySoldiers > 0 && (
                        <span className="text-game-xs text-game-text-muted ms-1">
                          ({formatNumber(foodPerTurn)} {t('dialog.food_per_turn')})
                        </span>
                      )}
                    </span>
                    <span className={notEnoughFood ? 'text-game-red-bright font-semibold tabular-nums' : 'text-res-food tabular-nums'}>
                      {formatNumber(foodCost)}
                    </span>
                  </div>
                  <div className="border-t border-game-border/40 pt-1 flex justify-between">
                    <span className="text-game-text-secondary">{t('dialog.food_available')}</span>
                    <span className={notEnoughFood ? 'text-game-red-bright tabular-nums' : 'text-res-food tabular-nums'}>
                      {formatNumber(playerFood)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Risk / Reward */}
              <div className="grid grid-cols-2 gap-2 text-game-xs font-body">
                <div className="bg-game-green/5 border border-green-900/40 rounded-game-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CheckCircle className="size-3 text-game-green-bright shrink-0" />
                    <p className="font-heading uppercase text-game-green-bright text-game-xs">{t('dialog.victory_title')}</p>
                  </div>
                  <ul className="space-y-0.5 text-game-text-secondary">
                    <li>› {t('dialog.victory_1')}</li>
                    <li>› {t('dialog.victory_2')}</li>
                    <li>› {t('dialog.victory_3')}</li>
                  </ul>
                </div>
                <div className="bg-game-red/5 border border-red-900/40 rounded-game-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Skull className="size-3 text-game-red-bright shrink-0" />
                    <p className="font-heading uppercase text-game-red-bright text-game-xs">{t('dialog.defeat_title')}</p>
                  </div>
                  <ul className="space-y-0.5 text-game-text-secondary">
                    <li>› {t('dialog.defeat_1')}</li>
                    <li>› {t('dialog.defeat_2')}</li>
                    <li>› {t('dialog.defeat_3')}</li>
                  </ul>
                </div>
              </div>

              {/* Validation errors */}
              {(noSoldiers || notEnoughFood || notEnoughTurns) && (
                <div className="rounded-game-lg border border-red-900/60 bg-red-950/20 px-3 py-2 font-body text-game-sm text-game-red-bright space-y-0.5 flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    {noSoldiers && <p>{t('dialog.no_soldiers')}</p>}
                    {!noSoldiers && notEnoughFood && <p>{t('dialog.no_food')}</p>}
                    {notEnoughTurns && <p>{t('dialog.no_turns')}</p>}
                  </div>
                </div>
              )}
              {target.is_vacation && (
                <div className="rounded-game-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 font-body text-game-sm text-amber-400">
                  {t('dialog.vacation_attack')}
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
                  {t('dialog.attack_btn')}
                </Button>
                <Button variant="ghost" disabled={loading} onClick={onClose}>{t('dialog.cancel_btn')}</Button>
              </div>
            </div>
          )}

          {/* ── SPY TAB ─────────────────────────────────────────────── */}
          {tab === 'spy' && (
            <div className="space-y-3">
              <div className="bg-gradient-to-b from-purple-950/20 to-game-surface border border-purple-900/40 rounded-game-lg p-3 shadow-engrave">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2.5">{t('dialog.spies_to_send')}</p>
                <div className="flex items-center gap-3">
                  <SpyStepBtn onClick={() => clampSpies(spiesSent - 1)} disabled={spiesSent <= 1} label="−" />
                  <span className="flex-1 text-center font-display text-game-2xl text-game-purple-bright font-bold tabular-nums">
                    {spiesSent}
                  </span>
                  <SpyStepBtn onClick={() => clampSpies(spiesSent + 1)} disabled={spiesSent >= Math.max(1, armySpies)} label="+" />
                </div>
              </div>

              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">{t('dialog.requirements')}</p>
                <div className="space-y-1.5 font-body text-game-sm">
                  <div className="flex justify-between">
                    <span className="text-game-text-secondary">{t('dialog.turn_cost')}</span>
                    <span className={notEnoughSpyTurns ? 'text-game-red-bright font-semibold' : 'text-game-text-white'}>
                      {spyTurnCost} {t('dialog.turn_singular')} ({playerTurns} {t('dialog.available')})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-game-text-secondary">{t('dialog.spies_available')}</span>
                    <span className={notEnoughSpies ? 'text-game-red-bright font-semibold' : 'text-game-text-white'}>
                      {formatNumber(armySpies)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-game-xs font-body">
                <div className="bg-game-green/5 border border-green-900/40 rounded-game-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CheckCircle className="size-3 text-game-green-bright" />
                    <p className="font-heading uppercase text-game-green-bright text-game-xs">{t('dialog.spy_success')}</p>
                  </div>
                  <ul className="space-y-0.5 text-game-text-secondary">
                    <li>› {t('dialog.spy_success_1')}</li>
                    <li>› {t('dialog.spy_success_2')}</li>
                    <li>› {t('dialog.spy_success_3')}</li>
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-game-red/5 border border-red-900/40 rounded-game-lg p-2.5">
                    <p className="font-heading uppercase text-game-red-bright mb-1.5 text-game-xs">{t('dialog.spy_failure')}</p>
                    <ul className="space-y-0.5 text-game-text-secondary">
                      <li>› {t('dialog.spy_failure_1')}</li>
                      <li>› {t('dialog.spy_failure_2')}</li>
                    </ul>
                  </div>
                  <div className="bg-amber-950/20 border border-amber-900/40 rounded-game-lg p-2.5">
                    <p className="font-heading uppercase text-amber-400 mb-1.5 text-game-xs">{t('dialog.spy_critical')}</p>
                    <ul className="space-y-0.5 text-game-text-secondary">
                      <li>› {t('dialog.spy_critical_1')}</li>
                      <li>› {t('dialog.spy_critical_2')}</li>
                    </ul>
                  </div>
                </div>
              </div>

              {(notEnoughSpyTurns || notEnoughSpies) && (
                <div className="rounded-game-lg border border-red-900/60 bg-red-950/20 px-3 py-2 font-body text-game-sm text-game-red-bright flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    {notEnoughSpyTurns && <p>{t('dialog.no_spy_turns').replace('{need}', String(spyTurnCost))}</p>}
                    {!notEnoughSpyTurns && notEnoughSpies && (
                      <p>
                        {armySpies < BALANCE.spy.minSpies
                          ? t('dialog.min_spies').replace('{min}', String(BALANCE.spy.minSpies))
                          : t('dialog.max_spies').replace('{count}', String(armySpies))}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {target.is_vacation && (
                <div className="rounded-game-lg border border-amber-900/60 bg-amber-950/20 px-3 py-2 font-body text-game-sm text-amber-400">
                  {t('dialog.vacation_spy')}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <Button variant="magic" loading={loading} disabled={spyDisabled} onClick={() => onSpy(spiesSent)} className="flex-1">
                  <Eye className="size-4" />
                  {t('dialog.send_spies')}
                </Button>
                <Button variant="ghost" disabled={loading} onClick={onClose}>{t('dialog.cancel_btn')}</Button>
              </div>
            </div>
          )}

        </div>
      )}
    </Modal>
  )
}
