/**
 * mine-display.test.ts
 *
 * Structural tests for MineClient production-rate display.
 *
 * Rules enforced:
 *  1. JOBS config maps each resource to the correct Development field.
 *  2. MineClient imports calcSlaveProduction (canonical formula, not a local duplicate).
 *  3. VIP multiplier is applied (vip_until is passed to the rate helper).
 *  4. BALANCE.production.DEV_OFFSET_PER_LEVEL is referenced (directly or via calcSlaveProduction path).
 *  5. Race gold bonus (raceGoldBonus) is applied for the gold job only.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'

const MINE_CLIENT = path.resolve(__dirname, '../../app/(game)/mine/MineClient.tsx')
const src = fs.readFileSync(MINE_CLIENT, 'utf8')

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — JOBS mapping: each resource uses the correct Development field
// ─────────────────────────────────────────────────────────────────────────────

describe('MineClient JOBS config — correct devLevelField per resource', () => {

  it('gold job uses gold_level', () => {
    expect(src).toContain("devLevelField: 'gold_level'")
  })

  it('iron job uses iron_level', () => {
    expect(src).toContain("devLevelField: 'iron_level'")
  })

  it('wood job uses wood_level', () => {
    expect(src).toContain("devLevelField: 'wood_level'")
  })

  it('food job uses food_level', () => {
    expect(src).toContain("devLevelField: 'food_level'")
  })

  it('no job uses population_level (not a slave-production field)', () => {
    expect(src).not.toContain("devLevelField: 'population_level'")
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — Canonical formula: no local duplication
// ─────────────────────────────────────────────────────────────────────────────

describe('MineClient formula — uses calcSlaveProduction from tick.ts', () => {

  it('imports calcSlaveProduction from @/lib/game/tick', () => {
    expect(src).toContain("calcSlaveProduction")
    expect(src).toContain("from '@/lib/game/tick'")
  })

  it('no local calcProdRange function (removed in favour of calcSlaveProduction)', () => {
    expect(src).not.toContain('function calcProdRange')
  })

  it('DEV_OFFSET_PER_LEVEL is NOT duplicated locally (it lives inside calcSlaveProduction)', () => {
    // The constant should only appear inside perSlaveRateAt (once), not redefined
    const count = (src.match(/DEV_OFFSET_PER_LEVEL/g) ?? []).length
    // perSlaveRateAt uses it once for the display-only rate string
    expect(count).toBe(1)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — VIP multiplier is included in display
// ─────────────────────────────────────────────────────────────────────────────

describe('MineClient display — VIP multiplier applied', () => {

  it('imports isVipActive (used by perSlaveRateAt)', () => {
    expect(src).toContain('isVipActive')
  })

  it('vip_until is passed to perSlaveRateAt', () => {
    expect(src).toContain('vipUntil')
  })

  it('BALANCE.vip.productionMultiplier is referenced in perSlaveRateAt', () => {
    expect(src).toContain('BALANCE.vip.productionMultiplier')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — Race gold bonus applied to gold job only
// ─────────────────────────────────────────────────────────────────────────────

describe('MineClient display — race gold bonus for gold job only', () => {

  it('references BALANCE.raceBonuses.human.goldProductionBonus', () => {
    expect(src).toContain('BALANCE.raceBonuses.human.goldProductionBonus')
  })

  it('gold job receives raceGoldBonus, other jobs receive 0', () => {
    // The pattern: `job.key === 'gold' ? baseRaceGoldBonus : 0`
    expect(src).toMatch(/job\.key\s*===\s*'gold'\s*\?\s*baseRaceGoldBonus\s*:\s*0/)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 5 — BALANCE.production.DEV_OFFSET_PER_LEVEL exists and is 0.5
// ─────────────────────────────────────────────────────────────────────────────

describe('BALANCE.production.DEV_OFFSET_PER_LEVEL value', () => {

  it('DEV_OFFSET_PER_LEVEL exists and is a number', () => {
    expect(typeof BALANCE.production.DEV_OFFSET_PER_LEVEL).toBe('number')
  })

  it('DEV_OFFSET_PER_LEVEL is 0.5 (adds 0.5 to rate range per level)', () => {
    expect(BALANCE.production.DEV_OFFSET_PER_LEVEL).toBe(0.5)
  })

})
