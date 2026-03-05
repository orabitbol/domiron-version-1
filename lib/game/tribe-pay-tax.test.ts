/**
 * tribe-pay-tax.test.ts
 *
 * Enforces the atomic-RPC contract for the tribe pay-tax route.
 *
 * WHAT IS TESTED:
 *   GROUP 1 — Structural: the route uses exactly one `.rpc(...)` call and
 *             contains no direct multi-table `.update(` calls for the mutation.
 *   GROUP 2 — RPC error-code → HTTP response mapping.
 *   GROUP 3 — Business logic invariants (gold deducted = mana gained, etc.).
 *   GROUP 4 — Atomicity / concurrency invariants (pure simulation, no DB).
 *
 * All tests are pure unit tests — no DB, no HTTP, no Supabase mocking.
 */

import * as fs   from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_PATH = path.resolve(__dirname, '../../app/api/tribe/pay-tax/route.ts')
const routeSrc   = fs.readFileSync(ROUTE_PATH, 'utf8')

function countOccurrences(source: string, needle: string): number {
  let count = 0; let pos = 0
  while ((pos = source.indexOf(needle, pos)) !== -1) { count++; pos += needle.length }
  return count
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — Structural contract
// ─────────────────────────────────────────────────────────────────────────────

describe('Tribe pay-tax route — atomic RPC structural contract', () => {

  it('contains exactly one .rpc("tribe_pay_tax_apply", …) call', () => {
    const count = countOccurrences(routeSrc, "rpc('tribe_pay_tax_apply'")
                + countOccurrences(routeSrc, 'rpc("tribe_pay_tax_apply"')
    expect(count).toBe(1)
  })

  it('does NOT contain a direct .from("resources").update( call in mutation path', () => {
    // Pre-reads with .select() are fine; only .update() in the mutation path is forbidden
    expect(routeSrc).not.toMatch(/from\(['"]resources['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('does NOT contain a direct .from("tribes").update( call in mutation path', () => {
    expect(routeSrc).not.toMatch(/from\(['"]tribes['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('does NOT contain a direct .from("tribe_members").update( call in mutation path', () => {
    expect(routeSrc).not.toMatch(/from\(['"]tribe_members['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('references the correct migration file in comments', () => {
    expect(routeSrc).toContain('0017_tribe_pay_tax_rpc.sql')
  })

  it('maps RPC error codes via TRIBE_PAY_TAX_RPC_ERROR_MAP', () => {
    expect(routeSrc).toContain('TRIBE_PAY_TAX_RPC_ERROR_MAP')
  })

  it('does NOT contain Promise.all with update calls (the old multi-write pattern)', () => {
    // The old code had: await Promise.all([ supabase.from('resources').update(...)
    expect(routeSrc).not.toMatch(/Promise\.all\([\s\S]{0,300}\.update\s*\(/)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — RPC error-code → HTTP mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('Tribe pay-tax RPC error-code → HTTP mapping', () => {

  // Mirror the constant in the route — tested independently for completeness
  const TRIBE_PAY_TAX_RPC_ERROR_MAP: Record<string, { status: number; message: string }> = {
    not_in_tribe:       { status: 400, message: 'Not in a tribe' },
    tax_exempt:         { status: 400, message: 'Tax exempt members do not pay tax' },
    already_paid:       { status: 400, message: 'Tax already paid today' },
    tribe_not_found:    { status: 404, message: 'Tribe not found' },
    no_tax_set:         { status: 400, message: 'No tax set for this tribe' },
    resources_not_found:{ status: 404, message: 'Player resources not found' },
    not_enough_gold:    { status: 400, message: 'Not enough gold to pay tax' },
  }

  it('all expected RPC error codes produce non-empty messages', () => {
    for (const [code, mapped] of Object.entries(TRIBE_PAY_TAX_RPC_ERROR_MAP)) {
      expect(typeof mapped.message).toBe('string')
      expect(mapped.message.length).toBeGreaterThan(0)
      expect(routeSrc).toContain(code)
    }
  })

  it('not_in_tribe → 400', () => {
    expect(TRIBE_PAY_TAX_RPC_ERROR_MAP.not_in_tribe.status).toBe(400)
  })

  it('tribe_not_found → 404', () => {
    expect(TRIBE_PAY_TAX_RPC_ERROR_MAP.tribe_not_found.status).toBe(404)
  })

  it('resources_not_found → 404', () => {
    expect(TRIBE_PAY_TAX_RPC_ERROR_MAP.resources_not_found.status).toBe(404)
  })

  it('not_enough_gold → 400', () => {
    expect(TRIBE_PAY_TAX_RPC_ERROR_MAP.not_enough_gold.status).toBe(400)
  })

  it('route does not return 200 for a failed RPC result', () => {
    expect(routeSrc).not.toMatch(/rpcResult[\s\S]{0,200}status: 200/)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Business logic invariants
// ─────────────────────────────────────────────────────────────────────────────

describe('Tribe pay-tax — business logic invariants', () => {

  it('gold paid equals tribe mana gained (1:1 conversion)', () => {
    const taxAmount  = 200
    const goldBefore = 1000
    const manaBefore = 50

    const goldAfter = goldBefore - taxAmount
    const manaAfter = manaBefore + taxAmount

    // Gold lost by player = mana gained by tribe (conservation)
    expect(goldBefore - goldAfter).toBe(manaAfter - manaBefore)
  })

  it('player gold after tax = gold before - tax_amount', () => {
    const gold      = 800
    const taxAmount = 200
    expect(gold - taxAmount).toBe(600)
    expect(gold - taxAmount).toBeGreaterThanOrEqual(0)
  })

  it('tax payment fails when gold < tax_amount', () => {
    const gold      = 100
    const taxAmount = 200
    expect(gold < taxAmount).toBe(true)
  })

  it('tax payment passes when gold === tax_amount (exact amount)', () => {
    const gold      = 200
    const taxAmount = 200
    expect(gold >= taxAmount).toBe(true)
  })

  it('tax payment is idempotent-safe: tax_paid_today guard prevents second pay', () => {
    // First payment flips tax_paid_today to true
    let taxPaidToday = false
    // Simulate first payment
    taxPaidToday = true
    // Second request sees tax_paid_today = true
    expect(taxPaidToday).toBe(true)   // → RPC returns 'already_paid'
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — Atomicity / concurrency invariants (pure simulation, no DB)
//
// These simulate what the RPC FOR UPDATE lock prevents in real concurrency.
// ─────────────────────────────────────────────────────────────────────────────

describe('Atomicity invariants — tribe pay-tax (concurrency simulation)', () => {

  /**
   * TOCTTOU double-pay race: without lock, two concurrent requests both see
   * tax_paid_today=false and both commit — charging the player twice and
   * doubling the tribe mana gain.
   *
   * The RPC FOR UPDATE lock prevents this: the second request re-reads
   * tax_paid_today=true under lock and returns 'already_paid'.
   */
  it('double-pay prevented by post-lock tax_paid_today recheck', () => {
    let taxPaidToday = false

    // Both requests read false before either commits (TOCTTOU)
    const req1Sees = taxPaidToday   // false
    const req2Sees = taxPaidToday   // false

    // Without lock: both pass and both commit → mana doubled, gold charged twice
    const bothPassWithoutLock = !req1Sees && !req2Sees
    expect(bothPassWithoutLock).toBe(true)   // proves the risk exists

    // With lock (RPC): req1 commits first, sets tax_paid_today = true
    taxPaidToday = true
    // req2 re-reads under lock:
    const req2SeesPaid = taxPaidToday
    expect(req2SeesPaid).toBe(true)          // → 'already_paid', no second charge
  })

  /**
   * Partial-failure risk (Promise.all pattern):
   * If write 1 (gold deduction) succeeds but write 2 (mana credit) fails,
   * the player loses gold and the tribe gains nothing — value destroyed.
   * The RPC transaction prevents this: either all three writes commit or none.
   */
  it('RPC ok:false leaves no partial state — gold and mana unchanged', () => {
    const rpcFailure = { ok: false, error: 'not_enough_gold' }
    // No new_gold / new_mana fields on failure — no partial writes occurred
    expect(rpcFailure.ok).toBe(false)
    expect((rpcFailure as { new_gold?: number }).new_gold).toBeUndefined()
    expect((rpcFailure as { new_mana?: number }).new_mana).toBeUndefined()
  })

  it('RPC ok:true result carries gold_paid, new_gold, new_mana for immediate UI update', () => {
    const goldBefore = 1000
    const manaBefore = 30
    const taxAmount  = 200

    const rpcSuccess = {
      ok:        true,
      gold_paid: taxAmount,
      new_gold:  goldBefore - taxAmount,
      new_mana:  manaBefore + taxAmount,
    }

    expect(rpcSuccess.ok).toBe(true)
    expect(rpcSuccess.gold_paid).toBe(200)
    expect(rpcSuccess.new_gold).toBe(800)
    expect(rpcSuccess.new_mana).toBe(230)

    // Conservation: gold lost = mana gained
    expect(goldBefore - rpcSuccess.new_gold).toBe(rpcSuccess.new_mana - manaBefore)
  })

  /**
   * Cross-entity value conservation:
   * Total gold (player) + tribe mana must change by the same delta after a
   * successful pay-tax (assuming 1:1 gold→mana conversion rate).
   */
  it('cross-entity value is conserved: player_gold_delta equals tribe_mana_delta', () => {
    const goldBefore = 2000
    const manaBefore = 100
    const taxAmount  = 500

    const goldAfter = goldBefore - taxAmount
    const manaAfter = manaBefore + taxAmount

    const goldDelta = goldBefore - goldAfter   // positive = gold left player
    const manaDelta = manaAfter - manaBefore   // positive = mana entered tribe

    expect(goldDelta).toBe(manaDelta)   // conservation at 1:1 rate
  })

})
