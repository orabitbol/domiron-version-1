import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
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

    if (amount > bank.balance) {
      return NextResponse.json({ error: 'Insufficient bank balance' }, { status: 400 })
    }

    const now = new Date().toISOString()

    await Promise.all([
      supabase.from('resources').update({ gold: resources.gold + amount, updated_at: now }).eq('player_id', playerId),
      supabase.from('bank').update({ balance: bank.balance - amount, updated_at: now }).eq('player_id', playerId),
    ])

    const [{ data: updatedBank }, { data: updatedResources }] = await Promise.all([
      supabase.from('bank').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    return NextResponse.json({ bank: updatedBank, resources: updatedResources })
  } catch (err) {
    console.error('Bank/withdraw error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
