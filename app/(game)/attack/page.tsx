import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import { AttackClient } from './AttackClient'
import { isNewPlayerProtected } from '@/lib/game/combat'
import { getActiveSeason } from '@/lib/game/season'
import { BALANCE } from '@/lib/game/balance'

// Always fetch a fresh targets list — page is not cacheable.
export const dynamic = 'force-dynamic'

export default async function AttackPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const admin    = createAdminClient()
  const playerId = session.user.id

  // Fetch player's city and season — needed to scope the target list. Player state comes from context.
  const { data: player } = await supabase
    .from('players')
    .select('id, city, season_id')
    .eq('id', playerId)
    .single()

  if (!player) return null

  // Fetch all players in same city AND season (including self — self row has no Attack button).
  // Season filter prevents old-season players from appearing as targets after a season reset.
  // created_at required for new-player protection check.
  const { data: cityPlayers } = await supabase
    .from('players')
    .select('id, army_name, city, rank_city, rank_global, power_total, is_vacation, created_at')
    .eq('city', player.city)
    .eq('season_id', player.season_id)
    .order('rank_city', { ascending: true, nullsFirst: false })
    .limit(100)

  const playerIds = cityPlayers?.map((p) => p.id) ?? []

  const now = new Date()

  let playerTribes: Record<string, string> = {}
  let resourceShields: Set<string>   = new Set()
  let soldierShields: Set<string>    = new Set()
  let killCooldownTargets: Set<string> = new Set() // attacker → target cooldown active

  // Active season — fetched in parallel with other data; needed for protection gate.
  const killCooldownStart = new Date(now.getTime() - BALANCE.combat.KILL_COOLDOWN_HOURS * 3_600_000)

  const [activeSeason] = await Promise.all([
    // Active season (for new-player protection gate)
    getActiveSeason(admin),

    // Tribe memberships → tribe names
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

    // Hero effect shields (resource + soldier) for all targets
    (async () => {
      if (playerIds.length === 0) return
      const { data: effects } = await admin
        .from('player_hero_effects')
        .select('player_id, type')
        .in('player_id', playerIds)
        .in('type', ['RESOURCE_SHIELD', 'SOLDIER_SHIELD'])
        .gt('ends_at', now.toISOString())

      for (const e of effects ?? []) {
        if (e.type === 'RESOURCE_SHIELD') resourceShields.add(e.player_id)
        if (e.type === 'SOLDIER_SHIELD')  soldierShields.add(e.player_id)
      }
    })(),

    // Kill cooldown: which targets has this attacker killed soldiers of within the window?
    // When active → defender loses no soldiers next attack.
    (async () => {
      if (playerIds.length === 0) return
      const { data: recentKills } = await admin
        .from('attacks')
        .select('defender_id')
        .eq('attacker_id', playerId)
        .in('defender_id', playerIds)
        .gt('defender_losses', 0)
        .gte('created_at', killCooldownStart.toISOString())

      for (const row of recentKills ?? []) {
        killCooldownTargets.add(row.defender_id)
      }
    })(),
  ] as const)

  // New-player protection: compute per target using season gate + account age.
  // Protection is suppressed for the first protectionStartDays of the season.
  const protectedPlayers = new Set<string>()
  if (activeSeason) {
    const seasonStartedAt = new Date(activeSeason.starts_at)
    for (const p of cityPlayers ?? []) {
      if (isNewPlayerProtected(new Date(p.created_at), seasonStartedAt, now)) {
        protectedPlayers.add(p.id)
      }
    }
  }

  const [armyResult, resourcesResult] = await Promise.all([
    playerIds.length > 0
      ? supabase.from('army').select('player_id, soldiers').in('player_id', playerIds)
      : Promise.resolve({ data: [] as { player_id: string; soldiers: number }[] }),
    playerIds.length > 0
      ? supabase.from('resources').select('player_id, gold').in('player_id', playerIds)
      : Promise.resolve({ data: [] as { player_id: string; gold: number }[] }),
  ])

  const armyRows      = armyResult.data      ?? []
  const resourcesRows = resourcesResult.data  ?? []

  const targetList = (cityPlayers ?? []).map((p) => ({
    id:                     p.id,
    army_name:              p.army_name,
    rank_city:              p.rank_city,
    tribe_name:             playerTribes[p.id] ?? null,
    soldiers:               armyRows.find((a) => a.player_id === p.id)?.soldiers ?? 0,
    gold:                   resourcesRows.find((r) => r.player_id === p.id)?.gold ?? 0,
    is_vacation:            p.is_vacation,
    resource_shield_active: resourceShields.has(p.id),
    soldier_shield_active:  soldierShields.has(p.id),
    is_protected:           protectedPlayers.has(p.id),
    kill_cooldown_active:   killCooldownTargets.has(p.id),
  }))

  // Player state (turns, resources, army) comes from PlayerContext in AttackClient.
  return <AttackClient targets={targetList} />
}
