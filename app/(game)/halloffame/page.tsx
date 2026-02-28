import { createAdminClient } from '@/lib/supabase/server'
import { formatNumber } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Trophy } from 'lucide-react'

function Crown({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-2xl">👑</span>
  if (rank === 2) return <span className="text-2xl">🥈</span>
  return <span className="text-2xl">🥉</span>
}

export default async function HallOfFamePage() {
  const supabase = createAdminClient()

  const [{ data: seasons }, { data: entries }] = await Promise.all([
    supabase.from('seasons').select('*').order('number', { ascending: false }),
    supabase.from('hall_of_fame').select('*').order('rank', { ascending: true }),
  ])

  const completedSeasons = (seasons ?? []).filter(s => !s.is_active)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-game-lg bg-game-gold/10 border border-game-gold/30 animate-pulse-gold">
            <Trophy className="size-5 text-game-gold-bright" />
          </div>
          <div>
            <h1 className="font-display text-game-2xl gold-gradient-text-static uppercase tracking-wide">
              היכל התהילה
            </h1>
            <p className="text-game-sm text-game-text-secondary font-body">גיבורי העונות הקודמות</p>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="chip card-gold text-game-sm">🏆 תהילה נצחית</span>
          <span className="chip card-game text-game-sm">{completedSeasons.length} עונות הושלמו</span>
        </div>
      </div>

      {completedSeasons.length === 0 ? (
        <div className="card-game p-12 text-center">
          <Trophy className="size-12 text-game-text-muted mx-auto mb-3" />
          <p className="font-heading text-game-base text-game-text-secondary">עדיין אין עונות שהסתיימו</p>
          <p className="text-game-sm text-game-text-muted font-body mt-1">
            היהלום הראשון יינתן בסוף העונה הראשונה
          </p>
        </div>
      ) : (
        completedSeasons.map(season => {
          const seasonEntries = (entries ?? []).filter(e => e.season_id === season.id)
          const playerEntries = seasonEntries.filter(e => e.type === 'player').slice(0, 3)
          const tribeEntries  = seasonEntries.filter(e => e.type === 'tribe').slice(0, 3)

          return (
            <div key={season.id} className="card-game overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-game-border bg-game-elevated/40">
                <Trophy className="size-4 text-game-gold" />
                <h2 className="font-display text-game-base text-game-gold-bright">עונה {season.number}</h2>
                {season.ended_at && (
                  <span className="text-game-xs text-game-text-muted font-body ms-auto">
                    הסתיימה {new Date(season.ended_at).toLocaleDateString('he-IL')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x-reverse md:divide-x divide-game-border">
                {/* Top Players */}
                <div className="p-4">
                  <h3 className="font-heading text-game-xs uppercase tracking-wider text-game-text-secondary mb-3">
                    🏆 שחקנים מובילים
                  </h3>
                  {playerEntries.length > 0 ? (
                    <div className="space-y-2">
                      {playerEntries.map(entry => (
                        <div key={entry.id} className="flex items-center gap-3">
                          <Crown rank={entry.rank} />
                          <div className="flex-1">
                            <p className="font-heading text-game-sm text-game-text-white">{entry.name}</p>
                          </div>
                          <p className="text-game-xs text-game-text-secondary font-body tabular-nums">
                            {formatNumber(entry.power_total, true)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-game-xs text-game-text-muted font-body">אין נתונים</p>
                  )}
                </div>

                {/* Top Tribes */}
                <div className="p-4">
                  <h3 className="font-heading text-game-xs uppercase tracking-wider text-game-text-secondary mb-3">
                    ⚔️ שבטים מובילים
                  </h3>
                  {tribeEntries.length > 0 ? (
                    <div className="space-y-2">
                      {tribeEntries.map(entry => (
                        <div key={entry.id} className="flex items-center gap-3">
                          <Crown rank={entry.rank} />
                          <div className="flex-1">
                            <p className="font-heading text-game-sm text-game-text-white">{entry.name}</p>
                          </div>
                          <p className="text-game-xs text-game-text-secondary font-body tabular-nums">
                            {formatNumber(entry.power_total, true)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-game-xs text-game-text-muted font-body">אין נתונים</p>
                  )}
                </div>
              </div>
            </div>
          )
        })
      )}

      {/* Info */}
      <div className="card-gold p-4">
        <p className="font-heading text-game-xs uppercase tracking-wider text-game-gold mb-2">ℹ️ על היכל התהילה</p>
        <ul className="space-y-1 text-game-xs text-game-text-secondary font-body list-inside list-disc">
          <li>היכל התהילה מציג את המנצחים של כל עונה שהסתיימה</li>
          <li>כל עונה נמשכת 90 יום</li>
          <li>המנצחים מקבלים פרסים מיוחדים ואות לתמיד</li>
          <li>הדירוג מחושב לפי כוח כולל בסוף העונה</li>
          <li>גם שבטים מקבלים הכרה בהיכל התהילה</li>
        </ul>
      </div>

    </div>
  )
}
