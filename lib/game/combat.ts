/**
 * Domiron — Combat Formula Logic
 * All numbers come from BALANCE — never hardcoded here.
 */
import { BALANCE } from '@/lib/game/balance'
import type { Army, Weapons, Training, Development, Player, AttackOutcome } from '@/types/game'

interface CombatStats {
  army: Army
  weapons: Weapons
  training: Training
  development: Development
  player: Player
  tribeDefenseBonus?: number
}

// Calculate total weapon power for attack weapons
function calcAttackWeaponPower(weapons: Weapons): number {
  const w = BALANCE.weapons.attack
  return (
    weapons.slingshot    * w.slingshot.power    +
    weapons.boomerang    * w.boomerang.power    +
    weapons.pirate_knife * w.pirate_knife.power +
    weapons.axe          * w.axe.power          +
    weapons.master_knife * w.master_knife.power +
    weapons.knight_axe   * w.knight_axe.power   +
    weapons.iron_ball    * w.iron_ball.power
  )
}

// Calculate defense multiplier from defense weapons (stacks multiplicatively)
function calcDefenseWeaponMultiplier(weapons: Weapons): number {
  const w = BALANCE.weapons.defense
  let multiplier = 1.0
  if (weapons.wood_shield   > 0) multiplier *= w.wood_shield.multiplier
  if (weapons.iron_shield   > 0) multiplier *= w.iron_shield.multiplier
  if (weapons.leather_armor > 0) multiplier *= w.leather_armor.multiplier
  if (weapons.chain_armor   > 0) multiplier *= w.chain_armor.multiplier
  if (weapons.plate_armor   > 0) multiplier *= w.plate_armor.multiplier
  if (weapons.mithril_armor > 0) multiplier *= w.mithril_armor.multiplier
  if (weapons.gods_armor    > 0) multiplier *= w.gods_armor.multiplier
  return multiplier
}

// Training multiplier: 1 + (level × 0.08)
function trainingMultiplier(level: number): number {
  return 1 + level * BALANCE.training.advanced.multiplierPerLevel
}

// Turn bonus: +15% for turns 1-5, +12% for turns 6-10
function calcTurnBonus(turns: number): number {
  const { turns1to5, turns6to10 } = BALANCE.combat.turnBonus
  let bonus = 1.0
  for (let i = 1; i <= turns; i++) {
    bonus += i <= 5 ? turns1to5 : turns6to10
  }
  return bonus
}

// Race attack bonus multiplier
function getRaceAttackBonus(race: string): number {
  const r = BALANCE.raceBonuses
  if (race === 'orc')   return 1 + r.orc.attackBonus
  if (race === 'human') return 1 + r.human.attackBonus
  return 1.0
}

// Race defense bonus multiplier
function getRaceDefenseBonus(race: string): number {
  const r = BALANCE.raceBonuses
  if (race === 'orc')   return 1 + r.orc.defenseBonus
  if (race === 'dwarf') return 1 + r.dwarf.defenseBonus
  return 1.0
}

// Fortification multiplier: +10% defense per level
function fortificationMultiplier(level: number): number {
  return 1 + (level - 1) * 0.10
}

