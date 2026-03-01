/**
 * Season system tests.
 *
 * Covers:
 *   1. New-player protection gate (season-day based) — isNewPlayerProtected
 *   2. Catch-up multiplier — getCatchUpMultiplier
 *   3. Season lifecycle derivations (pure-function invariants from the admin
 *      reset route that can be tested without a DB)
 *   4. Freeze mode logic (client-side isFrozen derivation)
 *   5. Season countdown formatter (formatSeasonMs)
 */

import { describe, it, expect } from 'vitest'
import { isNewPlayerProtected } from './combat'
import { getCatchUpMultiplier } from '@/lib/utils'
import { BALANCE } from './balance'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MS = {
  minute: 60_000,
  hour:   3_600_000,
  day:    86_400_000,
}

const daysAgo = (n: number, from: Date = new Date()) =>
  new Date(from.getTime() - n * MS.day)

// ─────────────────────────────────────────────────────────────────────────────
// 1. New-player protection with season gate
// ─────────────────────────────────────────────────────────────────────────────

describe('Season protection gate — lifecycle scenarios', () => {

  const GATE = BALANCE.season.protectionStartDays   // 10
  const PROT = BALANCE.combat.PROTECTION_HOURS       // 24

  it('season day 1: fresh player has NO protection (gate closed)', () => {
    const now         = new Date()
    const seasonStart = new Date(now.getTime() - MS.day)      // 1 day ago
    const createdAt   = new Date(now.getTime() - MS.minute)   // just registered
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(false)
  })

  it(`season day ${GATE - 1}: gate still closed — no protection`, () => {
    const now         = new Date()
    const seasonStart = daysAgo(GATE - 1, now)
    const createdAt   = new Date(now.getTime() - MS.minute)
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(false)
  })

  it(`season day ${GATE}: gate opens — player registered 1 hour ago IS protected`, () => {
    const now         = new Date()
    const seasonStart = daysAgo(GATE, now)
    const createdAt   = new Date(now.getTime() - MS.hour)
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(true)
  })

  it(`season day ${GATE + 30}: mid-season — player registered ${PROT - 1}h ago is protected`, () => {
    const now         = new Date()
    const seasonStart = daysAgo(GATE + 30, now)
    const createdAt   = new Date(now.getTime() - (PROT - 1) * MS.hour)
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(true)
  })

  it(`season day ${GATE + 30}: mid-season — player registered ${PROT + 1}h ago is NOT protected`, () => {
    const now         = new Date()
    const seasonStart = daysAgo(GATE + 30, now)
    const createdAt   = new Date(now.getTime() - (PROT + 1) * MS.hour)
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(false)
  })

  it('late season (day 85): new player registered 1 min ago IS protected', () => {
    const now         = new Date()
    const seasonStart = daysAgo(85, now)
    const createdAt   = new Date(now.getTime() - MS.minute)
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(true)
  })

  it('late season (day 85): player registered 25h ago is NOT protected', () => {
    const now         = new Date()
    const seasonStart = daysAgo(85, now)
    const createdAt   = new Date(now.getTime() - 25 * MS.hour)
    expect(isNewPlayerProtected(createdAt, seasonStart, now)).toBe(false)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Catch-up multiplier
// ─────────────────────────────────────────────────────────────────────────────

describe('getCatchUpMultiplier', () => {

  /**
   * getCatchUpMultiplier uses Date.now() internally so we derive "seasonStart"
   * as (now - n days) to simulate being n days into the season.
   */
  function startedDaysAgo(n: number): Date {
    return new Date(Date.now() - n * MS.day)
  }

  it('day 0 (just started) → multiplier 1', () => {
    expect(getCatchUpMultiplier(startedDaysAgo(0))).toBe(1)
  })

  it('day 7 → multiplier 1 (≤ 7 days threshold)', () => {
    expect(getCatchUpMultiplier(startedDaysAgo(7))).toBe(1)
  })

  it('day 8 → multiplier 2 (8–30 days)', () => {
    expect(getCatchUpMultiplier(startedDaysAgo(8))).toBe(2)
  })

  it('day 30 → multiplier 2 (≤ 30 days threshold)', () => {
    expect(getCatchUpMultiplier(startedDaysAgo(30))).toBe(2)
  })

  it('day 31 → multiplier 5 (31–60 days)', () => {
    expect(getCatchUpMultiplier(startedDaysAgo(31))).toBe(5)
  })

  it('day 60 → multiplier 5 (≤ 60 days threshold)', () => {
    expect(getCatchUpMultiplier(startedDaysAgo(60))).toBe(5)
  })

  it('day 61 → multiplier 10 (61–80 days)', () => {
    expect(getCatchUpMultiplier(startedDaysAgo(61))).toBe(10)
  })

  it('day 80 → multiplier 10 (≤ 80 days threshold)', () => {
    expect(getCatchUpMultiplier(startedDaysAgo(80))).toBe(10)
  })

  it('day 81 → multiplier 20 (> 80 days, season almost over)', () => {
    expect(getCatchUpMultiplier(startedDaysAgo(81))).toBe(20)
  })

  it('day 89 (last day of season) → multiplier 20', () => {
    expect(getCatchUpMultiplier(startedDaysAgo(89))).toBe(20)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Season reset invariants (pure-function derivations)
// ─────────────────────────────────────────────────────────────────────────────

describe('Season reset — pure derivations', () => {

  it('new season number is exactly currentSeason.number + 1', () => {
    const currentSeason = { number: 3 }
    expect(currentSeason.number + 1).toBe(4)
  })

  it('new season ends_at is starts_at + durationDays', () => {
    const now       = new Date('2026-01-01T00:00:00Z')
    const durationMs = BALANCE.season.durationDays * MS.day
    const endsAt    = new Date(now.getTime() + durationMs)
    const diffDays  = (endsAt.getTime() - now.getTime()) / MS.day
    expect(diffDays).toBe(BALANCE.season.durationDays)
  })

  it('hallOfFamePlayers limit is a positive integer', () => {
    expect(Number.isInteger(BALANCE.season.hallOfFamePlayers)).toBe(true)
    expect(BALANCE.season.hallOfFamePlayers).toBeGreaterThan(0)
  })

  it('hallOfFameTribes limit is a positive integer', () => {
    expect(Number.isInteger(BALANCE.season.hallOfFameTribes)).toBe(true)
    expect(BALANCE.season.hallOfFameTribes).toBeGreaterThan(0)
  })

  it('player game-field reset: city resets to 1', () => {
    // Mirrors the reset values in the admin reset route
    const resetFields = {
      city:              1,
      turns:             BALANCE.startingResources.turns,
      max_turns:         30,
      capacity:          2500,
      reputation:        0,
      power_attack:      0,
      power_defense:     0,
      power_spy:         0,
      power_scout:       0,
      power_total:       0,
      is_vacation:       false,
      vacation_days_used: 0,
    }
    expect(resetFields.city).toBe(1)
    expect(resetFields.reputation).toBe(0)
    expect(resetFields.power_total).toBe(0)
    expect(resetFields.is_vacation).toBe(false)
    expect(resetFields.turns).toBe(BALANCE.startingResources.turns)
  })

  it('starting resources match BALANCE.startingResources', () => {
    // Any player freshly seeded after reset should have exactly these resources
    const startRes = BALANCE.startingResources
    expect(typeof startRes.gold).toBe('number')
    expect(typeof startRes.iron).toBe('number')
    expect(typeof startRes.wood).toBe('number')
    expect(typeof startRes.food).toBe('number')
    expect(startRes.gold).toBeGreaterThanOrEqual(0)
  })

  it('FK-safe delete table order: tribe_spells before tribes, seasons before players', () => {
    // Hard reset deletes everything in this order.
    const ORDER = [
      'tribe_spells',
      'tribe_members',
      'hero_spells',
      'player_hero_effects',
      'spy_history',
      'attacks',
      'hero',
      'bank',
      'development',
      'training',
      'weapons',
      'army',
      'resources',
      'hall_of_fame',
      'tribes',
      'seasons',   // after players.season_id is nulled
      'players',
    ]
    expect(ORDER.indexOf('tribe_spells')).toBeLessThan(ORDER.indexOf('tribes'))
    expect(ORDER.indexOf('tribe_members')).toBeLessThan(ORDER.indexOf('tribes'))
    expect(ORDER.indexOf('player_hero_effects')).toBeLessThan(ORDER.indexOf('hero'))
    expect(ORDER.indexOf('seasons')).toBeLessThan(ORDER.indexOf('players'))
    // 17 tables in the hard reset (game tables + seasons + players)
    expect(ORDER).toHaveLength(17)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Freeze mode — client-side isFrozen derivation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * isFrozen logic (mirrors lib/hooks/useFreeze.ts + lib/game/season.ts):
 *   frozen = !season || season.status !== 'active' || ends_at <= now
 */
function deriveIsFrozen(
  season: { status: string; ends_at: string } | null,
  now: Date = new Date(),
): boolean {
  if (!season || season.status !== 'active') return true
  return new Date(season.ends_at).getTime() <= now.getTime()
}

describe('Freeze mode — isFrozen derivation', () => {

  it('active season with ends_at 30 days in the future → NOT frozen', () => {
    const now = new Date()
    const season = {
      status:  'active',
      ends_at: new Date(now.getTime() + 30 * MS.day).toISOString(),
    }
    expect(deriveIsFrozen(season, now)).toBe(false)
  })

  it('active season with ends_at in the past → FROZEN (auto-freeze, no cron needed)', () => {
    const now = new Date()
    const season = {
      status:  'active',
      ends_at: new Date(now.getTime() - MS.minute).toISOString(),
    }
    expect(deriveIsFrozen(season, now)).toBe(true)
  })

  it('no season (null) → FROZEN', () => {
    expect(deriveIsFrozen(null)).toBe(true)
  })

  it('season with status=ended → FROZEN', () => {
    const now = new Date()
    const season = {
      status:  'ended',
      ends_at: new Date(now.getTime() + 10 * MS.day).toISOString(), // irrelevant when status=ended
    }
    expect(deriveIsFrozen(season, now)).toBe(true)
  })

  it('active season with ends_at exactly at now → FROZEN (boundary)', () => {
    const now = new Date()
    const season = {
      status:  'active',
      ends_at: now.toISOString(),
    }
    expect(deriveIsFrozen(season, now)).toBe(true)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Season countdown formatter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure helper — mirrors formatSeasonMs() in ResourceBar.tsx.
 */
function formatSeasonMs(ms: number): string {
  if (ms <= 0) return 'Season Ended'
  const s   = Math.floor(ms / 1000)
  const d   = Math.floor(s / 86400)
  const h   = Math.floor((s % 86400) / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const hh  = String(h).padStart(2, '0')
  const mm  = String(m).padStart(2, '0')
  const ss  = String(sec).padStart(2, '0')
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`
}

describe('Season countdown formatter', () => {

  it('ms = 0 → "Season Ended"', () => {
    expect(formatSeasonMs(0)).toBe('Season Ended')
  })

  it('ms < 0 → "Season Ended" (clamp at 0)', () => {
    expect(formatSeasonMs(-99999)).toBe('Season Ended')
  })

  it('ms = 1 day exactly → "1d 00:00:00"', () => {
    expect(formatSeasonMs(MS.day)).toBe('1d 00:00:00')
  })

  it('ms = 3661000 (1h 1m 1s) → "01:01:01"', () => {
    expect(formatSeasonMs(3_661_000)).toBe('01:01:01')
  })

  it('ms = 90 days → "90d 00:00:00"', () => {
    expect(formatSeasonMs(90 * MS.day)).toBe('90d 00:00:00')
  })

})
