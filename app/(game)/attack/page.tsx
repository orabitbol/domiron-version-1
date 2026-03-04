import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { AttackClient } from './AttackClient'

export default async function AttackPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const admin    = createAdminClient()
  const playerId = session.user.id

  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single()

  if (!player) return null

  // Fetch all players in same city (including self — self row has no Attack button)
  const { data: cityPlayers } = await supabase
    .from('players')
    .select('id, army_name, city, rank_city, rank_global, power_total, is_vacation')
    .eq('city', player.city)
    .order('rank_city', { ascending: true })
    .limit(100)

  const playerIds = cityPlayers?.map((p) => p.id) ?? []

  // Parallel: tribe names, army counts, hero shields
  let playerTribes: Record<string, string> = {}
  let resourceShields: Set<string> = new Set()
  let soldierShields: Set<string>  = new Set()

  await Promise.all([
    // Tribe names
    (async () => {
      if (playerIds.length === 0) return
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
    })(),

    // Shield status — admin client needed (RLS: players can only read own effects)
    (async () => {
      if (playerIds.length === 0) return
      const now = new Date().toISOString()
      const { data: effects } = await admin
        .from('player_hero_effects')
        .select('player_id, type')
        .in('player_id', playerIds)
        .in('type', ['RESOURCE_SHIELD', 'SOLDIER_SHIELD'])
        .gt('ends_at', now)

      for (const e of effects ?? []) {
        if (e.type === 'RESOURCE_SHIELD') resourceShields.add(e.player_id)
        if (e.type === 'SOLDIER_SHIELD')  soldierShields.add(e.player_id)
      }
    })(),
  ])

  // Fetch army counts
  const { data: armyRows } = playerIds.length > 0
    ? await supabase.from('army').select('player_id, soldiers').in('player_id', playerIds)
    : { data: [] }

  const targetList = (cityPlayers ?? []).map((p) => ({
    id:                     p.id,
    army_name:              p.army_name,
    rank_city:              p.rank_city,
    tribe_name:             playerTribes[p.id] ?? null,
    soldiers:               armyRows?.find((a) => a.player_id === p.id)?.soldiers ?? 0,
    is_vacation:            p.is_vacation,
    resource_shield_active: resourceShields.has(p.id),
    soldier_shield_active:  soldierShields.has(p.id),
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
