import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'

const schema = z.object({
  spell_key: z.enum(['combat_boost', 'tribe_shield', 'production_blessing', 'mass_spy', 'war_cry']),
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

    const { spell_key } = parsed.data
    const supabase = createAdminClient()

    // Get tribe membership
    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', playerId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    // Get tribe mana
    const { data: tribe } = await supabase
      .from('tribes')
      .select('id, mana, leader_id')
      .eq('id', membership.tribe_id)
      .single()

    if (!tribe) {
      return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
    }

    // Only leader can activate spells
    if (tribe.leader_id !== playerId) {
      return NextResponse.json({ error: 'Only the tribe leader can activate spells' }, { status: 403 })
    }

    const spellCfg = BALANCE.tribe.spells[spell_key]
    if (!spellCfg) {
      return NextResponse.json({ error: 'Unknown spell' }, { status: 400 })
    }

    if (tribe.mana < spellCfg.manaCost) {
      return NextResponse.json({
        error: `Not enough mana (need ${spellCfg.manaCost}, have ${tribe.mana})`,
      }, { status: 400 })
    }

    // Check if a non-mass_spy spell is already active
    if (spell_key !== 'mass_spy') {
      const { data: activeSpell } = await supabase
        .from('tribe_spells')
        .select('id')
        .eq('tribe_id', tribe.id)
        .eq('spell_key', spell_key)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (activeSpell) {
        return NextResponse.json({ error: 'This spell is already active' }, { status: 409 })
      }
    }

    const now = new Date()
    const expiresAt = spellCfg.durationHours > 0
      ? new Date(now.getTime() + spellCfg.durationHours * 60 * 60 * 1000).toISOString()
      : now.toISOString()  // mass_spy is instant, expires immediately

    await Promise.all([
      supabase.from('tribes').update({ mana: tribe.mana - spellCfg.manaCost }).eq('id', tribe.id),
      supabase.from('tribe_spells').insert({
        tribe_id: tribe.id,
        spell_key,
        activated_by: playerId,
        expires_at: expiresAt,
      }),
    ])

    return NextResponse.json({
      data: {
        spell_key,
        expires_at: expiresAt,
        mana_remaining: tribe.mana - spellCfg.manaCost,
      },
    })
  } catch (err) {
    console.error('Tribe/activate-spell error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
