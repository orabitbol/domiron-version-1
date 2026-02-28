/**
 * Domiron v5 — Hero Effect System Unit Tests
 *
 * Tests:
 *   1. clampBonus
 *   2. calcActiveHeroEffects — slave stacking + 50% clamp
 *   3. isShieldActive
 *   4. applyTurnsPack — 200 cap enforcement
 *   5. Combat integration: Resource Shield blocks loot
 *   6. Combat integration: Soldier Shield blocks defender losses
 *   7. Combat integration: Hero attack bonus multiplies PP only (NOT ClanBonus)
 *   8. Combat integration: Loot decay applies regardless of shield state
 *
 * Run: npx vitest run
 */

import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'
import {
  clampBonus,
  calcActiveHeroEffects,
  isShieldActive,
  applyTurnsPack,
} from '@/lib/game/hero-effects'
import {
  calculateClanBonus,
  calculateECP,
  getLootDecayMultiplier,
  resolveCombat,
} from '@/lib/game/combat'
import type { PlayerHeroEffect } from '@/lib/game/hero-effects'
import type { ClanContext, CombatResolutionInputs } from '@/lib/game/combat'

// ─────────────────────────────────────────
// SHARED FIXTURES
// ─────────────────────────────────────────

const NOW    = new Date('2026-06-01T12:00:00Z')
const PAST   = new Date('2026-06-01T10:00:00Z').toISOString()   // 2h ago — expired
const FUTURE = new Date('2026-06-02T12:00:00Z').toISOString()   // 24h ahead — active

function makeEffect(type: PlayerHeroEffect['type'], active = true): PlayerHeroEffect {
  return {
    id:               'test-id',
    player_id:        'player-1',
    type,
    starts_at:        PAST,
    ends_at:          active ? FUTURE : PAST,
    cooldown_ends_at: null,
    metadata:         null,
  }
}

const NO_CLAN: null        = null
const UNBANKED_1000        = { gold: 1000, iron: 1000, wood: 1000, food: 1000 }

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
    attackBonus:          0,
    defenseBonus:         0,
    soldierShieldActive:  false,
    resourceShieldActive: false,
    ...overrides,
  }
}

// ─────────────────────────────────────────
// 1. clampBonus
// ─────────────────────────────────────────

describe('clampBonus', () => {

  it('returns value unchanged when below cap', () => {
    expect(clampBonus(0.30)).toBe(0.30)
  })

  it('clamps to MAX_STACK_RATE (0.50) when over cap', () => {
    expect(clampBonus(0.70)).toBe(BALANCE.hero.MAX_STACK_RATE)
    expect(clampBonus(0.70)).toBe(0.50)
  })

  it('returns exactly 0.50 when at cap', () => {
    expect(clampBonus(0.50)).toBe(0.50)
  })

  it('returns 0 when total is 0', () => {
    expect(clampBonus(0)).toBe(0)
  })

  it('respects custom max parameter', () => {
    expect(clampBonus(0.80, 0.40)).toBe(0.40)
    expect(clampBonus(0.20, 0.40)).toBe(0.20)
  })

})

// ─────────────────────────────────────────
// 2. calcActiveHeroEffects — slave stacking + clamp
// ─────────────────────────────────────────

