import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { formatNumber } from '@/lib/utils'
import { Crown, Users, Sword, Trophy } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RankedPlayer {
  id: string
  username: string
  army_name: string
  race: string
  city: number
  power_total: number
}

interface RankedTribe {
  id: string
  name: string
  level: number
  power_total: number
  max_members: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RACE_LABEL: Record<string, string> = {
  orc: 'אורק',
  human: 'אדם',
  elf: 'אלף',
  dwarf: 'גמד',
}

// Rank badge — #1 crown, #2/#3 styled rings, 4+ minimal numeral
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 40% 35%, rgba(240,192,48,0.18), rgba(100,70,10,0.12))',
          border: '1.5px solid rgba(240,192,48,0.55)',
          boxShadow: '0 0 10px rgba(240,192,48,0.3), 0 0 20px rgba(201,144,26,0.14)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Crown className="size-4 text-game-gold-bright drop-shadow-[0_0_4px_rgba(240,192,48,0.7)]" />
      </div>
    )
  if (rank === 2)
    return (
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'rgba(148,163,184,0.08)',
          border: '1.5px solid rgba(148,163,184,0.38)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span className="font-heading text-xs font-bold text-slate-300">2</span>
      </div>
    )
  if (rank === 3)
    return (
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'rgba(180,100,30,0.1)',
          border: '1.5px solid rgba(180,100,30,0.42)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span className="font-heading text-xs font-bold" style={{ color: 'rgba(205,133,63,1)' }}>
          3
        </span>
      </div>
    )
  return (
    <span className="font-heading text-[11px] text-game-text-muted tabular-nums w-8 text-center shrink-0">
      {rank}
    </span>
  )
}

// Shared panel chrome used by both Players and Tribes panels
function PanelShell({
  icon,
  title,
  countLabel,
  children,
}: {
  icon: React.ReactNode
  title: string
  countLabel: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-game-xl overflow-hidden"
      style={{
        border: '1px solid rgba(201,144,26,0.2)',
        borderTop: '1px solid rgba(201,144,26,0.35)',
        background: 'linear-gradient(180deg, rgba(22,16,7,0.97) 0%, rgba(10,7,3,1) 100%)',
        boxShadow:
          '0 8px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(201,144,26,0.05), inset 0 1px 0 rgba(240,192,48,0.07)',
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.25rem',
          background:
            'linear-gradient(90deg, rgba(201,144,26,0.1) 0%, rgba(201,144,26,0.04) 60%, transparent 100%)',
          borderBottom: '1px solid rgba(201,144,26,0.2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          {icon}
          <h2
            className="font-display uppercase tracking-widest"
            style={{ fontSize: '0.85rem', color: 'rgba(240,192,48,0.92)' }}
          >
            {title}
          </h2>
          <span
            className="font-heading"
            style={{
              fontSize: '0.6rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(100,76,28,0.7)',
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(201,144,26,0.08)',
              border: '1px solid rgba(201,144,26,0.15)',
            }}
          >
            {countLabel}
          </span>
        </div>
        <span
          className="font-heading"
          style={{
            fontSize: '0.6rem',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'rgba(80,60,22,0.65)',
          }}
        >
          כוח כולל
        </span>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr auto',
          padding: '0.3rem 1rem',
          background: 'rgba(6,4,2,0.6)',
          borderBottom: '1px solid rgba(20,15,6,0.8)',
        }}
      >
        <span className="font-heading text-[9px] uppercase tracking-widest text-game-text-muted">
          #
        </span>
        <span className="font-heading text-[9px] uppercase tracking-widest text-game-text-muted">
          שם
        </span>
        <span className="font-heading text-[9px] uppercase tracking-widest text-game-text-muted text-end">
          כוח
        </span>
      </div>

      {children}
    </div>
  )
}

// ─── Player row ───────────────────────────────────────────────────────────────

