// ─────────────────────────────────────────
// Domiron — TypeScript Types
// Mirrors database-schema.md exactly
// ─────────────────────────────────────────

export type Race = 'orc' | 'human' | 'elf' | 'dwarf'
export type PlayerRole = 'player' | 'admin'
export type AttackOutcome = 'crushing_win' | 'win' | 'draw' | 'loss' | 'crushing_loss'
export type HallOfFameType = 'player' | 'tribe'
export type ToastType = 'attack' | 'victory' | 'defeat' | 'tick' | 'tribe' | 'info' | 'error' | 'success' | 'magic' | 'warning'

// ─── players ───────────────────────────────────────────────────────────────
export interface Player {
  id: string
  username: string
  email: string
  password_hash: string
  role: PlayerRole
  race: Race
  army_name: string
  city: number
  turns: number
  max_turns: number
  capacity: number
  reputation: number
  rank_city: number | null
  rank_global: number | null
  power_attack: number
  power_defense: number
  power_spy: number
  power_scout: number
  power_total: number
  vip_until: string | null
  is_vacation: boolean
  vacation_days_used: number
  season_id: number
  joined_at: string
  last_seen_at: string
  created_at: string
}

// ─── resources ─────────────────────────────────────────────────────────────
export interface Resources {
  id: string
  player_id: string
  gold: number
  iron: number
  wood: number
  food: number
  updated_at: string
}

// ─── army ──────────────────────────────────────────────────────────────────
export interface Army {
  id: string
  player_id: string
  soldiers: number
  cavalry: number
  spies: number
  scouts: number
  slaves: number
  farmers: number
  free_population: number
  updated_at: string
}

// ─── weapons ───────────────────────────────────────────────────────────────
export interface Weapons {
  id: string
  player_id: string
  // Attack
  slingshot: number
  boomerang: number
  pirate_knife: number
  axe: number
  master_knife: number
  knight_axe: number
  iron_ball: number
  // Defense
  wood_shield: number
  iron_shield: number
  leather_armor: number
  chain_armor: number
  plate_armor: number
  mithril_armor: number
  gods_armor: number
  // Spy
  shadow_cloak: number
  dark_mask: number
  elven_gear: number
  // Scout
  scout_boots: number
  scout_cloak: number
  elven_boots: number
  updated_at: string
}

// ─── training ──────────────────────────────────────────────────────────────
export interface Training {
  id: string
  player_id: string
  attack_level: number
  defense_level: number
  spy_level: number
  scout_level: number
  updated_at: string
}

// ─── development ───────────────────────────────────────────────────────────
export interface Development {
  id: string
  player_id: string
  gold_level: number
  food_level: number
  wood_level: number
  iron_level: number
  population_level: number
  fortification_level: number
  updated_at: string
}

// ─── hero ──────────────────────────────────────────────────────────────────
export interface Hero {
  id: string
  player_id: string
  level: number
  xp: number
  xp_next_level: number
  spell_points: number
  mana: number
  mana_per_tick: number
  updated_at: string
}

// ─── hero_spells ───────────────────────────────────────────────────────────
export interface HeroSpell {
  id: string
  player_id: string
  spell_key: string
  purchased_at: string
}

// ─── bank ──────────────────────────────────────────────────────────────────
export interface Bank {
  id: string
  player_id: string
  balance: number
  interest_level: number
  deposits_today: number
  last_deposit_reset: string
  updated_at: string
}

// ─── tribes ────────────────────────────────────────────────────────────────
export interface Tribe {
  id: string
  name: string
  anthem: string | null
  city: number
  leader_id: string
  deputy_id: string | null
  level: number
  reputation: number
  mana: number
  max_members: number
  tax_amount: number
  power_total: number
  season_id: number
  created_at: string
}

// ─── tribe_members ─────────────────────────────────────────────────────────
export interface TribeMember {
  id: string
  tribe_id: string
  player_id: string
  reputation: number
  reputation_pct: number
  tax_paid_today: boolean
  tax_exempt: boolean
  joined_at: string
}

