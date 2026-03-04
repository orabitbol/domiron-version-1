/**
 * Domiron — API Regression Execution Suite
 *
 * Integration tests that hit every API endpoint against a running local server.
 *
 * Prerequisites:
 *   1. Start the dev server:  npm run dev
 *   2. Set env var:           TEST_BASE_URL=http://localhost:3000  (default)
 *   3. Ensure migration 0005 is applied (slaves_gold/iron/wood/food columns)
 *
 * Run:
 *   npx vitest run scripts/api-regression.test.ts
 *   OR
 *   INTEGRATION_TEST=true npx vitest run scripts/api-regression.test.ts
 *
 * Output example:
 *   ✓ POST /api/auth/register
 *   ✓ POST /api/bank/deposit
 *   ✗ POST /api/mine/allocate — Failed to save allocation: column slaves_gold does not exist
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000'
const RUN      = process.env.INTEGRATION_TEST === 'true'

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Unique suffix so each test run doesn't collide on usernames / emails */
const RUN_ID = Date.now().toString(36)

function testUsername() { return `testuser${RUN_ID}` }
function testEmail()    { return `testuser${RUN_ID}@regression.test` }
const TEST_PASSWORD = 'TestPass123!'

interface ApiResult {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
}

async function api(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  sessionCookie?: string,
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (sessionCookie) headers['Cookie'] = sessionCookie

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let responseBody: unknown
  try {
    responseBody = await response.json()
  } catch {
    responseBody = null
  }

  return { status: response.status, body: responseBody }
}

