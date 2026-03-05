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
    gold:             5000,  // [TUNE]
    iron:             5000,  // [TUNE]
    wood:             5000,  // [TUNE]
    food:             5000,  // [TUNE]
    turns:            50,    // [TUNE] Start below cap so regen is immediately visible
    startingPopulation: 50,  // [TUNE] Free population every new player begins with
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

    // ── Spy/Scout gear power multipliers (used in power.ts) ───
    // Applied multiplicatively to spy/scout unit count.
    // Each piece stacks: e.g. shadow_cloak + dark_mask → ×1.15 × ×1.30.
    SPY_GEAR_MULT: {
      shadow_cloak: 1.15, // [TUNE]
      dark_mask:    1.30, // [TUNE]
      elven_gear:   1.50, // [TUNE]
    } as Record<string, number>,

    SCOUT_GEAR_MULT: {
      scout_boots:  1.15, // [TUNE]
      scout_cloak:  1.30, // [TUNE]
      elven_boots:  1.50, // [TUNE]
    } as Record<string, number>,

    // Fortification defense multiplier per level above 1.
    // powerDefense × (1 + (fortification_level - 1) × FORTIFICATION_MULT_PER_LEVEL)
    FORTIFICATION_MULT_PER_LEVEL: 0.10, // [TUNE]
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
    xpPerLevel: 100,  // [TUNE] XP needed per level (used by Hero page progress bar)

    manaPerTick: {
      base:         1,
      level10bonus: 1,
      level50bonus: 1,
      vipBonus:     1,  // [TUNE]
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

    // Mana cost per shield type — flat keys, accessed as BALANCE.hero.SOLDIER_SHIELD_MANA
    SOLDIER_SHIELD_MANA:  10,  // [TUNE]
    RESOURCE_SHIELD_MANA: 10,  // [TUNE]
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
    WIN_THRESHOLD:  1.0, // [FIXED] R >= 1.0 → win; R < 1.0 → loss

    // Soldier loss rates [TUNE]
    BASE_LOSS:            0.15, // [TUNE: placeholder] Loss rate at R = 1.0
    MAX_LOSS_RATE:        0.30, // [FIXED] Hard cap — never lose more than 30%
    DEFENDER_BLEED_FLOOR: 0.05, // [TUNE] Minimum defender loss even from weak attacker
    ATTACKER_FLOOR:       0.03, // [TUNE] Attacker always loses at least this fraction

    // Loot
    BASE_LOOT_RATE: 0.20, // [FIXED] 20% of each unbanked resource

    LOOT_OUTCOME_MULTIPLIER: {
      win:  1.0,
      loss: 0.0,
    } as const,

    // Cavalry tier multiplier (Tier 2 relative to Tier 1)
    cavalryMultiplier: 2, // [TUNE]

    // Attack cost
    MIN_TURNS_PER_ATTACK: 1,  // [FIXED]
    MAX_TURNS_PER_ATTACK: 10, // [FIXED]

    // food_cost = deployed_soldiers × FOOD_PER_SOLDIER
    FOOD_PER_SOLDIER: 1, // [TUNE]

    // food gate cost per turn used (attack screen pre-check)
    foodCostPerTurn: 1, // [TUNE]

    // Kill cooldown — per (attacker_id → target_id) pair
    // Checked against the `attacks` table (NOT player_hero_effects).
    // Cooldown fires when attacker has any row with defender_losses > 0 for this target within 6h.
    KILL_COOLDOWN_HOURS: 6, // [FIXED]

    // Captives: fraction of killed defender soldiers that become attacker slaves (army.slaves).
    // Applied only when defenderLosses > 0 (kill cooldown / shields / protection bypass this).
    CAPTURE_RATE: 0.10, // [TUNE] 10% of killed defender soldiers become captives

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

    // Interest by level: floor(balance × INTEREST_RATE_BY_LEVEL[interestLevel])
    // Level 0 → no interest; levels 1–3 are upgrade-gated.
    INTEREST_RATE_BY_LEVEL: { 0: 0.0, 1: 0.05, 2: 0.075, 3: 0.10 } as Record<number, number>, // [TUNE]
    MAX_INTEREST_LEVEL: 3, // [FIXED]

    upgradeBaseCost: 2_000, // [TUNE]

    // Deposit limits
    depositsPerDay:    5,   // [TUNE] Max deposits per calendar day (resets at midnight)
    maxDepositPercent: 1.0, // [TUNE] Max fraction of gold on hand allowed per deposit
  },

  // ═══════════════════════════════════════
  // TRAINING & POPULATION
  // ═══════════════════════════════════════
  training: {
    unitCost: {
      soldier:  { gold: 60,  capacityCost: 1              }, // [TUNE]
      slave:    { gold: 0,   capacityCost: 0              }, // [FIXED] Free: converts pop → idle slave, no gold cost
      spy:      { gold: 80,  capacityCost: 1              }, // [TUNE]
      scout:    { gold: 80,  capacityCost: 1              }, // [TUNE]
      cavalry:  { gold: 200, capacityCost: 2, soldierRatio: 5 }, // [TUNE]
    },

    populationPerTick: {
      1: 1, 2: 2,  3: 3,  4: 4,  5: 5,
      6: 8, 7: 10, 8: 14, 9: 18, 10: 23,
    } as Record<number, number>,

    advancedMultiplierPerLevel: 0.08,                    // [TUNE]
    advancedCost: { gold: 300, food: 300 },              // [TUNE]
    EXPONENTIAL_GROWTH_FLOOR:   10_000,                  // [TUNE]
    // NOTE: There is no capacity cap on combat units.
    // The players.capacity DB column is legacy — not used in any training gate.
    // Only constraints that remain: gold cost, free_population (consumed per unit),
    // and cavalry's soldierRatio requirement.
  },

  // ═══════════════════════════════════════
  // TRIBE SPELLS & TAX
  //
  // Tribe spells are activated by the tribe leader and cost tribe mana.
  // mass_spy is instant (durationHours: 0); all others are timed buffs.
  // taxLimits caps the per-city maximum daily tax in gold.
  // ═══════════════════════════════════════
  tribe: {
    spells: {
      combat_boost:        { manaCost: 20, durationHours:  6 }, // [TUNE]
      tribe_shield:        { manaCost: 30, durationHours: 12 }, // [TUNE]
      production_blessing: { manaCost: 25, durationHours:  8 }, // [TUNE]
      mass_spy:            { manaCost: 15, durationHours:  0 }, // [TUNE] instant
      war_cry:             { manaCost: 40, durationHours:  4 }, // [TUNE]
    } as Record<string, { manaCost: number; durationHours: number }>,

    // Combat and production multipliers applied when the spell is active.
    spellEffects: {
      combat_boost:        { combatMultiplier:     1.15 }, // [TUNE] attacker ECP ×1.15
      tribe_shield:        { defenseMultiplier:    1.15 }, // [TUNE] defender ECP ×1.15
      war_cry:             { combatMultiplier:     1.25 }, // [TUNE] attacker ECP ×1.25
      production_blessing: { productionMultiplier: 1.20 }, // [TUNE] tick production ×1.20
    },

    taxLimits: {
      city1:  1_000, // [TUNE]
      city2:  2_500, // [TUNE]
      city3:  5_000, // [TUNE]
      city4: 10_000, // [TUNE]
      city5: 20_000, // [TUNE]
    } as Record<string, number>,

    // Tribe mana regeneration per tick, per member.
    manaPerMemberPerTick: 1, // [TUNE] e.g. 5 members → 5 mana/tick
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

    // ── City production multipliers [TUNE] ────
    // CityProductionMultiplier(C): applied to slave output per tick.
    // Higher cities produce more resources — this is the primary promotion incentive.
    // Each city is independently tunable (not constrained to a linear sequence).
    CITY_PRODUCTION_MULT: {
      1: 1.0,
      2: 1.2,
      3: 1.5,
      4: 2.0,
      5: 2.5,
    } as Record<number, number>, // [TUNE]

    // City names (display only)
    names: {
      1: 'Izrahland',
      2: 'Masterina',
      3: 'Rivercastlor',
      4: 'Grandoria',
      5: 'Nerokvor',
    } as Record<number, string>,

    // ── City promotion power thresholds [TUNE] ────
    // Minimum power_total required to promote from city C-1 → C.
    // City 1 is starting city; no promotion required to reach it.
    promotionPowerThreshold: {
      2:   5_000,
      3:  20_000,
      4:  60_000,
      5: 150_000,
    } as Record<number, number>, // [TUNE]
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

    // New-player protection is disabled for the first N days of a season
    // so that early-season PVP is fully live without protection blocking loot.
    // After protectionStartDays, the normal PROTECTION_HOURS window applies.
    protectionStartDays: 10, // [FIXED]
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
    turnCost: 1,       // [TUNE] turns spent per spy mission (paid regardless of outcome)
    minSpies: 1,       // [FIXED] minimum spies required to send a mission

    // Fraction of sent spies that are lost on failure.
    // Scales with the power gap: catchRate × (scoutDefense / spyPower).
    // Clamped to [0, MAX_CATCH_RATE].
    catchRate:    0.30, // [TUNE]
    MAX_CATCH_RATE: 0.80, // [FIXED] never lose more than 80% of sent spies per mission
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
