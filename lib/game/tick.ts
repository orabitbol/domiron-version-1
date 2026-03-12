/**
 * Domiron v5 — Tick Processing Logic
 * Called every 30 minutes by pg_cron (Supabase) via pg_net → GET /api/tick
 * In local dev, called by instrumentation.ts setInterval.
 * All numbers from BALANCE — never hardcoded.
 */
import { BALANCE } from '@/lib/game/balance'
import { isVipActive } from '@/lib/utils'
import type { Player, Development, Army } from '@/types/game'

/**
 * Turn regen per tick.
 *   new_turns = min(current_turns + TURNS_PER_TICK, MAX_TURNS)
 *
 * Regen only happens when current_turns < MAX_TURNS.
 * If already at or above cap, returns current value unchanged (never reduces).
 * Vacation modifier reduces regen to 1/3.
 */
export function calcTurnsToAdd(currentTurns: number, isVacation: boolean): number {
  const { turnsPerTick, maxTurns } = BALANCE.tick
  if (currentTurns >= maxTurns) return currentTurns
  const toAdd = isVacation
    ? Math.ceil(turnsPerTick * BALANCE.season.vacationTurnsMultiplier)
    : turnsPerTick
  return Math.min(currentTurns + toAdd, maxTurns)
}

// Population added per tick based on population_level
export function calcPopulationGrowth(
  populationLevel: number,
  vipUntil: string | null
): number {
  const base = BALANCE.training.populationPerTick[populationLevel] ?? 1
  const vipMult = isVipActive(vipUntil) ? BALANCE.vip.productionMultiplier : 1.0
  return Math.floor(base * vipMult)
}

// Slave production per tick (per resource type)
//
// slaveBonus: pre-clamped TotalSlaveBonus from getActiveBoostTotals() (0 – 0.50).
// Applied as (1 + slaveBonus) on the final rate. Default 0 = no boost.
export function calcSlaveProduction(
  slavesAllocated: number,
  devLevel: number,
  city: number,
  vipUntil: string | null,
  raceGoldBonus = 0,
  slaveBonus = 0,
): { min: number; max: number; avg: number } {
  const { baseMin, baseMax } = BALANCE.production
  // City multipliers are [TUNE: unassigned] — default to 1 until values are set
  const cityMult = BALANCE.cities.slaveProductionMultByCity[city] ?? 1
  const vipMult  = isVipActive(vipUntil) ? BALANCE.vip.productionMultiplier : 1.0

  // Development level adds DEV_OFFSET_PER_LEVEL (0.5) per level to production rate range
  const devOffset = (devLevel - 1) * BALANCE.production.DEV_OFFSET_PER_LEVEL
  const rateMin   = (baseMin + devOffset) * cityMult * vipMult * (1 + raceGoldBonus) * (1 + slaveBonus)
  const rateMax   = (baseMax + devOffset) * cityMult * vipMult * (1 + raceGoldBonus) * (1 + slaveBonus)

  return {
    min: Math.floor(slavesAllocated * rateMin),
    max: Math.floor(slavesAllocated * rateMax),
    avg: Math.floor(slavesAllocated * ((rateMin + rateMax) / 2)),
  }
}

// Hero mana per tick
export function calcHeroManaGain(heroLevel: number, vipUntil: string | null): number {
  const { base, level10bonus, level50bonus, vipBonus } = BALANCE.hero.manaPerTick
  let mana = base
  if (heroLevel >= 10) mana += level10bonus
  if (heroLevel >= 50) mana += level50bonus
  if (isVipActive(vipUntil)) mana += vipBonus
  return mana
}

// Tribe mana regen per tick
export function calcTribeManaGain(memberCount: number): number {
  return Math.max(1, Math.floor(memberCount * BALANCE.tribe.manaPerMemberPerTick))
}

// Bank interest: applied once per day (on tick when date changes).
//
// interest = floor(balance × INTEREST_RATE_BY_LEVEL[interestLevel])
//
// VIP bank interest bonus is 0 (BALANCE.vip.bankInterestBonus = 0 [unassigned]).
// vipUntil param kept for signature compatibility.
export function calcBankInterest(
  balance:       number,
  interestLevel: number,
  vipUntil:      string | null  // reserved for future VIP bank bonus; currently unused
): number {
  void vipUntil  // VIP bank bonus is 0 — suppress unused-param lint
  const rate = BALANCE.bank.INTEREST_RATE_BY_LEVEL[interestLevel] ?? 0
  return Math.floor(balance * rate)
}

// Sum of all member power_totals — stored to tribes.power_total once per tick.
export function calcTribePowerTotal(memberPowerTotals: number[]): number {
  return memberPowerTotals.reduce((sum, p) => sum + p, 0)
}

/**
 * Tick duplicate-run guard.
 *
 * Returns true when the tick should be skipped because the previous tick
 * completed too recently (i.e. world_state.next_tick_at is still substantially
 * in the future).
 *
 * Rationale: Vercel Cron had implicit per-deployment deduplication. pg_cron
 * does not. This guard provides an equivalent safety net using the
 * server-authoritative world_state.next_tick_at timestamp.
 *
 * Logic:
 *   minutesUntilNext = (nextTickAtMs - nowMs) / 60_000
 *   skip if minutesUntilNext > DUPLICATE_GUARD_THRESHOLD_MINUTES (5)
 *
 * Normal cadence: tick completes, sets next_tick_at = now + 30 min.
 * pg_cron fires 30 min later → minutesUntilNext ≈ 0 → allow.
 * Duplicate fire 2 min later → minutesUntilNext ≈ 28 → skip.
 *
 * @param nextTickAtIso  world_state.next_tick_at value (or null/undefined if row absent)
 * @param nowMs          Date.now() at call time
 * @returns true = skip this run (duplicate), false = proceed
 */
export const DUPLICATE_GUARD_THRESHOLD_MINUTES = 5

export function isTickDuplicateRun(
  nextTickAtIso: string | null | undefined,
  nowMs: number,
): boolean {
  if (!nextTickAtIso) return false
  const minutesUntilNext = (new Date(nextTickAtIso).getTime() - nowMs) / 60_000
  return minutesUntilNext > DUPLICATE_GUARD_THRESHOLD_MINUTES
}
