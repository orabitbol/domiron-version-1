import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'

// GET /api/player — returns all data needed for base page
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()
  const playerId = session.user.id

  const [
    { data: player },
    { data: resources },
    { data: army },
    { data: weapons },
    { data: training },
    { data: development },
    { data: hero },
    { data: bank },
    { data: tribeMember },
  ] = await Promise.all([
    supabase.from('players').select('id,username,email,role,race,army_name,city,turns,max_turns,capacity,reputation,rank_city,rank_global,power_attack,power_defense,power_spy,power_scout,power_total,vip_until,is_vacation,vacation_days_used,season_id,joined_at,last_seen_at,created_at').eq('id', playerId).single(),
    supabase.from('resources').select('*').eq('player_id', playerId).single(),
    supabase.from('army').select('*').eq('player_id', playerId).single(),
    supabase.from('weapons').select('*').eq('player_id', playerId).single(),
    supabase.from('training').select('*').eq('player_id', playerId).single(),
    supabase.from('development').select('*').eq('player_id', playerId).single(),
    supabase.from('hero').select('*').eq('player_id', playerId).single(),
    supabase.from('bank').select('*').eq('player_id', playerId).single(),
    supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', playerId)
      .single(),
  ])

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  let tribe = null
  if (tribeMember?.tribe_id) {
    const { data } = await supabase
      .from('tribes')
      .select('*')
      .eq('id', tribeMember.tribe_id)
      .single()
    tribe = data
  }

  return NextResponse.json({
    data: {
      player,
      resources,
      army,
      weapons,
      training,
      development,
      hero,
      bank,
      tribe,
    },
  })
}
