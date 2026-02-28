import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { recalculatePower } from '@/lib/game/power'

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

    const currentOwned = weapons[weapon as keyof typeof weapons] as number
    if (currentOwned < amount) {
      return NextResponse.json({ error: `You only own ${currentOwned} of this item` }, { status: 400 })
    }

    const refundPct = BALANCE.weapons.sellRefundPercent
    const now = new Date().toISOString()
    let resourceUpdate: Record<string, number> = {}

    if (category === 'attack') {
      const cfg = BALANCE.weapons.attack[weapon as keyof typeof BALANCE.weapons.attack]
      if (!cfg) return NextResponse.json({ error: 'Unknown weapon' }, { status: 400 })
      const ironRefund = Math.floor(cfg.costIron * refundPct * amount)
      resourceUpdate = { iron: resources.iron + ironRefund }
    } else if (category === 'defense') {
      const cfg = BALANCE.weapons.defense[weapon as keyof typeof BALANCE.weapons.defense]
      if (!cfg) return NextResponse.json({ error: 'Unknown weapon' }, { status: 400 })
      const goldRefund = Math.floor(cfg.costGold * refundPct * amount)
      resourceUpdate = { gold: resources.gold + goldRefund }
    } else if (category === 'spy') {
      const cfg = BALANCE.weapons.spy[weapon as keyof typeof BALANCE.weapons.spy]
      if (!cfg) return NextResponse.json({ error: 'Unknown weapon' }, { status: 400 })
      const goldRefund = Math.floor(cfg.costGold * refundPct * amount)
      resourceUpdate = { gold: resources.gold + goldRefund }
    } else if (category === 'scout') {
      const cfg = BALANCE.weapons.scout[weapon as keyof typeof BALANCE.weapons.scout]
      if (!cfg) return NextResponse.json({ error: 'Unknown weapon' }, { status: 400 })
      const goldRefund = Math.floor(cfg.costGold * refundPct * amount)
      resourceUpdate = { gold: resources.gold + goldRefund }
    }

    await Promise.all([
      supabase.from('resources').update({ ...resourceUpdate, updated_at: now }).eq('player_id', playerId),
      supabase.from('weapons').update({ [weapon]: currentOwned - amount, updated_at: now }).eq('player_id', playerId),
    ])

    // Recalculate power (weapons changed)
    await recalculatePower(playerId, supabase)

    const [{ data: updatedWeapons }, { data: updatedResources }] = await Promise.all([
      supabase.from('weapons').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    return NextResponse.json({ weapons: updatedWeapons, resources: updatedResources })
  } catch (err) {
    console.error('Shop/sell error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
