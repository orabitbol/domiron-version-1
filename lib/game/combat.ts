/**
 * Domiron v5 — Combat & Economy Engine
 *
 * Pure functions only. No side effects. No DB calls. No randomness.
 * All constants imported from BALANCE — never hardcoded here.
 *
 * ── Beginner Protection Contract ────────────────────────────────────────────
 * Attacks on protected players are NEVER blocked at the gate level.
 * Protection is a flag applied inside combat resolution:
 *   defenderIsProtected = true  → defenderLosses = 0, loot = 0
 *   attackerIsProtected = true  → attackerLosses = 0
 * The attacker ALWAYS pays turns + food regardless of protection state.
 * This is intentional: the attack resolves for UX (battle screen shown),
 * but causes no permanent damage or resource transfer.
 *
 * ── Soldier Tier Contract ────────────────────────────────────────────────────
 * SoldierScore = Σ Count[tier] × TierValue[tier]
 * TierValue[tier] = SOLDIER_V × SOLDIER_K ^ (tier - 1)
 *
 * Current DB tier mapping:
 *   Tier 1 → army.soldiers
 *   Tier 2 → army.cavalry  (tier assignment subject to final design decision)
 *
 * Future soldier tier columns require DB schema extension.
 *
 * ── Order of Operations (full resolution) ────────────────────────────────────
 *   1. calculatePersonalPower(attacker), calculatePersonalPower(defender)
 *   2. calculateClanBonus(attackerPP, attackerClan)
 *      calculateClanBonus(defenderPP, defenderClan)
 *   3. calculateECP(attackerPP, attackerClan, attackBonus, raceBonus) → baseECP
 *      Apply tribe multiplier → finalECP = floor(baseECP × tribeMultiplier)
 *   4. calculateCombatRatio(attackerECP, defenderECP)
 *   5. determineCombatOutcome(ratio)
 *   6. calculateSoldierLosses(...)
 *      → if soldierShieldActive: defenderLosses = 0
 *   7. calculateLoot(...)
 *      → if resourceShieldActive: loot = 0
 */

import { BALANCE } from '@/lib/game/balance'
import { clampBonus } from '@/lib/game/hero-effects'
import type { Army, Weapons, Training, Development } from '@/types/game'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

/** Binary outcome — no draw/partial. ratio >= WIN_THRESHOLD → win; else → loss. */
export type CombatOutcome = 'win' | 'loss'

/** All inputs needed to compute a player's PersonalPower. */
export interface PersonalPowerInputs {
  army:        Pick<Army, 'soldiers' | 'cavalry' | 'spies' | 'scouts'>
  weapons:     Weapons
  training:    Training
  development: Development
}

/** Clan context passed into ECP calculation. */
export interface ClanContext {
  /** Sum of PP of all current clan members at the moment of combat. */
  totalClanPP:      number
  /** Clan development level (1–5). Clans start at level 1. */
  developmentLevel: number
}

export interface UnbankedResources {
  gold: number
  iron: number
  wood: number
  food: number
}

export interface SoldierLossResult {
  /** Soldiers lost by the attacker. Applied to deployed count only. */
  attackerLosses: number
  /**
   * Soldiers lost by the defender.
   * 0 if killCooldownActive or defenderIsProtected.
   */
  defenderLosses: number
}

export interface CombatResolutionInputs {
  attackerPP:       number
  defenderPP:       number
  /** Soldiers the attacker chose to deploy. Losses apply only to this count. */
  deployedSoldiers: number
  defenderSoldiers: number
  /** null if attacker has no clan. */
  attackerClan:     ClanContext | null
  /** null if defender has no clan. */
  defenderClan:     ClanContext | null
  defenderUnbanked: UnbankedResources
  /**
   * Attacks by this attacker on this specific target within DECAY_WINDOW_HOURS.
   * Must include the current attack (minimum value: 1).
   */
  attackCountInWindow: number
  /**
   * True if the last time this attacker killed defender soldiers was within
   * KILL_COOLDOWN_HOURS. When true: defenderLosses = 0.
   * Loot still resolves normally based on outcome.
   */
  killCooldownActive: boolean
  /**
   * True if attacker is within PROTECTION_HOURS of account creation.
   * When true: attackerLosses = 0.
   * Attacker still pays turns + food.
   */
  attackerIsProtected: boolean
  /**
   * True if defender is within PROTECTION_HOURS of account creation.
   * When true: defenderLosses = 0, loot = 0.
   * Attack is NOT blocked — it resolves for UX with zero permanent effect.
   */
  defenderIsProtected: boolean

