/**
 * GET  /api/tribe/chat  — fetch last 100 messages for the player's tribe
 * POST /api/tribe/chat  — send a message to the player's tribe
 *
 * Access rules:
 *   - Authenticated players only
 *   - Player must be an active tribe member
 *   - Player can only read/write their own tribe
 *   - Messages are attributed to the sender (player_id = session.user.id)
 *   - Max message length: 500 characters
 *   - Season freeze: POST is blocked when no active season
 */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveSeason, seasonFreezeResponse } from '@/lib/game/season'

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase  = createAdminClient()
  const playerId  = session.user.id

  // Resolve membership
  const { data: membership } = await supabase
    .from('tribe_members')
    .select('tribe_id')
    .eq('player_id', playerId)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
  }

  // Fetch last 100 messages ordered oldest → newest
  const { data: rows, error } = await supabase
    .from('tribe_chat')
    .select('id, tribe_id, player_id, message, created_at')
    .eq('tribe_id', membership.tribe_id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error('[tribe/chat GET] error:', error)
    return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  }

  // Resolve usernames — fetch all distinct player_ids in one query
  const seen: Record<string, true> = {}
  const playerIds = (rows ?? []).map((r) => r.player_id).filter((id) => {
    if (seen[id]) return false
    seen[id] = true
    return true
  })
  let usernameMap: Record<string, string> = {}

  if (playerIds.length > 0) {
    const { data: players } = await supabase
      .from('players')
      .select('id, username')
      .in('id', playerIds)

    for (const p of players ?? []) {
      usernameMap[p.id] = p.username
    }
  }

  const messages = (rows ?? []).map((r) => ({
    ...r,
    username: usernameMap[r.player_id] ?? '?',
  }))

  return NextResponse.json({ data: { messages } })
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()

  // Season freeze guard
  const season = await getActiveSeason(supabase)
  if (!season) return seasonFreezeResponse()

  const playerId = session.user.id

  // Validate body
  let body: { message?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const raw = body.message
  if (typeof raw !== 'string') {
    return NextResponse.json({ error: 'message must be a string' }, { status: 400 })
  }

  const trimmed = raw.trim()
  if (trimmed.length < 1 || trimmed.length > 500) {
    return NextResponse.json({ error: 'Message must be 1–500 characters' }, { status: 400 })
  }

  // Verify membership
  const { data: membership } = await supabase
    .from('tribe_members')
    .select('tribe_id')
    .eq('player_id', playerId)
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Not in a tribe' }, { status: 400 })
  }

  // Insert message
  const { data: row, error } = await supabase
    .from('tribe_chat')
    .insert({
      tribe_id:  membership.tribe_id,
      player_id: playerId,
      message:   trimmed,
    })
    .select('id, tribe_id, player_id, message, created_at')
    .single()

  if (error) {
    console.error('[tribe/chat POST] insert error:', error)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }

  // Resolve username for the response
  const { data: playerRow } = await supabase
    .from('players')
    .select('username')
    .eq('id', playerId)
    .single()

  return NextResponse.json({
    data: {
      message: { ...row, username: playerRow?.username ?? '?' },
    },
  })
}
