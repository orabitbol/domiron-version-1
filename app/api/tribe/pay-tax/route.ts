import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // Get player's tribe membership
    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id, tax_paid_today, tax_exempt')
      .eq('player_id', playerId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    if (membership.tax_exempt) {
      return NextResponse.json({ error: 'Tax exempt members do not pay tax' }, { status: 400 })
    }

    if (membership.tax_paid_today) {
      return NextResponse.json({ error: 'Tax already paid today' }, { status: 400 })
    }

    // Get tribe tax amount
    const { data: tribe } = await supabase
      .from('tribes')
      .select('tax_amount, mana')
      .eq('id', membership.tribe_id)
      .single()

    if (!tribe) {
      return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
    }

    if (tribe.tax_amount === 0) {
      return NextResponse.json({ error: 'No tax set for this tribe' }, { status: 400 })
    }

    // Get player resources
    const { data: resources } = await supabase
      .from('resources')
      .select('gold')
      .eq('player_id', playerId)
      .single()

    if (!resources) {
      return NextResponse.json({ error: 'Player resources not found' }, { status: 404 })
    }

    if (resources.gold < tribe.tax_amount) {
      return NextResponse.json({ error: `Not enough gold (need ${tribe.tax_amount})` }, { status: 400 })
    }

    const now = new Date().toISOString()

    await Promise.all([
      // Deduct gold from player
      supabase.from('resources').update({
        gold: resources.gold - tribe.tax_amount,
        updated_at: now,
      }).eq('player_id', playerId),

      // Add gold to tribe mana pool (converted at 1:1 ratio; tribe uses mana for spells)
      // Tribe receives the full tax_amount as mana (game design: gold → tribe mana)
      supabase.from('tribes').update({
        mana: tribe.mana + tribe.tax_amount,
      }).eq('id', membership.tribe_id),

      // Mark tax as paid for today
      supabase.from('tribe_members').update({
        tax_paid_today: true,
      }).eq('player_id', playerId).eq('tribe_id', membership.tribe_id),
    ])

    return NextResponse.json({
      data: {
        message: 'Tax paid successfully',
        gold_paid: tribe.tax_amount,
        new_gold: resources.gold - tribe.tax_amount,
      },
    })
  } catch (err) {
    console.error('Tribe/pay-tax error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
