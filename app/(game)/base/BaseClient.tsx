'use client'

import Link from 'next/link'
import {
  Sword, Shield, Eye, Compass, Zap, Crown, Star, TrendingUp, Users, ArrowRight,
} from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import { BALANCE } from '@/lib/game/balance'

const RACE_LABELS: Record<string, string> = {
  orc: 'אורק',
  human: 'אנושי',
  elf: 'אלף',
  dwarf: 'גמד',
}
const CITY_NAMES: Record<number, string> = {
  1: 'כפר',
  2: 'עיירה',
  3: 'עיר',
  4: 'מטרופולין',
  5: 'אימפריה',
}

function StatPanel({
  title, titleHe, icon: Icon, color, colorClass, bgClass, borderClass,
  power, units, unitLabel, level, link, linkLabel,
}: {
  title: string; titleHe: string
  icon: React.ComponentType<{ className?: string }>
  color: string; colorClass: string; bgClass: string; borderClass: string
  power: number; units: number; unitLabel: string; level: number
  link: string; linkLabel: string
}) {
  return (
    <div className={cn('panel-ornate rounded-game-lg p-4 relative overflow-hidden shadow-emboss', bgClass, borderClass)}>
      <div className={cn('absolute top-0 start-0 w-16 h-16 opacity-10 rounded-full blur-2xl', color)} />
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={cn('p-1 rounded-game-lg', bgClass)}>
            <Icon className={cn('size-4', colorClass)} />
          </div>
          <div>
            <p className="font-heading text-game-2xs uppercase tracking-widest text-game-text-secondary">{title}</p>
            <p className="font-heading text-game-xs font-bold text-game-text-white">{titleHe}</p>
          </div>
        </div>
        <Link href={link} className={cn('text-game-xs font-body flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity', colorClass)}>
          {linkLabel} <ArrowRight className="size-3 rtl-flip" />
        </Link>
      </div>
      <div className="mb-2">
        <p className="text-game-2xs text-game-text-muted font-heading mb-0.5">כוח</p>
        <p className={cn('text-game-2xl font-display font-bold', colorClass)}>{formatNumber(power, true)}</p>
      </div>
      <div className="divider-ornate" />
      <div className="grid grid-cols-2 gap-1.5 pt-2">
        <div>
          <p className="text-game-2xs text-game-text-muted font-heading">{unitLabel}</p>
          <p className="text-game-sm text-game-text-white font-semibold tabular-nums">{formatNumber(units)}</p>
        </div>
        <div>
          <p className="text-game-2xs text-game-text-muted font-heading">אימון</p>
          <p className="text-game-sm text-game-text-white font-semibold">רמה {level}</p>
        </div>
      </div>
    </div>
  )
}

