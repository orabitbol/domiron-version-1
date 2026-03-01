import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { BALANCE } from '@/lib/game/balance'
import { getCatchUpMultiplier } from '@/lib/utils'

const registerSchema = z.object({
  username:   z.string().min(3).max(20).regex(/^[a-zA-Z0-9]+$/),
  email:      z.string().email(),
  password:   z.string().min(8),
  army_name:  z.string().min(3).max(20),
  race:       z.enum(['orc', 'human', 'elf', 'dwarf']),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = registerSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { username, email, password, army_name, race } = parsed.data
    const supabase = createAdminClient()

    // Check uniqueness
    const { data: existingByEmail } = await supabase
      .from('players')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingByEmail) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const { data: existingByUsername } = await supabase
      .from('players')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (existingByUsername) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }

    // Get active season — required; missing active season is a server bug
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id, starts_at')
      .eq('status', 'active')
      .single()

    if (!season || seasonError) {
      console.error('No active season found during registration:', seasonError)
      return NextResponse.json({ error: 'No active season — contact admin' }, { status: 500 })
    }

    const seasonId    = season.id
    const catchUpMult = getCatchUpMultiplier(new Date(season.starts_at))

    // Hash password
    const password_hash = await bcrypt.hash(password, 12)

    // Create player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        username,
        email,
        password_hash,
        race,
        army_name,
        season_id: seasonId,
        turns: BALANCE.startingResources.turns,
      })
      .select('id')
      .single()

    if (playerError || !player) {
      console.error('Player creation error:', playerError)
      return NextResponse.json({ error: 'Failed to create player' }, { status: 500 })
    }

    const playerId = player.id
    const startRes = BALANCE.startingResources

    // Create all related rows in parallel
    await Promise.all([
      supabase.from('resources').insert({
        player_id: playerId,
        gold:  startRes.gold  * catchUpMult,
        iron:  startRes.iron  * catchUpMult,
        wood:  startRes.wood  * catchUpMult,
        food:  startRes.food  * catchUpMult,
      }),
      supabase.from('army').insert({
        player_id:        playerId,
        free_population:  BALANCE.startingResources.startingPopulation,
      }),
      supabase.from('weapons').insert({ player_id: playerId }),
      supabase.from('training').insert({ player_id: playerId }),
      supabase.from('development').insert({ player_id: playerId }),
      supabase.from('hero').insert({ player_id: playerId }),
      supabase.from('bank').insert({ player_id: playerId }),
    ])

    return NextResponse.json({
      data: { player_id: playerId },
    }, { status: 201 })

  } catch (err) {
    console.error('Register error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
