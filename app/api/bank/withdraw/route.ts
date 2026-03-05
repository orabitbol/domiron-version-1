/**
 * POST /api/bank/withdraw — Withdraw gold from the bank
 *
 * Both writes (bank balance deduction + resources.gold credit) are applied
 * atomically via the bank_withdraw_apply() Postgres RPC.
 * See: supabase/migrations/0019_bank_withdraw_rpc.sql
 *
 * The balance check is re-validated under lock so concurrent withdrawals
 * cannot both pass the balance gate and both commit (gold creation from nothing).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  amount: z.number().int().min(1),
})

const BANK_WITHDRAW_RPC_ERROR_MAP: Record<string, string> = {
  player_not_found:    'Player data not found',
  insufficient_balance:'Insufficient bank balance',
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

    if (amount > bank.balance) {
      return NextResponse.json({ error: 'Insufficient bank balance' }, { status: 400 })
    }

    // ── Atomic DB write via RPC ───────────────────────────────────────────────
    // bank_withdraw_apply() acquires FOR UPDATE locks on bank + resources via a
    // single JOIN, re-validates the balance under lock (TOCTTOU-safe), then
    // applies both writes atomically:
    //   bank.balance   -= amount
    //   resources.gold += amount
    // See: supabase/migrations/0019_bank_withdraw_rpc.sql
    const { data: rpcResult, error: rpcError } = await supabase.rpc('bank_withdraw_apply', {
      p_player_id: playerId,
      p_amount:    amount,
    })

    if (rpcError) {
      console.error('[bank/withdraw] RPC error:', rpcError.code, rpcError.message)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    if (!rpcResult?.ok) {
      const code = rpcResult?.error ?? 'unknown'
      return NextResponse.json(
        { error: BANK_WITHDRAW_RPC_ERROR_MAP[code] ?? 'Withdrawal failed' },
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
    console.error('Bank/withdraw error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
