import { NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'

// Force dynamic — this must never be cached; it returns the live next_tick_at.
export const dynamic = 'force-dynamic'

/**
 * GET /api/tick-status
 *
 * Public, unauthenticated endpoint. Returns the server clock and the
 * authoritative next-tick timestamp so all clients see the same countdown.
 *
 * Response:
 *   { server_now: string (ISO), next_tick_at: string (ISO) | null }
 *
 * next_tick_at is null only if the world_state table has no row yet
 * (i.e. the DB migration ran but no tick has executed yet).
 */
export async function GET() {
  noStore() // Belt-and-suspenders: prevent Next.js fetch cache from serving stale data
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('world_state')
    .select('next_tick_at')
    .eq('id', 1)
    .maybeSingle()

  return NextResponse.json({
    server_now:  new Date().toISOString(),
    next_tick_at: data?.next_tick_at ?? null,
  })
}
