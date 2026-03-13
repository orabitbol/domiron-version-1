import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getCatchUpMultiplier } from '@/lib/utils'
import { recalculatePower } from '@/lib/game/power'

const schema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9]+$/),
})

export async function POST(request: NextRequest) {
  try {
    // ── 1. Auth check ────────────────────────────────────────────────────────
    const session = await getServerSession(authOptions)

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!session.user.needsSetup) {
      // Already complete — idempotent success (client may have double-submitted)
      return NextResponse.json({ ok: true })
    }

    // ── 2. Validate username ─────────────────────────────────────────────────
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'שם קרב חייב להיות 3–20 תווים אנגליים או מספרים' },
        { status: 400 },
      )
    }

    const { username } = parsed.data
    const email = session.user.email
    const supabase = createAdminClient()

    // ── 3. Idempotency: player already created (duplicate submit) ────────────
    const { data: existing } = await supabase
      .from('players')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ ok: true })
    }

    // ── 4. Username uniqueness (pre-check; DB unique constraint is the guard) ─
    const { data: takenByUsername } = await supabase
      .from('players')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (takenByUsername) {
      return NextResponse.json(
        { error: 'השם כבר תפוס — בחר שם אחר' },
        { status: 409 },
      )
    }

    // ── 5. Active season ─────────────────────────────────────────────────────
    const { data: season } = await supabase
      .from('seasons')
      .select('id, starts_at')
      .eq('status', 'active')
      .single()

    if (!season) {
      return NextResponse.json({ error: 'No active season' }, { status: 500 })
    }

    const catchUpMult = getCatchUpMultiplier(new Date(season.starts_at))
    const startRes    = BALANCE.startingResources

    // ── 6. Create player row ─────────────────────────────────────────────────
    // Google users have no password. password_hash is NULL (nullable after 0031).
    // race defaults to 'human'; army_name mirrors username (can be changed later).
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        username,
        email,
        password_hash: null,
        race:          'human',
        army_name:     username,
        season_id:     season.id,
        turns:         startRes.turns,
      })
      .select('id')
      .single()

    if (playerError || !player) {
      // Unique constraint violation = race condition on username
      if (playerError?.code === '23505') {
        return NextResponse.json(
          { error: 'השם כבר תפוס — בחר שם אחר' },
          { status: 409 },
        )
      }
      console.error('Google profile creation error:', playerError)
      return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
    }

    const playerId = player.id

    // ── 7. Create all related rows (same pattern as /api/auth/register) ──────
    await Promise.all([
      supabase.from('resources').insert({
        player_id: playerId,
        gold:  startRes.gold  * catchUpMult,
        iron:  startRes.iron  * catchUpMult,
        wood:  startRes.wood  * catchUpMult,
        food:  startRes.food  * catchUpMult,
      }),
      supabase.from('army').insert({
        player_id:       playerId,
        free_population: BALANCE.startingResources.startingPopulation,
      }),
      supabase.from('weapons').insert({ player_id: playerId }),
      supabase.from('training').insert({ player_id: playerId }),
      supabase.from('development').insert({ player_id: playerId }),
      supabase.from('hero').insert({ player_id: playerId }),
      supabase.from('bank').insert({ player_id: playerId }),
    ])

    // ── 8. Initial rank assignment ───────────────────────────────────────────
    await recalculatePower(playerId, supabase)

    const { data: np } = await supabase
      .from('players')
      .select('power_total, joined_at, city')
      .eq('id', playerId)
      .single()

    if (np) {
      const [
        { count: gHigher },
        { count: gTieBreak },
        { count: cHigher },
        { count: cTieBreak },
      ] = await Promise.all([
        supabase.from('players').select('id', { count: 'exact', head: true })
          .eq('season_id', season.id).neq('id', playerId).gt('power_total', np.power_total),
        supabase.from('players').select('id', { count: 'exact', head: true })
          .eq('season_id', season.id).neq('id', playerId)
          .eq('power_total', np.power_total).lt('joined_at', np.joined_at),
        supabase.from('players').select('id', { count: 'exact', head: true })
          .eq('season_id', season.id).eq('city', np.city).neq('id', playerId)
          .gt('power_total', np.power_total),
        supabase.from('players').select('id', { count: 'exact', head: true })
          .eq('season_id', season.id).eq('city', np.city).neq('id', playerId)
          .eq('power_total', np.power_total).lt('joined_at', np.joined_at),
      ])

      await supabase
        .from('players')
        .update({
          rank_global: (gHigher  ?? 0) + (gTieBreak ?? 0) + 1,
          rank_city:   (cHigher  ?? 0) + (cTieBreak ?? 0) + 1,
        })
        .eq('id', playerId)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Complete Google profile error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
