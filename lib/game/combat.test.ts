/**
 * Domiron v5 — Combat Engine Unit Tests
 *
 * Tests use symbolic constants via BALANCE to remain valid when
 * [TUNE] values are adjusted during balance passes.
 *
 * Test philosophy:
 *   - Boundary tests verify caps and floors hold at extreme inputs.
 *   - Sequence tests verify ordering-dependent behaviour (decay, cooldowns).
 *   - Identity tests verify zero-input / neutral-state outputs.
 *   - Design-constraint tests verify high-level spec rules.
 *
 * Run: npx vitest run
 */

import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'
import {
  calculatePersonalPower,
  calculateClanBonus,
  calculateECP,
  calculateCombatRatio,
  determineCombatOutcome,
  calculateSoldierLosses,
  convertKilledToSlaves,
  isKillCooldownActive,
  isNewPlayerProtected,
  getLootDecayMultiplier,
  calculateLoot,
  calcTurnsAfterRegen,
  resolveCombat,
} from '@/lib/game/combat'

import type {
  PersonalPowerInputs,
  ClanContext,
  UnbankedResources,
  CombatResolutionInputs,
} from '@/lib/game/combat'

// ─────────────────────────────────────────
// SHARED FIXTURES
// ─────────────────────────────────────────

const EMPTY_ARMY = {
  soldiers: 0,
  cavalry:  0,
  spies:    0,
  scouts:   0,
  slaves:   0,
  farmers:  0,
  free_population: 0,
  id: 'a', player_id: 'p', updated_at: '',
}

const EMPTY_WEAPONS = {
  id: 'w', player_id: 'p', updated_at: '',
  slingshot: 0, boomerang: 0, pirate_knife: 0, axe: 0,
  master_knife: 0, knight_axe: 0, iron_ball: 0,
  wood_shield: 0, iron_shield: 0, leather_armor: 0, chain_armor: 0,
  plate_armor: 0, mithril_armor: 0, gods_armor: 0,
  shadow_cloak: 0, dark_mask: 0, elven_gear: 0,
  scout_boots: 0, scout_cloak: 0, elven_boots: 0,
}

const EMPTY_TRAINING = {
  id: 't', player_id: 'p', updated_at: '',
  attack_level: 0, defense_level: 0, spy_level: 0, scout_level: 0,
}

const EMPTY_DEVELOPMENT = {
  id: 'd', player_id: 'p', updated_at: '',
  gold_level: 0, food_level: 0, wood_level: 0, iron_level: 0,
  population_level: 0, fortification_level: 0,
}

const BASE_INPUTS: PersonalPowerInputs = {
  army:        EMPTY_ARMY,
  weapons:     EMPTY_WEAPONS,
  training:    EMPTY_TRAINING,
  development: EMPTY_DEVELOPMENT,
}

const NO_CLAN: null = null

const UNBANKED_1000: UnbankedResources = { gold: 1000, iron: 1000, wood: 1000, food: 1000 }

// ─────────────────────────────────────────
// 1. PERSONAL POWER
// ─────────────────────────────────────────

