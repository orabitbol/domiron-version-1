/**
 * Domiron v5 — VIP Boost System
 *
 * Pure functions for computing active boost totals.
 * The server-side DB helper (getActiveBoostTotals) requires a Supabase client.
 *
 * Design rules enforced here:
 *   - Boosts NEVER modify PP.
 *   - Attack/Defense boosts multiply PP only — never ClanBonus.
 *   - All bonus categories are hard-capped at MAX_STACK_RATE (0.50).
 *   - Shields block effects inside combat resolution — never at the gate.
 */

import { BALANCE } from '@/lib/game/balance'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type BoostType =
  | 'SLAVE_OUTPUT_10'
  | 'SLAVE_OUTPUT_20'
  | 'SLAVE_OUTPUT_30'
  | 'RESOURCE_SHIELD'
  | 'SOLDIER_SHIELD'
  | 'ATTACK_POWER_10'
  | 'DEFENSE_POWER_10'

export interface PlayerBoost {
  id:               string
  player_id:        string
  type:             BoostType
  starts_at:        string
  ends_at:          string
  /** Timestamp after which the next shield of this type can start. Null for non-shield boosts. */
  cooldown_ends_at: string | null
  metadata:         Record<string, unknown> | null
}

export interface ActiveBoostTotals {
  /** Clamped slave output bonus: 0.0 – 0.50. Applied as (1 + totalSlaveBonus) in production. */
  totalSlaveBonus:      number
  /** Clamped attack ECP bonus: 0.0 – 0.50. Multiplies attacker PP only, never ClanBonus. */
  totalAttackBonus:     number
  /** Clamped defense ECP bonus: 0.0 – 0.50. Multiplies defender PP only, never ClanBonus. */
  totalDefenseBonus:    number
  /** True if Resource Shield is active. When true: loot = 0 inside combat resolution. */
  resourceShieldActive: boolean
  /** True if Soldier Shield is active. When true: defenderLosses = 0, slavesCreated = 0. */
  soldierShieldActive:  boolean
}

// ─────────────────────────────────────────
// PURE FUNCTIONS
// ─────────────────────────────────────────

/**
 * Clamps a stacking bonus total to the MAX_STACK_RATE ceiling (0.50).
 *
 * Must be called on every accumulated bonus category before it is passed
 * to calculateECP or calcSlaveProduction. Server-side enforcement is mandatory.
 */
export function clampBonus(total: number, max: number = BALANCE.boosts.MAX_STACK_RATE): number {
  return Math.min(total, max)
}

/**
 * Computes the summed, clamped active boost totals from a player's boost list.
 * Only boosts where (now < ends_at) are counted as active.
 *
 * Accepts a raw list of PlayerBoost rows (already fetched from DB).
 * Pass this result directly into resolveCombat or calcSlaveProduction.
 */
export function calcActiveBoostTotals(
  boosts: PlayerBoost[],
  now:    Date = new Date(),
): ActiveBoostTotals {
  const nowMs = now.getTime()

  let rawSlaveBonus   = 0
  let rawAttackBonus  = 0
  let rawDefenseBonus = 0
  let resourceShield  = false
  let soldierShield   = false

  for (const boost of boosts) {
    if (nowMs >= new Date(boost.ends_at).getTime()) continue  // expired

    switch (boost.type) {
      case 'SLAVE_OUTPUT_10':  rawSlaveBonus   += BALANCE.boosts.SLAVE_OUTPUT_RATES.SLAVE_OUTPUT_10; break
      case 'SLAVE_OUTPUT_20':  rawSlaveBonus   += BALANCE.boosts.SLAVE_OUTPUT_RATES.SLAVE_OUTPUT_20; break
      case 'SLAVE_OUTPUT_30':  rawSlaveBonus   += BALANCE.boosts.SLAVE_OUTPUT_RATES.SLAVE_OUTPUT_30; break
      case 'RESOURCE_SHIELD':  resourceShield   = true;                                               break
      case 'SOLDIER_SHIELD':   soldierShield    = true;                                               break
      case 'ATTACK_POWER_10':  rawAttackBonus  += BALANCE.boosts.ATTACK_POWER_10;                    break
      case 'DEFENSE_POWER_10': rawDefenseBonus += BALANCE.boosts.DEFENSE_POWER_10;                   break
    }
  }

  return {
    totalSlaveBonus:      clampBonus(rawSlaveBonus),
    totalAttackBonus:     clampBonus(rawAttackBonus),
    totalDefenseBonus:    clampBonus(rawDefenseBonus),
    resourceShieldActive: resourceShield,
    soldierShieldActive:  soldierShield,
  }
}

/**
 * Returns true if a shield boost of the specified type is currently active
 * (now < ends_at) for any boost in the list.
 */
export function isShieldActive(
  boosts: PlayerBoost[],
  type:   'RESOURCE_SHIELD' | 'SOLDIER_SHIELD',
  now:    Date = new Date(),
): boolean {
  const nowMs = now.getTime()
  return boosts.some(b => b.type === type && nowMs < new Date(b.ends_at).getTime())
}

/**
 * Returns the new turn count after applying a purchased turns pack.
 * Clamped to BALANCE.tick.maxTurns (200). Never exceeds the cap.
 *
 * The API route handles writing the result back to the DB.
 */
export function applyTurnsPack(currentTurns: number, amount: number): number {
  return Math.min(currentTurns + amount, BALANCE.tick.maxTurns)
}

// ─────────────────────────────────────────
// SERVER-SIDE DB HELPER
// ─────────────────────────────────────────

/**
 * Queries player_boosts for the given player and returns computed totals.
 * Requires a Supabase server client — never call from client components.
 *
 * Fail-safe: returns all-zeros/false if the query fails, so combat resolution
 * is never blocked by a boost lookup error.
 */
export async function getActiveBoostTotals(
  supabase: SupabaseClient,
  playerId: string,
): Promise<ActiveBoostTotals> {
  const now = new Date()

  const { data, error } = await supabase
    .from('player_boosts')
    .select('id, player_id, type, starts_at, ends_at, cooldown_ends_at, metadata')
    .eq('player_id', playerId)
    .gt('ends_at', now.toISOString())

  if (error || !data) {
    // Fail safe — no boosts active rather than blocking combat
    return {
      totalSlaveBonus:      0,
      totalAttackBonus:     0,
      totalDefenseBonus:    0,
      resourceShieldActive: false,
      soldierShieldActive:  false,
    }
  }

  return calcActiveBoostTotals(data as PlayerBoost[], now)
}
