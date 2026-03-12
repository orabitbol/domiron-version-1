/**
 * Tests for lib/game/tick.ts pure functions.
 *
 * Covers:
 *   - calcBankInterest: level-based rates, zero balance, unknown level fallback
 *   - calcTribePowerTotal: empty array, sum correctness
 */
import { describe, it, expect } from 'vitest'
import {
  calcBankInterest,
  calcTribePowerTotal,
  calcSlaveProduction,
  isTickDuplicateRun,
  DUPLICATE_GUARD_THRESHOLD_MINUTES,
} from '@/lib/game/tick'
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

// ─────────────────────────────────────────
// calcSlaveProduction — dev level scaling
// ─────────────────────────────────────────

describe('calcSlaveProduction — dev level scaling', () => {
  const slaves = 100
  const city   = 1
  const vip    = null

  it('level 1 produces base rate (devOffset = 0)', () => {
    const { baseMin, baseMax } = BALANCE.production
    const result = calcSlaveProduction(slaves, 1, city, vip)
    expect(result.min).toBe(Math.floor(slaves * baseMin))
    expect(result.max).toBe(Math.floor(slaves * baseMax))
  })

  it('level 2 produces more than level 1 (first offset step)', () => {
    const l1 = calcSlaveProduction(slaves, 1, city, vip)
    const l2 = calcSlaveProduction(slaves, 2, city, vip)
    expect(l2.avg).toBeGreaterThan(l1.avg)
  })

  it('each upgrade adds exactly DEV_OFFSET_PER_LEVEL to both min and max rates', () => {
    const { baseMin, baseMax, DEV_OFFSET_PER_LEVEL } = BALANCE.production
    const l1 = calcSlaveProduction(slaves, 1, city, vip)
    const l2 = calcSlaveProduction(slaves, 2, city, vip)
    expect(l2.min).toBe(Math.floor(slaves * (baseMin + DEV_OFFSET_PER_LEVEL)))
    expect(l2.max).toBe(Math.floor(slaves * (baseMax + DEV_OFFSET_PER_LEVEL)))
    expect(l2.min - l1.min).toBe(Math.floor(slaves * DEV_OFFSET_PER_LEVEL))
  })

  it('rate increases monotonically across all dev levels 1–10', () => {
    let prev = calcSlaveProduction(slaves, 1, city, vip)
    for (let level = 2; level <= 10; level++) {
      const curr = calcSlaveProduction(slaves, level, city, vip)
      expect(curr.avg).toBeGreaterThan(prev.avg)
      prev = curr
    }
  })

  it('level 10 produces significantly more than level 1', () => {
    const l1  = calcSlaveProduction(slaves, 1,  city, vip)
    const l10 = calcSlaveProduction(slaves, 10, city, vip)
    const { DEV_OFFSET_PER_LEVEL } = BALANCE.production
    // 9 levels × DEV_OFFSET_PER_LEVEL × slaves added to both min and max
    expect(l10.min - l1.min).toBe(Math.floor(slaves * 9 * DEV_OFFSET_PER_LEVEL))
  })
})

// ─────────────────────────────────────────
// calcSlaveProduction — city multiplier
// ─────────────────────────────────────────

describe('calcSlaveProduction — city multiplier applied', () => {
  const slaves   = 100
  const devLevel = 1
  const vip      = null

  it('city 1 applies ×1.0 multiplier', () => {
    const city1Mult = BALANCE.cities.slaveProductionMultByCity[1]
    expect(city1Mult).toBe(1.0)
    const result = calcSlaveProduction(slaves, devLevel, 1, vip)
    const { baseMin, baseMax } = BALANCE.production
    expect(result.min).toBe(Math.floor(slaves * baseMin * city1Mult))
    expect(result.max).toBe(Math.floor(slaves * baseMax * city1Mult))
  })

  it('city 2 applies ×1.3 multiplier — higher than city 1', () => {
    const city2Mult = BALANCE.cities.slaveProductionMultByCity[2]
    expect(city2Mult).toBe(1.3)
    const city1 = calcSlaveProduction(slaves, devLevel, 1, vip)
    const city2 = calcSlaveProduction(slaves, devLevel, 2, vip)
    expect(city2.avg).toBeGreaterThan(city1.avg)
  })

  it('city 5 produces more than city 1 (promotion incentive)', () => {
    const city1 = calcSlaveProduction(slaves, devLevel, 1, vip)
    const city5 = calcSlaveProduction(slaves, devLevel, 5, vip)
    expect(city5.avg).toBeGreaterThan(city1.avg)
  })

  it('multipliers are monotonically non-decreasing across all cities', () => {
    for (let city = 2; city <= 5; city++) {
      const prev = calcSlaveProduction(slaves, devLevel, city - 1, vip)
      const curr = calcSlaveProduction(slaves, devLevel, city, vip)
      expect(curr.avg).toBeGreaterThanOrEqual(prev.avg)
    }
  })

  it('unknown city falls back to ×1 (no crash)', () => {
    // city 99 is not in the table — should not throw or return NaN
    const result = calcSlaveProduction(slaves, devLevel, 99, vip)
    expect(Number.isFinite(result.avg)).toBe(true)
    expect(result.avg).toBeGreaterThanOrEqual(0)
  })
})

