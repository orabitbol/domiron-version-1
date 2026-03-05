import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { recalculatePower } from '@/lib/game/power'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  unit: z.enum(['soldier', 'slave', 'spy', 'scout', 'cavalry']),
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
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    const [
      { data: army },
      { data: resources },
    ] = await Promise.all([
      supabase.from('army').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('gold').eq('player_id', playerId).single(),
    ])

    if (!army || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    const cfg = BALANCE.training.unitCost[unit as keyof typeof BALANCE.training.unitCost]
    const totalGoldCost = cfg.gold * amount

    if (resources.gold < totalGoldCost) {
      return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
    }

    // ── Free population check (all units except cavalry consume pop) ───────
    // Cavalry requires existing soldiers — no population consumed.
    if (unit !== 'cavalry') {
      if (army.free_population < amount) {
        return NextResponse.json({
          error: `Not enough free population (need ${amount}, have ${army.free_population})`,
        }, { status: 400 })
      }
    }

    // ── Cavalry requires a minimum number of soldiers ──────────────────────
    if (unit === 'cavalry') {
      const cavCfg = cfg as { gold: number; capacityCost: number; soldierRatio: number }
      const requiredSoldiers = amount * cavCfg.soldierRatio
      if (army.soldiers < requiredSoldiers) {
        return NextResponse.json({
          error: `Need ${requiredSoldiers} soldiers to train ${amount} cavalry`,
        }, { status: 400 })
      }
    }

    // ── Build army update ──────────────────────────────────────────────────
    const armyUpdate: Record<string, number> = {}
    if (unit === 'soldier')  armyUpdate.soldiers        = army.soldiers        + amount
    if (unit === 'slave')    armyUpdate.slaves           = army.slaves           + amount
    if (unit === 'spy')      armyUpdate.spies            = army.spies            + amount
    if (unit === 'scout')    armyUpdate.scouts           = army.scouts           + amount
    if (unit === 'cavalry')  armyUpdate.cavalry          = army.cavalry          + amount

    // Deduct free population for all non-cavalry units
    if (unit !== 'cavalry') {
      armyUpdate.free_population = army.free_population - amount
    }

    const now = new Date().toISOString()

    await Promise.all([
      supabase.from('resources').update({ gold: resources.gold - totalGoldCost, updated_at: now }).eq('player_id', playerId),
      supabase.from('army').update({ ...armyUpdate, updated_at: now }).eq('player_id', playerId),
    ])

    // Recalculate power (army changed)
    await recalculatePower(playerId, supabase)

    // Fetch updated data to return for immediate client-side update
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