function PlayerRow({
  player,
  rank,
  isMe,
}: {
  player: RankedPlayer
  rank: number
  isMe: boolean
}) {
  const accentColor =
    rank === 1
      ? 'rgba(240,192,48,0.7)'
      : rank === 2
      ? 'rgba(148,163,184,0.38)'
      : rank === 3
      ? 'rgba(180,100,30,0.48)'
      : isMe
      ? 'rgba(201,144,26,0.5)'
      : 'transparent'

  const rowBg =
    rank === 1
      ? 'rgba(240,192,48,0.05)'
      : rank === 2
      ? 'rgba(148,163,184,0.03)'
      : rank === 3
      ? 'rgba(180,100,30,0.04)'
      : isMe
      ? 'rgba(201,144,26,0.05)'
      : 'transparent'

  const nameColor =
    rank === 1
      ? 'rgba(255,215,80,1)'
      : rank === 2
      ? 'rgba(200,215,230,1)'
      : rank === 3
      ? 'rgba(205,133,63,1)'
      : isMe
      ? 'rgba(240,192,48,0.95)'
      : 'rgba(220,210,200,0.92)'

  const powerColor =
    rank === 1
      ? 'rgba(255,215,80,1)'
      : rank === 2
      ? 'rgba(200,215,230,0.95)'
      : rank === 3
      ? 'rgba(205,133,63,1)'
      : 'rgba(190,175,145,0.9)'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr auto',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.625rem 1rem',
        borderBottom: '1px solid rgba(20,15,6,0.6)',
        borderInlineEnd: `2.5px solid ${accentColor}`,
        background: rowBg,
        transition: 'background 0.15s',
      }}
    >
      {/* Rank */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <RankBadge rank={rank} />
      </div>

      {/* Name + subline */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <p
            className="font-heading truncate"
            style={{
              fontSize: rank <= 3 ? '0.82rem' : '0.78rem',
              fontWeight: rank <= 3 ? 700 : 500,
              color: nameColor,
              lineHeight: 1.3,
            }}
          >
            {player.army_name}
          </p>
          {isMe && (
            <span
              className="font-heading shrink-0"
              style={{
                fontSize: '0.55rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(240,192,48,0.65)',
                padding: '1px 5px',
                borderRadius: 3,
                background: 'rgba(201,144,26,0.12)',
                border: '1px solid rgba(201,144,26,0.28)',
              }}
            >
              את/ה
            </span>
          )}
        </div>
        <p className="font-body text-game-xs text-game-text-muted truncate" style={{ marginTop: 1 }}>
          {player.username} · {RACE_LABEL[player.race] ?? player.race}
        </p>
      </div>

      {/* Power */}
      <div style={{ textAlign: 'end', flexShrink: 0 }}>
        <p
          className="font-heading tabular-nums"
          style={{
            fontSize: rank <= 3 ? '0.85rem' : '0.8rem',
            fontWeight: 700,
            color: powerColor,
          }}
        >
          {formatNumber(player.power_total, true)}
        </p>
      </div>
    </div>
  )
}

// ─── Tribe row ────────────────────────────────────────────────────────────────

