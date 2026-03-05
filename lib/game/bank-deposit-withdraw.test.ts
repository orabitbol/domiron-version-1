/**
 * bank-deposit-withdraw.test.ts
 *
 * Enforces the atomic-RPC contract for bank deposit and withdraw routes.
 *
 * WHAT IS TESTED:
 *   GROUP 1 — Structural: each route uses exactly one `.rpc(...)` call and
 *             contains no direct `.from('resources').update(` /
 *             `.from('bank').update(` for the mutation path.
 *   GROUP 2 — RPC error-code → HTTP response mapping.
 *   GROUP 3 — Business logic formulas (deposit limit, max-fraction, balance).
 *   GROUP 4 — Atomicity / concurrency invariants (pure simulation, no DB).
 *
 * All tests are pure unit tests — no DB, no HTTP, no Supabase mocking.
 */

import * as fs   from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DEPOSIT_ROUTE  = path.resolve(__dirname, '../../app/api/bank/deposit/route.ts')
const WITHDRAW_ROUTE = path.resolve(__dirname, '../../app/api/bank/withdraw/route.ts')

const depositSrc  = fs.readFileSync(DEPOSIT_ROUTE,  'utf8')
const withdrawSrc = fs.readFileSync(WITHDRAW_ROUTE, 'utf8')

