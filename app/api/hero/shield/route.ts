// GET /api/hero/shield — returns canonical shield configuration (costs + timings)
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { BALANCE } from '@/lib/game/balance'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    data: {
      soldier_shield: {
        mana_cost:      BALANCE.hero.SOLDIER_SHIELD_MANA,
        duration_hours: BALANCE.hero.SHIELD_ACTIVE_HOURS,
        cooldown_hours: BALANCE.hero.SHIELD_COOLDOWN_HOURS,
      },
      resource_shield: {
        mana_cost:      BALANCE.hero.RESOURCE_SHIELD_MANA,
        duration_hours: BALANCE.hero.SHIELD_ACTIVE_HOURS,
        cooldown_hours: BALANCE.hero.SHIELD_COOLDOWN_HOURS,
      },
    },
  })
}
