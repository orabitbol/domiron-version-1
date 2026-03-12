/**
 * GET /api/admin/revenue
 *
 * Returns a revenue summary from the payments table.
 * The payments table is the canonical store for future payment integration.
 *
 * Note: No payment provider is connected yet. All values will be 0 / empty
 * until a provider writes records to the payments table.
 *
 * Auth: admin role required.
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()

  const [completedR, allCountR, recentR] = await Promise.all([
    // All completed payments — used for revenue math
    supabase
      .from('payments')
      .select('amount_cents, currency, product_key, player_id')
      .eq('status', 'completed'),

    // Total row count across all statuses
    supabase
      .from('payments')
      .select('id', { count: 'exact', head: true }),

    // Recent 20 rows for the transactions table
    supabase
      .from('payments')
      .select('id, player_id, amount_cents, currency, product_key, provider, status, created_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const completed     = completedR.data ?? []
  const totalCents    = completed.reduce((sum, r) => sum + r.amount_cents, 0)
  const payingUserIds = new Set(completed.map(r => r.player_id).filter(Boolean))
  const completedCount = completed.length

  // Revenue by product key (completed only)
  const byProduct: Record<string, { count: number; totalCents: number }> = {}
  for (const r of completed) {
    const key = r.product_key
    if (!byProduct[key]) byProduct[key] = { count: 0, totalCents: 0 }
    byProduct[key].count     += 1
    byProduct[key].totalCents += r.amount_cents
  }

  return NextResponse.json({
    data: {
      totalRevenueCents:   totalCents,
      totalTransactions:   allCountR.count ?? 0,
      completedCount,
      payingUsersCount:    payingUserIds.size,
      avgOrderValueCents:  completedCount > 0 ? Math.round(totalCents / completedCount) : 0,
      revenueByProduct:    byProduct,
      recentTransactions:  recentR.data ?? [],
    },
  })
}
