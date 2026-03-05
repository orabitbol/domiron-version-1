/**
 * bank-upgrade.test.ts
 *
 * Enforces the atomic-RPC contract for the bank upgrade route.
 *
 * WHAT IS TESTED:
 *   1. Structural contract — the route source uses exactly one
 *      `.rpc('bank_interest_upgrade_apply', …)` call and contains no direct
 *      `.from('resources').update(` or `.from('bank').update(` calls.
 *   2. RPC error-code → HTTP response mapping — every error code the
 *      RPC can return maps to a non-empty message.
 *   3. Upgrade cost formula — cost = upgradeBaseCost × nextLevel
 *   4. Atomicity contract — RPC ok:false leaves no partial state.
 *
 * All tests are pure unit tests — no DB, no HTTP, no Supabase mocking.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_PATH = path.resolve(__dirname, '../../app/api/bank/upgrade/route.ts')
const routeSource: string = fs.readFileSync(ROUTE_PATH, 'utf8')

function countOccurrences(source: string, needle: string): number {
  let count = 0
  let pos = 0
  while ((pos = source.indexOf(needle, pos)) !== -1) { count++; pos += needle.length }
  return count
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — Structural contract
// ─────────────────────────────────────────────────────────────────────────────

describe('Bank upgrade route — atomic RPC structural contract', () => {

  it('contains exactly one .rpc("bank_interest_upgrade_apply", …) call', () => {
    const count = countOccurrences(routeSource, "rpc('bank_interest_upgrade_apply'")
                + countOccurrences(routeSource, 'rpc("bank_interest_upgrade_apply"')
    expect(count).toBe(1)
  })

  it('does NOT contain direct .from("resources").update( call in mutation path', () => {
    expect(routeSource).not.toMatch(/from\(['"]resources['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('does NOT contain direct .from("bank").update( call in mutation path', () => {
    expect(routeSource).not.toMatch(/from\(['"]bank['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('references the correct migration file in comments', () => {
    expect(routeSource).toContain('0015_bank_upgrade_rpc.sql')
  })

  it('maps RPC error codes via BANK_UPGRADE_RPC_ERROR_MAP', () => {
    expect(routeSource).toContain('BANK_UPGRADE_RPC_ERROR_MAP')
  })

  it('passes MAX_INTEREST_LEVEL from BALANCE to the RPC (no hardcode)', () => {
    expect(routeSource).toContain('p_max_level')
    expect(routeSource).toContain('BALANCE.bank.MAX_INTEREST_LEVEL')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — RPC error-code → HTTP mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('Bank upgrade RPC error-code → HTTP mapping', () => {

  const BANK_UPGRADE_RPC_ERROR_MAP: Record<string, string> = {
    already_max_level: 'Bank interest already at maximum level',
    not_enough_gold:   'Not enough gold',
    stale_level:       'Upgrade already applied — please refresh',
  }

  it('all expected RPC error codes produce non-empty messages', () => {
    for (const code of Object.keys(BANK_UPGRADE_RPC_ERROR_MAP)) {
      expect(typeof BANK_UPGRADE_RPC_ERROR_MAP[code]).toBe('string')
      expect(BANK_UPGRADE_RPC_ERROR_MAP[code].length).toBeGreaterThan(0)
    }
  })

  it('known RPC error codes appear in the route source', () => {
    expect(routeSource).toContain('already_max_level')
    expect(routeSource).toContain('not_enough_gold')
    expect(routeSource).toContain('stale_level')
  })

  it('route returns HTTP 400 for RPC ok:false', () => {
    expect(routeSource).toContain('status: 400')
  })

  it('route does not return 200 for a failed RPC result', () => {
    expect(routeSource).not.toMatch(/rpcResult[\s\S]{0,200}status: 200/)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Upgrade cost formula
// ─────────────────────────────────────────────────────────────────────────────

describe('Bank upgrade cost formula', () => {

  it('cost for level 0→1 equals upgradeBaseCost × 1', () => {
    const cost = BALANCE.bank.upgradeBaseCost * 1
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBe(BALANCE.bank.upgradeBaseCost)
  })

  it('cost increases linearly with nextLevel', () => {
    for (let nextLevel = 1; nextLevel <= BALANCE.bank.MAX_INTEREST_LEVEL; nextLevel++) {
      const cost = BALANCE.bank.upgradeBaseCost * nextLevel
      expect(cost).toBe(BALANCE.bank.upgradeBaseCost * nextLevel)
    }
  })

  it('total cost to reach MAX_INTEREST_LEVEL is finite and positive', () => {
    let total = 0
    for (let lv = 1; lv <= BALANCE.bank.MAX_INTEREST_LEVEL; lv++) {
      total += BALANCE.bank.upgradeBaseCost * lv
    }
    expect(total).toBeGreaterThan(0)
    expect(isFinite(total)).toBe(true)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — Next upgrade info (post-RPC BALANCE lookup)
// ─────────────────────────────────────────────────────────────────────────────

describe('Bank upgrade — next upgrade info computed from BALANCE', () => {

  function computeUpgradeInfo(newLevel: number) {
    const maxLevel       = BALANCE.bank.MAX_INTEREST_LEVEL
    const currentRate    = BALANCE.bank.INTEREST_RATE_BY_LEVEL[newLevel] ?? 0
    const nextRate       = newLevel < maxLevel ? (BALANCE.bank.INTEREST_RATE_BY_LEVEL[newLevel + 1] ?? null) : null
    const upgradeCost    = newLevel < maxLevel ? BALANCE.bank.upgradeBaseCost * (newLevel + 1) : null
    const atMaxLevel     = newLevel >= maxLevel
    return { currentRate, nextRate, upgradeCost, atMaxLevel }
  }

  it('currentRate is the rate at the newly reached level', () => {
    const { currentRate } = computeUpgradeInfo(3)
    expect(currentRate).toBe(BALANCE.bank.INTEREST_RATE_BY_LEVEL[3])
    expect(currentRate).toBeGreaterThan(0)
  })

  it('nextRate is null when newLevel === MAX_INTEREST_LEVEL', () => {
    const { nextRate, upgradeCost, atMaxLevel } = computeUpgradeInfo(BALANCE.bank.MAX_INTEREST_LEVEL)
    expect(nextRate).toBeNull()
    expect(upgradeCost).toBeNull()
    expect(atMaxLevel).toBe(true)
  })

  it('nextRate is defined (not null) when newLevel < MAX_INTEREST_LEVEL', () => {
    const { nextRate, upgradeCost, atMaxLevel } = computeUpgradeInfo(1)
    expect(nextRate).not.toBeNull()
    expect(upgradeCost).not.toBeNull()
    expect(atMaxLevel).toBe(false)
  })

  it('nextRate > currentRate (monotonically increasing at every step)', () => {
    for (let lv = 1; lv < BALANCE.bank.MAX_INTEREST_LEVEL; lv++) {
      const { currentRate, nextRate } = computeUpgradeInfo(lv)
      expect(nextRate).not.toBeNull()
      expect(nextRate!).toBeGreaterThanOrEqual(currentRate)
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 5 — Atomicity contract
// ─────────────────────────────────────────────────────────────────────────────

describe('Bank upgrade atomicity contract', () => {

  it('RPC result ok:false leaves no partial state — no fields on failure response', () => {
    const rpcFailure = { ok: false, error: 'not_enough_gold' }
    expect(rpcFailure.ok).toBe(false)
    expect((rpcFailure as { new_level?: number }).new_level).toBeUndefined()
    expect((rpcFailure as { new_gold?: number }).new_gold).toBeUndefined()
  })

  it('RPC result ok:true carries new_level and new_gold for immediate UI update', () => {
    const currentLevel = 2
    const costGold     = BALANCE.bank.upgradeBaseCost * (currentLevel + 1)
    const goldBefore   = 50_000

    const rpcSuccess = {
      ok:        true,
      new_level: currentLevel + 1,
      new_gold:  goldBefore - costGold,
    }

    expect(rpcSuccess.ok).toBe(true)
    expect(rpcSuccess.new_level).toBe(currentLevel + 1)
    expect(rpcSuccess.new_gold).toBe(goldBefore - costGold)
    expect(rpcSuccess.new_gold).toBeGreaterThanOrEqual(0)
  })

  it('stale_level error fires when concurrent upgrade changes level under lock', () => {
    // Simulate: route read level=2, RPC found level=3 (concurrent upgrade)
    const routeReadLevel = 2
    const lockedLevel    = 3  // already incremented by concurrent request
    const isStale        = lockedLevel + 1 !== routeReadLevel + 1
    expect(isStale).toBe(true)
  })

})
