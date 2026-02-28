import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'

const schema = z.object({
  spell_key: z.enum(['soldier_shield', 'resource_shield']),
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

    // Check if already owned
    const { data: existing } = await supabase
      .from('hero_spells')
      .select('id')
      .eq('player_id', playerId)
      .eq('spell_key', spell_key)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Spell already purchased' }, { status: 409 })
    }

    // Spell costs: use hero mana
    const spellConfig = spell_key === 'soldier_shield'
      ? BALANCE.hero.shields.soldierShield
      : BALANCE.hero.shields.resourceShield

    const { data: hero } = await supabase
      .from('hero')
      .select('mana')
      .eq('player_id', playerId)
      .single()

    if (!hero) {
      return NextResponse.json({ error: 'Hero not found' }, { status: 404 })
    }

    if (hero.mana < spellConfig.manaCost) {
      return NextResponse.json({
        error: `Not enough mana (need ${spellConfig.manaCost}, have ${hero.mana})`,
      }, { status: 400 })
    }

    const now = new Date().toISOString()

    await Promise.all([
      supabase.from('hero').update({ mana: hero.mana - spellConfig.manaCost, updated_at: now }).eq('player_id', playerId),
      supabase.from('hero_spells').insert({ player_id: playerId, spell_key }),
    ])

    return NextResponse.json({ data: { spell_key, message: 'Spell purchased' } })
  } catch (err) {
    console.error('Hero/buy-spell error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