// ─── tribe_spells ──────────────────────────────────────────────────────────
export interface TribeSpell {
  id: string
  tribe_id: string
  spell_key: string
  activated_by: string
  expires_at: string
  created_at: string
}

// ─── attacks ───────────────────────────────────────────────────────────────
export interface Attack {
  id: string
  attacker_id: string
  defender_id: string
  turns_used: number
  atk_power: number
  def_power: number
  outcome: AttackOutcome
  attacker_losses: number
  defender_losses: number
  slaves_taken: number
  gold_stolen: number
  iron_stolen: number
  wood_stolen: number
  food_stolen: number
  season_id: number
  created_at: string
}

// ─── spy_history ───────────────────────────────────────────────────────────
export interface SpyHistory {
  id: string
  spy_owner_id: string
  target_id: string
  success: boolean
  spies_caught: number
  data_revealed: Record<string, unknown> | null
  season_id: number
  created_at: string
}

// ─── seasons ───────────────────────────────────────────────────────────────
export interface Season {
  id: number
  number: number
  started_at: string
  ended_at: string | null
  is_active: boolean
  created_by: string | null
}

// ─── hall_of_fame ──────────────────────────────────────────────────────────
export interface HallOfFameEntry {
  id: string
  season_id: number
  type: HallOfFameType
  rank: number
  name: string
  race: string | null
  city: number | null
  power_total: number
  created_at: string
}

// ─── balance_overrides ─────────────────────────────────────────────────────
export interface BalanceOverride {
  id: string
  key: string
  value: unknown
  updated_by: string | null
  updated_at: string
}

// ─── admin_logs ────────────────────────────────────────────────────────────
export interface AdminLog {
  id: string
  admin_id: string
  action: string
  target_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

// ─────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  code?: string
  message?: string
}

// GET /api/player response
export interface PlayerData {
  player: Player
  resources: Resources
  army: Army
  weapons: Weapons
  training: Training
  development: Development
  hero: Hero
  bank: Bank
  tribe: Tribe | null
}

// Attack list player entry
export interface AttackListPlayer {
  id: string
  army_name: string
  tribe_name: string | null
  soldiers: number
  gold: number
  rank_city: number | null
  attack_count_today: number
}

// Attack result
export interface AttackResult {
  outcome: AttackOutcome
  attacker_losses: number
  defender_losses: number
  slaves_taken: number
  gold_stolen: number
  iron_stolen: number
  wood_stolen: number
  food_stolen: number
  atk_power: number
  def_power: number
}

// Ranked player (rankings page)
export interface RankedPlayer {
  id: string
  username: string
  army_name: string
  race: Race
  city: number
  rank_city: number | null
  rank_global: number | null
  power_total: number
  tribe_name: string | null
  is_vacation: boolean
}

// Ranked tribe
export interface RankedTribe {
  id: string
  name: string
  city: number
  level: number
  power_total: number
  member_count: number
  leader_name: string
}

// Resource types for components
export type ResourceType = 'gold' | 'iron' | 'wood' | 'food' | 'turns' | 'mana'

// Unit types for training
export type UnitType = 'soldier' | 'slave' | 'spy' | 'scout' | 'cavalry' | 'farmer'

// Training types for advanced training
export type TrainingType = 'attack' | 'defense' | 'spy' | 'scout'

// Development types
export type DevelopmentType = 'gold' | 'food' | 'wood' | 'iron' | 'population' | 'fortification'

// Weapon category
export type WeaponCategory = 'attack' | 'defense' | 'spy' | 'scout'

// Tribe spell keys
export type TribeSpellKey = 'combat_boost' | 'tribe_shield' | 'production_blessing' | 'mass_spy' | 'war_cry'

// Hero shield types
export type HeroShieldType = 'soldiers' | 'resources'

// NextAuth session extension
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: PlayerRole
    }
  }
  interface User {
    id: string
    email: string
    name: string
    role: PlayerRole
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    role: PlayerRole
  }
}
