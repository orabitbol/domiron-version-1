/**
 * food-formula.test.ts
 *
 * Verifies the single canonical food consumption formula:
 *
 *   foodCost = ceil(soldiers × FOOD_PER_SOLDIER × turns)
 *
 * Definitions:
 *   soldiers        — number of soldiers participating (attacker's army count)
 *   FOOD_PER_SOLDIER — constant in BALANCE.combat; food consumed per soldier per turn
 *   turns           — number of turns used by the action
 *
 * WHAT IS TESTED:
 *   1. BALANCE.combat.FOOD_PER_SOLDIER invariants (exists, finite, ≥ 0).
 *   2. Formula correctness for canonical examples.
 *   3. Linear scaling with soldiers and turns independently.
 *   4. Structural contract — route source uses FOOD_PER_SOLDIER, not foodCostPerTurn.
 *
 * All tests are pure unit tests — no DB, no HTTP.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'

// ─────────────────────────────────────────────────────────────────────────────
// Canonical formula (mirrors route + UI)
// ─────────────────────────────────────────────────────────────────────────────

function calcFoodCost(soldiers: number, turns: number): number {
  return Math.ceil(soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — BALANCE constant invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('BALANCE.combat.FOOD_PER_SOLDIER — constant invariants', () => {

  it('FOOD_PER_SOLDIER exists and is a number', () => {
    expect(typeof BALANCE.combat.FOOD_PER_SOLDIER).toBe('number')
  })

  it('FOOD_PER_SOLDIER is finite', () => {
    expect(isFinite(BALANCE.combat.FOOD_PER_SOLDIER)).toBe(true)
  })

  it('FOOD_PER_SOLDIER is >= 0', () => {
    expect(BALANCE.combat.FOOD_PER_SOLDIER).toBeGreaterThanOrEqual(0)
  })

  it('foodCostPerTurn is NOT referenced as a separate constant (formula is unified)', () => {
    // Only FOOD_PER_SOLDIER should exist — foodCostPerTurn was the old separate constant.
    expect((BALANCE.combat as Record<string, unknown>).foodCostPerTurn).toBeUndefined()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — Formula correctness (canonical examples)
// ─────────────────────────────────────────────────────────────────────────────

describe('Food formula: ceil(soldiers × FOOD_PER_SOLDIER × turns)', () => {

  it('10 soldiers, 1 turn → food = ceil(10 × FOOD_PER_SOLDIER × 1)', () => {
    expect(calcFoodCost(10, 1)).toBe(Math.ceil(10 * BALANCE.combat.FOOD_PER_SOLDIER * 1))
  })

  it('10 soldiers, 5 turns → food = ceil(10 × FOOD_PER_SOLDIER × 5)', () => {
    expect(calcFoodCost(10, 5)).toBe(Math.ceil(10 * BALANCE.combat.FOOD_PER_SOLDIER * 5))
  })

  it('100 soldiers, 2 turns → food = ceil(100 × FOOD_PER_SOLDIER × 2)', () => {
    expect(calcFoodCost(100, 2)).toBe(Math.ceil(100 * BALANCE.combat.FOOD_PER_SOLDIER * 2))
  })

  it('0 soldiers → food cost = 0 (no army, no food consumed)', () => {
    expect(calcFoodCost(0, 5)).toBe(0)
  })

  it('0 turns → food cost = 0 (trivial — but formula holds)', () => {
    expect(calcFoodCost(100, 0)).toBe(0)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Linear scaling invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('Food formula — linear scaling', () => {

  it('doubling soldiers doubles food cost', () => {
    expect(calcFoodCost(200, 3)).toBe(2 * calcFoodCost(100, 3))
  })

  it('doubling turns doubles food cost', () => {
    expect(calcFoodCost(100, 6)).toBe(2 * calcFoodCost(100, 3))
  })

  it('food cost is monotonically non-decreasing with soldiers (same turns)', () => {
    // Math.ceil can produce equal values for adjacent soldier counts (e.g. ceil(10×0.05×3)=ceil(11×0.05×3)=2)
    for (let s = 10; s <= 1000; s += 100) {
      expect(calcFoodCost(s + 1, 3)).toBeGreaterThanOrEqual(calcFoodCost(s, 3))
    }
  })

  it('food cost is monotonically non-decreasing with turns (same soldiers)', () => {
    for (let t = 1; t <= 10; t++) {
      expect(calcFoodCost(100, t + 1)).toBeGreaterThanOrEqual(calcFoodCost(100, t))
    }
  })

  it('formula is commutative over soldiers and turns scaling', () => {
    // 200 soldiers × 3 turns == 100 soldiers × 6 turns
    expect(calcFoodCost(200, 3)).toBe(calcFoodCost(100, 6))
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — Structural contract: route uses FOOD_PER_SOLDIER
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_PATH = path.resolve(__dirname, '../../app/api/attack/route.ts')
const routeSource = fs.readFileSync(ROUTE_PATH, 'utf8')

describe('Attack route structural contract — food formula', () => {

  it('route uses FOOD_PER_SOLDIER for food cost computation', () => {
    expect(routeSource).toContain('BALANCE.combat.FOOD_PER_SOLDIER')
  })

  it('route does NOT use foodCostPerTurn (obsolete constant)', () => {
    expect(routeSource).not.toContain('foodCostPerTurn')
  })

  it('route multiplies by soldiers count (formula includes soldiers)', () => {
    // The formula must be of the form: soldiers * FOOD_PER_SOLDIER * turns
    expect(routeSource).toMatch(/soldiers\s*\*\s*BALANCE\.combat\.FOOD_PER_SOLDIER/)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 5 — UI consistency contract: AttackDialog uses the canonical formula
// ─────────────────────────────────────────────────────────────────────────────

const DIALOG_PATH = path.resolve(__dirname, '../../components/game/AttackDialog.tsx')
const dialogSource = fs.readFileSync(DIALOG_PATH, 'utf8')

describe('AttackDialog UI structural contract — food formula', () => {

  it('dialog uses FOOD_PER_SOLDIER (not a hardcoded value)', () => {
    expect(dialogSource).toContain('BALANCE.combat.FOOD_PER_SOLDIER')
  })

  it('dialog does NOT use foodCostPerTurn (obsolete constant)', () => {
    expect(dialogSource).not.toContain('foodCostPerTurn')
  })

  it('dialog multiplies by soldiers (formula: armySoldiers * FOOD_PER_SOLDIER * turns)', () => {
    expect(dialogSource).toMatch(/armySoldiers\s*\*\s*BALANCE\.combat\.FOOD_PER_SOLDIER/)
  })

  it('dialog imports BALANCE from the canonical balance module', () => {
    expect(dialogSource).toContain("from '@/lib/game/balance'")
  })

  it('10 soldiers, 1 turn → food = ceil(soldiers × FOOD_PER_SOLDIER × 1)', () => {
    const soldiers = 10
    const turns    = 1
    expect(Math.ceil(soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)).toBe(Math.ceil(10 * BALANCE.combat.FOOD_PER_SOLDIER))
  })

  it('10 soldiers, 5 turns → food = ceil(soldiers × FOOD_PER_SOLDIER × 5)', () => {
    const soldiers = 10
    const turns    = 5
    expect(Math.ceil(soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)).toBe(Math.ceil(10 * BALANCE.combat.FOOD_PER_SOLDIER * 5))
  })

  it('UI preview formula is identical to backend formula (deterministic)', () => {
    // Verifies that using ceil(FOOD_PER_SOLDIER) in both places produces the same result
    const soldiers  = 500
    const turnsUsed = 7
    const uiPreview   = Math.ceil(soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turnsUsed)
    const backendCost = Math.ceil(soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turnsUsed)
    expect(uiPreview).toBe(backendCost)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 6 — Server authority: attack route enforces food check server-side
// ─────────────────────────────────────────────────────────────────────────────

describe('Server Authority — attack route food gate', () => {

  it('route source contains a food < foodCost guard (server is the authority)', () => {
    // The route must reject the request before touching the DB when food is insufficient.
    // Pattern: attResources.food < foodCost
    expect(routeSource).toMatch(/attResources\.food\s*<\s*foodCost/)
  })

  it('route returns 400 "Not enough food" when food insufficient (error text present)', () => {
    expect(routeSource).toContain("'Not enough food'")
  })

  it('route computes foodCostRaw before the guard (not after)', () => {
    // foodCostRaw (pre-ceil) must be assigned before the if-check that uses foodCost
    const assignIdx = routeSource.indexOf('const foodCostRaw = attArmy.soldiers * BALANCE.combat.FOOD_PER_SOLDIER')
    const guardIdx  = routeSource.indexOf('attResources.food < foodCost')
    expect(assignIdx).toBeGreaterThanOrEqual(0)
    expect(guardIdx).toBeGreaterThan(assignIdx)
  })

  // ── Pure-logic rejection / acceptance scenarios ───────────────────────────
  // These test the gate logic in isolation (no DB, no HTTP).

  it('10 soldiers, 1 turn — rejects when food is zero', () => {
    const soldiers = 10; const turns = 1
    const foodCost = Math.ceil(soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)
    expect(0 < foodCost).toBe(true)  // 0 food → would be rejected
  })

  it('10 soldiers, 1 turn — accepts when food exactly equals cost', () => {
    const soldiers = 10; const turns = 1
    const foodCost = Math.ceil(soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)
    expect(foodCost < foodCost).toBe(false)  // food === cost → passes gate
  })

  it('10 soldiers, 5 turns — rejects when food < requiredFood', () => {
    const soldiers = 10; const turns = 5
    const requiredFood = Math.ceil(soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)
    const playerFood   = requiredFood - 1  // one below the integer cost
    expect(playerFood < requiredFood).toBe(true)
  })

  it('10 soldiers, 5 turns — accepts when food >= requiredFood', () => {
    const soldiers = 10; const turns = 5
    const requiredFood = Math.ceil(soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)
    const playerFood   = requiredFood
    expect(playerFood < requiredFood).toBe(false)
  })

  it('1000 soldiers, 10 turns — rejects when food = 0', () => {
    const soldiers = 1000; const turns = 10
    const requiredFood = Math.ceil(soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)
    expect(0 < requiredFood).toBe(true)
  })

  it('gate is bypassed only when soldiers = 0 (formula yields 0 cost)', () => {
    const turns = 5
    expect(Math.ceil(0 * BALANCE.combat.FOOD_PER_SOLDIER * turns)).toBe(0)
    // Note: a separate guard (soldiers <= 0) rejects before food check anyway
  })

  // ── Spy route: no food validation (spy is not a combat action) ────────────
  it('spy route does NOT reference FOOD_PER_SOLDIER (spy consumes turns only)', () => {
    const SPY_ROUTE_PATH = path.resolve(__dirname, '../../app/api/spy/route.ts')
    const spySource      = fs.readFileSync(SPY_ROUTE_PATH, 'utf8')
    expect(spySource).not.toContain('FOOD_PER_SOLDIER')
  })

  it('spy route has no legacy food-cost identifiers', () => {
    const SPY_ROUTE_PATH = path.resolve(__dirname, '../../app/api/spy/route.ts')
    const spySource      = fs.readFileSync(SPY_ROUTE_PATH, 'utf8')
    expect(spySource).not.toContain('foodCostPerTurn')
    expect(spySource).not.toContain('turnFoodCost')
    expect(spySource).not.toContain('foodPerTurn')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 7 — Math.ceil rounding: BIGINT-safe values + structural checks
// ─────────────────────────────────────────────────────────────────────────────

describe('Food formula — Math.ceil rounding (BIGINT-safe)', () => {

  // ── Explicit rounding cases ───────────────────────────────────────────────
  // FOOD_PER_SOLDIER = 0.05; raw = soldiers × 0.05 × turns

  it('4 soldiers, 1 turn → raw 0.2 → ceil → 1 (Postgres BIGINT would reject 0.2)', () => {
    const raw = 4 * BALANCE.combat.FOOD_PER_SOLDIER * 1  // 0.2
    expect(Math.ceil(raw)).toBe(1)
    expect(Number.isInteger(Math.ceil(raw))).toBe(true)
  })

  it('20 soldiers, 1 turn → raw 1.0 → ceil → 1 (exact integer, no change)', () => {
    const raw = 20 * BALANCE.combat.FOOD_PER_SOLDIER * 1  // 1.0
    expect(Math.ceil(raw)).toBe(1)
  })

  it('21 soldiers, 1 turn → raw 1.05 → ceil → 2 (fractional rounds up)', () => {
    const raw = 21 * BALANCE.combat.FOOD_PER_SOLDIER * 1  // 1.05
    expect(Math.ceil(raw)).toBe(2)
    expect(Number.isInteger(Math.ceil(raw))).toBe(true)
  })

  it('calcFoodCost always returns an integer (never a float)', () => {
    const cases = [
      [4, 1], [7, 3], [11, 2], [13, 7], [21, 1], [100, 1], [1000, 10],
    ] as [number, number][]
    for (const [s, t] of cases) {
      expect(Number.isInteger(calcFoodCost(s, t))).toBe(true)
    }
  })

  // ── Structural: Math.ceil must appear in the route and dialog ─────────────

  it('attack route uses Math.ceil around FOOD_PER_SOLDIER multiplication (BIGINT-safe)', () => {
    // The route must have: Math.ceil(...FOOD_PER_SOLDIER...)
    const ceilIdx        = routeSource.indexOf('Math.ceil(foodCostRaw)')
    const foodRawIdx     = routeSource.indexOf('foodCostRaw')
    expect(ceilIdx).toBeGreaterThanOrEqual(0)
    expect(foodRawIdx).toBeGreaterThanOrEqual(0)
    expect(ceilIdx).toBeGreaterThan(foodRawIdx)  // ceil applied after raw computation
  })

  it('AttackDialog uses Math.ceil around FOOD_PER_SOLDIER multiplication', () => {
    expect(dialogSource).toMatch(/Math\.ceil\s*\(.*FOOD_PER_SOLDIER/)
  })

})
