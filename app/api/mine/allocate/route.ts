/**
 * POST /api/mine/allocate
 *
 * Assigns slaves to resource jobs. Each slave is in exactly one state:
 *   idle (unassigned), gold, iron, wood, or food.
 *
 * Invariant: gold + iron + wood + food <= army.slaves
 *   Idle slaves = army.slaves - (gold + iron + wood + food)
 *
 * This is a real DB write — assignments persist and drive tick production.
 * The freeze guard is enforced because this affects game economy.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  gold: z.number().int().min(0),
  iron: z.number().int().min(0),
  wood: z.number().int().min(0),
  food: z.number().int().min(0),
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

    const { gold, iron, wood, food } = parsed.data
    const supabase = createAdminClient()

    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    const { data: army } = await supabase
      .from('army')
      .select('slaves')
      .eq('player_id', playerId)
      .maybeSingle()

    if (!army) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    const totalAssigned = gold + iron + wood + food
    if (totalAssigned > army.slaves) {
      return NextResponse.json({
        error: `Assignment (${totalAssigned}) exceeds total slaves (${army.slaves})`,
      }, { status: 400 })
    }

    const now = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('army')
      .update({
        slaves_gold: gold,
        slaves_iron: iron,
        slaves_wood: wood,
        slaves_food: food,
        updated_at:  now,
      })
      .eq('player_id', playerId)

    if (updateError) {
      console.error('Mine/allocate DB error:', updateError)
      // Return the raw DB message in non-production so developers can diagnose
      // (e.g. "column slaves_gold does not exist" → run migration 0005)
      return NextResponse.json({
        error: 'Failed to save allocation',
        ...(process.env.NODE_ENV !== 'production' && { details: updateError.message }),
      }, { status: 500 })
    }

    const { data: updatedArmy } = await supabase
      .from('army')
      .select('*')
      .eq('player_id', playerId)
      .single()

    return NextResponse.json({ data: { army: updatedArmy } })
  } catch (err) {
    console.error('Mine/allocate error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
