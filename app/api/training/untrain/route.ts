/**
 * POST /api/training/untrain
 *
 * Returns trained units back to slaves (NEVER to free population).
 * Enslaved soldiers are demoted workers — they don't return to civilian life.
 *
 * Rules:
 *   - Only soldiers, spies, scouts, farmers can be untrained.
 *   - Cavalry cannot be untrained (they are a permanent tier upgrade).
 *   - Untraining costs nothing (no gold refund).
 *   - Amount deducted from the unit column, added to army.slaves.
 *   - Power recalculated after change.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { recalculatePower } from '@/lib/game/power'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  unit: z.enum(['soldier', 'spy', 'scout', 'farmer']),
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

    const { data: army } = await supabase
      .from('army')
      .select('*')
      .eq('player_id', playerId)
      .single()

    if (!army) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    // Check enough units to untrain
    const unitColumn = unit === 'spy' ? 'spies' : unit === 'scout' ? 'scouts' : unit + 's'
    const currentCount = army[unitColumn as keyof typeof army] as number
    if (currentCount < amount) {
      return NextResponse.json({
        error: `Not enough ${unit}s to untrain (have ${currentCount}, requested ${amount})`,
      }, { status: 400 })
    }

    const now = new Date().toISOString()

    const armyUpdate: Record<string, number | string> = {
      slaves: army.slaves + amount,
      updated_at: now,
      [unitColumn]: currentCount - amount,
    }

    await supabase
      .from('army')
      .update(armyUpdate)
      .eq('player_id', playerId)

    // Recalculate power (army changed)
    await recalculatePower(playerId, supabase)

    const { data: updatedArmy } = await supabase
      .from('army')
      .select('*')
      .eq('player_id', playerId)
      .single()

    return NextResponse.json({
      data: {
        army: updatedArmy,
        untrainedCount: amount,
        slavesGained: amount,
      },
    })
  } catch (err) {
    console.error('Training/untrain error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