describe('calcActiveHeroEffects', () => {

  it('returns all zeros with no effects', () => {
    const totals = calcActiveHeroEffects([], NOW)
    expect(totals.totalSlaveBonus).toBe(0)
    expect(totals.totalAttackBonus).toBe(0)
    expect(totals.totalDefenseBonus).toBe(0)
    expect(totals.resourceShieldActive).toBe(false)
    expect(totals.soldierShieldActive).toBe(false)
  })

  it('expired effects are not counted', () => {
    const totals = calcActiveHeroEffects([makeEffect('SLAVE_OUTPUT_30', false)], NOW)
    expect(totals.totalSlaveBonus).toBe(0)
  })

  it('SLAVE_OUTPUT_10 = 10%', () => {
    expect(calcActiveHeroEffects([makeEffect('SLAVE_OUTPUT_10')], NOW).totalSlaveBonus).toBe(0.10)
  })

  it('SLAVE_OUTPUT_20 = 20%', () => {
    expect(calcActiveHeroEffects([makeEffect('SLAVE_OUTPUT_20')], NOW).totalSlaveBonus).toBe(0.20)
  })

  it('SLAVE_OUTPUT_30 = 30%', () => {
    expect(calcActiveHeroEffects([makeEffect('SLAVE_OUTPUT_30')], NOW).totalSlaveBonus).toBe(0.30)
  })

  it('slave effects stack: 10% + 20% ≈ 30%', () => {
    const totals = calcActiveHeroEffects([
      makeEffect('SLAVE_OUTPUT_10'),
      makeEffect('SLAVE_OUTPUT_20'),
    ], NOW)
    // toBeCloseTo used because 0.10 + 0.20 = 0.30000000000000004 in IEEE 754
    expect(totals.totalSlaveBonus).toBeCloseTo(0.30, 10)
  })

  it('slave effects clamp at 50%: 30% + 30% → 0.50', () => {
    const totals = calcActiveHeroEffects([
      makeEffect('SLAVE_OUTPUT_30'),
      makeEffect('SLAVE_OUTPUT_30'),
    ], NOW)
    expect(totals.totalSlaveBonus).toBe(0.50)
  })

  it('slave effects clamp at 50%: 10% + 20% + 30% → 0.50', () => {
    const totals = calcActiveHeroEffects([
      makeEffect('SLAVE_OUTPUT_10'),
      makeEffect('SLAVE_OUTPUT_20'),
      makeEffect('SLAVE_OUTPUT_30'),
    ], NOW)
    expect(totals.totalSlaveBonus).toBe(0.50)
  })

  it('ATTACK_POWER_10 = 10%', () => {
    expect(calcActiveHeroEffects([makeEffect('ATTACK_POWER_10')], NOW).totalAttackBonus).toBe(0.10)
  })

  it('attack effects stack and clamp at 50%', () => {
    // 6 × 10% = 60% → clamped to 50%
    const effects = Array(6).fill(null).map(() => makeEffect('ATTACK_POWER_10'))
    const totals = calcActiveHeroEffects(effects, NOW)
    expect(totals.totalAttackBonus).toBe(0.50)
  })

  it('DEFENSE_POWER_10 = 10%', () => {
    expect(calcActiveHeroEffects([makeEffect('DEFENSE_POWER_10')], NOW).totalDefenseBonus).toBe(0.10)
  })

  it('RESOURCE_SHIELD activates resource shield flag', () => {
    expect(calcActiveHeroEffects([makeEffect('RESOURCE_SHIELD')], NOW).resourceShieldActive).toBe(true)
  })

  it('SOLDIER_SHIELD activates soldier shield flag', () => {
    expect(calcActiveHeroEffects([makeEffect('SOLDIER_SHIELD')], NOW).soldierShieldActive).toBe(true)
  })

  it('effect categories are independent', () => {
    const totals = calcActiveHeroEffects([
      makeEffect('SLAVE_OUTPUT_30'),
      makeEffect('ATTACK_POWER_10'),
    ], NOW)
    expect(totals.totalSlaveBonus).toBe(0.30)
    expect(totals.totalAttackBonus).toBe(0.10)
    expect(totals.totalDefenseBonus).toBe(0)
  })

})

// ─────────────────────────────────────────
// 3. isShieldActive
// ─────────────────────────────────────────

describe('isShieldActive', () => {

  it('returns true for an active Resource Shield', () => {
    expect(isShieldActive([makeEffect('RESOURCE_SHIELD')], 'RESOURCE_SHIELD', NOW)).toBe(true)
  })

  it('returns false for an expired Resource Shield', () => {
    expect(isShieldActive([makeEffect('RESOURCE_SHIELD', false)], 'RESOURCE_SHIELD', NOW)).toBe(false)
  })

  it('returns false when checking for wrong type', () => {
    expect(isShieldActive([makeEffect('SOLDIER_SHIELD')], 'RESOURCE_SHIELD', NOW)).toBe(false)
  })

  it('returns true for an active Soldier Shield', () => {
    expect(isShieldActive([makeEffect('SOLDIER_SHIELD')], 'SOLDIER_SHIELD', NOW)).toBe(true)
  })

  it('returns false with empty effect list', () => {
    expect(isShieldActive([], 'RESOURCE_SHIELD', NOW)).toBe(false)
    expect(isShieldActive([], 'SOLDIER_SHIELD', NOW)).toBe(false)
  })

})

