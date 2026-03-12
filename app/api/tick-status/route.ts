import { NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/server'

// Never cache — must return the live next_tick_at on every request.
export const dynamic = 'force-dynamic'

/**
 * GET /api/tick-status
 *
 * Public endpoint. Returns the authoritative next-tick timestamp from world_state.
 * next_tick_at is always a future ISO timestamp — if the DB value is absent or past,
 * the next :00/:30 UTC cron boundary is synthesized so the client always has a valid target.
 */

// Returns the next :00 or :30 UTC boundary (pg_cron "every 30 min" schedule).
function computeNextCronBoundary(now: Date): Date {
  const result = new Date(now)
  if (result.getUTCMinutes() < 30) {
    result.setUTCMinutes(30, 0, 0)
  } else {
    result.setUTCHours(result.getUTCHours() + 1, 0, 0, 0)
  }
  return result
}

export async function GET() {
  noStore()
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('world_state')
    .select('next_tick_at')
    .eq('id', 1)
    .maybeSingle()

  const now = new Date()
  const dbValue = data?.next_tick_at ? new Date(data.next_tick_at) : null
  const nextTickAt =
    dbValue && dbValue > now
      ? dbValue.toISOString()
      : computeNextCronBoundary(now).toISOString()

  return NextResponse.json({
    server_now:   now.toISOString(),
    next_tick_at: nextTickAt,
  })
}
