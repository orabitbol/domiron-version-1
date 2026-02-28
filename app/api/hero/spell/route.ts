import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/hero/spell — returns the player's purchased hero spells
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()

    const { data: spells, error } = await supabase
      .from('hero_spells')
      .select('*')
      .eq('player_id', playerId)

    if (error) throw error

    return NextResponse.json({ data: { spells: spells ?? [] } })
  } catch (err) {
    console.error('Hero/spell error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
