/**
 * BALANCE config smoke tests (Step D — lightweight)
 *
 * These tests guard against config shape regressions.
 * They validate every BALANCE path referenced in the UI/API layers.
 *
 * Run: npx vitest run lib/game/balance.test.ts
 *
 * For full page render smoke tests, add Playwright:
 *   npm install --save-dev @playwright/test
 *   npx playwright test
 */
import { describe, it, expect } from 'vitest'
import { BALANCE } from '@/lib/game/balance'

describe('BALANCE config smoke — all UI-referenced paths exist', () => {

  // ── tick ──────────────────────────────────────────────────────────────────
  it('tick paths', () => {
    expect(typeof BALANCE.tick.maxTurns).toBe('number')
    expect(typeof BALANCE.tick.turnsPerTick).toBe('number')
    expect(typeof BALANCE.tick.intervalMinutes).toBe('number')
  })

  // ── combat ────────────────────────────────────────────────────────────────
  it('combat paths', () => {
    expect(typeof BALANCE.combat.foodCostPerTurn).toBe('number')
    expect(typeof BALANCE.combat.WIN_THRESHOLD).toBe('number')
    expect(typeof BALANCE.combat.cavalryMultiplier).toBe('number')
    expect(typeof BALANCE.combat.KILL_COOLDOWN_HOURS).toBe('number')
    expect(typeof BALANCE.combat.BASE_LOOT_RATE).toBe('number')
    expect(typeof BALANCE.combat.CAPTURE_RATE).toBe('number')
  })

  // ── training ──────────────────────────────────────────────────────────────
  it('training paths used by TrainingClient', () => {
    expect(typeof BALANCE.training.advancedCost.gold).toBe('number')
    expect(typeof BALANCE.training.advancedCost.food).toBe('number')
    expect(typeof BALANCE.training.advancedMultiplierPerLevel).toBe('number')
    expect(typeof BALANCE.training.unitCost.soldier.gold).toBe('number')
    expect(typeof BALANCE.training.unitCost.cavalry.soldierRatio).toBe('number')
    expect(typeof BALANCE.training.populationPerTick[1]).toBe('number')
    // Note: baseCapacity / capacityPerDevelopmentLevel removed — no capacity cap on units
  })

  // ── production ────────────────────────────────────────────────────────────
  it('production paths used by DevelopClient + MineClient', () => {
    expect(typeof BALANCE.production.baseMin).toBe('number')
    expect(typeof BALANCE.production.baseMax).toBe('number')
    expect(typeof BALANCE.production.developmentUpgradeCost.level2.gold).toBe('number')
    expect(typeof BALANCE.production.developmentUpgradeCost.level10.resource).toBe('number')
  })

  // ── hero ──────────────────────────────────────────────────────────────────
  it('hero paths used by HeroClient', () => {
    expect(typeof BALANCE.hero.SOLDIER_SHIELD_MANA).toBe('number')
    expect(typeof BALANCE.hero.RESOURCE_SHIELD_MANA).toBe('number')
    expect(typeof BALANCE.hero.SHIELD_ACTIVE_HOURS).toBe('number')
    expect(typeof BALANCE.hero.SHIELD_COOLDOWN_HOURS).toBe('number')
    expect(typeof BALANCE.hero.xpPerLevel).toBe('number')
    expect(typeof BALANCE.hero.manaPerTick.base).toBe('number')
    expect(typeof BALANCE.hero.MAX_STACK_RATE).toBe('number')
    expect(typeof BALANCE.hero.EFFECT_RATES.ATTACK_POWER_10).toBe('number')
    expect(typeof BALANCE.hero.EFFECT_RATES.DEFENSE_POWER_10).toBe('number')
    expect(typeof BALANCE.hero.EFFECT_RATES.SLAVE_OUTPUT_10).toBe('number')
  })

  // ── bank ──────────────────────────────────────────────────────────────────
  it('bank paths used by BankClient', () => {
    expect(typeof BALANCE.bank.theftProtection).toBe('number')
    expect(typeof BALANCE.bank.depositsPerDay).toBe('number')
    expect(typeof BALANCE.bank.maxDepositPercent).toBe('number')
    expect(typeof BALANCE.bank.upgradeBaseCost).toBe('number')
  })

  // ── cities ────────────────────────────────────────────────────────────────
  it('cities paths — names exist for all 5 cities', () => {
    expect(BALANCE.cities.total).toBe(5)
    for (let i = 1; i <= 5; i++) {
      expect(typeof BALANCE.cities.names[i]).toBe('string')
    }
  })

  // ── tribe ─────────────────────────────────────────────────────────────────
  it('tribe paths used by TribeClient + tick', () => {
    expect(typeof BALANCE.tribe.spells.combat_boost.manaCost).toBe('number')
    expect(typeof BALANCE.tribe.spells.mass_spy.manaCost).toBe('number')
    expect(typeof BALANCE.tribe.taxLimits.city1).toBe('number')
    expect(typeof BALANCE.tribe.manaPerMemberPerTick).toBe('number')
  })

  // ── weapons ───────────────────────────────────────────────────────────────
  it('weapons paths used by ShopClient', () => {
    expect(typeof BALANCE.weapons.attack.slingshot.power).toBe('number')
    expect(typeof BALANCE.weapons.defense.wood_shield.multiplier).toBe('number')
    expect(typeof BALANCE.weapons.spy.shadow_cloak.costGold).toBe('number')
    expect(typeof BALANCE.weapons.scout.scout_boots.costGold).toBe('number')
    expect(typeof BALANCE.weapons.sellRefundPercent).toBe('number')
  })

  // ── antiFarm ──────────────────────────────────────────────────────────────
  it('antiFarm paths', () => {
    expect(BALANCE.antiFarm.LOOT_DECAY_STEPS).toHaveLength(5)
    expect(typeof BALANCE.antiFarm.DECAY_WINDOW_HOURS).toBe('number')
  })

  // ── clan ──────────────────────────────────────────────────────────────────
  it('clan paths', () => {
    expect(typeof BALANCE.clan.maxMembers).toBe('number')
    expect(typeof BALANCE.clan.BONUS_CAP_RATE).toBe('number')
    expect(typeof BALANCE.clan.EFFICIENCY[1]).toBe('number')
    expect(typeof BALANCE.clan.EFFICIENCY[5]).toBe('number')
  })

  // ── vip ───────────────────────────────────────────────────────────────────
  it('vip paths', () => {
    expect(typeof BALANCE.vip.productionMultiplier).toBe('number')
    expect(typeof BALANCE.vip.weeklyTurnsBonus).toBe('number')
    expect(typeof BALANCE.vip.crystalCost).toBe('number')
  })

  // ── raceBonuses ───────────────────────────────────────────────────────────
  it('raceBonuses used in power.ts', () => {
    expect(typeof BALANCE.raceBonuses.orc.attackBonus).toBe('number')
    expect(typeof BALANCE.raceBonuses.human.goldProductionBonus).toBe('number')
    expect(typeof BALANCE.raceBonuses.elf.spyBonus).toBe('number')
    expect(typeof BALANCE.raceBonuses.dwarf.defenseBonus).toBe('number')
  })

})