// Random factor within [min, max]
function randomFactor(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function calculateAttackPower(
  attacker: CombatStats,
  turnsUsed: number
): number {
  const baseUnits = attacker.army.soldiers + attacker.army.cavalry * BALANCE.combat.cavalryMultiplier
  const weaponPower = calcAttackWeaponPower(attacker.weapons)
  const turnBonus = calcTurnBonus(turnsUsed)
  const trainMult = trainingMultiplier(attacker.training.attack_level)
  const raceMult = getRaceAttackBonus(attacker.player.race)
  const rng = randomFactor(BALANCE.combat.randomRange.min, BALANCE.combat.randomRange.max)

  return Math.floor(
    (baseUnits + weaponPower) * trainMult * turnBonus * raceMult * rng
  )
}

export function calculateDefensePower(
  defender: CombatStats
): number {
  const baseUnits = defender.army.soldiers + defender.army.cavalry * BALANCE.combat.cavalryMultiplier
  const weaponMult = calcDefenseWeaponMultiplier(defender.weapons)
  const trainMult = trainingMultiplier(defender.training.defense_level)
  const fortMult = fortificationMultiplier(defender.development.fortification_level)
  const raceMult = getRaceDefenseBonus(defender.player.race)
  const tribeBonus = defender.tribeDefenseBonus ?? 0

  return Math.floor(
    (baseUnits * weaponMult) * trainMult * fortMult * raceMult + tribeBonus
  )
}

export interface CombatResult {
  outcome: AttackOutcome
  atkPower: number
  defPower: number
  attackerLosses: number
  defenderLosses: number
  slavesTaken: number
  goldStolen: number
  ironStolen: number
  woodStolen: number
  foodStolen: number
}

export function resolveCombat(
  atkPower: number,
  defPower: number,
  attackerArmy: Army,
  defenderArmy: Army,
  defenderResources: { gold: number; iron: number; wood: number; food: number },
  isNoDamageMode: boolean   // >5 attacks on same target today
): CombatResult {
  const ratio = defPower > 0 ? atkPower / defPower : 2.0
  const outcomes = BALANCE.combat.outcomes

  let outcome: AttackOutcome
  let attackerLossPct: number
  let defenderLossPct: number
  let resourceStealPct: number
  let slaveStealPct: number

  if (ratio >= outcomes.crushingVictory.minRatio) {
    outcome = 'crushing_win'
    attackerLossPct = outcomes.crushingVictory.attackerLosses
    defenderLossPct = outcomes.crushingVictory.defenderLosses
    resourceStealPct = outcomes.crushingVictory.resourceSteal
    slaveStealPct = outcomes.crushingVictory.slaveSteal
  } else if (ratio >= outcomes.victory.minRatio) {
    outcome = 'win'
    attackerLossPct = outcomes.victory.attackerLosses
    defenderLossPct = outcomes.victory.defenderLosses
    resourceStealPct = outcomes.victory.resourceSteal
    slaveStealPct = outcomes.victory.slaveSteal
  } else if (ratio >= outcomes.draw.minRatio) {
    outcome = 'draw'
    attackerLossPct = outcomes.draw.attackerLosses
    defenderLossPct = outcomes.draw.defenderLosses
    resourceStealPct = outcomes.draw.resourceSteal
    slaveStealPct = outcomes.draw.slaveSteal
  } else if (ratio >= outcomes.defeat.minRatio) {
    outcome = 'loss'
    attackerLossPct = outcomes.defeat.attackerLosses
    defenderLossPct = outcomes.defeat.defenderLosses
    resourceStealPct = outcomes.defeat.resourceSteal
    slaveStealPct = outcomes.defeat.slaveSteal
  } else {
    outcome = 'crushing_loss'
    attackerLossPct = outcomes.crushingDefeat.attackerLosses
    defenderLossPct = outcomes.crushingDefeat.defenderLosses
    resourceStealPct = outcomes.crushingDefeat.resourceSteal
    slaveStealPct = outcomes.crushingDefeat.slaveSteal
  }

  const maxSteal = BALANCE.combat.maxResourceStealPercent

  // No-damage mode: only steal resources, no soldier loss or capture
  const effectiveDefenderLossPct = isNoDamageMode ? 0 : defenderLossPct
  const effectiveSlaveStealPct = isNoDamageMode ? 0 : slaveStealPct

  const attackerLosses = Math.floor(attackerArmy.soldiers * attackerLossPct)
  const defenderLosses = Math.floor(defenderArmy.soldiers * effectiveDefenderLossPct)
  const slavesTaken = Math.floor(defenderArmy.soldiers * effectiveSlaveStealPct)

  const stealFactor = Math.min(resourceStealPct, maxSteal)
  const goldStolen   = Math.floor(defenderResources.gold  * stealFactor)
  const ironStolen   = Math.floor(defenderResources.iron  * stealFactor)
  const woodStolen   = Math.floor(defenderResources.wood  * stealFactor)
  const foodStolen   = Math.floor(defenderResources.food  * stealFactor)

  return {
    outcome,
    atkPower,
    defPower,
    attackerLosses,
    defenderLosses,
    slavesTaken,
    goldStolen,
    ironStolen,
    woodStolen,
    foodStolen,
  }
}