export function BaseClient() {
  const { player, army, training, resources, hero } = usePlayer()

  if (!player) return null

  const isVip = player.vip_until && new Date(player.vip_until) > new Date()
  const combatUnits = (army?.soldiers ?? 0) + (army?.cavalry ?? 0) + (army?.spies ?? 0) + (army?.scouts ?? 0)

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div>
          <h1 className="font-display text-game-2xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
            {player.army_name}
          </h1>
          <p className="text-game-xs text-game-text-secondary font-body mt-0.5">
            {player.username} · {RACE_LABELS[player.race] ?? player.race} ·{' '}
            {CITY_NAMES[player.city] ?? `עיר ${player.city}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {isVip && (
            <span className="chip bg-game-gold/20 border border-game-gold/40 text-game-gold-bright">
              <Crown className="size-3" /> VIP
            </span>
          )}
          {player.is_vacation && (
            <span className="chip bg-game-blue/20 border border-game-blue-bright/40 text-game-blue-bright">חופשה</span>
          )}
          <span className="chip bg-game-elevated border border-game-border text-game-text-secondary">
            {CITY_NAMES[player.city] ?? `עיר ${player.city}`}
          </span>
        </div>
      </div>

      {/* ── Top counters row ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'דירוג עיר',  value: player.rank_city   ? `#${player.rank_city}`   : '—', icon: '🏆', color: 'text-game-gold-bright' },
          { label: 'דירוג כללי', value: player.rank_global ? `#${player.rank_global}` : '—', icon: '🌍', color: 'text-game-gold-bright' },
          { label: 'מוניטין',    value: formatNumber(player.reputation),                      icon: '⭐', color: 'text-game-text-white' },
          { label: 'כוח כולל',   value: formatNumber(player.power_total, true),               icon: '⚡', color: 'text-game-gold-bright' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="card-game p-2.5 text-center shadow-emboss hover:border-game-border-gold/50 transition-colors duration-150">
            <span className="text-xl">{icon}</span>
            <p className="text-game-2xs text-game-text-muted font-heading uppercase tracking-wider mt-1">{label}</p>
            <p className={cn('text-game-lg font-heading font-bold mt-0.5', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Second row: Mana + Population + Total Power ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {hero && (
          <div className="card-game p-3 border-game-purple/30 bg-game-purple/5 shadow-emboss">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xl">🔮</span>
              <p className="text-game-2xs text-game-text-muted font-heading uppercase tracking-wide">מאנה</p>
            </div>
            <p className="text-game-xl text-game-purple-bright font-heading font-bold tabular-nums">
              {formatNumber(hero.mana)}
            </p>
            <p className="text-game-2xs text-game-text-muted font-body mt-1">+{hero.mana_per_tick}/טיק</p>
          </div>
        )}

        <div className="card-game p-3 shadow-emboss">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Users className="size-4 text-game-text-secondary" />
            <p className="text-game-2xs text-game-text-muted font-heading uppercase tracking-wide">יחידות קרב</p>
          </div>
          <p className="text-game-xl text-game-text-white font-heading font-bold tabular-nums">
            {formatNumber(combatUnits)}
          </p>
          <p className="text-game-2xs text-game-text-muted font-body mt-1">חיילים + פרשים + מרגלים + סיירים</p>
        </div>

        <div className="card-gold p-3 shadow-emboss">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap className="size-4 text-game-gold-bright" />
            <p className="text-game-2xs text-game-text-muted font-heading uppercase tracking-wide">כוח כולל</p>
          </div>
          <p className="text-game-xl gold-gradient-text-static font-heading font-bold tabular-nums">
            {formatNumber(player.power_total, true)}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <TrendingUp className="size-3 text-game-text-muted" />
            <p className="text-game-2xs text-game-text-muted font-body">
              מקום #{player.rank_global ?? '—'} בעולם
            </p>
          </div>
        </div>
      </div>

      {/* ── Resources row ─────────────────────────────────── */}
      <div className="flex justify-center">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-xl w-full">
          {[
            { label: 'זהב',  value: resources?.gold ?? 0, emoji: '🪙', color: 'text-res-gold',  bg: 'border-res-gold/20'  },
            { label: 'ברזל', value: resources?.iron ?? 0, emoji: '⚙️', color: 'text-res-iron',  bg: 'border-res-iron/20'  },
            { label: 'עץ',   value: resources?.wood ?? 0, emoji: '🪵', color: 'text-res-wood',  bg: 'border-res-wood/20'  },
            { label: 'מזון', value: resources?.food ?? 0, emoji: '🌾', color: 'text-res-food',  bg: 'border-res-food/20'  },
          ].map(({ label, value, emoji, color, bg }) => (
            <div key={label} className={cn('card-game px-2 py-1.5 border shadow-emboss hover:brightness-110 transition-all text-center', bg)}>
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <span className="text-base">{emoji}</span>
                <p className="text-game-2xs text-game-text-muted font-heading uppercase tracking-wide">{label}</p>
              </div>
              <p className={cn('text-game-base font-heading font-bold tabular-nums', color)}>
                {formatNumber(value, true)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Military 2×2 grid ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatPanel
          title="תקיפה" titleHe="תקיפה" icon={Sword}
          color="bg-game-red" colorClass="text-game-red-bright"
          bgClass="bg-game-red/5" borderClass="border-game-red/30"
          power={player.power_attack} units={(army?.soldiers ?? 0) + (army?.cavalry ?? 0)}
          unitLabel="חיילים + פרשים" level={training?.attack_level ?? 0}
          link="/attack" linkLabel="לתקיפה"
        />
        <StatPanel
          title="הגנה" titleHe="הגנה" icon={Shield}
          color="bg-game-blue-bright" colorClass="text-game-blue-bright"
          bgClass="bg-game-blue/5" borderClass="border-game-blue/30"
          power={player.power_defense} units={army?.soldiers ?? 0}
          unitLabel="חיילים" level={training?.defense_level ?? 0}
          link="/training" linkLabel="לאימון"
        />
        <StatPanel
          title="ריגול" titleHe="ריגול" icon={Eye}
          color="bg-game-purple" colorClass="text-game-purple-bright"
          bgClass="bg-game-purple/5" borderClass="border-game-purple/30"
          power={player.power_spy} units={army?.spies ?? 0}
          unitLabel="מרגלים" level={training?.spy_level ?? 0}
          link="/training" linkLabel="לאימון"
        />
        <StatPanel
          title="סיור" titleHe="סיור" icon={Compass}
          color="bg-game-orange" colorClass="text-game-orange-bright"
          bgClass="bg-game-orange/5" borderClass="border-game-orange/30"
          power={player.power_scout} units={army?.scouts ?? 0}
          unitLabel="סיירים" level={training?.scout_level ?? 0}
          link="/training" linkLabel="לאימון"
        />
      </div>

      {/* ── Army detail row ─────────────────────────────── */}
      <div className="panel-ornate rounded-game-lg p-4 shadow-engrave">
        <div className="panel-header flex items-center gap-1.5 mb-3">
          <Crown className="size-4 text-game-gold" />
          <h2 className="font-heading text-game-xs uppercase tracking-wider text-game-gold">סיכום צבאי</h2>
        </div>
        <div className="divider-gold mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
          {[
            { label: 'חיילים', value: army?.soldiers       ?? 0 },
            { label: 'פרשים',  value: army?.cavalry        ?? 0 },
            { label: 'מרגלים', value: army?.spies          ?? 0 },
            { label: 'סיירים', value: army?.scouts         ?? 0 },
            { label: 'עבדים',  value: army?.slaves         ?? 0 },
            { label: 'פנויים', value: army?.free_population ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col">
              <span className="text-game-2xs text-game-text-muted font-heading">{label}</span>
              <span className="text-game-sm text-game-text-white font-semibold tabular-nums">{formatNumber(value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