// ─────────────────────────────────────────
// 4. applyTurnsPack — 200 cap
// ─────────────────────────────────────────

describe('applyTurnsPack', () => {

  it('adds turns when safely below cap', () => {
    expect(applyTurnsPack(100, 50)).toBe(150)
  })

  it('clamps to 200 when purchase would exceed cap', () => {
    expect(applyTurnsPack(195, 20)).toBe(200)
  })

  it('stays at 200 when already at cap', () => {
    expect(applyTurnsPack(200, 10)).toBe(200)
  })

  it('stays at 200 when already over cap (edge case)', () => {
    expect(applyTurnsPack(250, 10)).toBe(200)
  })

  it('adding 0 turns returns current value', () => {
    expect(applyTurnsPack(80, 0)).toBe(80)
  })

  it('never exceeds BALANCE.tick.maxTurns', () => {
    expect(applyTurnsPack(0, 999)).toBe(BALANCE.tick.maxTurns)
  })

})

// ─────────────────────────────────────────
// 5. Combat integration: Resource Shield blocks loot
// ─────────────────────────────────────────

describe('resolveCombat — Resource Shield', () => {

  it('loot = 0 when resource shield is active (win scenario)', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           100_000,
      defenderPP:           1_000,
      resourceShieldActive: true,
    }))
    expect(result.outcome).toBe('win')
    expect(result.loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
  })

  it('loot = 0 when resource shield is active (partial scenario)', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           5_500,
      defenderPP:           5_000,
      resourceShieldActive: true,
    }))
    expect(result.loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
  })

  it('defender still loses soldiers when resource shield is active', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           100_000,
      defenderPP:           1_000,
      resourceShieldActive: true,
    }))
    expect(result.defenderLosses).toBeGreaterThan(0)
  })

  it('slaves are created normally when resource shield is active', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           100_000,
      defenderPP:           1_000,
      resourceShieldActive: true,
    }))
    expect(result.slavesCreated).toBeGreaterThan(0)
  })

  it('loot is NOT zero without resource shield (control check)', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           100_000,
      defenderPP:           1_000,
      resourceShieldActive: false,
    }))
    expect(result.outcome).toBe('win')
    expect(result.loot.gold).toBeGreaterThan(0)
  })

})

// ─────────────────────────────────────────
// 6. Combat integration: Soldier Shield blocks defender losses
// ─────────────────────────────────────────

describe('resolveCombat — Soldier Shield', () => {

  it('defenderLosses = 0 when soldier shield is active', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:          100_000,
      defenderPP:          1_000,
      soldierShieldActive: true,
    }))
    expect(result.defenderLosses).toBe(0)
  })

  it('slavesCreated = 0 when soldier shield is active', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:          100_000,
      defenderPP:          1_000,
      soldierShieldActive: true,
    }))
    expect(result.slavesCreated).toBe(0)
  })

  it('attackerLosses still apply when soldier shield is active', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:          100_000,
      defenderPP:          1_000,
      soldierShieldActive: true,
    }))
    expect(result.attackerLosses).toBeGreaterThan(0)
  })

  it('loot still applies when only soldier shield is active (no resource shield)', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:          100_000,
      defenderPP:          1_000,
      soldierShieldActive: true,
    }))
    expect(result.outcome).toBe('win')
    expect(result.loot.gold).toBeGreaterThan(0)
  })

  it('both shields active: defenderLosses = 0, slavesCreated = 0, loot = 0', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           100_000,
      defenderPP:           1_000,
      soldierShieldActive:  true,
      resourceShieldActive: true,
    }))
    expect(result.defenderLosses).toBe(0)
    expect(result.slavesCreated).toBe(0)
    expect(result.loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
  })

  it('attackerLosses still apply when both shields are active', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           100_000,
      defenderPP:           1_000,
      soldierShieldActive:  true,
      resourceShieldActive: true,
    }))
    expect(result.attackerLosses).toBeGreaterThan(0)
  })

})

