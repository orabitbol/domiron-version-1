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
import type { SupabaseClient } from '@supabase/supabase-js'

function calcPowerTotal(
  powerAttack: number,
  powerDefense: number,
  powerSpy: number,
  powerScout: number,
): number {
  return powerAttack + powerDefense + powerSpy + powerScout
}

// Spy/Scout gear multipliers sourced from BALANCE — see config/balance.config.ts
// pp.SPY_GEAR_MULT and pp.SCOUT_GEAR_MULT. Never hardcode here.

export async function recalculatePower(
  playerId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
): Promise<void> {
  // Fetch all data needed for power calculation
  const [
    { data: army },
    { data: weapons },
    { data: training },
    { data: development },
  ] = await Promise.all([
    supabase.from('army').select('soldiers, cavalry, spies, scouts').eq('player_id', playerId).single(),
    supabase.from('weapons').select('*').eq('player_id', playerId).single(),
    supabase.from('training').select('attack_level, defense_level, spy_level, scout_level').eq('player_id', playerId).single(),
    supabase.from('development').select('fortification_level').eq('player_id', playerId).single(),
  ])

  if (!army || !weapons || !training || !development) return

  const { attack: atkWeapons, defense: defWeapons } = BALANCE.weapons

  // ── Attack Power ────────────────────────────────────────────────────────────
  const baseAttackUnits = army.soldiers + army.cavalry * BALANCE.combat.cavalryMultiplier
  const attackWeaponPower =
    weapons.crude_club   * atkWeapons.crude_club.power   +
    weapons.slingshot    * atkWeapons.slingshot.power    +
    weapons.boomerang    * atkWeapons.boomerang.power    +
    weapons.pirate_knife * atkWeapons.pirate_knife.power +
    weapons.axe          * atkWeapons.axe.power          +
    weapons.master_knife * atkWeapons.master_knife.power +
    weapons.knight_axe   * atkWeapons.knight_axe.power   +
    weapons.iron_ball    * atkWeapons.iron_ball.power    +
    weapons.battle_axe   * atkWeapons.battle_axe.power   +
    weapons.war_hammer   * atkWeapons.war_hammer.power   +
    weapons.dragon_sword * atkWeapons.dragon_sword.power
  const attackTrainMult = 1 + training.attack_level * BALANCE.training.advancedMultiplierPerLevel
  const powerAttack = Math.floor(
    (baseAttackUnits + attackWeaponPower) * attackTrainMult
  )

  // ── Defense Power ───────────────────────────────────────────────────────────
  const baseDefenseUnits = army.soldiers + army.cavalry * BALANCE.combat.cavalryMultiplier
  let defWeaponMult = 1.0
  if (weapons.wooden_buckler   > 0) defWeaponMult *= defWeapons.wooden_buckler.multiplier
  if (weapons.wood_shield      > 0) defWeaponMult *= defWeapons.wood_shield.multiplier
  if (weapons.iron_shield      > 0) defWeaponMult *= defWeapons.iron_shield.multiplier
  if (weapons.leather_armor    > 0) defWeaponMult *= defWeapons.leather_armor.multiplier
  if (weapons.chain_armor      > 0) defWeaponMult *= defWeapons.chain_armor.multiplier
  if (weapons.plate_armor      > 0) defWeaponMult *= defWeapons.plate_armor.multiplier
  if (weapons.mithril_armor    > 0) defWeaponMult *= defWeapons.mithril_armor.multiplier
  if (weapons.gods_armor       > 0) defWeaponMult *= defWeapons.gods_armor.multiplier
  if (weapons.shadow_armor     > 0) defWeaponMult *= defWeapons.shadow_armor.multiplier
  if (weapons.void_armor       > 0) defWeaponMult *= defWeapons.void_armor.multiplier
  if (weapons.celestial_armor  > 0) defWeaponMult *= defWeapons.celestial_armor.multiplier
  const defenseTrainMult = 1 + training.defense_level * BALANCE.training.advancedMultiplierPerLevel
  const fortMult = 1 + (development.fortification_level - 1) * BALANCE.pp.FORTIFICATION_MULT_PER_LEVEL
  const powerDefense = Math.floor(
    baseDefenseUnits * defWeaponMult * defenseTrainMult * fortMult
  )

  // ── Spy Power ───────────────────────────────────────────────────────────────
  const spyTrainMult = 1 + training.spy_level * BALANCE.training.advancedMultiplierPerLevel
  let spyWeaponMult = 1.0
  if (weapons.spy_hood       > 0) spyWeaponMult *= BALANCE.pp.SPY_GEAR_MULT.spy_hood
  if (weapons.shadow_cloak   > 0) spyWeaponMult *= BALANCE.pp.SPY_GEAR_MULT.shadow_cloak
  if (weapons.dark_mask      > 0) spyWeaponMult *= BALANCE.pp.SPY_GEAR_MULT.dark_mask
  if (weapons.elven_gear     > 0) spyWeaponMult *= BALANCE.pp.SPY_GEAR_MULT.elven_gear
  if (weapons.mystic_cloak   > 0) spyWeaponMult *= BALANCE.pp.SPY_GEAR_MULT.mystic_cloak
  if (weapons.shadow_veil    > 0) spyWeaponMult *= BALANCE.pp.SPY_GEAR_MULT.shadow_veil
  if (weapons.phantom_shroud > 0) spyWeaponMult *= BALANCE.pp.SPY_GEAR_MULT.phantom_shroud
  if (weapons.arcane_veil    > 0) spyWeaponMult *= BALANCE.pp.SPY_GEAR_MULT.arcane_veil
  const powerSpy = Math.floor(
    army.spies * spyTrainMult * spyWeaponMult
  )

  // ── Scout Power ─────────────────────────────────────────────────────────────
  const scoutTrainMult = 1 + training.scout_level * BALANCE.training.advancedMultiplierPerLevel
  let scoutWeaponMult = 1.0
  if (weapons.scout_cap      > 0) scoutWeaponMult *= BALANCE.pp.SCOUT_GEAR_MULT.scout_cap
  if (weapons.scout_boots    > 0) scoutWeaponMult *= BALANCE.pp.SCOUT_GEAR_MULT.scout_boots
  if (weapons.scout_cloak    > 0) scoutWeaponMult *= BALANCE.pp.SCOUT_GEAR_MULT.scout_cloak
  if (weapons.elven_boots    > 0) scoutWeaponMult *= BALANCE.pp.SCOUT_GEAR_MULT.elven_boots
  if (weapons.swift_boots    > 0) scoutWeaponMult *= BALANCE.pp.SCOUT_GEAR_MULT.swift_boots
  if (weapons.shadow_steps   > 0) scoutWeaponMult *= BALANCE.pp.SCOUT_GEAR_MULT.shadow_steps
  if (weapons.phantom_stride > 0) scoutWeaponMult *= BALANCE.pp.SCOUT_GEAR_MULT.phantom_stride
  if (weapons.arcane_lens    > 0) scoutWeaponMult *= BALANCE.pp.SCOUT_GEAR_MULT.arcane_lens
  const powerScout = Math.floor(
    army.scouts * BALANCE.pp.SCOUT_UNIT_VALUE * scoutTrainMult * scoutWeaponMult
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
