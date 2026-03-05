import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { SpyClient } from './SpyClient'

// Always fetch fresh targets list — page is not cacheable.
export const dynamic = 'force-dynamic'

export default async function SpyPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  // Fetch city from player row — needed to filter targets by city
  const { data: player } = await supabase
    .from('players')
    .select('city')
    .eq('id', playerId)
    .single()

  if (!player) return null

  // Fetch all players in same city (potential spy targets), excluding self
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

  return <SpyClient targets={targets} />
}
