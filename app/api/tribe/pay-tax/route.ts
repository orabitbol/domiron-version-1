/**
 * POST /api/tribe/pay-tax — Pay today's tribe tax
 *
 * Transfers gold from the player's resources to the tribe's mana pool atomically
 * via the tribe_pay_tax_apply() Postgres RPC.
 * See: supabase/migrations/0017_tribe_pay_tax_rpc.sql
 *
 * All three writes (resources.gold, tribes.mana, tribe_members.tax_paid_today)
 * are wrapped in a single transaction with SELECT … FOR UPDATE locks to prevent
 * TOCTTOU double-pays and partial state from partial failures.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const TRIBE_PAY_TAX_RPC_ERROR_MAP: Record<string, { status: number; message: string }> = {
  not_in_tribe:       { status: 400, message: 'Not in a tribe' },
  tax_exempt:         { status: 400, message: 'Tax exempt members do not pay tax' },
  already_paid:       { status: 400, message: 'Tax already paid today' },
  tribe_not_found:    { status: 404, message: 'Tribe not found' },
  no_tax_set:         { status: 400, message: 'No tax set for this tribe' },
  resources_not_found:{ status: 404, message: 'Player resources not found' },
  not_enough_gold:    { status: 400, message: 'Not enough gold to pay tax' },
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // ── Fast pre-validation (read-only, avoids RPC round-trip on obvious errors) ──
    // The RPC re-validates all of these under lock (TOCTTOU-safe).

    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id, tax_paid_today, tax_exempt')
      .eq('player_id', playerId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }
    if (membership.tax_exempt) {
      return NextResponse.json({ error: 'Tax exempt members do not pay tax' }, { status: 400 })
    }
    if (membership.tax_paid_today) {
      return NextResponse.json({ error: 'Tax already paid today' }, { status: 400 })
    }

    const [{ data: tribe }, { data: resources }] = await Promise.all([
      supabase.from('tribes').select('tax_amount, mana').eq('id', membership.tribe_id).maybeSingle(),
      supabase.from('resources').select('gold').eq('player_id', playerId).maybeSingle(),
    ])

    if (!tribe) {
      return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
    }
    if (tribe.tax_amount === 0) {
      return NextResponse.json({ error: 'No tax set for this tribe' }, { status: 400 })
    }
    if (!resources) {
      return NextResponse.json({ error: 'Player resources not found' }, { status: 404 })
    }
    if (resources.gold < tribe.tax_amount) {
      return NextResponse.json({ error: `Not enough gold (need ${tribe.tax_amount})` }, { status: 400 })
    }

    // ── Atomic DB write via RPC ───────────────────────────────────────────────
    // tribe_pay_tax_apply() acquires FOR UPDATE locks on tribe_members → tribes
    // → resources (in that order), re-validates all constraints under lock
    // (TOCTTOU-safe), then applies all three writes atomically:
    //   resources.gold       -= tax_amount
    //   tribes.mana          += tax_amount
    //   tribe_members.tax_paid_today = true
    // See: supabase/migrations/0017_tribe_pay_tax_rpc.sql
    const { data: rpcResult, error: rpcError } = await supabase.rpc('tribe_pay_tax_apply', {
      p_player_id: playerId,
    })

    if (rpcError) {
      console.error('[tribe/pay-tax] RPC error:', rpcError.code, rpcError.message)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    if (!rpcResult?.ok) {
      const code   = rpcResult?.error ?? 'unknown'
      const mapped = TRIBE_PAY_TAX_RPC_ERROR_MAP[code]
      return NextResponse.json(
        { error: mapped?.message ?? 'Tax payment failed' },
        { status: mapped?.status ?? 400 },
      )
    }

    return NextResponse.json({
      data: {
        message:  'Tax paid successfully',
        gold_paid: rpcResult.gold_paid as number,
        new_gold:  rpcResult.new_gold  as number,
      },
    })
  } catch (err) {
    console.error('Tribe/pay-tax error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
