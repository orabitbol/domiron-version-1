/**
 * GET /api/admin/player
 *
 * Returns all players in the active season.
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

  // Get active season
  const { data: activeSeason, error: seasonError } = await supabase
    .from('seasons')
    .select('id, number')
    .eq('status', 'active')
    .maybeSingle()

  if (seasonError) {
    return NextResponse.json({ error: 'Failed to fetch active season' }, { status: 500 })
  }

  if (!activeSeason) {
    return NextResponse.json({ data: { seasonId: null, players: [] } })
  }

  // Fetch all players in active season
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select(
      'id, username, army_name, email, race, city, role, power_total, turns, is_vacation, rank_global, rank_city, joined_at, created_at'
    )
    .eq('season_id', activeSeason.id)
    .order('rank_global', { ascending: true, nullsFirst: false })

  if (playersError) {
    return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      seasonId: activeSeason.id,
      players:  players ?? [],
    },
  })
}