/** Login and return the session cookie string for subsequent requests. */
async function login(username: string, password: string): Promise<string> {
  // NextAuth credentials login endpoint
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`)
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string }
  const setCookieHeader = csrfRes.headers.get('set-cookie') ?? ''

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: setCookieHeader,
    },
    redirect: 'manual',
    body: new URLSearchParams({
      csrfToken,
      username,
      password,
    }).toString(),
  })

  const cookies = loginRes.headers.getSetCookie?.() ?? []
  return cookies.join('; ')
}

// ─────────────────────────────────────────────────────────────────
// State shared across tests
// ─────────────────────────────────────────────────────────────────

let sessionCookie = ''

// ─────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────

describe.skipIf(!RUN)('API Regression Suite', () => {
  beforeAll(async () => {
    // Verify server is reachable before wasting time on all tests
    try {
      await fetch(`${BASE_URL}/api/auth/csrf`, { signal: AbortSignal.timeout(5000) })
    } catch {
      throw new Error(
        `\nServer not reachable at ${BASE_URL}.\n` +
        'Start it with: npm run dev\n' +
        'Then re-run: INTEGRATION_TEST=true npx vitest run scripts/api-regression.test.ts',
      )
    }
  })

  afterAll(() => {
    // Nothing to tear down — test user left in DB is OK for dev (season reset wipes it)
  })

  // ── 1. Register ───────────────────────────────────────────────

  it('POST /api/auth/register — creates a new player', async () => {
    const { status, body } = await api('POST', '/api/auth/register', {
      username:  testUsername(),
      email:     testEmail(),
      password:  TEST_PASSWORD,
      army_name: `TestArmy${RUN_ID}`,
      race:      'human',
    })
    expect(status, JSON.stringify(body)).toBe(201)
    expect(body.data?.player_id).toBeTruthy()
  })

  it('POST /api/auth/register — rejects duplicate username', async () => {
    const { status } = await api('POST', '/api/auth/register', {
      username:  testUsername(),
      email:     `dup${testEmail()}`,
      password:  TEST_PASSWORD,
      army_name: 'DupArmy',
      race:      'orc',
    })
    expect(status).toBe(409)
  })

  it('POST /api/auth/register — rejects invalid race', async () => {
    const { status } = await api('POST', '/api/auth/register', {
      username:  `inv${testUsername()}`,
      email:     `inv${testEmail()}`,
      password:  TEST_PASSWORD,
      army_name: 'Inv',
      race:      'dragon',
    })
    expect(status).toBe(400)
  })

  // ── 2. Login ──────────────────────────────────────────────────

  it('NextAuth login — obtains session cookie', async () => {
    sessionCookie = await login(testUsername(), TEST_PASSWORD)
    expect(sessionCookie.length).toBeGreaterThan(0)
  })

  // ── 3. Player data ────────────────────────────────────────────

  it('GET /api/player — returns player data', async () => {
    const { status, body } = await api('GET', '/api/player', undefined, sessionCookie)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data?.player?.username).toBe(testUsername())
    expect(body.data?.player?.password_hash).toBeUndefined() // must not be exposed
  })

  // ── 4. Mine (slave allocation) ────────────────────────────────

  it('POST /api/mine/allocate — assigns 0 slaves (no-op)', async () => {
    const { status, body } = await api('POST', '/api/mine/allocate', { gold: 0, iron: 0, wood: 0, food: 0 }, sessionCookie)
    expect(status, JSON.stringify(body)).toBe(200)
    expect(body.data?.army).toBeTruthy()
  })

  it('POST /api/mine/allocate — rejects negative assignment', async () => {
    const { status } = await api('POST', '/api/mine/allocate', { gold: -1, iron: 0, wood: 0, food: 0 }, sessionCookie)
    expect(status).toBe(400)
  })

  it('POST /api/mine/allocate — rejects over-allocation', async () => {
    // New player has 0 slaves — assigning 999 must fail
    const { status } = await api('POST', '/api/mine/allocate', { gold: 999, iron: 0, wood: 0, food: 0 }, sessionCookie)
    expect(status).toBe(400)
  })

  // ── 5. Bank ───────────────────────────────────────────────────

  it('POST /api/bank/deposit — deposits 100 gold', async () => {
    const { status, body } = await api('POST', '/api/bank/deposit', { amount: 100 }, sessionCookie)
    // 200 OR 400 if deposit limit hit or insufficient gold — both are valid business errors, not 500
    expect([200, 400], JSON.stringify(body)).toContain(status)
    if (status === 200) {
      expect(body.bank).toBeTruthy()
      expect(body.resources).toBeTruthy()
    }
  })

  it('POST /api/bank/withdraw — withdraws 50 gold', async () => {
    const { status, body } = await api('POST', '/api/bank/withdraw', { amount: 50 }, sessionCookie)
    expect([200, 400], JSON.stringify(body)).toContain(status)
  })

  it('POST /api/bank/upgrade — upgrades interest level', async () => {
    const { status, body } = await api('POST', '/api/bank/upgrade', undefined, sessionCookie)
    expect([200, 400], JSON.stringify(body)).toContain(status)
  })

  // ── 6. Shop ───────────────────────────────────────────────────

  it('POST /api/shop/buy — buys 1 slingshot', async () => {
    const { status, body } = await api('POST', '/api/shop/buy', { item: 'slingshot', quantity: 1 }, sessionCookie)
    expect([200, 400], JSON.stringify(body)).toContain(status)
  })

  it('POST /api/shop/sell — sells 1 slingshot (may have 0)', async () => {
    const { status, body } = await api('POST', '/api/shop/sell', { item: 'slingshot', quantity: 1 }, sessionCookie)
    expect([200, 400], JSON.stringify(body)).toContain(status)
  })

  // ── 7. Training ───────────────────────────────────────────────

  it('POST /api/training/train — trains 1 soldier', async () => {
    const { status, body } = await api('POST', '/api/training/train', { unit: 'soldier', quantity: 1 }, sessionCookie)
    expect([200, 400], JSON.stringify(body)).toContain(status)
  })

  it('POST /api/training/untrain — untrains 1 soldier', async () => {
    const { status, body } = await api('POST', '/api/training/untrain', { unit: 'soldier', quantity: 1 }, sessionCookie)
    expect([200, 400], JSON.stringify(body)).toContain(status)
  })

  // ── 8. Development ────────────────────────────────────────────

  it('POST /api/develop/upgrade — upgrades gold development', async () => {
    const { status, body } = await api('POST', '/api/develop/upgrade', { resource: 'gold' }, sessionCookie)
    expect([200, 400], JSON.stringify(body)).toContain(status)
  })

  // ── 9. Spy ────────────────────────────────────────────────────

  it('GET /api/spy — returns spy page data', async () => {
    const { status, body } = await api('GET', '/api/spy', undefined, sessionCookie)
    expect(status, JSON.stringify(body)).toBe(200)
  })

  // ── 10. Attack ────────────────────────────────────────────────

  it('POST /api/attack — rejects self-attack', async () => {
    // Fetch own player_id then try to attack self
    const { body: playerBody } = await api('GET', '/api/player', undefined, sessionCookie)
    const selfId = playerBody?.data?.player?.id
    if (!selfId) return // skip if login failed

    const { status } = await api('POST', '/api/attack', { defender_id: selfId, turns: 1 }, sessionCookie)
    expect(status).toBe(400)
  })

  it('POST /api/attack — rejects 0 turns', async () => {
    const { status } = await api('POST', '/api/attack', { defender_id: 'nonexistent-id', turns: 0 }, sessionCookie)
    expect(status).toBe(400)
  })

  // ── 11. Tribe ────────────────────────────────────────────────

  it('POST /api/tribe/create — creates a tribe', async () => {
    const { status, body } = await api('POST', '/api/tribe/create', {
      name: `Tribe${RUN_ID}`,
      tag:  RUN_ID.slice(0, 4).toUpperCase(),
    }, sessionCookie)
    expect([200, 201, 400, 409], JSON.stringify(body)).toContain(status)
  })

  it('POST /api/tribe/pay-tax — pays tribe tax (may fail if not in tribe)', async () => {
    const { status, body } = await api('POST', '/api/tribe/pay-tax', undefined, sessionCookie)
    expect([200, 400], JSON.stringify(body)).toContain(status)
  })

  // ── 12. Security: unauthenticated requests ────────────────────

  it('GET /api/player — returns 401 without session', async () => {
    const { status } = await api('GET', '/api/player')
    expect(status).toBe(401)
  })

  it('POST /api/mine/allocate — returns 401 without session', async () => {
    const { status } = await api('POST', '/api/mine/allocate', { gold: 0, iron: 0, wood: 0, food: 0 })
    expect(status).toBe(401)
  })

  it('POST /api/bank/deposit — returns 401 without session', async () => {
    const { status } = await api('POST', '/api/bank/deposit', { amount: 100 })
    expect(status).toBe(401)
  })

  it('POST /api/attack — returns 401 without session', async () => {
    const { status } = await api('POST', '/api/attack', { defender_id: 'x', turns: 1 })
    expect(status).toBe(401)
  })

  // ── 13. Tick (read-only check) ────────────────────────────────

  it('GET /api/tick — returns 401 without CRON_SECRET', async () => {
    const { status } = await api('GET', '/api/tick')
    expect(status).toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────
// Dry-run message when INTEGRATION_TEST is not set
// ─────────────────────────────────────────────────────────────────

describe.skipIf(RUN)('API Regression Suite (skipped — dry run)', () => {
  it('skips all integration tests unless INTEGRATION_TEST=true', () => {
    console.info(
      '\n  ℹ  API Regression tests are skipped in unit-test mode.\n' +
      '     To run them:\n' +
      '       1. Start the dev server:  npm run dev\n' +
      `       2. Run:  INTEGRATION_TEST=true npx vitest run scripts/api-regression.test.ts\n`,
    )
    expect(true).toBe(true)
  })
})
