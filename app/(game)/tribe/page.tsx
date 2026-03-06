import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { TribeClient } from './TribeClient'

export default async function TribePage() {
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

  // Get the player's tribe membership
  const { data: membership } = await supabase
    .from('tribe_members')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle()

  let tribe = null
  let members: Array<{
    member: { player_id: string; role: 'leader' | 'deputy' | 'member'; reputation: number; reputation_pct: number; tax_exempt: boolean }
    player: { id: string; username: string; army_name: string; rank_city: number | null } | null
  }> = []
  let tribeSpells: Array<{ spell_key: string; expires_at: string }> = []

  if (membership) {
    const { data: tribeData } = await supabase
      .from('tribes')
      .select('*')
      .eq('id', membership.tribe_id)
      .single()
    tribe = tribeData

    if (tribe) {
      const { data: memberRows } = await supabase
        .from('tribe_members')
        .select('*')
        .eq('tribe_id', tribe.id)

      if (memberRows) {
        const playerIds = memberRows.map((m) => m.player_id)
        const { data: playerRows } = await supabase
          .from('players')
          .select('id, username, army_name, rank_city')
          .in('id', playerIds)

        members = memberRows.map((m) => ({
          member: m,
          player: playerRows?.find((p) => p.id === m.player_id) ?? null,
        }))
      }

      const { data: spellRows } = await supabase
        .from('tribe_spells')
        .select('spell_key, expires_at')
        .eq('tribe_id', tribe.id)
        .gt('expires_at', new Date().toISOString())

      tribeSpells = spellRows ?? []
    }
  }

  // If not in tribe, fetch joinable tribes in same city
  let joinableTribes: Array<{
    id: string
    name: string
    anthem: string | null
    level: number
    max_members: number
    member_count: number
  }> = []

  if (!tribe) {
    const { data: cityTribes } = await supabase
      .from('tribes')
      .select('id, name, anthem, level, max_members')
      .eq('city', player.city)
      .limit(20)

    if (cityTribes) {
      const tribeIds = cityTribes.map((t) => t.id)
      const { data: memberCounts } = await supabase
        .from('tribe_members')
        .select('tribe_id')
        .in('tribe_id', tribeIds)

      joinableTribes = cityTribes.map((t) => ({
        ...t,
        member_count: memberCounts?.filter((m) => m.tribe_id === t.id).length ?? 0,
      }))
    }
  }

  return (
    <TribeClient
      player={player}
      membership={membership ?? null}
      tribe={tribe}
      members={members}
      tribeSpells={tribeSpells}
      joinableTribes={joinableTribes}
    />
  )
}