  // ── VIP Boost inputs ─────────────────────────────────────────────────────
  /**
   * Pre-clamped attack power boost from getActiveBoostTotals() (0 – 0.50).
   * Applied as (1 + attackBonus) on attacker PP only — never on ClanBonus.
   * Default: 0 (no boost).
   */
  attackBonus: number
  /**
   * Pre-clamped defense power boost from getActiveBoostTotals() (0 – 0.50).
   * Applied as (1 + defenseBonus) on defender PP only — never on ClanBonus.
   * Default: 0 (no boost).
   */
  defenseBonus: number
  /**
   * True if defender has an active Soldier Shield.
   * When true: defenderLosses = 0.
   * Loot still applies unless resourceShieldActive is also true.
   */
  soldierShieldActive: boolean
  /**
   * True if defender has an active Resource Shield.
   * When true: all loot = 0.
   * Combat ratio and soldier losses still resolve normally.
   */
  resourceShieldActive: boolean

  // ── Race & Tribe inputs ──────────────────────────────────────────────────
  /** Race attack bonus for attacker (orc: 0.10, human: 0.03, others: 0). Default 0. */
  attackerRaceBonus?: number
  /** Race defense bonus for defender (orc: 0.03, dwarf: 0.15, others: 0). Default 0. */
  defenderRaceBonus?: number
  /** Tribe combat spell multiplier for attacker (combat_boost: 1.15, war_cry: 1.25). Default 1. */
  attackerTribeMultiplier?: number
  /** Tribe combat spell multiplier for defender (tribe_shield: 1.15). Default 1. */
  defenderTribeMultiplier?: number
}

export interface CombatResolutionResult {
  outcome:          CombatOutcome
  ratio:            number
  /** ECP before tribe spell multiplier is applied. */
  baseAttackerECP:  number
  /** ECP before tribe spell multiplier is applied. */
  baseDefenderECP:  number
  /** Final ECP after tribe spell multiplier (= baseAttackerECP when no tribe spell active). */
  attackerECP:      number
  /** Final ECP after tribe spell multiplier (= baseDefenderECP when no tribe spell active). */
  defenderECP:      number
  attackerLosses:   number
  defenderLosses:   number
  loot:             UnbankedResources
}

// ─────────────────────────────────────────
// A. PERSONAL POWER
// ─────────────────────────────────────────

/**
 * PP = (SoldierScore          × W_SOLDIERS)
 *    + (EquipScore            × W_EQUIPMENT)
 *    + (SkillScore            × W_SKILLS)
 *    + (min(DevScore, DEV_CAP) × W_DEVELOPMENT)
 *    + (SpyScore              × W_SPY)
 *
 * PP recalculates ONLY when:
 *   - Soldier count changes (train, combat losses)
 *   - Equipment changes (buy, sell)
 *   - Skill level changes
 *   - Development level changes
 *
 * PP does NOT recalculate on:
 *   - Clan join / leave
 *   - Hero activation / deactivation
 *   - Resource changes
 *   - City migration alone
 */
export function calculatePersonalPower(inputs: PersonalPowerInputs): number {
  const { pp } = BALANCE

  const soldierScore = calcSoldierScore(inputs.army)
  const equipScore   = calcEquipScore(inputs.weapons)
  const skillScore   = calcSkillScore(inputs.training)
  const devScore     = Math.min(calcDevScore(inputs.development), pp.DEV_CAP)
  const spyScore     = calcSpyScore(inputs.army)

  return Math.floor(
    soldierScore * pp.W_SOLDIERS   +
    equipScore   * pp.W_EQUIPMENT  +
    skillScore   * pp.W_SKILLS     +
    devScore     * pp.W_DEVELOPMENT +
    spyScore     * pp.W_SPY
  )
}

/**
 * SoldierScore = Σ Count[tier] × TierValue[tier]
 * TierValue[tier] = SOLDIER_V × SOLDIER_K ^ (tier - 1)
 *
 * soldiersByTier is a 0-indexed array where index 0 = Tier 1 count.
 *
 * Current DB mapping passed by calculatePersonalPower:
 *   [army.soldiers, army.cavalry]
 *   Tier 1 → soldiers | Tier 2 → cavalry (pending final tier-assignment decision)
 */
