/**
 * Domiron v5 — Balance Configuration
 *
 * SINGLE SOURCE OF TRUTH for all game constants.
 *
 * Annotation key:
 *   [FIXED]              — Confirmed by design spec. Do not change without GDD update.
 *   [TUNE]               — Value confirmed as needed; exact number set during balance phase.
 *   [TUNE: placeholder]  — Placeholder value used for structural/test purposes.
 *                          Replace with tuned value before production.
 *   [TUNE: unassigned]   — No default. Must be explicitly assigned before this
 *                          constant can be used in production logic.
 *
 * Import rule:
 *   All game logic imports from '@/lib/game/balance' (barrel re-export).
 *   Never hardcode these values in API routes or components.
 */

// ─────────────────────────────────────────
// AUXILIARY TYPES
// ─────────────────────────────────────────

export type ClanDevLevel = 1 | 2 | 3 | 4 | 5;

// ─────────────────────────────────────────
// MAIN CONFIG EXPORT
// ─────────────────────────────────────────

export const BALANCE = {
  // ═══════════════════════════════════════
  // TICK SYSTEM
  // ═══════════════════════════════════════
  tick: {
    intervalMinutes: 30, // [FIXED] Vercel Cron runs every 30 min
    turnsPerTick: 3, // [FIXED] +3 turns added per tick
    maxTurns: 200, // [FIXED] Hard cap — regen stops at this value
    turnsPerDay: 144, // [FIXED] 3 × 48 ticks. Informational; do not use in formulas.
  },

  // ═══════════════════════════════════════
  // STARTING RESOURCES (new player)
  // ═══════════════════════════════════════
  startingResources: {
    gold: 5000, // [TUNE]
    iron: 5000, // [TUNE]
    wood: 5000, // [TUNE]
    food: 5000, // [TUNE]
    turns: 50, // [TUNE] Start below cap so regen is immediately visible
    startingPopulation: 50, // [TUNE] Free population every new player begins with
  },

  // ═══════════════════════════════════════
  // PERSONAL POWER (PP) WEIGHTS & SUB-SCORE VALUES
  //
  // PP = (SoldierScore          × W_SOLDIERS)
  //    + (EquipScore            × W_EQUIPMENT)
  //    + (SkillScore            × W_SKILLS)
  //    + (min(DevScore, DEV_CAP) × W_DEVELOPMENT)
  //    + (SpyScore              × W_SPY)
  //
  // Target distribution at mid-season balanced player:
  //   Soldiers ~45% | Equipment ~25% | Skills ~15% | Dev ~10% | Spy ~5%
  // ═══════════════════════════════════════
  pp: {
    // Component weights [TUNE: placeholder] — tune until distribution matches targets
    W_SOLDIERS: 1.0,
    W_EQUIPMENT: 1.0,
    W_SKILLS: 1.0,
    W_DEVELOPMENT: 1.0,
    W_SPY: 1.0,

    // Hard cap on DevScore before weight multiplication [TUNE: placeholder]
    DEV_CAP: 10_000,

    // ── Soldier tier formula parameters ───────────────────
    //
    // TierValue[tier] = SOLDIER_V × SOLDIER_K ^ (tier - 1)
    //
    // SoldierScore = Σ Count[tier] × TierValue[tier]
    //
    // Tier → unit column mapping (current DB schema):
    //   Tier 1 → army.soldiers
    //   Tier 2 → army.cavalry  (tier assignment pending final design decision)
    //
    // Future tier columns (e.g. elite soldiers) require DB schema extension.
    //
    SOLDIER_V: 1, // [TUNE: placeholder] Base PP value for a Tier 1 soldier
    SOLDIER_K: 3, // [TUNE: placeholder] Inter-tier multiplier (must be > 1)
    //
    // Tuning guide:
    //   At SOLDIER_V=1, SOLDIER_K=3:
    //     Tier 1 value = 1, Tier 2 value = 3, Tier 3 value = 9, Tier 4 value = 27
    //   Adjust SOLDIER_K so that upgrading tiers feels meaningful but lower tiers
    //   remain useful as an army base (target k ≈ 2.5–3).

    // ── Equipment PP values ────────────────────────────────
    // These are RANKING contributions — separate from combat power.
    // Attack weapons: additive per unit. Defense/Spy/Scout gear: binary.
    EQUIPMENT_PP: {
      // Attack weapons — PP per unit owned (additive)
      slingshot: 2, // [TUNE]
      boomerang: 5, // [TUNE]
      pirate_knife: 12, // [TUNE]
      axe: 28, // [TUNE]
      master_knife: 64, // [TUNE]
      knight_axe: 148, // [TUNE]
      iron_ball: 340, // [TUNE]
      // Defense equipment — PP granted once if count > 0 (binary)
      wood_shield: 150, // [TUNE]
      iron_shield: 800, // [TUNE]
      leather_armor: 2_500, // [TUNE]
      chain_armor: 8_000, // [TUNE]
      plate_armor: 25_000, // [TUNE]
      mithril_armor: 70_000, // [TUNE]
      gods_armor: 150_000, // [TUNE]
      // Spy gear — binary
      shadow_cloak: 500, // [TUNE]
      dark_mask: 2_000, // [TUNE]
      elven_gear: 8_000, // [TUNE]
      // Scout gear — binary
      scout_boots: 500, // [TUNE]
      scout_cloak: 2_000, // [TUNE]
      elven_boots: 8_000, // [TUNE]
    },

    // ── Skill PP values — per training level ──────────────
    SKILL_PP: {
      attack: 100, // [TUNE]
      defense: 100, // [TUNE]
      spy: 80, // [TUNE]
      scout: 80, // [TUNE]
    },

    // ── Development PP values — per level ─────────────────
    DEVELOPMENT_PP: {
      gold: 50, // [TUNE]
      food: 50, // [TUNE]
      wood: 50, // [TUNE]
      iron: 50, // [TUNE]
      population: 75, // [TUNE]
      fortification: 100, // [TUNE]
    },

    // ── Spy/Scout unit PP values ───────────────────────────
    // Keep low to maintain ~5% total PP contribution.
    SPY_UNIT_VALUE: 5, // [TUNE]
    SCOUT_UNIT_VALUE: 5, // [TUNE]

    // ── Spy/Scout gear power multipliers (used in power.ts) ───
    // Applied multiplicatively to spy/scout unit count.
    // Each piece stacks: e.g. shadow_cloak + dark_mask → ×1.15 × ×1.30.
    SPY_GEAR_MULT: {
      shadow_cloak: 1.15, // [TUNE]
      dark_mask: 1.3, // [TUNE]
      elven_gear: 1.5, // [TUNE]
    } as Record<string, number>,

    SCOUT_GEAR_MULT: {
      scout_boots: 1.15, // [TUNE]
      scout_cloak: 1.3, // [TUNE]
      elven_boots: 1.5, // [TUNE]
    } as Record<string, number>,

    // Fortification defense multiplier per level above 1.
    // powerDefense × (1 + (fortification_level - 1) × FORTIFICATION_MULT_PER_LEVEL)
    FORTIFICATION_MULT_PER_LEVEL: 0.1, // [TUNE]
  },

  // ═══════════════════════════════════════
  // CLAN SYSTEM
  // ═══════════════════════════════════════
  clan: {
    maxMembers: 20, // [FIXED]
    BONUS_CAP_RATE: 0.2, // [FIXED] ClanBonus ≤ 0.20 × PlayerPP
    postMigrationCooldownHours: 48, // [FIXED]
    normalLeaveCooldownMinutes: 10, // [FIXED]

    // Clan combat efficiency per development level.
    // Clans start at Level 1 automatically (no Level 0 in play).
    // ClanBonus_raw = TotalClanPP × EFFICIENCY[devLevel]
    EFFICIENCY: {
      1: 0.05, // [FIXED]
      2: 0.08, // [FIXED]
      3: 0.1, // [FIXED]
      4: 0.12, // [FIXED]
      5: 0.15, // [FIXED]
    } as Record<ClanDevLevel, number>,
  },

  // ═══════════════════════════════════════
  // HERO SYSTEM
  //
  // Hero is the sole monetization lever. All temporary power modifiers
  // flow through the Hero system. Hero never modifies PP, clan cap,
  // loss cap, loot base rate, kill cooldown, or turn regen.
  //
  // Hero modifies only:
  //   (a) ECP — via temporary attack/defense effect boosts
  //   (b) Slave production — via temporary slave output boosts
  //   (c) Combat resolution — via Resource Shield and Soldier Shield
  //
  // ECP formula with hero effects:
  //   AttackerECP = (AttackerPP × (1 + TotalAttackBonus)) + AttackerClanBonus
  //   DefenderECP = (DefenderPP × (1 + TotalDefenseBonus)) + DefenderClanBonus
  //
  // Hero NEVER multiplies ClanBonus.
  // ═══════════════════════════════════════
  hero: {
    xpPerLevel: 100, // [TUNE] XP needed per level (used by Hero page progress bar)

    manaPerTick: {
      base: 1,
      level10bonus: 1,
      level50bonus: 1,
      vipBonus: 1, // [TUNE]
    },

    // ── Hero Effect System ─────────────────────────────────────────────────
    //
    // Temporary effects purchased through the Hero system.
    // Effects are stored in the player_hero_effects table.
    // Active query: WHERE player_id = $1 AND ends_at > now()
    //
    // Stack rule: multiple effects of the same category are additive,
    // capped at MAX_STACK_RATE per category. Clamping is server-side only.
    //
    // Shield model: 23h active → 1h vulnerability cooldown.
    // Expiration timer visible only to the owner (Hero page).
    // Other players must NOT see shield expiration time.

    MAX_STACK_RATE: 0.5, // [FIXED] Hard cap on any single bonus category

    EFFECT_RATES: {
      SLAVE_OUTPUT_10: 0.1, // [FIXED] +10% slave production per tick
      SLAVE_OUTPUT_20: 0.2, // [FIXED] +20% slave production per tick
      SLAVE_OUTPUT_30: 0.3, // [FIXED] +30% slave production per tick
      ATTACK_POWER_10: 0.1, // [FIXED] +10% attacker PP (never multiplies ClanBonus)
      DEFENSE_POWER_10: 0.1, // [FIXED] +10% defender PP (never multiplies ClanBonus)
    } as const,

    SHIELD_ACTIVE_HOURS: 23, // [FIXED] Duration of shield protection
    SHIELD_COOLDOWN_HOURS: 1, // [FIXED] Vulnerability window before next shield can start

    // Mana cost per shield type — flat keys, accessed as BALANCE.hero.SOLDIER_SHIELD_MANA
    SOLDIER_SHIELD_MANA: 10, // [TUNE]
    RESOURCE_SHIELD_MANA: 10, // [TUNE]
  },

  // ═══════════════════════════════════════
  // COMBAT RESOLUTION
  //
  // R = AttackerECP / DefenderECP
  //
  // ECP = (PlayerPP × (1 + HeroBonus)) + ClanBonus
  //   HeroBonus = TotalAttackBonus or TotalDefenseBonus from active hero effects
  //
  // Outcome (binary — no draw):
  //   R ≥ WIN_THRESHOLD → win  (attacker gets full loot)
  //   R <  WIN_THRESHOLD → loss (attacker gets no loot)
  //
  // WIN_THRESHOLD = 1.0: attacker must be at least as strong as defender to win.
  //
  // BEGINNER PROTECTION NOTE:
  //   Attacks on protected players are NEVER blocked.
  //   Protection is a flag applied inside combat resolution:
  //     defenderIsProtected → defenderLosses = 0, loot = 0
  //     attackerIsProtected → attackerLosses = 0
  //   The attacker always pays turns + food regardless of protection.
  // ═══════════════════════════════════════
  combat: {
    // Outcome threshold [FIXED] — binary win/loss, no partial/draw
    WIN_THRESHOLD: 1.0, // [FIXED] R >= 1.0 → win; R < 1.0 → loss

    // Soldier loss rates [TUNE]
    BASE_LOSS: 0.15, // [TUNE: placeholder] Loss rate at R = 1.0
    MAX_LOSS_RATE: 0.3, // [FIXED] Hard cap — never lose more than 30%
    DEFENDER_BLEED_FLOOR: 0.05, // [TUNE] Minimum defender loss even from weak attacker
    ATTACKER_FLOOR: 0.03, // [TUNE] Attacker always loses at least this fraction

    // Loot
    BASE_LOOT_RATE: 0.2, // [FIXED] 20% of each unbanked resource

    LOOT_OUTCOME_MULTIPLIER: {
      win: 1.0,
      loss: 0.0,
    } as const,

    // Cavalry tier multiplier (Tier 2 relative to Tier 1)
    cavalryMultiplier: 2, // [TUNE]

    // Attack cost
    MIN_TURNS_PER_ATTACK: 1, // [FIXED]
    MAX_TURNS_PER_ATTACK: 10, // [FIXED]

    // food_cost = deployed_soldiers × FOOD_PER_SOLDIER × turns_used
    // Single formula used everywhere (server + UI).
    FOOD_PER_SOLDIER: 0.05, // [TUNE] food per soldier per turn

    // Kill cooldown — per (attacker_id → target_id) pair
    // Checked against the `attacks` table (NOT player_hero_effects).
    // Cooldown fires when attacker has any row with defender_losses > 0 for this target within 6h.
    KILL_COOLDOWN_HOURS: 6, // [FIXED]

    // Captives: fraction of killed defender soldiers that become attacker slaves (army.slaves).
    // Applied only when defenderLosses > 0 (kill cooldown / shields / protection bypass this).
    CAPTURE_RATE: 0.1, // [TUNE] 10% of killed defender soldiers become captives

    // New player protection window
    // Protection does NOT block attacks — see note above.
    PROTECTION_HOURS: 24, // [FIXED]
  },

  // ═══════════════════════════════════════
  // ANTI-FARM / LOOT DECAY
  // ═══════════════════════════════════════
  antiFarm: {
    DECAY_WINDOW_HOURS: 12, // [FIXED]

    // LOOT_DECAY_STEPS[attackNumber - 1], clamped to last entry for 5+.
    // 1st → 1.0 | 2nd → 0.70 | 3rd → 0.40 | 4th → 0.20 | 5th+ → 0.10
    LOOT_DECAY_STEPS: [1.0, 0.7, 0.4, 0.2, 0.1] as const,
  },

  // ═══════════════════════════════════════
  // BANK
  // ═══════════════════════════════════════
  bank: {
    maxLifetimeDeposits: 5, // [FIXED] Total deposits across account lifetime
    theftProtection: 1.0, // [FIXED] 100% of banked gold is safe

    // Interest by level: floor(bankedGold × INTEREST_RATE_BY_LEVEL[interest_level])
    // Applied once per calendar day when the tick crosses midnight.
    // Level 0 → 0% (default for all new players, no interest until upgraded).
    // Levels 1–10 are upgrade-gated via POST /api/bank/upgrade.
    // Must remain monotonically non-decreasing — validated at boot by balance-validate.ts.
    INTEREST_RATE_BY_LEVEL: {
      0: 0.0,    // [FIXED] Default — no interest
      1: 0.005,  // [TUNE]  0.5 %
      2: 0.0075, // [TUNE]  0.75 %
      3: 0.01,   // [TUNE]  1.0 %
      4: 0.0125, // [TUNE]  1.25 %
      5: 0.015,  // [TUNE]  1.5 %
      6: 0.0175, // [TUNE]  1.75 %
      7: 0.02,   // [TUNE]  2.0 %
      8: 0.0225, // [TUNE]  2.25 %
      9: 0.025,  // [TUNE]  2.5 %
      10: 0.03,  // [TUNE]  3.0 % — max tier reward
    } as Record<number, number>,
    MAX_INTEREST_LEVEL: 10, // [FIXED] — must equal highest key in INTEREST_RATE_BY_LEVEL

    upgradeBaseCost: 2_000, // [TUNE]

    // Deposit limits
    depositsPerDay: 5, // [TUNE] Max deposits per calendar day (resets at midnight)
    maxDepositPercent: 1.0, // [TUNE] Max fraction of gold on hand allowed per deposit
  },

  // ═══════════════════════════════════════
  // TRAINING & POPULATION
  // ═══════════════════════════════════════
  training: {
    unitCost: {
      soldier: { gold: 60, capacityCost: 1 }, // [TUNE]
      slave: { gold: 0, capacityCost: 0 }, // [FIXED] Free: converts pop → idle slave, no gold cost
      spy: { gold: 80, capacityCost: 1 }, // [TUNE]
      scout: { gold: 80, capacityCost: 1 }, // [TUNE]
      cavalry: { gold: 10_000, capacityCost: 2, popCost: 5 }, // [TUNE] 5 free_population per 1 cavalry — intentionally expensive late-game asset
    },

    // Set to false to instantly disable cavalry training across the whole game.
    // Existing cavalry in DB remains and still contributes to power; only new training is blocked.
    enableCavalry: true, // [TOGGLE]

    populationPerTick: {
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 8,
      7: 10,
      8: 14,
      9: 18,
      10: 23,
    } as Record<number, number>,

    advancedMultiplierPerLevel: 0.08, // [TUNE]
    advancedCost: { gold: 1500, food: 1500 }, // [TUNE]
    EXPONENTIAL_GROWTH_FLOOR: 10_000, // [TUNE]
    // NOTE: There is no capacity cap on combat units.
    // The players.capacity DB column is legacy — not used in any training gate.
    // Only constraints that remain: gold cost, free_population (consumed per unit).
    // Cavalry: costs 5 free_population per unit (popCost) + gold; no soldier requirement.
  },

  // ═══════════════════════════════════════
  // TRIBE SYSTEM — SPELLS, TAX, MANA
  //
  // V1 spells (tribe mana only — never personal mana):
  //   war_cry             — offensive ECP multiplier for tribe members
  //   tribe_shield        — defensive ECP multiplier for tribe members
  //   production_blessing — slave production multiplier for tribe members
  //   spy_veil            — scout defense multiplier (improves resistance to spying)
  //   battle_supply       — attack food cost reduction for tribe members
  //
  // taxLimits: per-city cap on daily gold tax (gold → leader personal gold).
  // taxCollectionHour: Israel local hour (0–23) at which taxes are auto-collected.
  // creationManaCost: personal mana (hero.mana) spent to found a tribe.
  // manaPerMemberPerTick: TRIBE mana added per tick per member (separate from personal mana).
  // ═══════════════════════════════════════
  tribe: {
    // Personal mana cost to create a tribe (deducted from hero.mana at creation)
    creationManaCost: 50, // [TUNE]

    // Hour of day (0–23) in Israel local time when daily gold taxes are auto-collected
    taxCollectionHour: 20, // [FIXED] 20:00 Israel time

    // V1 active spells — cost TRIBE mana, activated by leader or deputy
    spells: {
      war_cry: { manaCost: 40, durationHours: 4 }, // [TUNE]
      tribe_shield: { manaCost: 30, durationHours: 12 }, // [TUNE]
      production_blessing: { manaCost: 25, durationHours: 8 }, // [TUNE]
      spy_veil: { manaCost: 20, durationHours: 6 }, // [TUNE]
      battle_supply: { manaCost: 35, durationHours: 6 }, // [TUNE]
    } as Record<string, { manaCost: number; durationHours: number }>,

    // Multipliers/rates applied when each spell is active
    spellEffects: {
      war_cry: { combatMultiplier: 1.25 }, // [TUNE] attacker ECP ×1.25
      tribe_shield: { defenseMultiplier: 1.15 }, // [TUNE] defender ECP ×1.15
      production_blessing: { productionMultiplier: 1.2 }, // [TUNE] slave output ×1.20
      spy_veil: { scoutDefenseMultiplier: 1.3 }, // [TUNE] effective scout defense ×1.30
      battle_supply: { foodReduction: 0.25 }, // [TUNE] food cost for attacks −25%
    },

    taxLimits: {
      city1: 1_000, // [TUNE]
      city2: 2_500, // [TUNE]
      city3: 5_000, // [TUNE]
      city4: 10_000, // [TUNE]
      city5: 20_000, // [TUNE]
    } as Record<string, number>,

    // TRIBE mana regeneration per tick, per member (separate from personal hero.mana)
    manaPerMemberPerTick: 1, // [TUNE] e.g. 5 members → +5 tribe mana/tick

    // ── Tribe Level Upgrade ───────────────────────────────────────────────────
    //
    // Tribe level is a permanent, irreversible progression track (1 → 5).
    // Upgrades cost TRIBE MANA only. No gold. No automatic progression.
    // Authorized roles: leader or deputy.
    // Max level: 5 (same as clan.EFFICIENCY key range).
    //
    // Cost model: explicit lookup table per current level.
    // manaCostByLevel[N] = tribe mana required to go from level N to level N+1.
    //
    // To tune: change values below. Do NOT add keys beyond maxLevel-1.
    // The RPC (tribe_upgrade_level_apply) reads the cost passed from the API,
    // which computes it here. BALANCE is the single source of truth.
    //
    // Validated at boot by balance-validate.ts:
    //   - All keys 1..(maxLevel-1) must be present
    //   - All values must be positive integers
    levelUpgrade: {
      maxLevel: 5, // [FIXED] Tribe level cap — matches clan.EFFICIENCY key range

      // Cost in TRIBE MANA to upgrade from level N → level N+1
      manaCostByLevel: {
        1: 100,   // Level 1 → 2  [TUNE]
        2: 250,   // Level 2 → 3  [TUNE]
        3: 500,   // Level 3 → 4  [TUNE]
        4: 1000,  // Level 4 → 5  [TUNE]
      } as Record<number, number>,
    },
  },

  // ═══════════════════════════════════════
  // PRODUCTION (slave output per tick)
  // ═══════════════════════════════════════
  production: {
    baseMin: 1.0, // [TUNE]
    baseMax: 3.0, // [TUNE]
    // Per development-level offset added to both baseMin and baseMax.
    // devOffset = (devLevel - 1) × DEV_OFFSET_PER_LEVEL
    DEV_OFFSET_PER_LEVEL: 0.5, // [TUNE]

    developmentUpgradeCost: {
      level2:  { gold: 50,     resource: 50     }, // [TUNE]
      level3:  { gold: 250,    resource: 250    }, // [TUNE]
      level5:  { gold: 20_000, resource: 20_000 }, // [TUNE]
      level10: { gold: 75_000, resource: 75_000 }, // [TUNE]
    },
  },

  // ═══════════════════════════════════════
  // WEAPONS (combat power — separate from PP ranking values above)
  //
  // Pricing model (2026-03-07):
  //   Every weapon purchase costs ALL 4 resources equally.
  //   cost = { gold, iron, wood, food } — all values identical.
  //   This is intentional game design: forces economic trade-offs
  //   across all resource types simultaneously.
  //
  // Attack weapons: stackable (no max-per-player cap).
  //   cost is per-unit; multiply by amount for total.
  // Defense / Spy / Scout: one per player (enforced in API).
  //   buying again when owned > 0 is rejected.
  //
  // To tune: change cost values here only — API + UI read from this file.
  // ═══════════════════════════════════════
  weapons: {
    attack: {
      // cost: { gold, iron, wood, food } — per unit, all 4 equal [TUNE]
      slingshot:    { power: 2,   cost: { gold: 2_000,   iron: 2_000,   wood: 2_000,   food: 2_000   } },
      boomerang:    { power: 5,   cost: { gold: 4_000,   iron: 4_000,   wood: 4_000,   food: 4_000   } },
      pirate_knife: { power: 12,  cost: { gold: 8_000,   iron: 8_000,   wood: 8_000,   food: 8_000   } },
      axe:          { power: 28,  cost: { gold: 16_000,  iron: 16_000,  wood: 16_000,  food: 16_000  } },
      master_knife: { power: 64,  cost: { gold: 32_000,  iron: 32_000,  wood: 32_000,  food: 32_000  } },
      knight_axe:   { power: 148, cost: { gold: 64_000,  iron: 64_000,  wood: 64_000,  food: 64_000  } },
      iron_ball:    { power: 340, cost: { gold: 128_000, iron: 128_000, wood: 128_000, food: 128_000 } },
    },
    defense: {
      // one per player; cost: all 4 resources equally [TUNE]
      wood_shield:   { multiplier: 1.10, cost: { gold: 3_750,     iron: 3_750,     wood: 3_750,     food: 3_750     } },
      iron_shield:   { multiplier: 1.25, cost: { gold: 20_000,    iron: 20_000,    wood: 20_000,    food: 20_000    } },
      leather_armor: { multiplier: 1.40, cost: { gold: 62_500,    iron: 62_500,    wood: 62_500,    food: 62_500    } },
      chain_armor:   { multiplier: 1.55, cost: { gold: 200_000,   iron: 200_000,   wood: 200_000,   food: 200_000   } },
      plate_armor:   { multiplier: 1.70, cost: { gold: 625_000,   iron: 625_000,   wood: 625_000,   food: 625_000   } },
      mithril_armor: { multiplier: 1.90, cost: { gold: 1_750_000, iron: 1_750_000, wood: 1_750_000, food: 1_750_000 } },
      gods_armor:    { multiplier: 2.20, cost: { gold: 2_500_000, iron: 2_500_000, wood: 2_500_000, food: 2_500_000 } },
    },
    spy: {
      shadow_cloak: { cost: { gold: 12_500,  iron: 12_500,  wood: 12_500,  food: 12_500  } },
      dark_mask:    { cost: { gold: 50_000,  iron: 50_000,  wood: 50_000,  food: 50_000  } },
      elven_gear:   { cost: { gold: 200_000, iron: 200_000, wood: 200_000, food: 200_000 } },
    },
    scout: {
      scout_boots:  { cost: { gold: 12_500,  iron: 12_500,  wood: 12_500,  food: 12_500  } },
      scout_cloak:  { cost: { gold: 50_000,  iron: 50_000,  wood: 50_000,  food: 50_000  } },
      elven_boots:  { cost: { gold: 200_000, iron: 200_000, wood: 200_000, food: 200_000 } },
    },
    sellRefundPercent: 0.2,
  },

  // ═══════════════════════════════════════
  // CITIES
  //
  // 5 cities total. Promotion is sequential (1 → 2 → 3 → 4 → 5 only).
  // Player must leave tribe/clan before promoting.
  // Promotion is irreversible — no downgrade.
  // City affects ONLY slave production output (slaveProductionMultByCity).
  // ═══════════════════════════════════════
  cities: {
    total: 5, // [FIXED]
    maxCity: 5, // [FIXED]

    // ── Promotion requirements [TUNE] ────────────────────────────────────────
    // Soldiers + resources required to promote from City N-1 → N.
    // Must not be in a tribe/clan to promote (enforced in API).
    promotion: {
      // Equal-cost model (2026-03-07): all 4 resources cost the same per tier.
      // Single value per city — enforced at boot by balance-validate.ts.
      soldiersRequiredByCity: {
        2: 200,    // [TUNE]
        3: 800,    // [TUNE]
        4: 2_500,  // [TUNE]
        5: 7_500,  // [TUNE]
      } as Record<number, number>,
      resourceCostByCity: {
        2: { gold: 120_000,   iron: 120_000,   wood: 120_000,   food: 120_000   }, // [TUNE]
        3: { gold: 400_000,   iron: 400_000,   wood: 400_000,   food: 400_000   }, // [TUNE]
        4: { gold: 1_200_000, iron: 1_200_000, wood: 1_200_000, food: 1_200_000 }, // [TUNE]
        5: { gold: 3_000_000, iron: 3_000_000, wood: 3_000_000, food: 3_000_000 }, // [TUNE]
      } as Record<
        number,
        { gold: number; wood: number; iron: number; food: number }
      >,
    },

    // ── Slave production multiplier by city tier [TUNE] ──────────────────────
    // Applied ONLY to slave resource output each tick.
    // No effect on combat, power, loot, or bank.
    slaveProductionMultByCity: {
      1: 1.0,
      2: 1.3,
      3: 1.7,
      4: 2.2,
      5: 3.0,
    } as Record<number, number>,

    // ── Promotion threshold formula parameters [TUNE] ───────────────────────
    // These define the geometric-growth formula used to compute per-city
    // requirements programmatically (see lib/game/city-thresholds.ts):
    //
    //   soldiersRequired(city)  = floor(S_base × s_growth ^ (city-1))
    //   populationRequired(city) = floor(P_base × p_growth ^ (city-1))
    //   resourcesRequired(city) = floor(R_base × r_growth ^ (city-1))
    //
    // city=1 always equals the base values exactly (growth^0 = 1).
    // growth factors must be ≥ 1 (≥1 = monotonically non-decreasing).
    promotionThresholds: {
      S_base: 20, // [TUNE] Soldiers required at city tier 1
      P_base: 50, // [TUNE] Population required at city tier 1
      R_base: 2_000, // [TUNE] Gold-equivalent resources at city tier 1
      s_growth: 5, // [TUNE] Soldier multiplier per tier (≥ 1)
      p_growth: 2, // [TUNE] Population multiplier per tier (≥ 1)
      r_growth: 4, // [TUNE] Resource multiplier per tier (≥ 1)
    },

    // City names (display only)
    names: {
      1: "Winterfell",
      2: "King's Landing",
      3: "Dragonstone",
      4: "Highgarden",
      5: "Casterly Rock",
    } as Record<number, string>,
  },

  // ═══════════════════════════════════════
  // RACE BONUSES (combat only — NEVER affect PP or ranking)
  // ═══════════════════════════════════════
  raceBonuses: {
    orc: { attackBonus: 0.1, defenseBonus: 0.03 }, // [TUNE]
    human: { goldProductionBonus: 0.15, attackBonus: 0.03 }, // [TUNE]
    elf: { spyBonus: 0.2, scoutBonus: 0.2 }, // [TUNE]
    dwarf: { defenseBonus: 0.15, goldProductionBonus: 0.03 }, // [TUNE]
  },

  // ═══════════════════════════════════════
  // SEASON
  // ═══════════════════════════════════════
  season: {
    durationDays: 90, // [FIXED]
    hallOfFamePlayers: 20,
    hallOfFameTribes: 5,
    accountDeletionAfterInactiveSeasons: 3,
    vacationTurnsMultiplier: 0.33, // [TUNE]
    // Full reset at season end. Cosmetics only carry over.

    // New-player protection is disabled for the first N days of a season
    // so that early-season PVP is fully live without protection blocking loot.
    // After protectionStartDays, the normal PROTECTION_HOURS window applies.
    protectionStartDays: 10, // [FIXED]
  },

  // ═══════════════════════════════════════
  // VIP
  // ═══════════════════════════════════════
  vip: {
    productionMultiplier: 1.1, // [TUNE]
    weeklyTurnsBonus: 50, // [TUNE]
    bankInterestBonus: 0, // [TUNE: unassigned — expressed as additive rate]
    crystalCost: 500, // [TUNE]
  },

  // ═══════════════════════════════════════
  // SPY SYSTEM
  //
  // Spy missions compare Spy Power vs Scout Defense.
  // Spy Power  = spies × SPY_UNIT_VALUE × spyTrainMult × raceBonus
  // Scout Defense = scouts × SCOUT_UNIT_VALUE × scoutTrainMult × raceBonus
  //
  // Success:  spyPower > scoutDefense → full data revealed
  // Failure:  spyPower ≤ scoutDefense → nothing revealed,
  //           some spies caught (proportional to power gap).
  //
  // Attacker always pays turnCost turns regardless of outcome.
  // ═══════════════════════════════════════
  spy: {
    turnCost: 1, // [TUNE] turns spent per spy mission (paid regardless of outcome)
    minSpies: 1, // [FIXED] minimum spies required to send a mission

    // Fraction of sent spies that are lost on failure.
    // Scales with the power gap: catchRate × (scoutDefense / spyPower).
    // Clamped to [0, MAX_CATCH_RATE].
    catchRate: 0.3, // [TUNE]
    MAX_CATCH_RATE: 0.8, // [FIXED] never lose more than 80% of sent spies per mission
  },

  // ═══════════════════════════════════════
  // CRYSTALS (premium currency)
  // ═══════════════════════════════════════
  crystals: {
    packages: [
      { name: "Spark", crystals: 100, priceILS: 9.9 }, // [TUNE]
      { name: "Flame", crystals: 300, priceILS: 24.9 }, // [TUNE]
      { name: "Fire", crystals: 700, priceILS: 49.9 }, // [TUNE]
      { name: "Blaze", crystals: 1_500, priceILS: 89.9 }, // [TUNE]
      { name: "Inferno", crystals: 3_500, priceILS: 179.9 }, // [TUNE]
      { name: "Apocalypse", crystals: 8_000, priceILS: 349.9 }, // [TUNE]
    ],
    items: {
      turnBooster: { crystals: 50, durationHours: 6, multiplier: 2 }, // [TUNE]
      productionBooster: { crystals: 80, durationHours: 24, multiplier: 2 }, // [TUNE]
      shield12h: { crystals: 150, durationHours: 12 }, // [TUNE]
      shield24h: { crystals: 300, durationHours: 24 }, // [TUNE]
      vipSeason: { crystals: 500 }, // [TUNE]
      nameChange: { crystals: 100 }, // [TUNE]
    },
  },
};
