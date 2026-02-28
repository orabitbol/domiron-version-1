import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/rankings — returns top 20 player rankings globally and per city
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
