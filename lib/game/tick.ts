/**
 * Domiron — Tick Processing Logic
 * Called every 30 minutes by Vercel Cron → GET /api/tick
 * All numbers from BALANCE — never hardcoded.
 */
import { BALANCE } from '@/lib/game/balance'
import { isVipActive } from '@/lib/utils'
import type { Player, Development, Army } from '@/types/game'

// Calculate turns to add (capped at max_turns, but never reduces existing turns above cap)
export function calcTurnsToAdd(currentTurns: number, maxTurns: number, isVacation: boolean): number {
  // If already at or above cap (e.g. new player with 100 starting turns), do not reduce
  if (currentTurns >= maxTurns) return currentTurns
  const toAdd = isVacation
    ? Math.ceil(BALANCE.tick.turnsPerTick * BALANCE.season.vacationTurnsMultiplier)
    : BALANCE.tick.turnsPerTick
  return Math.min(currentTurns + toAdd, maxTurns)
}

// Population added per tick based on population_level
export function calcPopulationGrowth(
  populationLevel: number,
  vipUntil: string | null
): number {
  const base = BALANCE.production.populationPerTick[
    populationLevel as keyof typeof BALANCE.production.populationPerTick
  ] ?? 1
  const vipMult = isVipActive(vipUntil) ? BALANCE.vip.productionMultiplier : 1.0
  return Math.floor(base * vipMult)
}

// Slave production per tick (per resource type)
export function calcSlaveProduction(
  slavesAllocated: number,
  devLevel: number,
  city: number,
  vipUntil: string | null,
  raceGoldBonus = 0   // race bonus for gold only
): { min: number; max: number; avg: number } {
  const { baseMin, baseMax, cityMultipliers } = BALANCE.production
  const cityMult = cityMultipliers[city as keyof typeof cityMultipliers] ?? 1
  const vipMult = isVipActive(vipUntil) ? BALANCE.vip.productionMultiplier : 1.0

  // Development rate increases per level (approx: level * 0.5 added to base)
  const devOffset = (devLevel - 1) * 0.5
  const rateMin = (baseMin + devOffset) * cityMult * vipMult * (1 + raceGoldBonus)
  const rateMax = (baseMax + devOffset) * cityMult * vipMult * (1 + raceGoldBonus)

  return {
    min: Math.floor(slavesAllocated * rateMin),
    max: Math.floor(slavesAllocated * rateMax),
    avg: Math.floor(slavesAllocated * ((rateMin + rateMax) / 2)),
  }
}

// Tribe mana added per tick
export function calcTribeManaGain(memberCount: number): number {
  const { base, bonus10to19, bonus20to29, bonus30to39, bonus40to49, bonus50 } = BALANCE.tribe.manaPerTick
  let extra = 0
  if (memberCount >= 50) extra = bonus50
  else if (memberCount >= 40) extra = bonus40to49
  else if (memberCount >= 30) extra = bonus30to39
  else if (memberCount >= 20) extra = bonus20to29
  else if (memberCount >= 10) extra = bonus10to19
  return base + extra
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

// Ranking formula: weighted sum of power scores
export function calcPowerTotal(
  attackPower: number,
  defensePower: number,
  spyPower: number,
  scoutPower: number
): number {
  const { attackWeight, defenseWeight, spyWeight, scoutWeight } = BALANCE.ranking
  return Math.floor(
    attackPower  * attackWeight  +
    defensePower * defenseWeight +
    spyPower     * spyWeight     +
    scoutPower   * scoutWeight
  )
}

// Bank interest: applied once per day (on tick when date changes)
export function calcBankInterest(balance: number, interestLevel: number, vipUntil: string | null): number {
  const baseRate = interestLevel * BALANCE.bank.interestPerLevel
  const vipRate = isVipActive(vipUntil) ? BALANCE.vip.bankInterestBonus : 0
  const totalRate = baseRate + vipRate
  return Math.floor(balance * totalRate)
}
