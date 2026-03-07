import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/rankings/tribes — public, returns top 10 tribe rankings
export async function GET() {
  try {
    const supabase = createAdminClient()

    const { data: tribes, error } = await supabase
      .from('tribes')
      .select('id,name,city,level,reputation,power_total,mana,tribe_members(count)')
      .order('power_total', { ascending: false })
      .limit(10)

    if (error) throw error

    return NextResponse.json({ data: { tribes: tribes ?? [] } })
  } catch (err) {
    console.error('Rankings/tribes error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
