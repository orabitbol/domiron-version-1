/**
 * POST /api/tribe/set-role
 *
 * Leader appoints or removes deputies.
 *   action='appoint' — promotes a member to deputy (max 3 deputies)
 *   action='remove'  — demotes a deputy back to member
 *
 * Uses tribe_set_member_role_apply() RPC which locks both membership rows
 * before any read-modify-write, making the deputy-cap check race-safe.
 *
 * Cannot change the leader's role via this route (use /transfer-leadership).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  target_player_id: z.string().uuid(),
  action: z.enum(['appoint', 'remove']),
})

const RPC_ERROR_MAP: Record<string, { status: number; message: string }> = {
  actor_not_in_tribe:  { status: 400, message: 'Not in a tribe' },
  not_leader:          { status: 403, message: 'Only the tribe leader can manage roles' },
  target_not_in_tribe: { status: 404, message: 'Player is not in your tribe' },
  cannot_change_leader:{ status: 400, message: 'Cannot change the leader role' },
  already_deputy:      { status: 409, message: 'Player is already a deputy' },
  not_deputy:          { status: 400, message: 'Player is not a deputy' },
  deputy_cap_reached:  { status: 400, message: 'Tribe already has the maximum of 3 deputies' },
  invalid_action:      { status: 400, message: 'Invalid action' },
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const actorId = session.user.id

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { target_player_id: targetId, action } = parsed.data

    if (targetId === actorId) {
      return NextResponse.json({ error: 'Cannot change your own role via this route' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // Get actor's tribe_id (needed for RPC)
    const { data: actorMembership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', actorId)
      .maybeSingle()

    if (!actorMembership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    const tribeId = actorMembership.tribe_id

    // Atomic RPC: locks both rows in UUID order, enforces deputy cap (3), writes audit log
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'tribe_set_member_role_apply',
      {
        p_actor_id:  actorId,
        p_target_id: targetId,
        p_action:    action,
        p_tribe_id:  tribeId,
      },
    )

    if (rpcError) {
      console.error('[tribe/set-role] RPC error:', rpcError.code, rpcError.message)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    if (!rpcResult?.ok) {
      const code   = rpcResult?.error ?? 'unknown'
      const mapped = RPC_ERROR_MAP[code]
      return NextResponse.json(
        { error: mapped?.message ?? 'Role change failed' },
        { status: mapped?.status ?? 400 },
      )
    }

    return NextResponse.json({ data: { target_player_id: targetId, action } })
  } catch (err) {
    console.error('Tribe/set-role error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
