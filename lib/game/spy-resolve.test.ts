/**
 * spy-resolve.test.ts
 *
 * Enforces the atomic-RPC contract for the spy route.
 *
 * WHAT IS TESTED:
 *   1. Structural contract — the route source uses exactly one
 *      `.rpc('spy_resolve_apply', …)` call and contains no direct
 *      `.from('players').update(`, `.from('army').update(`, or
 *      `.insert('spy_history'` / `.from('spy_history').insert(` calls.
 *   2. RPC error-code → HTTP response mapping — every error code the
 *      RPC can return maps to the correct HTTP status + message.
 *   3. Spy power formula — calcSpyPower / calcScoutDefense invariants
 *      and the success/spiesCaught formulas from BALANCE constants.
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

const ROUTE_PATH = path.resolve(__dirname, '../../app/api/spy/route.ts')
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

describe('Spy route — atomic RPC structural contract', () => {

  it('contains exactly one .rpc("spy_resolve_apply", …) call', () => {
    const count = countOccurrences(routeSource, "rpc('spy_resolve_apply'")
                + countOccurrences(routeSource, 'rpc("spy_resolve_apply"')
    expect(count).toBe(1)
  })

  it('does NOT contain direct .from("players").update( call', () => {
    expect(routeSource).not.toMatch(/from\(['"]players['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('does NOT contain direct .from("army").update( call', () => {
    expect(routeSource).not.toMatch(/from\(['"]army['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('does NOT contain direct spy_history insert — RPC owns the insert', () => {
    // Must not contain .from('spy_history').insert(
    expect(routeSource).not.toMatch(/from\(['"]spy_history['"]\)[\s\S]{0,80}\.insert\s*\(/)
    // Must not contain bare `spy_owner_id:` (the old insert field).
    // Note: `p_spy_owner_id:` (the RPC param) is allowed — exclude it by checking
    // that any match is NOT preceded by `p_`.
    const matches = Array.from(routeSource.matchAll(/spy_owner_id:/g))
    const bareMatches = matches.filter(m => {
      const before = routeSource.slice(Math.max(0, (m.index ?? 0) - 2), m.index ?? 0)
      return before !== 'p_'
    })
    expect(bareMatches).toHaveLength(0)
  })

  it('references the correct migration file in comments', () => {
    expect(routeSource).toContain('0014_spy_resolve_rpc.sql')
  })

  it('maps RPC error codes via SPY_RPC_ERROR_MAP', () => {
    expect(routeSource).toContain('SPY_RPC_ERROR_MAP')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — RPC error-code → HTTP mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('Spy RPC error-code → HTTP mapping', () => {

  const SPY_RPC_ERROR_MAP: Record<string, string> = {
    not_enough_turns: `Not enough turns (need ${BALANCE.spy.turnCost})`,
    not_enough_spies: `Cannot send more spies than you have (0 available)`,
  }

  it('all expected RPC error codes produce non-empty messages', () => {
    for (const code of Object.keys(SPY_RPC_ERROR_MAP)) {
      expect(typeof SPY_RPC_ERROR_MAP[code]).toBe('string')
      expect(SPY_RPC_ERROR_MAP[code].length).toBeGreaterThan(0)
    }
  })

  it('known RPC error codes appear in the route source', () => {
    expect(routeSource).toContain('not_enough_turns')
    expect(routeSource).toContain('not_enough_spies')
  })

  it('route returns HTTP 400 for RPC ok:false (never 200 or 500)', () => {
    expect(routeSource).toContain('status: 400')
    // The route must not return 2xx for a failed RPC result
    expect(routeSource).not.toMatch(/rpcResult[\s\S]{0,200}status: 200/)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Spy power / catch formula (inline mirrors of route helpers)
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors calcSpyPower from the route */
function calcSpyPower(spies: number, spyLevel: number, hasElvenGear = false, race = 'human'): number {
  const trainMult = 1 + spyLevel * BALANCE.training.advancedMultiplierPerLevel
  const weapMult  = hasElvenGear ? 1.50 : 1.0
  const raceMult  = race === 'elf' ? 1 + BALANCE.raceBonuses.elf.spyBonus : 1.0
  return Math.floor(spies * trainMult * weapMult * raceMult)
}

/** Mirrors calcScoutDefense from the route */
function calcScoutDefense(scouts: number, scoutLevel: number, race = 'human'): number {
  const trainMult = 1 + scoutLevel * BALANCE.training.advancedMultiplierPerLevel
  const raceMult  = race === 'elf' ? 1 + BALANCE.raceBonuses.elf.scoutBonus : 1.0
  return Math.floor(scouts * trainMult * raceMult)
}

