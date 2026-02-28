/**
 * Domiron v5 — VIP Boost System Unit Tests
 *
 * Tests:
 *   1. clampBonus
 *   2. calcActiveBoostTotals — slave stacking + 50% clamp
 *   3. isShieldActive
 *   4. applyTurnsPack — 200 cap enforcement
 *   5. Combat integration: Resource Shield blocks loot
 *   6. Combat integration: Soldier Shield blocks defender losses
 *   7. Combat integration: Attack boost multiplies PP only (NOT ClanBonus)
 *   8. Combat integration: Attack boost does not affect defender ECP
 *
 * Run: npx vitest run
 */

import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'
import {
  clampBonus,
  calcActiveBoostTotals,
  isShieldActive,
  applyTurnsPack,
} from '@/lib/game/boosts'
import {
  calculateClanBonus,
  calculateECP,
  resolveCombat,
} from '@/lib/game/combat'
import type { PlayerBoost, ActiveBoostTotals } from '@/lib/game/boosts'
import type { ClanContext, HeroContext, CombatResolutionInputs } from '@/lib/game/combat'

// ─────────────────────────────────────────
// SHARED FIXTURES
// ─────────────────────────────────────────

const NOW  = new Date('2026-06-01T12:00:00Z')
const PAST = new Date('2026-06-01T10:00:00Z').toISOString()   // 2h ago — expired
const FUTURE = new Date('2026-06-02T12:00:00Z').toISOString() // 24h ahead — active

function makeBoost(type: PlayerBoost['type'], active = true): PlayerBoost {
  return {
    id:               'test-id',
    player_id:        'player-1',
    type,
    starts_at:        PAST,
    ends_at:          active ? FUTURE : PAST,  // expired if active=false
    cooldown_ends_at: null,
    metadata:         null,
  }
}

const NO_HERO: HeroContext    = { multiplier: 1.0 }
const NO_CLAN: null           = null
const UNBANKED_1000           = { gold: 1000, iron: 1000, wood: 1000, food: 1000 }

