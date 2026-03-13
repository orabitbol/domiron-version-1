/**
 * Domiron v5 — Hero Effect System
 *
 * Pure functions for computing active hero effect totals.
 * The server-side DB helper (getActiveHeroEffects) requires a Supabase client.
 *
 * Design rules:
 *   - Hero effects NEVER modify Personal Power (PP).
 *   - Attack/Defense effects multiply PP only — never ClanBonus.
 *   - All bonus categories are hard-capped at MAX_STACK_RATE (0.50).
 *   - Shields block effects inside combat resolution — never at the gate.
 *   - Loot decay counting proceeds regardless of shield state.
 */

import { BALANCE } from '@/lib/game/balance'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export type HeroEffectType =
  | 'SLAVE_OUTPUT_10'
  | 'SLAVE_OUTPUT_20'
  | 'SLAVE_OUTPUT_30'
  | 'RESOURCE_SHIELD'
  | 'SOLDIER_SHIELD'
  | 'ATTACK_POWER_10'
  | 'DEFENSE_POWER_10'

export interface PlayerHeroEffect {
  id:               string
  player_id:        string
  type:             HeroEffectType
  starts_at:        string
  ends_at:          string
  /** Timestamp after which the next shield of this type may start. Null for non-shield effects. */
  cooldown_ends_at: string | null
  /** UI fields: imageKey, priceId, nameKey, etc. */
  metadata:         Record<string, unknown> | null
}

export interface ActiveHeroEffects {
  /** Clamped slave output bonus: 0.0 – 0.50. Applied as (1 + totalSlaveBonus) in production. */
  totalSlaveBonus:      number
  /** Clamped attack ECP bonus: 0.0 – 0.50. Multiplies attacker PP only, never ClanBonus. */
  totalAttackBonus:     number
  /** Clamped defense ECP bonus: 0.0 – 0.50. Multiplies defender PP only, never ClanBonus. */
  totalDefenseBonus:    number
  /** True if Resource Shield is active. When true: loot = 0 inside combat. */
  resourceShieldActive: boolean
  /** True if Soldier Shield is active. When true: defenderLosses = 0, slavesCreated = 0. */
  soldierShieldActive:  boolean
}

// ─────────────────────────────────────────
// PURE FUNCTIONS
// ─────────────────────────────────────────

/**
 * Clamps a stacking bonus total to MAX_STACK_RATE (0.50).
 * Must be called on every accumulated bonus category before passing
 * to calculateECP or calcSlaveProduction. Enforcement is server-side only.
 */
export function clampBonus(total: number, max: number = BALANCE.hero.MAX_STACK_RATE): number {
  return Math.min(total, max)
}

/**
 * Computes the summed, clamped active hero effect totals from a player's effect list.
 * Only effects where (now < ends_at) are counted as active.
 */
export function calcActiveHeroEffects(
  effects: PlayerHeroEffect[],
  now:     Date = new Date(),
): ActiveHeroEffects {
  const nowMs = now.getTime()

  let rawSlaveBonus   = 0
  let rawAttackBonus  = 0
  let rawDefenseBonus = 0
  let resourceShield  = false
  let soldierShield   = false

  for (const effect of effects) {
    if (nowMs >= new Date(effect.ends_at).getTime()) continue  // expired

    switch (effect.type) {
      case 'SLAVE_OUTPUT_10':  rawSlaveBonus   += BALANCE.hero.EFFECT_RATES.SLAVE_OUTPUT_10;  break
      case 'SLAVE_OUTPUT_20':  rawSlaveBonus   += BALANCE.hero.EFFECT_RATES.SLAVE_OUTPUT_20;  break
      case 'SLAVE_OUTPUT_30':  rawSlaveBonus   += BALANCE.hero.EFFECT_RATES.SLAVE_OUTPUT_30;  break
      case 'RESOURCE_SHIELD':  resourceShield   = true;                                        break
      case 'SOLDIER_SHIELD':   soldierShield    = true;                                        break
      case 'ATTACK_POWER_10':  rawAttackBonus  += BALANCE.hero.EFFECT_RATES.ATTACK_POWER_10;  break
      case 'DEFENSE_POWER_10': rawDefenseBonus += BALANCE.hero.EFFECT_RATES.DEFENSE_POWER_10; break
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
 * Returns true if a shield effect of the specified type is currently active
 * (now < ends_at) for any effect in the list.
 */
export function isShieldActive(
  effects: PlayerHeroEffect[],
  type:    'RESOURCE_SHIELD' | 'SOLDIER_SHIELD',
  now:     Date = new Date(),
): boolean {
  const nowMs = now.getTime()
  return effects.some(e => e.type === type && nowMs < new Date(e.ends_at).getTime())
}

/**
 * Returns the new turn count after applying a purchased turns pack.
 * Clamped to BALANCE.tick.purchasedTurnsMaxCap (5000) — intentionally higher than the
 * normal tick-regen cap (200) so bought turns are never silently discarded.
 * Tick regen still uses calcTurnsToAdd() which clamps at maxTurns.
 */
export function applyTurnsPack(currentTurns: number, amount: number): number {
  return Math.min(currentTurns + amount, BALANCE.tick.purchasedTurnsMaxCap)
}

// ─────────────────────────────────────────
// SERVER-SIDE DB HELPER
// ─────────────────────────────────────────

/**
 * Thrown by getActiveHeroEffects() when the DB query fails.
 * Callers must catch this and abort the request (HTTP 503) — do NOT fall back to zero effects.
 * Falling back to zeros would silently strip active shields from a player mid-combat.
 */
export class HeroEffectsUnavailableError extends Error {
  constructor(public readonly playerId: string, cause?: unknown) {
    super(`Failed to load hero effects for player ${playerId}`)
    this.name = 'HeroEffectsUnavailableError'
    if (cause !== undefined) this.cause = cause
  }
}

/**
 * Queries player_hero_effects for the given player and returns computed totals.
 * Requires a Supabase server client — never call from client components.
 *
 * Throws HeroEffectsUnavailableError on DB/query failure.
 * The caller must catch this and return HTTP 503 — do NOT proceed with combat using
 * zeroed effects, as that silently strips a player's active shields and bonuses.
 */
export async function getActiveHeroEffects(
  supabase: SupabaseClient,
  playerId: string,
): Promise<ActiveHeroEffects> {
  const now = new Date()

  const { data, error } = await supabase
    .from('player_hero_effects')
    .select('id, player_id, type, starts_at, ends_at, cooldown_ends_at, metadata')
    .eq('player_id', playerId)
    .gt('ends_at', now.toISOString())

  if (error || !data) {
    throw new HeroEffectsUnavailableError(playerId, error)
  }

  return calcActiveHeroEffects(data as PlayerHeroEffect[], now)
}
