/**
 * Tests for lib/game/tick.ts pure functions.
 *
 * Covers:
 *   - calcBankInterest: level-based rates, zero balance, unknown level fallback
 *   - calcTribePowerTotal: empty array, sum correctness
 */
import { describe, it, expect } from 'vitest'
import { calcBankInterest, calcTribePowerTotal } from '@/lib/game/tick'
import { BALANCE } from '@/lib/game/balance'

// ─────────────────────────────────────────
// calcBankInterest
// ─────────────────────────────────────────

describe('calcBankInterest', () => {

  it('level 0 → 0 interest (no level bought)', () => {
    expect(calcBankInterest(10_000, 0, null)).toBe(0)
  })

  it('level 1 → 5% of balance', () => {
    const balance = 10_000
    const expected = Math.floor(balance * BALANCE.bank.INTEREST_RATE_BY_LEVEL[1])
    expect(calcBankInterest(balance, 1, null)).toBe(expected)
    expect(expected).toBe(500)
  })

  it('level 2 → 7.5% of balance', () => {
    const balance = 10_000
    const expected = Math.floor(balance * BALANCE.bank.INTEREST_RATE_BY_LEVEL[2])
    expect(calcBankInterest(balance, 2, null)).toBe(expected)
    expect(expected).toBe(750)
  })

  it('level 3 → 10% of balance', () => {
    const balance = 10_000
    const expected = Math.floor(balance * BALANCE.bank.INTEREST_RATE_BY_LEVEL[3])
    expect(calcBankInterest(balance, 3, null)).toBe(expected)
    expect(expected).toBe(1_000)
  })

  it('balance = 0 → 0 interest at any level', () => {
    expect(calcBankInterest(0, 0, null)).toBe(0)
    expect(calcBankInterest(0, 1, null)).toBe(0)
    expect(calcBankInterest(0, 3, null)).toBe(0)
  })

  it('unknown level → 0 (safe fallback via ??)', () => {
    // Level 99 is not in the table — should fall back to 0 rather than NaN
    expect(calcBankInterest(10_000, 99, null)).toBe(0)
  })

  it('result is always a non-negative integer', () => {
    const result = calcBankInterest(12_345, 2, null)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('vipUntil param has no effect (VIP bank bonus = 0)', () => {
    const withVip    = calcBankInterest(10_000, 1, '2099-01-01T00:00:00Z')
    const withoutVip = calcBankInterest(10_000, 1, null)
    expect(withVip).toBe(withoutVip)
  })

})

// ─────────────────────────────────────────
// calcTribePowerTotal
// ─────────────────────────────────────────

describe('calcTribePowerTotal', () => {

  it('empty array returns 0', () => {
    expect(calcTribePowerTotal([])).toBe(0)
  })

  it('single member returns their power', () => {
    expect(calcTribePowerTotal([12_345])).toBe(12_345)
  })

  it('sums all member power totals correctly', () => {
    expect(calcTribePowerTotal([1_000, 2_000, 3_000])).toBe(6_000)
  })

  it('handles large values without overflow', () => {
    const members = Array(20).fill(1_000_000)
    expect(calcTribePowerTotal(members)).toBe(20_000_000)
  })

})
