/**
 * Balance Config Validation (Step C)
 *
 * Validates all required (non-[TUNE: unassigned]) keys at module load time.
 * Throws a clear error if any required key is missing or the wrong type.
 *
 * Keys marked [TUNE: unassigned] in balance.config.ts are intentionally
 * undefined and are excluded from this schema.
 */
import { z } from 'zod'
import { BALANCE } from '@/config/balance.config'

const balanceSchema = z.object({
  tick: z.object({
    intervalMinutes: z.number(),
    turnsPerTick:    z.number(),
    maxTurns:        z.number(),
    turnsPerDay:     z.number(),
  }),
  startingResources: z.object({
    gold:               z.number(),
    iron:               z.number(),
    wood:               z.number(),
    food:               z.number(),
    turns:              z.number(),
    startingPopulation: z.number(),
  }),
  pp: z.object({
    W_SOLDIERS:    z.number(),
    W_EQUIPMENT:   z.number(),
    W_SKILLS:      z.number(),
    W_DEVELOPMENT: z.number(),
    W_SPY:         z.number(),
    DEV_CAP:       z.number(),
    SOLDIER_V:     z.number(),
    SOLDIER_K:     z.number(),
    EQUIPMENT_PP:  z.record(z.number()),
    SKILL_PP:      z.object({ attack: z.number(), defense: z.number(), spy: z.number(), scout: z.number() }),
    DEVELOPMENT_PP: z.object({
      gold: z.number(), food: z.number(), wood: z.number(), iron: z.number(),
      population: z.number(), fortification: z.number(),
    }),
    SPY_UNIT_VALUE:   z.number(),
    SCOUT_UNIT_VALUE: z.number(),
    SPY_GEAR_MULT:    z.record(z.number()),
    SCOUT_GEAR_MULT:  z.record(z.number()),
    FORTIFICATION_MULT_PER_LEVEL: z.number(),
  }),
  clan: z.object({
    maxMembers:                 z.number(),
    BONUS_CAP_RATE:             z.number(),
    postMigrationCooldownHours: z.number(),
    normalLeaveCooldownMinutes: z.number(),
    EFFICIENCY: z.record(z.number()),
  }),
  hero: z.object({
    xpPerLevel:   z.number(),
    manaPerTick:  z.object({ base: z.number(), level10bonus: z.number(), level50bonus: z.number(), vipBonus: z.number() }),
    MAX_STACK_RATE: z.number(),
    EFFECT_RATES: z.object({
      SLAVE_OUTPUT_10:  z.number(),
      SLAVE_OUTPUT_20:  z.number(),
      SLAVE_OUTPUT_30:  z.number(),
      ATTACK_POWER_10:  z.number(),
      DEFENSE_POWER_10: z.number(),
    }),
    SHIELD_ACTIVE_HOURS:   z.number(),
    SHIELD_COOLDOWN_HOURS: z.number(),
    SOLDIER_SHIELD_MANA:   z.number(),
    RESOURCE_SHIELD_MANA:  z.number(),
  }),
  combat: z.object({
    WIN_THRESHOLD:          z.number(),
    BASE_LOSS:              z.number(),
    MAX_LOSS_RATE:          z.number(),
    DEFENDER_BLEED_FLOOR:   z.number(),
    ATTACKER_FLOOR:         z.number(),
    BASE_LOOT_RATE:         z.number(),
    LOOT_OUTCOME_MULTIPLIER: z.object({ win: z.number(), loss: z.number() }),
    cavalryMultiplier:      z.number(),
    MIN_TURNS_PER_ATTACK:   z.number(),
    MAX_TURNS_PER_ATTACK:   z.number(),
    FOOD_PER_SOLDIER: z.number().finite().min(0),
    KILL_COOLDOWN_HOURS:    z.number(),
    CAPTURE_RATE:           z.number(),
    PROTECTION_HOURS:       z.number(),
  }),
  antiFarm: z.object({
    DECAY_WINDOW_HOURS: z.number(),
    LOOT_DECAY_STEPS:   z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
  }),
  bank: z.object({
    maxLifetimeDeposits:   z.number(),
    theftProtection:       z.number(),
    INTEREST_RATE_BY_LEVEL: z.record(z.number()),
    MAX_INTEREST_LEVEL:    z.number(),
    upgradeBaseCost:       z.number(),
    depositsPerDay:        z.number(),
    maxDepositPercent:     z.number(),
  }).passthrough()
    .refine(
      b => '0' in b.INTEREST_RATE_BY_LEVEL,
      { message: 'INTEREST_RATE_BY_LEVEL must contain level 0', path: ['INTEREST_RATE_BY_LEVEL'] },
    )
    .refine(
      b => Object.values(b.INTEREST_RATE_BY_LEVEL).every((v) => (v as number) >= 0),
      { message: 'INTEREST_RATE_BY_LEVEL values must be non-negative', path: ['INTEREST_RATE_BY_LEVEL'] },
    )
    .refine(
      b => {
        const sorted = Object.keys(b.INTEREST_RATE_BY_LEVEL)
          .map(Number)
          .sort((a, c) => a - c)
        for (let i = 1; i < sorted.length; i++) {
          if ((b.INTEREST_RATE_BY_LEVEL[sorted[i]] as number) < (b.INTEREST_RATE_BY_LEVEL[sorted[i - 1]] as number)) return false
        }
        return true
      },
      { message: 'INTEREST_RATE_BY_LEVEL must be monotonically non-decreasing', path: ['INTEREST_RATE_BY_LEVEL'] },
    )
    .refine(
      b => {
        const maxKey = Math.max(...Object.keys(b.INTEREST_RATE_BY_LEVEL).map(Number))
        return b.MAX_INTEREST_LEVEL === maxKey
      },
      { message: 'MAX_INTEREST_LEVEL must equal the highest key in INTEREST_RATE_BY_LEVEL', path: ['MAX_INTEREST_LEVEL'] },
    ),
  training: z.object({
    unitCost: z.object({
      soldier:  z.object({ gold: z.number(), capacityCost: z.number() }),
      slave:    z.object({ gold: z.number(), capacityCost: z.number() }),
      spy:      z.object({ gold: z.number(), capacityCost: z.number() }),
      scout:    z.object({ gold: z.number(), capacityCost: z.number() }),
      cavalry:  z.object({ gold: z.number(), capacityCost: z.number(), soldierRatio: z.number() }),
    }),
    populationPerTick:           z.record(z.number()),
    advancedMultiplierPerLevel:  z.number(),
    advancedCost:                z.object({ gold: z.number(), food: z.number() }),
    EXPONENTIAL_GROWTH_FLOOR:    z.number(),
  }),
  tribe: z.object({
    spells:               z.record(z.object({ manaCost: z.number(), durationHours: z.number() })),
    spellEffects: z.object({
      combat_boost:        z.object({ combatMultiplier:     z.number() }),
      tribe_shield:        z.object({ defenseMultiplier:    z.number() }),
      war_cry:             z.object({ combatMultiplier:     z.number() }),
      production_blessing: z.object({ productionMultiplier: z.number() }),
    }),
    taxLimits:            z.record(z.number()),
    manaPerMemberPerTick: z.number(),
  }),
  production: z.object({
    baseMin: z.number(),
    baseMax: z.number(),
    DEV_OFFSET_PER_LEVEL: z.number(),
    developmentUpgradeCost: z.object({
      level2:  z.object({ gold: z.number(), resource: z.number() }),
      level3:  z.object({ gold: z.number(), resource: z.number() }),
      level5:  z.object({ gold: z.number(), resource: z.number() }),
      level10: z.object({ gold: z.number(), resource: z.number() }),
    }),
  }),
  vip: z.object({
    productionMultiplier: z.number(),
    weeklyTurnsBonus:     z.number(),
    crystalCost:          z.number(),
  }).passthrough(),
  season: z.object({
    durationDays:                        z.number(),
    hallOfFamePlayers:                   z.number(),
    hallOfFameTribes:                    z.number(),
    accountDeletionAfterInactiveSeasons: z.number(),
    vacationTurnsMultiplier:             z.number(),
    protectionStartDays:                 z.number(),
  }),
  raceBonuses: z.object({
    orc:   z.object({ attackBonus: z.number(),  defenseBonus: z.number() }),
    human: z.object({ goldProductionBonus: z.number(), attackBonus: z.number() }),
    elf:   z.object({ spyBonus: z.number(),     scoutBonus: z.number() }),
    dwarf: z.object({ defenseBonus: z.number(), goldProductionBonus: z.number() }),
  }),
  // weapons: required keys only; gods_armor extra cost keys use .passthrough()
  weapons: z.object({
    attack:            z.record(z.object({ power: z.number(), maxPerPlayer: z.number(), costIron: z.number() })),
    defense:           z.record(z.object({ multiplier: z.number(), costGold: z.number() }).passthrough()),
    spy:               z.record(z.object({ costGold: z.number() })),
    scout:             z.record(z.object({ costGold: z.number() })),
    sellRefundPercent: z.number(),
  }),
  cities: z.object({
    total:   z.number(),
    maxCity: z.number(),
    names:   z.record(z.string()),
    promotion: z.object({
      soldiersRequiredByCity: z.record(z.number()),
      resourceCostByCity:     z.record(z.object({
        gold: z.number(), wood: z.number(), iron: z.number(), food: z.number(),
      })),
    }),
    slaveProductionMultByCity: z.record(z.number()),
    promotionThresholds: z.object({
      S_base:   z.number().finite(),
      P_base:   z.number().finite(),
      R_base:   z.number().finite(),
      s_growth: z.number().finite(),
      p_growth: z.number().finite(),
      r_growth: z.number().finite(),
    })
      .refine(t => t.S_base > 0 && t.P_base > 0 && t.R_base > 0, {
        message: 'S_base, P_base, R_base must be > 0',
        path: ['promotionThresholds'],
      })
      .refine(t => t.s_growth >= 1 && t.p_growth >= 1 && t.r_growth >= 1, {
        message: 's_growth, p_growth, r_growth must be >= 1',
        path: ['promotionThresholds'],
      }),
  })
    .refine(
      c => {
        for (let i = 1; i <= c.maxCity; i++) {
          if (!(String(i) in c.slaveProductionMultByCity)) return false
        }
        return true
      },
      { message: 'slaveProductionMultByCity must have entries for cities 1..maxCity', path: ['slaveProductionMultByCity'] },
    )
    .refine(
      c => Object.values(c.slaveProductionMultByCity).every((v) => (v as number) > 0),
      { message: 'slaveProductionMultByCity values must be > 0', path: ['slaveProductionMultByCity'] },
    ),
})

/**
 * Validates BALANCE against the canonical schema at module load.
 * Throws a descriptive error if any required key is missing or wrong type.
 * Called once from lib/game/balance.ts on import.
 */
export function validateBalance(): void {
  const result = balanceSchema.safeParse(BALANCE)
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  ${i.path.join('.')} — ${i.message}`)
      .join('\n')
    throw new Error(
      `[BALANCE CONFIG] Schema validation failed. Fix config/balance.config.ts:\n${issues}`
    )
  }
}
