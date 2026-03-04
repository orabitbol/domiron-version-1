import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

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
      .select('city, power_total')
      .eq('id', playerId)
      .single()

    if (!player) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    if (player.city >= 5) {
      return NextResponse.json({ error: 'Already in the highest city' }, { status: 400 })
    }

    const nextCityNum  = player.city + 1
    const nextCityName = BALANCE.cities.names[nextCityNum] ?? `City ${nextCityNum}`
    const threshold    = BALANCE.cities.promotionPowerThreshold[nextCityNum]

    if (threshold != null && player.power_total < threshold) {
      return NextResponse.json({
        error: `Need ${threshold} power (you have ${player.power_total})`,
        required: threshold,
        current: player.power_total,
      }, { status: 400 })
    }

    await supabase.from('players').update({ city: nextCityNum }).eq('id', playerId)

    return NextResponse.json({ data: { city: nextCityNum, cityName: nextCityName } })
  } catch (err) {
    console.error('Develop/move-city error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
