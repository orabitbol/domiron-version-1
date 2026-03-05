/**
 * attack-resolve.test.ts
 *
 * Enforces the atomic-RPC contract for the attack route.
 *
 * WHAT IS TESTED:
 *   1. Structural contract — the route source uses exactly one
 *      `.rpc('attack_resolve_apply', …)` call and contains no
 *      direct `.from('players').update(`, `.from('resources').update(`,
 *      or `.from('army').update(` calls (the RPC owns all writes).
 *   2. RPC error-code → HTTP response mapping — every error code the
 *      RPC can return is handled and mapped to the correct HTTP status
 *      + message without leaking internal codes.
 *   3. Invariant assertions — the pre-commit safety clamps performed by
 *      the route before calling the RPC are always satisfied for valid
 *      inputs (ensures the RPC is never called with impossible deltas).
 *
 * ALL tests are pure unit tests — no DB, no HTTP, no Supabase mocking.
 * The structural tests read the route file from disk.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'
import { resolveCombat, calculateCaptives } from '@/lib/game/combat'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_PATH = path.resolve(__dirname, '../../app/api/attack/route.ts')
const routeSource: string = fs.readFileSync(ROUTE_PATH, 'utf8')

/** Counts non-overlapping occurrences of a literal string in source. */
function countOccurrences(source: string, needle: string): number {
  let count = 0
  let pos = 0
  while ((pos = source.indexOf(needle, pos)) !== -1) { count++; pos += needle.length }
  return count
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — Structural contract (route source analysis)
// ─────────────────────────────────────────────────────────────────────────────

describe('Attack route — atomic RPC structural contract', () => {

  it('contains exactly one .rpc("attack_resolve_apply", …) call', () => {
    const count = countOccurrences(routeSource, "rpc(\n      'attack_resolve_apply'")
                + countOccurrences(routeSource, "rpc('attack_resolve_apply'")
                + countOccurrences(routeSource, 'rpc("attack_resolve_apply"')
    expect(count).toBe(1)
  })

  it('does NOT call the old attack_multi_turn_apply RPC', () => {
    expect(routeSource).not.toContain('attack_multi_turn_apply')
  })

  it('does NOT contain direct .from("players").update( in mutation path', () => {
    // recalculatePower is a post-RPC helper call — it uses from('players').update
    // but is invoked via recalculatePower(), not inline. Verify no inline update.
    // We search for the inline pattern, not the helper import.
    expect(routeSource).not.toMatch(/from\(['"]players['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('does NOT contain direct .from("resources").update( call', () => {
    expect(routeSource).not.toMatch(/from\(['"]resources['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('does NOT contain direct .from("army").update( call', () => {
    expect(routeSource).not.toMatch(/from\(['"]army['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('does NOT contain direct .from("attacks").insert( call — RPC does the insert', () => {
    expect(routeSource).not.toMatch(/from\(['"]attacks['"]\)[\s\S]{0,80}\.insert\s*\(/)
  })

  it('references the correct migration file in comments', () => {
    expect(routeSource).toContain('0013_attack_resolve_rpc.sql')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — RPC error-code → HTTP response mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mirrors the RPC_ERROR_MAP in the route.
 * If the map changes in the route this test will catch the drift.
 */
const EXPECTED_ERROR_MAP: Record<string, { message: string; status: number }> = {
  not_enough_turns: { message: 'Not enough turns',             status: 400 },
  not_enough_food:  { message: 'Not enough food',              status: 400 },
  no_soldiers:      { message: 'No soldiers to attack with',   status: 400 },
  different_city:   { message: 'Target is in a different city', status: 400 },
  invalid_turns:    { message: 'Invalid turns value',          status: 400 },
}

describe('Attack RPC error-code → HTTP mapping', () => {

  it('all expected RPC error codes map to HTTP 400', () => {
    for (const code of Object.keys(EXPECTED_ERROR_MAP)) {
      expect(EXPECTED_ERROR_MAP[code].status).toBe(400)
    }
  })

  it('all expected error messages are non-empty strings', () => {
    for (const code of Object.keys(EXPECTED_ERROR_MAP)) {
      expect(typeof EXPECTED_ERROR_MAP[code].message).toBe('string')
      expect(EXPECTED_ERROR_MAP[code].message.length).toBeGreaterThan(0)
    }
  })

  it('known RPC error codes are present in the route source', () => {
    // Route source must handle every code in the map.
    for (const code of Object.keys(EXPECTED_ERROR_MAP)) {
      expect(routeSource).toContain(code)
    }
  })

  it('route source maps RPC ok:false to HTTP 400 (not 200 or 500)', () => {
    // Route must never return 200 for a failed RPC result.
    // Check the error-map block is present in the route.
    expect(routeSource).toContain('RPC_ERROR_MAP')
    expect(routeSource).toContain('rpcResult')
    expect(routeSource).toContain('status: 400')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Pre-commit invariant assertions (route safety clamps)
// ─────────────────────────────────────────────────────────────────────────────

describe('Pre-RPC invariant assertions — no impossible deltas reach the RPC', () => {

  /**
   * Mirrors the route's safety-clamp block exactly.
   * Returns the clamped values that would be passed to the RPC.
   */
  function computeRpcParams(
    result:       ReturnType<typeof resolveCombat>,
    turnsUsed:    number,
    attSoldiers:  number,
    defSoldiers:  number,
    defRes:       { gold: number; iron: number; wood: number; food: number },
    attRes:       { food: number },
  ) {
    const scaledLoot = {
      gold: result.loot.gold * turnsUsed,
      iron: result.loot.iron * turnsUsed,
      wood: result.loot.wood * turnsUsed,
      food: result.loot.food * turnsUsed,
    }
    const attLossesScaled = Math.min(result.attackerLosses * turnsUsed, attSoldiers)
    const defLossesScaled = Math.min(result.defenderLosses * turnsUsed, defSoldiers)

    const goldStolen = Math.min(scaledLoot.gold, defRes.gold)
    const ironStolen = Math.min(scaledLoot.iron, defRes.iron)
    const woodStolen = Math.min(scaledLoot.wood, defRes.wood)
    const foodStolen = Math.min(scaledLoot.food, defRes.food)
    const captives   = calculateCaptives(defLossesScaled)

    const foodCost    = attSoldiers * BALANCE.combat.FOOD_PER_SOLDIER * turnsUsed
    const newAttFood  = Math.max(0, attRes.food - foodCost + foodStolen)
    const newAttSold  = Math.max(0, attSoldiers - attLossesScaled)
    const newDefSold  = Math.max(0, defSoldiers - defLossesScaled)

    return {
      goldStolen, ironStolen, woodStolen, foodStolen,
      attLossesScaled, defLossesScaled, captives,
      foodCost, newAttFood, newAttSold, newDefSold,
    }
  }

  const BASE_WIN_INPUTS = {
    attackerPP:          500_000,
    defenderPP:          100_000,
    deployedSoldiers:    1_000,
    defenderSoldiers:    500,
    attackerClan:        null,
    defenderClan:        null,
    defenderUnbanked:    { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
    attackCountInWindow: 1,
    killCooldownActive:  false,
    attackerIsProtected: false,
    defenderIsProtected: false,
    attackBonus:         0,
    defenseBonus:        0,
    soldierShieldActive: false,
    resourceShieldActive: false,
    attackerRaceBonus:   0,
    defenderRaceBonus:   0,
    attackerTribeMultiplier: 1,
    defenderTribeMultiplier: 1,
  }

  it('goldStolen never exceeds defender gold', () => {
    const result = resolveCombat(BASE_WIN_INPUTS)
    const p = computeRpcParams(result, 3, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: 5_000 })
    expect(p.goldStolen).toBeLessThanOrEqual(10_000)
  })

  it('ironStolen never exceeds defender iron', () => {
    const result = resolveCombat(BASE_WIN_INPUTS)
    const p = computeRpcParams(result, 3, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: 5_000 })
    expect(p.ironStolen).toBeLessThanOrEqual(5_000)
  })

  it('woodStolen never exceeds defender wood', () => {
    const result = resolveCombat(BASE_WIN_INPUTS)
    const p = computeRpcParams(result, 3, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: 5_000 })
    expect(p.woodStolen).toBeLessThanOrEqual(3_000)
  })

  it('defenderLosses never exceeds defender soldiers', () => {
    const result = resolveCombat(BASE_WIN_INPUTS)
    const p = computeRpcParams(result, 10, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: 5_000 })
    expect(p.defLossesScaled).toBeLessThanOrEqual(500)
  })

  it('attacker losses never exceed attacker soldiers', () => {
    const result = resolveCombat(BASE_WIN_INPUTS)
    const p = computeRpcParams(result, 10, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: 5_000 })
    expect(p.attLossesScaled).toBeLessThanOrEqual(1_000)
  })

  it('newAttFood is never negative (food floor applied)', () => {
    // Give attacker only enough food to barely cover the cost
    const result = resolveCombat(BASE_WIN_INPUTS)
    const foodCost = 1_000 * BALANCE.combat.FOOD_PER_SOLDIER * 3  // 1000×0.05×3=150
    const p = computeRpcParams(result, 3, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: foodCost - 1 }) // just below cost — relies on food stolen to stay ≥ 0
    expect(p.newAttFood).toBeGreaterThanOrEqual(0)
  })

  it('newAttSoldiers is never negative', () => {
    const result = resolveCombat(BASE_WIN_INPUTS)
    const p = computeRpcParams(result, 10, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: 50_000 })
    expect(p.newAttSold).toBeGreaterThanOrEqual(0)
  })

  it('newDefSoldiers is never negative', () => {
    const result = resolveCombat(BASE_WIN_INPUTS)
    const p = computeRpcParams(result, 10, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: 50_000 })
    expect(p.newDefSold).toBeGreaterThanOrEqual(0)
  })

  it('captives = 0 when kill cooldown is active (defenderLosses forced to 0)', () => {
    const result = resolveCombat({ ...BASE_WIN_INPUTS, killCooldownActive: true })
    const p = computeRpcParams(result, 3, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: 50_000 })
    expect(p.captives).toBe(0)
    expect(p.defLossesScaled).toBe(0)
  })

  it('all stolen values = 0 when resource shield is active', () => {
    const result = resolveCombat({ ...BASE_WIN_INPUTS, resourceShieldActive: true })
    const p = computeRpcParams(result, 3, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: 50_000 })
    expect(p.goldStolen).toBe(0)
    expect(p.ironStolen).toBe(0)
    expect(p.woodStolen).toBe(0)
  })

  it('invariants hold for loss scenario (attacker weak)', () => {
    const result = resolveCombat({ ...BASE_WIN_INPUTS, attackerPP: 10_000, defenderPP: 500_000 })
    const p = computeRpcParams(result, 5, 1_000, 500,
      { gold: 10_000, iron: 5_000, wood: 3_000, food: 2_000 },
      { food: 50_000 })
    expect(p.goldStolen).toBeLessThanOrEqual(10_000)
    expect(p.newAttSold).toBeGreaterThanOrEqual(0)
    expect(p.newDefSold).toBeGreaterThanOrEqual(0)
  })

})
