/**
 * Domiron — Power Recalculation Utility
 *
 * Calculates and saves power_attack, power_defense, power_spy, power_scout,
 * and power_total to the players table.
 *
 * Call this after any action that changes army, weapons, training, or development.
 * Uses deterministic formulas (no random factor, no turn bonus) for stored values.
 */
import { BALANCE } from '@/lib/game/balance'
import { calcPowerTotal } from '@/lib/game/tick'
import type { SupabaseClient } from '@supabase/supabase-js'

// Spy weapon multipliers (owned = 1 / not owned = 0, stacks multiplicatively)
const SPY_WEAPON_MULTIPLIERS = {
  shadow_cloak: 1.15,
  dark_mask:    1.30,
  elven_gear:   1.50,
} as const

// Scout weapon multipliers (owned = 1 / not owned = 0, stacks multiplicatively)
const SCOUT_WEAPON_MULTIPLIERS = {
  scout_boots:  1.15,
  scout_cloak:  1.30,
  elven_boots:  1.50,
} as const

function getRaceAttackMult(race: string): number {
  const r = BALANCE.raceBonuses
  if (race === 'orc')   return 1 + r.orc.attackBonus
  if (race === 'human') return 1 + r.human.attackBonus
  return 1.0
}

function getRaceDefenseMult(race: string): number {
  const r = BALANCE.raceBonuses
  if (race === 'orc')   return 1 + r.orc.defenseBonus
  if (race === 'dwarf') return 1 + r.dwarf.defenseBonus
  return 1.0
}

function getRaceSpyMult(race: string): number {
  if (race === 'elf') return 1 + BALANCE.raceBonuses.elf.spyBonus
  return 1.0
}

function getRaceScoutMult(race: string): number {
  if (race === 'elf') return 1 + BALANCE.raceBonuses.elf.scoutBonus
  return 1.0
}

export async function recalculatePower(
  playerId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
): Promise<void> {
  // Fetch all data needed for power calculation
  const [
    { data: player },
    { data: army },
    { data: weapons },
    { data: training },
    { data: development },
  ] = await Promise.all([
    supabase.from('players').select('race').eq('id', playerId).single(),
    supabase.from('army').select('soldiers, cavalry, spies, scouts').eq('player_id', playerId).single(),
    supabase.from('weapons').select('*').eq('player_id', playerId).single(),
    supabase.from('training').select('attack_level, defense_level, spy_level, scout_level').eq('player_id', playerId).single(),
    supabase.from('development').select('fortification_level').eq('player_id', playerId).single(),
  ])

  if (!player || !army || !weapons || !training || !development) return

  const { race } = player
  const { attack: atkWeapons, defense: defWeapons } = BALANCE.weapons

  // ── Attack Power ────────────────────────────────────────────────────────────
  const baseAttackUnits = army.soldiers + army.cavalry * BALANCE.combat.cavalryMultiplier
  const attackWeaponPower =
    weapons.slingshot    * atkWeapons.slingshot.power    +
    weapons.boomerang    * atkWeapons.boomerang.power    +
    weapons.pirate_knife * atkWeapons.pirate_knife.power +
    weapons.axe          * atkWeapons.axe.power          +
    weapons.master_knife * atkWeapons.master_knife.power +
    weapons.knight_axe   * atkWeapons.knight_axe.power   +
    weapons.iron_ball    * atkWeapons.iron_ball.power
  const attackTrainMult = 1 + training.attack_level * BALANCE.training.advanced.multiplierPerLevel
  const powerAttack = Math.floor(
    (baseAttackUnits + attackWeaponPower) * attackTrainMult * getRaceAttackMult(race)
  )

  // ── Defense Power ───────────────────────────────────────────────────────────
  const baseDefenseUnits = army.soldiers + army.cavalry * BALANCE.combat.cavalryMultiplier
  let defWeaponMult = 1.0
  if (weapons.wood_shield   > 0) defWeaponMult *= defWeapons.wood_shield.multiplier
  if (weapons.iron_shield   > 0) defWeaponMult *= defWeapons.iron_shield.multiplier
  if (weapons.leather_armor > 0) defWeaponMult *= defWeapons.leather_armor.multiplier
  if (weapons.chain_armor   > 0) defWeaponMult *= defWeapons.chain_armor.multiplier
  if (weapons.plate_armor   > 0) defWeaponMult *= defWeapons.plate_armor.multiplier
  if (weapons.mithril_armor > 0) defWeaponMult *= defWeapons.mithril_armor.multiplier
  if (weapons.gods_armor    > 0) defWeaponMult *= defWeapons.gods_armor.multiplier
  const defenseTrainMult = 1 + training.defense_level * BALANCE.training.advanced.multiplierPerLevel
  const fortMult = 1 + (development.fortification_level - 1) * 0.10
  const powerDefense = Math.floor(
    baseDefenseUnits * defWeaponMult * defenseTrainMult * fortMult * getRaceDefenseMult(race)
  )

  // ── Spy Power ───────────────────────────────────────────────────────────────
  const spyTrainMult = 1 + training.spy_level * BALANCE.training.advanced.multiplierPerLevel
  let spyWeaponMult = 1.0
  if (weapons.shadow_cloak > 0) spyWeaponMult *= SPY_WEAPON_MULTIPLIERS.shadow_cloak
  if (weapons.dark_mask    > 0) spyWeaponMult *= SPY_WEAPON_MULTIPLIERS.dark_mask
  if (weapons.elven_gear   > 0) spyWeaponMult *= SPY_WEAPON_MULTIPLIERS.elven_gear
  const powerSpy = Math.floor(
    army.spies * spyTrainMult * spyWeaponMult * getRaceSpyMult(race)
  )

  // ── Scout Power ─────────────────────────────────────────────────────────────
  const scoutTrainMult = 1 + training.scout_level * BALANCE.training.advanced.multiplierPerLevel
  let scoutWeaponMult = 1.0
  if (weapons.scout_boots  > 0) scoutWeaponMult *= SCOUT_WEAPON_MULTIPLIERS.scout_boots
  if (weapons.scout_cloak  > 0) scoutWeaponMult *= SCOUT_WEAPON_MULTIPLIERS.scout_cloak
  if (weapons.elven_boots  > 0) scoutWeaponMult *= SCOUT_WEAPON_MULTIPLIERS.elven_boots
  const powerScout = Math.floor(
    army.scouts * scoutTrainMult * scoutWeaponMult * getRaceScoutMult(race)
  )

  // ── Total Power ─────────────────────────────────────────────────────────────
  const powerTotal = calcPowerTotal(powerAttack, powerDefense, powerSpy, powerScout)

  // ── Persist ─────────────────────────────────────────────────────────────────
  await supabase
    .from('players')
    .update({
      power_attack:  powerAttack,
      power_defense: powerDefense,
      power_spy:     powerSpy,
      power_scout:   powerScout,
      power_total:   powerTotal,
    })
    .eq('id', playerId)
}
