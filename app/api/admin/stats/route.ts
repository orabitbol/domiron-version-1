/**
 * GET /api/admin/stats
 *
 * Returns basic game statistics for the admin dashboard.
 * Auth: admin role required.
 */

import { NextResponse }      from 'next/server'
import { getServerSession }  from 'next-auth'
import { authOptions }       from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  // Active season
  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('id, number, starts_at, ends_at, status')
    .eq('status', 'active')
    .maybeSingle()

  if (seasonError) {
    return NextResponse.json({ error: 'Failed to fetch season' }, { status: 500 })
  }

  const seasonId = season?.id ?? 0

  // Player count
  const { count: playerCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', seasonId)

  // Players by city (fetch and aggregate)
  const { data: playerCityRows } = await supabase
    .from('players')
    .select('city')
    .eq('season_id', seasonId)

  const cityMap: Record<string, number> = {}
  for (const row of playerCityRows ?? []) {
    const city = row.city ?? 'unknown'
    cityMap[city] = (cityMap[city] ?? 0) + 1
  }
  const playersByCity = Object.entries(cityMap)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)

  // Tribe count
  const { count: tribeCount } = await supabase
    .from('tribes')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', seasonId)

  return NextResponse.json({
    data: {
      season:         season ?? null,
      playerCount:    playerCount ?? 0,
      playersByCity,
      tribeCount:     tribeCount ?? 0,
    },
  })
}