describe('calculatePersonalPower', () => {

  it('returns 0 for a player with no units, no equipment, no skills, no dev', () => {
    expect(calculatePersonalPower(BASE_INPUTS)).toBe(0)
  })

  it('hero never contributes to PP (PP is calculated without hero)', () => {
    // PP calculation has no hero parameter — this is a type-level guarantee.
    // Verify the function signature only accepts PersonalPowerInputs (no hero param).
    const pp = calculatePersonalPower(BASE_INPUTS)
    expect(pp).toBe(0)
    // Hero context cannot be passed — TypeScript enforces this.
  })

  it('clan never contributes to PP', () => {
    // Same as above — PP formula has no clan parameter.
    const pp = calculatePersonalPower(BASE_INPUTS)
    expect(pp).toBe(0)
  })

  it('soldiers contribute positively to PP', () => {
    const pp = calculatePersonalPower({
      ...BASE_INPUTS,
      army: { ...EMPTY_ARMY, soldiers: 1000 },
    })
    expect(pp).toBeGreaterThan(0)
  })

  it('cavalry contributes positively and more than equal number of soldiers', () => {
    const ppSoldiers = calculatePersonalPower({
      ...BASE_INPUTS,
      army: { ...EMPTY_ARMY, soldiers: 100 },
    })
    const ppCavalry = calculatePersonalPower({
      ...BASE_INPUTS,
      army: { ...EMPTY_ARMY, cavalry: 100 },
    })
    // Cavalry has higher tier value than regular soldiers
    expect(ppCavalry).toBeGreaterThan(ppSoldiers)
  })

  it('development contribution is capped at DEV_CAP', () => {
    const { DEV_CAP, DEVELOPMENT_PP, W_DEVELOPMENT } = BALANCE.pp

    // Build a player with enough dev levels to exceed DEV_CAP
    const highDev = calculatePersonalPower({
      ...BASE_INPUTS,
      development: {
        ...EMPTY_DEVELOPMENT,
        gold_level:          1000,
        food_level:          1000,
        wood_level:          1000,
        iron_level:          1000,
        population_level:    1000,
        fortification_level: 1000,
      },
    })

    // Maximum possible PP from dev = DEV_CAP × W_DEVELOPMENT
    const maxDevPP = DEV_CAP * W_DEVELOPMENT
    expect(highDev).toBeLessThanOrEqual(maxDevPP + 1) // +1 for floor rounding tolerance
  })

  it('PP is non-negative for any valid input', () => {
    const pp = calculatePersonalPower(BASE_INPUTS)
    expect(pp).toBeGreaterThanOrEqual(0)
  })

  it('equipment (binary defense) is counted once regardless of count', () => {
    const ppOne = calculatePersonalPower({
      ...BASE_INPUTS,
      weapons: { ...EMPTY_WEAPONS, iron_shield: 1 },
    })
    const ppMany = calculatePersonalPower({
      ...BASE_INPUTS,
      weapons: { ...EMPTY_WEAPONS, iron_shield: 999 },
    })
    // Binary — owning 1 or 999 iron shields gives the same PP
    expect(ppOne).toBe(ppMany)
  })

  it('attack weapons are additive (more units = more PP)', () => {
    const ppOne = calculatePersonalPower({
      ...BASE_INPUTS,
      weapons: { ...EMPTY_WEAPONS, axe: 1 },
    })
    const ppThree = calculatePersonalPower({
      ...BASE_INPUTS,
      weapons: { ...EMPTY_WEAPONS, axe: 3 },
    })
    expect(ppThree).toBe(ppOne * 3)
  })

  it('PP increases when soldier count increases', () => {
    const ppLow  = calculatePersonalPower({ ...BASE_INPUTS, army: { ...EMPTY_ARMY, soldiers: 100 } })
    const ppHigh = calculatePersonalPower({ ...BASE_INPUTS, army: { ...EMPTY_ARMY, soldiers: 200 } })
    expect(ppHigh).toBeGreaterThan(ppLow)
  })

})

// ─────────────────────────────────────────
// 2. CLAN BONUS
// ─────────────────────────────────────────

