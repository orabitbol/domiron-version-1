import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'

const schema = z.object({
  shield_type: z.enum(['soldier_shield', 'resource_shield']),
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

    const { shield_type } = parsed.data
    const supabase = createAdminClient()

    // Check player owns this spell
    const { data: ownedSpell } = await supabase
      .from('hero_spells')
      .select('id')
      .eq('player_id', playerId)
      .eq('spell_key', shield_type)
      .single()

    if (!ownedSpell) {
      return NextResponse.json({ error: 'You have not purchased this spell' }, { status: 400 })
    }

    const { data: hero } = await supabase
      .from('hero')
      .select('mana')
      .eq('player_id', playerId)
      .single()

    if (!hero) {
      return NextResponse.json({ error: 'Hero not found' }, { status: 404 })
    }

    const shieldCfg = shield_type === 'soldier_shield'
      ? BALANCE.hero.shields.soldierShield
      : BALANCE.hero.shields.resourceShield

    if (hero.mana < shieldCfg.manaCost) {
      return NextResponse.json({
        error: `Not enough mana (need ${shieldCfg.manaCost}, have ${hero.mana})`,
      }, { status: 400 })
    }

    const expiresAt = new Date(Date.now() + shieldCfg.durationHours * 60 * 60 * 1000).toISOString()
    const now = new Date().toISOString()

    await supabase.from('hero').update({
      mana: hero.mana - shieldCfg.manaCost,
      updated_at: now,
    }).eq('player_id', playerId)

    return NextResponse.json({
      data: {
        shield_type,
        expires_at: expiresAt,
        mana_remaining: hero.mana - shieldCfg.manaCost,
      },
    })
  } catch (err) {
    console.error('Hero/activate-shield error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