function TribeRow({ tribe, rank }: { tribe: RankedTribe; rank: number }) {
  const accentColor =
    rank === 1
      ? 'rgba(240,192,48,0.7)'
      : rank === 2
      ? 'rgba(148,163,184,0.38)'
      : rank === 3
      ? 'rgba(180,100,30,0.48)'
      : 'transparent'

  const rowBg =
    rank === 1
      ? 'rgba(240,192,48,0.05)'
      : rank === 2
      ? 'rgba(148,163,184,0.03)'
      : rank === 3
      ? 'rgba(180,100,30,0.04)'
      : 'transparent'

  const nameColor =
    rank === 1
      ? 'rgba(255,215,80,1)'
      : rank === 2
      ? 'rgba(200,215,230,1)'
      : rank === 3
      ? 'rgba(205,133,63,1)'
      : 'rgba(220,210,200,0.92)'

  const powerColor =
    rank === 1
      ? 'rgba(255,215,80,1)'
      : rank === 2
      ? 'rgba(200,215,230,0.95)'
      : rank === 3
      ? 'rgba(205,133,63,1)'
      : 'rgba(190,175,145,0.9)'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr auto',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.625rem 1rem',
        borderBottom: '1px solid rgba(20,15,6,0.6)',
        borderInlineEnd: `2.5px solid ${accentColor}`,
        background: rowBg,
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <RankBadge rank={rank} />
      </div>

      <div style={{ minWidth: 0 }}>
        <p
          className="font-heading truncate"
          style={{
            fontSize: rank <= 3 ? '0.82rem' : '0.78rem',
            fontWeight: rank <= 3 ? 700 : 500,
            color: nameColor,
            lineHeight: 1.3,
          }}
        >
          {tribe.name}
        </p>
        <p className="font-body text-game-xs text-game-text-muted" style={{ marginTop: 1 }}>
          רמה {tribe.level} · עד {tribe.max_members} חברים
        </p>
      </div>

      <div style={{ textAlign: 'end', flexShrink: 0 }}>
        <p
          className="font-heading tabular-nums"
          style={{
            fontSize: rank <= 3 ? '0.85rem' : '0.8rem',
            fontWeight: 700,
            color: powerColor,
          }}
        >
          {formatNumber(tribe.power_total, true)}
        </p>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="opacity-25">{icon}</div>
      <p className="text-game-sm text-game-text-muted font-body">{message}</p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RankingsPage() {
  const session = await getServerSession(authOptions)
  const myId = session?.user?.id ?? null

  const supabase = createAdminClient()

  const [{ data: players }, { data: tribes }, { data: activeSeason }] = await Promise.all([
    supabase
      .from('players')
      .select('id,username,army_name,race,city,power_total')
      .order('power_total', { ascending: false })
      .limit(20),
    supabase
      .from('tribes')
      .select('id,name,level,power_total,max_members')
      .order('power_total', { ascending: false })
      .limit(10),
    supabase
      .from('seasons')
      .select('id,number,status,ends_at')
      .eq('status', 'active')
      .maybeSingle(),
  ])

  const myRankIdx = myId ? (players ?? []).findIndex((p) => p.id === myId) : -1
  const myRankNum = myRankIdx >= 0 ? myRankIdx + 1 : null

  return (
    <div className="space-y-6">

      {/* ── Page header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sword
            className="size-4"
            style={{ color: 'rgba(201,144,26,0.7)' }}
          />
          <span
            className="font-heading"
            style={{
              fontSize: '0.6rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'rgba(100,76,28,0.75)',
            }}
          >
            עונה {activeSeason?.number ?? '—'} · דירוג חי
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
              לוח המלחמה
            </h1>
            <p className="text-game-sm text-game-text-secondary font-body mt-1">
              20 הלוחמים החזקים ביותר · 10 השבטים המובילים
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {activeSeason && (
              <span className="chip card-gold text-game-xs">⚔ עונה {activeSeason.number}</span>
            )}
            {myRankNum !== null && (
              <span
                className="chip font-heading"
                style={{
                  fontSize: '0.72rem',
                  background: 'rgba(201,144,26,0.12)',
                  border: '1px solid rgba(201,144,26,0.38)',
                  color: 'rgba(240,192,48,0.95)',
                }}
              >
                הדירוג שלי: #{myRankNum}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Panels ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-6">

        {/* Players */}
        <PanelShell
          icon={<Crown className="size-4" style={{ color: 'rgba(201,144,26,0.85)' }} />}
          title="לוחמים"
          countLabel="20 מובילים"
        >
          {(players ?? []).length > 0 ? (
            <div>
              {(players ?? []).map((p, i) => (
                <PlayerRow key={p.id} player={p} rank={i + 1} isMe={p.id === myId} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Trophy className="size-10 text-game-text-muted" />}
              message="עדיין אין שחקנים בדירוג"
            />
          )}
        </PanelShell>

        {/* Tribes */}
        <PanelShell
          icon={<Users className="size-4" style={{ color: 'rgba(201,144,26,0.85)' }} />}
          title="שבטים"
          countLabel="10 מובילים"
        >
          {(tribes ?? []).length > 0 ? (
            <div>
              {(tribes ?? []).map((t, i) => (
                <TribeRow key={t.id} tribe={t} rank={i + 1} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Users className="size-10 text-game-text-muted" />}
              message="עדיין אין שבטים בדירוג"
            />
          )}
        </PanelShell>

      </div>

      {/* ── Footer info ── */}
      <div className="card-gold p-4">
        <p className="font-heading text-game-xs uppercase tracking-wider text-game-gold mb-2">
          💡 על הדירוג
        </p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-game-xs text-game-text-secondary font-body list-inside list-disc">
          <li>הכוח הכולל מחושב מתקיפה, הגנה, ריגול וסיור</li>
          <li>הדירוג מתעדכן בכל טיק (30 דקות)</li>
          <li>שדרוג נשק ואימון מגדיל את הכוח</li>
          <li>הצטרפות לשבט חזק משפיעה על הדירוג</li>
        </ul>
      </div>

    </div>
  )
}
