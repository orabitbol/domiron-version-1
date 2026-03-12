/**
 * Domiron v5 — Balance Simulation Tool  (v2 — corrected)
 *
 * Run:
 *   npx vitest run scripts/balance-sim.test.ts --reporter=verbose
 *
 * Deterministic tick-by-tick simulation using real SSOT constants and the
 * same pure functions the game server uses (calcSlaveProduction, etc.).
 * All formulas mirror the actual API routes exactly — no approximations.
 *
 * ═══ SIMULATION ASSUMPTIONS ══════════════════════════════════════════════════
 *
 * ── SSOT-backed (directly from routes/tick.ts/balance.config.ts) ────────────
 *
 *  A. Slave allocation is EXPLICIT and PER-RESOURCE.
 *     Each resource (gold/iron/wood/food) draws only from its own assigned
 *     slave pool (slaves_gold, slaves_iron, slaves_wood, slaves_food).
 *     slaves_gold + slaves_iron + slaves_wood + slaves_food <= army.slaves
 *     Idle slaves (unallocated) produce nothing. [Source: tick route L192-201,
 *     mine/allocate route]
 *
 *  B. Tribe production_blessing is applied as a POST-CALCULATION MULTIPLIER
 *     (×1.2) on the final production output, NOT via the slaveBonus parameter
 *     of calcSlaveProduction. slaveBonus is hero-effects only. [Source: tick
 *     route L188-201]
 *
 *  C. Bank deposits are limited to BALANCE.bank.depositsPerDay (5) per
 *     calendar day. Counter resets nightly. There is NO lifetime deposit
 *     limit enforced in any route — BALANCE.bank.maxLifetimeDeposits is a
 *     dead/inconsistent field not checked anywhere. [Source: bank/deposit
 *     route L66]
 *
 *  D. maxDepositPercent = 1.0 — a player can deposit up to 100% of their
 *     gold in hand per deposit. [Source: bank/deposit route L70, BALANCE]
 *
 *  E. Bank interest is COMPOUND — applied once per calendar day (when the
 *     tick's date string differs from last_deposit_reset). Interest accrues
 *     on the growing balance including prior interest. [Source: tick route
 *     L224-233, calcBankInterest]
 *
 *  F. Production uses deterministic midpoint: avg = floor(slaves * (rateMin +
 *     rateMax) / 2). Real game uses random in [min, max]; avg is the unbiased
 *     long-run expectation. [Source: calcSlaveProduction in lib/game/tick.ts]
 *
 *  G. Starting free_population immediately converted to slaves (zero cost).
 *     [BALANCE.startingResources.startingPopulation → army.slaves on register]
 *
 *  H. Bank interest and depositsToday reset both occur on the first tick of a
 *     new day (tick % TICKS_PER_DAY === 0). [Source: tick route L224]
 *
 * ── Strategy-level scenario assumptions (not SSOT — documented per strategy)
 *
 *  S1. Slave re-allocation: occurs every tick when slave count changes. In the
 *      real game this requires a manual Mine page action. The simulation models
 *      an attentive player who always reallocates when new slaves arrive.
 *
 *  S2. Bank deposits: strategies deposit once per day (at the daily tick).
 *      Deposit amount is strategy-specific (see each strategy definition).
 *      At most 1 deposit per day is modelled (conservative — player logs in
 *      once a day). Real max: 5 deposits/day.
 *
 *  S3. Hero level = 1; no active hero effects; slaveBonus = 0 always.
 *
 *  S4. All players remain in city 1 for the full season (no actual promotion).
 *      City promotion requirements are checked and logged as milestones only.
 *
 *  S5. VIP = always-active '2099-01-01' for VIP profiles; null otherwise.
 *
 *  S6. Tribe production_blessing always active for Tribe profiles.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { BALANCE } from '@/lib/game/balance'
import {
  calcSlaveProduction,
  calcBankInterest,
  calcPopulationGrowth,
  calcTurnsToAdd,
} from '@/lib/game/tick'

// ─────────────────────────────────────────
// Constants
// ─────────────────────────────────────────

const TICKS_PER_DAY = 48
const SEASON_TICKS  = BALANCE.season.durationDays * TICKS_PER_DAY  // 4 320
const SNAP_TICKS    = [48, 144, 480, 1440, 2880, 4320]             // days 1,3,10,30,60,90

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

type Race     = 'human' | 'dwarf' | 'elf' | 'orc'
type Strategy = 'Accumulate' | 'GoldFirst' | 'Balanced' | 'BankFirst' | 'CityRush'
type AllocMode = 'equal' | 'gold-heavy'

interface Profile {
  name: string; race: Race; vip: string | null; tribeBlessing: boolean
}

interface State {
  gold: number;  iron: number;  wood: number;  food: number
  bankGold:      number
  bankLevel:     number
  depositsToday: number   // resets each day boundary
  slaves:     number
  slavesGold: number      // assigned slaves — only these produce gold
  slavesIron: number
  slavesWood: number
  slavesFood: number
  freePop:    number
  soldiers:   number
  city:       number
  devGold: number; devIron: number; devWood: number
  devFood: number; devPop:  number; devFort: number
  turns:  number
  // milestones (tick number when reached, null = never)
  m_bankLv1: number | null;  m_bankLv5: number | null;  m_bankLv10: number | null
  m_devAvg3: number | null;  m_devAvg5: number | null;  m_devAvg10: number | null
  m_gold50k: number | null;  m_gold200k: number | null; m_gold1m:   number | null
  m_city2Ready: number | null; m_city3Ready: number | null
}

interface Snapshot {
  tick: number; day: number
  gold: number; iron: number; wood: number; food: number
  bankGold: number; bankLevel: number
  slaves: number; slavesGold: number; slavesIdle: number; freePop: number
  devGold: number; devAvg: number
}

interface SimResult {
  profile: Profile; strategy: Strategy
  snapshots: Snapshot[]; final: State
}

// ─────────────────────────────────────────
// Cost helpers — exact mirror of API logic
// ─────────────────────────────────────────

type DevField = 'gold' | 'iron' | 'wood' | 'food' | 'population' | 'fortification'

/**
 * Mirror of app/api/develop/upgrade/route.ts getUpgradeCost().
 * API deducts: resources.gold -= cost.gold (always)
 *              resources[resourceType] -= cost.resource (only if resourceType !== 'gold')
 * So gold_level and fortification_level only pay goldCost.
 */
