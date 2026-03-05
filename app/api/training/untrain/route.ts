/**
 * POST /api/training/untrain — REMOVED
 *
 * Training is irreversible. All unit conversions (Free Population →
 * Soldier/Spy/Scout/Cavalry/Slave) are one-way. There is no untrain
 * mechanic for any unit type.
 *
 * This route returns 410 Gone to any caller. It is retained as a tombstone
 * so that stale clients receive a clear error rather than a 404.
 */
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Untrain removed: training is irreversible' },
    { status: 410 },
  )
}
