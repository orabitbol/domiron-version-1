/**
 * POST /api/tribe/disband
 *
 * Leader disbands the tribe. Only allowed when the leader is the sole member.
 * All tribe data (members, spells, logs) is cascade-deleted with the tribe row.
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id, role')
      .eq('player_id', playerId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }
    if (membership.role !== 'leader') {
      return NextResponse.json({ error: 'Only the tribe leader can disband the tribe' }, { status: 403 })
    }

    const tribeId = membership.tribe_id

    // Must be the only member
    const { count: memberCount } = await supabase
      .from('tribe_members')
      .select('*', { count: 'exact', head: true })
      .eq('tribe_id', tribeId)

    if ((memberCount ?? 0) > 1) {
      return NextResponse.json({
        error: 'Cannot disband a tribe with members. Kick all members first.',
      }, { status: 400 })
    }

    // Delete tribe — CASCADE deletes all tribe_members, spells, logs, etc.
    const { error } = await supabase
      .from('tribes')
      .delete()
      .eq('id', tribeId)

    if (error) {
      console.error('Tribe disband error:', error)
      return NextResponse.json({ error: 'Failed to disband tribe' }, { status: 500 })
    }

    return NextResponse.json({ data: { message: 'Tribe disbanded successfully' } })
  } catch (err) {
    console.error('Tribe/disband error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
