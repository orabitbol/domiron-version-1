import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/rankings/tribes — returns top 20 tribe rankings
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createAdminClient()

    const { data: tribes, error } = await supabase
      .from('tribes')
      .select('id,name,city,level,reputation,power_total,mana,tribe_members(count)')
      .order('power_total', { ascending: false })
      .limit(20)

    if (error) throw error

    return NextResponse.json({ data: { tribes: tribes ?? [] } })
  } catch (err) {
    console.error('Rankings/tribes error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
