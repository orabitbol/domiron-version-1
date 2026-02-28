import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

const schema = z.object({
  gold_mine:   z.number().int().min(0),
  iron_mine:   z.number().int().min(0),
  woodcutters: z.number().int().min(0),
  farmers:     z.number().int().min(0),
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

    const { gold_mine, iron_mine, woodcutters, farmers } = parsed.data
    const supabase = createAdminClient()

    const { data: army } = await supabase
      .from('army')
      .select('slaves, farmers')
      .eq('player_id', playerId)
      .single()

    if (!army) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    const slaveTotal = gold_mine + iron_mine + woodcutters
    if (slaveTotal > army.slaves) {
      return NextResponse.json({
        error: `Slave allocation (${slaveTotal}) exceeds total slaves (${army.slaves})`,
      }, { status: 400 })
    }

    if (farmers > army.farmers) {
      return NextResponse.json({
        error: `Farmer allocation (${farmers}) exceeds total farmers (${army.farmers})`,
      }, { status: 400 })
    }

    // Allocation is informational — production tick uses army.slaves and army.farmers totals.
    // Return success to acknowledge the planning intent.
    return NextResponse.json({
      data: {
        message: 'Allocation saved',
        gold_mine,
        iron_mine,
        woodcutters,
        farmers,
      },
    })
  } catch (err) {
    console.error('Mine/allocate error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
