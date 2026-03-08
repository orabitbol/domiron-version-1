import { createAdminClient } from '@/lib/supabase/server'
import type { PlayerData } from '@/types/game'

/**
 * Loads the full PlayerData object for a given player ID.
 * Returns null if the player row doesn't exist.
 * Used by both (game)/layout.tsx and (public)/layout.tsx.
 */
export async function loadPlayerData(playerId: string): Promise<PlayerData | null> {
  const supabase = createAdminClient()

  const [
    { data: player },
    { data: resources },
    { data: army },
    { data: weapons },
    { data: training },
    { data: development },
    { data: hero },
    { data: bank },
    { data: tribeMember },
  ] = await Promise.all([
    supabase
      .from('players')
      .select(
        'id,username,email,role,race,army_name,city,turns,reputation,rank_city,rank_global,power_attack,power_defense,power_spy,power_scout,power_total,vip_until,is_vacation,vacation_days_used,season_id,joined_at,last_seen_at,created_at',
      )
      .eq('id', playerId)
      .single(),
    supabase.from('resources').select('*').eq('player_id', playerId).single(),
    supabase.from('army').select('*').eq('player_id', playerId).single(),
    supabase.from('weapons').select('*').eq('player_id', playerId).single(),
    supabase.from('training').select('*').eq('player_id', playerId).single(),
    supabase.from('development').select('*').eq('player_id', playerId).single(),
    supabase.from('hero').select('*').eq('player_id', playerId).single(),
    supabase.from('bank').select('*').eq('player_id', playerId).single(),
    supabase.from('tribe_members').select('tribe_id').eq('player_id', playerId).single(),
  ])

  if (!player) return null

  let tribe = null
  if (tribeMember?.tribe_id) {
    const { data } = await supabase
      .from('tribes')
      .select('*')
      .eq('id', tribeMember.tribe_id)
      .single()
    tribe = data
  }

  let season = null
  if (player.season_id) {
    const { data } = await supabase
      .from('seasons')
      .select('id,number,status,starts_at,ends_at,ended_at,created_at,created_by')
      .eq('id', player.season_id)
      .single()
    season = data
  }

  return {
    player: player as PlayerData['player'],
    resources: resources ?? {
      id: '', player_id: playerId, gold: 0, iron: 0, wood: 0, food: 0, updated_at: '',
    },
    army: army ?? {
      id: '', player_id: playerId, soldiers: 0, cavalry: 0, spies: 0, scouts: 0,
      slaves: 0, free_population: 0, updated_at: '',
    },
    weapons: weapons ?? {
      id: '', player_id: playerId, slingshot: 0, boomerang: 0, pirate_knife: 0, axe: 0,
      master_knife: 0, knight_axe: 0, iron_ball: 0, wood_shield: 0, iron_shield: 0,
      leather_armor: 0, chain_armor: 0, plate_armor: 0, mithril_armor: 0, gods_armor: 0,
      shadow_cloak: 0, dark_mask: 0, elven_gear: 0, scout_boots: 0, scout_cloak: 0,
      elven_boots: 0, updated_at: '',
    },
    training: training ?? {
      id: '', player_id: playerId, attack_level: 0, defense_level: 0,
      spy_level: 0, scout_level: 0, updated_at: '',
    },
    development: development ?? {
      id: '', player_id: playerId, gold_level: 0, food_level: 0, wood_level: 0,
      iron_level: 0, population_level: 0, fortification_level: 0, updated_at: '',
    },
    hero: hero ?? null,
    bank: bank ?? {
      id: '', player_id: playerId, balance: 0, interest_level: 0,
      deposits_today: 0, last_deposit_reset: '', updated_at: '',
    },
    tribe: tribe ?? null,
    season: season ?? null,
  }
}
