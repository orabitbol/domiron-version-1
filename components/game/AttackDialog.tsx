'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircle, AlertCircle, Skull } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  armyCavalry?: number
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
      className={cn(
        'w-10 h-10 flex items-center justify-center rounded-game border border-game-border bg-game-elevated',
        'text-game-text-muted disabled:opacity-20 disabled:cursor-not-allowed',
        'transition-colors font-heading text-game-lg select-none',
        variant === 'gold'
          ? 'hover:text-game-gold hover:border-amber-700/50 hover:bg-amber-950/20'
          : 'hover:text-game-purple-bright hover:border-purple-700 hover:bg-purple-950/20'
      )}
    >
      {label}
    </button>
  )
}

export function AttackDialog({
  target,
  onClose,
  armySoldiers,
  armyCavalry = 0,
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

  const modalTitle = tab === 'attack' ? t('attack.title') : t('dialog.tab_spy')

  return (
    <Modal isOpen={!!target} onClose={onClose} title={modalTitle} size="md">
      {target && (
        <div className="space-y-4">

          {/* ── Target identity panel ─────────────────────────── */}
          <div className="flex items-center gap-3 p-3 rounded-game-lg bg-game-elevated border border-game-border">
            <div className="flex-1 min-w-0">
              <p className="font-display text-game-lg text-game-gold-bright font-bold truncate leading-tight">{target.army_name}</p>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
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

            {/* Status shields as compact chips */}
            <div className="flex gap-1 flex-wrap justify-end shrink-0">
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
          </div>

          {/* ── Tab buttons (Attack / Spy) ─────────────────────── */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTab('attack')}
              className={cn(
                'flex flex-col items-center gap-2 py-3 px-4 rounded-game-lg border-2 transition-all',
                tab === 'attack'
                  ? 'border-game-red/60 bg-game-red/10 shadow-[0_0_16px_rgba(220,60,60,0.25)]'
                  : 'border-game-border bg-game-elevated opacity-60 hover:opacity-80'
              )}
            >
              <img
                src="/icons/attack-power.png"
                style={{ width: 48, height: 48, objectFit: 'contain', filter: tab === 'attack' ? 'drop-shadow(0 0 12px rgba(220,60,60,0.7))' : 'none' }}
                alt=""
              />
              <span className="font-heading text-game-xs font-bold text-game-text-white">{t('dialog.tab_attack')}</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('spy')}
              className={cn(
                'flex flex-col items-center gap-2 py-3 px-4 rounded-game-lg border-2 transition-all',
                tab === 'spy'
                  ? 'border-game-purple/60 bg-game-purple/10 shadow-[0_0_16px_rgba(160,80,220,0.25)]'
                  : 'border-game-border bg-game-elevated opacity-60 hover:opacity-80'
              )}
            >
              <img
                src="/icons/spy-power.png"
                style={{ width: 48, height: 48, objectFit: 'contain', filter: tab === 'spy' ? 'drop-shadow(0 0 12px rgba(160,80,220,0.7))' : 'none' }}
                alt=""
              />
              <span className="font-heading text-game-xs font-bold text-game-text-white">{t('dialog.tab_spy')}</span>
            </button>
          </div>

          {/* ── ATTACK TAB ────────────────────────────────────────── */}
          {tab === 'attack' && (
            <div className="space-y-3">

              {/* Force overview stat row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center p-2 rounded-game bg-game-elevated border border-game-border">
                  <img
                    src="/icons/solders.png"
                    style={{ width: 34, height: 34, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(220,60,60,0.6))' }}
                    alt=""
                  />
                  <span className={cn('font-heading text-game-sm font-bold tabular-nums mt-1', noSoldiers ? 'text-game-red-bright' : 'text-game-text-white')}>
                    {formatNumber(armySoldiers)}
                  </span>
                  <span className="text-game-2xs text-game-text-muted font-body">חיילים</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-game bg-game-elevated border border-game-border">
                  <img
                    src="/icons/cavalry.png"
                    style={{ width: 34, height: 34, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(200,150,30,0.6))' }}
                    alt=""
                  />
                  <span className="font-heading text-game-sm font-bold text-game-text-white tabular-nums mt-1">
                    {formatNumber(armyCavalry)}
                  </span>
                  <span className="text-game-2xs text-game-text-muted font-body">פרשים</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-game bg-game-elevated border border-game-border">
                  <img
                    src="/icons/food.png"
                    style={{ width: 34, height: 34, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(240,140,60,0.6))' }}
                    alt=""
                  />
                  <span className={cn('font-heading text-game-sm font-bold tabular-nums mt-1', notEnoughFood ? 'text-game-red-bright' : 'text-game-text-white')}>
                    {formatNumber(playerFood)}
                  </span>
                  <span className="text-game-2xs text-game-text-muted font-body">מזון</span>
                </div>
              </div>

              {/* Turn selector — premium styled block */}
              <div className="p-3 rounded-game-lg bg-game-elevated border border-game-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-heading text-game-xs text-game-text-secondary uppercase tracking-wide">{t('dialog.turns_row')}</span>
                  <span className="font-heading text-game-lg font-bold text-game-gold-bright">{turns}</span>
                </div>

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

                {/* Food cost inline */}
                <div className="flex items-center gap-1 mt-2 text-game-2xs text-game-text-muted font-body">
                  <img src="/icons/food.png" style={{ width: 16, height: 16, objectFit: 'contain' }} alt="" />
                  <span className={notEnoughFood ? 'text-game-red-bright' : 'text-res-food'}>
                    {t('dialog.food_cost')}: <strong className="tabular-nums">{formatNumber(foodCost)}</strong>
                  </span>
                  {armySoldiers > 0 && (
                    <span className="opacity-60 ms-1">
                      ({formatNumber(foodPerTurn)}/{t('dialog.food_per_turn')})
                    </span>
                  )}
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

              {/* Validation warnings */}
              {(noSoldiers || notEnoughFood || notEnoughTurns) && (
                <div className="flex items-start gap-2 p-2.5 rounded-game bg-game-red/10 border border-game-red/30 text-game-xs text-game-red-bright font-body">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    {noSoldiers && <p>{t('dialog.no_soldiers')}</p>}
                    {!noSoldiers && notEnoughFood && <p>{t('dialog.no_food')}</p>}
                    {notEnoughTurns && <p>{t('dialog.no_turns')}</p>}
                  </div>
                </div>
              )}
              {target.is_vacation && (
                <div className="flex items-start gap-2 p-2.5 rounded-game bg-amber-950/20 border border-amber-900/40 text-game-xs text-amber-400 font-body">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  <span>{t('dialog.vacation_attack')}</span>
                </div>
              )}

              {/* Attack action button */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  disabled={attackDisabled || loading}
                  onClick={() => onAttack(turns)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-3 py-3 px-6 rounded-game-lg border-2 transition-all font-heading text-game-base font-bold',
                    'bg-game-red/20 border-game-red/50 text-game-red-bright',
                    'hover:bg-game-red/30 hover:border-game-red/70',
                    'shadow-[0_0_20px_rgba(220,60,60,0.2)] hover:shadow-[0_0_28px_rgba(220,60,60,0.35)]',
                    'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none'
                  )}
                >
                  {loading ? (
                    <span className="opacity-60">{t('common.loading') ?? '...'}</span>
                  ) : (
                    <>
                      <img src="/icons/attack-power.png" style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(220,60,60,0.7))' }} alt="" />
                      {t('dialog.attack_btn')}
                    </>
                  )}
                </button>
                <Button variant="ghost" disabled={loading} onClick={onClose}>{t('dialog.cancel_btn')}</Button>
              </div>
            </div>
          )}

          {/* ── SPY TAB ───────────────────────────────────────────── */}
          {tab === 'spy' && (
            <div className="space-y-3">

              {/* Spy overview stat */}
              <div className="flex items-center gap-3 p-3 rounded-game-lg bg-game-elevated border border-game-border">
                <img
                  src="/icons/spy.png"
                  style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(160,80,220,0.65))' }}
                  alt=""
                />
                <div>
                  <p className="text-game-2xs text-game-text-muted font-heading uppercase tracking-wide">{t('dialog.spies_available')}</p>
                  <p className={cn('font-heading text-game-xl font-bold tabular-nums', notEnoughSpies ? 'text-game-red-bright' : 'text-game-purple-bright')}>
                    {formatNumber(armySpies)}
                  </p>
                </div>
              </div>

              {/* Spy stepper */}
              <div className="p-3 rounded-game-lg bg-purple-950/20 border border-purple-900/40">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2.5">{t('dialog.spies_to_send')}</p>
                <div className="flex items-center gap-3">
                  <StepBtn onClick={() => clampSpies(spiesSent - 1)} disabled={spiesSent <= 1} label="−" variant="purple" />
                  <span className="flex-1 text-center font-display text-game-2xl text-game-purple-bright font-bold tabular-nums">
                    {spiesSent}
                  </span>
                  <StepBtn onClick={() => clampSpies(spiesSent + 1)} disabled={spiesSent >= Math.max(1, armySpies)} label="+" variant="purple" />
                </div>

                {/* Turn cost row */}
                <div className="mt-3 pt-2.5 border-t border-game-border/40 flex justify-between font-body text-game-xs">
                  <span className="text-game-text-secondary">{t('dialog.turn_cost')}</span>
                  <span className={notEnoughSpyTurns ? 'text-game-red-bright font-semibold' : 'text-game-text-white'}>
                    {spyTurnCost} {t('dialog.turn_singular')} ({playerTurns} {t('dialog.available')})
                  </span>
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

              {/* Validation warnings */}
              {(notEnoughSpyTurns || notEnoughSpies) && (
                <div className="flex items-start gap-2 p-2.5 rounded-game bg-game-red/10 border border-game-red/30 text-game-xs text-game-red-bright font-body">
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
                <div className="flex items-start gap-2 p-2.5 rounded-game bg-amber-950/20 border border-amber-900/40 text-game-xs text-amber-400 font-body">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  <span>{t('dialog.vacation_spy')}</span>
                </div>
              )}

              {/* Send Spies action button */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  disabled={spyDisabled || loading}
                  onClick={() => onSpy(spiesSent)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-3 py-3 px-6 rounded-game-lg border-2 transition-all font-heading text-game-base font-bold',
                    'bg-game-purple/20 border-game-purple/50 text-game-purple-bright',
                    'hover:bg-game-purple/30 hover:border-game-purple/70',
                    'shadow-[0_0_20px_rgba(160,80,220,0.2)] hover:shadow-[0_0_28px_rgba(160,80,220,0.35)]',
                    'disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none'
                  )}
                >
                  {loading ? (
                    <span className="opacity-60">{t('common.loading') ?? '...'}</span>
                  ) : (
                    <>
                      <img src="/icons/spy-power.png" style={{ width: 44, height: 44, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(160,80,220,0.7))' }} alt="" />
                      {t('dialog.send_spies')}
                    </>
                  )}
                </button>
                <Button variant="ghost" disabled={loading} onClick={onClose}>{t('dialog.cancel_btn')}</Button>
              </div>
            </div>
          )}

        </div>
      )}
    </Modal>
  )
}