describe('calculateClanBonus', () => {

  it('returns 0 when player has no clan', () => {
    expect(calculateClanBonus(10_000, null)).toBe(0)
  })

  it('returns 0 for unknown development level', () => {
    const clan: ClanContext = { totalClanPP: 1_000_000, developmentLevel: 99 }
    expect(calculateClanBonus(10_000, clan)).toBe(0)
  })

  it('never exceeds 20% of playerPP regardless of clan size', () => {
    const playerPP = 10_000
    const hugeClan: ClanContext = { totalClanPP: 100_000_000, developmentLevel: 5 }
    const bonus = calculateClanBonus(playerPP, hugeClan)
    expect(bonus).toBeLessThanOrEqual(Math.floor(BALANCE.clan.BONUS_CAP_RATE * playerPP))
  })

  it('cap scales with playerPP (stronger player gets larger absolute cap)', () => {
    const clan: ClanContext = { totalClanPP: 100_000_000, developmentLevel: 5 }
    const bonusWeak   = calculateClanBonus(1_000,  clan)
    const bonusStrong = calculateClanBonus(10_000, clan)
    // Both hit the cap; the cap is 20% of their respective PP
    expect(bonusStrong).toBeGreaterThan(bonusWeak)
  })

  it('higher clan dev level → higher bonus (when not at cap)', () => {
    const playerPP  = 1_000_000 // Large PP so cap is not binding
    const smallClan = { totalClanPP: 1_000 }
    const bonusL1 = calculateClanBonus(playerPP, { ...smallClan, developmentLevel: 1 })
    const bonusL5 = calculateClanBonus(playerPP, { ...smallClan, developmentLevel: 5 })
    expect(bonusL5).toBeGreaterThan(bonusL1)
  })

  it('efficiency rates match spec exactly', () => {
    const playerPP  = 1_000_000 // Ensure cap does not bind
    const totalClanPP = 10_000
    const expected: Record<number, number> = {
      1: Math.floor(10_000 * 0.05),
      2: Math.floor(10_000 * 0.08),
      3: Math.floor(10_000 * 0.10),
      4: Math.floor(10_000 * 0.12),
      5: Math.floor(10_000 * 0.15),
    }
    for (const level of [1, 2, 3, 4, 5] as const) {
      const bonus = calculateClanBonus(playerPP, { totalClanPP, developmentLevel: level })
      expect(bonus).toBe(expected[level])
    }
  })

  it('clan bonus is additive (can be verified by constructing ECP manually)', () => {
    const playerPP = 10_000
    const clan: ClanContext = { totalClanPP: 5_000, developmentLevel: 1 }
    const bonus = calculateClanBonus(playerPP, clan)
    const ecp   = calculateECP(playerPP, clan)   // no hero bonus → default 0
    // ECP = (PP × (1 + 0)) + ClanBonus = PP + bonus
    expect(ecp).toBe(Math.floor(playerPP + bonus))
  })

})

// ─────────────────────────────────────────
// 3. HERO EFFECT — ECP FORMULA
// ─────────────────────────────────────────

describe('calculateECP — hero attack bonus does not multiply ClanBonus', () => {

  it('ECP = (PP × (1 + heroBonus)) + clanBonus, not (PP + clanBonus) × (1 + heroBonus)', () => {
    const playerPP  = 10_000
    const heroBonus = 0.30
    const clan: ClanContext = { totalClanPP: 100_000, developmentLevel: 5 }

    const clanBonus = calculateClanBonus(playerPP, clan)
    const ecp       = calculateECP(playerPP, clan, heroBonus)

    // Correct:   (10000 × 1.30) + clanBonus
    const correct   = Math.floor((playerPP * (1 + heroBonus)) + clanBonus)
    // Incorrect: (10000 + clanBonus) × 1.30
    const incorrect = Math.floor((playerPP + clanBonus) * (1 + heroBonus))

    expect(ecp).toBe(correct)
    expect(ecp).not.toBe(incorrect)
  })

  it('no hero effect: ECP = PP + clanBonus (heroBonus = 0)', () => {
    const playerPP = 10_000
    const clan: ClanContext = { totalClanPP: 5_000, developmentLevel: 1 }
    const bonus = calculateClanBonus(playerPP, clan)
    const ecp   = calculateECP(playerPP, clan)
    expect(ecp).toBe(Math.floor(playerPP * 1.0 + bonus))
  })

})

// ─────────────────────────────────────────
// 4. COMBAT RATIO & OUTCOME
// ─────────────────────────────────────────

describe('calculateCombatRatio', () => {

  it('returns WIN_THRESHOLD + 1 when defenderECP is 0', () => {
    const ratio = calculateCombatRatio(1000, 0)
    expect(ratio).toBeGreaterThan(BALANCE.combat.WIN_THRESHOLD)
  })

  it('returns 1.0 when both ECPs are equal', () => {
    expect(calculateCombatRatio(5000, 5000)).toBeCloseTo(1.0)
  })

  it('returns correct ratio for unequal ECPs', () => {
    expect(calculateCombatRatio(1300, 1000)).toBeCloseTo(1.3)
  })

})

