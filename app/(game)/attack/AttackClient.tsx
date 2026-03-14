'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
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
import { Trophy, Skull, Info } from 'lucide-react'

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
        minWidth: 40, minHeight: 44,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6,
        border: active ? '1px solid rgba(240,192,48,0.5)' : '1px solid rgba(255,255,255,0.08)',
        background: active ? 'rgba(240,192,48,0.12)' : disabled ? 'transparent' : 'rgba(255,255,255,0.03)',
        color: active ? '#F0C030' : disabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.55)',
        fontSize: 13,
        fontFamily: 'var(--font-body, sans-serif)',
        fontWeight: active ? 700 : 400,
        cursor: (disabled || active) ? 'default' : 'pointer',
        transition: 'all 0.12s ease',
        padding: '0 8px',
      }}
    >
      {label}
    </button>
  )
}

interface PowerSideProps {
  label: string
  iconSrc: string
  pp: number
  heroBonus: number
  raceBonus: number
  clanBonus: number
  baseEcp: number
  tribeMult: number
  finalEcp: number
  highlight: boolean
  compact?: boolean
}

function PowerSide({ label, iconSrc, pp, heroBonus, raceBonus, clanBonus, baseEcp, tribeMult, finalEcp, highlight, compact = false }: PowerSideProps) {
  const t = useTranslations()
  const hasHero  = heroBonus  > 0.001
  const hasRace  = raceBonus  > 0.001
  const hasClan  = clanBonus  > 0
  const hasTribe = tribeMult  > 1.001

  const row = 'flex justify-between items-baseline gap-1'
  const lbl = compact ? 'text-game-xs text-game-text-muted truncate' : 'text-game-xs text-game-text-muted'
  const val = compact ? 'text-game-xs tabular-nums text-game-text-white shrink-0' : 'text-game-sm tabular-nums text-game-text-white shrink-0'

  return (
    <div className={`rounded-game border shadow-engrave ${compact ? 'p-2.5' : 'p-3'} ${
      highlight ? 'border-amber-700/40 bg-gradient-to-b from-amber-950/20 to-game-surface' : 'border-game-border bg-gradient-to-b from-game-elevated to-game-surface'
    }`}>
      {/* Crest header — icon circle + label + final ECP */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, paddingBottom: compact ? 8 : 10, borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: compact ? 6 : 8 }}>
        <img src={iconSrc} style={{
          width: compact ? 56 : 68, height: compact ? 56 : 68, objectFit: 'contain', flexShrink: 0,
          filter: highlight
            ? 'drop-shadow(0 0 12px rgba(240,192,48,0.70)) drop-shadow(0 2px 6px rgba(0,0,0,0.45))'
            : 'drop-shadow(0 0 8px rgba(255,255,255,0.30)) drop-shadow(0 2px 6px rgba(0,0,0,0.45))',
        }} alt="" />
        <p className="font-heading text-game-2xs uppercase tracking-widest text-game-text-muted text-center w-full truncate">{label}</p>
        <p className={`font-display ${compact ? 'text-game-2xl' : 'text-game-3xl'} font-bold tabular-nums leading-none ${highlight ? 'text-game-gold-bright' : 'text-game-text-white'}`}>
          {formatNumber(finalEcp)}
        </p>
        <p className="font-body text-game-2xs text-game-text-muted leading-none opacity-60">כוח סופי</p>
      </div>
      <div className={`${compact ? 'space-y-0.5' : 'space-y-1'} font-body`}>
        <div className={row}>
          <span className={lbl}>{t('attack.base_pp')}</span>
          <span className={val}>{formatNumber(pp)}</span>
        </div>
        {hasHero && (
          <div className={row}>
            <span className="text-game-xs text-purple-400 truncate">{t('attack.hero_bonus_label')} +{Math.round(heroBonus * 100)}%</span>
            <span className="text-game-xs tabular-nums text-purple-300 shrink-0">×{(1 + heroBonus).toFixed(2)}</span>
          </div>
        )}
        {hasRace && (
          <div className={row}>
            <span className="text-game-xs text-cyan-400 truncate">{t('attack.race_bonus_label')} +{Math.round(raceBonus * 100)}%</span>
            <span className="text-game-xs tabular-nums text-cyan-300 shrink-0">×{(1 + raceBonus).toFixed(2)}</span>
          </div>
        )}
        {hasClan && (
          <div className={row}>
            <span className="text-game-xs text-blue-400 truncate">{t('attack.clan_bonus')}</span>
            <span className="text-game-xs tabular-nums text-blue-300 shrink-0">+{formatNumber(clanBonus)}</span>
          </div>
        )}
        <div className={`border-t border-game-border/50 pt-0.5 ${row}`}>
          <span className="text-game-xs text-game-text-secondary truncate">
            {hasTribe ? t('attack.base_ecp_label') : 'ECP'}
          </span>
          <span className="text-game-xs tabular-nums font-semibold shrink-0 text-game-text-white">
            {formatNumber(hasTribe ? baseEcp : finalEcp)}
          </span>
        </div>
        {hasTribe && (
          <div className={row}>
            <span className="text-game-xs text-amber-400 truncate">{t('attack.tribe_spell_label')}</span>
            <span className="text-game-xs tabular-nums text-amber-300 shrink-0">×{tribeMult.toFixed(2)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function BattleReportModal({ report, onClose }: { report: BattleReport; onClose: () => void }) {
  const t = useTranslations()
  const isWin = report.outcome === 'WIN'

  const REASON_LABELS: Record<BattleReportReason, string> = {
    OUTCOME_LOSS_NO_LOOT:         t('attack.reason_loss_no_loot'),
    DEFENDER_PROTECTED:           t('attack.reason_defender_protected'),
    RESOURCE_SHIELD_ACTIVE:       t('attack.reason_resource_shield'),
    NO_UNBANKED_RESOURCES:        t('attack.reason_no_resources'),
    KILL_COOLDOWN_NO_LOSSES:      t('attack.reason_kill_cooldown'),
    ATTACKER_PROTECTED_NO_LOSSES: t('attack.reason_attacker_protected'),
    SOLDIER_SHIELD_NO_LOSSES:     t('attack.reason_soldier_shield'),
    LOOT_DECAY_REDUCED:           t('attack.reason_loot_decay'),
  }

  // ── Loot: all 4 resources always shown (even if zero) ──────────────────
  const loot = report.gained.loot
  const lootItems = [
    { key: 'gold', label: t('resources.gold'), amount: loot.gold ?? 0, cls: 'text-res-gold', colorRgb: '240,192,48',  iconSrc: '/icons/gold.png', iconSize: 72 },
    { key: 'iron', label: t('resources.iron'), amount: loot.iron ?? 0, cls: 'text-res-iron', colorRgb: '152,152,192', iconSrc: '/icons/iron.png', iconSize: 83 },
    { key: 'wood', label: t('resources.wood'), amount: loot.wood ?? 0, cls: 'text-res-wood', colorRgb: '100,180,80',  iconSrc: '/icons/wood.png', iconSize: 83 },
    { key: 'food', label: t('resources.food'), amount: loot.food ?? 0, cls: 'text-res-food', colorRgb: '240,140,60',  iconSrc: '/icons/food.png', iconSize: 72 },
  ]

  const captives     = report.gained.captives ?? 0
  const decayActive  = report.flags.anti_farm_decay_mult < 1
  const hasModifiers = report.reasons.length > 0
  const attLosses    = report.attacker.losses.soldiers
  const defLosses    = report.defender.losses.soldiers

  return (
    <div className="space-y-2">

      {/* ── 1. OUTCOME HERO — no ratio badge ───────────── */}
      <div className={`rounded-game-lg border relative overflow-hidden py-3.5 px-4 text-center ${
        isWin
          ? 'bg-gradient-to-b from-amber-950/70 via-amber-950/20 to-transparent border-amber-700/50'
          : 'bg-gradient-to-b from-red-950/70 via-red-950/20 to-transparent border-red-900/50'
      }`}>
        <div className={`absolute inset-x-0 top-0 h-0.5 ${
          isWin ? 'bg-gradient-to-r from-transparent via-amber-400/80 to-transparent'
                : 'bg-gradient-to-r from-transparent via-red-500/80 to-transparent'
        }`} />
        <div className="flex items-center justify-center gap-2.5 mb-0.5">
          {isWin ? <Trophy className="size-5 text-game-gold-bright" /> : <Skull className="size-5 text-game-red-bright" />}
          <p className={`font-display text-game-4xl uppercase tracking-widest text-title-glow ${
            isWin ? 'text-game-gold-bright' : 'text-game-red-bright'
          }`}>
            {isWin ? t('attack.victory') : t('attack.defeat')}
          </p>
          {isWin ? <Trophy className="size-5 text-game-gold-bright" /> : <Skull className="size-5 text-game-red-bright" />}
        </div>
        <p className="font-body text-game-xs text-game-text-muted/70">
          {report.attacker.name}
          <span className="mx-2 opacity-40">⚔</span>
          {report.defender.name}
        </p>
      </div>

      {/* ── 2. POWER — compact, calmer ─────────────────── */}
      <div>
        <p className="font-heading text-game-xs uppercase tracking-widest text-game-text-muted px-0.5 mb-1 flex items-center gap-1.5">
          <img src="/icons/attack-power.png" style={{ width: 13, height: 13, objectFit: 'contain', opacity: 0.65, flexShrink: 0 }} alt="" />
          {t('attack.power_breakdown')}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          <PowerSide
            label={t('attack.your_attack')}
            iconSrc="/icons/attack-power.png"
            pp={report.attacker.pp_attack}
            heroBonus={report.attacker.hero_bonus_attack}
            raceBonus={report.attacker.race_bonus_attack}
            clanBonus={report.attacker.clan_bonus_attack}
            baseEcp={report.attacker.base_ecp_attack}
            tribeMult={report.attacker.tribe_mult_attack}
            finalEcp={report.attacker.ecp_attack}
            highlight={isWin}
            compact
          />
          <PowerSide
            label={t('attack.enemy_defense')}
            iconSrc="/icons/defense-power.png"
            pp={report.defender.pp_defense}
            heroBonus={report.defender.hero_bonus_defense}
            raceBonus={report.defender.race_bonus_defense}
            clanBonus={report.defender.clan_bonus_defense}
            baseEcp={report.defender.base_ecp_defense}
            tribeMult={report.defender.tribe_mult_defense}
            finalEcp={report.defender.ecp_defense}
            highlight={false}
            compact
          />
        </div>
      </div>

      {/* ── 3. SPOILS OF WAR — all 4 resources always shown ─── */}
      <div className={`rounded-game-lg border shadow-engrave relative overflow-hidden ${
        isWin ? 'border-amber-700/40 bg-gradient-to-b from-amber-950/30 to-amber-950/5' : 'border-game-border/50 bg-gradient-to-b from-game-elevated/30 to-game-surface/10'
      }`}>
        <div className={`absolute inset-x-0 top-0 h-px ${isWin ? 'bg-gradient-to-r from-transparent via-amber-500/60 to-transparent' : 'bg-gradient-to-r from-transparent via-game-border/40 to-transparent'}`} />
        <div className="px-3 pt-2.5 pb-2 flex items-center gap-2 border-b border-game-border/30">
          <Trophy className={`size-3.5 shrink-0 ${isWin ? 'text-game-gold-primary' : 'text-game-text-muted opacity-40'}`} />
          <span className={`font-heading text-game-xs uppercase tracking-widest ${isWin ? 'text-game-gold-primary' : 'text-game-text-muted'}`}>{t('attack.spoils_of_war')}</span>
          {decayActive && (
            <span className="ms-auto font-body text-game-xs text-amber-700 flex items-center gap-1 shrink-0">
              <Info className="size-2.5" />×{report.flags.anti_farm_decay_mult.toFixed(2)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1 px-2 py-3">
          {lootItems.map(({ key, label, amount, cls, colorRgb, iconSrc, iconSize }) => (
            <div key={key} className={`flex flex-col items-center gap-1.5 py-2 px-1 rounded-game ${amount === 0 ? 'opacity-40' : ''}`}>
              <img src={iconSrc} style={{ width: iconSize, height: iconSize, objectFit: 'contain', flexShrink: 0, filter: amount > 0 ? `drop-shadow(0 0 14px rgba(${colorRgb},0.70)) drop-shadow(0 3px 8px rgba(0,0,0,0.45))` : 'none' }} alt={label} />
              <p className={`font-display text-game-xl font-bold tabular-nums leading-none ${amount > 0 ? cls : 'text-game-text-muted'}`}>
                {amount > 0 ? `+${formatNumber(amount)}` : '0'}
              </p>
              <p className="font-body text-game-2xs text-game-text-muted leading-none text-center">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 4. CAPTIVES — always shown ─────────────────── */}
      <div className={`flex items-center gap-3 rounded-game-lg border px-3 py-2.5 shadow-engrave relative overflow-hidden ${
        captives > 0
          ? 'border-amber-700/50 bg-gradient-to-r from-amber-950/30 to-amber-950/5'
          : 'border-game-border/40 bg-game-elevated/20 opacity-50'
      }`}>
        {captives > 0 && <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />}
        <img src="/icons/slave.png" style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0, filter: captives > 0 ? 'drop-shadow(0 0 14px rgba(251,191,36,0.70)) drop-shadow(0 3px 8px rgba(0,0,0,0.45))' : 'none' }} alt="" />
        <div className="flex-1 min-w-0">
          <p className={`font-heading text-game-xs uppercase tracking-wide ${captives > 0 ? 'text-amber-400' : 'text-game-text-muted'}`}>{t('attack.captives_enslaved')}</p>
          <p className="font-body text-game-xs text-amber-700/60">{t('army.slaves')}</p>
        </div>
        <p className={`font-display text-game-2xl font-bold tabular-nums leading-none shrink-0 ${captives > 0 ? 'text-amber-300' : 'text-game-text-muted'}`}>
          {captives > 0 ? `+${formatNumber(captives)}` : '0'}
        </p>
      </div>

      {/* ── 5. CASUALTIES — unified split card ── */}
      <div className="rounded-game-lg border border-game-border/70 overflow-hidden shadow-engrave grid grid-cols-2">
        {/* Your losses */}
        <div className={`px-3 py-2.5 text-center border-e border-game-border/40 ${attLosses > 0 ? 'bg-red-950/20' : 'bg-game-elevated/20'}`}>
          <p className="font-heading text-game-xs uppercase tracking-wide text-game-text-muted mb-2 flex items-center justify-center gap-1.5">
            <img src="/icons/solders.png" style={{ width: 34, height: 34, objectFit: 'contain', opacity: 0.7, flexShrink: 0 }} alt="" />
            {t('attack.your_losses')}
          </p>
          <p className={`font-display text-game-2xl font-bold tabular-nums leading-none ${attLosses > 0 ? 'text-game-red-bright' : 'text-game-text-muted'}`}>
            {attLosses > 0 ? `−${formatNumber(attLosses)}` : '0'}
          </p>
          <p className="font-body text-game-xs text-game-text-muted mt-0.5">{t('army.soldiers')}</p>
        </div>
        {/* Enemy losses */}
        <div className={`px-3 py-2.5 text-center ${defLosses > 0 ? 'bg-green-950/20' : 'bg-game-elevated/20'}`}>
          <p className="font-heading text-game-xs uppercase tracking-wide text-game-text-muted mb-2 flex items-center justify-center gap-1.5">
            <Skull className="size-2.5 opacity-60" />{t('attack.enemy_losses')}
          </p>
          <p className={`font-display text-game-2xl font-bold tabular-nums leading-none ${defLosses > 0 ? 'text-game-green-bright' : 'text-game-text-muted'}`}>
            {defLosses > 0 ? `−${formatNumber(defLosses)}` : '0'}
          </p>
          <p className="font-body text-game-xs text-game-text-muted mt-0.5">{t('army.soldiers')}</p>
        </div>
      </div>

      {/* ── 6. FOOTER: COST + MODIFIERS ────────────────── */}
      <div className="rounded-game-lg border border-game-border/60 bg-gradient-to-b from-game-elevated to-game-surface shadow-engrave divide-y divide-game-border/40">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="font-heading text-game-xs uppercase tracking-wide text-game-text-muted">{t('attack.cost_paid')}</span>
          <div className="flex items-center gap-2.5 font-body text-game-sm">
            <span className="text-game-text-secondary tabular-nums">
              {report.attacker.turns_spent}<span className="text-game-text-muted text-game-xs ms-1">{t('attack.turns_spent')}</span>
            </span>
            <span className="text-game-text-muted text-game-xs">·</span>
            <span className="text-res-food tabular-nums">
              {formatNumber(report.attacker.food_spent)}<span className="text-game-text-muted text-game-xs ms-1">{t('resources.food')}</span>
            </span>
          </div>
        </div>
        {hasModifiers && (
          <div className="px-3 py-2">
            <p className="font-heading text-game-xs uppercase tracking-wide text-game-gold-primary mb-1 flex items-center gap-1">
              <Info className="size-2.5 opacity-80" />{t('attack.combat_modifiers')}
            </p>
            <ul className="space-y-0.5">
              {report.reasons.map((reason) => (
                <li key={reason} className="font-body text-game-xs text-game-text-secondary flex items-start gap-1.5">
                  <span className="shrink-0 text-game-gold-primary mt-0.5">›</span>
                  <span>{REASON_LABELS[reason]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
    </div>
  )
}

function SpyResultModal({ result, onClose }: { result: SpyResult; onClose: () => void }) {
  const t = useTranslations()
  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className={`font-display text-game-3xl uppercase tracking-wide text-title-glow ${result.success ? 'text-game-green-bright' : 'text-game-red-bright'}`}>
          {result.success ? t('dialog.mission_success') : t('dialog.mission_failed')}
        </p>
      </div>

      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 shadow-engrave">
        <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">{t('dialog.mission_summary')}</p>
        <div className="space-y-1.5 font-body text-game-sm">
          <div className="flex justify-between">
            <span className="text-game-text-secondary">{t('dialog.spies_sent')}</span>
            <span className="text-game-text-white font-semibold">{formatNumber(result.spies_sent)}</span>
          </div>
          {result.spies_caught > 0 && (
            <div className="flex justify-between">
              <span className="text-game-text-secondary">{t('dialog.spies_caught')}</span>
              <span className="text-game-red-bright font-semibold">{formatNumber(result.spies_caught)}</span>
            </div>
          )}
        </div>
      </div>

      {result.success && result.revealed && (
        <div className="bg-game-green/5 border border-green-900 rounded-game-lg p-3 shadow-engrave">
          <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-2">{t('dialog.intel_revealed')}</p>
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-x-6 gap-y-1 font-body text-game-sm">
            <div className="flex justify-between">
              <span className="text-game-text-secondary">{t('army.soldiers')}</span>
              <span className="text-game-text-white font-semibold">{formatNumber(result.revealed.soldiers)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-game-text-secondary">{t('army.spies')}</span>
              <span className="text-game-text-white font-semibold">{formatNumber(result.revealed.spies)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-game-text-secondary">{t('resources.gold')}</span>
              <span className="text-res-gold font-semibold">{formatNumber(result.revealed.gold)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-game-text-secondary">{t('resources.iron')}</span>
              <span className="text-res-iron font-semibold">{formatNumber(result.revealed.iron)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-game-text-secondary">{t('resources.wood')}</span>
              <span className="text-res-wood font-semibold">{formatNumber(result.revealed.wood)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-game-text-secondary">{t('resources.food')}</span>
              <span className="text-res-food font-semibold">{formatNumber(result.revealed.food)}</span>
            </div>
            {(result.revealed.resource_shield || result.revealed.soldier_shield) && (
              <div className="col-span-2 border-t border-game-border mt-1 pt-1 flex gap-4">
                {result.revealed.resource_shield && (
                  <span className="text-game-gold-bright text-game-xs font-heading uppercase">{t('attack.resource_shield_active')}</span>
                )}
                {result.revealed.soldier_shield && (
                  <span className="text-blue-400 text-game-xs font-heading uppercase">{t('attack.soldier_shield_active')}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
    </div>
  )
}

interface StatusIndicatorProps {
  resource: boolean
  soldier: boolean
  protected: boolean
  cooldown: boolean
}

const STATUS_DOT_STYLES = [
  { key: 'resource',  activeClass: 'bg-game-gold-bright border-game-gold-bright' },
  { key: 'soldier',   activeClass: 'bg-blue-400 border-blue-400'                 },
  { key: 'protected', activeClass: 'bg-green-400 border-green-400'               },
  { key: 'cooldown',  activeClass: 'bg-amber-400 border-amber-400'               },
] as const

function StatusIndicators({ resource, soldier, protected: isProtected, cooldown }: StatusIndicatorProps) {
  const t = useTranslations()
  const STATUS_DOTS = [
    { key: 'resource',  activeClass: 'bg-game-gold-bright border-game-gold-bright', title: t('attack.status_resource') },
    { key: 'soldier',   activeClass: 'bg-blue-400 border-blue-400',                 title: t('attack.status_soldier')  },
    { key: 'protected', activeClass: 'bg-green-400 border-green-400',               title: t('attack.status_protected') },
    { key: 'cooldown',  activeClass: 'bg-amber-400 border-amber-400',               title: t('attack.status_cooldown')  },
  ] as const
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
  const t = useTranslations()

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
        setMessage({ text: data.error ?? 'תקיפה נכשלה', type: 'error' })
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
      setMessage({ text: 'שגיאת רשת', type: 'error' })
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
        setMessage({ text: data.error ?? 'משימת ריגול נכשלה', type: 'error' })
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
      setMessage({ text: 'שגיאת רשת', type: 'error' })
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
            {t('attack.title')}
          </h1>
          <p className="text-game-text-secondary font-body mt-1">
            עיר {player?.city ?? '—'} — {filtered.length} מטרות זמינות
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg px-3 py-2 text-center shadow-emboss">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">{t('attack.turns_chip')}</p>
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
      <Input placeholder={t('attack.search_placeholder')} value={search} onChange={(e) => { setSearch(e.target.value); setAttackPage(1) }} />

      {/* Status legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-game-xs font-body text-game-text-muted">
        {STATUS_DOT_STYLES.map(({ key, activeClass }) => {
          const titleMap: Record<string, string> = {
            resource:  t('attack.status_resource').split(' — ')[0],
            soldier:   t('attack.status_soldier').split(' — ')[0],
            protected: t('attack.status_protected').split(' — ')[0],
            cooldown:  t('attack.status_cooldown').split(' — ')[0],
          }
          return (
            <span key={key} className="flex gap-1.5 items-center">
              <span className={`inline-block w-3 h-3 rounded-full border shadow-emboss ${activeClass}`} />
              {titleMap[key]}
            </span>
          )
        })}
        <span className="flex gap-1.5 items-center">
          <span className="inline-block w-3 h-3 rounded-full border border-game-border" /> {t('attack.status_none')}
        </span>
      </div>

      {/* Targets — card layout on mobile, table on sm+ */}
      <div className="panel-ornate rounded-game-lg shadow-engrave overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title={t('attack.no_targets_title')} description={t('attack.no_targets_desc')} />
        ) : (
          <>
            {/* ── Mobile: card list ─────────────────────────────── */}
            <div className="sm:hidden divide-y divide-game-border/40">
              {paginated.map((target) => {
                const isSelf = target.id === player?.id
                return (
                  <div key={target.id} className="px-4 py-3 space-y-2">
                    {/* Row 1: rank + name + badges + status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {target.rank_city && (
                            <span className="text-game-xs text-game-text-muted font-body tabular-nums shrink-0">
                              #{target.rank_city}
                            </span>
                          )}
                          <span className="font-heading text-game-sm uppercase text-game-text-white truncate">
                            {target.army_name}
                          </span>
                          {target.is_vacation && <Badge variant="blue">{t('attack.vacation_badge')}</Badge>}
                          {isSelf && <Badge variant="green">{t('attack.you_badge')}</Badge>}
                        </div>
                        {target.tribe_name && (
                          <p className="text-game-xs text-game-text-muted font-body mt-0.5">{target.tribe_name}</p>
                        )}
                      </div>
                      <StatusIndicators
                        resource={target.resource_shield_active}
                        soldier={target.soldier_shield_active}
                        protected={target.is_protected}
                        cooldown={target.kill_cooldown_active}
                      />
                    </div>
                    {/* Row 2: stats + action */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-4">
                        <span className="text-game-xs text-game-text-muted font-body flex items-center gap-1">
                          <img src="/icons/solders.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain', verticalAlign: 'middle', flexShrink: 0, display: 'inline-block' }} />
                          <span className="text-game-text-white font-semibold tabular-nums">{formatNumber(target.soldiers)}</span>
                        </span>
                        <span className="text-game-xs text-game-text-muted font-body flex items-center gap-1">
                          <img src="/icons/gold.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain', verticalAlign: 'middle', flexShrink: 0, display: 'inline-block' }} />
                          <span className="text-res-gold font-semibold tabular-nums">{isSelf ? '—' : formatNumber(target.gold)}</span>
                        </span>
                      </div>
                      {!isSelf && (
                        <Button variant="danger" size="sm" disabled={isFrozen} onClick={() => setDialogTarget(target)}>
                          {t('common.attack')}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Desktop: table ────────────────────────────────── */}
            <div className="hidden sm:block">
              <GameTable
                headers={[t('attack.table_rank'), t('attack.table_army'), t('attack.table_tribe'), t('attack.table_soldiers'), t('attack.table_gold'), t('attack.table_status'), t('attack.table_action')]}
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
                      {target.is_vacation && <Badge variant="blue" className="ml-2">{t('attack.vacation_badge')}</Badge>}
                      {isSelf && <Badge variant="green" className="ml-2">{t('attack.you_badge')}</Badge>}
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
                        {t('common.attack')}
                      </Button>
                    ),
                  ]
                })}
              />
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalAttackPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-body, sans-serif)' }}>
            עמוד {attackPage} מתוך {totalAttackPages} &middot; {filtered.length} מטרות
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
      <Modal isOpen={!!battleReport} onClose={() => setBattleReport(null)} title={t('attack.battle_report')} size="lg">
        {battleReport && <BattleReportModal report={battleReport} onClose={() => setBattleReport(null)} />}
      </Modal>

      {/* Spy result modal */}
      <Modal isOpen={!!spyResult} onClose={() => setSpyResult(null)} title={t('attack.spy_report')} size="sm">
        {spyResult && <SpyResultModal result={spyResult} onClose={() => setSpyResult(null)} />}
      </Modal>
    </div>
  )
}