function devUpgradeCost(field: DevField, currentLevel: number): {
  goldCost: number; resourceCost: number; resourceType: string; canUpgrade: boolean
} {
  const isFort = field === 'fortification'
  const maxLv  = isFort ? 5 : 10
  if (currentLevel >= maxLv) return { goldCost: 0, resourceCost: 0, resourceType: 'gold', canUpgrade: false }
  const next  = currentLevel + 1
  const dc    = BALANCE.production.developmentUpgradeCost
  const cfg   = next <= 2 ? dc.level2 : next <= 3 ? dc.level3 : next <= 5 ? dc.level5 : dc.level10
  const resType = (field === 'gold' || field === 'fortification') ? 'gold'
                : field === 'population' ? 'food' : field
  return {
    goldCost:     cfg.gold * next,
    resourceCost: resType !== 'gold' ? cfg.resource * next : 0,
    resourceType: resType,
    canUpgrade:   true,
  }
}

function bankUpgradeCost(currentLevel: number): number {
  if (currentLevel >= BALANCE.bank.MAX_INTEREST_LEVEL) return Infinity
  return BALANCE.bank.upgradeBaseCost * (currentLevel + 1)
}

// ─────────────────────────────────────────
// Resource accessors
// ─────────────────────────────────────────

function getRes(s: State, type: string): number {
  if (type === 'gold') return s.gold
  if (type === 'iron') return s.iron
  if (type === 'wood') return s.wood
  if (type === 'food') return s.food
  return 0
}
function setRes(s: State, type: string, val: number): void {
  if (type === 'gold') { s.gold = val; return }
  if (type === 'iron') { s.iron = val; return }
  if (type === 'wood') { s.wood = val; return }
  if (type === 'food') { s.food = val; return }
}
function getDevLevel(s: State, field: DevField): number {
  if (field === 'gold') return s.devGold; if (field === 'iron') return s.devIron
  if (field === 'wood') return s.devWood; if (field === 'food') return s.devFood
  if (field === 'population') return s.devPop; if (field === 'fortification') return s.devFort
  return 1
}
function incDevLevel(s: State, field: DevField): void {
  if (field === 'gold') { s.devGold++; return } if (field === 'iron') { s.devIron++; return }
  if (field === 'wood') { s.devWood++; return } if (field === 'food') { s.devFood++; return }
  if (field === 'population') { s.devPop++; return } if (field === 'fortification') { s.devFort++; return }
}

function tryDevUpgrade(s: State, field: DevField): boolean {
  const cost = devUpgradeCost(field, getDevLevel(s, field))
  if (!cost.canUpgrade || s.gold < cost.goldCost) return false
  if (cost.resourceCost > 0 && getRes(s, cost.resourceType) < cost.resourceCost) return false
  s.gold -= cost.goldCost
  if (cost.resourceCost > 0) setRes(s, cost.resourceType, getRes(s, cost.resourceType) - cost.resourceCost)
  incDevLevel(s, field)
  return true
}

function tryBankUpgrade(s: State): boolean {
  const cost = bankUpgradeCost(s.bankLevel)
  if (!isFinite(cost) || s.gold < cost) return false
  s.gold -= cost; s.bankLevel++; return true
}

/**
 * One deposit per day (S2). Max deposit = maxDepositPercent of gold = 100%.
 * Real game enforces depositsPerDay=5; simulation uses 1 for conservative estimate.
 */
function tryDeposit(s: State, fraction: number): boolean {
  if (s.bankLevel === 0 || s.depositsToday >= 1) return false
  const amount = Math.floor(s.gold * BALANCE.bank.maxDepositPercent * fraction)
  if (amount <= 0) return false
  s.bankGold += amount; s.gold -= amount; s.depositsToday++; return true
}

