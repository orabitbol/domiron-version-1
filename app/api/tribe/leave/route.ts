import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()

    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', playerId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    // Leader cannot leave — must transfer leadership or disband first
    const { data: tribe } = await supabase
      .from('tribes')
      .select('leader_id')
      .eq('id', membership.tribe_id)
      .single()

    if (tribe?.leader_id === playerId) {
      return NextResponse.json({ error: 'Leader cannot leave. Transfer leadership or disband first.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('tribe_members')
      .delete()
      .eq('player_id', playerId)
      .eq('tribe_id', membership.tribe_id)

    if (error) {
      console.error('Tribe leave error:', error)
      return NextResponse.json({ error: 'Failed to leave tribe' }, { status: 500 })
    }

    return NextResponse.json({ data: { message: 'Left tribe successfully' } })
  } catch (err) {
    console.error('Tribe/leave error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
