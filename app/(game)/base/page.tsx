import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { formatNumber } from '@/lib/utils'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  Sword, Shield, Eye, Compass, Zap, Crown, Star,
  TrendingUp, Users, Coins, ArrowRight,
} from 'lucide-react'

const RACE_LABELS: Record<string, string> = {
  orc: 'אורק', human: 'אנושי', elf: 'אלף', dwarf: 'גמד',
}
const CITY_NAMES: Record<number, string> = {
  1: 'כפר', 2: 'עיירה', 3: 'עיר', 4: 'מטרופולין', 5: 'אימפריה',
}

function StatPanel({
  title, titleHe, icon: Icon, color, colorClass, bgClass, borderClass,
  power, units, unitLabel, level, link, linkLabel,
}: {
  title: string; titleHe: string; icon: React.ComponentType<{ className?: string }>
  color: string; colorClass: string; bgClass: string; borderClass: string
  power: number; units: number; unitLabel: string; level: number
  link: string; linkLabel: string
}) {
  return (
    <div className={cn('panel-ornate rounded-game-lg p-5 relative overflow-hidden shadow-emboss', bgClass, borderClass)}>
      <div className={cn('absolute top-0 start-0 w-16 h-16 opacity-10 rounded-full blur-2xl', color)} />

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn('p-1.5 rounded-game-lg', bgClass)}>
            <Icon className={cn('size-4', colorClass)} />
          </div>
          <div>
            <p className="font-heading text-game-xs uppercase tracking-widest text-game-text-secondary">{title}</p>
            <p className="font-heading text-game-sm font-bold text-game-text-white">{titleHe}</p>
          </div>
        </div>
        <Link
          href={link}
          className={cn(
            'text-game-xs font-body flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity',
            colorClass
          )}
        >
          {linkLabel} <ArrowRight className="size-3 rtl-flip" />
        </Link>
      </div>

      <div className="mb-3">
        <p className="text-game-xs text-game-text-muted font-heading mb-0.5">כוח</p>
        <p className={cn('text-game-3xl font-display font-bold', colorClass)}>
          {formatNumber(power, true)}
        </p>
      </div>

      <div className="divider-ornate" />
      <div className="grid grid-cols-2 gap-2 pt-3">
        <div>
          <p className="text-game-xs text-game-text-muted font-heading">{unitLabel}</p>
          <p className="text-game-base text-game-text-white font-semibold tabular-nums">
            {formatNumber(units)}
          </p>
        </div>
        <div>
          <p className="text-game-xs text-game-text-muted font-heading">אימון</p>
          <p className="text-game-base text-game-text-white font-semibold">
            רמה {level}
          </p>
        </div>
      </div>
    </div>
  )
}

