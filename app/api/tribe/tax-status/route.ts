/**
 * GET /api/tribe/tax-status
 *
 * Returns the server-authoritative tax collection status for the
 * authenticated player's tribe.
 *
 * Response: { server_now, next_tax_at, last_tax_collected_at }
 *   server_now          — ISO timestamp (server clock)
 *   next_tax_at         — ISO timestamp of next scheduled collection
 *   last_tax_collected_at — Israel date string "YYYY-MM-DD" or null
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'

function getIsraelDateHour(d: Date): { date: string; hour: number } {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone:  'Asia/Jerusalem',
    year:      'numeric',
    month:     '2-digit',
    day:       '2-digit',
  }).format(d)

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:  'Asia/Jerusalem',
    hour:      '2-digit',
    hour12:    false,
    hourCycle: 'h23',
  }).formatToParts(d)
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0') % 24

  return { date, hour }
}

/** Compute the UTC timestamp of the next Israel-timezone taxCollectionHour. */
function computeNextTaxAtUTC(
  lastCollectedDate: string | null,
  now: Date,
): Date {
  const taxHour = BALANCE.tribe.taxCollectionHour
  const { date: israelToday, hour: israelHour } = getIsraelDateHour(now)

  const alreadyCollectedToday = lastCollectedDate === israelToday
  const pastCollectionTime    = israelHour >= taxHour

  // Determine the target Israel date for the next collection
  let targetIsraelDate: string
  if (!alreadyCollectedToday && !pastCollectionTime) {
    // Collection scheduled for later today
    targetIsraelDate = israelToday
  } else {
    // Already collected today, or it's past time and collection should happen on next cron run
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    targetIsraelDate = getIsraelDateHour(tomorrow).date
  }

  // Convert targetIsraelDate at taxHour:00 to UTC.
  // Method: get UTC offset by comparing noon-UTC of that day in Israel timezone.
  const [y, m, d] = targetIsraelDate.split('-').map(Number)
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const { hour: israelNoonHour } = getIsraelDateHour(noonUTC)
  const israelOffsetHours = israelNoonHour - 12 // 2 in standard time, 3 in DST

  const midnightUTC = Date.UTC(y, m - 1, d, 0, 0, 0)
  return new Date(midnightUTC + (taxHour - israelOffsetHours) * 3_600_000)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()

    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id')
      .eq('player_id', playerId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    const { data: tribe } = await supabase
      .from('tribes')
      .select('last_tax_collected_date')
      .eq('id', membership.tribe_id)
      .single()

    const now       = new Date()
    const nextTaxAt = computeNextTaxAtUTC(tribe?.last_tax_collected_date ?? null, now)

    return NextResponse.json({
      data: {
        server_now:           now.toISOString(),
        next_tax_at:          nextTaxAt.toISOString(),
        last_tax_collected_at: tribe?.last_tax_collected_date ?? null,
      },
    })
  } catch (err) {
    console.error('Tribe/tax-status error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
