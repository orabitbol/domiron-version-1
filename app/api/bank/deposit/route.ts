/**
 * POST /api/bank/deposit — Deposit gold into the bank
 *
 * Both writes (resources.gold deduction + bank balance/counter increment) are
 * applied atomically via the bank_deposit_apply() Postgres RPC.
 * See: supabase/migrations/0018_bank_deposit_rpc.sql
 *
 * The daily deposit counter is re-checked under lock so concurrent requests
 * cannot both pass the limit gate and both commit (double-counting).
 * The day-reset (last_deposit_reset !== today) is also applied inside the lock.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  amount: z.number().int().min(1),
})

const BANK_DEPOSIT_RPC_ERROR_MAP: Record<string, string> = {
  player_not_found:             'Player data not found',
  deposits_exhausted:           'No deposits remaining today',
  exceeds_max_deposit_fraction: `Max deposit exceeded`,
  not_enough_gold:              'Not enough gold',
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { amount } = parsed.data
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // ── Fast pre-validation (read-only, good UX) ──────────────────────────────
    // The RPC re-validates all of these under lock (TOCTTOU-safe).

    const [{ data: bank }, { data: resources }] = await Promise.all([
      supabase.from('bank').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('gold').eq('player_id', playerId).single(),
    ])

    if (!bank || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    const today = new Date().toISOString().split('T')[0]

    // Reset deposits_today if it's a new day — must happen BEFORE the limit check
    const currentDepositsToday = bank.last_deposit_reset === today ? bank.deposits_today : 0

    if (currentDepositsToday >= BALANCE.bank.depositsPerDay) {
      return NextResponse.json({ error: 'No deposits remaining today' }, { status: 400 })
    }

    const maxDeposit = Math.floor(resources.gold * BALANCE.bank.maxDepositPercent)
    if (amount > maxDeposit) {
      return NextResponse.json({
        error: `Max deposit is ${maxDeposit} (${BALANCE.bank.maxDepositPercent * 100}% of gold on hand)`,
      }, { status: 400 })
    }

    if (amount > resources.gold) {
      return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
    }

    // ── Atomic DB write via RPC ───────────────────────────────────────────────
    // bank_deposit_apply() acquires FOR UPDATE locks on bank + resources via a
    // single JOIN, re-validates all constraints under lock (TOCTTOU-safe), then
    // applies both writes atomically:
    //   resources.gold  -= amount
    //   bank.balance    += amount
    //   bank.deposits_today and last_deposit_reset updated (day-reset aware)
    // BALANCE-derived limits are passed as params (SSOT — never hardcoded here).
    // See: supabase/migrations/0018_bank_deposit_rpc.sql
    const { data: rpcResult, error: rpcError } = await supabase.rpc('bank_deposit_apply', {
      p_player_id:            playerId,
      p_amount:               amount,
      p_deposits_per_day:     BALANCE.bank.depositsPerDay,
      p_max_deposit_fraction: BALANCE.bank.maxDepositPercent,
    })

    if (rpcError) {
      console.error('[bank/deposit] RPC error:', rpcError.code, rpcError.message)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    if (!rpcResult?.ok) {
      const code = rpcResult?.error ?? 'unknown'
      return NextResponse.json(
        { error: BANK_DEPOSIT_RPC_ERROR_MAP[code] ?? 'Deposit failed' },
        { status: 400 },
      )
    }

    // ── Re-fetch full rows for client state patch ─────────────────────────────
    const [{ data: updatedBank }, { data: updatedResources }] = await Promise.all([
      supabase.from('bank').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    return NextResponse.json({ bank: updatedBank, resources: updatedResources })
  } catch (err) {
    console.error('Bank/deposit error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
