import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { StatBox } from '@/components/ui/stat-box'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/utils'

export default async function BasePage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const [
    { data: player },
    { data: army },
    { data: training },
    { data: development },
  ] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).single(),
    supabase.from('army').select('*').eq('player_id', playerId).single(),
    supabase.from('training').select('*').eq('player_id', playerId).single(),
    supabase.from('development').select('*').eq('player_id', playerId).single(),
  ])

  if (!player) return null

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-game-3xl text-game-gold-bright uppercase tracking-wide">
            {player.army_name}
          </h1>
          <p className="text-game-text-secondary font-body mt-1">
            {player.username} · <span className="capitalize">{player.race}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {player.vip_until && new Date(player.vip_until) > new Date() && (
            <Badge variant="gold">VIP</Badge>
          )}
          {player.is_vacation && <Badge variant="blue">Vacation</Badge>}
          <Badge variant="default">City {player.city}</Badge>
        </div>
      </div>

      {/* Rank info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'City Rank',   value: player.rank_city   ? `#${player.rank_city}`   : '—' },
          { label: 'Global Rank', value: player.rank_global ? `#${player.rank_global}` : '—' },
          { label: 'Reputation',  value: formatNumber(player.reputation) },
          { label: 'Total Power', value: formatNumber(player.power_total, true) },
        ].map(({ label, value }) => (
          <div key={label} className="bg-game-surface border border-game-border rounded-lg p-3 text-center">
            <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">{label}</p>
            <p className="text-game-lg text-game-text-white font-body font-semibold mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Army stat boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatBox
          title="Attack"
          color="red"
          stats={[
            { label: 'Soldiers', value: army?.soldiers ?? 0 },
            { label: 'Cavalry',  value: army?.cavalry ?? 0 },
            { label: 'Training', value: `Lvl ${training?.attack_level ?? 0}` },
            { label: 'Power',    value: player.power_attack },
          ]}
        />
        <StatBox
          title="Defense"
          color="gold"
          stats={[
            { label: 'Soldiers',       value: army?.soldiers ?? 0 },
            { label: 'Fortification',  value: `Lvl ${development?.fortification_level ?? 1}` },
            { label: 'Training',       value: `Lvl ${training?.defense_level ?? 0}` },
            { label: 'Power',          value: player.power_defense },
          ]}
        />
        <StatBox
          title="Spy"
          color="purple"
          stats={[
            { label: 'Spies',    value: army?.spies ?? 0 },
            { label: 'Training', value: `Lvl ${training?.spy_level ?? 0}` },
            { label: 'Power',    value: player.power_spy },
          ]}
        />
        <StatBox
          title="Scout"
          color="blue"
          stats={[
            { label: 'Scouts',   value: army?.scouts ?? 0 },
            { label: 'Training', value: `Lvl ${training?.scout_level ?? 0}` },
            { label: 'Power',    value: player.power_scout },
          ]}
        />
      </div>

      {/* Army summary */}
      <div className="bg-game-surface border border-game-border rounded-lg p-4">
        <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text mb-3">Army Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {[
            { label: 'Soldiers',         value: army?.soldiers ?? 0 },
            { label: 'Cavalry',          value: army?.cavalry ?? 0 },
            { label: 'Spies',            value: army?.spies ?? 0 },
            { label: 'Scouts',           value: army?.scouts ?? 0 },
            { label: 'Slaves',           value: army?.slaves ?? 0 },
            { label: 'Farmers',          value: army?.farmers ?? 0 },
            { label: 'Free Population',  value: army?.free_population ?? 0 },
            { label: 'Capacity',         value: player.capacity },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col">
              <span className="text-game-xs text-game-text-muted font-body">{label}</span>
              <span className="text-game-base text-game-text-white font-body font-semibold tabular-nums">
                {formatNumber(value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
