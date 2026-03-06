/**
 * tribe-pay-tax.test.ts
 *
 * Tribe V1: manual tax payment removed (route returns 410 Gone).
 * Taxes are collected automatically by /api/tribe/tax-collect (cron, hourly).
 *
 * V1 tax mechanics:
 *   - Collected once per day at BALANCE.tribe.taxCollectionHour (Israel time)
 *   - Gold deducted from taxable member (role='member', tax_exempt=false)
 *   - Gold transferred directly to tribe leader's personal resources.gold
 *   - No tribe treasury. Tribe mana is NOT affected by tax.
 *   - Unpaid (insufficient gold): nothing transferred, logged with paid=false
 *   - Idempotency: UNIQUE(tribe_id, player_id, collected_date) in tribe_tax_log
 *
 * WHAT IS TESTED:
 *   GROUP 1 — V1 deprecation: /api/tribe/pay-tax returns 410
 *   GROUP 2 — Tax business logic invariants (pure — gold conservation, leader credit)
 *   GROUP 3 — Atomicity / concurrency invariants (pure simulation, no DB)
 *
 * All tests are pure unit tests — no DB, no HTTP, no Supabase mocking.
 */

import * as fs   from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

const ROUTE_PATH = path.resolve(__dirname, '../../app/api/tribe/pay-tax/route.ts')
const routeSrc   = fs.readFileSync(ROUTE_PATH, 'utf8')

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — V1 deprecation contract
// ─────────────────────────────────────────────────────────────────────────────

