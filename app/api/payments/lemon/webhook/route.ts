import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  verifyLemonSignature,
  isPackKey,
  type LemonWebhookPayload,
} from '@/lib/payments/lemon'

// Never cache webhook routes
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // ── 1. Read raw body for signature verification ────────────────────────────
  const rawBody = await request.text()

  const signature = request.headers.get('x-signature') ?? ''
  if (!signature) {
    console.warn('Lemon webhook: missing X-Signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
  }

  // ── 2. Verify HMAC-SHA256 signature ───────────────────────────────────────
  let signatureValid: boolean
  try {
    signatureValid = verifyLemonSignature(rawBody, signature)
  } catch (err) {
    console.error('Lemon webhook: signature check threw', err)
    return NextResponse.json(
      { error: 'Signature verification error' },
      { status: 500 },
    )
  }

  if (!signatureValid) {
    console.warn('Lemon webhook: invalid signature — possible spoofing attempt')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // ── 3. Parse payload ───────────────────────────────────────────────────────
  let payload: LemonWebhookPayload
  try {
    payload = JSON.parse(rawBody) as LemonWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const eventName = payload.meta?.event_name
  console.log(`Lemon webhook received: ${eventName}`)

  // ── 4. Only fulfil paid order_created events ───────────────────────────────
  // All other events (order_refunded, subscription_*, etc.) are acknowledged
  // but not acted upon — add handlers as needed.
  if (eventName !== 'order_created') {
    return NextResponse.json({ received: true })
  }

  const order  = payload.data
  const attrs  = order.attributes
  const orderId = order.id

  if (attrs.status !== 'paid') {
    // order_created fires for 'pending' too; only fulfil confirmed payments
    console.log(`Lemon webhook: order ${orderId} status=${attrs.status}, skipping`)
    return NextResponse.json({ received: true })
  }

  // ── 5. Extract + validate custom metadata ─────────────────────────────────
  // Lemon echoes custom_data in both meta.custom_data and data.attributes.custom_data
  const customData = payload.meta.custom_data ?? attrs.custom_data

  if (!customData) {
    console.error(`Lemon webhook: order ${orderId} has no custom_data`)
    return NextResponse.json(
      { error: 'Missing custom_data in payload' },
      { status: 422 },
    )
  }

  const { player_id, pack_key, mana_amount: manaStr, turns_amount: turnsStr } =
    customData

  if (!player_id || typeof player_id !== 'string') {
    console.error(`Lemon webhook: order ${orderId} missing player_id`)
    return NextResponse.json({ error: 'Missing player_id' }, { status: 422 })
  }

  if (!isPackKey(pack_key)) {
    console.error(`Lemon webhook: order ${orderId} invalid pack_key: ${String(pack_key)}`)
    return NextResponse.json({ error: 'Invalid pack_key' }, { status: 422 })
  }

  const manaAmount  = parseInt(manaStr  ?? '', 10)
  const turnsAmount = parseInt(turnsStr ?? '', 10)

  if (!Number.isFinite(manaAmount) || manaAmount <= 0) {
    console.error(`Lemon webhook: order ${orderId} invalid mana_amount: ${manaStr}`)
    return NextResponse.json({ error: 'Invalid mana_amount' }, { status: 422 })
  }

  if (!Number.isFinite(turnsAmount) || turnsAmount <= 0) {
    console.error(`Lemon webhook: order ${orderId} invalid turns_amount: ${turnsStr}`)
    return NextResponse.json({ error: 'Invalid turns_amount' }, { status: 422 })
  }

  // ── 6. Fulfil atomically via RPC ───────────────────────────────────────────
  // The RPC handles idempotency: if this order_id was already processed it
  // returns { ok: false, error: 'already_processed' } without double-granting.
  const supabase = createAdminClient()

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'fulfill_lemon_purchase',
    {
      p_player_id:    player_id,
      p_order_id:     orderId,
      p_pack_key:     pack_key,
      p_mana_amount:  manaAmount,
      p_turns_amount: turnsAmount,
      p_amount_cents: attrs.total ?? 0,
      p_currency:     attrs.currency ?? 'USD',
      p_payload:      payload as unknown as Record<string, unknown>,
    },
  )

  if (rpcError) {
    console.error(
      `Lemon webhook: RPC error for order ${orderId}:`,
      rpcError.message,
    )
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const result = rpcResult as { ok: boolean; error?: string }

  if (!result.ok) {
    if (result.error === 'already_processed') {
      // Idempotent — Lemon retried but we already granted rewards
      console.log(`Lemon webhook: order ${orderId} already processed, skipping`)
      return NextResponse.json({ received: true })
    }
    console.error(
      `Lemon webhook: fulfill failed for order ${orderId}: ${result.error}`,
    )
    return NextResponse.json(
      { error: result.error ?? 'Fulfillment failed' },
      { status: 422 },
    )
  }

  console.log(
    `Lemon webhook: fulfilled order ${orderId} for player ${player_id}` +
      ` (+${manaAmount} mana, +${turnsAmount} turns)`,
  )
  return NextResponse.json({ received: true })
}
