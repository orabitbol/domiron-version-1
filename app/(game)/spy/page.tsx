import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { SpyClient } from './SpyClient'

export default async function SpyPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const [
    { data: player },
    { data: army },
    { data: training },
  ] = await Promise.all([
    supabase.from('players').select('id, army_name, city, turns, max_turns, race').eq('id', playerId).single(),
    supabase.from('army').select('spies, scouts').eq('player_id', playerId).single(),
    supabase.from('training').select('spy_level, scout_level').eq('player_id', playerId).single(),
  ])

  if (!player || !army || !training) return null

  // Fetch all players in same city (potential spy targets)
  const { data: cityPlayers } = await supabase
    .from('players')
    .select('id, army_name, rank_city, is_vacation')
    .eq('city', player.city)
    .neq('id', playerId)
    .order('rank_city', { ascending: true })
    .limit(100)

  const playerIds = cityPlayers?.map((p) => p.id) ?? []

  let armyRows: { player_id: string; scouts: number }[] = []
  if (playerIds.length > 0) {
    const { data } = await supabase
      .from('army')
      .select('player_id, scouts')
      .in('player_id', playerIds)
    armyRows = data ?? []
  }

  const targets = (cityPlayers ?? []).map((p) => ({
    id:          p.id,
    army_name:   p.army_name,
    rank_city:   p.rank_city,
    scouts:      armyRows.find((a) => a.player_id === p.id)?.scouts ?? 0,
    is_vacation: p.is_vacation,
  }))

  return (
    <SpyClient
      player={player as Parameters<typeof SpyClient>[0]['player']}
      army={army}
      training={training}
      targets={targets}
    />
  )
}
