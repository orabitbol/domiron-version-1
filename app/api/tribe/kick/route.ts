// Alias for kick-member — leader removes a member by player_id
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

  const leaderId = session.user.id

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { player_id: targetId } = parsed.data

    if (targetId === leaderId) {
      return NextResponse.json({ error: 'Cannot kick yourself. Use leave instead.' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    const { data: leaderMembership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', leaderId)
      .single()

    if (!leaderMembership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    const { data: tribe } = await supabase
      .from('tribes')
      .select('leader_id')
      .eq('id', leaderMembership.tribe_id)
      .single()

    if (tribe?.leader_id !== leaderId) {
      return NextResponse.json({ error: 'Only the tribe leader can kick members' }, { status: 403 })
    }

    const { data: targetMembership } = await supabase
      .from('tribe_members')
      .select('id')
      .eq('player_id', targetId)
      .eq('tribe_id', leaderMembership.tribe_id)
      .single()

    if (!targetMembership) {
      return NextResponse.json({ error: 'Player is not in your tribe' }, { status: 404 })
    }

    const { error } = await supabase
      .from('tribe_members')
      .delete()
      .eq('player_id', targetId)
      .eq('tribe_id', leaderMembership.tribe_id)

    if (error) {
      console.error('Kick error:', error)
      return NextResponse.json({ error: 'Failed to kick member' }, { status: 500 })
    }

    return NextResponse.json({ data: { message: 'Member kicked successfully' } })
  } catch (err) {
    console.error('Tribe/kick error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
