/**
 * GET /api/admin/player-search
 *
 * Two modes depending on query params:
 *
 *   ?q=<string>   Search players by username / army_name / email (min 2 chars).
 *                 Returns a lightweight list (max 20 rows) — no resource data.
 *
 *   ?id=<uuid>    Fetch full state for a specific player: player row +
 *                 resources + army + hero. Used by the grant panel to show
 *                 current values and refresh after a grant.
 *
 * Auth: admin role required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { searchParams } = request.nextUrl
  const id = searchParams.get('id')?.trim() ?? ''
  const q  = searchParams.get('q')?.trim()  ?? ''

  // ── Mode 1: full player state ─────────────────────────────────────────────
  if (id) {
    const [playerR, resourcesR, armyR, heroR] = await Promise.all([
      supabase
        .from('players')
        .select('id, username, email, army_name, city, race, role, rank_global, power_total, turns, season_id, created_at')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('resources')
        .select('gold, iron, wood, food')
        .eq('player_id', id)
        .maybeSingle(),
      supabase
        .from('army')
        .select('free_population, soldiers, cavalry, spies, scouts, slaves')
        .eq('player_id', id)
        .maybeSingle(),
      supabase
        .from('hero')
        .select('level, mana, mana_per_tick, spell_points')
        .eq('player_id', id)
        .maybeSingle(),
    ])

    if (!playerR.data) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        player:    playerR.data,
        resources: resourcesR.data ?? null,
        army:      armyR.data      ?? null,
        hero:      heroR.data      ?? null,
      },
    })
  }

  // ── Mode 2: search by username / army_name / email ────────────────────────
  if (q.length < 2) {
    return NextResponse.json({ data: [] })
  }

  const pattern = `%${q}%`
  const { data: players, error } = await supabase
    .from('players')
    .select('id, username, email, army_name, city, race, role, rank_global, power_total')
    .or(`username.ilike.${pattern},army_name.ilike.${pattern},email.ilike.${pattern}`)
    .order('username', { ascending: true })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: players ?? [] })
}