export function calcSoldierScore(soldiersByTierOrArmy: number[] | Pick<Army, 'soldiers' | 'cavalry'>): number {
  const { SOLDIER_V, SOLDIER_K } = BALANCE.pp

  // Accept either a raw tier array or an Army-shaped object
  const tierCounts: number[] = Array.isArray(soldiersByTierOrArmy)
    ? soldiersByTierOrArmy
    : [soldiersByTierOrArmy.soldiers, soldiersByTierOrArmy.cavalry]

  return tierCounts.reduce((sum, count, index) => {
    const tier      = index + 1  // tier is 1-indexed
    const tierValue = SOLDIER_V * Math.pow(SOLDIER_K, tier - 1)
    return sum + count * tierValue
  }, 0)
}

/**
 * EquipScore = Σ(attackWeapon_count × EQUIPMENT_PP[weapon])   ← additive per unit
 *           + Σ(defenseItem_owned  ? EQUIPMENT_PP[item] : 0)  ← binary per item
 *           + Σ(spyItem_owned      ? EQUIPMENT_PP[item] : 0)  ← binary
 *           + Σ(scoutItem_owned    ? EQUIPMENT_PP[item] : 0)  ← binary
 */
function calcEquipScore(weapons: Weapons): number {
  const { EQUIPMENT_PP } = BALANCE.pp

  const attackScore =
    weapons.crude_club   * EQUIPMENT_PP.crude_club   +
    weapons.slingshot    * EQUIPMENT_PP.slingshot    +
    weapons.boomerang    * EQUIPMENT_PP.boomerang    +
    weapons.pirate_knife * EQUIPMENT_PP.pirate_knife +
    weapons.axe          * EQUIPMENT_PP.axe          +
    weapons.master_knife * EQUIPMENT_PP.master_knife +
    weapons.knight_axe   * EQUIPMENT_PP.knight_axe   +
    weapons.iron_ball    * EQUIPMENT_PP.iron_ball    +
    weapons.battle_axe   * EQUIPMENT_PP.battle_axe   +
    weapons.war_hammer   * EQUIPMENT_PP.war_hammer   +
    weapons.dragon_sword * EQUIPMENT_PP.dragon_sword

  const defenseScore =
    (weapons.wooden_buckler  > 0 ? EQUIPMENT_PP.wooden_buckler  : 0) +
    (weapons.wood_shield     > 0 ? EQUIPMENT_PP.wood_shield     : 0) +
    (weapons.iron_shield     > 0 ? EQUIPMENT_PP.iron_shield     : 0) +
    (weapons.leather_armor   > 0 ? EQUIPMENT_PP.leather_armor   : 0) +
    (weapons.chain_armor     > 0 ? EQUIPMENT_PP.chain_armor     : 0) +
    (weapons.plate_armor     > 0 ? EQUIPMENT_PP.plate_armor     : 0) +
    (weapons.mithril_armor   > 0 ? EQUIPMENT_PP.mithril_armor   : 0) +
    (weapons.gods_armor      > 0 ? EQUIPMENT_PP.gods_armor      : 0) +
    (weapons.shadow_armor    > 0 ? EQUIPMENT_PP.shadow_armor    : 0) +
    (weapons.void_armor      > 0 ? EQUIPMENT_PP.void_armor      : 0) +
    (weapons.celestial_armor > 0 ? EQUIPMENT_PP.celestial_armor : 0)

  const spyGearScore =
    (weapons.spy_hood       > 0 ? EQUIPMENT_PP.spy_hood       : 0) +
    (weapons.shadow_cloak   > 0 ? EQUIPMENT_PP.shadow_cloak   : 0) +
    (weapons.dark_mask      > 0 ? EQUIPMENT_PP.dark_mask      : 0) +
    (weapons.elven_gear     > 0 ? EQUIPMENT_PP.elven_gear     : 0) +
    (weapons.mystic_cloak   > 0 ? EQUIPMENT_PP.mystic_cloak   : 0) +
    (weapons.shadow_veil    > 0 ? EQUIPMENT_PP.shadow_veil    : 0) +
    (weapons.phantom_shroud > 0 ? EQUIPMENT_PP.phantom_shroud : 0) +
    (weapons.arcane_veil    > 0 ? EQUIPMENT_PP.arcane_veil    : 0)

  const scoutGearScore =
    (weapons.scout_cap      > 0 ? EQUIPMENT_PP.scout_cap      : 0) +
    (weapons.scout_boots    > 0 ? EQUIPMENT_PP.scout_boots    : 0) +
    (weapons.scout_cloak    > 0 ? EQUIPMENT_PP.scout_cloak    : 0) +
    (weapons.elven_boots    > 0 ? EQUIPMENT_PP.elven_boots    : 0) +
    (weapons.swift_boots    > 0 ? EQUIPMENT_PP.swift_boots    : 0) +
    (weapons.shadow_steps   > 0 ? EQUIPMENT_PP.shadow_steps   : 0) +
    (weapons.phantom_stride > 0 ? EQUIPMENT_PP.phantom_stride : 0) +
    (weapons.arcane_lens    > 0 ? EQUIPMENT_PP.arcane_lens    : 0)

  return attackScore + defenseScore + spyGearScore + scoutGearScore
}

