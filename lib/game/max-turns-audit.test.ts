/**
 * max-turns-audit.test.ts
 *
 * Structural guard: ensures players.max_turns (the legacy DB column) is never
 * read for gameplay logic. BALANCE.tick.maxTurns is the single source of truth
 * for the turn cap.
 *
 * WHAT IS TESTED:
 *   1. Route sources do not SELECT max_turns from the DB.
 *   2. The tick helper (calcTurnsToAdd) uses BALANCE.tick.maxTurns, not max_turns.
 *   3. BALANCE.tick.maxTurns is a positive finite number.
 *   4. The turn regen formula (calcTurnsToAdd) clamps at BALANCE.tick.maxTurns.
 *
 * All tests are pure — no DB, no HTTP.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'
import { calcTurnsToAdd } from '@/lib/game/tick'

// ─── File sources ─────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '../..')

function src(...segments: string[]): string {
  return fs.readFileSync(path.join(ROOT, ...segments), 'utf8')
}

const tickRouteSrc   = src('app', 'api', 'tick', 'route.ts')
const playerRouteSrc = src('app', 'api', 'player', 'route.ts')
const tickHelperSrc  = src('lib', 'game', 'tick.ts')
const layoutSrc      = src('app', '(game)', 'layout.tsx')

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — Route sources must not SELECT max_turns from DB
// ─────────────────────────────────────────────────────────────────────────────

describe('max_turns — route sources never SELECT from DB', () => {

  it('tick route does not select max_turns', () => {
    // Matches 'max_turns' as a selected column (in a .select() string)
    expect(tickRouteSrc).not.toMatch(/select\([^)]*max_turns/)
    expect(tickRouteSrc).not.toMatch(/`[^`]*max_turns/)
  })

  it('player route does not select max_turns', () => {
    expect(playerRouteSrc).not.toMatch(/select\([^)]*max_turns/)
    expect(playerRouteSrc).not.toMatch(/`[^`]*max_turns/)
  })

  it('game layout does not select max_turns', () => {
    expect(layoutSrc).not.toMatch(/select\([^)]*max_turns/)
    expect(layoutSrc).not.toMatch(/`[^`]*max_turns/)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — Tick helper uses BALANCE.tick.maxTurns, not DB column
// ─────────────────────────────────────────────────────────────────────────────

describe('calcTurnsToAdd — uses BALANCE.tick.maxTurns', () => {

  it('tick helper source references maxTurns from BALANCE.tick (direct or destructured)', () => {
    // Accepts both:  BALANCE.tick.maxTurns  and  { …, maxTurns } = BALANCE.tick
    const usesMaxTurns =
      tickHelperSrc.includes('BALANCE.tick.maxTurns') ||
      (tickHelperSrc.includes('maxTurns') && tickHelperSrc.includes('BALANCE.tick'))
    expect(usesMaxTurns).toBe(true)
    // Must not reach into a player/row object for the cap
    expect(tickHelperSrc).not.toContain('player.max_turns')
    expect(tickHelperSrc).not.toContain('p.max_turns')
  })

  it('tick helper source does not read max_turns from a player object', () => {
    expect(tickHelperSrc).not.toMatch(/\.max_turns/)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — BALANCE.tick.maxTurns invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('BALANCE.tick.maxTurns — canonical turn cap', () => {

  it('is a positive finite number', () => {
    expect(typeof BALANCE.tick.maxTurns).toBe('number')
    expect(isFinite(BALANCE.tick.maxTurns)).toBe(true)
    expect(BALANCE.tick.maxTurns).toBeGreaterThan(0)
  })

  it('is greater than turnsPerTick (cap is meaningful)', () => {
    expect(BALANCE.tick.maxTurns).toBeGreaterThan(BALANCE.tick.turnsPerTick)
  })

  it('starting turns are below the cap (regen is immediately active)', () => {
    expect(BALANCE.startingResources.turns).toBeLessThan(BALANCE.tick.maxTurns)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — calcTurnsToAdd clamps at BALANCE.tick.maxTurns
// ─────────────────────────────────────────────────────────────────────────────

describe('calcTurnsToAdd — regen clamps at BALANCE.tick.maxTurns', () => {

  const cap = BALANCE.tick.maxTurns

  it('returns cap unchanged when already at cap', () => {
    expect(calcTurnsToAdd(cap, false)).toBe(cap)
  })

  it('returns cap unchanged when already above cap (no overshoot)', () => {
    expect(calcTurnsToAdd(cap + 10, false)).toBe(cap + 10)
  })

  it('never exceeds cap when starting below cap', () => {
    const result = calcTurnsToAdd(cap - 1, false)
    expect(result).toBeLessThanOrEqual(cap)
  })

  it('adds turnsPerTick when well below cap', () => {
    const result = calcTurnsToAdd(0, false)
    expect(result).toBe(Math.min(BALANCE.tick.turnsPerTick, cap))
  })

  it('vacation regen is less than or equal to normal regen', () => {
    const normal  = calcTurnsToAdd(0, false)
    const vacation = calcTurnsToAdd(0, true)
    expect(vacation).toBeLessThanOrEqual(normal)
  })

  it('result is always a non-negative integer', () => {
    const cases = [0, 1, 50, cap - 1, cap, cap + 5]
    for (const start of cases) {
      const r = calcTurnsToAdd(start, false)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(r)).toBe(true)
    }
  })

})
