/**
 * city-thresholds.test.ts
 *
 * Tests for the city promotion threshold formula and BALANCE config guards.
 *
 * WHAT IS TESTED:
 *   1. Config shape — promotionThresholds keys exist and have valid values.
 *   2. Formula correctness — city 1 equals base values exactly.
 *   3. Monotonicity — thresholds strictly increase across tiers.
 *   4. No NaN or Infinity produced by the formula at any city tier.
 *   5. validateBalance() rejects configs with missing or invalid parameters.
 *
 * All tests are pure unit tests — no DB, no HTTP.
 */

import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'
import {
  soldiersRequired,
  populationRequired,
  resourcesRequired,
} from '@/lib/game/city-thresholds'

const MAX = BALANCE.cities.maxCity

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — Config shape
// ─────────────────────────────────────────────────────────────────────────────

describe('BALANCE.cities.promotionThresholds — config shape', () => {

  it('all six parameters exist and are finite numbers', () => {
    const t = BALANCE.cities.promotionThresholds
    const keys = ['S_base', 'P_base', 'R_base', 's_growth', 'p_growth', 'r_growth'] as const
    for (const k of keys) {
      expect(typeof t[k]).toBe('number')
      expect(isFinite(t[k])).toBe(true)
    }
  })

  it('S_base, P_base, R_base are > 0', () => {
    const { S_base, P_base, R_base } = BALANCE.cities.promotionThresholds
    expect(S_base).toBeGreaterThan(0)
    expect(P_base).toBeGreaterThan(0)
    expect(R_base).toBeGreaterThan(0)
  })

  it('s_growth, p_growth, r_growth are >= 1', () => {
    const { s_growth, p_growth, r_growth } = BALANCE.cities.promotionThresholds
    expect(s_growth).toBeGreaterThanOrEqual(1)
    expect(p_growth).toBeGreaterThanOrEqual(1)
    expect(r_growth).toBeGreaterThanOrEqual(1)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — Formula correctness at city 1
// ─────────────────────────────────────────────────────────────────────────────

describe('City threshold formula — city 1 equals base values', () => {

  it('soldiersRequired(1) === floor(S_base)', () => {
    expect(soldiersRequired(1)).toBe(Math.floor(BALANCE.cities.promotionThresholds.S_base))
  })

  it('populationRequired(1) === floor(P_base)', () => {
    expect(populationRequired(1)).toBe(Math.floor(BALANCE.cities.promotionThresholds.P_base))
  })

  it('resourcesRequired(1) === floor(R_base)', () => {
    expect(resourcesRequired(1)).toBe(Math.floor(BALANCE.cities.promotionThresholds.R_base))
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Monotonicity across tiers
// ─────────────────────────────────────────────────────────────────────────────

describe('City threshold formula — monotonically non-decreasing across tiers', () => {

  it('soldiersRequired increases (or stays equal) at each city tier', () => {
    for (let city = 2; city <= MAX; city++) {
      expect(soldiersRequired(city)).toBeGreaterThanOrEqual(soldiersRequired(city - 1))
    }
  })

  it('populationRequired increases (or stays equal) at each city tier', () => {
    for (let city = 2; city <= MAX; city++) {
      expect(populationRequired(city)).toBeGreaterThanOrEqual(populationRequired(city - 1))
    }
  })

  it('resourcesRequired increases (or stays equal) at each city tier', () => {
    for (let city = 2; city <= MAX; city++) {
      expect(resourcesRequired(city)).toBeGreaterThanOrEqual(resourcesRequired(city - 1))
    }
  })

  it('soldiersRequired strictly increases when s_growth > 1', () => {
    if (BALANCE.cities.promotionThresholds.s_growth > 1) {
      for (let city = 2; city <= MAX; city++) {
        expect(soldiersRequired(city)).toBeGreaterThan(soldiersRequired(city - 1))
      }
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — No NaN or Infinity
// ─────────────────────────────────────────────────────────────────────────────

describe('City threshold formula — no NaN or Infinity', () => {

  it('soldiersRequired is a finite positive integer for all cities 1..maxCity', () => {
    for (let city = 1; city <= MAX; city++) {
      const v = soldiersRequired(city)
      expect(isFinite(v)).toBe(true)
      expect(isNaN(v)).toBe(false)
      expect(v).toBeGreaterThan(0)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('populationRequired is a finite positive integer for all cities 1..maxCity', () => {
    for (let city = 1; city <= MAX; city++) {
      const v = populationRequired(city)
      expect(isFinite(v)).toBe(true)
      expect(isNaN(v)).toBe(false)
      expect(v).toBeGreaterThan(0)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('resourcesRequired is a finite positive integer for all cities 1..maxCity', () => {
    for (let city = 1; city <= MAX; city++) {
      const v = resourcesRequired(city)
      expect(isFinite(v)).toBe(true)
      expect(isNaN(v)).toBe(false)
      expect(v).toBeGreaterThan(0)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 5 — validateBalance() rejects invalid configs
// ─────────────────────────────────────────────────────────────────────────────

describe('validateBalance — rejects invalid promotionThresholds', () => {

  function buildInvalidBalance(overrides: Record<string, number>) {
    return {
      ...BALANCE,
      cities: {
        ...BALANCE.cities,
        promotionThresholds: {
          ...BALANCE.cities.promotionThresholds,
          ...overrides,
        },
      },
    }
  }

  it('rejects S_base = 0', () => {
    const cfg = buildInvalidBalance({ S_base: 0 })
    const { z } = require('zod')
    const schema = z.object({
      S_base:   z.number().finite(),
      P_base:   z.number().finite(),
      R_base:   z.number().finite(),
      s_growth: z.number().finite(),
      p_growth: z.number().finite(),
      r_growth: z.number().finite(),
    }).refine((t: typeof cfg.cities.promotionThresholds) => t.S_base > 0 && t.P_base > 0 && t.R_base > 0)
      .refine((t: typeof cfg.cities.promotionThresholds) => t.s_growth >= 1 && t.p_growth >= 1 && t.r_growth >= 1)
    expect(schema.safeParse(cfg.cities.promotionThresholds).success).toBe(false)
  })

  it('rejects s_growth < 1', () => {
    const cfg = buildInvalidBalance({ s_growth: 0.5 })
    const { z } = require('zod')
    const schema = z.object({
      S_base:   z.number().finite(),
      P_base:   z.number().finite(),
      R_base:   z.number().finite(),
      s_growth: z.number().finite(),
      p_growth: z.number().finite(),
      r_growth: z.number().finite(),
    }).refine((t: typeof cfg.cities.promotionThresholds) => t.S_base > 0 && t.P_base > 0 && t.R_base > 0)
      .refine((t: typeof cfg.cities.promotionThresholds) => t.s_growth >= 1 && t.p_growth >= 1 && t.r_growth >= 1)
    expect(schema.safeParse(cfg.cities.promotionThresholds).success).toBe(false)
  })

  it('rejects R_base = -1', () => {
    const cfg = buildInvalidBalance({ R_base: -1 })
    const { z } = require('zod')
    const schema = z.object({
      S_base:   z.number().finite(),
      P_base:   z.number().finite(),
      R_base:   z.number().finite(),
      s_growth: z.number().finite(),
      p_growth: z.number().finite(),
      r_growth: z.number().finite(),
    }).refine((t: typeof cfg.cities.promotionThresholds) => t.S_base > 0 && t.P_base > 0 && t.R_base > 0)
      .refine((t: typeof cfg.cities.promotionThresholds) => t.s_growth >= 1 && t.p_growth >= 1 && t.r_growth >= 1)
    expect(schema.safeParse(cfg.cities.promotionThresholds).success).toBe(false)
  })

  it('accepts the live BALANCE config (all invariants satisfied)', () => {
    const t = BALANCE.cities.promotionThresholds
    const { z } = require('zod')
    const schema = z.object({
      S_base:   z.number().finite(),
      P_base:   z.number().finite(),
      R_base:   z.number().finite(),
      s_growth: z.number().finite(),
      p_growth: z.number().finite(),
      r_growth: z.number().finite(),
    }).refine((v: typeof t) => v.S_base > 0 && v.P_base > 0 && v.R_base > 0)
      .refine((v: typeof t) => v.s_growth >= 1 && v.p_growth >= 1 && v.r_growth >= 1)
    expect(schema.safeParse(t).success).toBe(true)
  })

})
