// ─────────────────────────────────────────
// Domiron — TypeScript Types
// Mirrors database-schema.md exactly
// ─────────────────────────────────────────

export type Race = 'orc' | 'human' | 'elf' | 'dwarf'
export type PlayerRole = 'player' | 'admin'

/**
 * v5 combat outcomes (binary — no draw/partial).
 * ratio >= 1.0 → 'win'; ratio < 1.0 → 'loss'.
 * DB constraint: attacks.outcome IN ('win', 'loss').
 * Old values (crushing_win, draw, crushing_loss, partial) are retired.
 */
export type AttackOutcome = 'win' | 'loss'

/**
 * Reasons why gains (loot/slaves) or defender losses may be zeroed in a battle.
 * Returned by the attack route so the UI can explain the result to the player.
 */
export type AttackBlocker =
  | 'resource_shield'    // defender's resource shield was active → loot = 0
  | 'soldier_shield'     // defender's soldier shield was active → defender losses = 0
  | 'defender_protected' // defender is within 24h new-player protection → loot = 0, def losses = 0
  | 'kill_cooldown'      // attacker killed defender's troops recently (6h cooldown) → def losses = 0
  | 'attacker_protected' // attacker is within 24h new-player protection → attacker losses = 0
  | 'loot_decay'         // repeated attacks on same target reduce loot (anti-farm)

/** Snapshot of one side's resources + army at a point in time */
export interface BattleReportSnapshot {
  gold:     number
  iron:     number
  wood:     number
  food:     number
  soldiers: number
  cavalry:  number
  slaves:   number
}

/** Machine-readable codes explaining why gains/losses were zeroed or reduced */
export type BattleReportReason =
  | 'DEFENDER_PROTECTED'           // defender has new-player protection → no loot, no losses
  | 'RESOURCE_SHIELD_ACTIVE'       // defender's resource shield → loot = 0
  | 'NO_UNBANKED_RESOURCES'        // defender had nothing to steal
  | 'KILL_COOLDOWN_NO_LOSSES'      // recent kill → defender losses blocked (6h cooldown)
  | 'ATTACKER_PROTECTED_NO_LOSSES' // attacker has new-player protection → attacker losses = 0
  | 'SOLDIER_SHIELD_NO_LOSSES'     // defender's soldier shield → defender losses = 0
  | 'LOOT_DECAY_REDUCED'           // repeated attacks → loot multiplied down (anti-farm)
  | 'OUTCOME_LOSS_NO_LOOT'         // attacker lost → no loot on defeat

/** Full structured battle report returned by POST /api/attack */
export interface BattleReport {
  outcome: 'WIN' | 'LOSS'
  ratio:   number
  attacker: {
    name:        string
    ecp_attack:  number
    turns_spent: number
    food_spent:  number
    losses:      { soldiers: number; cavalry: number }
    before:      BattleReportSnapshot
    after:       BattleReportSnapshot
  }
  defender: {
    name:        string
    ecp_defense: number
    losses:      { soldiers: number; cavalry: number }
    before:      BattleReportSnapshot
    after:       BattleReportSnapshot
  }
  gained: {
    loot:     { gold: number; iron: number; wood: number; food: number }
    /** Defender soldiers captured and added to attacker army.slaves. 0 when defenderLosses = 0. */
    captives: number
  }
  flags: {
    defender_protected:              boolean
    attacker_protected:              boolean
    defender_resource_shield_active: boolean
    defender_soldier_shield_active:  boolean
    kill_cooldown_active:            boolean
    anti_farm_decay_mult:            number
    defender_unbanked_empty:         boolean
  }
  reasons: BattleReportReason[]
}

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
  /** @deprecated DB column — legacy, dead for gameplay. Use BALANCE.tick.maxTurns for all turn-cap logic. */
  max_turns: number
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
  /** Set to the timestamp of the last committed attack. NULL until first attack. */
  last_attack_at: string | null
  /** Set to the timestamp of the last committed spy mission. NULL until first mission. */
  last_spy_at: string | null
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
  /** Total slave count (sum of all assigned + idle). */
  slaves: number
  /** Slaves assigned to gold production. */
  slaves_gold: number
  /** Slaves assigned to iron production. */
  slaves_iron: number
  /** Slaves assigned to wood production. */
  slaves_wood: number
  /** Slaves assigned to food production. */
  slaves_food: number
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
  level: number
  reputation: number
  /** TRIBE mana pool — funded by member contributions and tick regen. Separate from personal hero.mana. */
  mana: number
  max_members: number
  tax_amount: number
  power_total: number
  /** Date string (YYYY-MM-DD) of the last automated tax collection. Null if never collected. */
  last_tax_collected_date: string | null
  season_id: number
  created_at: string
}