export default async function BasePage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createAdminClient()
  const playerId = session.user.id

  const [
    { data: player },
    { data: army },
    { data: training },
    { data: development },
    { data: resources },
    { data: hero },
  ] = await Promise.all([
    supabase.from('players').select('id,username,race,army_name,city,turns,max_turns,capacity,reputation,rank_city,rank_global,power_attack,power_defense,power_spy,power_scout,power_total,vip_until,is_vacation').eq('id', playerId).single(),
    supabase.from('army').select('*').eq('player_id', playerId).single(),
    supabase.from('training').select('*').eq('player_id', playerId).single(),
    supabase.from('development').select('*').eq('player_id', playerId).single(),
    supabase.from('resources').select('gold,iron,wood,food').eq('player_id', playerId).single(),
    supabase.from('hero').select('mana,mana_per_tick,level').eq('player_id', playerId).single(),
  ])

  if (!player) return null

  const isVip = player.vip_until && new Date(player.vip_until) > new Date()
  const combatUnits = (army?.soldiers ?? 0) + (army?.cavalry ?? 0) + (army?.spies ?? 0) + (army?.scouts ?? 0)
  const capacityPct = Math.min(100, Math.round((combatUnits / (player.capacity || 1)) * 100))

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
            {player.army_name}
          </h1>
          <p className="text-game-sm text-game-text-secondary font-body mt-0.5">
            {player.username} · {RACE_LABELS[player.race] ?? player.race} · {CITY_NAMES[player.city] ?? `עיר ${player.city}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isVip && (
            <span className="chip bg-game-gold/20 border border-game-gold/40 text-game-gold-bright">
              <Crown className="size-3" /> VIP
            </span>
          )}
          {player.is_vacation && (
            <span className="chip bg-game-blue/20 border border-game-blue-bright/40 text-game-blue-bright">
              חופשה
            </span>
          )}
          <span className="chip bg-game-elevated border border-game-border text-game-text-secondary">
            {CITY_NAMES[player.city] ?? `עיר ${player.city}`}
          </span>
        </div>
      </div>

      {/* ── Top counters row ────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'דירוג עיר',    value: player.rank_city   ? `#${player.rank_city}`   : '—', icon: '🏆', color: 'text-game-gold-bright' },
          { label: 'דירוג כללי',   value: player.rank_global ? `#${player.rank_global}` : '—', icon: '🌍', color: 'text-game-gold-bright' },
          { label: 'מוניטין',      value: formatNumber(player.reputation),                      icon: '⭐', color: 'text-game-text-white' },
          { label: 'כוח כולל',     value: formatNumber(player.power_total, true),                icon: '⚡', color: 'text-game-gold-bright' },
        ].map(({ label, value, icon, color }) => (
          <div
            key={label}
            className="card-game p-3 text-center shadow-emboss hover:border-game-border-gold/50 transition-colors duration-150"
          >
            <span className="text-xl">{icon}</span>
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wider mt-1">{label}</p>
            <p className={cn('text-game-xl font-heading font-bold mt-0.5', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Resources row ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'זהב',  value: resources?.gold ?? 0,  emoji: '🪙', color: 'text-res-gold',  bg: 'border-res-gold/20' },
          { label: 'ברזל', value: resources?.iron ?? 0,  emoji: '⚙️', color: 'text-res-iron',  bg: 'border-res-iron/20' },
          { label: 'עץ',   value: resources?.wood ?? 0,  emoji: '🪵', color: 'text-res-wood',  bg: 'border-res-wood/20' },
          { label: 'מזון', value: resources?.food ?? 0,  emoji: '🌾', color: 'text-res-food',  bg: 'border-res-food/20' },
        ].map(({ label, value, emoji, color, bg }) => (
          <div
            key={label}
            className={cn('card-game p-3 border shadow-emboss hover:brightness-110 transition-all', bg)}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{emoji}</span>
              <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">{label}</p>
            </div>
            <p className={cn('text-game-xl font-heading font-bold tabular-nums', color)}>
              {formatNumber(value, true)}
            </p>
          </div>
        ))}
      </div>

      {/* ── Military 2×2 grid ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <StatPanel
          title="Attack" titleHe="תקיפה"
          icon={Sword}
          color="bg-game-red"
          colorClass="text-game-red-bright"
          bgClass="bg-game-red/5"
          borderClass="border-game-red/30"
          power={player.power_attack}
          units={(army?.soldiers ?? 0) + (army?.cavalry ?? 0)}
          unitLabel="חיילים"
          level={training?.attack_level ?? 0}
          link="/attack" linkLabel="לתקיפה"
        />
        <StatPanel
          title="Defense" titleHe="הגנה"
          icon={Shield}
          color="bg-game-blue-bright"
          colorClass="text-game-blue-bright"
          bgClass="bg-game-blue/5"
          borderClass="border-game-blue/30"
          power={player.power_defense}
          units={army?.soldiers ?? 0}
          unitLabel="חיילים"
          level={training?.defense_level ?? 0}
          link="/training" linkLabel="לאימון"
        />
        <StatPanel
          title="Spy" titleHe="ריגול"
          icon={Eye}
          color="bg-game-purple"
          colorClass="text-game-purple-bright"
          bgClass="bg-game-purple/5"
          borderClass="border-game-purple/30"
          power={player.power_spy}
          units={army?.spies ?? 0}
          unitLabel="מרגלים"
          level={training?.spy_level ?? 0}
          link="/training" linkLabel="לאימון"
        />
        <StatPanel
          title="Scout" titleHe="סיור"
          icon={Compass}
          color="bg-game-orange"
          colorClass="text-game-orange-bright"
          bgClass="bg-game-orange/5"
          borderClass="border-game-orange/30"
          power={player.power_scout}
          units={army?.scouts ?? 0}
          unitLabel="סיירים"
          level={training?.scout_level ?? 0}
          link="/training" linkLabel="לאימון"
        />
      </div>

      {/* ── Bottom row: Mana + Population + Total Power ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Mana */}
        {hero && (
          <div className="card-game p-4 border-game-purple/30 bg-game-purple/5 shadow-emboss">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🔮</span>
              <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">מאנה</p>
            </div>
            <p className="text-game-2xl text-game-purple-bright font-heading font-bold tabular-nums">
              {formatNumber(hero.mana)}
            </p>
            <p className="text-game-xs text-game-text-muted font-body mt-1">
              +{hero.mana_per_tick}/טיק
            </p>
          </div>
        )}

        {/* Capacity / Population */}
        <div className="card-game p-4 shadow-emboss">
          <div className="flex items-center gap-2 mb-2">
            <Users className="size-4 text-game-text-secondary" />
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">כוח אדם</p>
          </div>
          <p className="text-game-2xl text-game-text-white font-heading font-bold tabular-nums">
            {formatNumber(combatUnits)}
            <span className="text-game-sm text-game-text-muted font-body">/{formatNumber(player.capacity)}</span>
          </p>
          {/* Capacity bar */}
          <div className="progress-bar mt-2">
            <div
              className={cn(
                'progress-fill',
                capacityPct >= 90 ? 'progress-fill-red' :
                capacityPct >= 70 ? 'progress-fill-gold' : 'progress-fill-green'
              )}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
          <p className="text-game-xs text-game-text-muted font-body mt-1">{capacityPct}% בשימוש</p>
        </div>

        {/* Total Power */}
        <div className="card-gold p-4 shadow-emboss">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="size-4 text-game-gold-bright" />
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">כוח כולל</p>
          </div>
          <p className="text-game-2xl gold-gradient-text-static font-heading font-bold tabular-nums">
            {formatNumber(player.power_total, true)}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            <TrendingUp className="size-3 text-game-text-muted" />
            <p className="text-game-xs text-game-text-muted font-body">
              מקום #{player.rank_global ?? '—'} בעולם
            </p>
          </div>
        </div>
      </div>

      {/* ── Army detail row ─────────────────────────────── */}
      <div className="panel-ornate rounded-game-lg p-5 shadow-engrave">
        <div className="panel-header flex items-center gap-2 mb-4">
          <Crown className="size-4 text-game-gold" />
          <h2 className="font-heading text-game-sm uppercase tracking-wider text-game-gold">
            סיכום צבאי
          </h2>
        </div>
        <div className="divider-gold mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4">
          {[
            { label: 'חיילים',       value: army?.soldiers ?? 0 },
            { label: 'פרשים',        value: army?.cavalry ?? 0 },
            { label: 'מרגלים',       value: army?.spies ?? 0 },
            { label: 'סיירים',       value: army?.scouts ?? 0 },
            { label: 'עבדים',        value: army?.slaves ?? 0 },
            { label: "חקלאים",       value: army?.farmers ?? 0 },
            { label: 'פנויים',       value: army?.free_population ?? 0 },
            { label: 'קיבולת',       value: player.capacity },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col">
              <span className="text-game-xs text-game-text-muted font-heading">{label}</span>
              <span className="text-game-base text-game-text-white font-semibold tabular-nums">
                {formatNumber(value)}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