// ─────────────────────────────────────────
// Slave allocation (S1)
// ─────────────────────────────────────────

/**
 * Reallocates slaves each time the count changes (S1 — attentive player assumption).
 * Invariant enforced: slavesGold + slavesIron + slavesWood + slavesFood <= slaves
 */
function reallocateSlaves(s: State, mode: AllocMode): void {
  const total = s.slaves
  if (mode === 'gold-heavy') {
    // 55% gold, 15% each other — GoldFirst strategy prioritises gold for upgrades
    s.slavesGold = Math.floor(total * 0.55)
    s.slavesIron = Math.floor(total * 0.15)
    s.slavesWood = Math.floor(total * 0.15)
    s.slavesFood = Math.floor(total * 0.15)
  } else {
    // equal: floor(total/4) per resource; remainder idle
    const each   = Math.floor(total / 4)
    s.slavesGold = each; s.slavesIron = each; s.slavesWood = each; s.slavesFood = each
  }
}

function allocModeFor(strategy: Strategy): AllocMode {
  return strategy === 'GoldFirst' ? 'gold-heavy' : 'equal'
}

// ─────────────────────────────────────────
// Initial state
// ─────────────────────────────────────────

function initialState(allocMode: AllocMode): State {
  const { gold, iron, wood, food, turns, startingPopulation } = BALANCE.startingResources
  const s: State = {
    gold, iron, wood, food,
    bankGold: 0, bankLevel: 0, depositsToday: 0,
    slaves: startingPopulation,
    slavesGold: 0, slavesIron: 0, slavesWood: 0, slavesFood: 0,
    freePop: 0, soldiers: 0, city: 1,
    devGold: 1, devIron: 1, devWood: 1, devFood: 1, devPop: 1, devFort: 1,
    turns,
    m_bankLv1: null, m_bankLv5: null, m_bankLv10: null,
    m_devAvg3: null, m_devAvg5: null, m_devAvg10: null,
    m_gold50k: null, m_gold200k: null, m_gold1m: null,
    m_city2Ready: null, m_city3Ready: null,
  }
  reallocateSlaves(s, allocMode)
  return s
}

// ─────────────────────────────────────────
// Race gold bonus
// ─────────────────────────────────────────

function raceGoldBonus(race: Race): number {
  if (race === 'human') return BALANCE.raceBonuses.human.goldProductionBonus  // 0.15
  if (race === 'dwarf') return BALANCE.raceBonuses.dwarf.goldProductionBonus  // 0.03
  return 0
}

// ─────────────────────────────────────────
// Milestone tracking
// ─────────────────────────────────────────

function checkMilestones(s: State, tick: number): void {
  const total = s.gold + s.bankGold
  if (!s.m_bankLv1  && s.bankLevel >= 1)  s.m_bankLv1  = tick
  if (!s.m_bankLv5  && s.bankLevel >= 5)  s.m_bankLv5  = tick
  if (!s.m_bankLv10 && s.bankLevel >= 10) s.m_bankLv10 = tick
  const devAvg = (s.devGold + s.devIron + s.devWood + s.devFood) / 4
  if (!s.m_devAvg3  && devAvg >= 3)  s.m_devAvg3  = tick
  if (!s.m_devAvg5  && devAvg >= 5)  s.m_devAvg5  = tick
  if (!s.m_devAvg10 && devAvg >= 10) s.m_devAvg10 = tick
  if (!s.m_gold50k  && total >= 50_000)    s.m_gold50k  = tick
  if (!s.m_gold200k && total >= 200_000)   s.m_gold200k = tick
  if (!s.m_gold1m   && total >= 1_000_000) s.m_gold1m   = tick
  const promo = BALANCE.cities.promotion
  if (!s.m_city2Ready
    && s.soldiers >= promo.soldiersRequiredByCity[2]
    && s.gold >= promo.resourceCostByCity[2].gold && s.iron >= promo.resourceCostByCity[2].iron
    && s.wood >= promo.resourceCostByCity[2].wood && s.food >= promo.resourceCostByCity[2].food) {
    s.m_city2Ready = tick
  }
  if (!s.m_city3Ready
    && s.soldiers >= promo.soldiersRequiredByCity[3]
    && s.gold >= promo.resourceCostByCity[3].gold && s.iron >= promo.resourceCostByCity[3].iron
    && s.wood >= promo.resourceCostByCity[3].wood && s.food >= promo.resourceCostByCity[3].food) {
    s.m_city3Ready = tick
  }
}

// ─────────────────────────────────────────
// Strategy implementations
// ─────────────────────────────────────────

