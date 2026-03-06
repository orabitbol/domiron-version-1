/**
 * POST /api/tribe/tax-collect
 *
 * Dedicated cron route for automated daily tribe tax collection.
 * Protected by x-cron-secret header — never triggered client-side.
 *
 * Collection rules:
 *   - Runs hourly (see vercel.json: "0 * * * *")
 *   - Collects taxes only when current Israel local time >= taxCollectionHour (default 20:00)
 *   - Per-tribe idempotency: tribes.last_tax_collected_date = Israel date prevents double-collection
 *   - Per-member idempotency: tribe_tax_log UNIQUE (tribe_id, player_id, collected_date)
 *   - Leader and deputies are tax-exempt (role != 'member' || tax_exempt = true)
 *   - Gold goes directly to tribe leader's personal gold (no tribe treasury)
 *   - Unpaid members (insufficient gold) are logged with paid=false — no deduction
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'

function getIsraelDateHour(d: Date): { date: string; hour: number } {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone:  'Asia/Jerusalem',
    year:      'numeric',
    month:     '2-digit',
    day:       '2-digit',
  }).format(d) // → "YYYY-MM-DD"

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:  'Asia/Jerusalem',
    hour:      '2-digit',
    hour12:    false,
    hourCycle: 'h23',
  }).formatToParts(d)
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0') % 24

  return { date, hour }
}

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const { date: israelToday, hour: israelHour } = getIsraelDateHour(now)
  const taxHour = BALANCE.tribe.taxCollectionHour

  // Not yet collection time — skip silently
  if (israelHour < taxHour) {
    return NextResponse.json({
      data: {
        skipped:    true,
        reason:     `Not yet ${taxHour}:00 Israel time`,
        israel_now: `${israelToday} ${String(israelHour).padStart(2, '0')}:xx`,
      },
    })
  }

  console.log(`[TAX-COLLECT] Starting — israel_date=${israelToday} israel_hour=${israelHour}`)

  const supabase = createAdminClient()

  // Fetch active season
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'active')
    .gt('ends_at', now.toISOString())
    .maybeSingle()

  if (!season) {
    return NextResponse.json({ data: { skipped: true, reason: 'No active season' } })
  }

  // Fetch all tribes that have NOT yet collected taxes today
  const { data: tribes, error: tribesError } = await supabase
    .from('tribes')
    .select('id, leader_id, tax_amount, last_tax_collected_date')
    .neq('tax_amount', 0) // tribes with 0 tax have nothing to collect

  if (tribesError) {
    console.error('[TAX-COLLECT] Tribes fetch error:', tribesError)
    return NextResponse.json({ error: 'Failed to fetch tribes' }, { status: 500 })
  }

  const uncollectedTribes = (tribes ?? []).filter(
    t => t.last_tax_collected_date !== israelToday,
  )

  if (uncollectedTribes.length === 0) {
    console.log('[TAX-COLLECT] All tribes already collected today — skipping')
    return NextResponse.json({ data: { collected: 0, tribes_processed: 0, already_done: true } })
  }

  let totalCollected   = 0
  let totalPaid        = 0
  let totalUnpaid      = 0
  let tribesProcessed  = 0

  for (const tribe of uncollectedTribes) {
    // Fetch all non-exempt members (role = 'member' and tax_exempt = false)
    const { data: members, error: membersError } = await supabase
      .from('tribe_members')
      .select('player_id, role, tax_exempt')
      .eq('tribe_id', tribe.id)
      .eq('role', 'member')
      .eq('tax_exempt', false)

    if (membersError) {
      console.error(`[TAX-COLLECT] tribe=${tribe.id} — members fetch error:`, membersError)
      continue
    }

    if (!members || members.length === 0) {
      // No taxable members — still mark as collected for today
      await supabase
        .from('tribes')
        .update({ last_tax_collected_date: israelToday })
        .eq('id', tribe.id)
      tribesProcessed++
      continue
    }

    let tribePaid   = 0
    let tribeUnpaid = 0

    for (const member of members) {
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'tribe_collect_member_tax',
        {
          p_member_player_id: member.player_id,
          p_tribe_id:         tribe.id,
          p_leader_id:        tribe.leader_id,
          p_tax_amount:       tribe.tax_amount,
          p_collected_date:   israelToday,
          p_season_id:        season.id,
        },
      )

      if (rpcError) {
        console.error(`[TAX-COLLECT] tribe=${tribe.id} member=${member.player_id} RPC error:`, rpcError.message)
        continue
      }

      if (rpcResult?.skipped) continue

      if (!rpcResult?.ok) {
        const errCode = rpcResult?.error ?? 'unknown'
        if (errCode === 'leader_resources_not_found') {
          // Data integrity issue — leader has no resources row. All further members
          // in this tribe will also fail. Tribe is still marked collected today
          // because retrying next hour cannot fix missing data; needs manual intervention.
          console.error(`[TAX-COLLECT] tribe=${tribe.id} leader=${tribe.leader_id} resources row missing — skipping member ${member.player_id}`)
        } else {
          console.warn(`[TAX-COLLECT] tribe=${tribe.id} member=${member.player_id} RPC not ok: ${errCode}`)
        }
        continue
      }

      if (rpcResult.paid) {
        tribePaid++
        totalPaid++
        totalCollected += tribe.tax_amount
      } else {
        tribeUnpaid++
        totalUnpaid++
      }
    }

    // Mark tribe as collected today (idempotency guard for next hourly run)
    await supabase
      .from('tribes')
      .update({ last_tax_collected_date: israelToday })
      .eq('id', tribe.id)

    tribesProcessed++
    console.log(`[TAX-COLLECT] tribe=${tribe.id} paid=${tribePaid} unpaid=${tribeUnpaid}`)
  }

  console.log(
    `[TAX-COLLECT] Done — tribes=${tribesProcessed} total_paid=${totalPaid}` +
    ` total_unpaid=${totalUnpaid} gold_collected=${totalCollected}`,
  )

  return NextResponse.json({
    data: {
      israel_date:     israelToday,
      tribes_processed: tribesProcessed,
      members_paid:    totalPaid,
      members_unpaid:  totalUnpaid,
      gold_collected:  totalCollected,
    },
  })
}
