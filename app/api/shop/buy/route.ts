import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'

const schema = z.object({
  weapon: z.string(),
  amount: z.number().int().min(1),
  category: z.enum(['attack', 'defense', 'spy', 'scout']),
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

    const { weapon, amount, category } = parsed.data
    const supabase = createAdminClient()

    const [{ data: weapons }, { data: resources }] = await Promise.all([
      supabase.from('weapons').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    if (!weapons || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    const now = new Date().toISOString()
    let resourceUpdate: Record<string, number> = {}
    let weaponUpdate: Record<string, number> = {}

    if (category === 'attack') {
      const cfg = BALANCE.weapons.attack[weapon as keyof typeof BALANCE.weapons.attack]
      if (!cfg) return NextResponse.json({ error: 'Unknown weapon' }, { status: 400 })

      const currentOwned = weapons[weapon as keyof typeof weapons] as number
      if (currentOwned + amount > cfg.maxPerPlayer) {
        return NextResponse.json({
          error: `Max ${cfg.maxPerPlayer} of this weapon allowed (you own ${currentOwned})`,
        }, { status: 400 })
      }

      const totalIronCost = cfg.costIron * amount
      if (resources.iron < totalIronCost) {
        return NextResponse.json({ error: 'Not enough iron' }, { status: 400 })
      }

      resourceUpdate = { iron: resources.iron - totalIronCost }
      weaponUpdate = { [weapon]: currentOwned + amount }
    } else if (category === 'defense') {
      const cfg = BALANCE.weapons.defense[weapon as keyof typeof BALANCE.weapons.defense]
      if (!cfg) return NextResponse.json({ error: 'Unknown weapon' }, { status: 400 })

      const currentOwned = weapons[weapon as keyof typeof weapons] as number
      if (currentOwned > 0) {
        return NextResponse.json({ error: 'Already own this armor' }, { status: 400 })
      }

      // gods_armor costs gold + iron + wood
      const godsArmor = weapon === 'gods_armor' ? BALANCE.weapons.defense.gods_armor as { costGold: number; multiplier: number; costIron?: number; costWood?: number } : null
      const ironCost = godsArmor?.costIron ?? 0
      const woodCost = godsArmor?.costWood ?? 0

      if (resources.gold < cfg.costGold) {
        return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
      }
      if (ironCost > 0 && resources.iron < ironCost) {
        return NextResponse.json({ error: 'Not enough iron' }, { status: 400 })
      }
      if (woodCost > 0 && resources.wood < woodCost) {
        return NextResponse.json({ error: 'Not enough wood' }, { status: 400 })
      }

      resourceUpdate = {
        gold: resources.gold - cfg.costGold,
        ...(ironCost > 0 ? { iron: resources.iron - ironCost } : {}),
        ...(woodCost > 0 ? { wood: resources.wood - woodCost } : {}),
      }
      weaponUpdate = { [weapon]: 1 }
    } else if (category === 'spy') {
      const cfg = BALANCE.weapons.spy[weapon as keyof typeof BALANCE.weapons.spy]
      if (!cfg) return NextResponse.json({ error: 'Unknown weapon' }, { status: 400 })

      const currentOwned = weapons[weapon as keyof typeof weapons] as number
      if (currentOwned > 0) {
        return NextResponse.json({ error: 'Already own this gear' }, { status: 400 })
      }
      if (resources.gold < cfg.costGold) {
        return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
      }

      resourceUpdate = { gold: resources.gold - cfg.costGold }
      weaponUpdate = { [weapon]: 1 }
    } else if (category === 'scout') {
      const cfg = BALANCE.weapons.scout[weapon as keyof typeof BALANCE.weapons.scout]
      if (!cfg) return NextResponse.json({ error: 'Unknown weapon' }, { status: 400 })

      const currentOwned = weapons[weapon as keyof typeof weapons] as number
      if (currentOwned > 0) {
        return NextResponse.json({ error: 'Already own this gear' }, { status: 400 })
      }
      if (resources.gold < cfg.costGold) {
        return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
      }

      resourceUpdate = { gold: resources.gold - cfg.costGold }
      weaponUpdate = { [weapon]: 1 }
    }

    await Promise.all([
      supabase.from('resources').update({ ...resourceUpdate, updated_at: now }).eq('player_id', playerId),
      supabase.from('weapons').update({ ...weaponUpdate, updated_at: now }).eq('player_id', playerId),
    ])

    const [{ data: updatedWeapons }, { data: updatedResources }] = await Promise.all([
      supabase.from('weapons').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    return NextResponse.json({ weapons: updatedWeapons, resources: updatedResources })
  } catch (err) {
    console.error('Shop/buy error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
