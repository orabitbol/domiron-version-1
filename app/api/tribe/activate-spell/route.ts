import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const V1_SPELL_KEYS = ['war_cry', 'tribe_shield', 'production_blessing', 'spy_veil', 'battle_supply'] as const

const schema = z.object({
  spell_key: z.enum(V1_SPELL_KEYS),
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

    // Get tribe membership with role
    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id, role')
      .eq('player_id', playerId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    // Only leader or deputy can activate spells
    if (membership.role !== 'leader' && membership.role !== 'deputy') {
      return NextResponse.json({ error: 'Only the tribe leader or a deputy can activate spells' }, { status: 403 })
    }

    // Get tribe mana
    const { data: tribe } = await supabase
      .from('tribes')
      .select('id, mana')
      .eq('id', membership.tribe_id)
      .single()

    if (!tribe) {
      return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
    }

    const spellCfg = BALANCE.tribe.spells[spell_key]
    if (!spellCfg) {
      return NextResponse.json({ error: 'Unknown spell' }, { status: 400 })
    }

    if (tribe.mana < spellCfg.manaCost) {
      return NextResponse.json({
        error: `Not enough tribe mana (need ${spellCfg.manaCost}, have ${tribe.mana})`,
      }, { status: 400 })
    }

    // Check if spell is already active
    const { data: activeSpell } = await supabase
      .from('tribe_spells')
      .select('id')
      .eq('tribe_id', tribe.id)
      .eq('spell_key', spell_key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (activeSpell) {
      return NextResponse.json({ error: 'This spell is already active' }, { status: 409 })
    }

    const expiresAt = new Date(Date.now() + spellCfg.durationHours * 3_600_000).toISOString()

    await Promise.all([
      supabase.from('tribes').update({ mana: tribe.mana - spellCfg.manaCost }).eq('id', tribe.id),
      supabase.from('tribe_spells').insert({
        tribe_id: tribe.id,
        spell_key,
        activated_by: playerId,
        expires_at: expiresAt,
      }),
      supabase.from('tribe_audit_log').insert({
        tribe_id: tribe.id,
        actor_id: playerId,
        action: 'spell_cast',
        details: { spell_key, mana_cost: spellCfg.manaCost, duration_hours: spellCfg.durationHours },
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
