import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  player_id: z.string().uuid(),
})

// Leader manually adds a player to their tribe
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
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // Verify requester is the tribe leader
    const { data: leaderMembership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', leaderId)
      .single()

    if (!leaderMembership) {
      return NextResponse.json({ error: 'You are not in a tribe' }, { status: 400 })
    }

    const { data: tribe } = await supabase
      .from('tribes')
      .select('leader_id, max_members')
      .eq('id', leaderMembership.tribe_id)
      .single()

    if (tribe?.leader_id !== leaderId) {
      return NextResponse.json({ error: 'Only the tribe leader can accept members' }, { status: 403 })
    }

    // Check target player exists and isn't already in a tribe
    const { data: targetPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('id', targetId)
      .single()

    if (!targetPlayer) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    const { data: existingMembership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', targetId)
      .maybeSingle()

    if (existingMembership) {
      return NextResponse.json({ error: 'Player is already in a tribe' }, { status: 409 })
    }

    // Check tribe capacity
    const { count: memberCount } = await supabase
      .from('tribe_members')
      .select('*', { count: 'exact', head: true })
      .eq('tribe_id', leaderMembership.tribe_id)

    if ((memberCount ?? 0) >= BALANCE.clan.maxMembers) {
      return NextResponse.json({ error: 'Tribe is full' }, { status: 400 })
    }

    const { error } = await supabase.from('tribe_members').insert({
      tribe_id: leaderMembership.tribe_id,
      player_id: targetId,
    })

    if (error) {
      console.error('Accept member error:', error)
      return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
    }

    return NextResponse.json({ data: { message: 'Member added to tribe' } })
  } catch (err) {
    console.error('Tribe/accept-member error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
