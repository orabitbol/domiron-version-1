import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/halloffame — public, returns hall of fame for the current/last season
export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data: season } = await supabase
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .single()

    const seasonId = season?.id ?? 1

    const { data: entries, error } = await supabase
      .from('hall_of_fame')
      .select('*')
      .eq('season_id', seasonId)
      .order('type', { ascending: true })
      .order('rank', { ascending: true })

    if (error) throw error

    const players = entries?.filter(e => e.type === 'player') ?? []
    const tribes = entries?.filter(e => e.type === 'tribe') ?? []

    return NextResponse.json({ data: { players, tribes } })
  } catch (err) {
    console.error('Hall of fame error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
