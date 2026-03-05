/**
 * food-formula.test.ts
 *
 * Verifies the single canonical food consumption formula:
 *
 *   foodCost = soldiers × FOOD_PER_SOLDIER × turns
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
  return soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns
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

describe('Food formula: soldiers × FOOD_PER_SOLDIER × turns', () => {

  it('10 soldiers, 1 turn → food = 10 × FOOD_PER_SOLDIER × 1', () => {
    expect(calcFoodCost(10, 1)).toBe(10 * BALANCE.combat.FOOD_PER_SOLDIER * 1)
  })

  it('10 soldiers, 5 turns → food = 10 × FOOD_PER_SOLDIER × 5', () => {
    expect(calcFoodCost(10, 5)).toBe(10 * BALANCE.combat.FOOD_PER_SOLDIER * 5)
  })

  it('100 soldiers, 2 turns → food = 100 × FOOD_PER_SOLDIER × 2', () => {
    expect(calcFoodCost(100, 2)).toBe(100 * BALANCE.combat.FOOD_PER_SOLDIER * 2)
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

  it('food cost is monotonically increasing with soldiers (same turns)', () => {
    for (let s = 10; s <= 1000; s += 100) {
      expect(calcFoodCost(s + 1, 3)).toBeGreaterThan(calcFoodCost(s, 3))
    }
  })

  it('food cost is monotonically increasing with turns (same soldiers)', () => {
    for (let t = 1; t <= 10; t++) {
      expect(calcFoodCost(100, t + 1)).toBeGreaterThan(calcFoodCost(100, t))
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