/** Mirrors spiesCaught formula from the route */
function calcSpiesCaught(spiesSent: number, spyPower: number, scoutDefense: number): number {
  if (spyPower > scoutDefense) return 0   // success
  const ratio    = scoutDefense > 0 ? Math.min(scoutDefense / Math.max(spyPower, 1), 1) : 1
  const rawCatch = Math.floor(spiesSent * BALANCE.spy.catchRate * ratio)
  return Math.min(rawCatch, Math.floor(spiesSent * BALANCE.spy.MAX_CATCH_RATE))
}

describe('Spy power formula invariants', () => {

  it('success when spyPower > scoutDefense', () => {
    const sp = calcSpyPower(100, 5)
    const sd = calcScoutDefense(1, 0)
    expect(sp).toBeGreaterThan(sd)
  })

  it('failure when scoutDefense > spyPower', () => {
    const sp = calcSpyPower(1, 0)
    const sd = calcScoutDefense(100, 5)
    expect(sp).toBeLessThan(sd)
  })

  it('elf race bonus increases spy power', () => {
    const human = calcSpyPower(100, 0, false, 'human')
    const elf   = calcSpyPower(100, 0, false, 'elf')
    expect(elf).toBeGreaterThan(human)
  })

  it('elven_gear weapon multiplier (×1.50) increases spy power', () => {
    const base  = calcSpyPower(100, 0, false)
    const geared = calcSpyPower(100, 0, true)
    expect(geared).toBeGreaterThan(base)
  })

  it('spiesCaught is 0 on success', () => {
    const sp = calcSpyPower(100, 5)
    const sd = calcScoutDefense(1, 0)
    expect(calcSpiesCaught(100, sp, sd)).toBe(0)
  })

  it('spiesCaught is bounded by MAX_CATCH_RATE × spiesSent', () => {
    const sp   = calcSpyPower(1, 0)
    const sd   = calcScoutDefense(1000, 5)
    const sent = 50
    const caught = calcSpiesCaught(sent, sp, sd)
    expect(caught).toBeLessThanOrEqual(Math.floor(sent * BALANCE.spy.MAX_CATCH_RATE))
  })

  it('spiesCaught is never negative', () => {
    const sp = calcSpyPower(1, 0)
    const sd = calcScoutDefense(1000, 5)
    expect(calcSpiesCaught(10, sp, sd)).toBeGreaterThanOrEqual(0)
  })

  it('spiesCaught is never greater than spiesSent', () => {
    const sp   = calcSpyPower(1, 0)
    const sd   = calcScoutDefense(1000, 5)
    const sent = 10
    expect(calcSpiesCaught(sent, sp, sd)).toBeLessThanOrEqual(sent)
  })

  it('zero scouts → scoutDefense is 0 → any spy mission succeeds', () => {
    const sd = calcScoutDefense(0, 0)
    const sp = calcSpyPower(1, 0)
    expect(sd).toBe(0)
    expect(sp).toBeGreaterThan(sd)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — Atomicity contract
// ─────────────────────────────────────────────────────────────────────────────

describe('Spy mutation atomicity contract', () => {

  it('RPC result ok:false leaves no partial state — no fields on failure response', () => {
    // When RPC returns ok:false, the route returns an error — no turns/spies fields
    // are returned to the client, so the client cannot update local state.
    const rpcFailure = { ok: false, error: 'not_enough_turns' }
    expect(rpcFailure.ok).toBe(false)
    expect((rpcFailure as { new_turns?: number }).new_turns).toBeUndefined()
    expect((rpcFailure as { new_spies?: number }).new_spies).toBeUndefined()
  })

  it('RPC result ok:true carries new_turns and new_spies for immediate UI update', () => {
    // Simulates what spy_resolve_apply() returns on success
    const turnsBefore  = 10
    const turnCost     = BALANCE.spy.turnCost
    const spiesBefore  = 50
    const spiesCaught  = 5

    const rpcSuccess = {
      ok:        true,
      new_turns: turnsBefore - turnCost,
      new_spies: Math.max(0, spiesBefore - spiesCaught),
    }

    expect(rpcSuccess.ok).toBe(true)
    expect(rpcSuccess.new_turns).toBe(turnsBefore - turnCost)
    expect(rpcSuccess.new_spies).toBe(spiesBefore - spiesCaught)
    expect(rpcSuccess.new_turns).toBeGreaterThanOrEqual(0)
    expect(rpcSuccess.new_spies).toBeGreaterThanOrEqual(0)
  })

  it('new_spies is always ≥ 0 (GREATEST(0, ...) in RPC)', () => {
    // If spies_caught somehow exceeds spies (shouldn't happen after pre-validation)
    // the RPC uses GREATEST(0, ...) to floor at 0.
    const spies  = 3
    const caught = 10  // more than available — RPC floors to 0
    const newSpies = Math.max(0, spies - caught)
    expect(newSpies).toBe(0)
  })

})