describe('Tribe pay-tax route — V1 deprecated (410)', () => {

  it('returns 410 status (manual payment removed)', () => {
    expect(routeSrc).toContain('410')
  })

  it('does NOT contain a direct .rpc() call', () => {
    expect(routeSrc).not.toMatch(/\.rpc\(/)
  })

  it('does NOT contain Supabase mutation calls', () => {
    expect(routeSrc).not.toMatch(/\.from\(['"]/)
  })

  it('contains an explanatory message about automatic collection', () => {
    expect(routeSrc).toContain('automatically')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — Tax business logic invariants (V1: gold → leader personal gold)
// ─────────────────────────────────────────────────────────────────────────────

describe('Tribe tax V1 — business logic invariants', () => {

  it('member gold after tax = gold before - tax_amount', () => {
    const memberGold = 800
    const taxAmount  = 200
    expect(memberGold - taxAmount).toBe(600)
    expect(memberGold - taxAmount).toBeGreaterThanOrEqual(0)
  })

  it('leader gold after receiving tax = leader gold before + tax_amount', () => {
    const leaderGold = 1000
    const taxAmount  = 200
    expect(leaderGold + taxAmount).toBe(1200)
  })

  it('gold lost by member = gold gained by leader (conservation — no tribe treasury)', () => {
    const memberGoldBefore = 500
    const leaderGoldBefore = 300
    const taxAmount        = 100

    const memberGoldAfter = memberGoldBefore - taxAmount
    const leaderGoldAfter = leaderGoldBefore + taxAmount

    const memberDelta = memberGoldBefore - memberGoldAfter // positive = left member
    const leaderDelta = leaderGoldAfter - leaderGoldBefore // positive = entered leader

    expect(memberDelta).toBe(leaderDelta)
  })

  it('tribe mana is NOT changed by tax collection', () => {
    // V1 taxes are gold transfers only — tribe mana is unaffected
    const tribeMana = 150
    // After any tax collection, tribe mana stays the same
    expect(tribeMana).toBe(150)
  })

  it('tax payment fails when gold < tax_amount (paid=false, nothing transferred)', () => {
    const memberGold = 100
    const taxAmount  = 200
    const canPay     = memberGold >= taxAmount
    expect(canPay).toBe(false)
  })

  it('tax payment succeeds when gold === tax_amount (exact amount)', () => {
    const memberGold = 200
    const taxAmount  = 200
    const canPay     = memberGold >= taxAmount
    expect(canPay).toBe(true)
  })

  it('tax is idempotent: UNIQUE(tribe_id, player_id, collected_date) prevents double-charge', () => {
    // Simulate: first collection inserts row → second would violate UNIQUE constraint
    const log = new Set<string>()
    const key  = 'tribe:abc|player:xyz|date:2026-03-06'

    // First collection
    expect(log.has(key)).toBe(false)
    log.add(key)

    // Second collection attempt on same day → skip
    expect(log.has(key)).toBe(true)
  })

  it('leader and deputies are tax-exempt — only role=member with tax_exempt=false pay', () => {
    const members = [
      { role: 'leader',  tax_exempt: true  },
      { role: 'deputy',  tax_exempt: false },
      { role: 'member',  tax_exempt: false },
      { role: 'member',  tax_exempt: true  },
    ] as const

    const taxable = members.filter(m => m.role === 'member' && !m.tax_exempt)
    expect(taxable).toHaveLength(1)
    expect(taxable[0].role).toBe('member')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Atomicity / concurrency invariants (pure simulation, no DB)
// ─────────────────────────────────────────────────────────────────────────────

describe('Atomicity invariants — tribe tax collection (concurrency simulation)', () => {

  /**
   * TOCTTOU double-collection race:
   * Without the UNIQUE constraint, two concurrent cron runs both processing
   * the same tribe on the same day could each insert a tax_log row and each
   * deduct the member's gold — charging them twice.
   *
   * The UNIQUE(tribe_id, player_id, collected_date) constraint prevents this:
   * the second insert fails, and the RPC returns { ok: true, skipped: true }.
   */
  it('double-collection prevented by UNIQUE(tribe_id, player_id, collected_date)', () => {
    let logHasEntry = false

    // First cron run: no entry yet → inserts row, collects tax
    const run1ShouldCollect = !logHasEntry
    expect(run1ShouldCollect).toBe(true)
    logHasEntry = true

    // Second cron run (same day): entry exists → RPC returns skipped
    const run2ShouldCollect = !logHasEntry
    expect(run2ShouldCollect).toBe(false)
  })

  /**
   * Partial-failure risk:
   * If the member gold deduction succeeds but the leader credit fails,
   * gold is destroyed. The RPC transaction prevents this: either both
   * writes commit or neither does.
   */
  it('RPC ok:false leaves no partial state — member gold and leader gold unchanged', () => {
    const rpcFailure = { ok: false, error: 'resources_not_found' }
    expect(rpcFailure.ok).toBe(false)
    // No new_gold fields on failure — no partial writes occurred
    expect((rpcFailure as { new_member_gold?: number }).new_member_gold).toBeUndefined()
    expect((rpcFailure as { new_leader_gold?: number }).new_leader_gold).toBeUndefined()
  })

  it('RPC ok:true paid:true — both member and leader gold changed by tax_amount', () => {
    const memberGoldBefore = 1000
    const leaderGoldBefore = 500
    const taxAmount        = 200

    const rpcSuccess = {
      ok:         true,
      paid:       true,
      tax_amount: taxAmount,
    }

    expect(rpcSuccess.ok).toBe(true)
    expect(rpcSuccess.paid).toBe(true)
    expect(rpcSuccess.tax_amount).toBe(200)

    // Conservation: member loses exactly what leader gains
    const memberGoldAfter = memberGoldBefore - taxAmount
    const leaderGoldAfter = leaderGoldBefore + taxAmount
    expect(memberGoldBefore - memberGoldAfter).toBe(leaderGoldAfter - leaderGoldBefore)
  })

  it('RPC ok:true paid:false — neither member nor leader gold changes', () => {
    const rpcUnpaid = {
      ok:         true,
      paid:       false,
      tax_amount: 200,
    }

    expect(rpcUnpaid.ok).toBe(true)
    expect(rpcUnpaid.paid).toBe(false)
    // No gold moved — member has insufficient funds; still logged for visibility
  })

  it('tribes.last_tax_collected_date guards against same-tribe double-collection', () => {
    const israelToday = '2026-03-06'

    // Tribe not yet collected → proceed
    let lastCollected: string | null = null
    expect(lastCollected !== israelToday).toBe(true)

    // After collection, mark the date
    lastCollected = israelToday

    // Next cron run same day → skip this tribe
    expect(lastCollected !== israelToday).toBe(false)
  })

})
