/**
 * city-thresholds.ts
 *
 * Geometric-growth promotion threshold formulas.
 *
 * For each city tier N (1-indexed), the required amounts are:
 *
 *   soldiersRequired(N)  = floor(S_base  × s_growth ^ (N-1))
 *   populationRequired(N) = floor(P_base  × p_growth ^ (N-1))
 *   resourcesRequired(N) = floor(R_base  × r_growth ^ (N-1))
 *
 * At N=1 (the starting city) the exponent is 0 so the result equals the
 * base value exactly.  Growth factors ≥ 1 guarantee monotonic increase.
 *
 * Parameters are sourced from BALANCE.cities.promotionThresholds and
 * validated at module boot by validateBalance().
 */
import { BALANCE } from '@/lib/game/balance'

/** Soldiers required to promote TO city tier `city` (city ≥ 1). */
export function soldiersRequired(city: number): number {
  const { S_base, s_growth } = BALANCE.cities.promotionThresholds
  return Math.floor(S_base * Math.pow(s_growth, city - 1))
}

/** Free-population required to promote TO city tier `city` (city ≥ 1). */
export function populationRequired(city: number): number {
  const { P_base, p_growth } = BALANCE.cities.promotionThresholds
  return Math.floor(P_base * Math.pow(p_growth, city - 1))
}

/** Gold-equivalent resources required to promote TO city tier `city` (city ≥ 1). */
export function resourcesRequired(city: number): number {
  const { R_base, r_growth } = BALANCE.cities.promotionThresholds
  return Math.floor(R_base * Math.pow(r_growth, city - 1))
}
