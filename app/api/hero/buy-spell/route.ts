import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

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
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

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

    // Mana cost uses canonical flat config keys
    const manaCost = spell_key === 'soldier_shield'
      ? BALANCE.hero.SOLDIER_SHIELD_MANA
      : BALANCE.hero.RESOURCE_SHIELD_MANA

    const { data: hero } = await supabase
      .from('hero')
      .select('mana')
      .eq('player_id', playerId)
      .single()

    if (!hero) {
      return NextResponse.json({ error: 'Hero not found' }, { status: 404 })
    }

    if (hero.mana < manaCost) {
      return NextResponse.json({
        error: `Not enough mana (need ${manaCost}, have ${hero.mana})`,
      }, { status: 400 })
    }

    const now = new Date().toISOString()

    await Promise.all([
      supabase.from('hero').update({ mana: hero.mana - manaCost, updated_at: now }).eq('player_id', playerId),
      supabase.from('hero_spells').insert({ player_id: playerId, spell_key }),
    ])

    return NextResponse.json({ data: { spell_key, message: 'Spell purchased' } })
  } catch (err) {
    console.error('Hero/buy-spell error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
