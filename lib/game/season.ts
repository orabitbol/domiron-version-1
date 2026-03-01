/**
 * Season guard utilities.
 *
 * getActiveSeason — queries the DB for a season that is both status='active'
 *   AND ends_at > now. Returns null when:
 *     - no season with status='active' exists (hard reset just ran, or never seeded), OR
 *     - the active season's ends_at has already passed (auto-freeze, no cron needed).
 *
 * seasonFreezeResponse — returns a standard 423 response for frozen game state.
 *
 * All gameplay write routes should call getActiveSeason() after auth check and
 * before any DB writes. Skip for: admin reset, auth, and no-op routes.
 */

import { NextResponse }       from 'next/server'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Season }         from '@/types/game'

export async function getActiveSeason(
  supabase: SupabaseClient<any, any, any>,
): Promise<Season | null> {
  const now = new Date().toISOString()
  const { data } = await supabase
    .from('seasons')
    .select('id,number,status,starts_at,ends_at,ended_at,created_at,created_by')
    .eq('status', 'active')
    .gt('ends_at', now)   // expired seasons treated as ended even if status not flipped yet
    .single()
  return (data as Season | null) ?? null
}

export function seasonFreezeResponse(): NextResponse {
  return NextResponse.json(
    {
      error:   'SeasonEnded',
      message: 'Season has ended. Game is in freeze mode.',
    },
    { status: 423 },
  )
}
