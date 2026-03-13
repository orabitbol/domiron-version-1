import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const ALLOWED_DURATIONS = BALANCE.hero.SHIELD_DURATION_PRESETS as unknown as number[]

const schema = z.object({
  shield_type: z.enum(['soldier_shield', 'resource_shield']),
  hours: z.number().refine(
    (h) => ALLOWED_DURATIONS.includes(h),
    { message: `hours must be one of: ${ALLOWED_DURATIONS.join(', ')}` }
  ),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
    }

    const { shield_type, hours } = parsed.data
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    const isSoldier  = shield_type === 'soldier_shield'
    const effectType = isSoldier ? 'SOLDIER_SHIELD' : 'RESOURCE_SHIELD'
    const manaCost   = hours * BALANCE.hero.SHIELD_MANA_PER_HOUR

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

    const now = new Date()

    // Reject if a cooldown window for this shield type hasn't expired yet
    const { data: inCooldown } = await supabase
      .from('player_hero_effects')
      .select('ends_at, cooldown_ends_at')
      .eq('player_id', playerId)
      .eq('type', effectType)
      .gt('cooldown_ends_at', now.toISOString())
      .limit(1)
      .maybeSingle()

    if (inCooldown) {
      const stillActive = now < new Date(inCooldown.ends_at)
      return NextResponse.json({
        error: stillActive
          ? 'Shield is already active'
          : 'Shield is in cooldown — cannot activate yet',
      }, { status: 400 })
    }

    // Compute effect window from the user-selected hours
    const endsAt         = new Date(now.getTime() + hours * 3_600_000)
    const cooldownEndsAt = new Date(
      now.getTime() + (hours + BALANCE.hero.SHIELD_COOLDOWN_HOURS) * 3_600_000
    )

    await Promise.all([
      supabase.from('hero').update({
        mana:       hero.mana - manaCost,
        updated_at: now.toISOString(),
      }).eq('player_id', playerId),

      supabase.from('player_hero_effects').insert({
        player_id:        playerId,
        type:             effectType,
        starts_at:        now.toISOString(),
        ends_at:          endsAt.toISOString(),
        cooldown_ends_at: cooldownEndsAt.toISOString(),
      }),
    ])

    return NextResponse.json({
      data: {
        shield_type,
        hours,
        mana_cost:        manaCost,
        ends_at:          endsAt.toISOString(),
        cooldown_ends_at: cooldownEndsAt.toISOString(),
        mana_remaining:   hero.mana - manaCost,
      },
    })
  } catch (err) {
    console.error('Hero/activate-shield error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