/**
 * SkillScore = Σ(Level[skill] × SKILL_PP[skill])
 */
function calcSkillScore(training: Training): number {
  const { SKILL_PP } = BALANCE.pp
  return (
    training.attack_level  * SKILL_PP.attack  +
    training.defense_level * SKILL_PP.defense +
    training.spy_level     * SKILL_PP.spy     +
    training.scout_level   * SKILL_PP.scout
  )
}

/**
 * DevScore_raw = Σ(Level[dev] × DEVELOPMENT_PP[dev])
 * Applied as: min(DevScore_raw, DEV_CAP) inside calculatePersonalPower.
 */
function calcDevScore(development: Development): number {
  const { DEVELOPMENT_PP } = BALANCE.pp
  return (
    development.gold_level          * DEVELOPMENT_PP.gold          +
    development.food_level          * DEVELOPMENT_PP.food          +
    development.wood_level          * DEVELOPMENT_PP.wood          +
    development.iron_level          * DEVELOPMENT_PP.iron          +
    development.population_level    * DEVELOPMENT_PP.population    +
    development.fortification_level * DEVELOPMENT_PP.fortification
  )
}

/**
 * SpyScore = (spies × SPY_UNIT_VALUE) + (scouts × SCOUT_UNIT_VALUE)
 */
function calcSpyScore(army: Pick<Army, 'spies' | 'scouts'>): number {
  return (
    army.spies  * BALANCE.pp.SPY_UNIT_VALUE   +
    army.scouts * BALANCE.pp.SCOUT_UNIT_VALUE
  )
}

// ─────────────────────────────────────────
// B. CLAN COMBAT BONUS
// ─────────────────────────────────────────

/**
 * ClanBonus_raw = TotalClanPP × EfficiencyRate(devLevel)
 * ClanBonus     = min(ClanBonus_raw, 0.20 × PlayerPP)
 *
 * Rules:
 *   - Additive only. Never multiplied by Hero.
 *   - Affects: attack, defense, spy, scout during combat only.
 *   - Never affects: loot, economy, PP, ranking.
 *   - Returns 0 if clan is null (clanless player).
 */
export function calculateClanBonus(playerPP: number, clan: ClanContext | null): number {
  if (!clan) return 0

  const efficiencyRate = BALANCE.clan.EFFICIENCY[clan.developmentLevel as ClanDevLevel]
  if (!efficiencyRate) return 0

  const raw = clan.totalClanPP * efficiencyRate
  const cap = BALANCE.clan.BONUS_CAP_RATE * playerPP

  return Math.floor(Math.min(raw, cap))
}

type ClanDevLevel = 1 | 2 | 3 | 4 | 5

// ─────────────────────────────────────────
// C. EFFECTIVE COMBAT POWER (ECP)
// ─────────────────────────────────────────

/**
 * Order of operations (mandatory):
 *   Step 1: ClanBonus = min(TotalClanPP × EfficiencyRate, 0.20 × PlayerPP)
 *   Step 2: ECP = (PlayerPP × (1 + heroBonus) × (1 + raceBonus)) + ClanBonus
 *
 * heroBonus is the pre-clamped total from active hero effects (0 – 0.50).
 * raceBonus is the race-specific combat multiplier (not clamped).
 * Both multiply ONLY PlayerPP — never ClanBonus.
 * This prevents the monetization lever (hero) and race bonus from amplifying the social mechanic (clan).
 *
 * @param heroBonus Pre-clamped TotalAttackBonus or TotalDefenseBonus (0 – 0.50). Default 0.
 * @param raceBonus Race combat multiplier (e.g. orc attack 0.10). Default 0.
 */
