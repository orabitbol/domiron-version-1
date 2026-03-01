import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const schema = z.object({
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

    const [{ data: bank }, { data: resources }] = await Promise.all([
      supabase.from('bank').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('gold').eq('player_id', playerId).single(),
    ])

    if (!bank || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    const today = new Date().toISOString().split('T')[0]
    const now = new Date().toISOString()

    // Reset deposits_today if it's a new day — must happen BEFORE the limit check
    const currentDepositsToday = bank.last_deposit_reset === today ? bank.deposits_today : 0

    if (currentDepositsToday >= BALANCE.bank.depositsPerDay) {
      return NextResponse.json({ error: 'No deposits remaining today' }, { status: 400 })
    }

    const maxDeposit = Math.floor(resources.gold * BALANCE.bank.maxDepositPercent)
    if (amount > maxDeposit) {
      return NextResponse.json({
        error: `Max deposit is ${maxDeposit} (${BALANCE.bank.maxDepositPercent * 100}% of gold on hand)`,
      }, { status: 400 })
    }

    if (amount > resources.gold) {
      return NextResponse.json({ error: 'Not enough gold' }, { status: 400 })
    }

    await Promise.all([
      supabase.from('resources').update({ gold: resources.gold - amount, updated_at: now }).eq('player_id', playerId),
      supabase.from('bank').update({
        balance: bank.balance + amount,
        deposits_today: currentDepositsToday + 1,
        last_deposit_reset: today,
        updated_at: now,
      }).eq('player_id', playerId),
    ])

    const [{ data: updatedBank }, { data: updatedResources }] = await Promise.all([
      supabase.from('bank').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    return NextResponse.json({ bank: updatedBank, resources: updatedResources })
  } catch (err) {
    console.error('Bank/deposit error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
