import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import {
  createLemonCheckout,
  getPackDefinitions,
  isPackKey,
  type CheckoutCustomData,
} from '@/lib/payments/lemon'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // ── 1. Authenticate ────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Parse + validate body ───────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('packKey' in body) ||
    typeof (body as Record<string, unknown>).packKey !== 'string'
  ) {
    return NextResponse.json({ error: 'packKey is required' }, { status: 400 })
  }

  const packKey = (body as { packKey: string }).packKey

  if (!isPackKey(packKey)) {
    return NextResponse.json(
      { error: 'Invalid packKey — must be one of: 1900, 4100, 8250, 20000' },
      { status: 400 },
    )
  }

  // ── 3. Resolve pack definition ─────────────────────────────────────────────
  let pack
  try {
    const packs = getPackDefinitions()
    pack = packs[packKey]
  } catch (err) {
    console.error('Lemon checkout: missing env configuration', err)
    return NextResponse.json(
      { error: 'Payment system not configured' },
      { status: 503 },
    )
  }

  // ── 4. Resolve store ID ────────────────────────────────────────────────────
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID
  if (!storeId) {
    console.error('Lemon checkout: LEMON_SQUEEZY_STORE_ID not set')
    return NextResponse.json(
      { error: 'Payment system not configured' },
      { status: 503 },
    )
  }

  // ── 5. Build return URLs ───────────────────────────────────────────────────
  const baseUrl = (
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'https://www.domiron.co.il'
  ).replace(/\/$/, '')
  const successUrl = `${baseUrl}/hero?payment=success`
  const cancelUrl  = `${baseUrl}/hero?payment=cancel`

  // ── 6. Build custom metadata for the webhook ───────────────────────────────
  const customData: CheckoutCustomData = {
    player_id:    session.user.id,
    username:     session.user.name ?? '',
    pack_key:     packKey,
    mana_amount:  String(pack.mana),
    turns_amount: String(pack.turns),
  }

  // ── 7. Create Lemon checkout ───────────────────────────────────────────────
  try {
    const result = await createLemonCheckout({
      variantId:  pack.variantId,
      storeId,
      successUrl,
      cancelUrl,
      customData,
      email: session.user.email ?? undefined,
      name:  session.user.name  ?? undefined,
    })

    return NextResponse.json({ url: result.url })
  } catch (err) {
    console.error('Lemon checkout creation error:', err)
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 502 },
    )
  }
}
