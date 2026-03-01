/**
 * /season-end
 *
 * Shown after a season concludes. Displays the top-3 players and top-3 tribes
 * from the most recently ended season.
 *
 * If no season has ended yet, shows an informational placeholder.
 * If a season just ended, this page is the first thing players see when they
 * navigate here (the admin reset route marks status='ended' before creating
 * the new active season).
 */

import { createAdminClient } from '@/lib/supabase/server'
import { formatNumber }       from '@/lib/utils'
import { Trophy, Sword, Shield } from 'lucide-react'

// ─── Medal helpers ────────────────────────────────────────────────────────────

function Medal({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-4xl drop-shadow-lg">👑</span>
  if (rank === 2) return <span className="text-3xl">🥈</span>
  return <span className="text-3xl">🥉</span>
}

function RankBadge({ rank }: { rank: number }) {
  const colors =
    rank === 1 ? 'bg-game-gold/20 border-game-gold text-game-gold-bright' :
    rank === 2 ? 'bg-white/10 border-white/30 text-white/80' :
                 'bg-amber-900/20 border-amber-700/40 text-amber-600'
  return (
    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-game-xs font-bold ${colors}`}>
      {rank}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function SeasonEndPage() {
  const supabase = createAdminClient()

  // Fetch the most recently ended season
  const { data: lastSeason } = await supabase
    .from('seasons')
    .select('id, number, starts_at, ends_at, ended_at')
    .eq('status', 'ended')
    .order('number', { ascending: false })
    .limit(1)
    .single()

  if (!lastSeason) {
    return (
      <div className="space-y-6">
        <SeasonEndHeader seasonNumber={null} endedAt={null} />
        <div className="panel-ornate p-12 text-center">
          <Trophy className="size-12 text-game-text-muted mx-auto mb-3" />
          <p className="font-heading text-game-base text-game-text-secondary">
            אין עונות שהסתיימו עדיין
          </p>
          <p className="text-game-sm text-game-text-muted font-body mt-1">
            תוצאות העונה יופיעו כאן לאחר סיום העונה הראשונה
          </p>
        </div>
      </div>
    )
  }

  // Fetch top-3 players + top-3 tribes for this season
  const { data: entries } = await supabase
    .from('hall_of_fame')
    .select('*')
    .eq('season_id', lastSeason.id)
    .order('rank', { ascending: true })

  const topPlayers = (entries ?? []).filter(e => e.type === 'player').slice(0, 3)
  const topTribes  = (entries ?? []).filter(e => e.type === 'tribe').slice(0, 3)

  return (
    <div className="space-y-6">
      <SeasonEndHeader seasonNumber={lastSeason.number} endedAt={lastSeason.ended_at} />

      {/* Champions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Top Players */}
        <section className="panel-ornate overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 panel-header">
            <Trophy className="size-4 text-game-gold" />
            <h2 className="font-display text-game-sm gold-gradient-text-static">
              🏆 שחקנים מובילים
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {topPlayers.length > 0 ? (
              topPlayers.map(entry => (
                <PlayerEntry key={entry.id} entry={entry} />
              ))
            ) : (
              <p className="text-game-xs text-game-text-muted font-body">אין נתונים</p>
            )}
          </div>
        </section>

        {/* Top Tribes */}
        <section className="panel-ornate overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 panel-header">
            <Sword className="size-4 text-game-gold" />
            <h2 className="font-display text-game-sm gold-gradient-text-static">
              ⚔️ שבטים מובילים
            </h2>
          </div>
          <div className="p-4 space-y-3">
            {topTribes.length > 0 ? (
              topTribes.map(entry => (
                <TribeEntry key={entry.id} entry={entry} />
              ))
            ) : (
              <p className="text-game-xs text-game-text-muted font-body">אין נתונים</p>
            )}
          </div>
        </section>
      </div>

      {/* Season stats */}
      {lastSeason.starts_at && lastSeason.ended_at && (
        <SeasonStats startsAt={lastSeason.starts_at} endedAt={lastSeason.ended_at} />
      )}

      {/* Footer note */}
      <div className="card-gold p-4 text-center">
        <p className="font-heading text-game-xs uppercase tracking-wider text-game-gold mb-1">
          עונה חדשה החלה!
        </p>
        <p className="text-game-xs text-game-text-secondary font-body">
          עיין ב
          <a href="/base" className="text-game-gold-bright hover:underline mx-1">בסיס שלך</a>
          כדי להתחיל מחדש. ניצחון בעונה הבאה מחכה לך!
        </p>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeasonEndHeader({
  seasonNumber,
  endedAt,
}: {
  seasonNumber: number | null
  endedAt:      string | null
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-game-lg bg-game-gold/10 border border-game-gold/30 animate-pulse-gold">
          <Trophy className="size-5 text-game-gold-bright" />
        </div>
        <div>
          <h1 className="font-display text-game-2xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
            {seasonNumber ? `עונה ${seasonNumber} — סיום` : 'סיום עונה'}
          </h1>
          <p className="text-game-sm text-game-text-secondary font-body">
            גיבורי העונה שהסתיימה
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        {endedAt && (
          <span className="chip card-game text-game-sm">
            הסתיימה {new Date(endedAt).toLocaleDateString('he-IL')}
          </span>
        )}
        <span className="chip card-gold text-game-sm">🏆 תהילה נצחית</span>
      </div>
    </div>
  )
}

function PlayerEntry({ entry }: { entry: Record<string, unknown> }) {
  const rank       = entry.rank as number
  const name       = entry.name as string
  const race       = entry.race as string | null
  const powerTotal = entry.power_total as number

  return (
    <div className="flex items-center gap-3 p-2 rounded-game-md hover:bg-white/5 transition-colors">
      <Medal rank={rank} />
      <div className="flex-1 min-w-0">
        <p className="font-heading text-game-sm text-game-text-white truncate">{name}</p>
        {race && (
          <p className="text-game-xs text-game-text-muted font-body capitalize">{race}</p>
        )}
      </div>
      <div className="text-end">
        <p className="text-game-xs text-game-text-secondary font-body tabular-nums">
          {formatNumber(powerTotal, true)}
        </p>
        <p className="text-game-xs text-game-text-muted font-body">כוח</p>
      </div>
    </div>
  )
}

function TribeEntry({ entry }: { entry: Record<string, unknown> }) {
  const rank       = entry.rank as number
  const name       = entry.name as string
  const powerTotal = entry.power_total as number

  return (
    <div className="flex items-center gap-3 p-2 rounded-game-md hover:bg-white/5 transition-colors">
      <RankBadge rank={rank} />
      <div className="flex-1 min-w-0">
        <p className="font-heading text-game-sm text-game-text-white truncate">{name}</p>
      </div>
      <div className="text-end">
        <p className="text-game-xs text-game-text-secondary font-body tabular-nums">
          {formatNumber(powerTotal, true)}
        </p>
        <p className="text-game-xs text-game-text-muted font-body">כוח</p>
      </div>
    </div>
  )
}

function SeasonStats({ startsAt, endedAt }: { startsAt: string; endedAt: string }) {
  const startDate = new Date(startsAt)
  const endDate   = new Date(endedAt)
  const daysRan   = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000)

  return (
    <div className="card-game p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="size-4 text-game-text-secondary" />
        <p className="font-heading text-game-xs uppercase tracking-wider text-game-text-secondary">
          סיכום העונה
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="font-display text-game-lg gold-gradient-text-static">{daysRan}</p>
          <p className="text-game-xs text-game-text-muted font-body">ימים</p>
        </div>
        <div>
          <p className="font-body text-game-xs text-game-text-secondary">
            {startDate.toLocaleDateString('he-IL')}
          </p>
          <p className="text-game-xs text-game-text-muted font-body">התחלה</p>
        </div>
        <div>
          <p className="font-body text-game-xs text-game-text-secondary">
            {endDate.toLocaleDateString('he-IL')}
          </p>
          <p className="text-game-xs text-game-text-muted font-body">סיום</p>
        </div>
      </div>
    </div>
  )
}
