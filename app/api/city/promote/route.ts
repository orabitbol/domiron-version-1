import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

// POST /api/city/promote
// Promotes the player's city from N → N+1.
// Gates: auth, season freeze, city < 5, not in tribe, power_total >= threshold.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    const { data: player } = await supabase
      .from('players')
      .select('id, city, power_total')
      .eq('id', playerId)
      .single()

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    const currentCity = player.city
    const nextCity    = currentCity + 1

    if (currentCity >= 5) {
      return NextResponse.json({ error: 'Already at maximum city' }, { status: 400 })
    }

    // Must leave tribe before promoting
    const { data: tribeMember } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', playerId)
      .maybeSingle()

    if (tribeMember) {
      return NextResponse.json({ error: 'Must leave tribe before promoting to a higher city' }, { status: 400 })
    }

    const threshold = BALANCE.cities.promotionPowerThreshold[nextCity]
    if (player.power_total < threshold) {
      return NextResponse.json({
        error: `Not enough power to promote (need ${threshold}, have ${player.power_total})`,
        required: threshold,
        current: player.power_total,
      }, { status: 400 })
    }

    await supabase
      .from('players')
      .update({ city: nextCity })
      .eq('id', playerId)

    return NextResponse.json({
      data: {
        city:      nextCity,
        city_name: BALANCE.cities.names[nextCity],
      },
    })
  } catch (err) {
    console.error('City/promote error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
