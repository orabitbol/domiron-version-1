import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'

const schema = z.object({
  target_tribe_id: z.string().uuid(),
})

// Cast the mass_spy spell on an enemy tribe — reveals their member list
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

    const { target_tribe_id } = parsed.data
    const supabase = createAdminClient()

    // Get caster's tribe membership
    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', playerId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    if (membership.tribe_id === target_tribe_id) {
      return NextResponse.json({ error: 'Cannot spy on your own tribe' }, { status: 400 })
    }

    // Verify leader
    const { data: tribe } = await supabase
      .from('tribes')
      .select('id, mana, leader_id')
      .eq('id', membership.tribe_id)
      .single()

    if (!tribe) {
      return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
    }

    if (tribe.leader_id !== playerId) {
      return NextResponse.json({ error: 'Only the tribe leader can cast spells' }, { status: 403 })
    }

    const spellCfg = BALANCE.tribe.spells.mass_spy

    if (tribe.mana < spellCfg.manaCost) {
      return NextResponse.json({
        error: `Not enough mana (need ${spellCfg.manaCost}, have ${tribe.mana})`,
      }, { status: 400 })
    }

    // Get target tribe info
    const { data: targetTribe } = await supabase
      .from('tribes')
      .select('id, name, city, mana')
      .eq('id', target_tribe_id)
      .single()

    if (!targetTribe) {
      return NextResponse.json({ error: 'Target tribe not found' }, { status: 404 })
    }

    // Reveal member list
    const { data: members } = await supabase
      .from('tribe_members')
      .select('player_id, players!inner(username, race, city, power_total)')
      .eq('tribe_id', target_tribe_id)

    const now = new Date().toISOString()

    await Promise.all([
      supabase.from('tribes').update({ mana: tribe.mana - spellCfg.manaCost }).eq('id', tribe.id),
      supabase.from('tribe_spells').insert({
        tribe_id: tribe.id,
        spell_key: 'mass_spy',
        activated_by: playerId,
        expires_at: now,  // instant
      }),
    ])

    return NextResponse.json({
      data: {
        target_tribe: {
          name: targetTribe.name,
          city: targetTribe.city,
          mana: targetTribe.mana,
        },
        members: members?.map(m => (m.players as unknown as { username: string; race: string; city: number; power_total: number })) ?? [],
        mana_remaining: tribe.mana - spellCfg.manaCost,
      },
    })
  } catch (err) {
    console.error('Tribe/spell error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
