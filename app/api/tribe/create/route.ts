import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

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

    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // Check player not already in a tribe
    const { data: existingMembership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', playerId)
      .maybeSingle()

    if (existingMembership) {
      return NextResponse.json({ error: 'Already in a tribe' }, { status: 409 })
    }

    // Check tribe name is unique
    const { data: existingTribe } = await supabase
      .from('tribes')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    if (existingTribe) {
      return NextResponse.json({ error: 'Tribe name already taken' }, { status: 409 })
    }

    // Get player city + hero mana
    const [{ data: player }, { data: heroData }] = await Promise.all([
      supabase.from('players').select('city').eq('id', playerId).single(),
      supabase.from('hero').select('mana').eq('player_id', playerId).single(),
    ])

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }
    if (!heroData) {
      return NextResponse.json({ error: 'Hero not found' }, { status: 404 })
    }

    const manaCost = BALANCE.tribe.creationManaCost
    if (heroData.mana < manaCost) {
      return NextResponse.json({
        error: `Not enough mana (need ${manaCost}, have ${heroData.mana})`,
      }, { status: 400 })
    }

    const seasonId = activeSeason.id

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

    // Add leader as member with role='leader' (tax exempt)
    await Promise.all([
      supabase.from('tribe_members').insert({
        tribe_id: tribe.id,
        player_id: playerId,
        role: 'leader',
        tax_exempt: true,
      }),
      // Deduct personal mana cost
      supabase.from('hero')
        .update({ mana: heroData.mana - manaCost, updated_at: new Date().toISOString() })
        .eq('player_id', playerId),
      // Audit log
      supabase.from('tribe_audit_log').insert({
        tribe_id: tribe.id,
        actor_id: playerId,
        action: 'tribe_created',
        details: { name: tribe.name, mana_cost: manaCost },
      }),
    ])

    return NextResponse.json({ data: { tribe } }, { status: 201 })
  } catch (err) {
    console.error('Tribe/create error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
