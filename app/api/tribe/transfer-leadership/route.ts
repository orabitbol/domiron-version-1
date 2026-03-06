/**
 * POST /api/tribe/transfer-leadership
 *
 * Leader transfers leadership to a chosen deputy.
 * Uses tribe_transfer_leadership_apply() RPC which locks both membership rows
 * atomically before writing, preventing partial-update failures.
 *
 * After transfer:
 *   - tribes.leader_id       → new leader
 *   - new leader's role      → 'leader'
 *   - old leader's role      → 'deputy'
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  new_leader_id: z.string().uuid(),
})

const RPC_ERROR_MAP: Record<string, { status: number; message: string }> = {
  same_player:         { status: 400, message: 'You are already the leader' },
  actor_not_in_tribe:  { status: 400, message: 'Not in a tribe' },
  not_leader:          { status: 403, message: 'Only the tribe leader can transfer leadership' },
  target_not_in_tribe: { status: 404, message: 'Player is not in your tribe' },
  target_not_deputy:   { status: 400, message: 'Leadership can only be transferred to a deputy' },
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentLeaderId = session.user.id

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { new_leader_id: newLeaderId } = parsed.data

    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // Get actor's tribe_id
    const { data: leaderMembership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', currentLeaderId)
      .maybeSingle()

    if (!leaderMembership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    const tribeId = leaderMembership.tribe_id

    // Atomic RPC: locks both rows, writes all 3 updates + audit log in one transaction
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'tribe_transfer_leadership_apply',
      {
        p_actor_id:      currentLeaderId,
        p_new_leader_id: newLeaderId,
        p_tribe_id:      tribeId,
      },
    )

    if (rpcError) {
      console.error('[tribe/transfer-leadership] RPC error:', rpcError.code, rpcError.message)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    if (!rpcResult?.ok) {
      const code   = rpcResult?.error ?? 'unknown'
      const mapped = RPC_ERROR_MAP[code]
      return NextResponse.json(
        { error: mapped?.message ?? 'Leadership transfer failed' },
        { status: mapped?.status ?? 400 },
      )
    }

    return NextResponse.json({ data: { new_leader_id: newLeaderId } })
  } catch (err) {
    console.error('Tribe/transfer-leadership error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
