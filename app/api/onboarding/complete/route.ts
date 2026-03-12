/**
 * POST /api/onboarding/complete
 *
 * Marks the authenticated player as having completed the first-time tour.
 * Sets players.has_completed_onboarding = true for their own row.
 *
 * Idempotent — safe to call multiple times (skip, finish, replay).
 * Auth: any logged-in player (not admin-only).
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('players')
    .update({ has_completed_onboarding: true })
    .eq('id', session.user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
