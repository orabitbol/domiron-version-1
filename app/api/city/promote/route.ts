import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

// POST /api/city/promote
//
// Promotes the player's city from N → N+1 atomically via Postgres RPC.
//
// Gate order (route-level, for fast UX rejection):
//   auth → season freeze → maxCity → tribe → soldiers → resources
//
// All gates are re-validated server-side inside the RPC transaction
// after acquiring row-level locks on players + resources + army.
// This prevents any TOCTTOU race between the route's reads and the commit.
//
// Mutation: city_promote_apply() RPC (migration 0012)
//   Locks: players + resources + army FOR UPDATE
//   Writes: resources (deduct cost) + players.city = nextCity
//   Rollback: automatic if any re-validation fails inside the RPC
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const playerId = session.user.id

  try {
    const supabase = createAdminClient()
    const activeSeason = await getActiveSeason(supabase)
    if (!activeSeason) return seasonFreezeResponse()

    // ── Fast pre-validation (route-level, outside the transaction) ─────────
    // Fetch everything needed in parallel for good UX error messages.
    const [
      { data: player },
      { data: resources },
      { data: army },
      { data: tribeMember },
    ] = await Promise.all([
      supabase.from('players').select('id, city').eq('id', playerId).single(),
      supabase.from('resources').select('gold, wood, iron, food').eq('player_id', playerId).single(),
      supabase.from('army').select('soldiers').eq('player_id', playerId).single(),
      supabase.from('tribe_members').select('tribe_id').eq('player_id', playerId).maybeSingle(),
    ])

    if (!player || !resources || !army) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    if (player.city >= BALANCE.cities.maxCity) {
      return NextResponse.json({ error: 'Already at maximum city', code: 'ALREADY_MAX_CITY' }, { status: 400 })
    }

    if (tribeMember) {
      return NextResponse.json({
        error: 'You cannot promote your city while you are in a clan/tribe. Leave your clan/tribe first.',
        code: 'IN_TRIBE',
      }, { status: 400 })
    }

    const nextCity    = player.city + 1
    const minSoldiers = BALANCE.cities.promotion.soldiersRequiredByCity[nextCity]
    const cost        = BALANCE.cities.promotion.resourceCostByCity[nextCity]

    if (army.soldiers < minSoldiers) {
      return NextResponse.json({
        error: `Not enough soldiers (need ${minSoldiers}, have ${army.soldiers})`,
        code: 'NOT_ENOUGH_SOLDIERS',
        required: minSoldiers,
        current: army.soldiers,
      }, { status: 400 })
    }

    const lacking: string[] = []
    if (resources.gold < cost.gold) lacking.push(`gold (need ${cost.gold}, have ${resources.gold})`)
    if (resources.wood < cost.wood) lacking.push(`wood (need ${cost.wood}, have ${resources.wood})`)
    if (resources.iron < cost.iron) lacking.push(`iron (need ${cost.iron}, have ${resources.iron})`)
    if (resources.food < cost.food) lacking.push(`food (need ${cost.food}, have ${resources.food})`)
    if (lacking.length > 0) {
      return NextResponse.json({
        error: `Not enough resources: ${lacking.join('; ')}`,
        code: 'NOT_ENOUGH_RESOURCES',
        required: cost,
        current: { gold: resources.gold, wood: resources.wood, iron: resources.iron, food: resources.food },
      }, { status: 400 })
    }

    // ── Atomic mutation via RPC ────────────────────────────────────────────
    // city_promote_apply() acquires FOR UPDATE locks on players + resources + army,
    // re-validates all conditions, then applies both writes in one transaction.
    const { data: rpcResult, error: rpcError } = await supabase.rpc('city_promote_apply', {
      p_player_id:    playerId,
      p_next_city:    nextCity,
      p_min_soldiers: minSoldiers,
      p_cost_gold:    cost.gold,
      p_cost_wood:    cost.wood,
      p_cost_iron:    cost.iron,
      p_cost_food:    cost.food,
    })

    if (rpcError) {
      console.error('city_promote_apply RPC error:', rpcError)
      return NextResponse.json({ error: 'Server error during promotion' }, { status: 500 })
    }

    // RPC-level re-validation failures (race condition caught inside transaction)
    if (!rpcResult.ok) {
      const code: string = rpcResult.error ?? 'unknown'
      if (code === 'in_tribe') {
        return NextResponse.json({
          error: 'You cannot promote your city while you are in a clan/tribe. Leave your clan/tribe first.',
          code: 'IN_TRIBE',
        }, { status: 400 })
      }
      if (code === 'not_enough_soldiers') {
        return NextResponse.json({
          error: `Not enough soldiers (need ${rpcResult.required}, have ${rpcResult.have})`,
          code: 'NOT_ENOUGH_SOLDIERS',
          required: rpcResult.required,
          current:  rpcResult.have,
        }, { status: 400 })
      }
      if (code === 'not_enough_resources') {
        return NextResponse.json({
          error: 'Not enough resources',
          code: 'NOT_ENOUGH_RESOURCES',
          required: rpcResult.required,
          current:  rpcResult.have,
        }, { status: 400 })
      }
      // already_max_city or any other re-validation failure
      return NextResponse.json({ error: 'Promotion failed', code: 'ALREADY_MAX_CITY' }, { status: 400 })
    }

    return NextResponse.json({
      data: {
        city:      rpcResult.city,
        city_name: BALANCE.cities.names[rpcResult.city as number],
        slave_production_mult: BALANCE.cities.slaveProductionMultByCity[rpcResult.city as number],
        resources: {
          gold: rpcResult.gold,
          wood: rpcResult.wood,
          iron: rpcResult.iron,
          food: rpcResult.food,
        },
      },
    })
  } catch (err) {
    console.error('City/promote error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