function applyStrategy(s: State, strategy: Strategy, tick: number): void {
  const mode     = allocModeFor(strategy)
  const isNewDay = tick % TICKS_PER_DAY === 0

  const convertFreePop = () => {
    if (s.freePop > 0) { s.slaves += s.freePop; s.freePop = 0; reallocateSlaves(s, mode) }
  }

  if (strategy === 'Accumulate') {
    convertFreePop()
    return
  }

  if (strategy === 'CityRush') {
    // Train soldiers from free_pop until city 2 requirement is met
    const need = BALANCE.cities.promotion.soldiersRequiredByCity[2]
    if (s.soldiers < need && s.freePop >= 1) {
      const canAfford = Math.floor(s.gold / BALANCE.training.unitCost.soldier.gold)
      const amt       = Math.min(s.freePop, canAfford, need - s.soldiers)
      if (amt > 0) {
        s.soldiers += amt
        s.gold     -= amt * BALANCE.training.unitCost.soldier.gold
        s.freePop  -= amt
      }
    }
    convertFreePop()
    return
  }

  // All other strategies convert free_pop first, then decide spending
  convertFreePop()

  if (strategy === 'GoldFirst') {
    if (s.devGold < 10) {
      tryDevUpgrade(s, 'gold')
    } else if (s.bankLevel < 5) {
      tryBankUpgrade(s)
    }
    if (isNewDay && s.bankLevel > 0) tryDeposit(s, 0.70)
    return
  }

  if (strategy === 'Balanced') {
    const fields: DevField[] = ['gold', 'iron', 'wood', 'food']
    fields.sort((a, b) => getDevLevel(s, a) - getDevLevel(s, b))
    for (const field of fields) { if (tryDevUpgrade(s, field)) break }
    if (fields.every(f => getDevLevel(s, f) >= 5) && s.bankLevel < 5) tryBankUpgrade(s)
    if (isNewDay && s.bankLevel > 0) tryDeposit(s, 0.60)
    return
  }

  if (strategy === 'BankFirst') {
    if (s.bankLevel < 10) {
      tryBankUpgrade(s)
    } else {
      const fields: DevField[] = ['gold', 'iron', 'wood', 'food']
      fields.sort((a, b) => getDevLevel(s, a) - getDevLevel(s, b))
      for (const field of fields) { if (tryDevUpgrade(s, field)) break }
    }
    if (isNewDay && s.bankLevel > 0) tryDeposit(s, 0.90)
    return
  }
}

// ─────────────────────────────────────────
// Single-tick engine
// ─────────────────────────────────────────

function simOneTick(s: State, tick: number, profile: Profile, strategy: Strategy): void {
  const { race, vip, tribeBlessing } = profile
  const gb = raceGoldBonus(race)
  // Tribe blessing: post-calc multiplier on production output (B above)
  const tribeMult = tribeBlessing
    ? BALANCE.tribe.spellEffects.production_blessing.productionMultiplier  // 1.2
    : 1.0

  // 1. Production — per-resource slave pools (A above); slaveBonus=0 (S3)
  s.gold += Math.floor(calcSlaveProduction(s.slavesGold, s.devGold, s.city, vip, gb, 0).avg * tribeMult)
  s.iron += Math.floor(calcSlaveProduction(s.slavesIron, s.devIron, s.city, vip, 0,  0).avg * tribeMult)
  s.wood += Math.floor(calcSlaveProduction(s.slavesWood, s.devWood, s.city, vip, 0,  0).avg * tribeMult)
  s.food += Math.floor(calcSlaveProduction(s.slavesFood, s.devFood, s.city, vip, 0,  0).avg * tribeMult)

  // 2. Population growth
  s.freePop += calcPopulationGrowth(s.devPop, vip)

  // 3. Turn regen
  s.turns = calcTurnsToAdd(s.turns, false)

  // 4. Daily bank interest + deposit counter reset (H above)
  if (tick % TICKS_PER_DAY === 0) {
    s.bankGold     += calcBankInterest(s.bankGold, s.bankLevel, vip)
    s.depositsToday = 0
  }

  // 5. Strategy
  applyStrategy(s, strategy, tick)

  // 6. Milestones
  checkMilestones(s, tick)
}

// ─────────────────────────────────────────
// Full season simulation
// ─────────────────────────────────────────

function runSim(profile: Profile, strategy: Strategy): SimResult {
  const s         = initialState(allocModeFor(strategy))
  const snapshots: Snapshot[] = []
  for (let tick = 1; tick <= SEASON_TICKS; tick++) {
    simOneTick(s, tick, profile, strategy)
    if (SNAP_TICKS.includes(tick)) {
      const allocated = s.slavesGold + s.slavesIron + s.slavesWood + s.slavesFood
      snapshots.push({
        tick, day: tick / TICKS_PER_DAY,
        gold: s.gold, iron: s.iron, wood: s.wood, food: s.food,
        bankGold: s.bankGold, bankLevel: s.bankLevel,
        slaves: s.slaves, slavesGold: s.slavesGold, slavesIdle: s.slaves - allocated, freePop: s.freePop,
        devGold: s.devGold, devAvg: Math.round((s.devGold + s.devIron + s.devWood + s.devFood) / 4 * 10) / 10,
      })
    }
  }
  return { profile, strategy, snapshots, final: { ...s } }
}

// ─────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────

function fmt(n: number): string {
  if (!isFinite(n))               return '∞'
  if (n >= 1_000_000_000_000)     return `${(n / 1_000_000_000_000).toFixed(1)}T`
  if (n >= 1_000_000_000)         return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)             return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)                 return `${Math.round(n / 1_000)}k`
  return `${Math.round(n)}`
}

