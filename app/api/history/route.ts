import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/history — returns the player's attack history (as attacker and defender)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()

    const [{ data: asAttacker }, { data: asDefender }] = await Promise.all([
      supabase
        .from('attacks')
        .select('id,defender_id,turns_used,atk_power,def_power,outcome,attacker_losses,defender_losses,gold_stolen,iron_stolen,wood_stolen,food_stolen,created_at,players!attacks_defender_id_fkey(username)')
        .eq('attacker_id', playerId)
        .order('created_at', { ascending: false })
        .limit(50),

      supabase
        .from('attacks')
        .select('id,attacker_id,turns_used,atk_power,def_power,outcome,attacker_losses,defender_losses,gold_stolen,iron_stolen,wood_stolen,food_stolen,created_at,players!attacks_attacker_id_fkey(username)')
        .eq('defender_id', playerId)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    return NextResponse.json({
      data: {
        as_attacker: asAttacker ?? [],
        as_defender: asDefender ?? [],
      },
    })
  } catch (err) {
    console.error('History error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
