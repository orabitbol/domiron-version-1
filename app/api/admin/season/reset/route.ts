/**
 * POST /api/admin/season/reset
 *
 * ⚠ HARD RESET MODE (DEV ONLY)
 * Deletes ALL players and ALL game data.
 * DO NOT enable in production.
 *
 * Sequence:
 *   1. Verify admin session.
 *   2. Delete all game-progress tables in FK-safe order.
 *   3. Break players ↔ seasons circular FK (set players.season_id = null).
 *   4. Delete seasons.
 *   5. Delete players.
 *   6. Create a fresh Season 1.
 *
 * Tables wiped (in FK-safe order):
 *   tribe_spells → tribe_members → hero_spells → player_hero_effects →
 *   spy_history → attacks → hero → bank → development → training →
 *   weapons → army → resources → hall_of_fame → tribes →
 *   admin_logs → balance_overrides →
 *   [seasons.created_by nulled] → players → seasons
 *
 * After reset:
 *   - No players exist. Admin must re-register via /api/auth/register.
 *   - Season 1 is created fresh (starts_at = now, ends_at = now + 90d).
 */

import { NextResponse }       from 'next/server'
import { getServerSession }   from 'next-auth'
import { authOptions }        from '@/lib/auth/options'
import { createAdminClient }  from '@/lib/supabase/server'
import { BALANCE }            from '@/lib/game/balance'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const now      = new Date()
  const nowIso   = now.toISOString()

  try {
    // ── Step 1: Delete game-progress tables (FK-safe order) ──────────────────
    const GAME_TABLES = [
      'tribe_spells',
      'tribe_members',
      'hero_spells',
      'player_hero_effects',
      'spy_history',
      'attacks',
      'hero',
      'bank',
      'development',
      'training',
      'weapons',
      'army',
      'resources',
      'hall_of_fame',
      'tribes',
    ] as const

    const sequentialDeletes: Array<{ table: string; query: PromiseLike<{ error: { message: string } | null }> }> = [
      { table: 'tribe_spells',        query: supabase.from('tribe_spells').delete().not('id', 'is', null) },
      { table: 'tribe_members',       query: supabase.from('tribe_members').delete().not('id', 'is', null) },
      { table: 'hero_spells',         query: supabase.from('hero_spells').delete().not('id', 'is', null) },
      { table: 'player_hero_effects', query: supabase.from('player_hero_effects').delete().not('id', 'is', null) },
      { table: 'spy_history',         query: supabase.from('spy_history').delete().not('id', 'is', null) },
      { table: 'attacks',             query: supabase.from('attacks').delete().not('id', 'is', null) },
      { table: 'hero',                query: supabase.from('hero').delete().not('player_id', 'is', null) },
      { table: 'bank',                query: supabase.from('bank').delete().not('player_id', 'is', null) },
      { table: 'development',         query: supabase.from('development').delete().not('player_id', 'is', null) },
      { table: 'training',            query: supabase.from('training').delete().not('player_id', 'is', null) },
      { table: 'weapons',             query: supabase.from('weapons').delete().not('player_id', 'is', null) },
      { table: 'army',                query: supabase.from('army').delete().not('player_id', 'is', null) },
      { table: 'resources',           query: supabase.from('resources').delete().not('player_id', 'is', null) },
      { table: 'hall_of_fame',        query: supabase.from('hall_of_fame').delete().not('id', 'is', null) },
      { table: 'tribes',              query: supabase.from('tribes').delete().not('id', 'is', null) },
      // Must be deleted before players — both have FK references to players.id
      { table: 'admin_logs',          query: supabase.from('admin_logs').delete().not('id', 'is', null) },
      { table: 'balance_overrides',   query: supabase.from('balance_overrides').delete().not('id', 'is', null) },
    ]

    for (const { table, query } of sequentialDeletes) {
      const { error } = await query
      if (error) throw new Error(`Delete ${table} failed: ${error.message}`)
    }

    // ── Step 2: Break circular FK — seasons.created_by → players ────────────
    // players.season_id → seasons is NOT NULL, so we can't null it.
    // Instead, null out seasons.created_by (which IS nullable) so we can
    // safely delete players before seasons.
    const { error: nullifyCreatedByErr } = await supabase
      .from('seasons')
      .update({ created_by: null })
      .not('id', 'is', null)

    if (nullifyCreatedByErr) throw new Error(`Nullify seasons.created_by failed: ${nullifyCreatedByErr.message}`)

    // ── Step 3: Delete players ────────────────────────────────────────────────
    // Must come before seasons because players.season_id is NOT NULL → FK to seasons.
    const { error: delPlayersErr } = await supabase
      .from('players')
      .delete()
      .not('id', 'is', null)

    if (delPlayersErr) throw new Error(`Delete players failed: ${delPlayersErr.message}`)

    // ── Step 4: Delete seasons ────────────────────────────────────────────────
    const { error: delSeasonsErr } = await supabase
      .from('seasons')
      .delete()
      .not('id', 'is', null)

    if (delSeasonsErr) throw new Error(`Delete seasons failed: ${delSeasonsErr.message}`)

    // ── Step 5: Create fresh Season 1 ────────────────────────────────────────
    const endsAt = new Date(now.getTime() + BALANCE.season.durationDays * 24 * 60 * 60 * 1000)

    const { data: newSeason, error: newSeasonErr } = await supabase
      .from('seasons')
      .insert({
        number:     1,
        starts_at:  nowIso,
        ends_at:    endsAt.toISOString(),
        status:     'active',
        created_by: null,   // no players exist yet; admin re-registers after this
      })
      .select('id, number, starts_at, ends_at')
      .single()

    if (!newSeason || newSeasonErr) {
      throw new Error(`Failed to create Season 1: ${newSeasonErr?.message}`)
    }

    const deletedTables = [...GAME_TABLES, 'admin_logs', 'balance_overrides', 'seasons', 'players']

    // NOTE: We intentionally do NOT write to admin_logs here.
    // After the reset, ALL players (including the admin) are deleted,
    // so there is no valid admin_id to reference in admin_logs.
    // The action is instead captured here in the server log for auditability.
    console.log(`[SEASON RESET] Hard reset executed by admin session ${session.user.id}. New season: ${newSeason.number} (id=${newSeason.id})`)

    return NextResponse.json({
      ok:            true,
      mode:          'hard_reset',
      deletedTables,
      newSeason: {
        id:        newSeason.id,
        number:    newSeason.number,
        starts_at: newSeason.starts_at,
        ends_at:   newSeason.ends_at,
      },
    })

  } catch (err) {
    console.error('Hard reset error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Hard reset failed' },
      { status: 500 },
    )
  }
}
