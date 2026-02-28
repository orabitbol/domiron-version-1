import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { recalculatePower } from '@/lib/game/power'

const schema = z.object({
  unit: z.enum(['soldier', 'spy', 'scout', 'cavalry', 'farmer']),
  amount: z.number().int().min(1),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { unit, amount } = parsed.data
    const supabase = createAdminClient()

    const [
      { data: player },
      { data: army },
      { data: resources },
    ] = await Promise.all([
      supabase.from('players').select('capacity').eq('id', playerId).single(),
      supabase.from('army').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('gold').eq('player_id', playerId).single(),
    ])

    if (!player || !army || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    const cfg = BALANCE.training.unitCost[unit as keyof typeof BALANCE.training.unitCost]
    const totalGoldCost = cfg.gold * amount

    if (resources.gold < totalGoldCost) {
      return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
    }

    // Capacity check for combat units (soldiers, spies, scouts)
    const combatUnits = army.soldiers + army.spies + army.scouts
    if (unit === 'soldier' || unit === 'spy' || unit === 'scout') {
      if (combatUnits + amount > player.capacity) {
        return NextResponse.json({
          error: `Not enough capacity (${combatUnits + amount} > ${player.capacity})`,
        }, { status: 400 })
      }
    }

    // Cavalry requires soldiers (1 cavalry per soldierRatio soldiers)
    if (unit === 'cavalry') {
      const cavCfg = cfg as { gold: number; capacityCost: number; soldierRatio: number }
      const requiredSoldiers = amount * cavCfg.soldierRatio
      if (army.soldiers < requiredSoldiers) {
        return NextResponse.json({
          error: `Need ${requiredSoldiers} soldiers to train ${amount} cavalry`,
        }, { status: 400 })
      }
    }

    const armyUpdate: Record<string, number> = {}
    if (unit === 'soldier')  armyUpdate.soldiers = army.soldiers + amount
    if (unit === 'spy')      armyUpdate.spies    = army.spies    + amount
    if (unit === 'scout')    armyUpdate.scouts   = army.scouts   + amount
    if (unit === 'cavalry')  armyUpdate.cavalry  = army.cavalry  + amount
    if (unit === 'farmer')   armyUpdate.farmers  = army.farmers  + amount

    const now = new Date().toISOString()

    await Promise.all([
      supabase.from('resources').update({ gold: resources.gold - totalGoldCost, updated_at: now }).eq('player_id', playerId),
      supabase.from('army').update({ ...armyUpdate, updated_at: now }).eq('player_id', playerId),
    ])

    // Recalculate power (army changed)
    await recalculatePower(playerId, supabase)

    // Fetch updated data to return
    const [{ data: updatedArmy }, { data: updatedResources }] = await Promise.all([
      supabase.from('army').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    return NextResponse.json({ data: { army: updatedArmy, resources: updatedResources } })
  } catch (err) {
    console.error('Training/basic error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