export function calculateECP(
  playerPP:  number,
  clan:      ClanContext | null,
  heroBonus: number = 0,
  raceBonus: number = 0,
): number {
  // Defensive clamp: guard against callers that forgot to clamp before passing in.
  // Callers are still expected to pre-clamp via clampBonus(); this is a server-side
  // safety net only — valid values (0 – 0.50) are never modified by this step.
  heroBonus = clampBonus(heroBonus)

  const clanBonus = calculateClanBonus(playerPP, clan)
  return Math.floor((playerPP * (1 + heroBonus) * (1 + raceBonus)) + clanBonus)
}

// ─────────────────────────────────────────
// E. COMBAT RATIO & OUTCOME
// ─────────────────────────────────────────

/**
 * R = AttackerECP / DefenderECP
 * DefenderECP = 0 → ratio treated as WIN_THRESHOLD + 1 (automatic win).
 */
export function calculateCombatRatio(attackerECP: number, defenderECP: number): number {
  if (defenderECP <= 0) return BALANCE.combat.WIN_THRESHOLD + 1
  return attackerECP / defenderECP
}

/**
 * Binary outcome — no draw/partial.
 * R ≥ WIN_THRESHOLD (1.0) → 'win'  (attacker at least as strong as defender)
 * R <  WIN_THRESHOLD      → 'loss'
 */
export function determineCombatOutcome(ratio: number): CombatOutcome {
  if (ratio >= BALANCE.combat.WIN_THRESHOLD) return 'win'
  return 'loss'
}

// ─────────────────────────────────────────
// F. SOLDIER LOSSES
// ─────────────────────────────────────────

/**
 * DefenderLossRate = clamp(BASE_LOSS × R, DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)
 * AttackerLossRate = clamp(BASE_LOSS / R, ATTACKER_FLOOR,       MAX_LOSS_RATE)
 *
 * killed_soldiers_attacker = floor(deployedSoldiers  × AttackerLossRate)
 * killed_soldiers_defender = floor(defenderSoldiers  × DefenderLossRate)
 *
 * Guarantees:
 *   - Neither side ever exceeds MAX_LOSS_RATE (30%) per battle.
 *   - Attacker always loses ≥ ATTACKER_FLOOR (never zero-cost attack).
 *   - Defender bleeds ≥ DEFENDER_BLEED_FLOOR even from a far-weaker attacker.
 *
 * Protection & cooldown flags:
 *   killCooldownActive   → defenderLosses = 0 (attacker still loses normally)
 *   defenderIsProtected  → defenderLosses = 0
 *   attackerIsProtected  → attackerLosses = 0 (attacker still pays turns + food)
 *
 * Losses apply to deployed soldiers only, not total army.
 */
export function calculateSoldierLosses(
  deployedSoldiers:    number,
  defenderSoldiers:    number,
  ratio:               number,
  killCooldownActive:  boolean,
  attackerIsProtected: boolean,
  defenderIsProtected: boolean,
): SoldierLossResult {
  const { BASE_LOSS, MAX_LOSS_RATE, DEFENDER_BLEED_FLOOR, ATTACKER_FLOOR } = BALANCE.combat

  const rawAttackerRate  = BASE_LOSS / Math.max(ratio, 0.01)
  const attackerLossRate = attackerIsProtected
    ? 0
    : clamp(rawAttackerRate, ATTACKER_FLOOR, MAX_LOSS_RATE)

  const rawDefenderRate  = BASE_LOSS * ratio
  const defenderLossRate = (killCooldownActive || defenderIsProtected)
    ? 0
    : clamp(rawDefenderRate, DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)

  return {
    attackerLosses: Math.floor(deployedSoldiers * attackerLossRate),
    defenderLosses: Math.floor(defenderSoldiers * defenderLossRate),
  }
}

// ─────────────────────────────────────────
// F2. CAPTIVES
// ─────────────────────────────────────────