function makeBaseInputs(overrides: Partial<CombatResolutionInputs> = {}): CombatResolutionInputs {
  return {
    attackerPP:           5_000,
    defenderPP:           5_000,
    deployedSoldiers:     1_000,
    defenderSoldiers:     1_000,
    attackerHero:         NO_HERO,
    defenderHero:         NO_HERO,
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
    expect(clampBonus(0.70)).toBe(BALANCE.boosts.MAX_STACK_RATE)
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
// 2. calcActiveBoostTotals — slave stacking + clamp
// ─────────────────────────────────────────

describe('calcActiveBoostTotals', () => {

  it('returns all zeros with no boosts', () => {
    const totals = calcActiveBoostTotals([], NOW)
    expect(totals.totalSlaveBonus).toBe(0)
    expect(totals.totalAttackBonus).toBe(0)
    expect(totals.totalDefenseBonus).toBe(0)
    expect(totals.resourceShieldActive).toBe(false)
    expect(totals.soldierShieldActive).toBe(false)
  })

  it('expired boosts are not counted', () => {
    const totals = calcActiveBoostTotals([makeBoost('SLAVE_OUTPUT_30', false)], NOW)
    expect(totals.totalSlaveBonus).toBe(0)
  })

  it('SLAVE_OUTPUT_10 = 10%', () => {
    const totals = calcActiveBoostTotals([makeBoost('SLAVE_OUTPUT_10')], NOW)
    expect(totals.totalSlaveBonus).toBe(0.10)
  })

  it('SLAVE_OUTPUT_20 = 20%', () => {
    const totals = calcActiveBoostTotals([makeBoost('SLAVE_OUTPUT_20')], NOW)
    expect(totals.totalSlaveBonus).toBe(0.20)
  })

  it('SLAVE_OUTPUT_30 = 30%', () => {
    const totals = calcActiveBoostTotals([makeBoost('SLAVE_OUTPUT_30')], NOW)
    expect(totals.totalSlaveBonus).toBe(0.30)
  })

  it('slave boosts stack: 10% + 20% = 30%', () => {
    const totals = calcActiveBoostTotals([
      makeBoost('SLAVE_OUTPUT_10'),
      makeBoost('SLAVE_OUTPUT_20'),
    ], NOW)
    // toBeCloseTo used because 0.10 + 0.20 = 0.30000000000000004 in IEEE 754
    expect(totals.totalSlaveBonus).toBeCloseTo(0.30, 10)
  })

  it('slave boosts clamp at 50%: 30% + 30% → 0.50', () => {
    const totals = calcActiveBoostTotals([
      makeBoost('SLAVE_OUTPUT_30'),
      makeBoost('SLAVE_OUTPUT_30'),
    ], NOW)
    expect(totals.totalSlaveBonus).toBe(0.50)
  })

  it('slave boosts clamp at 50%: 10% + 20% + 30% → 0.50', () => {
    const totals = calcActiveBoostTotals([
      makeBoost('SLAVE_OUTPUT_10'),
      makeBoost('SLAVE_OUTPUT_20'),
      makeBoost('SLAVE_OUTPUT_30'),
    ], NOW)
    expect(totals.totalSlaveBonus).toBe(0.50)
  })

  it('attack boost: ATTACK_POWER_10 = 10%', () => {
    const totals = calcActiveBoostTotals([makeBoost('ATTACK_POWER_10')], NOW)
    expect(totals.totalAttackBonus).toBe(0.10)
  })

  it('attack boosts stack and clamp at 50%', () => {
    // 6 × 10% = 60% → clamped to 50%
    const boosts = Array(6).fill(null).map(() => makeBoost('ATTACK_POWER_10'))
    const totals = calcActiveBoostTotals(boosts, NOW)
    expect(totals.totalAttackBonus).toBe(0.50)
  })

  it('defense boost: DEFENSE_POWER_10 = 10%', () => {
    const totals = calcActiveBoostTotals([makeBoost('DEFENSE_POWER_10')], NOW)
    expect(totals.totalDefenseBonus).toBe(0.10)
  })

  it('RESOURCE_SHIELD activates resource shield flag', () => {
    const totals = calcActiveBoostTotals([makeBoost('RESOURCE_SHIELD')], NOW)
    expect(totals.resourceShieldActive).toBe(true)
  })

  it('SOLDIER_SHIELD activates soldier shield flag', () => {
    const totals = calcActiveBoostTotals([makeBoost('SOLDIER_SHIELD')], NOW)
    expect(totals.soldierShieldActive).toBe(true)
  })

  it('boost categories are independent — slave boost does not affect attack bonus', () => {
    const totals = calcActiveBoostTotals([
      makeBoost('SLAVE_OUTPUT_30'),
      makeBoost('ATTACK_POWER_10'),
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
    expect(isShieldActive([makeBoost('RESOURCE_SHIELD')], 'RESOURCE_SHIELD', NOW)).toBe(true)
  })

  it('returns false for an expired Resource Shield', () => {
    expect(isShieldActive([makeBoost('RESOURCE_SHIELD', false)], 'RESOURCE_SHIELD', NOW)).toBe(false)
  })

  it('returns false when no shield of that type exists', () => {
    expect(isShieldActive([makeBoost('SOLDIER_SHIELD')], 'RESOURCE_SHIELD', NOW)).toBe(false)
  })

  it('returns true for an active Soldier Shield', () => {
    expect(isShieldActive([makeBoost('SOLDIER_SHIELD')], 'SOLDIER_SHIELD', NOW)).toBe(true)
  })

  it('returns false with empty boost list', () => {
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
      attackerPP:           100_000,  // force win
      defenderPP:           1_000,
      resourceShieldActive: true,
    }))
    expect(result.outcome).toBe('win')
    expect(result.loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
  })

  it('loot = 0 when resource shield is active (partial scenario)', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           5_500,  // slightly ahead → likely partial
      defenderPP:           5_000,
      resourceShieldActive: true,
    }))
    expect(result.loot).toEqual({ gold: 0, iron: 0, wood: 0, food: 0 })
  })

  it('soldier losses still apply when resource shield is active', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:           100_000,
      defenderPP:           1_000,
      resourceShieldActive: true,
    }))
    // Attacker still takes losses
    expect(result.attackerLosses).toBeGreaterThan(0)
    // Defender still takes losses (no soldier shield)
    expect(result.defenderLosses).toBeGreaterThan(0)
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

  it('both shields active: defenderLosses = 0 AND loot = 0', () => {
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

  it('defenderLosses are NOT zero without soldier shield (control check)', () => {
    const result = resolveCombat(makeBaseInputs({
      attackerPP:          100_000,
      defenderPP:          1_000,
      soldierShieldActive: false,
    }))
    expect(result.defenderLosses).toBeGreaterThan(0)
  })

})