// ─────────────────────────────────────────
// isTickDuplicateRun — duplicate-run guard
// ─────────────────────────────────────────
//
// The guard protects against pg_cron double-firing.
// world_state.next_tick_at is set to now+30min after each tick.
// Skip if (next_tick_at - now) > DUPLICATE_GUARD_THRESHOLD_MINUTES (5).

describe('isTickDuplicateRun', () => {
  const INTERVAL_MS  = 30 * 60_000   // 30 min in ms
  const THRESHOLD    = DUPLICATE_GUARD_THRESHOLD_MINUTES  // 5

  // Helper: build an ISO timestamp relative to a base time
  const iso = (ms: number) => new Date(ms).toISOString()

  it('DUPLICATE_GUARD_THRESHOLD_MINUTES is 5', () => {
    expect(THRESHOLD).toBe(5)
  })

  it('returns false when nextTickAtIso is null (no world_state row yet)', () => {
    expect(isTickDuplicateRun(null, Date.now())).toBe(false)
  })

  it('returns false when nextTickAtIso is undefined', () => {
    expect(isTickDuplicateRun(undefined, Date.now())).toBe(false)
  })

  it('returns false when next_tick_at is in the past (overdue tick)', () => {
    const now = Date.now()
    const pastTs = iso(now - 60_000)  // 1 minute ago
    expect(isTickDuplicateRun(pastTs, now)).toBe(false)
  })

  it('returns false when next_tick_at is exactly now', () => {
    const now = Date.now()
    expect(isTickDuplicateRun(iso(now), now)).toBe(false)
  })

  it('returns false when next_tick_at is just under the threshold (4 min 59 s ahead)', () => {
    const now  = Date.now()
    const ts   = iso(now + (THRESHOLD * 60_000) - 1_000)  // threshold - 1s
    expect(isTickDuplicateRun(ts, now)).toBe(false)
  })

  it('returns false when next_tick_at is exactly at the threshold boundary (5 min ahead)', () => {
    const now = Date.now()
    const ts  = iso(now + THRESHOLD * 60_000)  // exactly 5 min
    // minutesUntilNext === 5, guard condition is > 5, so NOT a duplicate
    expect(isTickDuplicateRun(ts, now)).toBe(false)
  })

  it('returns true when next_tick_at is just over the threshold (5 min 1 s ahead)', () => {
    const now = Date.now()
    const ts  = iso(now + THRESHOLD * 60_000 + 1_000)  // threshold + 1s
    expect(isTickDuplicateRun(ts, now)).toBe(true)
  })

  it('returns true for a normal duplicate fire — tick just ran (next_tick_at ≈ 30 min away)', () => {
    // Scenario: tick completed, set next_tick_at = now + 30 min.
    // pg_cron fires again 2 seconds later (duplicate). Guard must skip.
    const tickCompletedAt = Date.now()
    const nextTickAt      = iso(tickCompletedAt + INTERVAL_MS)
    const duplicateFireAt = tickCompletedAt + 2_000  // 2 seconds later
    expect(isTickDuplicateRun(nextTickAt, duplicateFireAt)).toBe(true)
  })

  it('returns false for a normal on-schedule fire (next_tick_at is past or near-past)', () => {
    // Scenario: tick completed 30 min ago, set next_tick_at = then + 30 min = now.
    // pg_cron fires on schedule. Guard must allow.
    const tickCompletedAt = Date.now() - INTERVAL_MS
    const nextTickAt      = iso(tickCompletedAt + INTERVAL_MS)  // ≈ now
    expect(isTickDuplicateRun(nextTickAt, Date.now())).toBe(false)
  })

  it('returns false when tick is 2 minutes late (next_tick_at is 2 min in the past)', () => {
    const now        = Date.now()
    const nextTickAt = iso(now - 2 * 60_000)  // 2 min overdue
    expect(isTickDuplicateRun(nextTickAt, now)).toBe(false)
  })

  it('guard absorbs scheduling jitter up to THRESHOLD minutes without false positives', () => {
    // Simulate pg_cron firing up to 4 min 59 s early — should still be allowed.
    const now          = Date.now()
    const jitterMs     = (THRESHOLD * 60_000) - 1_000  // just under threshold
    const nextTickAt   = iso(now + jitterMs)
    expect(isTickDuplicateRun(nextTickAt, now)).toBe(false)
  })
})
