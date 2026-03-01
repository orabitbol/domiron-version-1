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

    const [{ data: player }, { data: army }, { data: resources }] = await Promise.all([
      supabase.from('players').select('city').eq('id', playerId).single(),
      supabase.from('army').select('soldiers').eq('player_id', playerId).single(),
      supabase.from('resources').select('gold, iron, wood, food').eq('player_id', playerId).single(),
    ])

    if (!player || !army || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    if (player.city >= 5) {
      return NextResponse.json({ error: 'Already in the highest city' }, { status: 400 })
    }

    const nextCityNum  = player.city + 1
    const nextCityReqs = BALANCE.cities.promotionRequirements[nextCityNum]
    const nextCityName = BALANCE.cities.names[nextCityNum] ?? `City ${nextCityNum}`

    const totalResources = resources.gold + resources.iron + resources.wood + resources.food

    // If promotion requirements are tuned (not undefined), enforce them
    if (nextCityReqs?.requiredSoldiers != null && army.soldiers < nextCityReqs.requiredSoldiers) {
      return NextResponse.json({
        error: `Need ${nextCityReqs.requiredSoldiers} soldiers (you have ${army.soldiers})`,
      }, { status: 400 })
    }

    if (nextCityReqs?.requiredResources != null && totalResources < nextCityReqs.requiredResources) {
      return NextResponse.json({
        error: `Need ${nextCityReqs.requiredResources} total resources (you have ${totalResources})`,
      }, { status: 400 })
    }

    await supabase.from('players').update({ city: nextCityNum }).eq('id', playerId)

    return NextResponse.json({ data: { city: nextCityNum, cityName: nextCityName } })
  } catch (err) {
    console.error('Develop/move-city error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