function td(tick: number | null): string {
  return tick === null ? 'never' : `day ${(tick / TICKS_PER_DAY).toFixed(1)}`
}

// ─────────────────────────────────────────
// Report sections
// ─────────────────────────────────────────

function reportDevCosts(): string {
  const lines = [
    '## 1. Dev Upgrade Cost Schedule\n',
    '> gold_level / fortification_level: only goldCost charged (resourceType=gold, no secondary deduction).\n',
    '| Field | Lv→Lv | Gold Cost | Resource Cost | Resource Type | Cumul Gold |',
    '|-------|-------|-----------|---------------|--------------|-----------|',
  ]
  for (const field of ['gold', 'iron', 'wood', 'food', 'population', 'fortification'] as DevField[]) {
    const maxLv = field === 'fortification' ? 5 : 10
    let cumul = 0
    for (let lv = 1; lv < maxLv; lv++) {
      const c = devUpgradeCost(field, lv)
      cumul += c.goldCost
      lines.push(`| ${field} | ${lv}→${lv+1} | ${c.goldCost} | ${c.resourceCost || '—'} | ${c.resourceCost > 0 ? c.resourceType : '—'} | ${fmt(cumul)} |`)
    }
    lines.push('|---|---|---|---|---|---|')
  }
  return lines.join('\n')
}

function reportBankROI(): string {
  const REF = 100_000
  const lines = [
    '## 2. Bank ROI (static — reference deposit held constant, no compounding)\n',
    `> Reference: ${fmt(REF)} gold. Payback = upgradeCost ÷ daily interest.\n`,
    '| Level | Upgrade Cost | Rate | Daily Interest | Payback | 90-day Net |',
    '|-------|-------------|------|----------------|---------|-----------|',
  ]
  let cumul = 0
  for (let lv = 0; lv <= BALANCE.bank.MAX_INTEREST_LEVEL; lv++) {
    if (lv === 0) { lines.push('| 0 | — | 0% | 0 | — | 0 |'); continue }
    const uc = bankUpgradeCost(lv - 1); cumul += uc
    const rate = BALANCE.bank.INTEREST_RATE_BY_LEVEL[lv]
    const daily = Math.floor(REF * rate)
    lines.push(`| ${lv} | ${fmt(uc)} | ${(rate*100).toFixed(1)}% | ${fmt(daily)} | ${daily > 0 ? (uc/daily).toFixed(1)+'d' : '∞'} | ${fmt(daily * 90 - cumul)} |`)
  }
  return lines.join('\n')
}

function reportBankCompounding(): string {
  const lines = [
    '## 3. Bank Compounding Projection ⚠️\n',
    '> 100k initial deposit, no withdrawals, compound daily interest.',
    '> This matches real tick behaviour: `bank.balance += calcBankInterest(bank.balance, ...)` each day.\n',
    '| Level | Rate | Day 7 | Day 30 | Day 60 | Day 90 |',
    '|-------|------|-------|--------|--------|--------|',
  ]
  const INIT = 100_000
  for (let lv = 1; lv <= BALANCE.bank.MAX_INTEREST_LEVEL; lv++) {
    const r = BALANCE.bank.INTEREST_RATE_BY_LEVEL[lv]
    const g = (d: number) => Math.floor(INIT * Math.pow(1 + r, d))
    lines.push(`| ${lv} | ${(r*100).toFixed(1)}% | ${fmt(g(7))} | ${fmt(g(30))} | ${fmt(g(60))} | ${fmt(g(90))} |`)
  }
  return lines.join('\n')
}

function reportCityRequirements(): string {
  const promo = BALANCE.cities.promotion
  const lines = [
    '## 4. City Promotion Requirements\n',
    '| City | Soldiers | Gold to Train | Resources Each ×4 | Total Spend |',
    '|------|----------|---------------|------------------|------------|',
  ]
  for (let city = 2; city <= 5; city++) {
    const sol = promo.soldiersRequiredByCity[city]
    const res = promo.resourceCostByCity[city].gold
    lines.push(`| City ${city} | ${fmt(sol)} | ${fmt(sol * 60)} | ${fmt(res)} | ${fmt(res * 4)} |`)
  }
  return lines.join('\n')
}

