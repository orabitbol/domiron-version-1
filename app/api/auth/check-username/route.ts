import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const USERNAME_RE = /^[a-zA-Z0-9]+$/

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const username = searchParams.get('username') ?? ''

  // Format guard — same rules as the registration schema
  if (
    username.length < 3 ||
    username.length > 20 ||
    !USERNAME_RE.test(username)
  ) {
    return NextResponse.json({ available: false })
  }

  const supabase = createAdminClient()

  const { data } = await supabase
    .from('players')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  return NextResponse.json({ available: !data })
}