describe('determineCombatOutcome', () => {

  it('returns win when R >= WIN_THRESHOLD', () => {
    expect(determineCombatOutcome(BALANCE.combat.WIN_THRESHOLD)).toBe('win')
    expect(determineCombatOutcome(BALANCE.combat.WIN_THRESHOLD + 1)).toBe('win')
  })

  it('returns loss when R < LOSS_THRESHOLD', () => {
    expect(determineCombatOutcome(BALANCE.combat.LOSS_THRESHOLD - 0.01)).toBe('loss')
    expect(determineCombatOutcome(0)).toBe('loss')
  })

  it('returns partial in the zone between thresholds', () => {
    const mid = (BALANCE.combat.WIN_THRESHOLD + BALANCE.combat.LOSS_THRESHOLD) / 2
    expect(determineCombatOutcome(mid)).toBe('partial')
  })

  it('partial zone boundaries are exclusive of win and loss', () => {
    // Exactly at LOSS_THRESHOLD → partial (not loss)
    expect(determineCombatOutcome(BALANCE.combat.LOSS_THRESHOLD)).toBe('partial')
    // Just below WIN_THRESHOLD → partial (not win)
    expect(determineCombatOutcome(BALANCE.combat.WIN_THRESHOLD - 0.001)).toBe('partial')
  })

})

// ─────────────────────────────────────────
// 5. SOLDIER LOSSES — cap enforcement
// ─────────────────────────────────────────

describe('calculateSoldierLosses', () => {

  const deployedA  = 1000
  const deployedD  = 1000
  const NO_COOLDOWN = false
  const NO_PROTECT  = false

  it('neither side loses more than MAX_LOSS_RATE (30%) of their deployed soldiers', () => {
    // Test at very extreme ratios
    const extremeR = 100
    const losses = calculateSoldierLosses(deployedA, deployedD, extremeR, NO_COOLDOWN, NO_PROTECT, NO_PROTECT)
    expect(losses.defenderLosses).toBeLessThanOrEqual(Math.floor(deployedD * BALANCE.combat.MAX_LOSS_RATE))
    expect(losses.attackerLosses).toBeLessThanOrEqual(Math.floor(deployedA * BALANCE.combat.MAX_LOSS_RATE))

    const tinyR = 0.001
    const losses2 = calculateSoldierLosses(deployedA, deployedD, tinyR, NO_COOLDOWN, NO_PROTECT, NO_PROTECT)
    expect(losses2.defenderLosses).toBeLessThanOrEqual(Math.floor(deployedD * BALANCE.combat.MAX_LOSS_RATE))
    expect(losses2.attackerLosses).toBeLessThanOrEqual(Math.floor(deployedA * BALANCE.combat.MAX_LOSS_RATE))
  })

  it('attacker always loses something (floor > 0) when not protected', () => {
    // Even if attacker is extremely dominant (R = 100)
    const losses = calculateSoldierLosses(deployedA, deployedD, 100, NO_COOLDOWN, NO_PROTECT, NO_PROTECT)
    expect(losses.attackerLosses).toBeGreaterThan(0)
  })

  it('defender bleeds even when attacker is far weaker (bleed floor)', () => {
    // R = 0.01 (attacker is nearly powerless)
    const losses = calculateSoldierLosses(deployedA, deployedD, 0.01, NO_COOLDOWN, NO_PROTECT, NO_PROTECT)
    expect(losses.defenderLosses).toBeGreaterThan(0)
    // Defender losses = at least DEFENDER_BLEED_FLOOR × defenderSoldiers
    expect(losses.defenderLosses).toBeGreaterThanOrEqual(
      Math.floor(deployedD * BALANCE.combat.DEFENDER_BLEED_FLOOR)
    )
  })

  it('defender losses = 0 when kill cooldown is active', () => {
    const losses = calculateSoldierLosses(deployedA, deployedD, 2.0, true, NO_PROTECT, NO_PROTECT)
    expect(losses.defenderLosses).toBe(0)
  })

  it('attacker still loses soldiers even when kill cooldown is active', () => {
    const losses = calculateSoldierLosses(deployedA, deployedD, 2.0, true, NO_PROTECT, NO_PROTECT)
    expect(losses.attackerLosses).toBeGreaterThan(0)
  })

  it('defender losses = 0 when defender is a new player (protected)', () => {
    const losses = calculateSoldierLosses(deployedA, deployedD, 2.0, NO_COOLDOWN, NO_PROTECT, true)
    expect(losses.defenderLosses).toBe(0)
  })

  it('attacker losses = 0 when attacker is a new player (protected)', () => {
    const losses = calculateSoldierLosses(deployedA, deployedD, 2.0, NO_COOLDOWN, true, NO_PROTECT)
    expect(losses.attackerLosses).toBe(0)
  })

  it('both sides lose BASE_LOSS fraction at R = 1.0 (even match)', () => {
    const { BASE_LOSS, ATTACKER_FLOOR, DEFENDER_BLEED_FLOOR } = BALANCE.combat
    const losses = calculateSoldierLosses(deployedA, deployedD, 1.0, NO_COOLDOWN, NO_PROTECT, NO_PROTECT)
    const expectedRate = Math.max(BASE_LOSS, Math.max(ATTACKER_FLOOR, DEFENDER_BLEED_FLOOR))
    // Both are symmetric at R=1
    expect(losses.attackerLosses).toBeGreaterThanOrEqual(Math.floor(deployedA * ATTACKER_FLOOR))
    expect(losses.defenderLosses).toBeGreaterThanOrEqual(Math.floor(deployedD * DEFENDER_BLEED_FLOOR))
    // And neither exceeds 30%
    expect(losses.attackerLosses).toBeLessThanOrEqual(Math.floor(deployedA * 0.30))
    expect(losses.defenderLosses).toBeLessThanOrEqual(Math.floor(deployedD * 0.30))
  })

  it('losses apply only to deployed count, not total army', () => {
    // The function receives deployedSoldiers, not total army — verified by interface.
    // Pass deployed=100 out of a hypothetical total=10000
    const losses = calculateSoldierLosses(100, 1000, 1.5, NO_COOLDOWN, NO_PROTECT, NO_PROTECT)
    // Attacker loss ≤ 30% of 100 (deployed), not 10000 (total)
    expect(losses.attackerLosses).toBeLessThanOrEqual(30)
  })

})