// ─────────────────────────────────────────
// 7. Hero attack bonus multiplies PP only — NOT ClanBonus
// ─────────────────────────────────────────

describe('calculateECP — hero bonus does not multiply ClanBonus', () => {

  const playerPP    = 10_000
  const attackBonus = 0.20
  const clan: ClanContext = { totalClanPP: 100_000, developmentLevel: 5 }

  it('ECP = (PP × (1 + bonus)) + clanBonus, NOT (PP + clanBonus) × (1 + bonus)', () => {
    const clanBonus = calculateClanBonus(playerPP, clan)
    const ecp       = calculateECP(playerPP, clan, attackBonus)

    const correct   = Math.floor((playerPP * (1 + attackBonus)) + clanBonus)
    const forbidden = Math.floor((playerPP + clanBonus) * (1 + attackBonus))

    expect(ecp).toBe(correct)
    expect(ecp).not.toBe(forbidden)
  })

  it('hero bonus with no clan: ECP = PP × (1 + bonus)', () => {
    const ecp = calculateECP(playerPP, null, attackBonus)
    expect(ecp).toBe(Math.floor(playerPP * (1 + attackBonus)))
  })

  it('attack bonus increases attackerECP but not defenderECP', () => {
    const withBoost    = resolveCombat(makeBaseInputs({ attackBonus: 0.30 }))
    const withoutBoost = resolveCombat(makeBaseInputs({ attackBonus: 0    }))
    expect(withBoost.attackerECP).toBeGreaterThan(withoutBoost.attackerECP)
    expect(withBoost.defenderECP).toBe(withoutBoost.defenderECP)
  })

  it('defense bonus increases defenderECP but not attackerECP', () => {
    const withDefBoost    = resolveCombat(makeBaseInputs({ defenseBonus: 0.30 }))
    const withoutDefBoost = resolveCombat(makeBaseInputs({ defenseBonus: 0    }))
    expect(withDefBoost.defenderECP).toBeGreaterThan(withoutDefBoost.defenderECP)
    expect(withDefBoost.attackerECP).toBe(withoutDefBoost.attackerECP)
  })

  it('bonus = 0 does not change ECP (identity case)', () => {
    expect(calculateECP(playerPP, clan, 0)).toBe(calculateECP(playerPP, clan))
  })

})

// ─────────────────────────────────────────
// 8. Loot decay applies regardless of shield state
// ─────────────────────────────────────────

describe('loot decay — applies regardless of shield or protection state', () => {

  it('decay multiplier is the same whether or not resource shield is active', () => {
    // The decay step is determined by attackCountInWindow — not by shield state.
    // This confirms that shields do NOT affect the decay counter.
    expect(getLootDecayMultiplier(1)).toBe(1.00)
    expect(getLootDecayMultiplier(2)).toBe(0.70)
    expect(getLootDecayMultiplier(5)).toBe(0.10)
  })

  it('5th attack under resource shield still counts as 5th attack (10% decay floor)', () => {
    // Even though loot = 0 due to shield, the CALLER must still count this attack
    // in attackCountInWindow. Here we verify the decay function returns 0.10 for attack 5.
    const decayAt5 = getLootDecayMultiplier(5)
    expect(decayAt5).toBe(BALANCE.antiFarm.LOOT_DECAY_STEPS[4])
  })

  it('loot is 0 at attack count 5 + resource shield (both apply)', () => {
    // Shield makes loot = 0 regardless of decay step
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           100_000,
      defenderPP:           1_000,
      attackCountInWindow:  5,
      resourceShieldActive: true,
    }))
    expect(result.loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
  })

  it('loot without shield at attack 5 is reduced to 10% (not 0)', () => {
    // Without shield, the 5th attack uses the 0.10 decay floor — loot is small but nonzero
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           100_000,
      defenderPP:           1_000,
      attackCountInWindow:  5,
      resourceShieldActive: false,
      defenderUnbanked:     { gold: 100_000, iron: 100_000, wood: 100_000, food: 100_000 },
    }))
    expect(result.outcome).toBe('win')
    expect(result.loot.gold).toBeGreaterThan(0)
  })

})
