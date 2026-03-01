import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { formatNumber } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Trophy, Crown, Users } from 'lucide-react'

const RACE_HE: Record<string, string> = { orc: 'אורק', human: 'אנושי', elf: 'אלף', dwarf: 'גמד' }

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">👑</span>
  if (rank === 2) return <span className="text-xl">🥈</span>
  if (rank === 3) return <span className="text-xl">🥉</span>
  return (
    <span className="size-7 flex items-center justify-center rounded-full bg-gradient-to-b from-game-elevated to-game-surface border border-game-border font-heading text-game-xs font-bold text-game-text-secondary">
      {rank}
    </span>
  )
}

export default async function RankingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createAdminClient()

  const [{ data: players }, { data: tribes }] = await Promise.all([
    supabase
      .from('players')
      .select('id,username,army_name,race,city,rank_city,rank_global,power_total')
      .order('power_total', { ascending: false })
      .limit(20),
    supabase
      .from('tribes')
      .select('id,name,city,level,power_total,max_members')
      .order('power_total', { ascending: false })
      .limit(20),
  ])

  const myRank = players?.findIndex(p => p.id === session.user.id) ?? -1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-game-lg bg-game-gold/10 border border-game-gold/30">
            <Trophy className="size-5 text-game-gold-bright" />
          </div>
          <div>
            <h1 className="font-display text-game-2xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
              לוח הדירוג
            </h1>
            <p className="text-game-sm text-game-text-secondary font-body">השחקנים החזקים ביותר בעולם</p>
          </div>
        </div>
        {myRank >= 0 && (
          <div className="chip card-gold text-game-sm font-heading">
            הדירוג שלי: #{myRank + 1}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Player Rankings ── */}
        <div className="panel-ornate overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 panel-header">
            <Crown className="size-4 text-game-gold" />
            <h2 className="font-heading text-game-sm uppercase tracking-wider text-game-gold">שחקנים</h2>
          </div>
          <div className="divide-y divide-game-border">
            {(players ?? []).map((p, i) => {
              const isMe = p.id === session.user.id
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2.5 transition-colors',
                    isMe ? 'bg-game-gold/8 border-e-2 border-e-game-gold' : 'hover:bg-game-elevated/30'
                  )}
                >
                  <div className="w-8 flex justify-center shrink-0">
                    <RankBadge rank={i + 1} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('font-heading text-game-sm font-bold truncate', isMe && 'text-game-gold-bright')}>
                      {p.army_name}
                    </p>
                    <p className="text-game-xs text-game-text-muted font-body truncate">
                      {p.username} · {RACE_HE[p.race] ?? p.race}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="font-heading text-game-sm font-bold text-game-text-white tabular-nums">
                      {formatNumber(p.power_total, true)}
                    </p>
                    <p className="text-game-xs text-game-text-muted">כוח</p>
                  </div>
                  {isMe && (
                    <span className="chip bg-game-gold/20 border border-game-gold/40 text-game-gold-bright text-[10px]">
                      את/ה
                    </span>
                  )}
                </div>
              )
            })}
            {!players?.length && (
              <p className="px-4 py-8 text-center text-game-text-muted font-body text-game-sm">
                אין נתונים
              </p>
            )}
          </div>
        </div>

        {/* ── Tribe Rankings ── */}
        <div className="panel-ornate overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 panel-header">
            <Users className="size-4 text-game-gold" />
            <h2 className="font-heading text-game-sm uppercase tracking-wider text-game-gold">שבטים</h2>
          </div>
          <div className="divide-y divide-game-border">
            {(tribes ?? []).map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-game-elevated/30 transition-colors">
                <div className="w-8 flex justify-center shrink-0">
                  <RankBadge rank={i + 1} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-heading text-game-sm font-bold truncate text-game-text-white">
                    {t.name}
                  </p>
                  <p className="text-game-xs text-game-text-muted font-body">
                    רמה {t.level} · עד {t.max_members} חברים
                  </p>
                </div>
                <div className="text-end shrink-0">
                  <p className="font-heading text-game-sm font-bold text-game-text-white tabular-nums">
                    {formatNumber(t.power_total, true)}
                  </p>
                  <p className="text-game-xs text-game-text-muted">כוח</p>
                </div>
              </div>
            ))}
            {!tribes?.length && (
              <p className="px-4 py-8 text-center text-game-text-muted font-body text-game-sm">
                אין שבטים
              </p>
            )}
          </div>
        </div>

      </div>

      {/* Tips */}
      <div className="card-gold p-4">
        <p className="font-heading text-game-xs uppercase tracking-wider text-game-gold mb-2">💡 טיפים לדירוג</p>
        <ul className="space-y-1 text-game-xs text-game-text-secondary font-body list-inside list-disc">
          <li>הכוח הכולל מחושב מתקיפה + הגנה + ריגול + סיור</li>
          <li>שדרוג אימון מעלה את הכוח משמעותית</li>
          <li>הצטרפות לשבט חזק עוזרת לדירוג הכללי</li>
          <li>שדרוג נשק בחנות מגדיל את הכוח</li>
          <li>הדירוג מתעדכן בכל טיק (30 דקות)</li>
        </ul>
      </div>

    </div>
  )
}
