import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'

const schema = z.object({
  amount: z.number().int().min(0),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const leaderId = session.user.id

  try {
    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { amount } = parsed.data
    const supabase = createAdminClient()

    // Verify requester is the tribe leader
    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', leaderId)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    const { data: tribe } = await supabase
      .from('tribes')
      .select('leader_id, city')
      .eq('id', membership.tribe_id)
      .single()

    if (tribe?.leader_id !== leaderId) {
      return NextResponse.json({ error: 'Only the tribe leader can set the tax' }, { status: 403 })
    }

    // Validate tax amount against city limit
    const cityKey = `city${tribe.city}` as keyof typeof BALANCE.tribe.taxLimits
    const maxTax = BALANCE.tribe.taxLimits[cityKey]

    if (amount > maxTax) {
      return NextResponse.json({
        error: `Tax exceeds city ${tribe.city} limit (max ${maxTax})`,
      }, { status: 400 })
    }

    const { error } = await supabase
      .from('tribes')
      .update({ tax_amount: amount })
      .eq('id', membership.tribe_id)

    if (error) {
      console.error('Set tax error:', error)
      return NextResponse.json({ error: 'Failed to set tax' }, { status: 500 })
    }

    return NextResponse.json({ data: { tax_amount: amount, message: 'Tax updated' } })
  } catch (err) {
    console.error('Tribe/set-tax error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
