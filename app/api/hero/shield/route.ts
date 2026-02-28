// GET /api/hero/shield — returns available shield options and costs
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { BALANCE } from '@/lib/game/balance'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    data: {
      shields: {
        soldier_shield: BALANCE.hero.shields.soldierShield,
        resource_shield: BALANCE.hero.shields.resourceShield,
      },
    },
  })
}
