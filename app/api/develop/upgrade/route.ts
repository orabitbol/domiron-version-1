import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { recalculatePower } from '@/lib/game/power'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

type DevField = 'gold_level' | 'food_level' | 'wood_level' | 'iron_level' | 'population_level' | 'fortification_level'

const schema = z.object({
  field: z.enum(['gold_level', 'food_level', 'wood_level', 'iron_level', 'population_level', 'fortification_level']),
})

// Mirror of DevelopClient's getUpgradeCost — must stay in sync
function getUpgradeCost(field: DevField, currentLevel: number): { gold: number; resource: number; resourceType: string } {
  const isForti = field === 'fortification_level'
  const maxLevel = isForti ? 5 : 10
  if (currentLevel >= maxLevel) return { gold: 0, resource: 0, resourceType: 'gold' }

  const next = currentLevel + 1
  let costConfig: { gold: number; resource: number }
  if (next <= 2) costConfig = BALANCE.production.developmentUpgradeCost.level2
  else if (next <= 3) costConfig = BALANCE.production.developmentUpgradeCost.level3
  else if (next <= 5) costConfig = BALANCE.production.developmentUpgradeCost.level5
  else costConfig = BALANCE.production.developmentUpgradeCost.level10

  const multiplier = next
  const resourceMap: Record<DevField, string> = {
    gold_level: 'gold',
    food_level: 'food',
    wood_level: 'wood',
    iron_level: 'iron',
    population_level: 'food',
    fortification_level: 'gold',
  }

  return {
    gold: costConfig.gold * multiplier,
    resource: costConfig.resource * multiplier,
    resourceType: resourceMap[field],
  }
}

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

    const { field } = parsed.data
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    const [{ data: development }, { data: resources }] = await Promise.all([
      supabase.from('development').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    if (!development || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    const currentLevel = development[field] as number
    const isForti = field === 'fortification_level'
    const maxLevel = isForti ? 5 : 10

    if (currentLevel >= maxLevel) {
      return NextResponse.json({ error: 'Already at max level' }, { status: 400 })
    }

    const cost = getUpgradeCost(field, currentLevel)

    if (resources.gold < cost.gold) {
      return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
    }

    if (cost.resourceType !== 'gold' && cost.resource > 0) {
      const resAmt = resources[cost.resourceType as keyof typeof resources] as number
      if (resAmt < cost.resource) {
        return NextResponse.json({ error: `Not enough ${cost.resourceType}` }, { status: 400 })
      }
    }

    const resourceUpdate: Record<string, number> = { gold: resources.gold - cost.gold }
    if (cost.resourceType !== 'gold' && cost.resource > 0) {
      const currentRes = resources[cost.resourceType as keyof typeof resources] as number
      resourceUpdate[cost.resourceType] = currentRes - cost.resource
    }

    const now = new Date().toISOString()
    await Promise.all([
      supabase.from('resources').update({ ...resourceUpdate, updated_at: now }).eq('player_id', playerId),
      supabase.from('development').update({ [field]: currentLevel + 1, updated_at: now }).eq('player_id', playerId),
    ])

    // Recalculate power (fortification affects defense power)
    if (field === 'fortification_level') {
      await recalculatePower(playerId, supabase)
    }

    const [{ data: updatedDev }, { data: updatedResources }] = await Promise.all([
      supabase.from('development').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    return NextResponse.json({ data: { development: updatedDev, resources: updatedResources } })
  } catch (err) {
    console.error('Develop/upgrade error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
