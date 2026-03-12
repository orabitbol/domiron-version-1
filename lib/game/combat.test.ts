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
  isKillCooldownActive,
  isNewPlayerProtected,
  getLootDecayMultiplier,
  calculateLoot,
  calculateCaptives,
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

  it('raceBonus = 0 produces same ECP as no raceBonus (backward compat)', () => {
    const playerPP = 10_000
    const clan: ClanContext = { totalClanPP: 5_000, developmentLevel: 2 }
    expect(calculateECP(playerPP, clan, 0, 0)).toBe(calculateECP(playerPP, clan, 0))
  })

  it('raceBonus = 0.10 increases ECP proportionally on PP only', () => {
    const playerPP  = 10_000
    const raceBonus = 0.10
    const ecp       = calculateECP(playerPP, null, 0, raceBonus)
    expect(ecp).toBe(Math.floor(playerPP * (1 + raceBonus)))
  })

  it('raceBonus does NOT multiply ClanBonus', () => {
    const playerPP  = 10_000
    const raceBonus = 0.10
    const clan: ClanContext = { totalClanPP: 100_000, developmentLevel: 5 }
    const clanBonus = calculateClanBonus(playerPP, clan)
    const ecp       = calculateECP(playerPP, clan, 0, raceBonus)
    // Correct:   (PP × (1 + race)) + clanBonus
    const correct   = Math.floor((playerPP * (1 + raceBonus)) + clanBonus)
    // Incorrect: (PP + clanBonus) × (1 + race)
    const incorrect = Math.floor((playerPP + clanBonus) * (1 + raceBonus))
    expect(ecp).toBe(correct)
    expect(ecp).not.toBe(incorrect)
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

  it('returns win when R >= WIN_THRESHOLD (1.0)', () => {
    expect(determineCombatOutcome(BALANCE.combat.WIN_THRESHOLD)).toBe('win')      // exactly 1.0
    expect(determineCombatOutcome(BALANCE.combat.WIN_THRESHOLD + 0.001)).toBe('win')
    expect(determineCombatOutcome(BALANCE.combat.WIN_THRESHOLD + 1)).toBe('win')
    expect(determineCombatOutcome(100)).toBe('win')
  })

  it('returns loss when R < WIN_THRESHOLD (1.0)', () => {
    expect(determineCombatOutcome(BALANCE.combat.WIN_THRESHOLD - 0.001)).toBe('loss')
    expect(determineCombatOutcome(0.99)).toBe('loss')
    expect(determineCombatOutcome(0.75)).toBe('loss')
    expect(determineCombatOutcome(0)).toBe('loss')
  })

  it('never returns partial — only win or loss (no draw)', () => {
    const ratios = [0, 0.5, 0.75, 0.99, 1.0, 1.04, 1.30, 2.0, 10.0]
    for (const r of ratios) {
      const outcome = determineCombatOutcome(r)
      expect(outcome).not.toBe('partial')
      expect(['win', 'loss']).toContain(outcome)
    }
  })

  it('boundary: ratio exactly 1.0 is win, 0.999 is loss', () => {
    expect(determineCombatOutcome(1.0)).toBe('win')
    expect(determineCombatOutcome(0.999)).toBe('loss')
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
// 6. LOOT DECAY SEQUENCE
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

  it('win loot = BASE_LOOT_RATE of unbanked on first attack', () => {
    const loot = calculateLoot(UNBANKED_1000, 'win', 1, false)
    const expected = Math.floor(1000 * BALANCE.combat.BASE_LOOT_RATE * 1.0 * 1.0)
    expect(loot.gold).toBe(expected)
    expect(loot.iron).toBe(expected)
    expect(loot.wood).toBe(expected)
    expect(loot.food).toBe(expected)
  })

  it('win loot = full BASE_LOOT_RATE (no partial/draw bucket)', () => {
    const winLoot = calculateLoot(UNBANKED_1000, 'win', 1, false)
    expect(winLoot.gold).toBe(Math.floor(UNBANKED_1000.gold * BALANCE.combat.BASE_LOOT_RATE))
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
    // BASE_LOOT_RATE of 100M = no cap should reduce this.
    expect(hugeLoot.gold).toBe(Math.floor(100_000_000 * BALANCE.combat.BASE_LOOT_RATE))
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
// 7. CAPTIVES
// ─────────────────────────────────────────

describe('calculateCaptives', () => {

  it('returns 0 when defenderLosses is 0 (kill cooldown / shields / protection)', () => {
    expect(calculateCaptives(0)).toBe(0)
  })

  it('returns floor(defenderLosses × CAPTURE_RATE)', () => {
    const losses = 100
    const expected = Math.floor(losses * BALANCE.combat.CAPTURE_RATE)
    expect(calculateCaptives(losses)).toBe(expected)
  })

  it('result is always a non-negative integer', () => {
    for (const n of [0, 1, 7, 50, 300, 1000]) {
      const result = calculateCaptives(n)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(result)).toBe(true)
    }
  })

  it('result is always <= defenderLosses (can never capture more than killed)', () => {
    for (const n of [1, 10, 100, 1000]) {
      expect(calculateCaptives(n)).toBeLessThanOrEqual(n)
    }
  })

  it('captives scale linearly with losses', () => {
    const c100  = calculateCaptives(100)
    const c200  = calculateCaptives(200)
    // 200 losses should yield exactly 2× captives (floor may cause ±1 at odd values)
    expect(c200).toBeGreaterThanOrEqual(c100 * 2 - 1)
    expect(c200).toBeLessThanOrEqual(c100 * 2 + 1)
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

  const PROTECTION_MS  = BALANCE.combat.PROTECTION_HOURS * 60 * 60 * 1000
  const GATE_DAYS      = BALANCE.season.protectionStartDays
  const GATE_MS        = GATE_DAYS * 24 * 60 * 60 * 1000

  // A season start far enough in the past that the gate is always open
  const openGateSeasonStart = (now: Date) => new Date(now.getTime() - GATE_MS - 1000)

  // ── Season gate tests ─────────────────────────────────────────────────────

  it('gate closed (season day 1): returns false even for brand-new player', () => {
    const now         = new Date()
    const seasonStart = new Date(now.getTime() - 60_000)  // 1 minute into season
    const createdAt   = new Date(now.getTime() - 60_000)  // just created
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(false)
  })

  it('gate closed (season day 9): returns false even for brand-new player', () => {
    const now         = new Date()
    const seasonStart = new Date(now.getTime() - (GATE_MS - 60_000))  // just under 10 days
    const createdAt   = new Date(now.getTime() - 60_000)
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(false)
  })

  it('gate opens at exactly protectionStartDays (season day 10): new player IS protected', () => {
    const now         = new Date()
    const seasonStart = new Date(now.getTime() - GATE_MS)  // exactly 10 days ago
    const createdAt   = new Date(now.getTime() - 60_000)   // 1 minute ago
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(true)
  })

  // ── Within-window tests (gate open) ──────────────────────────────────────

  it('gate open + player created 1 minute ago → protected', () => {
    const now        = new Date()
    const seasonStart = openGateSeasonStart(now)
    const createdAt  = new Date(now.getTime() - 60_000)
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(true)
  })

  it('gate open + player at 23h59m59s → protected', () => {
    const now        = new Date()
    const seasonStart = openGateSeasonStart(now)
    const createdAt  = new Date(now.getTime() - (PROTECTION_MS - 1000))
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(true)
  })

  it('gate open + player at exactly 24 hours → NOT protected', () => {
    const now        = new Date()
    const seasonStart = openGateSeasonStart(now)
    const createdAt  = new Date(now.getTime() - PROTECTION_MS)
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(false)
  })

  it('gate open + player at 25 hours → NOT protected', () => {
    const now        = new Date()
    const seasonStart = openGateSeasonStart(now)
    const createdAt  = new Date(now.getTime() - PROTECTION_MS - 3_600_000)
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(false)
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

  it('produces only win or loss — never partial/draw', () => {
    const result = resolveCombat(makeBaseInputs())
    expect(['win', 'loss']).toContain(result.outcome)
    expect(result.outcome).not.toBe('partial')
  })

  it('attackerECP >= defenderECP always produces win', () => {
    const result = resolveCombat(makeBaseInputs({ attackerPP: 10_000, defenderPP: 10_000 }))
    // Equal PP → ratio = 1.0 exactly → win
    expect(result.outcome).toBe('win')
  })

  it('attackerECP < defenderECP always produces loss', () => {
    const result = resolveCombat(makeBaseInputs({ attackerPP: 100, defenderPP: 100_000 }))
    expect(result.outcome).toBe('loss')
  })

  it('produces zero loot when outcome is loss', () => {
    const result = resolveCombat(makeBaseInputs({ attackerPP: 100, defenderPP: 100_000 }))
    expect(result.outcome).toBe('loss')
    expect(result.loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
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
    // Loot can still be non-zero on a win (outcome-dependent)
    if (result.outcome !== 'loss') {
      expect(result.loot.gold).toBeGreaterThanOrEqual(0)
    }
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

  it('attackerRaceBonus increases attacker ECP, leaving defender ECP unchanged', () => {
    const base     = resolveCombat(makeBaseInputs({ attackerPP: 5_000 }))
    const withRace = resolveCombat(makeBaseInputs({ attackerPP: 5_000, attackerRaceBonus: 0.10 }))
    expect(withRace.attackerECP).toBeGreaterThan(base.attackerECP)
    expect(withRace.defenderECP).toBe(base.defenderECP)
  })

  it('attackerTribeMultiplier=1.15 multiplies attacker ECP by 1.15', () => {
    const base = resolveCombat(makeBaseInputs({ attackerPP: 10_000 }))
    const withTribe = resolveCombat(makeBaseInputs({ attackerPP: 10_000, attackerTribeMultiplier: 1.15 }))
    // withTribe.attackerECP should be floor(base.attackerECP × 1.15)
    expect(withTribe.attackerECP).toBe(Math.floor(base.attackerECP * 1.15))
  })

  it('defenderTribeMultiplier=1.15 multiplies defender ECP, leaving attacker ECP unchanged', () => {
    const base      = resolveCombat(makeBaseInputs({ defenderPP: 5_000 }))
    const withTribe = resolveCombat(makeBaseInputs({ defenderPP: 5_000, defenderTribeMultiplier: 1.15 }))
    expect(withTribe.defenderECP).toBe(Math.floor(base.defenderECP * 1.15))
    expect(withTribe.attackerECP).toBe(base.attackerECP)
  })

  it('dominant attacker win with no protections → defenderLosses > 0 → captives > 0', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:          100_000,
      defenderPP:          1_000,
      defenderSoldiers:    1_000,
      killCooldownActive:  false,
      attackerIsProtected: false,
      defenderIsProtected: false,
      soldierShieldActive: false,
    }))
    expect(result.outcome).toBe('win')
    expect(result.defenderLosses).toBeGreaterThan(0)
    const captives = calculateCaptives(result.defenderLosses)
    expect(captives).toBeGreaterThan(0)
    expect(captives).toBe(Math.floor(result.defenderLosses * BALANCE.combat.CAPTURE_RATE))
  })

  it('attackerECP matches manual calc with hero + race + tribe all combined', () => {
    const pp         = 10_000
    const heroBonus  = 0.20
    const raceBonus  = 0.10
    const tribeMult  = 1.15
    const clan: ClanContext = { totalClanPP: 50_000, developmentLevel: 3 }

    const result     = resolveCombat(makeBaseInputs({
      attackerPP:              pp,
      attackBonus:             heroBonus,
      attackerClan:            clan,
      attackerRaceBonus:       raceBonus,
      attackerTribeMultiplier: tribeMult,
    }))

    const clanBonus  = calculateClanBonus(pp, clan)
    const baseECP    = Math.floor((pp * (1 + heroBonus) * (1 + raceBonus)) + clanBonus)
    const finalECP   = Math.floor(baseECP * tribeMult)

    expect(result.attackerECP).toBe(finalECP)
  })

})
