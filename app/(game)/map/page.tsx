import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { Map, AlertCircle } from 'lucide-react'
import { BALANCE } from '@/lib/game/balance'

const CITY_MULTIPLIERS: Record<number, number> = BALANCE.production.cityMultipliers as Record<number, number>

const CITIES = [
  {
    id: 1, name: 'כפר', nameEn: 'Village',
    desc: 'עיירה קטנה ושקטה - מקום מצוין להתחיל',
    icon: '🏘️', gradient: 'from-green-900/40 to-green-800/20', border: 'border-green-800/30',
  },
  {
    id: 2, name: 'עיירה', nameEn: 'Town',
    desc: 'עיירה מסחרית עם כלכלה פורחת',
    icon: '🏙️', gradient: 'from-blue-900/40 to-blue-800/20', border: 'border-blue-800/30',
  },
  {
    id: 3, name: 'עיר', nameEn: 'City',
    desc: 'עיר בינונית עם תשתיות מפותחות',
    icon: '🌆', gradient: 'from-purple-900/40 to-purple-800/20', border: 'border-purple-800/30',
  },
  {
    id: 4, name: 'מטרופולין', nameEn: 'Metropolis',
    desc: 'מרכז כוח אדיר עם הכנסות גבוהות',
    icon: '🌃', gradient: 'from-orange-900/40 to-orange-800/20', border: 'border-orange-800/30',
  },
  {
    id: 5, name: 'אימפריה', nameEn: 'Empire',
    desc: 'הפסגה — רק הגדולים ביותר מגיעים לכאן',
    icon: '👑', gradient: 'from-yellow-900/40 to-yellow-800/20', border: 'border-yellow-700/40',
  },
]

export default async function MapPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createAdminClient()
  const { data: player } = await supabase
    .from('players')
    .select('city')
    .eq('id', session.user.id)
    .single()

  const currentCity = player?.city ?? 1
  const multiplier = CITY_MULTIPLIERS[currentCity] ?? 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-game-lg bg-game-blue/10 border border-game-blue/30">
          <Map className="size-5 text-game-blue-bright" />
        </div>
        <div>
          <h1 className="font-display text-game-2xl gold-gradient-text-static uppercase tracking-wide">מפת ערים</h1>
          <p className="text-game-sm text-game-text-secondary font-body">עבור בין ערים ובחר את מיקומך האסטרטגי</p>
        </div>
      </div>

      {/* Current city card */}
      <div className="p-4 rounded-game-xl bg-gradient-to-r from-game-blue/20 to-game-purple/10 border border-game-blue/30">
        <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wider mb-1">העיר הנוכחית שלך</p>
        <div className="flex items-center gap-3">
          <span className="text-4xl">{CITIES[currentCity - 1]?.icon}</span>
          <div>
            <h2 className="font-display text-game-xl text-game-text-white">{CITIES[currentCity - 1]?.name}</h2>
            <p className="text-game-sm text-game-text-secondary font-body">{CITIES[currentCity - 1]?.desc}</p>
          </div>
          <div className="ms-auto text-end">
            <p className="text-game-xs text-game-text-muted font-body">מכפיל ייצור</p>
            <p className="text-game-2xl font-display text-game-gold-bright">×{multiplier}</p>
          </div>
        </div>
      </div>

      {/* Rule alert */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-game-lg bg-game-gold/8 border border-game-gold/25">
        <AlertCircle className="size-4 text-game-gold shrink-0 mt-0.5" />
        <p className="text-game-sm text-game-text-secondary font-body">
          <strong className="text-game-gold font-heading">חשוב:</strong> ניתן לתקוף רק שחקנים שנמצאים באותה עיר.
          עיבוד לעיר גדולה יותר מגביר ייצור אך מצמצם את בסיס היריבים.
        </p>
      </div>

      {/* Cities grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CITIES.map((city) => {
          const isCurrentCity = city.id === currentCity
          const cityMultiplier = CITY_MULTIPLIERS[city.id] ?? 1
          const isLocked = city.id > 3 // Cities 4-5 require higher level (simplified)

          return (
            <div
              key={city.id}
              className={cn(
                'relative rounded-game-xl border p-4 transition-all duration-200',
                `bg-gradient-to-br ${city.gradient}`,
                city.border,
                isCurrentCity && 'ring-2 ring-game-gold-bright/40 shadow-gold-glow-sm',
                isLocked && 'opacity-60'
              )}
            >
              {isCurrentCity && (
                <div className="absolute top-2 end-2">
                  <span className="chip bg-game-gold/30 border border-game-gold/50 text-game-gold-bright text-[10px]">
                    📍 כאן
                  </span>
                </div>
              )}

              <div className="text-4xl mb-3">{city.icon}</div>
              <h3 className="font-display text-game-lg text-game-text-white mb-1">{city.name}</h3>
              <p className="text-game-xs text-game-text-secondary font-body mb-3 leading-relaxed">{city.desc}</p>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-game-border/50">
                <div>
                  <p className="text-game-xs text-game-text-muted font-body">מכפיל ייצור</p>
                  <p className="font-heading font-bold text-game-gold-bright">×{cityMultiplier}</p>
                </div>
                <div>
                  <p className="text-game-xs text-game-text-muted font-body">רמת עיר</p>
                  <p className="font-heading font-bold text-game-text-white">{city.id}</p>
                </div>
              </div>

              {isLocked && (
                <div className="mt-2 text-center">
                  <span className="text-game-xs text-game-text-muted font-body">🔒 לא זמין עדיין</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Info table */}
      <div className="card-game overflow-hidden">
        <div className="px-4 py-3 border-b border-game-border bg-game-elevated/40">
          <h2 className="font-heading text-game-sm uppercase tracking-wider text-game-text-secondary">מידע על ערים</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-game-sm font-body">
            <thead className="bg-game-elevated/30">
              <tr>
                {['עיר', 'מכפיל ייצור', 'מוניטין נדרש'].map(h => (
                  <th key={h} className="px-4 py-2 text-start text-game-xs font-heading uppercase tracking-wide text-game-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-game-border">
              {CITIES.map(city => {
                const cityMultiplier = CITY_MULTIPLIERS[city.id] ?? 1
                return (
                  <tr key={city.id} className={cn('hover:bg-game-elevated/20', city.id === currentCity && 'bg-game-gold/5')}>
                    <td className="px-4 py-2.5 font-heading text-game-text-white">
                      {city.icon} {city.name}
                      {city.id === currentCity && <span className="ms-2 text-game-xs text-game-gold-bright">(נוכחית)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-game-gold-bright font-semibold">×{cityMultiplier}</td>
                    <td className="px-4 py-2.5 text-game-text-secondary">—</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
