import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { AttackClient } from './AttackClient'

export default async function AttackPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single()

  if (!player) return null

  // Fetch all players in same city (excluding self)
  const { data: cityPlayers } = await supabase
    .from('players')
    .select('id, army_name, city, rank_city, rank_global, power_total, is_vacation')
    .eq('city', player.city)
    .neq('id', playerId)
    .order('rank_city', { ascending: true })
    .limit(100)

  // Fetch tribe memberships for those players to show tribe names
  const playerIds = cityPlayers?.map((p) => p.id) ?? []
  let playerTribes: Record<string, string> = {}

  if (playerIds.length > 0) {
    const { data: memberships } = await supabase
      .from('tribe_members')
      .select('player_id, tribe_id')
      .in('player_id', playerIds)

    if (memberships && memberships.length > 0) {
      const tribeIds = Array.from(new Set(memberships.map((m) => m.tribe_id)))
      const { data: tribes } = await supabase
        .from('tribes')
        .select('id, name')
        .in('id', tribeIds)

      for (const m of memberships) {
        const t = tribes?.find((t) => t.id === m.tribe_id)
        if (t) playerTribes[m.player_id] = t.name
      }
    }
  }

  // Fetch army counts for those players to show soldier count
  const { data: armyRows } = playerIds.length > 0
    ? await supabase.from('army').select('player_id, soldiers').in('player_id', playerIds)
    : { data: [] }

  const targetList = (cityPlayers ?? []).map((p) => ({
    id: p.id,
    army_name: p.army_name,
    rank_city: p.rank_city,
    tribe_name: playerTribes[p.id] ?? null,
    soldiers: armyRows?.find((a) => a.player_id === p.id)?.soldiers ?? 0,
    is_vacation: p.is_vacation,
  }))

  const { data: resources } = await supabase
    .from('resources')
    .select('*')
    .eq('player_id', playerId)
    .single()

  return (
    <AttackClient
      player={player}
      targets={targetList}
      resources={resources ?? null}
    />
  )
}
