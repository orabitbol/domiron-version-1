/**
 * POST /api/tribe/upgrade-level
 *
 * Permanently upgrades tribe level by 1 by spending tribe mana.
 * Tribe level is irreversible and caps at BALANCE.tribe.levelUpgrade.maxLevel (5).
 *
 * Authorization: session required + must be tribe leader or deputy.
 *
 * Cost: BALANCE.tribe.levelUpgrade.manaCostByLevel[currentLevel] tribe mana.
 *
 * Both mutations (tribes.mana deduction + tribes.level increment) are applied
 * atomically via the tribe_upgrade_level_apply() Postgres RPC.
 * See: supabase/migrations/0022_tribe_level_upgrade.sql
 */
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

const RPC_ERROR_MAP: Record<string, { status: number; message: string }> = {
  not_in_tribe:      { status: 400, message: 'Not in a tribe' },
  not_authorized:    { status: 403, message: 'Only the tribe leader or a deputy can upgrade tribe level' },
  already_max_level: { status: 400, message: 'Tribe is already at maximum level' },
  stale_level:       { status: 409, message: 'Tribe level changed — please refresh and try again' },
  not_enough_mana:   { status: 400, message: 'Not enough tribe mana' },
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()

    // Season freeze guard — all game mutations must check this.
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // ── Fast pre-validation (read-only, gives good error messages early) ──────
    const { data: membership } = await supabase
      .from('tribe_members')
      .select('tribe_id, role')
      .eq('player_id', playerId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
    }

    if (membership.role !== 'leader' && membership.role !== 'deputy') {
      return NextResponse.json(
        { error: 'Only the tribe leader or a deputy can upgrade tribe level' },
        { status: 403 },
      )
    }

    const { data: tribe } = await supabase
      .from('tribes')
      .select('id, level, mana')
      .eq('id', membership.tribe_id)
      .single()

    if (!tribe) {
      return NextResponse.json({ error: 'Tribe not found' }, { status: 404 })
    }

    const { levelUpgrade } = BALANCE.tribe
    const maxLevel  = levelUpgrade.maxLevel
    const nextLevel = tribe.level + 1
    const manaCost  = levelUpgrade.manaCostByLevel[tribe.level]

    if (tribe.level >= maxLevel) {
      return NextResponse.json({ error: 'Tribe is already at maximum level' }, { status: 400 })
    }

    if (manaCost === undefined) {
      // Guard: should not happen if BALANCE validation is correct
      console.error('[tribe/upgrade-level] no cost defined for level', tribe.level)
      return NextResponse.json({ error: 'No upgrade cost defined for this level' }, { status: 500 })
    }

    if (tribe.mana < manaCost) {
      return NextResponse.json(
        { error: `Not enough tribe mana (need ${manaCost}, have ${tribe.mana})` },
        { status: 400 },
      )
    }

    // ── Atomic DB write via RPC ───────────────────────────────────────────────
    // tribe_upgrade_level_apply() acquires FOR UPDATE locks on tribe_members then
    // tribes, re-validates all conditions under lock (TOCTTOU-safe), then applies
    // both mutations atomically in one transaction:
    //   tribes.mana  -= manaCost
    //   tribes.level  = level + 1
    // See supabase/migrations/0022_tribe_level_upgrade.sql
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'tribe_upgrade_level_apply',
      {
        p_player_id:  playerId,
        p_mana_cost:  manaCost,
        p_next_level: nextLevel,
        p_max_level:  maxLevel,
      },
    )

    if (rpcError) {
      console.error('[tribe/upgrade-level] RPC error:', rpcError.code, rpcError.message)
      return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }

    if (!rpcResult?.ok) {
      const code   = rpcResult?.error ?? 'unknown'
      const mapped = RPC_ERROR_MAP[code]
      return NextResponse.json(
        { error: mapped?.message ?? 'Level upgrade failed' },
        { status: mapped?.status ?? 400 },
      )
    }

    return NextResponse.json({
      data: {
        new_level:      rpcResult.new_level      as number,
        new_tribe_mana: rpcResult.new_tribe_mana as number,
        mana_spent:     manaCost,
      },
    })
  } catch (err) {
    console.error('[tribe/upgrade-level] unexpected error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