/**
 * captives = floor(defenderLosses × CAPTURE_RATE)
 *
 * Call this AFTER resolving defenderLosses (post-shield/protection/cooldown).
 * Returns 0 whenever defenderLosses is 0 (kill cooldown / shields / protection
 * all zero out defenderLosses, which automatically zeros captives too).
 *
 * Captives are added to attacker army.slaves and recorded as `slaves_taken`
 * in the attacks table by the attack_resolve_apply RPC.
 */
export function calculateCaptives(defenderLosses: number): number {
  return Math.floor(defenderLosses * BALANCE.combat.CAPTURE_RATE)
}

// ─────────────────────────────────────────
// G. KILL COOLDOWN CHECK
// ─────────────────────────────────────────

/**
 * Returns true if the kill cooldown is still active for (attacker → target).
 * lastKillAt is the timestamp of the last attack where defenderLosses > 0.
 * When active: defenderLosses = 0 in combat, loot still applies.
 */
export function isKillCooldownActive(lastKillAt: Date | null, now: Date = new Date()): boolean {
  if (!lastKillAt) return false
  const elapsedMs  = now.getTime() - lastKillAt.getTime()
  const cooldownMs = BALANCE.combat.KILL_COOLDOWN_HOURS * 60 * 60 * 1000
  return elapsedMs < cooldownMs
}

// ─────────────────────────────────────────
// I. NEW PLAYER PROTECTION CHECK
// ─────────────────────────────────────────

/**
 * Returns true if the player is within the new-player protection window,
 * subject to the season protection gate.
 *
 * Season gate: protection is DISABLED for the first SEASON_PROTECTION_START_DAYS
 * days of a season, so early-season PVP is fully live. After the gate opens,
 * the normal PROTECTION_HOURS window applies per-player from their created_at.
 *
 * Protection does NOT block attacks.
 * When defenderIsProtected: loot = 0, defenderLosses = 0.
 * When attackerIsProtected: attackerLosses = 0.
 * Attacker always pays turns + food.
 *
 * @param playerCreatedAt  When the player account was created.
 * @param seasonStartedAt  When the active season started (seasons.starts_at).
 * @param now              Defaults to current time; injectable for testing.
 */
export function isNewPlayerProtected(
  playerCreatedAt:  Date,
  seasonStartedAt:  Date,
  now:              Date = new Date(),
): boolean {
  // Season gate: no protection during the first N days of a new season.
  const gateMs = BALANCE.season.protectionStartDays * 24 * 60 * 60 * 1000
  if (now.getTime() - seasonStartedAt.getTime() < gateMs) return false

  // Gate is open — apply the per-player protection window.
  const elapsedMs    = now.getTime() - playerCreatedAt.getTime()
  const protectionMs = BALANCE.combat.PROTECTION_HOURS * 60 * 60 * 1000
  return elapsedMs < protectionMs
}

// ─────────────────────────────────────────
// J. LOOT DECAY
// ─────────────────────────────────────────

/**
 * Returns the decay multiplier for this attack based on how many times
 * the attacker has attacked this specific target within DECAY_WINDOW_HOURS.
 *
 * attackCountInWindow must include the current attack (minimum 1).
 *
 *   1st  → 1.00 | 2nd → 0.70 | 3rd → 0.40 | 4th → 0.20 | 5th+ → 0.10
 */
export function getLootDecayMultiplier(attackCountInWindow: number): number {
  const steps = BALANCE.antiFarm.LOOT_DECAY_STEPS
  const index = Math.min(attackCountInWindow - 1, steps.length - 1)
  return steps[Math.max(0, index)]
}

// ─────────────────────────────────────────
// K. LOOT CALCULATION
// ─────────────────────────────────────────

/**
 * BaseLoot[r]  = Unbanked[r] × BASE_LOOT_RATE      (0.10)
 * FinalLoot[r] = BaseLoot[r] × OutcomeMultiplier × DecayFactor
 *
 * OutcomeMultiplier: win=1.0, loss=0.0
 * No hard cap. No power-gap block. City restriction is the access limiter.
 *
 * Returns zero loot if outcome is 'loss' or defender is protected.
 */