// ─────────────────────────────────────────
// 7. Attack boost multiplies PP only — NOT ClanBonus
// ─────────────────────────────────────────

describe('calculateECP — attack/defense boost does not multiply ClanBonus', () => {

  const playerPP  = 10_000
  const attackBoost = 0.20
  const clan: ClanContext = { totalClanPP: 100_000, developmentLevel: 5 }

  it('ECP = (PP × (1 + boost)) + clanBonus, NOT (PP + clanBonus) × (1 + boost)', () => {
    const clanBonus = calculateClanBonus(playerPP, clan)
    const ecp = calculateECP(playerPP, NO_HERO, clan, attackBoost)

    // Correct formula
    const correct   = Math.floor((playerPP * 1.0 * (1 + attackBoost)) + clanBonus)
    // Forbidden formula
    const forbidden = Math.floor((playerPP + clanBonus) * (1 + attackBoost))

    expect(ecp).toBe(correct)
    expect(ecp).not.toBe(forbidden)
  })

  it('attack boost with no clan: ECP = PP × (1 + boost)', () => {
    const ecp = calculateECP(playerPP, NO_HERO, null, attackBoost)
    expect(ecp).toBe(Math.floor(playerPP * (1 + attackBoost)))
  })

  it('attack boost increases attackerECP in resolveCombat', () => {
    const withBoost    = resolveCombat(makeBaseInputs({ attackBonus: 0.30 }))
    const withoutBoost = resolveCombat(makeBaseInputs({ attackBonus: 0     }))
    expect(withBoost.attackerECP).toBeGreaterThan(withoutBoost.attackerECP)
  })

  it('attack boost does not change defenderECP', () => {
    const withBoost    = resolveCombat(makeBaseInputs({ attackBonus: 0.50 }))
    const withoutBoost = resolveCombat(makeBaseInputs({ attackBonus: 0     }))
    expect(withBoost.defenderECP).toBe(withoutBoost.defenderECP)
  })

  it('defense boost increases defenderECP but not attackerECP', () => {
    const withDefBoost    = resolveCombat(makeBaseInputs({ defenseBonus: 0.30 }))
    const withoutDefBoost = resolveCombat(makeBaseInputs({ defenseBonus: 0     }))
    expect(withDefBoost.defenderECP).toBeGreaterThan(withoutDefBoost.defenderECP)
    expect(withDefBoost.attackerECP).toBe(withoutDefBoost.attackerECP)
  })

  it('boost = 0 does not change ECP (identity case)', () => {
    const eCPWithZeroBoost = calculateECP(playerPP, NO_HERO, clan, 0)
    const eCPNoBoost       = calculateECP(playerPP, NO_HERO, clan)
    expect(eCPWithZeroBoost).toBe(eCPNoBoost)
  })

  it('50% boost cap: boost 0.70 input treated as 0.70 (caller must clamp before passing)', () => {
    // The clamping responsibility is on the caller (getActiveBoostTotals → clampBonus).
    // calculateECP accepts whatever value is passed — it does NOT re-clamp internally.
    // This test documents that design decision.
    const clampedECP = calculateECP(playerPP, NO_HERO, null, 0.50)  // max allowed
    const overCapECP = calculateECP(playerPP, NO_HERO, null, 0.70)  // caller failed to clamp
    expect(overCapECP).toBeGreaterThan(clampedECP)
    // Correct usage: always pass clampBonus(rawTotal) into calculateECP.
  })

})
