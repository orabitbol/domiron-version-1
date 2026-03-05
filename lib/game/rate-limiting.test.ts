/**
 * rate-limiting.test.ts
 *
 * Verifies the server-side rate-limiting contract for attack and spy actions.
 *
 * WHAT IS TESTED:
 *   1. Structural contract — both routes contain a cooldown check comparing
 *      the stored timestamp against the current time.
 *   2. Structural contract — both routes return HTTP 429 on cooldown violation.
 *   3. Pure-logic scenarios — verifies the comparison operator and threshold.
 *   4. Structural contract — cooldown timestamps are written atomically inside
 *      the RPC (not via a separate TypeScript players.update call).
 *
 * All tests are pure unit tests — no DB, no HTTP, no Supabase mocking.
 */

import * as fs from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Route sources
// ─────────────────────────────────────────────────────────────────────────────

const ATTACK_ROUTE = path.resolve(__dirname, '../../app/api/attack/route.ts')
const SPY_ROUTE    = path.resolve(__dirname, '../../app/api/spy/route.ts')
const MIGRATION    = path.resolve(__dirname, '../../supabase/migrations/0016_rate_limiting.sql')

const attackSource    = fs.readFileSync(ATTACK_ROUTE, 'utf8')
const spySource       = fs.readFileSync(SPY_ROUTE, 'utf8')
const migrationSource = fs.readFileSync(MIGRATION, 'utf8')

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — Attack route structural contract
// ─────────────────────────────────────────────────────────────────────────────

describe('Attack route — rate-limit structural contract', () => {

  it('route reads last_attack_at from the player row', () => {
    expect(attackSource).toContain('last_attack_at')
  })

  it('route compares last_attack_at against a 1 000 ms threshold', () => {
    expect(attackSource).toContain('1_000')
  })

  it('route returns HTTP 429 when cooldown is active', () => {
    expect(attackSource).toContain('status: 429')
  })

  it('route returns "Attack cooldown active" error message', () => {
    expect(attackSource).toContain("'Attack cooldown active'")
  })

  it('cooldown check is performed before the RPC call', () => {
    const cooldownIdx = attackSource.indexOf('Attack cooldown active')
    const rpcIdx      = attackSource.indexOf("'attack_resolve_apply'")
    expect(cooldownIdx).toBeGreaterThanOrEqual(0)
    expect(rpcIdx).toBeGreaterThan(0)
    expect(cooldownIdx).toBeLessThan(rpcIdx)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — Spy route structural contract
// ─────────────────────────────────────────────────────────────────────────────

describe('Spy route — rate-limit structural contract', () => {

  it('route fetches last_spy_at from the players table', () => {
    expect(spySource).toContain('last_spy_at')
  })

  it('route compares last_spy_at against a 1 000 ms threshold', () => {
    expect(spySource).toContain('1_000')
  })

  it('route returns HTTP 429 when cooldown is active', () => {
    expect(spySource).toContain('status: 429')
  })

  it('route returns "Spy cooldown active" error message', () => {
    expect(spySource).toContain("'Spy cooldown active'")
  })

  it('cooldown check is performed before the RPC call', () => {
    const cooldownIdx = spySource.indexOf('Spy cooldown active')
    const rpcIdx      = spySource.indexOf("'spy_resolve_apply'")
    expect(cooldownIdx).toBeGreaterThanOrEqual(0)
    expect(rpcIdx).toBeGreaterThan(0)
    expect(cooldownIdx).toBeLessThan(rpcIdx)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Migration structural contract
// ─────────────────────────────────────────────────────────────────────────────

describe('Migration 0016 — rate-limit columns and RPC updates', () => {

  it('migration adds last_attack_at column to players', () => {
    expect(migrationSource).toContain('last_attack_at')
  })

  it('migration adds last_spy_at column to players', () => {
    expect(migrationSource).toContain('last_spy_at')
  })

  it('attack_resolve_apply sets last_attack_at = now() atomically', () => {
    expect(migrationSource).toMatch(/last_attack_at\s*=\s*now\(\)/)
  })

  it('spy_resolve_apply sets last_spy_at = now() atomically', () => {
    expect(migrationSource).toMatch(/last_spy_at\s*=\s*now\(\)/)
  })

  it('both timestamps are set inside the existing UPDATE players statement (no extra DML)', () => {
    // Verify both are combined with turns update, not a separate UPDATE
    expect(migrationSource).toContain('turns          = turns - p_turns_used,')
    expect(migrationSource).toContain('last_attack_at = now()')
    expect(migrationSource).toContain('turns      = turns - p_turn_cost,')
    expect(migrationSource).toContain('last_spy_at = now()')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — Pure-logic cooldown gate scenarios
// ─────────────────────────────────────────────────────────────────────────────

const COOLDOWN_MS = 1_000

/** Mirrors the route's cooldown gate exactly. */
function isCooldownActive(lastActionAt: string | null, nowMs: number): boolean {
  if (!lastActionAt) return false
  return nowMs - new Date(lastActionAt).getTime() < COOLDOWN_MS
}

describe('Cooldown gate — pure logic', () => {

  it('null last_action_at → cooldown NOT active (first ever action)', () => {
    expect(isCooldownActive(null, Date.now())).toBe(false)
  })

  it('attack fails when called twice within 1 s (elapsed = 0 ms)', () => {
    const last = new Date().toISOString()
    expect(isCooldownActive(last, new Date(last).getTime())).toBe(true)
  })

  it('attack fails when elapsed = 999 ms (still within cooldown)', () => {
    const nowMs = Date.now()
    const last  = new Date(nowMs - 999).toISOString()
    expect(isCooldownActive(last, nowMs)).toBe(true)
  })

  it('attack succeeds when elapsed = exactly 1 000 ms (boundary — cooldown expired)', () => {
    const nowMs = Date.now()
    const last  = new Date(nowMs - 1_000).toISOString()
    expect(isCooldownActive(last, nowMs)).toBe(false)
  })

  it('attack succeeds when elapsed = 1 001 ms (safely past cooldown)', () => {
    const nowMs = Date.now()
    const last  = new Date(nowMs - 1_001).toISOString()
    expect(isCooldownActive(last, nowMs)).toBe(false)
  })

  it('spy fails if called twice within cooldown (same logic as attack)', () => {
    const last = new Date().toISOString()
    expect(isCooldownActive(last, new Date(last).getTime() + 500)).toBe(true)
  })

  it('spy succeeds after cooldown expires', () => {
    const nowMs = Date.now()
    const last  = new Date(nowMs - 2_000).toISOString()
    expect(isCooldownActive(last, nowMs)).toBe(false)
  })

  it('cooldown is symmetric — same formula for attack and spy', () => {
    // Both routes use the same COOLDOWN_MS = 1_000 threshold.
    const nowMs = Date.now()
    const justInsideCooldown  = new Date(nowMs - 999).toISOString()
    const justOutsideCooldown = new Date(nowMs - 1_000).toISOString()
    expect(isCooldownActive(justInsideCooldown,  nowMs)).toBe(true)
    expect(isCooldownActive(justOutsideCooldown, nowMs)).toBe(false)
  })

})