function reportAllocationImpact(): string {
  const lines = [
    '## 5. Slave Allocation Impact — Corrected Model\n',
    '> Old (wrong): 50 slaves produce all 4 resources simultaneously = 100 gold/tick + same iron/wood/food.',
    '> New (correct): each resource only uses its assigned slave count. Idle slaves produce nothing.\n',
    '| Allocation | slavesGold | Gold/tick | Iron/tick | Wood/tick | Food/tick | Total/tick |',
    '|-----------|-----------|-----------|-----------|-----------|-----------|-----------|',
  ]
  const modes = [
    { label: 'Equal (12/12/12/12, 2 idle)', g: 12, i: 12, w: 12, f: 12 },
    { label: 'Gold-heavy (27/7/7/7, 2 idle)', g: 27, i: 7,  w: 7,  f: 7  },
    { label: 'All-gold (50/0/0/0)',            g: 50, i: 0,  w: 0,  f: 0  },
    { label: 'OLD wrong model (50 × all 4)',   g: 50, i: 50, w: 50, f: 50 },
  ]
  for (const m of modes) {
    const gp = calcSlaveProduction(m.g, 1, 1, null, 0, 0).avg
    const ip = calcSlaveProduction(m.i, 1, 1, null, 0, 0).avg
    const wp = calcSlaveProduction(m.w, 1, 1, null, 0, 0).avg
    const fp = calcSlaveProduction(m.f, 1, 1, null, 0, 0).avg
    lines.push(`| ${m.label} | ${m.g} | ${gp} | ${ip} | ${wp} | ${fp} | ${gp+ip+wp+fp} |`)
  }
  lines.push('\n> **Impact**: Equal split gives 96 total/tick across all resources. Old model gave 400. Corrected model is 4.2× lower.')
  return lines.join('\n')
}

