/**
 * training-rules.test.ts
 *
 * Enforces training rules:
 *   1. Untrain removed — route returns 410 Gone; no untrain tab in UI.
 *   2. Train cavalry: costs free_population (popCost), NOT soldiers.
 *   3. Train cavalry: blocked when BALANCE.training.enableCavalry = false.
 *   4. Combat permanence: no route or RPC ever reduces cavalry counts.
 *   5. UI toggle: TrainingClient reads BALANCE.training.enableCavalry.
 *
 * All tests are pure structural/unit tests — no DB, no HTTP.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'

// ─── Source files ─────────────────────────────────────────────────────────────

const UNTRAIN_ROUTE  = path.resolve(__dirname, '../../app/api/training/untrain/route.ts')
const TRAIN_ROUTE    = path.resolve(__dirname, '../../app/api/training/basic/route.ts')
const ATTACK_ROUTE   = path.resolve(__dirname, '../../app/api/attack/route.ts')
const MIGRATION_RPC  = path.resolve(__dirname, '../../supabase/migrations/0013_attack_resolve_rpc.sql')
const TRAINING_UI    = path.resolve(__dirname, '../../app/(game)/training/TrainingClient.tsx')

const untrainSource  = fs.readFileSync(UNTRAIN_ROUTE,  'utf8')
const trainSource    = fs.readFileSync(TRAIN_ROUTE,    'utf8')
const attackSource   = fs.readFileSync(ATTACK_ROUTE,   'utf8')
const migrationSource = fs.readFileSync(MIGRATION_RPC, 'utf8')
const uiSource       = fs.readFileSync(TRAINING_UI,    'utf8')

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — Untrain removed: route returns 410 Gone
// ─────────────────────────────────────────────────────────────────────────────

describe('Untrain route — removed (410 tombstone)', () => {

  it('route returns 410 status (tombstone, not 404 or 200)', () => {
    expect(untrainSource).toContain('status: 410')
  })

  it('route error message is "Untrain removed: training is irreversible"', () => {
    expect(untrainSource).toContain('Untrain removed: training is irreversible')
  })

  it('route has no DB logic (no supabase calls, no army update)', () => {
    expect(untrainSource).not.toContain('supabase')
    expect(untrainSource).not.toContain('army.slaves')
    expect(untrainSource).not.toContain('free_population')
  })

  it('route has no schema validation (no z.literal or z.object)', () => {
    expect(untrainSource).not.toContain('z.literal')
    expect(untrainSource).not.toContain('z.object')
  })

  it('route does not import game modules (no balance, no power, no season)', () => {
    expect(untrainSource).not.toContain("from '@/lib/game")
    expect(untrainSource).not.toContain("from '@/lib/auth")
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — Training irreversibility rule (pure logic)
// ─────────────────────────────────────────────────────────────────────────────

describe('Training irreversibility — all conversions are one-way', () => {

  it('training is a one-way population sink (free_population only decreases)', () => {
    // All training routes consume free_population; none return it
    const trainRoute = fs.readFileSync(
      path.resolve(__dirname, '../../app/api/training/basic/route.ts'), 'utf8'
    )
    expect(trainRoute).toContain('free_population - ')
    expect(trainRoute).not.toContain('free_population + ')
  })

  it('untrain route does NOT increment free_population (tombstone only)', () => {
    expect(untrainSource).not.toContain('free_population +')
    expect(untrainSource).not.toContain('free_population -')
  })

  it('slaves are a workforce unit — no reverse path from slave to free_population in any route', () => {
    // The only routes that touch army.slaves are: basic train (+), attack RPC (captives +)
    // The untrain route tombstone must not touch slaves
    expect(untrainSource).not.toContain('slaves')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Train cavalry: population-based (no soldierRatio)
// ─────────────────────────────────────────────────────────────────────────────

describe('Train route — cavalry uses free_population (popCost), not soldiers', () => {

  it('BALANCE.training.unitCost.cavalry has popCost (not soldierRatio)', () => {
    const cavCfg = BALANCE.training.unitCost.cavalry as Record<string, unknown>
    expect(typeof cavCfg.popCost).toBe('number')
    expect(cavCfg.soldierRatio).toBeUndefined()
  })

  it('BALANCE.training.unitCost.cavalry.popCost is 5', () => {
    const cavCfg = BALANCE.training.unitCost.cavalry as { gold: number; popCost: number }
    expect(cavCfg.popCost).toBe(5)
  })

  it('train route references popCost for cavalry population check', () => {
    expect(trainSource).toContain('popCost')
  })

  it('train route does NOT reference soldierRatio for cavalry', () => {
    expect(trainSource).not.toContain('soldierRatio')
  })

  it('train route has a population guard for cavalry (not enough population)', () => {
    expect(trainSource).toContain('Not enough population')
  })

  it('train route deducts population for cavalry (amount * cavCfg.popCost)', () => {
    expect(trainSource).toContain('amount * cavCfg.popCost')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — Train cavalry: feature-flag (enableCavalry)
// ─────────────────────────────────────────────────────────────────────────────

describe('Train route — cavalry feature flag (enableCavalry)', () => {

  it('BALANCE.training.enableCavalry exists and is a boolean', () => {
    expect(typeof BALANCE.training.enableCavalry).toBe('boolean')
  })

  it('train route checks BALANCE.training.enableCavalry before allowing cavalry training', () => {
    expect(trainSource).toContain('BALANCE.training.enableCavalry')
  })

  it("train route returns 'Cavalry is disabled' when flag is off (error text present)", () => {
    expect(trainSource).toContain("'Cavalry is disabled'")
  })

  it('enableCavalry guard is before the cavalry population check', () => {
    const flagIdx = trainSource.indexOf('enableCavalry')
    const popIdx  = trainSource.indexOf('popCost')
    expect(flagIdx).toBeGreaterThanOrEqual(0)
    expect(popIdx).toBeGreaterThan(0)
    expect(flagIdx).toBeLessThan(popIdx)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 5 — Train cavalry: pure-logic scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('Train cavalry — pure-logic scenarios', () => {

  const POP_COST = 5  // mirrors BALANCE.training.unitCost.cavalry.popCost

  function simulateCavalryTrain(
    freePop: number,
    soldiers: number,
    amount: number,
    enabled: boolean,
  ): { ok: boolean; error?: string; cavalry?: number; free_population?: number } {
    if (!enabled) return { ok: false, error: 'Cavalry is disabled' }
    const requiredPop = amount * POP_COST
    if (freePop < requiredPop) return { ok: false, error: 'Not enough population' }
    // Soldiers are NOT checked — they don't matter for cavalry training
    return {
      ok: true,
      cavalry:         amount,
      free_population: freePop - requiredPop,
    }
  }

  it('succeeds with exactly enough population, zero soldiers', () => {
    const result = simulateCavalryTrain(5, 0, 1, true)
    expect(result.ok).toBe(true)
    expect(result.cavalry).toBe(1)
    expect(result.free_population).toBe(0)
  })

  it('succeeds — soldiers count is irrelevant (even if 0)', () => {
    // New rule: no soldier requirement for cavalry
    const withSoldiers    = simulateCavalryTrain(50, 1000, 10, true)
    const withoutSoldiers = simulateCavalryTrain(50, 0,    10, true)
    expect(withSoldiers.ok).toBe(true)
    expect(withoutSoldiers.ok).toBe(true)
  })

  it('fails when free_population < amount * 5', () => {
    const result = simulateCavalryTrain(4, 999, 1, true)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('population')
  })

  it('training 10 cavalry costs 50 free population', () => {
    const result = simulateCavalryTrain(50, 0, 10, true)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.free_population).toBe(0)
  })

  it('returns Cavalry is disabled when enableCavalry=false', () => {
    const result = simulateCavalryTrain(100, 100, 5, false)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Cavalry is disabled')
  })

  it('disabled cavalry check runs even with ample population and soldiers', () => {
    const result = simulateCavalryTrain(10_000, 10_000, 1, false)
    expect(result.ok).toBe(false)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 6 — Combat permanence: cavalry is never reduced
// ─────────────────────────────────────────────────────────────────────────────

describe('Combat permanence — cavalry cannot be reduced in combat', () => {

  it('attack route battle report sets cavalry losses to 0 for attacker', () => {
    // The route must include `cavalry: 0` in attacker losses object
    expect(attackSource).toMatch(/losses\s*:\s*\{[^}]*soldiers\s*:[^}]*cavalry\s*:\s*0/)
  })

  it('attack route battle report carries cavalry unchanged in after-snapshot', () => {
    // cavalry in after-snapshot must equal attArmy.cavalry (not modified)
    expect(attackSource).toContain('attArmy.cavalry')
  })

  it('attack RPC call does NOT pass any cavalry loss parameter', () => {
    expect(attackSource).not.toContain('p_cavalry_losses')
    expect(attackSource).not.toContain('p_cavalry_delta')
  })

  it('attack_resolve_apply RPC has no cavalry column update', () => {
    // The SQL migration must never SET cavalry = cavalry - ...
    expect(migrationSource).not.toMatch(/cavalry\s*=\s*cavalry\s*-/)
    expect(migrationSource).not.toContain('p_cavalry_losses')
  })

  it('attack_resolve_apply RPC updates soldiers — not cavalry', () => {
    expect(migrationSource).toContain('soldiers   = GREATEST(0, soldiers - p_attacker_losses)')
    expect(migrationSource).toContain('soldiers   = GREATEST(0, soldiers - p_defender_losses)')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 7 — UI: no untrain tab; cavalry feature flag intact
// ─────────────────────────────────────────────────────────────────────────────

describe('TrainingClient UI — no untrain tab + cavalry feature flag', () => {

  it('UI has no Untrain tab in TRAIN_TABS', () => {
    // The tab array must not include an 'untrain' key
    expect(uiSource).not.toContain("key: 'untrain'")
    expect(uiSource).not.toContain("label: 'Untrain'")
  })

  it('UI does not render any untrain section', () => {
    expect(uiSource).not.toContain("activeTab === 'untrain'")
    expect(uiSource).not.toContain('untrainSlaves')
    expect(uiSource).not.toContain('/api/training/untrain')
  })

  it('UI has no untrain state (no untrainAmt)', () => {
    expect(uiSource).not.toContain('untrainAmt')
    expect(uiSource).not.toContain('setUntrainAmt')
  })

  it('UI references BALANCE.training.enableCavalry', () => {
    expect(uiSource).toContain('BALANCE.training.enableCavalry')
  })

  it('UI filters cavalry row using enableCavalry (cavalry hidden when false)', () => {
    expect(uiSource).toMatch(/enableCavalry[^)]*\)/)
  })

  it('UI cavalry requirements text mentions popCost (not soldierRatio)', () => {
    expect(uiSource).toContain('popCost')
    expect(uiSource).not.toContain('soldierRatio')
  })

})
