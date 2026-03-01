import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  tribe_id: z.string().uuid(),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { tribe_id } = parsed.data
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // Check player not already in a tribe
    const { data: existingMembership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', playerId)
      .single()

    if (existingMembership) {
      return NextResponse.json({ error: 'Already in a tribe' }, { status: 409 })
    }

    // Get tribe and member count
    const { data: tribe } = await supabase
      .from('tribes')
      .select('id, name, max_members')
      .eq('id', tribe_id)
      .single()

    if (!tribe) {
      return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
    }

    const { count: memberCount } = await supabase
      .from('tribe_members')
      .select('*', { count: 'exact', head: true })
      .eq('tribe_id', tribe_id)

    if ((memberCount ?? 0) >= BALANCE.clan.maxMembers) {
      return NextResponse.json({ error: 'Tribe is full' }, { status: 400 })
    }

    const { error } = await supabase.from('tribe_members').insert({
      tribe_id,
      player_id: playerId,
    })

    if (error) {
      console.error('Tribe join error:', error)
      return NextResponse.json({ error: 'Failed to join tribe' }, { status: 500 })
    }

    return NextResponse.json({ data: { tribe_id, message: 'Joined tribe successfully' } })
  } catch (err) {
    console.error('Tribe/join error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
