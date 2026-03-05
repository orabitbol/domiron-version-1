/**
 * POST /api/bank/upgrade — Upgrade bank interest level
 *
 * Upgrade cost: BALANCE.bank.upgradeBaseCost × (currentLevel + 1)
 *
 * Both writes (resources.gold deduction + bank.interest_level increment) are
 * applied atomically via the bank_interest_upgrade_apply() Postgres RPC.
 * See: supabase/migrations/0015_bank_upgrade_rpc.sql
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const BANK_UPGRADE_RPC_ERROR_MAP: Record<string, string> = {
  already_max_level: 'Bank interest already at maximum level',
  not_enough_gold:   'Not enough gold',
  stale_level:       'Upgrade already applied — please refresh',
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // ── Fast pre-validation (read-only, good UX) ──────────────────────────
    const [{ data: bank }, { data: resources }] = await Promise.all([
      supabase.from('bank').select('interest_level').eq('player_id', playerId).single(),
      supabase.from('resources').select('gold').eq('player_id', playerId).single(),
    ])

    if (!bank || !resources) {
      return NextResponse.json({ error: 'Player data not found' }, { status: 404 })
    }

    const maxLevel   = BALANCE.bank.MAX_INTEREST_LEVEL
    const nextLevel  = bank.interest_level + 1
    const costGold   = BALANCE.bank.upgradeBaseCost * nextLevel

    if (bank.interest_level >= maxLevel) {
      return NextResponse.json({ error: BANK_UPGRADE_RPC_ERROR_MAP.already_max_level }, { status: 400 })
    }
    if (resources.gold < costGold) {
      return NextResponse.json({ error: `Not enough gold (need ${costGold})` }, { status: 400 })
    }

    // ── Atomic DB write via RPC ───────────────────────────────────────────────
    // bank_interest_upgrade_apply() acquires FOR UPDATE locks on bank + resources,
    // re-validates under lock (TOCTTOU-safe), then applies both writes atomically:
    //   resources.gold -= costGold
    //   bank.interest_level = nextLevel
    // See: supabase/migrations/0015_bank_upgrade_rpc.sql
    const { data: rpcResult, error: rpcError } = await supabase.rpc('bank_interest_upgrade_apply', {
      p_player_id:  playerId,
      p_cost_gold:  costGold,
      p_next_level: nextLevel,
      p_max_level:  maxLevel,
    })

    if (rpcError) {
      console.error('[bank/upgrade] RPC error:', rpcError.code, rpcError.message)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    if (!rpcResult?.ok) {
      const code = rpcResult?.error ?? 'unknown'
      return NextResponse.json(
        { error: BANK_UPGRADE_RPC_ERROR_MAP[code] ?? 'Upgrade failed' },
        { status: 400 },
      )
    }

    const newLevel: number = rpcResult.new_level as number

    // ── Re-fetch full rows for client state patch ─────────────────────────────
    const [{ data: updatedBank }, { data: updatedResources }] = await Promise.all([
      supabase.from('bank').select('*').eq('player_id', playerId).single(),
      supabase.from('resources').select('*').eq('player_id', playerId).single(),
    ])

    // ── Compute next upgrade info from BALANCE (no extra DB writes) ───────────
    const currentRate     = BALANCE.bank.INTEREST_RATE_BY_LEVEL[newLevel] ?? 0
    const nextRate        = newLevel < maxLevel ? (BALANCE.bank.INTEREST_RATE_BY_LEVEL[newLevel + 1] ?? null) : null
    const nextUpgradeCost = newLevel < maxLevel ? BALANCE.bank.upgradeBaseCost * (newLevel + 1) : null

    return NextResponse.json({
      bank:      updatedBank,
      resources: updatedResources,
      upgrade: {
        newLevel,
        currentRate,
        nextRate,
        upgradeCost: nextUpgradeCost,
        atMaxLevel:  newLevel >= maxLevel,
      },
    })
  } catch (err) {
    console.error('Bank/upgrade error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
