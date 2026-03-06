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

    const tribeId = membership.tribe_id

    if (membership.role === 'leader') {
      // Count all members to decide outcome
      const { count: memberCount } = await supabase
        .from('tribe_members')
        .select('*', { count: 'exact', head: true })
        .eq('tribe_id', tribeId)

      if ((memberCount ?? 0) <= 1) {
        // Solo leader — use /api/tribe/disband instead
        return NextResponse.json({
          error: 'You are the only member. Use /api/tribe/disband to disband the tribe.',
        }, { status: 400 })
      }

      // Multiple members — check for deputies
      const { count: deputyCount } = await supabase
        .from('tribe_members')
        .select('*', { count: 'exact', head: true })
        .eq('tribe_id', tribeId)
        .eq('role', 'deputy')

      if ((deputyCount ?? 0) === 0) {
        return NextResponse.json({
          error: 'Appoint at least one deputy before leaving the tribe.',
        }, { status: 400 })
      }

      return NextResponse.json({
        error: 'Transfer leadership to a deputy before leaving. Use /api/tribe/transfer-leadership.',
      }, { status: 400 })
    }

    // Deputy or member — leave directly
    const { error } = await supabase
      .from('tribe_members')
      .delete()
      .eq('player_id', playerId)
      .eq('tribe_id', tribeId)

    if (error) {
      console.error('Tribe leave error:', error)
      return NextResponse.json({ error: 'Failed to leave tribe' }, { status: 500 })
    }

    await supabase.from('tribe_audit_log').insert({
      tribe_id: tribeId,
      actor_id: playerId,
      action: 'member_leave',
      details: { role: membership.role },
    })

    return NextResponse.json({ data: { message: 'Left tribe successfully' } })
  } catch (err) {
    console.error('Tribe/leave error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
