import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { recalculatePower } from '@/lib/game/power'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
  type: z.enum(['attack', 'defense', 'spy', 'scout']),
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

    const { type } = parsed.data
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    const [{ data: training }, { data: resources }] = await Promise.all([
      supabase.from('training').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('gold, food').eq('player_id', playerId).single(),
    ])

    if (!training || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    const levelField = `${type}_level` as 'attack_level' | 'defense_level' | 'spy_level' | 'scout_level'
    const currentLevel = training[levelField]
    const costPerLevel = BALANCE.training.advancedCost

    // Cost = base_cost * (current_level + 1) for each resource
    const goldCost = costPerLevel.gold * (currentLevel + 1)
    const foodCost = costPerLevel.food * (currentLevel + 1)

    if (resources.gold < goldCost) {
      return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
    }
    if (resources.food < foodCost) {
      return NextResponse.json({ error: 'Not enough food' }, { status: 400 })
    }

    const now = new Date().toISOString()

    await Promise.all([
      supabase.from('resources').update({
        gold: resources.gold - goldCost,
        food: resources.food - foodCost,
        updated_at: now,
      }).eq('player_id', playerId),
      supabase.from('training').update({
        [levelField]: currentLevel + 1,
        updated_at: now,
      }).eq('player_id', playerId),
    ])

    // Recalculate power (training level changed)
    await recalculatePower(playerId, supabase)

    const [{ data: updatedTraining }, { data: updatedResources }] = await Promise.all([
      supabase.from('training').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    return NextResponse.json({ data: { training: updatedTraining, resources: updatedResources } })
  } catch (err) {
    console.error('Training/advanced error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
