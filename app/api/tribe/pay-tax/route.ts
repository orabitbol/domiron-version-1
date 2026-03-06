/**
 * POST /api/tribe/pay-tax — REMOVED (V1)
 *
 * Manual tax payment is no longer supported.
 * Taxes are collected automatically by the server tick at BALANCE.tribe.taxCollectionHour
 * (Israel time). Gold goes directly to the tribe leader's personal resources.
 */
export async function POST() {
  return Response.json(
    { error: 'Manual tax payment is no longer supported. Taxes are collected automatically by the server.' },
    { status: 410 },
  )
}
