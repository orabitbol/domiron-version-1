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

// ── Shared step button (defined OUTSIDE parent to prevent remount) ─────────────
interface StepBtnProps {
  onClick: () => void
  disabled: boolean
  label: string
  variant?: 'gold' | 'purple'
}
function StepBtn({ onClick, disabled, label, variant = 'gold' }: StepBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-10 h-10 flex items-center justify-center rounded-game border border-game-border bg-game-elevated
        text-game-text-muted disabled:opacity-20 disabled:cursor-not-allowed
        transition-colors font-heading text-game-lg select-none
        ${variant === 'gold'
          ? 'hover:text-game-gold hover:border-amber-700/50 hover:bg-amber-950/20'
          : 'hover:text-game-purple-bright hover:border-purple-700 hover:bg-purple-950/20'
        }`}
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
  const [tab, setTab]             = useState<ActionTab>('attack')
  const [turns, setTurns]         = useState(1)
  const [spiesSent, setSpiesSent] = useState(1)

  useEffect(() => {
    if (target) { setTab('attack'); setTurns(1); setSpiesSent(1) }
  }, [target?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const MAX_TURNS   = BALANCE.combat.MAX_TURNS_PER_ATTACK
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

  function clampTurns(v: number) { setTurns(Math.max(1, Math.min(MAX_TURNS, v))) }
  function clampSpies(v: number) { setSpiesSent(Math.max(1, Math.min(Math.max(1, armySpies), v))) }

  // Modal title reflects the active action
  const modalTitle = tab === 'attack' ? t('attack.title') : t('dialog.tab_spy')

  return (
    <Modal isOpen={!!target} onClose={onClose} title={modalTitle} size="md">
      {target && (
        <div className="space-y-3">

          {/* ── Target identity ───────────────────────────────────── */}
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
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1.5 justify-end">
                  <Shield className="size-3 text-game-text-muted opacity-60" />
                  <span className="font-body text-game-xs text-game-text-muted">{t('dialog.soldiers_label')}</span>
                  <span className="font-heading text-game-sm text-game-text-white tabular-nums">{formatNumber(target.soldiers)}</span>
                </div>
                {(target.resource_shield_active || target.soldier_shield_active || target.is_protected || target.kill_cooldown_active) && (
                  <div className="flex gap-1 justify-end flex-wrap mt-1">
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
                        {t('attack.status_protected').split(' — ')[0]}
                      </span>
                    )}
                    {target.kill_cooldown_active && (
                      <span className="px-1.5 py-0.5 rounded border border-orange-700/40 bg-orange-950/30 font-body text-game-xs text-orange-300 whitespace-nowrap">
                        {t('attack.status_cooldown').split(' — ')[0]}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Tabs ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 rounded-game overflow-hidden border border-game-border">
            <button
              type="button"
              onClick={() => setTab('attack')}
              className={`flex items-center justify-center gap-2 py-2.5 font-heading text-game-sm uppercase tracking-wide transition-colors border-e border-game-border ${
                tab === 'attack'
                  ? 'bg-gradient-to-b from-red-950/60 to-red-950/20 text-game-red-bright'
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

          {/* ── ATTACK TAB ────────────────────────────────────────── */}
          {tab === 'attack' && (
            <div className="space-y-3">

              {/* Compact turn stepper + cost — single card */}
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
                {/* Stepper row */}
                <div className="flex items-center gap-3">
                  <StepBtn onClick={() => clampTurns(turns - 1)} disabled={turns <= 1} label="−" />
                  <div className="flex-1 text-center">
                    <span className="font-display text-game-3xl text-game-gold font-bold tabular-nums">{turns}</span>
                    <span className="font-body text-game-xs text-game-text-muted ms-1.5">
                      {turns === 1 ? t('dialog.turn_singular') : t('dialog.turns_row').toLowerCase()}
                    </span>
                  </div>
                  <StepBtn onClick={() => clampTurns(turns + 1)} disabled={turns >= MAX_TURNS || playerTurns <= turns} label="+" />
                </div>

                {/* Glide slider */}
                <div className="mt-3 px-1">
                  <input
                    type="range"
                    min={1}
                    max={Math.min(MAX_TURNS, playerTurns)}
                    value={turns}
                    onChange={(e) => clampTurns(Number(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                      bg-game-border
                      [&::-webkit-slider-thumb]:appearance-none
                      [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:h-4
                      [&::-webkit-slider-thumb]:rounded-full
                      [&::-webkit-slider-thumb]:bg-amber-400
                      [&::-webkit-slider-thumb]:border-2
                      [&::-webkit-slider-thumb]:border-amber-600
                      [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(251,191,36,0.5)]
                      [&::-webkit-slider-thumb]:transition-shadow
                      [&::-webkit-slider-thumb]:hover:shadow-[0_0_10px_rgba(251,191,36,0.7)]
                      [&::-moz-range-thumb]:w-4
                      [&::-moz-range-thumb]:h-4
                      [&::-moz-range-thumb]:rounded-full
                      [&::-moz-range-thumb]:bg-amber-400
                      [&::-moz-range-thumb]:border-2
                      [&::-moz-range-thumb]:border-amber-600
                      [&::-moz-range-thumb]:shadow-[0_0_6px_rgba(251,191,36,0.5)]
                      [&::-moz-range-thumb]:cursor-pointer
                      [&::-webkit-slider-runnable-track]:rounded-full
                      [&::-webkit-slider-runnable-track]:bg-gradient-to-r
                      [&::-webkit-slider-runnable-track]:from-amber-900/60
                      [&::-webkit-slider-runnable-track]:to-game-border"
                    style={(() => {
                      const maxSlider = Math.min(MAX_TURNS, playerTurns)
                      const pct = maxSlider <= 1 ? 100 : ((turns - 1) / (maxSlider - 1)) * 100
                      return {
                        background: `linear-gradient(to right, rgba(180,83,9,0.6) 0%, rgba(180,83,9,0.6) ${pct}%, rgba(255,255,255,0.08) ${pct}%, rgba(255,255,255,0.08) 100%)`,
                      }
                    })()}
                  />
                  <div className="flex justify-between mt-1 font-body text-game-xs text-game-text-muted">
                    <span>1</span>
                    <span>{Math.min(MAX_TURNS, playerTurns)}</span>
                  </div>
                </div>

                {/* Inline cost */}
                <div className="mt-2.5 pt-2 border-t border-game-border/40 space-y-1.5 font-body">
                  <div className="flex justify-between text-game-sm">
                    <span className="text-game-text-secondary">{t('dialog.food_cost')}</span>
                    <span className={notEnoughFood ? 'text-game-red-bright font-semibold tabular-nums' : 'text-res-food font-semibold tabular-nums'}>
                      {formatNumber(foodCost)}
                      {armySoldiers > 0 && (
                        <span className="text-game-xs text-game-text-muted font-normal ms-1.5">
                          ({formatNumber(foodPerTurn)}{t('dialog.food_per_turn') !== 'per turn' ? '/' : '/'}{t('dialog.food_per_turn')})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-game-xs text-game-text-muted">
                    <span className={noSoldiers ? 'text-game-red-bright' : ''}>
                      {formatNumber(armySoldiers)} {t('dialog.soldiers_row').toLowerCase()}
                    </span>
                    <span className={notEnoughTurns ? 'text-game-red-bright' : ''}>
                      {t('dialog.food_available')}: <span className={notEnoughFood ? 'text-game-red-bright' : 'text-res-food'}>{formatNumber(playerFood)}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Risk / Reward */}
              <div className="grid grid-cols-2 gap-2 font-body text-game-xs">
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

              {/* Validation */}
              {(noSoldiers || notEnoughFood || notEnoughTurns) && (
                <div className="rounded-game-lg border border-red-900/60 bg-red-950/20 px-3 py-2 font-body text-game-sm text-game-red-bright flex items-start gap-2">
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
                <Button variant="danger" loading={loading} disabled={attackDisabled} onClick={() => onAttack(turns)} className="flex-1">
                  <Sword className="size-4" />
                  {t('dialog.attack_btn')}
                </Button>
                <Button variant="ghost" disabled={loading} onClick={onClose}>{t('dialog.cancel_btn')}</Button>
              </div>
            </div>
          )}

          {/* ── SPY TAB ───────────────────────────────────────────── */}
          {tab === 'spy' && (
            <div className="space-y-3">

              {/* Spy stepper */}
              <div className="bg-gradient-to-b from-purple-950/20 to-game-surface border border-purple-900/40 rounded-game-lg p-3 shadow-engrave">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2.5">{t('dialog.spies_to_send')}</p>
                <div className="flex items-center gap-3">
                  <StepBtn onClick={() => clampSpies(spiesSent - 1)} disabled={spiesSent <= 1} label="−" variant="purple" />
                  <span className="flex-1 text-center font-display text-game-2xl text-game-purple-bright font-bold tabular-nums">
                    {spiesSent}
                  </span>
                  <StepBtn onClick={() => clampSpies(spiesSent + 1)} disabled={spiesSent >= Math.max(1, armySpies)} label="+" variant="purple" />
                </div>
              </div>

              {/* Requirements */}
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

              {/* Outcome descriptions */}
              <div className="space-y-2 font-body text-game-xs">
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

              {/* Validation */}
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
