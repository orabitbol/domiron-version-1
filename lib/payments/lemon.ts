/**
 * Lemon Squeezy utilities — server-side only.
 *
 * Never import this file from client components or client-side code.
 * All secrets stay on the server.
 */

import crypto from 'node:crypto'

// ── Pack keys ─────────────────────────────────────────────────────────────────

export type PackKey = '1900' | '4100' | '8250' | '20000'

export const VALID_PACK_KEYS: readonly PackKey[] = ['1900', '4100', '8250', '20000'] as const

export function isPackKey(key: unknown): key is PackKey {
  return typeof key === 'string' && (VALID_PACK_KEYS as readonly string[]).includes(key)
}

// ── Pack definitions (resolved from env at call time) ─────────────────────────

export interface PackDefinition {
  mana: number
  turns: number
  variantId: string
}

function requireEnv(name: string): string {
  const val = process.env[name]
  if (!val) throw new Error(`Missing required environment variable: ${name}`)
  return val
}

export function getPackDefinitions(): Record<PackKey, PackDefinition> {
  return {
    '1900':  { mana: 1900,  turns: 190,  variantId: requireEnv('LEMON_VARIANT_1900')  },
    '4100':  { mana: 4100,  turns: 410,  variantId: requireEnv('LEMON_VARIANT_4100')  },
    '8250':  { mana: 8250,  turns: 825,  variantId: requireEnv('LEMON_VARIANT_8250')  },
    '20000': { mana: 20000, turns: 2000, variantId: requireEnv('LEMON_VARIANT_20000') },
  }
}

// ── Checkout creation ─────────────────────────────────────────────────────────

/** Custom metadata embedded in every checkout, echoed back in the webhook. */
export interface CheckoutCustomData {
  player_id: string
  username: string
  pack_key: PackKey
  /** Stored as string because Lemon Squeezy custom_data values must be strings. */
  mana_amount: string
  /** Stored as string for the same reason. */
  turns_amount: string
}

export interface CreateCheckoutParams {
  variantId: string
  storeId: string
  successUrl: string
  cancelUrl: string
  customData: CheckoutCustomData
  email?: string
  name?: string
}

export interface CreateCheckoutResult {
  url: string
}

const LEMON_API_BASE = 'https://api.lemonsqueezy.com/v1'

export async function createLemonCheckout(
  params: CreateCheckoutParams,
): Promise<CreateCheckoutResult> {
  const apiKey = requireEnv('LEMON_SQUEEZY_API_KEY')

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_options: {
          embed: false,
          media: true,
          logo: true,
          desc: true,
          discount: false,
          button_color: '#f0c030',
        },
        checkout_data: {
          email: params.email,
          name: params.name,
          custom: params.customData,
        },
        product_options: {
          redirect_url: params.successUrl,
        },
        expires_at: null,
      },
      relationships: {
        store: {
          data: { type: 'stores', id: String(params.storeId) },
        },
        variant: {
          data: { type: 'variants', id: String(params.variantId) },
        },
      },
    },
  }

  const response = await fetch(`${LEMON_API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Lemon Squeezy checkout creation failed: HTTP ${response.status} — ${text}`,
    )
  }

  const data = (await response.json()) as {
    data: { attributes: { url: string } }
  }

  const url = data?.data?.attributes?.url
  if (!url) {
    throw new Error('Lemon Squeezy response missing checkout URL')
  }

  return { url }
}

// ── Webhook signature verification ───────────────────────────────────────────

/**
 * Verify the X-Signature header from a Lemon Squeezy webhook.
 *
 * Lemon signs the raw request body with HMAC-SHA256 using the webhook secret.
 * The signature is hex-encoded and placed in the X-Signature header.
 * We use a constant-time comparison to prevent timing attacks.
 */
export function verifyLemonSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('Missing LEMON_SQUEEZY_WEBHOOK_SECRET')
  }

  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')

  // Lengths must match before timingSafeEqual
  if (computed.length !== signature.length) return false

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(signature, 'hex'),
    )
  } catch {
    return false
  }
}

// ── Webhook payload types ─────────────────────────────────────────────────────

export interface LemonOrderCustomData {
  player_id?: string
  username?: string
  pack_key?: string
  mana_amount?: string
  turns_amount?: string
}

export interface LemonOrderItem {
  id: number
  order_id: number
  product_id: number
  variant_id: number
  product_name: string
  variant_name: string
  price: number
  quantity: number
}

export interface LemonOrderAttributes {
  identifier: string
  order_number: number
  user_name: string
  user_email: string
  currency: string
  /** Payment status: 'paid' | 'pending' | 'failed' | 'refunded' */
  status: string
  /** Total in the smallest currency unit (e.g. cents for USD). */
  total: number
  first_order_item: LemonOrderItem
  custom_data: LemonOrderCustomData | null
}

export interface LemonWebhookPayload {
  meta: {
    event_name: string
    webhook_id: string
    /** Custom checkout data is echoed here (newer API versions). */
    custom_data?: LemonOrderCustomData
  }
  data: {
    type: string
    /** Lemon order ID (string). Used as provider_ref for idempotency. */
    id: string
    attributes: LemonOrderAttributes
  }
}