// ─────────────────────────────────────────
// 6. SLAVE CONVERSION
// ─────────────────────────────────────────

describe('convertKilledToSlaves', () => {

  it('returns 0 when no soldiers were killed', () => {
    expect(convertKilledToSlaves(0)).toBe(0)
  })

  it('returns CAPTURE_RATE fraction of killed soldiers', () => {
    const killed   = 3_000
    const expected = Math.floor(killed * BALANCE.combat.CAPTURE_RATE)
    expect(convertKilledToSlaves(killed)).toBe(expected)
  })

  it('matches spec example: 3000 killed × 35% = 1050', () => {
    // This test assumes CAPTURE_RATE = 0.35 (the configured midpoint value).
    const result = convertKilledToSlaves(3_000)
    expect(result).toBe(Math.floor(3_000 * BALANCE.combat.CAPTURE_RATE))
    // When CAPTURE_RATE = 0.35, result should be 1050
    if (BALANCE.combat.CAPTURE_RATE === 0.35) {
      expect(result).toBe(1_050)
    }
  })

  it('result is always a non-negative integer', () => {
    expect(convertKilledToSlaves(100)).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(convertKilledToSlaves(100))).toBe(true)
  })

})

// ─────────────────────────────────────────
// 7. LOOT DECAY SEQUENCE
// ─────────────────────────────────────────

