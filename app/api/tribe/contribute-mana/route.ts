/**
 * POST /api/tribe/contribute-mana
 *
 * Permanently transfers personal hero mana → tribe mana.
 * No refunds, no withdrawals. Uses tribe_contribute_mana_apply() RPC
 * which holds FOR UPDATE locks on tribe_members → hero → tribes
 * to prevent race conditions.
 *
 * The RPC returns new_hero_mana, new_tribe_mana, and tribe_id directly.
 * No follow-up query needed.
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

const RPC_ERROR_MAP: Record<string, { status: number; message: string }> = {
  invalid_amount:  { status: 400, message: 'Amount must be greater than 0' },
  not_in_tribe:    { status: 400, message: 'Not in a tribe' },
  hero_not_found:  { status: 404, message: 'Hero not found' },
  not_enough_mana: { status: 400, message: 'Not enough personal mana' },
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { amount } = parsed.data
    const supabase = createAdminClient()

    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'tribe_contribute_mana_apply',
      {
        p_player_id: playerId,
        p_amount:    amount,
        p_season_id: activeSeason.id,
      },
    )

    if (rpcError) {
      console.error('[tribe/contribute-mana] RPC error:', rpcError.code, rpcError.message)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    if (!rpcResult?.ok) {
      const code   = rpcResult?.error ?? 'unknown'
      const mapped = RPC_ERROR_MAP[code]
      return NextResponse.json(
        { error: mapped?.message ?? 'Mana contribution failed' },
        { status: mapped?.status ?? 400 },
      )
    }

    // RPC returns new_hero_mana, new_tribe_mana, tribe_id directly — no extra query needed
    return NextResponse.json({
      data: {
        mana_contributed: rpcResult.mana_contributed as number,
        new_hero_mana:    rpcResult.new_hero_mana    as number,
        new_tribe_mana:   rpcResult.new_tribe_mana   as number,
        tribe_id:         rpcResult.tribe_id         as string,
      },
    })
  } catch (err) {
    console.error('Tribe/contribute-mana error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