/** Role of a player within their tribe. Exactly 1 leader, up to 3 deputies, rest are members. */
export type TribeMemberRole = 'leader' | 'deputy' | 'member'

// ─── tribe_members ─────────────────────────────────────────────────────────
export interface TribeMember {
  id: string
  tribe_id: string
  player_id: string
  role: TribeMemberRole
  reputation: number
  reputation_pct: number
  /** Legacy per-member tax exemption override. Role-based exemption (leader/deputy) takes precedence. */
  tax_exempt: boolean
  joined_at: string
}

// ─── tribe_mana_contributions ──────────────────────────────────────────────
export interface TribeManaContribution {
  id: string
  tribe_id: string
  player_id: string
  mana_amount: number
  season_id: number
  created_at: string
}

// ─── tribe_tax_log ─────────────────────────────────────────────────────────
export interface TribeTaxLog {
  id: string
  tribe_id: string
  player_id: string
  collected_date: string
  tax_amount: number
  paid: boolean
  season_id: number
  created_at: string
}

// ─── tribe_audit_log ───────────────────────────────────────────────────────
export interface TribeAuditLog {
  id: string
  tribe_id: string
  actor_id: string
  action: string
  target_id: string | null
  details: Record<string, unknown> | null
  created_at: string
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
  /** 'active' = in progress | 'ended' = archived */
  status: 'active' | 'ended'
  starts_at: string
  /** Hard deadline: starts_at + 90 days */
  ends_at: string
  /** Set when status transitions to 'ended'. */
  ended_at: string | null
  created_at: string
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
  season: Season | null
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

// Attack result (v5)
export interface AttackResult {
  outcome:         AttackOutcome
  ratio:           number
  attacker_ecp:    number
  defender_ecp:    number
  attacker_losses: number
  defender_losses: number
  gold_stolen:     number
  iron_stolen:     number
  wood_stolen:     number
  food_stolen:     number
  // Display fields — always present in response
  turns_used:      number
  food_cost:       number
  blockers:        AttackBlocker[]
}

// Spy mission result
export interface SpyResult {
  success:         boolean
  spy_power:       number
  scout_defense:   number
  spies_sent:      number
  spies_caught:    number
  /** Only present when success = true */
  revealed?:       SpyRevealedData
}

export interface SpyRevealedData {
  army_name:       string
  soldiers:        number
  spies:           number
  scouts:          number
  cavalry:         number
  slaves:          number
  gold:            number
  iron:            number
  wood:            number
  food:            number
  power_attack:    number
  power_defense:   number
  power_spy:       number
  power_scout:     number
  power_total:     number
  soldier_shield:  boolean
  resource_shield: boolean
  // ── Extended intel (added 2026-03-06) — absent in legacy spy history records ──
  /** Gold currently deposited in the target's bank */
  bank_gold?:        number
  /** Attack weapons owned (key = weapon slug, value = quantity) */
  attack_weapons?:   Record<string, number>
  /** Defense weapons owned (key = weapon slug, value = quantity) */
  defense_weapons?:  Record<string, number>
  /** Target's spy training level */
  spy_level?:        number
  /** Target's scout training level */
  scout_level?:      number
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
export type UnitType = 'soldier' | 'slave' | 'spy' | 'scout' | 'cavalry'

// Training types for advanced training
export type TrainingType = 'attack' | 'defense' | 'spy' | 'scout'

// Development types
export type DevelopmentType = 'gold' | 'food' | 'wood' | 'iron' | 'population' | 'fortification'

// Weapon category
export type WeaponCategory = 'attack' | 'defense' | 'spy' | 'scout'

// Tribe spell keys — V1 spells activated by leader or deputy using TRIBE mana
export type TribeSpellKey = 'war_cry' | 'tribe_shield' | 'production_blessing' | 'spy_veil' | 'battle_supply'

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
