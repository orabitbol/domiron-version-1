import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

const schema = z.object({
  name:   z.string().min(3).max(40),
  anthem: z.string().max(120).optional(),
})

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

    const { name, anthem } = parsed.data
    const supabase = createAdminClient()

    // Check player not already in a tribe
    const { data: existingMembership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', playerId)
      .single()

    if (existingMembership) {
      return NextResponse.json({ error: 'Already in a tribe' }, { status: 409 })
    }

    // Check tribe name is unique
    const { data: existingTribe } = await supabase
      .from('tribes')
      .select('id')
      .eq('name', name)
      .single()

    if (existingTribe) {
      return NextResponse.json({ error: 'Tribe name already taken' }, { status: 409 })
    }

    // Get player city and active season
    const [{ data: player }, { data: season }] = await Promise.all([
      supabase.from('players').select('city').eq('id', playerId).single(),
      supabase.from('seasons').select('id').eq('is_active', true).single(),
    ])

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    const seasonId = season?.id ?? 1

    // Create tribe
    const { data: tribe, error: tribeError } = await supabase
      .from('tribes')
      .insert({
        name,
        anthem: anthem ?? null,
        city: player.city,
        leader_id: playerId,
        season_id: seasonId,
      })
      .select()
      .single()

    if (tribeError || !tribe) {
      console.error('Tribe creation error:', tribeError)
      return NextResponse.json({ error: 'Failed to create tribe' }, { status: 500 })
    }

    // Add leader as member (tax exempt)
    await supabase.from('tribe_members').insert({
      tribe_id: tribe.id,
      player_id: playerId,
      tax_exempt: true,
    })

    return NextResponse.json({ data: { tribe } }, { status: 201 })
  } catch (err) {
    console.error('Tribe/create error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
