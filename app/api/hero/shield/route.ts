// GET /api/hero/shield — returns canonical shield configuration (per-hour pricing)
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { BALANCE } from '@/lib/game/balance'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const presets = BALANCE.hero.SHIELD_DURATION_PRESETS as unknown as number[]

  return NextResponse.json({
    data: {
      mana_per_hour:      BALANCE.hero.SHIELD_MANA_PER_HOUR,
      cooldown_hours:     BALANCE.hero.SHIELD_COOLDOWN_HOURS,
      duration_presets:   presets,
      // precomputed costs for convenience
      preset_costs:       Object.fromEntries(
        presets.map((h) => [h, h * BALANCE.hero.SHIELD_MANA_PER_HOUR])
      ),
    },
  })
}
