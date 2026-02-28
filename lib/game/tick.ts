/**
 * Domiron v5 — Tick Processing Logic
 * Called every 30 minutes by Vercel Cron → GET /api/tick
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
  const cityMult = BALANCE.cities.CITY_PRODUCTION_MULT[city] ?? 1
  const vipMult  = isVipActive(vipUntil) ? BALANCE.vip.productionMultiplier : 1.0

  // Development level adds 0.5 per level to production rate range
  const devOffset = (devLevel - 1) * 0.5
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

// Bank interest: applied once per day (on tick when date changes)
//
// interest = floor(balance × BANK_INTEREST_RATE_BASE)
//           + floor(balance × interestLevel × BANK_INTEREST_RATE_PER_LEVEL)
//           + floor(balance × vipRate)
//
// ⚠️  BANK_INTEREST_RATE_BASE and BANK_INTEREST_RATE_PER_LEVEL are [TUNE: unassigned].
//     Do not call this in production until both are set in balance.config.ts.
export function calcBankInterest(
  balance:       number,
  interestLevel: number,
  vipUntil:      string | null
): number {
  const baseRate  = BALANCE.bank.BANK_INTEREST_RATE_BASE
  const levelRate = interestLevel * BALANCE.bank.BANK_INTEREST_RATE_PER_LEVEL
  const vipRate   = isVipActive(vipUntil) ? BALANCE.vip.bankInterestBonus : 0
  const totalRate = baseRate + levelRate + vipRate
  return Math.floor(balance * totalRate)
}
