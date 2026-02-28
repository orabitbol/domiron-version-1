import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()

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

    const nextCityNum = (player.city + 1) as 1 | 2 | 3 | 4 | 5
    const nextCity = BALANCE.cities[nextCityNum]

    const totalResources = resources.gold + resources.iron + resources.wood + resources.food

    if (army.soldiers < nextCity.requiredSoldiers) {
      return NextResponse.json({
        error: `Need ${nextCity.requiredSoldiers} soldiers (you have ${army.soldiers})`,
      }, { status: 400 })
    }

    if (totalResources < nextCity.requiredResources) {
      return NextResponse.json({
        error: `Need ${nextCity.requiredResources} total resources (you have ${totalResources})`,
      }, { status: 400 })
    }

    await supabase.from('players').update({ city: nextCityNum }).eq('id', playerId)

    return NextResponse.json({ data: { city: nextCityNum, cityName: nextCity.name } })
  } catch (err) {
    console.error('Develop/move-city error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
