// Deprecated: use POST /api/city/promote instead.
// This shim exists only to keep any cached client calls from hard-crashing
// until the DevelopClient is updated to call /api/city/promote directly.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'This route has moved. Use POST /api/city/promote instead.', code: 'ROUTE_MOVED' },
    { status: 410 }
  )
}
