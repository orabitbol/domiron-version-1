import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    const [{ data: bank }, { data: resources }] = await Promise.all([
      supabase.from('bank').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('gold').eq('player_id', playerId).single(),
    ])

    if (!bank || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    if (bank.interest_level >= BALANCE.bank.MAX_INTEREST_LEVEL) {
      return NextResponse.json({ error: 'Bank interest already at maximum level' }, { status: 400 })
    }

    const upgradeCost = BALANCE.bank.upgradeBaseCost * (bank.interest_level + 1)

    if (resources.gold < upgradeCost) {
      return NextResponse.json({ error: `Not enough gold (need ${upgradeCost})` }, { status: 400 })
    }

    const now = new Date().toISOString()
    const newLevel = bank.interest_level + 1

    await Promise.all([
      supabase.from('resources').update({ gold: resources.gold - upgradeCost, updated_at: now }).eq('player_id', playerId),
      supabase.from('bank').update({ interest_level: newLevel, updated_at: now }).eq('player_id', playerId),
    ])

    const [{ data: updatedBank }, { data: updatedResources }] = await Promise.all([
      supabase.from('bank').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    const maxLevel = BALANCE.bank.MAX_INTEREST_LEVEL
    const currentRate  = BALANCE.bank.INTEREST_RATE_BY_LEVEL[newLevel] ?? 0
    const nextRate     = newLevel < maxLevel ? (BALANCE.bank.INTEREST_RATE_BY_LEVEL[newLevel + 1] ?? null) : null
    const nextUpgradeCost = newLevel < maxLevel ? BALANCE.bank.upgradeBaseCost * (newLevel + 1) : null

    return NextResponse.json({
      bank:      updatedBank,
      resources: updatedResources,
      upgrade: {
        newLevel,
        currentRate,
        nextRate,
        upgradeCost:     nextUpgradeCost,
        atMaxLevel:      newLevel >= maxLevel,
      },
    })
  } catch (err) {
    console.error('Bank/upgrade error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
