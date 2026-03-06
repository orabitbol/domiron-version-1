// POST /api/tribe/kick — leader or deputy removes a member
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  player_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const actorId = session.user.id

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { player_id: targetId } = parsed.data

    if (targetId === actorId) {
      return NextResponse.json({ error: 'Cannot kick yourself. Use leave instead.' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // Get actor membership + role
    const { data: actorMembership } = await supabase
      .from('tribe_members')
      .select('tribe_id, role')
      .eq('player_id', actorId)
      .single()

    if (!actorMembership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    // Only leader or deputy can kick
    if (actorMembership.role !== 'leader' && actorMembership.role !== 'deputy') {
      return NextResponse.json({ error: 'Only the tribe leader or a deputy can kick members' }, { status: 403 })
    }

    // Get target membership + role (must be in same tribe)
    const { data: targetMembership } = await supabase
      .from('tribe_members')
      .select('id, role')
      .eq('player_id', targetId)
      .eq('tribe_id', actorMembership.tribe_id)
      .single()

    if (!targetMembership) {
      return NextResponse.json({ error: 'Player is not in your tribe' }, { status: 404 })
    }

    // Leader cannot be kicked; deputies cannot kick other deputies
    if (targetMembership.role === 'leader') {
      return NextResponse.json({ error: 'Cannot kick the tribe leader' }, { status: 400 })
    }
    if (actorMembership.role === 'deputy' && targetMembership.role === 'deputy') {
      return NextResponse.json({ error: 'Deputies cannot kick other deputies' }, { status: 403 })
    }

    const { error } = await supabase
      .from('tribe_members')
      .delete()
      .eq('player_id', targetId)
      .eq('tribe_id', actorMembership.tribe_id)

    if (error) {
      console.error('Kick error:', error)
      return NextResponse.json({ error: 'Failed to kick member' }, { status: 500 })
    }

    await supabase.from('tribe_audit_log').insert({
      tribe_id: actorMembership.tribe_id,
      actor_id: actorId,
      action: 'member_kick',
      target_id: targetId,
      details: { kicked_role: targetMembership.role },
    })

    return NextResponse.json({ data: { message: 'Member kicked successfully' } })
  } catch (err) {
    console.error('Tribe/kick error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