export function calculateLoot(
  unbanked:            UnbankedResources,
  outcome:             CombatOutcome,
  attackCountInWindow: number,
  defenderIsProtected: boolean,
): UnbankedResources {
  if (defenderIsProtected || outcome === 'loss') {
    return { gold: 0, iron: 0, wood: 0, food: 0 }
  }

  const outcomeMult = BALANCE.combat.LOOT_OUTCOME_MULTIPLIER[outcome]
  const decayFactor = getLootDecayMultiplier(attackCountInWindow)
  const totalMult   = BALANCE.combat.BASE_LOOT_RATE * outcomeMult * decayFactor

  return {
    gold: Math.floor(unbanked.gold * totalMult),
    iron: Math.floor(unbanked.iron * totalMult),
    wood: Math.floor(unbanked.wood * totalMult),
    food: Math.floor(unbanked.food * totalMult),
  }
}

// ─────────────────────────────────────────
// M. TURN REGEN
// ─────────────────────────────────────────

/**
 * new_turns = min(current_turns + 3, 200)
 * Regen only occurs when current_turns < MAX_TURNS.
 *
 * @deprecated The tick system uses calcTurnsToAdd(currentTurns, isVacation) in
 * lib/game/tick.ts, which applies the vacation multiplier and Math.ceil.
 * This function models the non-vacation case only and is not called by any live path.
 */
export function calcTurnsAfterRegen(currentTurns: number): number {
  if (currentTurns >= BALANCE.tick.maxTurns) return BALANCE.tick.maxTurns
  return Math.min(currentTurns + BALANCE.tick.turnsPerTick, BALANCE.tick.maxTurns)
}

// ─────────────────────────────────────────
// N. FULL COMBAT RESOLVER
// ─────────────────────────────────────────

/**
 * Orchestrates a full combat resolution in the correct order of operations.
 * PP values must be pre-computed by the caller via calculatePersonalPower().
 *
 * The API route (caller) is responsible for:
 *   - Gate checks (same clan, same city, sufficient turns/food)
 *   - NOT blocking attacks due to protection — protection is a flag here
 *   - Querying attackCountInWindow and lastKillAt from the DB
 *   - Writing results back to the DB
 *   - Triggering PP recalculation after soldier count changes
 */
export function resolveCombat(inputs: CombatResolutionInputs): CombatResolutionResult {
  // Step 1: ECP = (PP × (1 + heroBonus) × (1 + raceBonus)) + ClanBonus
  // Then apply tribe combat multiplier on top.
  // Neither hero nor race bonus nor tribe multiplier touches ClanBonus.
  const baseAttackerECP = calculateECP(
    inputs.attackerPP, inputs.attackerClan, inputs.attackBonus, inputs.attackerRaceBonus ?? 0,
  )
  const baseDefenderECP = calculateECP(
    inputs.defenderPP, inputs.defenderClan, inputs.defenseBonus, inputs.defenderRaceBonus ?? 0,
  )
  const attackerECP = Math.floor(baseAttackerECP * (inputs.attackerTribeMultiplier ?? 1))
  const defenderECP = Math.floor(baseDefenderECP * (inputs.defenderTribeMultiplier ?? 1))

  // Step 2: Ratio → outcome
  const ratio   = calculateCombatRatio(attackerECP, defenderECP)
  const outcome = determineCombatOutcome(ratio)

  // Step 3: Soldier losses
  const losses = calculateSoldierLosses(
    inputs.deployedSoldiers,
    inputs.defenderSoldiers,
    ratio,
    inputs.killCooldownActive,
    inputs.attackerIsProtected,
    inputs.defenderIsProtected,
  )

  // Step 4: Soldier Shield — zeroes defender losses (applied after loss calculation)
  const defenderLosses = (inputs.soldierShieldActive || inputs.defenderIsProtected || inputs.killCooldownActive)
    ? 0
    : losses.defenderLosses

  // Step 5: Loot calculation
  const rawLoot = calculateLoot(
    inputs.defenderUnbanked,
    outcome,
    inputs.attackCountInWindow,
    inputs.defenderIsProtected,
  )

  // Step 6: Resource Shield — zeroes all loot (applied after loot calculation)
  const ZERO_LOOT = { gold: 0, iron: 0, wood: 0, food: 0 }
  const loot = inputs.resourceShieldActive ? ZERO_LOOT : rawLoot

  return {
    outcome,
    ratio,
    baseAttackerECP,
    baseDefenderECP,
    attackerECP,
    defenderECP,
    attackerLosses: losses.attackerLosses,
    defenderLosses,
    loot,
  }
}

// ─────────────────────────────────────────
// PRIVATE UTILITIES
// ─────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
