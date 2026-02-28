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

export type ClanDevLevel = 1 | 2 | 3 | 4 | 5

// ─────────────────────────────────────────
// MAIN CONFIG EXPORT
// ─────────────────────────────────────────

export const BALANCE = {

  // ═══════════════════════════════════════
  // TICK SYSTEM
  // ═══════════════════════════════════════
  tick: {
    intervalMinutes: 30,   // [FIXED] Vercel Cron runs every 30 min
    turnsPerTick:    3,    // [FIXED] +3 turns added per tick
    maxTurns:        200,  // [FIXED] Hard cap — regen stops at this value
    turnsPerDay:     144,  // [FIXED] 3 × 48 ticks. Informational; do not use in formulas.
  },

  // ═══════════════════════════════════════
  // STARTING RESOURCES (new player)
  // ═══════════════════════════════════════
  startingResources: {
    gold:  5000,  // [TUNE]
    iron:  5000,  // [TUNE]
    wood:  5000,  // [TUNE]
    food:  5000,  // [TUNE]
    turns: 50,    // [TUNE] Start below cap so regen is immediately visible
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
    W_SOLDIERS:    1.0,
    W_EQUIPMENT:   1.0,
    W_SKILLS:      1.0,
    W_DEVELOPMENT: 1.0,
    W_SPY:         1.0,

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
    SOLDIER_V: 1,   // [TUNE: placeholder] Base PP value for a Tier 1 soldier
    SOLDIER_K: 3,   // [TUNE: placeholder] Inter-tier multiplier (must be > 1)
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
      slingshot:    2,       // [TUNE]
      boomerang:    5,       // [TUNE]
      pirate_knife: 12,      // [TUNE]
      axe:          28,      // [TUNE]
      master_knife: 64,      // [TUNE]
      knight_axe:   148,     // [TUNE]
      iron_ball:    340,     // [TUNE]
      // Defense equipment — PP granted once if count > 0 (binary)
      wood_shield:   150,    // [TUNE]
      iron_shield:   800,    // [TUNE]
      leather_armor: 2_500,  // [TUNE]
      chain_armor:   8_000,  // [TUNE]
      plate_armor:   25_000, // [TUNE]
      mithril_armor: 70_000, // [TUNE]
      gods_armor:    150_000,// [TUNE]
      // Spy gear — binary
      shadow_cloak: 500,     // [TUNE]
      dark_mask:    2_000,   // [TUNE]
      elven_gear:   8_000,   // [TUNE]
      // Scout gear — binary
      scout_boots:  500,     // [TUNE]
      scout_cloak:  2_000,   // [TUNE]
      elven_boots:  8_000,   // [TUNE]
    },

    // ── Skill PP values — per training level ──────────────
    SKILL_PP: {
      attack:  100, // [TUNE]
      defense: 100, // [TUNE]
      spy:     80,  // [TUNE]
      scout:   80,  // [TUNE]
    },

    // ── Development PP values — per level ─────────────────
    DEVELOPMENT_PP: {
      gold:          50,  // [TUNE]
      food:          50,  // [TUNE]
      wood:          50,  // [TUNE]
      iron:          50,  // [TUNE]
      population:    75,  // [TUNE]
      fortification: 100, // [TUNE]
    },

    // ── Spy/Scout unit PP values ───────────────────────────
    // Keep low to maintain ~5% total PP contribution.
    SPY_UNIT_VALUE:   5,  // [TUNE]
    SCOUT_UNIT_VALUE: 5,  // [TUNE]
  },

  // ═══════════════════════════════════════
  // CLAN SYSTEM
  // ═══════════════════════════════════════
  clan: {
    maxMembers:                 20,   // [FIXED]
    BONUS_CAP_RATE:             0.20, // [FIXED] ClanBonus ≤ 0.20 × PlayerPP
    postMigrationCooldownHours: 48,   // [FIXED]
    normalLeaveCooldownMinutes: 10,   // [FIXED]

    // Clan combat efficiency per development level.
    // Clans start at Level 1 automatically (no Level 0 in play).
    // ClanBonus_raw = TotalClanPP × EFFICIENCY[devLevel]
    EFFICIENCY: {
      1: 0.05, // [FIXED]
      2: 0.08, // [FIXED]
      3: 0.10, // [FIXED]
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
    maxLevel:   100,
    xpPerLevel: 100,

    xpGains: {
      weakOpponent:   10,
      equalOpponent:  25,
      strongOpponent: 50,
      achievementMin: 100,
      achievementMax: 500,
    },

    manaPerTick: {
      base:         1,
      level10bonus: 1,
      level50bonus: 1,
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

    MAX_STACK_RATE: 0.50,  // [FIXED] Hard cap on any single bonus category

    EFFECT_RATES: {
      SLAVE_OUTPUT_10: 0.10,  // [FIXED] +10% slave production per tick
      SLAVE_OUTPUT_20: 0.20,  // [FIXED] +20% slave production per tick
      SLAVE_OUTPUT_30: 0.30,  // [FIXED] +30% slave production per tick
      ATTACK_POWER_10:  0.10, // [FIXED] +10% attacker PP (never multiplies ClanBonus)
      DEFENSE_POWER_10: 0.10, // [FIXED] +10% defender PP (never multiplies ClanBonus)
    } as const,

    SHIELD_ACTIVE_HOURS:   23,  // [FIXED] Duration of shield protection
    SHIELD_COOLDOWN_HOURS:  1,  // [FIXED] Vulnerability window before next shield can start
  },

  // ═══════════════════════════════════════
  // COMBAT RESOLUTION
  //
  // R = AttackerECP / DefenderECP
  //
  // ECP = (PlayerPP × (1 + HeroBonus)) + ClanBonus
  //   HeroBonus = TotalAttackBonus or TotalDefenseBonus from active hero effects
  //
  // Outcome:
  //   R ≥ WIN_THRESHOLD  → win
  //   R < LOSS_THRESHOLD → loss
  //   Otherwise          → partial
  //
  // Design target: ~50–60% partial for same-PP players within same city.
  //
  // BEGINNER PROTECTION NOTE:
  //   Attacks on protected players are NEVER blocked.
  //   Protection is a flag applied inside combat resolution:
  //     defenderIsProtected → defenderLosses = 0, loot = 0
  //     attackerIsProtected → attackerLosses = 0
  //   The attacker always pays turns + food regardless of protection.
  // ═══════════════════════════════════════
  combat: {
    // Outcome thresholds [TUNE]
    WIN_THRESHOLD:  1.30, // [TUNE]
    LOSS_THRESHOLD: 0.75, // [TUNE]

    // Soldier loss rates [TUNE]
    BASE_LOSS:            0.15, // [TUNE: placeholder] Loss rate at R = 1.0
    MAX_LOSS_RATE:        0.30, // [FIXED] Hard cap — never lose more than 30%
    DEFENDER_BLEED_FLOOR: 0.05, // [TUNE] Minimum defender loss even from weak attacker
    ATTACKER_FLOOR:       0.03, // [TUNE] Attacker always loses at least this fraction

    // Slave conversion
    CAPTURE_RATE: 0.35, // [TUNE] 30–40% of killed defender soldiers → slaves (permanent)

    // Loot
    BASE_LOOT_RATE: 0.20, // [FIXED] 20% of each unbanked resource

    LOOT_OUTCOME_MULTIPLIER: {
      win:     1.0,
      partial: 0.5,
      loss:    0.0,
    } as const,

    // Attack cost
    MIN_TURNS_PER_ATTACK: 1,  // [FIXED]
    MAX_TURNS_PER_ATTACK: 10, // [FIXED]

    // food_cost = deployed_soldiers × FOOD_PER_SOLDIER
    FOOD_PER_SOLDIER: 1, // [TUNE]

    // Kill cooldown — per (attacker_id → target_id) pair
    KILL_COOLDOWN_HOURS: 6, // [FIXED]

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
    LOOT_DECAY_STEPS: [1.0, 0.70, 0.40, 0.20, 0.10] as const,
  },

  // ═══════════════════════════════════════
  // BANK
  // ═══════════════════════════════════════
  bank: {
    maxLifetimeDeposits: 5,     // [FIXED] Total deposits across account lifetime
    theftProtection:     1.00,  // [FIXED] 100% of banked gold is safe

    // Interest formula: interest = floor(balance × BANK_INTEREST_RATE_BASE)
    //                            + floor(balance × interestLevel × BANK_INTEREST_RATE_PER_LEVEL)
    //
    // Both rates are [TUNE: unassigned]. Assign during economy balance.
    // Guideline: total rate should feel meaningful but not dominate gold production.
    BANK_INTEREST_RATE_BASE:      undefined as unknown as number, // [TUNE: unassigned]
    BANK_INTEREST_RATE_PER_LEVEL: undefined as unknown as number, // [TUNE: unassigned]

    upgradeBaseCost: 2_000, // [TUNE]
  },

  // ═══════════════════════════════════════
  // TRAINING & POPULATION
  // ═══════════════════════════════════════
  training: {
    unitCost: {
      soldier: { gold: 60  }, // [TUNE]
      slave:   { gold: 10  }, // [TUNE]
      spy:     { gold: 80  }, // [TUNE]
      scout:   { gold: 80  }, // [TUNE]
    },

    populationPerTick: {
      1: 1, 2: 2,  3: 3,  4: 4,  5: 5,
      6: 8, 7: 10, 8: 14, 9: 18, 10: 23,
    } as Record<number, number>,

    advancedMultiplierPerLevel: 0.08,                    // [TUNE]
    advancedCost: { gold: 300, food: 300 },              // [TUNE]
    EXPONENTIAL_GROWTH_FLOOR:   10_000,                  // [TUNE]
  },

  // ═══════════════════════════════════════
  // PRODUCTION (slave output per tick)
  // ═══════════════════════════════════════
  production: {
    baseMin: 1.0, // [TUNE]
    baseMax: 3.0, // [TUNE]

    developmentUpgradeCost: {
      level2:  { gold: 3,   resource: 3   }, // [TUNE]
      level3:  { gold: 9,   resource: 9   }, // [TUNE]
      level5:  { gold: 50,  resource: 50  }, // [TUNE]
      level10: { gold: 500, resource: 500 }, // [TUNE]
    },
  },

  // ═══════════════════════════════════════
  // WEAPONS (combat power — separate from PP ranking values above)
  // ═══════════════════════════════════════
  weapons: {
    attack: {
      slingshot:    { power: 2,   maxPerPlayer: 25, costIron: 200    },
      boomerang:    { power: 5,   maxPerPlayer: 12, costIron: 400    },
      pirate_knife: { power: 12,  maxPerPlayer: 6,  costIron: 800    },
      axe:          { power: 28,  maxPerPlayer: 3,  costIron: 1_600  },
      master_knife: { power: 64,  maxPerPlayer: 1,  costIron: 3_200  },
      knight_axe:   { power: 148, maxPerPlayer: 1,  costIron: 6_400  },
      iron_ball:    { power: 340, maxPerPlayer: 1,  costIron: 12_800 },
    },
    defense: {
      wood_shield:   { multiplier: 1.10, costGold: 1_500                                          },
      iron_shield:   { multiplier: 1.25, costGold: 8_000                                          },
      leather_armor: { multiplier: 1.40, costGold: 25_000                                         },
      chain_armor:   { multiplier: 1.55, costGold: 80_000                                         },
      plate_armor:   { multiplier: 1.70, costGold: 250_000                                        },
      mithril_armor: { multiplier: 1.90, costGold: 700_000                                        },
      gods_armor:    { multiplier: 2.20, costGold: 1_000_000, costIron: 500_000, costWood: 300_000 },
    },
    spy: {
      shadow_cloak: { costGold: 5_000  },
      dark_mask:    { costGold: 20_000 },
      elven_gear:   { costGold: 80_000 },
    },
    scout: {
      scout_boots:  { costGold: 5_000  },
      scout_cloak:  { costGold: 20_000 },
      elven_boots:  { costGold: 80_000 },
    },
    sellRefundPercent: 0.20,
  },

  // ═══════════════════════════════════════
  // CITIES
  //
  // 5 cities total. Promotion is sequential (1 → 2 → 3 → 4 → 5 only).
  // Player must leave clan before promoting.
  // After migration: 48-hour clan join restriction.
  // Clan is locked to a single city.
  //
  // Promotion threshold formulas (all parameters [TUNE: unassigned]):
  //   SoldierThreshold(C) = S_base × s_growth ^ (C - 2)
  //   PowerThreshold(C)   = P_base × p_growth ^ (C - 2)
  //   ResourceCost(C)[r]  = R_base[r] × r_growth ^ (C - 2)
  //   for C ∈ {2, 3, 4, 5}
  //
  // Production multiplier per city:
  //   CityProductionMultiplier(C): independently tunable per city tier [TUNE: unassigned]
  // ═══════════════════════════════════════
  cities: {
    total: 5, // [FIXED]

    // ── Promotion threshold parameters [TUNE: unassigned] ──
    S_base:   undefined as unknown as number, // Min soldiers required for City 2
    P_base:   undefined as unknown as number, // Min PersonalPower required for City 2
    R_base: {
      gold: undefined as unknown as number,   // Resource cost (gold) for City 2
      iron: undefined as unknown as number,   // Resource cost (iron) for City 2
      wood: undefined as unknown as number,   // Resource cost (wood) for City 2
      food: undefined as unknown as number,   // Resource cost (food) for City 2
    },
    s_growth: undefined as unknown as number, // Per-city multiplier for soldier threshold
    p_growth: undefined as unknown as number, // Per-city multiplier for PP threshold
    r_growth: undefined as unknown as number, // Per-city multiplier for resource costs

    // ── City production multipliers [TUNE: unassigned] ────
    // CityProductionMultiplier(C): applied to slave output per tick.
    // Higher cities produce more resources — this is the primary promotion incentive.
    // Each city is independently tunable (not constrained to a linear sequence).
    CITY_PRODUCTION_MULT: {
      1: undefined as unknown as number, // [TUNE: unassigned]
      2: undefined as unknown as number, // [TUNE: unassigned]
      3: undefined as unknown as number, // [TUNE: unassigned]
      4: undefined as unknown as number, // [TUNE: unassigned]
      5: undefined as unknown as number, // [TUNE: unassigned]
    } as Record<number, number>,

    // City names (display only)
    names: {
      1: 'Izrahland',
      2: 'Masterina',
      3: 'Rivercastlor',
      4: 'Grandoria',
      5: 'Nerokvor',
    } as Record<number, string>,
  },

  // ═══════════════════════════════════════
  // RACE BONUSES (combat only — NEVER affect PP or ranking)
  // ═══════════════════════════════════════
  raceBonuses: {
    orc:   { attackBonus: 0.10, defenseBonus: 0.03 },           // [TUNE]
    human: { goldProductionBonus: 0.15, attackBonus: 0.03 },    // [TUNE]
    elf:   { spyBonus: 0.20, scoutBonus: 0.20 },                // [TUNE]
    dwarf: { defenseBonus: 0.15, goldProductionBonus: 0.03 },   // [TUNE]
  },

  // ═══════════════════════════════════════
  // SEASON
  // ═══════════════════════════════════════
  season: {
    durationDays:                        90, // [FIXED]
    hallOfFamePlayers:                   20,
    hallOfFameTribes:                    5,
    accountDeletionAfterInactiveSeasons: 3,
    vacationTurnsMultiplier:             0.33, // [TUNE]
    // Full reset at season end. Cosmetics only carry over.
  },

  // ═══════════════════════════════════════
  // VIP
  // ═══════════════════════════════════════
  vip: {
    productionMultiplier: 1.10, // [TUNE]
    weeklyTurnsBonus:     50,   // [TUNE]
    bankInterestBonus:    0,    // [TUNE: unassigned — expressed as additive rate]
    crystalCost:          500,  // [TUNE]
  },

  // ═══════════════════════════════════════
  // CRYSTALS (premium currency)
  // ═══════════════════════════════════════
  crystals: {
    packages: [
      { name: 'Spark',      crystals: 100,   priceILS: 9.90   }, // [TUNE]
      { name: 'Flame',      crystals: 300,   priceILS: 24.90  }, // [TUNE]
      { name: 'Fire',       crystals: 700,   priceILS: 49.90  }, // [TUNE]
      { name: 'Blaze',      crystals: 1_500, priceILS: 89.90  }, // [TUNE]
      { name: 'Inferno',    crystals: 3_500, priceILS: 179.90 }, // [TUNE]
      { name: 'Apocalypse', crystals: 8_000, priceILS: 349.90 }, // [TUNE]
    ],
    items: {
      turnBooster:       { crystals: 50,  durationHours: 6,  multiplier: 2 }, // [TUNE]
      productionBooster: { crystals: 80,  durationHours: 24, multiplier: 2 }, // [TUNE]
      shield12h:         { crystals: 150, durationHours: 12 },                // [TUNE]
      shield24h:         { crystals: 300, durationHours: 24 },                // [TUNE]
      vipSeason:         { crystals: 500 },                                    // [TUNE]
      nameChange:        { crystals: 100 },                                    // [TUNE]
    },
  },

}
