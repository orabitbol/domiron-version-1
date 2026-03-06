/**
 * POST /api/tribe/kick-member — REMOVED (V1)
 *
 * This legacy route is superseded by /api/tribe/kick which enforces
 * role guards (deputies cannot kick other deputies, leader cannot be kicked).
 */
export async function POST() {
  return Response.json(
    { error: 'This route is deprecated. Use /api/tribe/kick instead.' },
    { status: 410 },
  )
}
