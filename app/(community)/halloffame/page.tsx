import { createAdminClient } from '@/lib/supabase/server'
import { formatNumber } from '@/lib/utils'
import { Trophy, Crown, Users, Scroll } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HofEntry {
  id: string
  season_id: string
  type: 'player' | 'tribe'
  rank: number
  name: string
  power_total: number
}

interface Season {
  id: string
  number: number
  status: string
  ended_at: string | null
}

// ─── Compact rank medal — #1 gold, #2 silver, #3 bronze ──────────────────────

function Medal({ rank }: { rank: number }) {
  const color =
    rank === 1
      ? 'rgba(240,192,48,1)'
      : rank === 2
      ? 'rgba(180,196,210,0.95)'
      : 'rgba(190,120,55,1)'

  const bg =
    rank === 1
      ? 'rgba(240,192,48,0.1)'
      : rank === 2
      ? 'rgba(148,163,184,0.08)'
      : 'rgba(180,100,30,0.08)'

  const border =
    rank === 1
      ? 'rgba(240,192,48,0.42)'
      : rank === 2
      ? 'rgba(148,163,184,0.32)'
      : 'rgba(180,100,30,0.38)'

  return (
    <div
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: bg,
        border: `1px solid ${border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span
        className="font-heading"
        style={{ fontSize: '0.55rem', fontWeight: 700, color, lineHeight: 1 }}
      >
        {rank}
      </span>
    </div>
  )
}

// ─── Single entry row inside a season card ───────────────────────────────────

function EntryRow({ entry }: { entry: HofEntry }) {
  const isFirst = entry.rank === 1
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.375rem 0',
        borderBottom: '1px solid rgba(20,14,6,0.5)',
      }}
    >
      <Medal rank={entry.rank} />
      <span
        className="font-heading flex-1 truncate"
        style={{
          fontSize: '0.73rem',
          fontWeight: isFirst ? 600 : 400,
          color: isFirst ? 'rgba(240,192,48,0.95)' : 'rgba(200,188,160,0.85)',
        }}
      >
        {entry.name}
      </span>
      <span
        className="font-heading tabular-nums shrink-0"
        style={{
          fontSize: '0.68rem',
          color: isFirst ? 'rgba(220,176,50,0.88)' : 'rgba(130,106,60,0.72)',
        }}
      >
        {formatNumber(entry.power_total, true)}
      </span>
    </div>
  )
}

// ─── Single season card ───────────────────────────────────────────────────────

function SeasonCard({
  season,
  players,
  tribes,
}: {
  season: Season
  players: HofEntry[]
  tribes: HofEntry[]
}) {
  const endedDate = season.ended_at
    ? new Date(season.ended_at).toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'short',
      })
    : null

  return (
    <div
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid rgba(201,144,26,0.18)',
        borderTop: '1px solid rgba(201,144,26,0.3)',
        background:
          'linear-gradient(180deg, rgba(18,13,5,0.98) 0%, rgba(10,7,3,1) 100%)',
        boxShadow:
          '0 4px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(240,192,48,0.05)',
      }}
    >
      {/* Season header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
          padding: '0.6rem 1rem',
          background:
            'linear-gradient(90deg, rgba(201,144,26,0.08) 0%, rgba(201,144,26,0.02) 60%, transparent 100%)',
          borderBottom: '1px solid rgba(201,144,26,0.15)',
        }}
      >
        <Trophy className="size-3.5 shrink-0" style={{ color: 'rgba(201,144,26,0.75)' }} />
        <h2
          className="font-display uppercase tracking-widest"
          style={{ fontSize: '0.72rem', color: 'rgba(201,144,26,0.9)' }}
        >
          עונה {season.number}
        </h2>
        {endedDate && (
          <span
            className="font-body ms-auto shrink-0"
            style={{ fontSize: '0.62rem', color: 'rgba(80,62,28,0.7)' }}
          >
            הסתיימה {endedDate}
          </span>
        )}
      </div>

      {/* Two-column body: players | tribes */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
        }}
      >
        {/* Players */}
        <div
          style={{
            padding: '0.625rem 1rem 0.75rem',
            borderInlineEnd: '1px solid rgba(201,144,26,0.1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              marginBottom: '0.5rem',
            }}
          >
            <Crown className="size-3" style={{ color: 'rgba(140,100,30,0.65)' }} />
            <span
              className="font-heading"
              style={{
                fontSize: '0.58rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(100,76,28,0.72)',
              }}
            >
              לוחמים
            </span>
          </div>
          {players.length > 0 ? (
            <div>
              {players.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </div>
          ) : (
            <p className="font-body text-game-xs text-game-text-muted" style={{ paddingTop: 4 }}>
              אין נתונים
            </p>
          )}
        </div>

        {/* Tribes */}
        <div style={{ padding: '0.625rem 1rem 0.75rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              marginBottom: '0.5rem',
            }}
          >
            <Users className="size-3" style={{ color: 'rgba(140,100,30,0.65)' }} />
            <span
              className="font-heading"
              style={{
                fontSize: '0.58rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(100,76,28,0.72)',
              }}
            >
              שבטים
            </span>
          </div>
          {tribes.length > 0 ? (
            <div>
              {tribes.map((e) => (
                <EntryRow key={e.id} entry={e} />
              ))}
            </div>
          ) : (
            <p className="font-body text-game-xs text-game-text-muted" style={{ paddingTop: 4 }}>
              אין נתונים
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyHoF() {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: '4rem 2rem',
        textAlign: 'center',
        border: '1px solid rgba(201,144,26,0.15)',
        background: 'rgba(10,7,3,0.6)',
      }}
    >
      <Scroll
        className="mx-auto mb-4"
        style={{ width: 40, height: 40, color: 'rgba(100,76,28,0.4)' }}
      />
      <p
        className="font-display uppercase tracking-widest"
        style={{ fontSize: '0.9rem', color: 'rgba(140,100,30,0.7)', marginBottom: '0.5rem' }}
      >
        עדיין אין עונות שהסתיימו
      </p>
      <p className="font-body text-game-xs text-game-text-muted">
        הדמויות האגדיות הראשונות יירשמו בסוף העונה הנוכחית
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HallOfFamePage() {
  const supabase = createAdminClient()

  const [{ data: seasons }, { data: entries }] = await Promise.all([
    supabase
      .from('seasons')
      .select('id,number,status,ended_at')
      .eq('status', 'ended')
      .order('number', { ascending: false }),
    supabase
      .from('hall_of_fame')
      .select('id,season_id,type,rank,name,power_total')
      .order('rank', { ascending: true }),
  ])

  const completedSeasons = (seasons ?? []) as Season[]
  const allEntries = (entries ?? []) as HofEntry[]

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Scroll className="size-4" style={{ color: 'rgba(201,144,26,0.7)' }} />
          <span
            className="font-heading"
            style={{
              fontSize: '0.6rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'rgba(100,76,28,0.75)',
            }}
          >
            רשומות עונות קודמות
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
              היכל התהילה
            </h1>
            <p className="text-game-sm text-game-text-secondary font-body mt-1">
              גיבורי הדומיינות שהוטבעו לנצח
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="chip card-gold text-game-xs">🏆 תהילה נצחית</span>
            <span className="chip card-game text-game-xs">
              {completedSeasons.length} עונות הושלמו
            </span>
          </div>
        </div>
      </div>

      {/* ── Season cards ── */}
      {completedSeasons.length === 0 ? (
        <EmptyHoF />
      ) : (
        <div className="space-y-4">
          {completedSeasons.map((season) => {
            const seasonEntries = allEntries.filter((e) => e.season_id === season.id)
            const playerEntries = seasonEntries.filter((e) => e.type === 'player').slice(0, 3)
            const tribeEntries  = seasonEntries.filter((e) => e.type === 'tribe').slice(0, 3)
            return (
              <SeasonCard
                key={season.id}
                season={season}
                players={playerEntries}
                tribes={tribeEntries}
              />
            )
          })}
        </div>
      )}

      {/* ── Footer info ── */}
      <div className="card-gold p-4">
        <p className="font-heading text-game-xs uppercase tracking-wider text-game-gold mb-2">
          ℹ️ על היכל התהילה
        </p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-game-xs text-game-text-secondary font-body list-inside list-disc">
          <li>מציג את מובילי כל עונה שהסתיימה</li>
          <li>כל עונה נמשכת 90 יום</li>
          <li>הדירוג מחושב לפי כוח כולל בסוף העונה</li>
          <li>גם שבטים מקבלים הכרה בהיכל התהילה</li>
        </ul>
      </div>

    </div>
  )
}
