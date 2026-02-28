/**
 * Domiron — Balance Configuration
 * 
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR ALL GAME NUMBERS.
 * 
 * - To change a value: edit here + add entry to changelog below.
 * - Admin Panel can override any value at runtime via balance_overrides DB table.
 * - Import this file in all game logic: import { BALANCE } from '@/config/balance.config'
 */

export const BALANCE = {

  // ─────────────────────────────────────────
  // TICK SYSTEM
  // ─────────────────────────────────────────
  tick: {
    intervalMinutes: 30,
    turnsPerTick: 3,
    maxTurns: 30,
  },

  // ─────────────────────────────────────────
  // STARTING RESOURCES (new player)
  // ─────────────────────────────────────────
  startingResources: {
    gold: 5000,
    iron: 5000,
    wood: 5000,
    food: 5000,
    turns: 100,
  },

  // ─────────────────────────────────────────
  // CATCH-UP BONUS (mid-season registration)
  // ─────────────────────────────────────────
  catchUpBonus: {
    day1to7:   1,   // ×1 — normal start
    day8to30:  2,   // ×2 resources
    day31to60: 5,   // ×5 resources
    day61to80: 10,  // ×10 resources
    day81to90: 20,  // ×20 resources
  },

  // ─────────────────────────────────────────
  // RACE BONUSES (applied as multipliers)
  // ─────────────────────────────────────────
  raceBonuses: {
    orc: {
      attackBonus: 0.10,    // +10%
      defenseBonus: 0.03,   // +3%
    },
    human: {
      goldProductionBonus: 0.15,  // +15%
      attackBonus: 0.03,          // +3%
    },
    elf: {
      spyBonus: 0.20,    // +20%
      scoutBonus: 0.20,  // +20%
    },
    dwarf: {
      defenseBonus: 0.15,         // +15%
      goldProductionBonus: 0.03,  // +3%
    },
  },

  // ─────────────────────────────────────────
  // COMBAT
  // ─────────────────────────────────────────
  combat: {
    cavalryMultiplier: 1.2,
    randomRange: { min: 0.92, max: 1.08 },

    // Turn bonus rates
    turnBonus: {
      turns1to5:  0.15,   // +15% per turn
      turns6to10: 0.12,   // +12% per turn (diminishing)
    },

    // Food cost per turn used in battle
    foodCostPerTurn: 10,

    // Max attacks on same target before no-damage mode
    maxDamageAttacksPerDay: 5,

    // Cooldown between attacks (seconds)
    attackCooldownSeconds: 5,

    // Battle outcomes (ATK/DEF ratio thresholds)
    outcomes: {
      crushingVictory: {
        minRatio: 2.0,
        attackerLosses: 0.05,
        defenderLosses: 0.40,
        resourceSteal: 0.30,
        slaveSteal: 0.20,
      },
      victory: {
        minRatio: 1.1,
        attackerLosses: 0.15,
        defenderLosses: 0.25,
        resourceSteal: 0.20,
        slaveSteal: 0.10,
      },
      draw: {
        minRatio: 0.9,
        attackerLosses: 0.10,
        defenderLosses: 0.10,
        resourceSteal: 0.05,
        slaveSteal: 0,
      },
      defeat: {
        minRatio: 0.5,
        attackerLosses: 0.30,
        defenderLosses: 0.05,
        resourceSteal: 0,
        slaveSteal: 0,
      },
      crushingDefeat: {
        minRatio: 0,
        attackerLosses: 0.60,
        defenderLosses: 0.02,
        resourceSteal: 0,
        slaveSteal: 0,
      },
    },

    // Hard cap on resources stolen per attack
    maxResourceStealPercent: 0.50,
  },

  // ─────────────────────────────────────────
  // TRAINING
  // ─────────────────────────────────────────
  training: {
    baseCapacity: 2500,
    capacityPerDevelopmentLevel: 500,

    units: {
      soldier:  { goldCost: 60,    capacityCost: 83  },
      slave:    { goldCost: 10,    capacityCost: 150 },
      spy:      { goldCost: 80,    capacityCost: 62  },
      scout:    { goldCost: 80,    capacityCost: 62  },
      cavalry:  { goldCost: 1000,  capacityCost: 0, soldierRatio: 10 }, // 1 per 10 soldiers
      farmer:   { goldCost: 150,   capacityCost: 0 },
    },

    // Advanced training
    advanced: {
      costPerLevel: { gold: 300, food: 300 },
      multiplierPerLevel: 0.08,  // level × 0.08 added to 1.0
      // Level 0: ×1.00, Level 5: ×1.40, Level 10: ×1.80, Level 20: ×2.60
    },
  },

  // ─────────────────────────────────────────
  // PRODUCTION
  // ─────────────────────────────────────────
  production: {
    // Base production per unit per tick (random range)
    baseMin: 1.0,
    baseMax: 3.0,

    // City multipliers
    cityMultipliers: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },

    // Development upgrade costs (multiplied per level)
    developmentUpgradeCost: {
      level2:  { gold: 3,   resource: 3   },
      level3:  { gold: 9,   resource: 9   },
      level5:  { gold: 50,  resource: 50  },
      level10: { gold: 500, resource: 500 },
    },

    // Population per tick by level
    populationPerTick: {
      1: 1, 2: 2, 3: 3, 4: 4, 5: 5,
      6: 8, 7: 10, 8: 14, 9: 18, 10: 23,
    },
  },

  // ─────────────────────────────────────────
  // WEAPONS — ATTACK
  // ─────────────────────────────────────────
  weapons: {
    attack: {
      slingshot:    { power: 2,   maxPerPlayer: 25, costIron: 200 },
      boomerang:    { power: 5,   maxPerPlayer: 12, costIron: 400 },
      pirate_knife: { power: 12,  maxPerPlayer: 6,  costIron: 800 },
      axe:          { power: 28,  maxPerPlayer: 3,  costIron: 1600 },
      master_knife: { power: 64,  maxPerPlayer: 1,  costIron: 3200 },
      knight_axe:   { power: 148, maxPerPlayer: 1,  costIron: 6400 },
      iron_ball:    { power: 340, maxPerPlayer: 1,  costIron: 12800 },
    },

    defense: {
      wood_shield:   { multiplier: 1.10, costGold: 1500 },
      iron_shield:   { multiplier: 1.25, costGold: 8000 },
      leather_armor: { multiplier: 1.40, costGold: 25000 },
      chain_armor:   { multiplier: 1.55, costGold: 80000 },
      plate_armor:   { multiplier: 1.70, costGold: 250000 },
      mithril_armor: { multiplier: 1.90, costGold: 700000 },
      gods_armor:    { multiplier: 2.20, costGold: 1000000, costIron: 500000, costWood: 300000 },
    },

    spy: {
      shadow_cloak: { costGold: 5000 },
      dark_mask:    { costGold: 20000 },
      elven_gear:   { costGold: 80000 },
    },

    scout: {
      scout_boots:  { costGold: 5000 },
      scout_cloak:  { costGold: 20000 },
      elven_boots:  { costGold: 80000 },
    },

    sellRefundPercent: 0.20,   // 20% of original cost (iron/wood only)
  },

  // ─────────────────────────────────────────
  // BANK
  // ─────────────────────────────────────────
  bank: {
    maxDepositPercent: 0.50,    // 50% of gold on hand
    depositsPerDay: 2,
    interestPerLevel: 0.00125,  // 0.125% per level
    upgradeBaseCost: 2000,      // × (level + 1) per upgrade
    theftProtection: 1.00,      // 100% safe
  },

  // ─────────────────────────────────────────
  // HERO
  // ─────────────────────────────────────────
  hero: {
    maxLevel: 100,
    xpPerLevel: 100,   // level × 100 XP required

    xpGains: {
      weakOpponent:  10,
      equalOpponent: 25,
      strongOpponent: 50,
      tribeContributionPerTick: 5,
      achievementMin: 100,
      achievementMax: 500,
    },

    manaPerTick: {
      base: 1,
      level10bonus: 1,
      level50bonus: 1,
      vipBonus: 1,
    },

    shields: {
      soldierShield:  { manaCost: 25, durationHours: 1 },
      resourceShield: { manaCost: 25, durationHours: 1 },
    },
  },

  // ─────────────────────────────────────────
  // TRIBE
  // ─────────────────────────────────────────
  tribe: {
    maxMembers: 25,

    defenseContributionPercent: 0.05,  // 5% per member

    manaPerTick: {
      base: 1,
      bonus10to19: 1,
      bonus20to29: 2,
      bonus30to39: 3,
      bonus40to49: 4,
      bonus50: 5,
    },

    taxLimits: {
      city1: 25000,
      city2: 100000,
      city3: 1000000,
      city4: 10000000,
      city5: 100000000,
    },

    spells: {
      combat_boost:        { manaCost: 5,  durationHours: 3,  attackBonus: 0.20 },
      tribe_shield:        { manaCost: 8,  durationHours: 2,  defenseBonus: 0.40 },
      production_blessing: { manaCost: 4,  durationHours: 6,  productionBonus: 0.50 },
      mass_spy:            { manaCost: 6,  durationHours: 0 },  // one-time reveal
      war_cry:             { manaCost: 15, durationHours: 1,  attackBonus: 0.50 },
    },
  },

  // ─────────────────────────────────────────
  // CITIES
  // ─────────────────────────────────────────
  cities: {
    1: { name: 'Izrahland',    multiplier: 1, requiredSoldiers: 0,     requiredResources: 0 },
    2: { name: 'Masterina',    multiplier: 2, requiredSoldiers: 200,   requiredResources: 120000 },
    3: { name: 'Rivercastlor', multiplier: 3, requiredSoldiers: 500,   requiredResources: 500000 },
    4: { name: 'Grandoria',    multiplier: 4, requiredSoldiers: 1500,  requiredResources: 2000000 },
    5: { name: 'Nerokvor',     multiplier: 5, requiredSoldiers: 5000,  requiredResources: 10000000 },
  },

  // ─────────────────────────────────────────
  // RANKING FORMULA WEIGHTS
  // ─────────────────────────────────────────
  ranking: {
    attackWeight:  0.30,
    defenseWeight: 0.30,
    spyWeight:     0.20,
    scoutWeight:   0.20,
  },

  // ─────────────────────────────────────────
  // SEASON
  // ─────────────────────────────────────────
  season: {
    durationDays: 90,
    hallOfFamePlayers: 20,
    hallOfFameTribes: 5,
    newPlayerShieldDays: 7,
    vacationMaxDaysPerSeason: 14,
    vacationTurnsMultiplier: 0.33,
    vacationProductionMultiplier: 0.33,
    accountDeletionAfterInactiveSeasons: 3,
  },

  // ─────────────────────────────────────────
  // VIP
  // ─────────────────────────────────────────
  vip: {
    productionMultiplier: 1.10,
    xpMultiplier: 1.20,
    weeklyTurnsBonus: 50,
    bankInterestBonus: 0.005,  // +0.5%
    manaPerTickBonus: 1,
    crystalCost: 500,
  },

  // ─────────────────────────────────────────
  // CRYSTALS (premium currency)
  // ─────────────────────────────────────────
  crystals: {
    packages: [
      { name: 'Spark',      crystals: 100,  priceILS: 9.90  },
      { name: 'Flame',      crystals: 300,  priceILS: 24.90 },
      { name: 'Fire',       crystals: 700,  priceILS: 49.90 },
      { name: 'Blaze',      crystals: 1500, priceILS: 89.90 },
      { name: 'Inferno',    crystals: 3500, priceILS: 179.90 },
      { name: 'Apocalypse', crystals: 8000, priceILS: 349.90 },
    ],
    items: {
      turnBooster:        { crystals: 50,  durationHours: 6,  multiplier: 2 },
      productionBooster:  { crystals: 80,  durationHours: 24, multiplier: 2 },
      shield12h:          { crystals: 150, durationHours: 12 },
      shield24h:          { crystals: 300, durationHours: 24 },
      vipSeason:          { crystals: 500 },
      nameChange:         { crystals: 100 },
    },
  },

} as const

// ─────────────────────────────────────────
// CHANGELOG — log every change here
// ─────────────────────────────────────────
/**
 * v1.0 — Initial configuration
 */