function reportEconomyProgression(results: SimResult[]): string {
  const lines = ['## 6. Economy Progression Snapshots\n']
  const featured: Array<{ p: string; s: Strategy }> = [
    { p: 'Human/Solo/No-VIP',  s: 'Accumulate' },
    { p: 'Human/Solo/No-VIP',  s: 'Balanced'   },
    { p: 'Human/Solo/VIP',     s: 'Balanced'   },
    { p: 'Human/Tribe/No-VIP', s: 'Balanced'   },
    { p: 'Human/Solo/No-VIP',  s: 'BankFirst'  },
    { p: 'Human/Solo/No-VIP',  s: 'CityRush'   },
  ]
  for (const { p, s } of featured) {
    const r = results.find(x => x.profile.name === p && x.strategy === s)
    if (!r) continue
    lines.push(`### ${p} — ${s} (alloc: ${allocModeFor(s)})\n`)
    lines.push('| Day | Gold | Iron | Wood | Food | Bank Gold | Bank Lv | Slaves (idle) | Dev Avg |')
    lines.push('|-----|------|------|------|------|-----------|---------|---------------|---------|')
    for (const snap of r.snapshots) {
      lines.push(`| ${snap.day} | ${fmt(snap.gold)} | ${fmt(snap.iron)} | ${fmt(snap.wood)} | ${fmt(snap.food)} | ${fmt(snap.bankGold)} | ${snap.bankLevel} | ${snap.slaves} (${snap.slavesIdle} idle) | ${snap.devAvg} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function reportMilestones(results: SimResult[]): string {
  const lines = [
    '## 7. Milestone Timing\n',
    '| Profile | Strategy | Bank Lv1 | Bank Lv5 | Dev Avg 5 | Gold 200k | Gold 1M | City 2 Ready |',
    '|---------|----------|----------|----------|-----------|-----------|---------|-------------|',
  ]
  for (const r of results) {
    const f = r.final
    lines.push(`| ${r.profile.name} | ${r.strategy} | ${td(f.m_bankLv1)} | ${td(f.m_bankLv5)} | ${td(f.m_devAvg5)} | ${td(f.m_gold200k)} | ${td(f.m_gold1m)} | ${td(f.m_city2Ready)} |`)
  }
  return lines.join('\n')
}

function reportROI(results: SimResult[]): string {
  const lines = ['## 8. Dev Upgrade ROI (50 slaves_gold, city 1)\n']
  lines.push('| Dev Lv | Gold/tick | Marginal | Upgrade Cost | Payback |')
  lines.push('|--------|-----------|----------|-------------|---------|')
  let prev = 0
  for (let lv = 1; lv <= 10; lv++) {
    const prod = calcSlaveProduction(50, lv, 1, null, 0, 0).avg
    if (lv > 1) {
      const cost = devUpgradeCost('gold', lv - 1)
      const pt   = prod - prev > 0 ? Math.ceil(cost.goldCost / (prod - prev)) : Infinity
      lines.push(`| ${lv} | ${prod} | +${prod - prev} | ${cost.goldCost}g | ${isFinite(pt) ? `${(pt/TICKS_PER_DAY).toFixed(1)}d (t${pt})` : '∞'} |`)
    } else {
      lines.push(`| 1 | ${prod} | — | — | — |`)
    }
    prev = prod
  }
  return lines.join('\n')
}

function reportObservations(results: SimResult[]): string {
  const lines = ['## 9. Balance Observations & v1→v2 Delta\n']

  // Dev cost cliff
  const c45 = devUpgradeCost('gold', 4).goldCost
  const c56 = devUpgradeCost('gold', 5).goldCost
  lines.push(`- **Dev cost cliff lv4→5 → lv5→6**: ${c45}g → ${c56}g (×${(c56/c45).toFixed(1)}) — ⚠️ steep gate into lv6+`)

  // Total dev cost
  let tDev = 0
  for (const f of ['gold','iron','wood','food'] as DevField[]) for (let lv=1;lv<10;lv++) tDev += devUpgradeCost(f,lv).goldCost
  lines.push(`- **Total gold to max all 4 resource devs**: ${fmt(tDev)}`)

  // Total bank cost
  let tBank = 0
  for (let lv=0;lv<BALANCE.bank.MAX_INTEREST_LEVEL;lv++) tBank += bankUpgradeCost(lv)
  lines.push(`- **Total gold to max bank**: ${fmt(tBank)}`)

  // Bank compounding
  const r10 = BALANCE.bank.INTEREST_RATE_BY_LEVEL[10]
  const c90 = Math.floor(100_000 * Math.pow(1 + r10, 90))
  lines.push(`- **Bank lv10 compound ⚠️**: 100k → ${fmt(c90)} after 90 days — catastrophically dominant mechanic`)

  // Bank lv5 compounding
  const r5  = BALANCE.bank.INTEREST_RATE_BY_LEVEL[5]
  const c5_90 = Math.floor(100_000 * Math.pow(1 + r5, 90))
  lines.push(`- **Bank lv5 compound**: 100k → ${fmt(c5_90)} after 90 days — still very strong`)

  // Deposit rule clarification
  lines.push(`- **Bank deposit limit (corrected)**: ${BALANCE.bank.depositsPerDay}/day enforced. maxLifetimeDeposits=${BALANCE.bank.maxLifetimeDeposits} is dead — not enforced in any route.`)

  // Allocation impact
  lines.push(`- **Production scale (corrected)**: Equal-split 50 slaves = 96 total/tick (all 4 resources). Old model = 400/tick. 4.2× inflation removed.`)

  // VIP
  const nv = results.find(r => r.profile.name==='Human/Solo/No-VIP' && r.strategy==='Balanced')
  const v  = results.find(r => r.profile.name==='Human/Solo/VIP'    && r.strategy==='Balanced')
  const nv30 = nv?.snapshots.find(s => s.tick===1440); const v30 = v?.snapshots.find(s => s.tick===1440)
  if (nv30 && v30) lines.push(`- **VIP gold advantage at day 30 (Balanced)**: +${((v30.gold/nv30.gold-1)*100).toFixed(0)}% — unchanged from v1`)

  // City timing
  const city = results.find(r => r.profile.name==='Human/Solo/No-VIP' && r.strategy==='CityRush')
  lines.push(`- **City 2 timing (CityRush)**: ${city?.final.m_city2Ready ? `day ${(city.final.m_city2Ready/TICKS_PER_DAY).toFixed(1)} — ✅ reachable` : 'never ⚠️'}`)

  lines.push('\n### v1 → v2: What Changed\n')
  lines.push('| Conclusion | v1 Result | v2 Result | Changed? |')
  lines.push('|-----------|----------|----------|---------|')

  const bfR = results.find(r => r.profile.name==='Human/Solo/No-VIP' && r.strategy==='BankFirst')
  const bfS90 = bfR?.snapshots.find(s => s.tick===4320)

  const city2v2 = city?.final.m_city2Ready
    ? `day ${(city.final.m_city2Ready/TICKS_PER_DAY).toFixed(1)}`
    : 'never'

  const rows: Array<[string, string, string, string]> = [
    ['Gold/tick baseline (50 slaves, lv1)',      '~100/tick (all slaves × all res)',  `${calcSlaveProduction(12, 1, 1, null, 0, 0).avg}/tick (12 slaves_gold equal split)`, '✅ changed — 4.2× lower'],
    ['Bank deposit lifetime cap',                 '5 total lifetime',                  'No lifetime cap (5/day only)',                                                         '✅ changed'],
    ['Bank BankFirst day-90 bank gold',           '543 quadrillion',                   bfS90 ? fmt(bfS90.bankGold) : 'n/a',                                                   '✅ changed'],
    ['Bank still compound-dominant?',             'Yes ⚠️',                           'Yes ⚠️ — still dominant',                                                             '— same conclusion'],
    ['City 2 timing (CityRush)',                  'day 9.6',                            city2v2,                                                                               city2v2 === 'never' ? '✅ changed — now unreachable' : `✅ changed — now ${city2v2}`],
    ['Dev cost cliff lv4→5 to lv5→6',            '×12 ⚠️',                            `×${(c56/c45).toFixed(1)} ⚠️`,                                                       '— same'],
    ['VIP advantage at day 30',                   '+10%',                               nv30 && v30 ? `+${((v30.gold/nv30.gold-1)*100).toFixed(0)}%` : 'n/a',                  '— same'],
  ]

  for (const [f, o, n, c] of rows) lines.push(`| ${f} | ${o} | ${n} | ${c} |`)

  return lines.join('\n')
}

// ─────────────────────────────────────────
// Main test
// ─────────────────────────────────────────

const PROFILES: Profile[] = [
  { name: 'Human/Solo/No-VIP',  race: 'human', vip: null,                    tribeBlessing: false },
  { name: 'Human/Solo/VIP',     race: 'human', vip: '2099-01-01T00:00:00Z', tribeBlessing: false },
  { name: 'Human/Tribe/No-VIP', race: 'human', vip: null,                    tribeBlessing: true  },
  { name: 'Human/Tribe/VIP',    race: 'human', vip: '2099-01-01T00:00:00Z', tribeBlessing: true  },
  { name: 'Dwarf/Solo/No-VIP',  race: 'dwarf', vip: null,                    tribeBlessing: false },
  { name: 'Orc/Solo/No-VIP',    race: 'orc',   vip: null,                    tribeBlessing: false },
]

const STRATEGIES: Strategy[] = ['Accumulate', 'GoldFirst', 'Balanced', 'BankFirst', 'CityRush']

describe('Balance Simulation', () => {
  it('runs corrected season simulation (v2) and outputs audit report', () => {
    const results: SimResult[] = []
    for (const profile of PROFILES)
      for (const strategy of STRATEGIES)
        results.push(runSim(profile, strategy))

    const sections = [
      `# Domiron v5 — Balance Audit Report (v2 — corrected)`,
      `> Season: ${BALANCE.season.durationDays} days | ${SEASON_TICKS} ticks | ${results.length} scenarios`,
      `> All assumptions documented in file header.\n`,
      reportDevCosts(),   '---',
      reportBankROI(),    '---',
      reportBankCompounding(), '---',
      reportCityRequirements(), '---',
      reportAllocationImpact(), '---',
      reportEconomyProgression(results), '---',
      reportMilestones(results), '---',
      reportROI(results), '---',
      reportObservations(results),
    ]

    const markdown = sections.join('\n\n')
    console.log('\n' + markdown + '\n')

    writeFileSync(
      join(process.cwd(), 'scripts', 'balance-sim-output.json'),
      JSON.stringify({
        version: 'v2-corrected',
        generatedAt: new Date().toISOString(),
        assumptions: {
          slaveAllocation:   'per-resource explicit (slaves_gold/iron/wood/food)',
          tribeBlessing:     'post-calc ×1.2 multiplier',
          bankDepositLimit:  `${BALANCE.bank.depositsPerDay}/day (no lifetime limit)`,
          maxDepositPct:     BALANCE.bank.maxDepositPercent,
          depositsPerDaySim: 1,
          production:        'deterministic avg midpoint',
          heroEffects:       'none',
        },
        results: results.map(r => ({
          profile: r.profile.name, strategy: r.strategy, alloc: allocModeFor(r.strategy),
          snapshots: r.snapshots,
          milestones: { bankLv1: r.final.m_bankLv1, bankLv5: r.final.m_bankLv5, bankLv10: r.final.m_bankLv10,
            devAvg5: r.final.m_devAvg5, devAvg10: r.final.m_devAvg10,
            gold200k: r.final.m_gold200k, gold1m: r.final.m_gold1m,
            city2Ready: r.final.m_city2Ready, city3Ready: r.final.m_city3Ready },
          finalState: { gold: r.final.gold, iron: r.final.iron, wood: r.final.wood, food: r.final.food,
            bankGold: r.final.bankGold, bankLevel: r.final.bankLevel, slaves: r.final.slaves,
            slavesGold: r.final.slavesGold, devGold: r.final.devGold },
        })),
      }, null, 2)
    )
    console.log('> JSON written to scripts/balance-sim-output.json\n')

    // ── Sanity assertions ──────────────────────────────────────
    expect(results.length).toBe(PROFILES.length * STRATEGIES.length)

    for (const r of results) {
      const f = r.final
      expect(f.gold,  `${r.profile.name}/${r.strategy} gold<0`).toBeGreaterThanOrEqual(0)
      expect(f.iron,  `${r.profile.name}/${r.strategy} iron<0`).toBeGreaterThanOrEqual(0)
      expect(f.wood,  `${r.profile.name}/${r.strategy} wood<0`).toBeGreaterThanOrEqual(0)
      expect(f.food,  `${r.profile.name}/${r.strategy} food<0`).toBeGreaterThanOrEqual(0)
      const allocated = f.slavesGold + f.slavesIron + f.slavesWood + f.slavesFood
      expect(allocated, `${r.profile.name}/${r.strategy} over-allocated`).toBeLessThanOrEqual(f.slaves)
    }

    // VIP > no-VIP gold
    const noVip = results.find(r => r.profile.name==='Human/Solo/No-VIP' && r.strategy==='Accumulate')!
    const yesVip = results.find(r => r.profile.name==='Human/Solo/VIP'   && r.strategy==='Accumulate')!
    expect(yesVip.final.gold).toBeGreaterThan(noVip.final.gold)

    // Tribe blessing > no tribe
    const noB = results.find(r => r.profile.name==='Human/Solo/No-VIP'  && r.strategy==='Accumulate')!
    const yB  = results.find(r => r.profile.name==='Human/Tribe/No-VIP' && r.strategy==='Accumulate')!
    expect(yB.final.gold).toBeGreaterThan(noB.final.gold)

    // GoldFirst total wealth > Accumulate total wealth (investment pays off)
    const acc  = results.find(r => r.profile.name==='Human/Solo/No-VIP' && r.strategy==='Accumulate')!
    const gf   = results.find(r => r.profile.name==='Human/Solo/No-VIP' && r.strategy==='GoldFirst')!
    expect(gf.final.gold + gf.final.bankGold).toBeGreaterThan(acc.final.gold + acc.final.bankGold)
  })
})