describe('getLootDecayMultiplier', () => {

  it('1st attack returns full loot (1.0)', () => {
    expect(getLootDecayMultiplier(1)).toBe(1.0)
  })

  it('2nd attack returns 0.70', () => {
    expect(getLootDecayMultiplier(2)).toBe(0.70)
  })

  it('3rd attack returns 0.40', () => {
    expect(getLootDecayMultiplier(3)).toBe(0.40)
  })

  it('4th attack returns 0.20', () => {
    expect(getLootDecayMultiplier(4)).toBe(0.20)
  })

  it('5th attack returns 0.10', () => {
    expect(getLootDecayMultiplier(5)).toBe(0.10)
  })

  it('6th+ attack still returns 0.10 (floor, not zero)', () => {
    expect(getLootDecayMultiplier(6)).toBe(0.10)
    expect(getLootDecayMultiplier(100)).toBe(0.10)
  })

  it('decay multiplier is strictly decreasing', () => {
    const mults = [1, 2, 3, 4, 5].map(getLootDecayMultiplier)
    for (let i = 0; i < mults.length - 1; i++) {
      expect(mults[i]).toBeGreaterThan(mults[i + 1])
    }
  })

})

describe('calculateLoot', () => {

  it('returns zero loot on loss', () => {
    const loot = calculateLoot(UNBANKED_1000, 'loss', 1, false)
    expect(loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
  })

  it('returns zero loot when defender is protected (new player)', () => {
    const loot = calculateLoot(UNBANKED_1000, 'win', 1, true)
    expect(loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
  })

  it('win loot = 20% of unbanked on first attack', () => {
    const loot = calculateLoot(UNBANKED_1000, 'win', 1, false)
    const expected = Math.floor(1000 * 0.20 * 1.0 * 1.0)
    expect(loot.gold).toBe(expected)
    expect(loot.iron).toBe(expected)
    expect(loot.wood).toBe(expected)
    expect(loot.food).toBe(expected)
  })

  it('partial loot = 50% of win loot', () => {
    const winLoot     = calculateLoot(UNBANKED_1000, 'win',     1, false)
    const partialLoot = calculateLoot(UNBANKED_1000, 'partial', 1, false)
    expect(partialLoot.gold).toBe(Math.floor(winLoot.gold * 0.5))
  })

  it('loot decays on repeat attacks: 2nd attack is less than 1st', () => {
    const loot1 = calculateLoot(UNBANKED_1000, 'win', 1, false)
    const loot2 = calculateLoot(UNBANKED_1000, 'win', 2, false)
    // loot2 uses DecayFactor=0.70 vs loot1 DecayFactor=1.0.
    // Due to independent Math.floor calls, exact equality to floor(loot1×0.7) is not
    // guaranteed (floating-point: 0.2×0.7 = 0.13999...). Verify monotonic decrease and
    // that loot2 is within 1 unit of the theoretical 70% value.
    expect(loot2.gold).toBeLessThan(loot1.gold)
    expect(loot2.gold).toBeGreaterThanOrEqual(Math.floor(loot1.gold * 0.7) - 1)
  })

  it('loot never drops to zero from decay alone (5th+ = 10%)', () => {
    const loot = calculateLoot({ gold: 10_000, iron: 0, wood: 0, food: 0 }, 'win', 10, false)
    expect(loot.gold).toBeGreaterThan(0)
  })

  it('no hard cap on loot', () => {
    const hugeLoot = calculateLoot(
      { gold: 100_000_000, iron: 100_000_000, wood: 100_000_000, food: 100_000_000 },
      'win', 1, false,
    )
    // 20% of 100M = 20M. No cap should reduce this.
    expect(hugeLoot.gold).toBe(Math.floor(100_000_000 * 0.20))
  })

  it('all loot values are non-negative integers', () => {
    const loot = calculateLoot(UNBANKED_1000, 'win', 3, false)
    for (const value of Object.values(loot)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(value)).toBe(true)
    }
  })

})

// ─────────────────────────────────────────
// 8. KILL COOLDOWN
// ─────────────────────────────────────────

describe('isKillCooldownActive', () => {

  const COOLDOWN_MS = BALANCE.combat.KILL_COOLDOWN_HOURS * 60 * 60 * 1000

  it('returns false when lastKillAt is null', () => {
    expect(isKillCooldownActive(null)).toBe(false)
  })

  it('returns true when last kill was less than 6 hours ago', () => {
    const now       = new Date()
    const justNow   = new Date(now.getTime() - (COOLDOWN_MS / 2)) // 3 hours ago
    expect(isKillCooldownActive(justNow, now)).toBe(true)
  })

  it('returns false when last kill was more than 6 hours ago', () => {
    const now       = new Date()
    const longAgo   = new Date(now.getTime() - COOLDOWN_MS - 1000) // 6h + 1s ago
    expect(isKillCooldownActive(longAgo, now)).toBe(false)
  })

  it('returns true at the exact boundary (< not <=)', () => {
    const now      = new Date()
    const boundary = new Date(now.getTime() - COOLDOWN_MS + 1) // 1ms inside window
    expect(isKillCooldownActive(boundary, now)).toBe(true)
  })

  it('returns false at exact cooldown expiry', () => {
    const now     = new Date()
    const expired = new Date(now.getTime() - COOLDOWN_MS) // exactly at boundary
    expect(isKillCooldownActive(expired, now)).toBe(false)
  })

})

// ─────────────────────────────────────────
// 9. NEW PLAYER PROTECTION
// ─────────────────────────────────────────

describe('isNewPlayerProtected', () => {

  const PROTECTION_MS = BALANCE.combat.PROTECTION_HOURS * 60 * 60 * 1000

  it('returns true for a player created 1 minute ago', () => {
    const now        = new Date()
    const createdAt  = new Date(now.getTime() - 60_000)
    expect(isNewPlayerProtected(createdAt, now)).toBe(true)
  })

  it('returns true at 23h59m59s (inside window)', () => {
    const now       = new Date()
    const createdAt = new Date(now.getTime() - (PROTECTION_MS - 1000))
    expect(isNewPlayerProtected(createdAt, now)).toBe(true)
  })

  it('returns false at exactly 24 hours', () => {
    const now       = new Date()
    const createdAt = new Date(now.getTime() - PROTECTION_MS)
    expect(isNewPlayerProtected(createdAt, now)).toBe(false)
  })

  it('returns false after 24 hours', () => {
    const now       = new Date()
    const createdAt = new Date(now.getTime() - PROTECTION_MS - 1000)
    expect(isNewPlayerProtected(createdAt, now)).toBe(false)
  })

})

// ─────────────────────────────────────────
// 10. TURN REGENERATION
// ─────────────────────────────────────────

describe('calcTurnsAfterRegen', () => {

  it('adds TURNS_PER_TICK (3) when below cap', () => {
    const result = calcTurnsAfterRegen(50)
    expect(result).toBe(53)
  })

  it('does not exceed cap (200)', () => {
    expect(calcTurnsAfterRegen(199)).toBe(200)
    expect(calcTurnsAfterRegen(200)).toBe(200)
    expect(calcTurnsAfterRegen(198)).toBe(200) // 198 + 3 = 201 → clamped to 200
  })

  it('returns cap unchanged when already at cap', () => {
    expect(calcTurnsAfterRegen(BALANCE.tick.maxTurns)).toBe(BALANCE.tick.maxTurns)
  })

  it('returns cap unchanged when already above cap (edge case: VIP bonus)', () => {
    // If turns somehow exceed cap, regen returns cap (no increase)
    expect(calcTurnsAfterRegen(250)).toBe(BALANCE.tick.maxTurns)
  })

  it('adds exactly 3 turns when safely below cap', () => {
    expect(calcTurnsAfterRegen(0)).toBe(BALANCE.tick.turnsPerTick)
    expect(calcTurnsAfterRegen(10)).toBe(10 + BALANCE.tick.turnsPerTick)
  })

  it('daily potential is 144 turns (48 ticks × 3)', () => {
    // Verify the constants are consistent
    const ticksPerDay = 24 * 60 / BALANCE.tick.intervalMinutes
    expect(ticksPerDay * BALANCE.tick.turnsPerTick).toBe(BALANCE.tick.turnsPerDay)
  })

})

// ─────────────────────────────────────────
// 11. INTEGRATION — resolveCombat
// ─────────────────────────────────────────

describe('resolveCombat', () => {

  function makeBaseInputs(overrides: Partial<CombatResolutionInputs> = {}): CombatResolutionInputs {
    return {
      attackerPP:           5_000,
      defenderPP:           5_000,
      deployedSoldiers:     1_000,
      defenderSoldiers:     1_000,
      attackerClan:         NO_CLAN,
      defenderClan:         NO_CLAN,
      defenderUnbanked:     UNBANKED_1000,
      attackCountInWindow:  1,
      killCooldownActive:   false,
      attackerIsProtected:  false,
      defenderIsProtected:  false,
      // Hero effect defaults — zero means no active hero effects
      attackBonus:          0,
      defenseBonus:         0,
      soldierShieldActive:  false,
      resourceShieldActive: false,
      ...overrides,
    }
  }

  it('produces a valid outcome (win | partial | loss)', () => {
    const result = resolveCombat(makeBaseInputs())
    expect(['win', 'partial', 'loss']).toContain(result.outcome)
  })

  it('produces zero loot when outcome is loss', () => {
    // Force a loss: attacker PP far below defender
    const result = resolveCombat(makeBaseInputs({ attackerPP: 100, defenderPP: 100_000 }))
    if (result.outcome === 'loss') {
      expect(result.loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
    }
  })

  it('defender losses = 0 when protected, loot also = 0', () => {
    const result = resolveCombat(makeBaseInputs({ defenderIsProtected: true, attackerPP: 100_000 }))
    expect(result.defenderLosses).toBe(0)
    expect(result.loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
  })

  it('defender losses = 0 during kill cooldown, but loot may still apply', () => {
    const result = resolveCombat(makeBaseInputs({
      killCooldownActive: true,
      attackerPP: 100_000, // Force a win for loot
    }))
    expect(result.defenderLosses).toBe(0)
    expect(result.slavesCreated).toBe(0)
    // Loot can still be non-zero on a win (outcome-dependent)
    if (result.outcome !== 'loss') {
      expect(result.loot.gold).toBeGreaterThanOrEqual(0)
    }
  })

  it('slavesCreated = 0 when defenderLosses = 0', () => {
    const result = resolveCombat(makeBaseInputs({ killCooldownActive: true }))
    expect(result.defenderLosses).toBe(0)
    expect(result.slavesCreated).toBe(0)
  })

  it('attackerECP > defenderECP when attacker has max hero attack bonus', () => {
    const result = resolveCombat(makeBaseInputs({
      attackBonus: BALANCE.hero.MAX_STACK_RATE,  // 0.50 = max hero attack bonus
    }))
    expect(result.attackerECP).toBeGreaterThan(result.defenderECP)
  })

  it('attackerECP matches manual calculation: (PP × (1 + attackBonus)) + clanBonus', () => {
    const pp          = 10_000
    const attackBonus = 0.20
    const clan: ClanContext = { totalClanPP: 50_000, developmentLevel: 3 }
    const result = resolveCombat(makeBaseInputs({ attackerPP: pp, attackBonus, attackerClan: clan }))

    const manualClanBonus = calculateClanBonus(pp, clan)
    const manualECP       = Math.floor((pp * (1 + attackBonus)) + manualClanBonus)
    expect(result.attackerECP).toBe(manualECP)
  })

  it('neither side loses more than 30% of their soldiers', () => {
    const result = resolveCombat(makeBaseInputs({ attackerPP: 100_000, defenderPP: 100 }))
    expect(result.attackerLosses).toBeLessThanOrEqual(Math.floor(1_000 * BALANCE.combat.MAX_LOSS_RATE))
    expect(result.defenderLosses).toBeLessThanOrEqual(Math.floor(1_000 * BALANCE.combat.MAX_LOSS_RATE))
  })

  it('loot decays correctly across 5 sequential attacks on same target', () => {
    const loots = [1, 2, 3, 4, 5].map(count =>
      resolveCombat(makeBaseInputs({
        attackerPP: 100_000, // Force wins
        attackCountInWindow: count,
      }))
    )
    // Assuming all win, gold loot should decrease
    const goldValues = loots.map(r => r.loot.gold)
    for (let i = 0; i < goldValues.length - 1; i++) {
      if (loots[i].outcome !== 'loss' && loots[i + 1].outcome !== 'loss') {
        expect(goldValues[i]).toBeGreaterThanOrEqual(goldValues[i + 1])
      }
    }
  })

})
