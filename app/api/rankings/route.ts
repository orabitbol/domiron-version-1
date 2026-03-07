import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/rankings — public, returns top 20 player rankings
export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data: players, error } = await supabase
      .from('players')
      .select('id,username,race,army_name,city,rank_global,rank_city,power_total,power_attack,power_defense,power_spy,power_scout')
      .order('rank_global', { ascending: true })
      .limit(20)

    if (error) throw error

    return NextResponse.json({ data: { players: players ?? [] } })
  } catch (err) {
    console.error('Rankings error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
