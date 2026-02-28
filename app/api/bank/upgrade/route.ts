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

    const [{ data: bank }, { data: resources }] = await Promise.all([
      supabase.from('bank').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('gold').eq('player_id', playerId).single(),
    ])

    if (!bank || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    const upgradeCost = BALANCE.bank.upgradeBaseCost * (bank.interest_level + 1)

    if (resources.gold < upgradeCost) {
      return NextResponse.json({ error: `Not enough gold (need ${upgradeCost})` }, { status: 400 })
    }

    const now = new Date().toISOString()

    await Promise.all([
      supabase.from('resources').update({ gold: resources.gold - upgradeCost, updated_at: now }).eq('player_id', playerId),
      supabase.from('bank').update({ interest_level: bank.interest_level + 1, updated_at: now }).eq('player_id', playerId),
    ])

    const [{ data: updatedBank }, { data: updatedResources }] = await Promise.all([
      supabase.from('bank').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    return NextResponse.json({ bank: updatedBank, resources: updatedResources })
  } catch (err) {
    console.error('Bank/upgrade error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
