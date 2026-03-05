/**
 * POST /api/training/untrain
 *
 * Returns trained slaves back to free_population.
 *
 * Rules:
 *   - ONLY slaves can be untrained.
 *   - Soldiers, spies, scouts, and cavalry cannot be untrained.
 *   - Untraining costs nothing (no gold refund).
 *   - army.slaves -= amount; army.free_population += amount.
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
  unit: z.literal('slave'),
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

    const { amount } = parsed.data
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

    if (army.slaves < amount) {
      return NextResponse.json({
        error: `Not enough slaves to untrain (have ${army.slaves}, requested ${amount})`,
      }, { status: 400 })
    }

    const now = new Date().toISOString()

    await supabase
      .from('army')
      .update({
        slaves:          army.slaves - amount,
        free_population: army.free_population + amount,
        updated_at:      now,
      })
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
        army:                updatedArmy,
        untrainedCount:      amount,
        freePopulationGained: amount,
      },
    })
  } catch (err) {
    console.error('Training/untrain error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
