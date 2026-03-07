/**
 * POST /api/shop/buy
 *
 * Thin wrapper over the shop_buy_apply() Postgres RPC.
 * All validation and mutations happen atomically inside the RPC.
 *
 * Pricing model (2026-03-07):
 *   Every weapon deducts ALL 4 resources equally.
 *   cost = BALANCE.weapons[category][weapon].cost = { gold, iron, wood, food }
 *   Total deducted = cost.X × amount for each resource X.
 *
 * Ownership rules:
 *   attack:                stackable — no per-player cap.
 *   defense / spy / scout: one per player — rejected if currentOwned > 0.
 *
 * Atomicity: shop_buy_apply() acquires FOR UPDATE locks on resources,
 * players, and weapons rows, re-validates post-lock, and commits all
 * mutations in one Postgres transaction.  See migration 0023_shop_rpc.sql.
 *
 * Duplicate-request guard: last_shop_at stamped atomically in RPC.
 * Route pre-checks it for fast 429 before spending an RPC round-trip.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { recalculatePower } from '@/lib/game/power'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const SHOP_COOLDOWN_MS = 500

const schema = z.object({
  weapon:   z.string(),
  amount:   z.number().int().min(1),
  category: z.enum(['attack', 'defense', 'spy', 'scout']),
})

type WeaponCost = { gold: number; iron: number; wood: number; food: number }

function resolveCost(
  category: 'attack' | 'defense' | 'spy' | 'scout',
  weapon: string,
): WeaponCost | null {
  const cat = BALANCE.weapons[category] as Record<string, { cost: WeaponCost }>
  return cat[weapon]?.cost ?? null
}

const BUY_RPC_ERROR_MAP: Record<string, { status: number; error: string }> = {
  invalid_amount:          { status: 400, error: 'Invalid amount' },
  invalid_cost:            { status: 400, error: 'Invalid cost' },
  unknown_weapon:          { status: 400, error: 'Unknown weapon' },
  too_many_requests:       { status: 429, error: 'Too many requests — wait a moment' },
  player_state_not_found:  { status: 404, error: 'Player data not found' },
  already_owned:           { status: 400, error: 'Already own this item' },
  not_enough_gold:         { status: 400, error: 'Not enough gold' },
  not_enough_iron:         { status: 400, error: 'Not enough iron' },
  not_enough_wood:         { status: 400, error: 'Not enough wood' },
  not_enough_food:         { status: 400, error: 'Not enough food' },
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const body   = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }

    const { weapon, amount, category } = parsed.data
    const supabase = createAdminClient()

    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // ── Resolve cost from BALANCE (single source of truth) ───────────────────
    const cost = resolveCost(category, weapon)
    if (!cost) {
      return NextResponse.json({ error: 'Unknown weapon' }, { status: 400 })
    }

    const totalGold = cost.gold * amount
    const totalIron = cost.iron * amount
    const totalWood = cost.wood * amount
    const totalFood = cost.food * amount

    // ── Fast duplicate-request pre-check ─────────────────────────────────────
    const { data: playerRow } = await supabase
      .from('players')
      .select('last_shop_at')
      .eq('id', playerId)
      .single()

    if (playerRow?.last_shop_at) {
      const msSinceLast = Date.now() - new Date(playerRow.last_shop_at).getTime()
      if (msSinceLast < SHOP_COOLDOWN_MS) {
        return NextResponse.json(
          { error: 'Too many requests — wait a moment' },
          { status: 429 },
        )
      }
    }

    // ── Atomic RPC ────────────────────────────────────────────────────────────
    const { data: rpcResult, error: rpcError } = await supabase.rpc('shop_buy_apply', {
      p_player_id:  playerId,
      p_weapon:     weapon,
      p_amount:     amount,
      p_is_multi:   category === 'attack',
      p_total_gold: totalGold,
      p_total_iron: totalIron,
      p_total_wood: totalWood,
      p_total_food: totalFood,
    })

    if (rpcError) {
      console.error('[shop/buy] RPC error:', rpcError)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    const result = rpcResult as { ok: boolean; error?: string }
    if (!result.ok) {
      const mapped = BUY_RPC_ERROR_MAP[result.error ?? '']
      return NextResponse.json(
        { error: mapped?.error ?? 'Purchase failed' },
        { status: mapped?.status ?? 400 },
      )
    }

    await recalculatePower(playerId, supabase)

    // ── Return updated snapshot ───────────────────────────────────────────────
    const [{ data: updatedWeapons }, { data: updatedResources }] = await Promise.all([
      supabase.from('weapons').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    return NextResponse.json({ weapons: updatedWeapons, resources: updatedResources })
  } catch (err) {
    console.error('[shop/buy] unexpected error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