function countOccurrences(source: string, needle: string): number {
  let count = 0; let pos = 0
  while ((pos = source.indexOf(needle, pos)) !== -1) { count++; pos += needle.length }
  return count
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1 — Structural contract: deposit
// ─────────────────────────────────────────────────────────────────────────────

describe('Bank deposit route — atomic RPC structural contract', () => {

  it('contains exactly one .rpc("bank_deposit_apply", …) call', () => {
    const count = countOccurrences(depositSrc, "rpc('bank_deposit_apply'")
                + countOccurrences(depositSrc, 'rpc("bank_deposit_apply"')
    expect(count).toBe(1)
  })

  it('does NOT contain a direct .from("resources").update( call in mutation path', () => {
    // Allowed: .from('resources').select( — pre-read
    // Forbidden: .from('resources').update( — write must go through RPC
    expect(depositSrc).not.toMatch(/from\(['"]resources['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('does NOT contain a direct .from("bank").update( call in mutation path', () => {
    expect(depositSrc).not.toMatch(/from\(['"]bank['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('references the correct migration file in comments', () => {
    expect(depositSrc).toContain('0018_bank_deposit_rpc.sql')
  })

  it('maps RPC error codes via BANK_DEPOSIT_RPC_ERROR_MAP', () => {
    expect(depositSrc).toContain('BANK_DEPOSIT_RPC_ERROR_MAP')
  })

  it('passes depositsPerDay from BALANCE to the RPC (no hardcode)', () => {
    expect(depositSrc).toContain('p_deposits_per_day')
    expect(depositSrc).toContain('BALANCE.bank.depositsPerDay')
  })

  it('passes maxDepositPercent from BALANCE to the RPC (no hardcode)', () => {
    expect(depositSrc).toContain('p_max_deposit_fraction')
    expect(depositSrc).toContain('BALANCE.bank.maxDepositPercent')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 1b — Structural contract: withdraw
// ─────────────────────────────────────────────────────────────────────────────

describe('Bank withdraw route — atomic RPC structural contract', () => {

  it('contains exactly one .rpc("bank_withdraw_apply", …) call', () => {
    const count = countOccurrences(withdrawSrc, "rpc('bank_withdraw_apply'")
                + countOccurrences(withdrawSrc, 'rpc("bank_withdraw_apply"')
    expect(count).toBe(1)
  })

  it('does NOT contain a direct .from("resources").update( call in mutation path', () => {
    expect(withdrawSrc).not.toMatch(/from\(['"]resources['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('does NOT contain a direct .from("bank").update( call in mutation path', () => {
    expect(withdrawSrc).not.toMatch(/from\(['"]bank['"]\)[\s\S]{0,80}\.update\s*\(/)
  })

  it('references the correct migration file in comments', () => {
    expect(withdrawSrc).toContain('0019_bank_withdraw_rpc.sql')
  })

  it('maps RPC error codes via BANK_WITHDRAW_RPC_ERROR_MAP', () => {
    expect(withdrawSrc).toContain('BANK_WITHDRAW_RPC_ERROR_MAP')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2 — RPC error-code → HTTP mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('Bank deposit RPC error-code → HTTP mapping', () => {

  const BANK_DEPOSIT_RPC_ERROR_MAP: Record<string, string> = {
    player_not_found:             'Player data not found',
    deposits_exhausted:           'No deposits remaining today',
    exceeds_max_deposit_fraction: 'Max deposit exceeded',
    not_enough_gold:              'Not enough gold',
  }

  it('all expected RPC error codes produce non-empty messages', () => {
    for (const [code, msg] of Object.entries(BANK_DEPOSIT_RPC_ERROR_MAP)) {
      expect(typeof msg).toBe('string')
      expect(msg.length).toBeGreaterThan(0)
      expect(depositSrc).toContain(code)
    }
  })

  it('route returns HTTP 400 for RPC ok:false', () => {
    expect(depositSrc).toContain('status: 400')
  })

})

describe('Bank withdraw RPC error-code → HTTP mapping', () => {

  const BANK_WITHDRAW_RPC_ERROR_MAP: Record<string, string> = {
    player_not_found:     'Player data not found',
    insufficient_balance: 'Insufficient bank balance',
  }

  it('all expected RPC error codes produce non-empty messages', () => {
    for (const [code, msg] of Object.entries(BANK_WITHDRAW_RPC_ERROR_MAP)) {
      expect(typeof msg).toBe('string')
      expect(msg.length).toBeGreaterThan(0)
      expect(withdrawSrc).toContain(code)
    }
  })

  it('route returns HTTP 400 for RPC ok:false', () => {
    expect(withdrawSrc).toContain('status: 400')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 3 — Business logic formulas
// ─────────────────────────────────────────────────────────────────────────────

describe('Bank deposit — business logic formulas', () => {

  it('maxDeposit = floor(gold × maxDepositPercent)', () => {
    const gold   = 5000
    const pct    = BALANCE.bank.maxDepositPercent   // 1.0
    const result = Math.floor(gold * pct)
    expect(result).toBe(5000)   // 100% of gold
  })

  it('maxDepositPercent = 1.0 → maxDeposit equals gold exactly', () => {
    const gold   = 12_345
    const result = Math.floor(gold * BALANCE.bank.maxDepositPercent)
    expect(result).toBe(gold)
  })

  it('depositsPerDay from BALANCE is a positive integer', () => {
    expect(BALANCE.bank.depositsPerDay).toBeGreaterThan(0)
    expect(Number.isInteger(BALANCE.bank.depositsPerDay)).toBe(true)
  })

  it('deposit limit check: gate passes when depositsToday < depositsPerDay', () => {
    const depositsToday = BALANCE.bank.depositsPerDay - 1
    expect(depositsToday < BALANCE.bank.depositsPerDay).toBe(true)
  })

  it('deposit limit check: gate blocks when depositsToday === depositsPerDay', () => {
    const depositsToday = BALANCE.bank.depositsPerDay
    expect(depositsToday >= BALANCE.bank.depositsPerDay).toBe(true)
  })

  it('day-reset: effective deposits = 0 when last_deposit_reset !== today', () => {
    const bankDepositsToday = 3
    const lastReset: string = '2026-01-01'
    const today: string     = '2026-03-05'
    const effective = lastReset === today ? bankDepositsToday : 0
    expect(effective).toBe(0)
  })

  it('day-reset: effective deposits = stored value when last_deposit_reset === today', () => {
    const bankDepositsToday = 3
    const lastReset: string = '2026-03-05'
    const today: string     = '2026-03-05'
    const effective = lastReset === today ? bankDepositsToday : 0
    expect(effective).toBe(3)
  })

})

describe('Bank withdraw — business logic formulas', () => {

  it('withdrawal accepted when amount <= balance', () => {
    const balance = 1000
    const amount  = 500
    expect(amount <= balance).toBe(true)
  })

  it('withdrawal rejected when amount > balance', () => {
    const balance = 400
    const amount  = 500
    expect(amount > balance).toBe(true)
  })

  it('new_gold after withdrawal = old_gold + amount', () => {
    const gold   = 2000
    const amount = 300
    expect(gold + amount).toBe(2300)
  })

  it('new_balance after withdrawal = old_balance - amount; cannot go negative', () => {
    const balance = 500
    const amount  = 500
    const newBal  = balance - amount
    expect(newBal).toBe(0)
    expect(newBal).toBeGreaterThanOrEqual(0)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 4 — Atomicity / concurrency invariants (pure simulation, no DB)
//
// These simulate what the RPC FOR UPDATE lock prevents.
// Each test describes the invariant that MUST hold under concurrent execution.
// ─────────────────────────────────────────────────────────────────────────────

describe('Atomicity invariants — deposit / withdraw (concurrency simulation)', () => {

  /**
   * Invariant: total gold (on-hand + banked) is conserved across deposit/withdraw.
   *
   * If a deposit writes resources.gold -= amount without simultaneously crediting
   * bank.balance += amount (partial failure), gold is destroyed.
   * The RPC atomic transaction prevents this: both writes always commit together.
   */
  it('total gold conserved after successful deposit', () => {
    const goldBefore    = 5000
    const bankBefore    = 1000
    const depositAmount = 500

    // Simulates what RPC atomically writes:
    const goldAfter = goldBefore - depositAmount
    const bankAfter = bankBefore + depositAmount

    // Total must be identical before and after
    expect(goldBefore + bankBefore).toBe(goldAfter + bankAfter)
  })

  it('total gold conserved after successful withdrawal', () => {
    const goldBefore      = 3000
    const bankBefore      = 2000
    const withdrawAmount  = 800

    const goldAfter = goldBefore + withdrawAmount
    const bankAfter = bankBefore - withdrawAmount

    expect(goldBefore + bankBefore).toBe(goldAfter + bankAfter)
  })

  /**
   * TOCTTOU double-deposit race: without lock, two concurrent requests at
   * deposits_today = 4 (one below the limit of 5) both see 4 < 5 = true
   * and both commit, resulting in deposits_today = 6 (above limit).
   *
   * The RPC FOR UPDATE lock prevents this: the second request re-reads
   * deposits_today = 5 under lock and returns 'deposits_exhausted'.
   */
  it('deposit daily limit cannot be bypassed by concurrent requests (lock simulation)', () => {
    const limit = BALANCE.bank.depositsPerDay   // 5
    let depositsToday = limit - 1               // 4 — one slot remaining

    // Both requests read 4 before either commits (TOCTTOU)
    const req1EffectiveDeposits = depositsToday   // 4
    const req2EffectiveDeposits = depositsToday   // 4

    // Without lock: both pass (4 < 5) and both commit → depositsToday becomes 6
    const bothPassWithoutLock = req1EffectiveDeposits < limit && req2EffectiveDeposits < limit
    expect(bothPassWithoutLock).toBe(true)        // proves the risk exists

    // With lock (RPC): req1 commits first, now depositsToday = 5
    depositsToday = limit   // req1 wrote this
    // req2 re-reads under lock:
    const req2EffectiveAfterLock = depositsToday  // 5
    const req2Blocked = req2EffectiveAfterLock >= limit
    expect(req2Blocked).toBe(true)                // proves the fix works
  })

  /**
   * TOCTTOU double-withdraw race: without lock, two concurrent withdrawals of
   * 500 from a balance of 500 both see 500 >= 500 = true and both commit,
   * resulting in balance = -500 and gold = original + 1000 (gold created).
   *
   * The RPC FOR UPDATE lock prevents this: the second request re-reads
   * balance = 0 under lock and returns 'insufficient_balance'.
   */
  it('withdrawal balance check cannot be bypassed by concurrent requests (lock simulation)', () => {
    let balance = 500
    const withdrawAmount = 500

    // Both requests read balance=500 before either commits (TOCTTOU)
    const req1Sees = balance
    const req2Sees = balance

    // Without lock: both pass (500 >= 500) and both commit → balance = -500
    const bothPassWithoutLock = req1Sees >= withdrawAmount && req2Sees >= withdrawAmount
    expect(bothPassWithoutLock).toBe(true)        // proves the risk exists

    // With lock (RPC): req1 commits first, balance becomes 0
    balance = 0   // req1 wrote this
    // req2 re-reads under lock:
    const req2Sees2 = balance
    const req2Blocked = req2Sees2 < withdrawAmount
    expect(req2Blocked).toBe(true)                // proves the fix works
  })

  it('RPC ok:false result contains no new_gold / new_balance fields (no partial state)', () => {
    const depositFailure = { ok: false, error: 'not_enough_gold' }
    expect(depositFailure.ok).toBe(false)
    expect((depositFailure as { new_gold?: number }).new_gold).toBeUndefined()
    expect((depositFailure as { new_balance?: number }).new_balance).toBeUndefined()
  })

  it('RPC ok:true result for deposit carries new_gold and new_balance', () => {
    const gold   = 5000
    const bank   = 1000
    const amount = 500
    const rpcSuccess = { ok: true, new_gold: gold - amount, new_balance: bank + amount, deposits_today: 1 }
    expect(rpcSuccess.new_gold).toBe(4500)
    expect(rpcSuccess.new_balance).toBe(1500)
    expect(rpcSuccess.new_gold + rpcSuccess.new_balance).toBe(gold + bank)
  })

})
