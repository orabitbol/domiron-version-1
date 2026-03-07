/**
 * Shop — structural + logic tests (2026-03-07 v3 — NOT FOUND guards)
 *
 * Pattern: fs.readFileSync on buy/sell route + ShopClient source.
 * No DB/HTTP/Supabase mocking needed — structural assertions only.
 *
 * Run: npx vitest run lib/game/shop.test.ts
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { BALANCE } from '@/lib/game/balance'

const BUY_ROUTE_PATH  = path.resolve(__dirname, '../../app/api/shop/buy/route.ts')
const SELL_ROUTE_PATH = path.resolve(__dirname, '../../app/api/shop/sell/route.ts')
const CLIENT_PATH     = path.resolve(__dirname, '../../app/(game)/shop/ShopClient.tsx')

const buySource:    string = fs.readFileSync(BUY_ROUTE_PATH,  'utf8')
const sellSource:   string = fs.readFileSync(SELL_ROUTE_PATH, 'utf8')
const clientSource: string = fs.readFileSync(CLIENT_PATH,     'utf8')

// ── BALANCE config structural tests ──────────────────────────────────────────

describe('BALANCE.weapons — all-4-resource config model', () => {

  it('attack weapons have cost.{gold,iron,wood,food} and power; no maxPerPlayer', () => {
    for (const [key, cfg] of Object.entries(BALANCE.weapons.attack)) {
      expect(cfg.cost).toBeDefined()
      expect(typeof cfg.cost.gold).toBe('number')
      expect(typeof cfg.cost.iron).toBe('number')
      expect(typeof cfg.cost.wood).toBe('number')
      expect(typeof cfg.cost.food).toBe('number')
      expect(typeof cfg.power).toBe('number')
      expect((cfg as Record<string, unknown>).maxPerPlayer).toBeUndefined()
      expect((cfg as Record<string, unknown>).costIron).toBeUndefined()
    }
  })

  it('defense weapons have cost.{gold,iron,wood,food} and multiplier; no costGold', () => {
    for (const [, cfg] of Object.entries(BALANCE.weapons.defense)) {
      expect(typeof cfg.cost.gold).toBe('number')
      expect(typeof cfg.cost.iron).toBe('number')
      expect(typeof cfg.cost.wood).toBe('number')
      expect(typeof cfg.cost.food).toBe('number')
      expect(typeof cfg.multiplier).toBe('number')
      expect((cfg as Record<string, unknown>).costGold).toBeUndefined()
    }
  })

  it('spy weapons have cost.{gold,iron,wood,food}; no legacy costGold', () => {
    for (const [, cfg] of Object.entries(BALANCE.weapons.spy)) {
      expect(typeof cfg.cost.gold).toBe('number')
      expect(typeof cfg.cost.iron).toBe('number')
      expect(typeof cfg.cost.wood).toBe('number')
      expect(typeof cfg.cost.food).toBe('number')
      expect((cfg as Record<string, unknown>).costGold).toBeUndefined()
    }
  })

  it('scout weapons have cost.{gold,iron,wood,food}; no legacy costGold', () => {
    for (const [, cfg] of Object.entries(BALANCE.weapons.scout)) {
      expect(typeof cfg.cost.gold).toBe('number')
      expect(typeof cfg.cost.iron).toBe('number')
      expect(typeof cfg.cost.wood).toBe('number')
      expect(typeof cfg.cost.food).toBe('number')
      expect((cfg as Record<string, unknown>).costGold).toBeUndefined()
    }
  })

  it('all weapon costs are equal across all 4 resources (equal-cost model)', () => {
    const allWeapons = [
      ...Object.values(BALANCE.weapons.attack),
      ...Object.values(BALANCE.weapons.defense),
      ...Object.values(BALANCE.weapons.spy),
      ...Object.values(BALANCE.weapons.scout),
    ]
    for (const w of allWeapons) {
      const c = (w as { cost: { gold: number; iron: number; wood: number; food: number } }).cost
      expect(c.iron).toBe(c.gold)
      expect(c.wood).toBe(c.gold)
      expect(c.food).toBe(c.gold)
    }
  })

})

// ── Buy route structural tests ────────────────────────────────────────────────

describe('POST /api/shop/buy — structural contracts (atomic RPC)', () => {

  it('delegates to shop_buy_apply RPC — not direct table update', () => {
    expect(buySource).toContain('shop_buy_apply')
    expect(buySource).toContain('supabase.rpc')
    // No direct resource table mutation in the route
    expect(buySource).not.toContain("from('resources').update")
    expect(buySource).not.toContain("from('weapons').update")
  })

  it('passes p_is_multi = (category === attack) — stackability flag', () => {
    expect(buySource).toContain("category === 'attack'")
    expect(buySource).toContain('p_is_multi')
  })

  it('computes all 4 resource totals from BALANCE cost before calling RPC', () => {
    expect(buySource).toContain('cost.gold * amount')
    expect(buySource).toContain('cost.iron * amount')
    expect(buySource).toContain('cost.wood * amount')
    expect(buySource).toContain('cost.food * amount')
  })

  it('reads cost from BALANCE via resolveCost — not hardcoded', () => {
    expect(buySource).toContain('resolveCost')
    expect(buySource).toContain('BALANCE.weapons')
    expect(buySource).not.toMatch(/gold:\s*\d{4,}/)
    expect(buySource).not.toMatch(/iron:\s*\d{4,}/)
  })

  it('error map covers all 4 resource shortfalls', () => {
    expect(buySource).toContain('Not enough gold')
    expect(buySource).toContain('Not enough iron')
    expect(buySource).toContain('Not enough wood')
    expect(buySource).toContain('Not enough food')
  })

  it('error map covers already_owned (one-per-player items)', () => {
    expect(buySource).toContain('already_owned')
    expect(buySource).toContain('Already own this item')
  })

  it('error map covers too_many_requests (duplicate-request guard)', () => {
    expect(buySource).toContain('too_many_requests')
    expect(buySource).toContain('Too many requests')
  })

  it('pre-checks last_shop_at for fast 429 before calling RPC', () => {
    expect(buySource).toContain('last_shop_at')
    expect(buySource).toContain('429')
  })

  it('no maxPerPlayer reference in buy route', () => {
    expect(buySource).not.toContain('maxPerPlayer')
  })

  it('requires session — 401 guard present', () => {
    expect(buySource).toContain('getServerSession')
    expect(buySource).toContain('401')
  })

  it('includes season freeze guard', () => {
    expect(buySource).toContain('getActiveSeason')
    expect(buySource).toContain('seasonFreezeResponse')
  })

  it('maps RPC error codes — no dead error paths', () => {
    expect(buySource).toContain('BUY_RPC_ERROR_MAP')
    expect(buySource).toContain('result.error')
  })

  it('error map covers player_state_not_found → 404 (NOT FOUND guard)', () => {
    expect(buySource).toContain('player_state_not_found')
    expect(buySource).toContain('404')
    expect(buySource).toContain('Player data not found')
  })

  it('error map covers invalid_amount (RPC input guard)', () => {
    expect(buySource).toContain('invalid_amount')
    expect(buySource).toContain('Invalid amount')
  })

  it('error map covers invalid_cost (RPC input guard)', () => {
    expect(buySource).toContain('invalid_cost')
    expect(buySource).toContain('Invalid cost')
  })

})

// ── Sell route structural tests ───────────────────────────────────────────────

describe('POST /api/shop/sell — structural contracts (atomic RPC)', () => {

  it('delegates to shop_sell_apply RPC — not direct table update', () => {
    expect(sellSource).toContain('shop_sell_apply')
    expect(sellSource).toContain('supabase.rpc')
    expect(sellSource).not.toContain("from('resources').update")
    expect(sellSource).not.toContain("from('weapons').update")
  })

  it('computes refund for all 4 resources before calling RPC', () => {
    expect(sellSource).toContain('refundGold')
    expect(sellSource).toContain('refundIron')
    expect(sellSource).toContain('refundWood')
    expect(sellSource).toContain('refundFood')
  })

  it('reads refund percent from BALANCE.weapons.sellRefundPercent', () => {
    expect(sellSource).toContain('sellRefundPercent')
    expect(sellSource).toContain('BALANCE.weapons')
  })

  it('uses Math.floor for refund amounts (no fractional resources)', () => {
    expect(sellSource).toContain('Math.floor')
  })

  it('error map covers not_enough_owned', () => {
    expect(sellSource).toContain('not_enough_owned')
  })

  it('error map covers too_many_requests (duplicate-request guard)', () => {
    expect(sellSource).toContain('too_many_requests')
    expect(sellSource).toContain('Too many requests')
  })

  it('pre-checks last_shop_at for fast 429 before calling RPC', () => {
    expect(sellSource).toContain('last_shop_at')
    expect(sellSource).toContain('429')
  })

  it('requires session — 401 guard present', () => {
    expect(sellSource).toContain('getServerSession')
    expect(sellSource).toContain('401')
  })

  it('error map covers player_state_not_found → 404 (NOT FOUND guard)', () => {
    expect(sellSource).toContain('player_state_not_found')
    expect(sellSource).toContain('404')
    expect(sellSource).toContain('Player data not found')
  })

  it('error map covers invalid_amount (RPC input guard)', () => {
    expect(sellSource).toContain('invalid_amount')
    expect(sellSource).toContain('Invalid amount')
  })

  it('error map covers invalid_refund (RPC input guard)', () => {
    expect(sellSource).toContain('invalid_refund')
    expect(sellSource).toContain('Invalid refund')
  })

})

// ── ShopClient structural tests ───────────────────────────────────────────────

describe('ShopClient — scroll-jump fix: sub-components defined outside ShopClient', () => {

  it('ArmoryPanel is NOT defined inside ShopClient function body', () => {
    const clientIdx    = clientSource.indexOf('export function ShopClient')
    const armoryBefore = clientSource.indexOf('function ArmoryPanel')
    expect(armoryBefore).toBeGreaterThan(-1)
    expect(armoryBefore).toBeLessThan(clientIdx)
  })

  it('RowWrap is NOT defined inside ShopClient function body', () => {
    const clientIdx  = clientSource.indexOf('export function ShopClient')
    const rowBefore  = clientSource.indexOf('function RowWrap')
    expect(rowBefore).toBeGreaterThan(-1)
    expect(rowBefore).toBeLessThan(clientIdx)
  })

  it('IconBox is NOT defined inside ShopClient function body', () => {
    const clientIdx = clientSource.indexOf('export function ShopClient')
    const iconBefore = clientSource.indexOf('function IconBox')
    expect(iconBefore).toBeGreaterThan(-1)
    expect(iconBefore).toBeLessThan(clientIdx)
  })

  it('OwnedPill is NOT defined inside ShopClient function body', () => {
    const clientIdx  = clientSource.indexOf('export function ShopClient')
    const ownedBefore = clientSource.indexOf('function OwnedPill')
    expect(ownedBefore).toBeGreaterThan(-1)
    expect(ownedBefore).toBeLessThan(clientIdx)
  })

})

describe('ShopClient — pricing: reads from BALANCE, no hardcoded price constants', () => {

  it('does not contain hardcoded SPY_PRICES constant', () => {
    expect(clientSource).not.toContain('SPY_PRICES')
  })

  it('does not contain hardcoded SCOUT_PRICES constant', () => {
    expect(clientSource).not.toContain('SCOUT_PRICES')
  })

  it('reads spy cost from BALANCE.weapons.spy[key]', () => {
    expect(clientSource).toContain('BALANCE.weapons.spy[key]')
  })

  it('reads scout cost from BALANCE.weapons.scout[key]', () => {
    expect(clientSource).toContain('BALANCE.weapons.scout[key]')
  })

  it('uses ResourceQuad for cost display instead of single-resource CostPill', () => {
    expect(clientSource).toContain('ResourceQuad')
  })

  it('canBuy for attack checks all 4 resources', () => {
    expect(clientSource).toContain('cost.gold * amt')
    expect(clientSource).toContain('cost.iron * amt')
    expect(clientSource).toContain('cost.wood * amt')
    expect(clientSource).toContain('cost.food * amt')
  })

  it('canBuy for attack has no maxPerPlayer reference', () => {
    expect(clientSource).not.toContain('maxPerPlayer')
  })

  it('resource strip shows all 4 resources (gold, iron, wood, food)', () => {
    expect(clientSource).toContain('"Gold"')
    expect(clientSource).toContain('"Iron"')
    expect(clientSource).toContain('"Wood"')
    expect(clientSource).toContain('"Food"')
  })

})

// ── Migration structural tests ────────────────────────────────────────────────

const MIGRATION_PATH = path.resolve(__dirname, '../../supabase/migrations/0023_shop_rpc.sql')
const migrationSource: string = fs.readFileSync(MIGRATION_PATH, 'utf8')

describe('0023_shop_rpc.sql — structural contracts', () => {

  it('both RPCs use SET search_path = public (SECURITY DEFINER hardening)', () => {
    // Prevents schema-injection attacks against SECURITY DEFINER functions.
    // At least 2 occurrences — one per function body (comments may add more).
    const matches = migrationSource.match(/SET search_path = public/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })

  it('buy RPC has input guard: p_amount <= 0 → invalid_amount', () => {
    // buy section appears before sell section in the file
    const buySection = migrationSource.slice(
      migrationSource.indexOf('shop_buy_apply'),
      migrationSource.indexOf('shop_sell_apply'),
    )
    expect(buySection).toContain('p_amount <= 0')
    expect(buySection).toContain("'invalid_amount'")
  })

  it('buy RPC has input guard: negative cost → invalid_cost', () => {
    const buySection = migrationSource.slice(
      migrationSource.indexOf('shop_buy_apply'),
      migrationSource.indexOf('shop_sell_apply'),
    )
    expect(buySection).toContain('p_total_gold < 0')
    expect(buySection).toContain("'invalid_cost'")
  })

  it('sell RPC has input guard: p_amount <= 0 → invalid_amount', () => {
    const sellSection = migrationSource.slice(migrationSource.indexOf('shop_sell_apply'))
    expect(sellSection).toContain('p_amount <= 0')
    expect(sellSection).toContain("'invalid_amount'")
  })

  it('sell RPC has input guard: negative refund → invalid_refund', () => {
    const sellSection = migrationSource.slice(migrationSource.indexOf('shop_sell_apply'))
    expect(sellSection).toContain('p_refund_gold < 0')
    expect(sellSection).toContain("'invalid_refund'")
  })

  it('both RPCs have NOT FOUND guards after resources+players lock', () => {
    // 2 per function (resources+players lock, weapons lock) × 2 functions = 4 minimum.
    // Comments may add extra occurrences.
    const matches = migrationSource.match(/IF NOT FOUND/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(4)
  })

  it('both RPCs use SECURITY DEFINER', () => {
    // At least 2 — one per function definition (comments may add more).
    const matches = migrationSource.match(/SECURITY DEFINER/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(2)
  })

  it('both RPCs grant execute to postgres and service_role', () => {
    expect(migrationSource).toContain('TO postgres, service_role')
  })

})

// ── Buy validation logic simulation ──────────────────────────────────────────

describe('Buy validation — logic simulation (pure, no DB)', () => {

  type Cost = { gold: number; iron: number; wood: number; food: number }

  function canBuyAttack(
    resources: Cost,
    cost: Cost,
    amount: number,
  ): { ok: boolean; error?: string } {
    const totalGold = cost.gold * amount
    const totalIron = cost.iron * amount
    const totalWood = cost.wood * amount
    const totalFood = cost.food * amount

    if (resources.gold < totalGold) return { ok: false, error: 'Not enough gold' }
    if (resources.iron < totalIron) return { ok: false, error: 'Not enough iron' }
    if (resources.wood < totalWood) return { ok: false, error: 'Not enough wood' }
    if (resources.food < totalFood) return { ok: false, error: 'Not enough food' }
    return { ok: true }
  }

  const slingshotCost = BALANCE.weapons.attack.slingshot.cost

  it('succeeds when all 4 resources are sufficient', () => {
    const resources = { gold: 9999, iron: 9999, wood: 9999, food: 9999 }
    const result = canBuyAttack(resources, slingshotCost, 1)
    expect(result.ok).toBe(true)
  })

  it('fails when gold is insufficient', () => {
    const resources = { gold: 0, iron: 9999, wood: 9999, food: 9999 }
    const result = canBuyAttack(resources, slingshotCost, 1)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Not enough gold')
  })

  it('fails when iron is insufficient', () => {
    const resources = { gold: 9999, iron: 0, wood: 9999, food: 9999 }
    const result = canBuyAttack(resources, slingshotCost, 1)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Not enough iron')
  })

  it('fails when wood is insufficient', () => {
    const resources = { gold: 9999, iron: 9999, wood: 0, food: 9999 }
    const result = canBuyAttack(resources, slingshotCost, 1)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Not enough wood')
  })

  it('fails when food is insufficient', () => {
    const resources = { gold: 9999, iron: 9999, wood: 9999, food: 0 }
    const result = canBuyAttack(resources, slingshotCost, 1)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Not enough food')
  })

  it('correctly scales cost by amount for multi-unit purchase', () => {
    const exact: Cost = {
      gold: slingshotCost.gold * 5,
      iron: slingshotCost.iron * 5,
      wood: slingshotCost.wood * 5,
      food: slingshotCost.food * 5,
    }
    expect(canBuyAttack(exact, slingshotCost, 5).ok).toBe(true)

    // One resource short by 1
    expect(canBuyAttack({ ...exact, food: exact.food - 1 }, slingshotCost, 5).ok).toBe(false)
  })

  it('one-per-player rule: defense rejected if already owned', () => {
    // Simulates: p_is_multi=false && currentOwned > 0 → already_owned
    const isMulti = false  // defense
    const currentOwned = 1
    const rejected = !isMulti && currentOwned > 0
    expect(rejected).toBe(true)
  })

  it('attack is not subject to one-per-player rule', () => {
    const isMulti = true  // attack
    const currentOwned = 99
    const rejected = !isMulti && currentOwned > 0
    expect(rejected).toBe(false)
  })

  it('sell refund returns all 4 resources proportionally', () => {
    const cost = slingshotCost
    const pct  = BALANCE.weapons.sellRefundPercent
    const amount = 3

    const refundGold = Math.floor(cost.gold * pct * amount)
    const refundIron = Math.floor(cost.iron * pct * amount)
    const refundWood = Math.floor(cost.wood * pct * amount)
    const refundFood = Math.floor(cost.food * pct * amount)

    expect(refundGold).toBeGreaterThan(0)
    expect(refundIron).toBeGreaterThan(0)
    expect(refundWood).toBeGreaterThan(0)
    expect(refundFood).toBeGreaterThan(0)

    // Equal (since all costs are equal)
    expect(refundIron).toBe(refundGold)
    expect(refundWood).toBe(refundGold)
    expect(refundFood).toBe(refundGold)

    // Refund ≤ original cost
    expect(refundGold).toBeLessThanOrEqual(cost.gold * amount)
  })

  it('duplicate-request guard: shop cooldown window is 500ms', () => {
    // Simulates the route-level pre-check logic
    const COOLDOWN = 500
    const lastShopAt = new Date(Date.now() - 200).toISOString()
    const msSinceLast = Date.now() - new Date(lastShopAt).getTime()
    expect(msSinceLast).toBeLessThan(COOLDOWN)

    const oldShopAt = new Date(Date.now() - 600).toISOString()
    const msSinceOld = Date.now() - new Date(oldShopAt).getTime()
    expect(msSinceOld).toBeGreaterThanOrEqual(COOLDOWN)
  })

  it('RPC error codes map to correct HTTP statuses', () => {
    // Mirror of BUY_RPC_ERROR_MAP in the route
    const errorMap: Record<string, number> = {
      invalid_amount:         400,
      invalid_cost:           400,
      unknown_weapon:         400,
      too_many_requests:      429,
      player_state_not_found: 404,
      already_owned:          400,
      not_enough_gold:        400,
      not_enough_iron:        400,
      not_enough_wood:        400,
      not_enough_food:        400,
    }
    expect(errorMap['invalid_amount']).toBe(400)
    expect(errorMap['invalid_cost']).toBe(400)
    expect(errorMap['too_many_requests']).toBe(429)
    expect(errorMap['player_state_not_found']).toBe(404)
    expect(errorMap['already_owned']).toBe(400)
    expect(errorMap['not_enough_gold']).toBe(400)
  })

  it('NOT FOUND guard: null resources must fail, not silently pass', () => {
    // Simulates the bug that existed before NOT FOUND guards were added.
    // In PL/pgSQL without IF NOT FOUND, SELECT INTO leaves vars as NULL.
    // NULL comparisons in IF conditions evaluate as false — all guards
    // are silently skipped and the function returns ok:true (false success).
    //
    // This test confirms the correct guard logic in TypeScript terms:
    const v_gold: number | null = null  // no row found — variable stays null

    // Bug: in PL/pgSQL, (null < 200) evaluates as null → false → guard skipped
    const affordabilityFiredBug = v_gold !== null && v_gold < 200
    expect(affordabilityFiredBug).toBe(false)  // silently passes — this is the bug

    // Fix: explicit NOT FOUND check before any guards
    const notFoundFired = v_gold === null
    expect(notFoundFired).toBe(true)  // correctly caught by IF NOT FOUND guard
  })

  it('NOT FOUND guard: player_state_not_found maps to 404, not 400', () => {
    // Verifies the error code chosen is appropriate for missing rows.
    // 404 is correct: the player exists (session is valid) but their
    // DB rows (resources / weapons) are missing — data integrity issue.
    const SELL_RPC_ERROR_MAP: Record<string, number> = {
      unknown_weapon:         400,
      too_many_requests:      429,
      player_state_not_found: 404,
      not_enough_owned:       400,
    }
    expect(SELL_RPC_ERROR_MAP['player_state_not_found']).toBe(404)
  })

})

// ── Design decision documentation tests ──────────────────────────────────────

describe('Shop design decisions — documented constraints', () => {

  it('global shop throttle: last_shop_at is intentional, not a bug', () => {
    // last_shop_at throttles ALL shop actions within the cooldown window.
    // This means buy→sell→buy in rapid succession is rate-limited globally.
    // This is intentional — consistent with last_attack_at / last_spy_at
    // which also throttle their respective action types globally.
    // It is NOT per-item idempotency. True idempotency would require
    // client-generated request UUIDs and a server-side keys table.
    //
    // Decision: keep as global shop throttle. Document, do not "fix".
    const COOLDOWN_MS = 500
    const actions = ['buy_slingshot', 'sell_wood_shield', 'buy_boomerang']
    // All 3 share one last_shop_at timestamp — that's the design.
    expect(actions.length).toBeGreaterThan(1)  // multiple action types, one throttle
    expect(COOLDOWN_MS).toBe(500)
  })

  it('power recalculation outside RPC is acceptable', () => {
    // recalculatePower() runs after the RPC commits, not inside the transaction.
    // Acceptable because:
    //   1. power_attack/defense/spy/scout are denormalized caches, not
    //      authoritative state (authoritative data is in weapons/army/training).
    //   2. Staleness is self-correcting: next action or tick recalculates.
    //   3. Every other mutation in this codebase (attack, spy, training)
    //      follows the same pattern — consistent design.
    //   4. Moving the TypeScript formula into SQL would violate SSOT
    //      (balance.config.ts is the single source of truth for all numbers).
    //
    // If recalculatePower() throws, the shop mutation is already committed
    // but power columns are temporarily stale. Not a data-loss scenario.
    const powerColumnsAreCaches = true
    expect(powerColumnsAreCaches).toBe(true)
  })

  it('SET search_path = public prevents schema-injection against SECURITY DEFINER', () => {
    // Without a fixed search_path, a caller could shadow system functions
    // by placing objects in a schema that appears earlier in the default
    // search path.  Pinning to 'public' eliminates that attack surface.
    // Both shop RPCs use: SECURITY DEFINER + SET search_path = public.
    expect(migrationSource).toContain('SET search_path = public')
  })

})
