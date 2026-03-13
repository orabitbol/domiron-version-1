# Domiron — Combat & Economy Formulas Reference

> **Last verified:** 2026-03-13
> **Scope:** All formulas traced from actual runtime code + `config/balance.config.ts`.
> **Not assumptions — every value has a source citation.**
> Values tagged `[TUNE]` are design-adjustable. Values tagged `[FIXED]` are architectural invariants.

---

## Table of Contents

1. [Turns System](#1-turns-system)
2. [Power Calculation (PP)](#2-power-calculation-pp)
3. [Effective Combat Power (ECP)](#3-effective-combat-power-ecp)
4. [Attack Formula — Full Flow](#4-attack-formula--full-flow)
5. [Soldier Loss Formula](#5-soldier-loss-formula)
6. [Loot / Resource Theft Formula](#6-loot--resource-theft-formula)
7. [Captives / Slaves from Combat](#7-captives--slaves-from-combat)
8. [Food Consumption Formula](#8-food-consumption-formula)
9. [Kill Cooldown](#9-kill-cooldown)
10. [New Player Protection](#10-new-player-protection)
11. [Anti-Farm / Loot Decay](#11-anti-farm--loot-decay)
12. [Spy Formula](#12-spy-formula)
13. [Scout Defense Formula](#13-scout-defense-formula)
14. [Equipment Contribution](#14-equipment-contribution)
15. [Hero Effects on Combat & Economy](#15-hero-effects-on-combat--economy)
16. [Tribe Spells that Affect Combat](#16-tribe-spells-that-affect-combat)
17. [Race Bonuses](#17-race-bonuses)
18. [Clan / Tribe Combat Bonus](#18-clan--tribe-combat-bonus)
19. [Bank System](#19-bank-system)
20. [Resource Production (Slave Output)](#20-resource-production-slave-output)
21. [Population & Training Costs](#21-population--training-costs)
22. [Development System Effects](#22-development-system-effects)
23. [Ranking / Power Total](#23-ranking--power-total)
24. [Important Caps & Cooldowns (Summary)](#24-important-caps--cooldowns-summary)
25. [Server-Authoritative RPCs](#25-server-authoritative-rpcs)
26. [Known Inconsistencies / Open Questions](#26-known-inconsistencies--open-questions)

---

## 1. Turns System

**Source:** `config/balance.config.ts` (tick section), `lib/game/tick.ts:19-26`, `app/api/tick/route.ts`

### Tick Regen

```
new_turns = min(current_turns + TURNS_PER_TICK, MAX_TURNS)
```

| Constant | Value | Tag |
|---|---|---|
| `TURNS_PER_TICK` | 3 | [FIXED] |
| `MAX_TURNS` (tick cap) | 200 | [FIXED] |
| Tick interval | 30 min | [FIXED] |

- Regen only runs when `current_turns < MAX_TURNS`. If already at or above 200, nothing is added.
- Vacation mode: `toAdd = ceil(TURNS_PER_TICK × vacationTurnsMultiplier)` — reduces regen to ~1 turn/tick.

### Purchased Turns Cap

```
PURCHASED_TURNS_MAX_CAP = 5000
```

Turns granted via Lemon Squeezy purchases bypass the 200 tick cap. The absolute ceiling is 5000. Players can stockpile purchased turns well above the normal regen cap.

- **Source:** `config/balance.config.ts:37` — `purchasedTurnsMaxCap: 5000`
- Applied in `supabase/migrations/0030_lemon_payments.sql` → `fulfill_lemon_purchase()` RPC: `min(turns + grant, 5000)`

### Turn Spending

- **Attack:** costs `turns_used` (1–10, Zod-validated). Deducted atomically in `attack_resolve_apply` RPC.
- **Spy:** costs `BALANCE.spy.turnCost = 1` per mission, regardless of outcome.
- **Other actions** (train, build, bank): no turn cost.

---

## 2. Power Calculation (PP)

**Source:** `lib/game/combat.ts:195-211`, `lib/game/power.ts:25-130`

### Personal Power (PP) Formula

```
PP = floor(
  SoldierScore  × W_SOLDIERS    (1.0)
+ EquipScore    × W_EQUIPMENT   (1.0)
+ SkillScore    × W_SKILLS      (1.0)
+ min(DevScore, DEV_CAP) × W_DEVELOPMENT (1.0)
+ SpyScore      × W_SPY         (1.0)
)
```

All weights are currently 1.0 (placeholder — designed for tuning). `DEV_CAP = 10,000`.

### Sub-Score Formulas

**SoldierScore**
```
TierValue[tier] = SOLDIER_V × SOLDIER_K^(tier-1)
  SOLDIER_V = 1, SOLDIER_K = 3
  Tier 1 (soldiers) = 1 × 3^0 = 1 per soldier
  Tier 2 (cavalry)  = 1 × 3^1 = 3 per cavalry

SoldierScore = soldiers × 1 + cavalry × 3
```

**EquipScore** — See [§14 Equipment Contribution](#14-equipment-contribution).

**SkillScore**
```
SkillScore = attack_level × 100 + defense_level × 100 + spy_level × 80 + scout_level × 80
```
Source: `config/balance.config.ts` `SKILL_PP` values.

**DevScore**
```
DevScore = gold_level×50 + food_level×50 + wood_level×50 + iron_level×50
         + population_level×75 + fortification_level×100
```
Capped at `DEV_CAP = 10,000` before weight multiplication.

**SpyScore**
```
SpyScore = spies × SPY_UNIT_VALUE (5) + scouts × SCOUT_UNIT_VALUE (5)
```

### Stored Power Columns

`recalculatePower()` in `lib/game/power.ts` computes and stores 4 separate columns:

| Column | Formula |
|---|---|
| `power_attack` | `floor((soldiers + cavalry×2 + attackWeaponPower) × (1 + attack_level×0.08))` |
| `power_defense` | `floor((soldiers + cavalry×2) × defWeaponMult × (1 + defense_level×0.08) × fortMult)` |
| `power_spy` | `floor(spies × (1 + spy_level×0.08) × spyWeaponMult)` |
| `power_scout` | `floor(scouts × SCOUT_UNIT_VALUE×5 × (1 + scout_level×0.08) × scoutWeaponMult)` |

Note: `power_attack / power_defense / power_spy / power_scout` are **stored display/ranking values**, used only for the History / Spy intel panels and `power_total`. They are **not** the combat ECP (which is recomputed fresh from stat rows during every attack).

`power_total = power_attack + power_defense + power_spy + power_scout`

This value drives global and city rankings.

---

## 3. Effective Combat Power (ECP)

**Source:** `lib/game/combat.ts:380-393`, `lib/game/combat.ts:622-633`

### ECP Formula (used live in every attack)

```
ClanBonus = min(TotalClanPP × EFFICIENCY[clanLevel], 0.20 × PlayerPP)

BaseECP = floor(PlayerPP × (1 + heroBonus) × (1 + raceBonus)) + ClanBonus

FinalECP = floor(BaseECP × tribeCombatMultiplier)
```

- `heroBonus` = pre-clamped `TotalAttackBonus` or `TotalDefenseBonus` from active hero effects (0–0.50 hard cap).
- `raceBonus` = race-specific multiplier (see [§17 Race Bonuses](#17-race-bonuses)).
- `tribeCombatMultiplier` = 1.0 normally, 1.25 for attacker with `war_cry` active, 1.15 for defender with `tribe_shield` active.
- Hero/race bonuses multiply **only PlayerPP** — they never touch ClanBonus. This is intentional.

### Combat Ratio

```
R = AttackerECP / DefenderECP
  (if DefenderECP = 0 → R treated as WIN_THRESHOLD + 1, automatic win)
```

### Outcome (Binary — no draws)

```
R ≥ WIN_THRESHOLD (1.0) → 'win'
R < WIN_THRESHOLD       → 'loss'
```

---

## 4. Attack Formula — Full Flow

**Source:** `app/api/attack/route.ts`

### Pre-checks (before any DB mutation)

1. Season active (`getActiveSeason`) — returns 423 if frozen.
2. `defender_id ≠ attacker_id`
3. `turns ≥ turns_used`
4. `food ≥ foodCost`
5. `attacker.soldiers > 0`
6. `attacker.city === defender.city` (same-city only)
7. Rate limit: 1-second cooldown between attacks (server-enforced)

### Order of Operations

```
1. Compute foodCost = ceil(soldiers × 0.05 × turns_used × foodMultiplier)
2. Fetch all attacker + defender rows in parallel
3. Compute attacker PP, defender PP from live stat rows
4. Compute ClanBonus for each (from tribe.power_total + tribe.level)
5. Resolve hero effects (getActiveHeroEffects) for both sides
6. Determine kill cooldown: any row in attacks with defender_losses > 0
   for this pair within last 6h
7. Determine attacker/defender protection (isNewPlayerProtected)
8. Determine tribe spell multipliers (war_cry / tribe_shield)
9. Call resolveCombat() → { outcome, ratio, ECP values, losses, loot }
10. Scale results: loot × turns_used, losses × turns_used (clamped to army size)
11. Safety clamp loot: min(loot[r], defender.resources[r])
12. Calculate captives = floor(defLossesScaled × 0.10)
13. Assert invariants (throw if violated)
14. Call attack_resolve_apply RPC (atomic DB write)
15. Recalculate power for both players (non-fatal)
16. Return BattleReport to client
```

---

## 5. Soldier Loss Formula

**Source:** `lib/game/combat.ts:441-465`

```
attackerLossRate = clamp(BASE_LOSS / max(ratio, 0.01), ATTACKER_FLOOR, MAX_LOSS_RATE)
defenderLossRate = clamp(BASE_LOSS × ratio,            DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)

attackerLosses_per_turn = floor(deployedSoldiers × attackerLossRate)
defenderLosses_per_turn = floor(defenderSoldiers × defenderLossRate)

// Scaled for multi-turn:
attLossesTotal = min(attackerLosses_per_turn × turns_used, attacker.soldiers)
defLossesTotal = min(defenderLosses_per_turn × turns_used, defender.soldiers)
```

| Constant | Value | Tag |
|---|---|---|
| `BASE_LOSS` | 0.15 | [TUNE] |
| `MAX_LOSS_RATE` | 0.30 | [FIXED] |
| `DEFENDER_BLEED_FLOOR` | 0.05 | [TUNE] |
| `ATTACKER_FLOOR` | 0.03 | [TUNE] |

**At R=1.0:** both sides lose 15%/turn.
**At R=2.0:** attacker loses 7.5%/turn, defender loses 30% (hard cap).
**At R=0.5:** attacker loses 30% (hard cap), defender loses 7.5%/turn.

### Override conditions (zero out losses)

| Condition | Effect |
|---|---|
| `killCooldownActive = true` | `defenderLosses = 0` (attacker loses normally) |
| `defenderIsProtected = true` | `defenderLosses = 0` |
| `attackerIsProtected = true` | `attackerLosses = 0` |
| `soldierShieldActive = true` | `defenderLosses = 0` |

Attacker always pays turns + food regardless of any of these flags.

---

## 6. Loot / Resource Theft Formula

**Source:** `lib/game/combat.ts:568-588`, `app/api/attack/route.ts:275-288`

```
BaseLoot_per_turn[r] = unbanked[r] × BASE_LOOT_RATE (0.10)
FinalLoot_per_turn[r] = BaseLoot[r] × outcomeMultiplier × decayFactor

// Multi-turn scaling:
totalLoot[r] = FinalLoot_per_turn[r] × turns_used

// Hard safety clamp:
stolenAmount[r] = min(totalLoot[r], defender.resources[r])
```

- `outcomeMultiplier` = 1.0 on win, 0.0 on loss. Loss means zero loot always.
- `decayFactor` — see [§11 Anti-Farm / Loot Decay](#11-anti-farm--loot-decay).
- Loot applies to **unbanked** resources only. Gold in the bank is 100% safe (`theftProtection = 1.0`).
- Zero loot conditions: `outcome = 'loss'`, `defenderIsProtected`, or `resourceShieldActive`.

---

## 7. Captives / Slaves from Combat

**Source:** `lib/game/combat.ts:481-483`, `app/api/attack/route.ts:294`

```
captives = floor(defenderLosses_total × CAPTURE_RATE)
         = floor(defenderLosses_total × 0.10)
```

Captives are added to `attacker.army.slaves`. Written atomically by `attack_resolve_apply` RPC.
Returns 0 when `defenderLosses = 0` (kill cooldown / any shield / protection / attack loss).

> ⚠️ **Note:** MEMORY.md previously stated CAPTURE_RATE was removed. This is wrong. It is fully active.

---

## 8. Food Consumption Formula

**Source:** `app/api/attack/route.ts:110-111`

```
foodCostRaw = attacker.soldiers × FOOD_PER_SOLDIER × turns_used × foodMultiplier
foodCost    = ceil(foodCostRaw)
```

| Constant | Value |
|---|---|
| `FOOD_PER_SOLDIER` | 0.05 |

- `foodMultiplier` = 1.0 normally. If `battle_supply` tribe spell active: `1 - 0.25 = 0.75`.
- Uses **total** `attacker.army.soldiers`, not a deployable subset.
- Attacker net food after attack: `max(0, food - foodCost + foodStolen)`.

---

## 9. Kill Cooldown

**Source:** `lib/game/combat.ts:494-499`, `app/api/attack/route.ts:176-193`

```
killCooldownActive = (count of attacks where
  attacker_id = this_attacker AND defender_id = this_target
  AND defender_losses > 0
  AND created_at >= now() - KILL_COOLDOWN_HOURS × 3600s
) > 0
```

| Constant | Value | Tag |
|---|---|---|
| `KILL_COOLDOWN_HOURS` | 6 | [FIXED] |

When active:
- `defenderLosses = 0` (no soldiers killed)
- Loot still resolves normally if outcome = 'win'
- `captives = 0` (automatically, since losses = 0)
- Attacker still pays turns + food

---

## 10. New Player Protection

**Source:** `lib/game/combat.ts:522-535`

```
// Season gate first: no protection during first N days of season
if (now - season.starts_at < protectionStartDays × 24h) → no protection

// After gate opens:
if (now - player.created_at < PROTECTION_HOURS) → protected
```

| Constant | Value | Tag |
|---|---|---|
| `PROTECTION_HOURS` | 24 | [FIXED] |
| `season.protectionStartDays` | see balance.config.ts `season` section | |

Attacks on protected players are **never blocked** at the gate. Protection is applied inside combat resolution:
- Protected defender: `defenderLosses = 0`, `loot = 0`
- Protected attacker: `attackerLosses = 0`

---

## 11. Anti-Farm / Loot Decay

**Source:** `lib/game/combat.ts:549-553`, `config/balance.config.ts:358-364`

Window: 12 hours per (attacker → defender) pair, counted from the `attacks` table. Count includes the current attack.

| Attack # in window | Decay multiplier |
|---|---|
| 1st | 1.00 (full loot) |
| 2nd | 0.70 |
| 3rd | 0.40 |
| 4th | 0.20 |
| 5th+ | 0.10 |

`DECAY_WINDOW_HOURS = 12` — [FIXED]

---

## 12. Spy Formula

**Source:** `app/api/spy/route.ts:29-57`, `app/api/spy/route.ts:207-247`

### Spy Power Calculation

```
spyPower = floor(
  spies_sent
  × (1 + spy_level × 0.08)          // training multiplier
  × spyWeaponMult                     // gear stacked multiplicatively
  × raceMult                          // elf: × (1 + 0.20) = ×1.20
)
```

Spy gear multipliers (stacked multiplicatively if owned):

| Gear | Multiplier |
|---|---|
| shadow_cloak | ×1.15 |
| dark_mask | ×1.30 |
| elven_gear | ×1.50 |

> Note: `calcSpyPower` in the spy route only checks 3 of the 8 spy gear items. `calcSpyScore` in `lib/game/power.ts` checks all 8 (using `SPY_GEAR_MULT`). The spy route uses its own local function — this is a **known divergence** (see [§26](#26-known-inconsistencies--open-questions)).

### Success Condition

```
success = spyPower > scoutDefense
```

Binary — no partial success.

### Spies Caught on Failure

```
ratio      = min(scoutDefense / max(spyPower, 1), 1.0)
rawCatch   = floor(spies_sent × CATCH_RATE × ratio)
spiesCaught = min(rawCatch, floor(spies_sent × MAX_CATCH_RATE))
```

| Constant | Value |
|---|---|
| `BALANCE.spy.catchRate` | see balance.config.ts `spy` section |
| `BALANCE.spy.MAX_CATCH_RATE` | see balance.config.ts `spy` section |
| `BALANCE.spy.turnCost` | 1 |
| `BALANCE.spy.minSpies` | 1 |

### On Success — Revealed Data

Full intel snapshot written to `spy_history.data_revealed` (JSONB):
- Full army (soldiers, cavalry, spies, scouts, slaves, free_pop)
- Unbanked resources (gold, iron, wood, food)
- Bank balance + interest_level
- All 4 power columns
- Active shields (soldier / resource)
- Key weapon counts (attack, defense, spy, scout)
- Training levels (attack, defense, spy, scout)
- Tribe name + level

### Atomic DB Write

`spy_resolve_apply` RPC (`supabase/migrations/0014_spy_resolve_rpc.sql`):
- Deducts turns from attacker
- Deducts caught spies from `army.spies` (if any)
- Inserts `spy_history` row
All under a single Postgres transaction with `FOR UPDATE` row locks.

---

## 13. Scout Defense Formula

**Source:** `app/api/spy/route.ts:44-56`

```
scoutDefense = floor(
  scouts
  × SCOUT_UNIT_VALUE (5)
  × (1 + scout_level × 0.08)         // training multiplier
  × scoutWeaponMult                   // gear stacked multiplicatively
  × raceMult                          // elf: × (1 + elf.scoutBonus)
)
```

Scout gear multipliers (stacked multiplicatively if owned):

| Gear | Multiplier |
|---|---|
| scout_boots | ×1.15 |
| scout_cloak | ×1.30 |
| elven_boots | ×1.50 |

**Tribe spy_veil spell effect (applied after base calculation):**
```
if spy_veil active on defender's tribe:
  scoutDefense = floor(scoutDefense × 1.30)
```

---

## 14. Equipment Contribution

**Source:** `lib/game/combat.ts:244-294`, `lib/game/power.ts:48-113`

### Attack Weapons (PP + Combat)

Attack weapons contribute **additively per unit** to both `power_attack` (stored) and `EquipScore` (PP ranking).

```
// Stored power_attack:
attackWeaponPower = Σ (weapon_count × weapon.power)

power_attack = floor((soldiers + cavalry×2 + attackWeaponPower) × attackTrainMult)
```

Weapon `.power` values (from `BALANCE.weapons.attack`):

| Weapon | Power per unit |
|---|---|
| crude_club | low |
| slingshot → dragon_sword | escalating (see balance.config.ts) |

### Defense Weapons (multiplicative)

Defense weapons apply as a **stacked multiplier** on base defensive units:

```
defWeaponMult = Π (each owned defense piece's .multiplier)

power_defense = floor(
  (soldiers + cavalry×2) × defWeaponMult × defTrainMult × fortMult
)
```

One per player. Owning more than one is blocked at API level.

### Spy / Scout Gear (multiplicative on unit count)

```
spyPower   = spies  × spyTrainMult  × spyWeaponMult   (stacked ×)
scoutPower = scouts × SCOUT_UNIT_VALUE × scoutTrainMult × scoutWeaponMult (stacked ×)
```

All gear multipliers from `BALANCE.pp.SPY_GEAR_MULT` and `BALANCE.pp.SCOUT_GEAR_MULT`. One per player.

### PP Ranking Contribution of Equipment

For the `EquipScore` inside PP (used for rankings):
- Attack weapons: additive per unit (`EQUIPMENT_PP[weapon]` × count)
- Defense/Spy/Scout gear: binary — grants `EQUIPMENT_PP[piece]` if `count > 0`, else 0

---

## 15. Hero Effects on Combat & Economy

**Source:** `lib/game/hero-effects.ts`, `config/balance.config.ts:237-289`

### Effect Types

| Effect | Rate | Applies To |
|---|---|---|
| `ATTACK_POWER_10` | +0.10 | Attacker `heroBonus` in ECP |
| `DEFENSE_POWER_10` | +0.10 | Defender `heroBonus` in ECP |
| `SLAVE_OUTPUT_10` | +0.10 | Slave production per tick |
| `SLAVE_OUTPUT_20` | +0.20 | Slave production per tick |
| `SLAVE_OUTPUT_30` | +0.30 | Slave production per tick |

Multiple effects of the same category stack additively, capped at `MAX_STACK_RATE = 0.50`.

### Shields (active spells)

| Shield | Effect |
|---|---|
| `RESOURCE_SHIELD` | All loot = 0 for the duration |
| `SOLDIER_SHIELD` | defenderLosses = 0 for the duration |

Shields use per-hour mana pricing: `manaCost = selectedHours × SHIELD_MANA_PER_HOUR (25)`.
Duration presets: 4h, 8h, 12h, 15h, 23h.
After expiry: 1h cooldown before next shield can start.

### Hero Mana Regen (per tick)

```
heroMana += base (1)
          + level10bonus (1, if hero.level >= 10)
          + level50bonus (1, if hero.level >= 50)
          + vipBonus (1, if VIP active)
```

### VIP Production Multiplier

If `players.vip_until > now()`:
- Slave production: `× 1.10`
- Population growth: `× 1.10`

---

## 16. Tribe Spells that Affect Combat

**Source:** `app/api/attack/route.ts:96-227`, `config/balance.config.ts:461-476`

| Spell | Effect | Duration | Tribe Mana Cost |
|---|---|---|---|
| `war_cry` | Attacker ECP ×1.25 | 4h | 40 |
| `tribe_shield` | Defender ECP ×1.15 | 12h | 30 |
| `battle_supply` | Attack food cost −25% | 6h | 35 |
| `spy_veil` | Defender scoutDefense ×1.30 | 6h | 20 |
| `production_blessing` | Slave production ×1.20 | 8h | 25 |

- Only leader or deputy may cast spells.
- Spell multiplier applies to **final ECP** (after PP × heroBonus × raceBonus + ClanBonus).
- `battle_supply` and `spy_veil` are checked per attack/spy mission; others via tribe_spells table.

---

## 17. Race Bonuses

**Source:** `config/balance.config.ts:689-713`, `app/api/attack/route.ts:32-44`

| Race | Attack Bonus | Defense Bonus | Spy/Scout Bonus |
|---|---|---|---|
| orc | +0.10 ECP | +0.03 ECP | — |
| human | +0.03 ECP | — | — |
| elf | — | — | +0.20 spy power, +elf.scoutBonus scout |
| dwarf | — | +0.15 ECP | — |

- Orc / human bonuses are applied as `raceBonus` in `calculateECP()` — multiply PP only, not ClanBonus.
- Elf bonus applied inside `calcSpyPower()` and `calcScoutDefense()` in the spy route.
- Dwarf defense bonus applied as `defenderRaceBonus` in `getDefenderRaceBonus()`.

---

## 18. Clan / Tribe Combat Bonus

**Source:** `lib/game/combat.ts:349-393`, `config/balance.config.ts:198-217`

```
ClanBonus_raw = tribes.power_total × EFFICIENCY[tribe.level]
ClanBonus     = min(ClanBonus_raw, BONUS_CAP_RATE × PlayerPP)
             = min(ClanBonus_raw, 0.20 × PlayerPP)
```

Clan efficiency by tribe level:

| Level | Efficiency |
|---|---|
| 1 | 5% |
| 2 | 8% |
| 3 | 10% |
| 4 | 12% |
| 5 | 15% |

- `tribes.power_total` = sum of all member `power_total` values (recalculated each tick).
- ClanBonus is **additive**, never multiplied by hero or race bonus.
- Returns 0 for clanless players.

---

## 19. Bank System

**Source:** `lib/game/tick.ts:88-96`, `config/balance.config.ts:369-398`, `app/api/bank/deposit/route.ts`

### Theft Protection

100% of banked gold is safe from loot (`theftProtection = 1.0`). Only `resources.gold` (unbanked) is stealable.

### Deposits

- Max lifetime deposits: **5 total** (not per day, per lifetime — `maxLifetimeDeposits = 5`).
- Max per-day deposits: **5** (`depositsPerDay = 5`, resets at midnight).
- Max deposit amount: `floor(resources.gold × 1.0)` — up to 100% of unbanked gold.

### Interest

Applied once per calendar day when a tick crosses midnight:

```
interest = floor(bank.balance × INTEREST_RATE_BY_LEVEL[bank.interest_level])
```

| Interest Level | Rate |
|---|---|
| 0 (default) | 0.0% |
| 1 | 0.5% |
| 2 | 0.75% |
| 3 | 1.0% |
| … | … |
| 10 (max) | 3.0% |

Upgrade cost: `upgradeBaseCost = 2,000 gold` (exact formula in `/api/bank/upgrade` route — likely exponential growth).

---

## 20. Resource Production (Slave Output)

**Source:** `lib/game/tick.ts:42-65`

```
devOffset = (devLevel - 1) × DEV_OFFSET_PER_LEVEL (0.5)

rateMin = (baseMin + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)
rateMax = (baseMax + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)

productionPerTick[resource] = floor(slaves_allocated × rateMin)
                           to floor(slaves_allocated × rateMax)
                              (randomized per tick between min and max)
```

| Constant | Value |
|---|---|
| `baseMin` | 1.0 |
| `baseMax` | 3.0 |
| `DEV_OFFSET_PER_LEVEL` | 0.5 |

- City multipliers are `[TUNE: unassigned]` — default 1 until set.
- VIP multiplier: ×1.10 if VIP active.
- `production_blessing` tribe spell: `slaveBonus` passed as `BALANCE.tribe.spellEffects.production_blessing.productionMultiplier - 1 = 0.20`.
- Slaves are assigned via `/api/mine/allocate`. **All slaves produce all 4 resources simultaneously** — there is no per-resource slave assignment in the DB currently.

---

## 21. Population & Training Costs

**Source:** `config/balance.config.ts:403-436`, `lib/game/tick.ts:29-36`

### Population Growth (per tick)

```
growth = floor(populationPerTick[population_level] × vipMult)
```

| Population Level | Base Growth/tick |
|---|---|
| 1 | 2 |
| 2 | 4 |
| … | +2 per level |
| 10 | 20 |

### Training Costs (per unit)

| Unit | Gold Cost | Population Cost |
|---|---|---|
| soldier | 60 | 1 free_pop |
| spy | 80 | 1 free_pop |
| scout | 80 | 1 free_pop |
| slave | 0 | 1 free_pop → removed from free_pop, added to slaves |
| cavalry | 10,000 | 5 free_pop |

- Cavalry can be trained without prior soldiers.
- No capacity cap — only gold + free_population gate training.
- **Training is irreversible.** `POST /api/training/untrain` returns 410 Gone (tombstone route). All unit conversions are one-way.

### Advanced Training (combat skill upgrades)

```
// Per upgrade, all 4 skills share the same cost:
advancedCost = { gold: 5,000, food: 5,000 }

// With exponential growth above EXPONENTIAL_GROWTH_FLOOR:
// cost doubles when gold portion >= EXPONENTIAL_GROWTH_FLOOR (10,000)
```

Effect: `+8% per level` on attack/defense/spy/scout effectiveness:
```
trainMult = 1 + skill_level × advancedMultiplierPerLevel (0.08)
```

---

## 22. Development System Effects

**Source:** `lib/game/power.ts:80-84`, `lib/game/tick.ts:42-65`, `config/balance.config.ts`

| Development | PP Contribution | Combat Effect |
|---|---|---|
| gold_level | 50 PP/level | none direct |
| food_level | 50 PP/level | none direct |
| wood_level | 50 PP/level | none direct |
| iron_level | 50 PP/level | none direct |
| population_level | 75 PP/level | population growth rate |
| fortification_level | 100 PP/level | defense multiplier |

**Fortification defense multiplier:**
```
fortMult = 1 + (fortification_level - 1) × FORTIFICATION_MULT_PER_LEVEL (0.10)
// Level 1: ×1.0, Level 2: ×1.10, Level 3: ×1.20, ...
```

Applied to `power_defense` stored column. Also applied inside `calculatePersonalPower` → `calcDevScore`.

**Slave production dev level:**
```
rateMin/max += (devLevel - 1) × 0.5 per level (additive offset to production rate range)
```

---

## 23. Ranking / Power Total

**Source:** `app/api/attack/route.ts:418-427`, `lib/game/power.ts:116-128`

```
power_total = power_attack + power_defense + power_spy + power_scout
```

Recalculated after every action that changes army, weapons, training, or development.

### Global Rank

```
rank_global = (count of players with power_total > this player's power_total)
            + (count of players with same power_total AND earlier joined_at)
            + 1
```

### City Rank

Same formula, filtered to `city = this_player.city`.

Ranks are stored on `players.rank_global` and `players.rank_city`, updated after each attack. Tick also updates all ranks for all players.

---

## 24. Important Caps & Cooldowns (Summary)

| Limit | Value | Tag |
|---|---|---|
| Turn regen cap | 200 | [FIXED] |
| Purchased turns cap | 5000 | [FIXED] |
| Turns per tick | +3 | [FIXED] |
| Max turns per attack | 10 | [FIXED] |
| Min turns per attack | 1 | [FIXED] |
| Kill cooldown | 6h | [FIXED] |
| Anti-farm decay window | 12h | [FIXED] |
| New player protection | 24h | [FIXED] |
| Hero bonus cap (any category) | 50% | [FIXED] |
| Clan bonus cap | 20% of player PP | [FIXED] |
| Max tribe members | 20 | [FIXED] |
| Max attacker loss rate | 30% | [FIXED] |
| Max defender loss rate | 30% | [FIXED] |
| Attacker minimum loss | 3% | [TUNE] |
| Defender minimum bleed | 5% | [TUNE] |
| Max lifetime bank deposits | 5 | [FIXED] |
| Max bank interest level | 10 | [FIXED] |
| Rate limit (attack/spy) | 1 request/second | [FIXED] |

---

## 25. Server-Authoritative RPCs

All game mutations use `createAdminClient()` (service role, bypasses RLS). All critical mutations go through Postgres RPCs with `FOR UPDATE` row locks.

### `attack_resolve_apply`

**Source:** `supabase/migrations/0013_attack_resolve_rpc.sql`
**Called from:** `app/api/attack/route.ts:365`

15 parameters. In one transaction:
1. Acquires `FOR UPDATE` locks on attacker and defender rows (ascending UUID order — deadlock-safe)
2. Re-validates turns ≥ used, food ≥ cost, soldiers > 0, same city (TOCTTOU-safe)
3. Deducts turns from attacker
4. Updates attacker army (soldiers − losses, slaves + captives)
5. Updates attacker resources (food − cost + stolen loot)
6. Updates defender army (soldiers − losses)
7. Updates defender resources (− stolen loot, floor at 0)
8. Inserts `attacks` row with full combat record

### `spy_resolve_apply`

**Source:** `supabase/migrations/0014_spy_resolve_rpc.sql`
**Called from:** `app/api/spy/route.ts:329`

In one transaction:
1. Locks attacker rows
2. Re-validates turns + spies count
3. Deducts turns
4. Deducts caught spies from `army.spies`
5. Inserts `spy_history` row with full intel snapshot

### Other Relevant RPCs

| RPC | Purpose | Migration |
|---|---|---|
| `tribe_contribute_mana_apply` | Transfer personal mana → tribe mana | 0020 |
| `tribe_upgrade_level_apply` | Spend tribe mana to upgrade level | 0022 |
| `tribe_set_member_role_apply` | Atomic role change with deputy cap | 0020 |
| `tribe_transfer_leadership_apply` | Atomic 3-write leader transfer | 0020 |
| `tribe_collect_member_tax` | Daily gold tax, idempotent | 0020 |
| `fulfill_lemon_purchase` | Grant mana+turns from payment, idempotent | 0030 |
| `bank_interest_upgrade_apply` | Upgrade bank interest level | earlier |

---

## 26. Known Inconsistencies / Open Questions

### 1. Spy Gear Divergence (confirmed mismatch)

`app/api/spy/route.ts:calcSpyPower()` only checks 3 spy gear items:
`shadow_cloak`, `dark_mask`, `elven_gear`.

`lib/game/power.ts:calcSpyPower()` checks all 8 gear items via `SPY_GEAR_MULT` keys.

The **attack route** uses `power.ts` (all 8 gear items) for PP calculation.
The **spy route** uses its own local function (3 gear items only).

**Impact:** Players with high-tier spy gear (`mystic_cloak`, `shadow_veil`, `phantom_shroud`, `arcane_veil`) get full PP contribution but get **no spy mission power boost** from those items. This is likely a bug.

### 2. Mine Allocation is Informational Only

`/api/mine/allocate` stores slave assignments for display, but the tick applies **all slaves equally to all 4 resources** regardless of per-resource assignment. There are no separate DB columns for per-resource allocation in production. Source: MEMORY.md "Known Design Limitations."

### 3. City Production Multipliers Unassigned

`BALANCE.cities.slaveProductionMultByCity` values are `[TUNE: unassigned]` — all default to 1 until explicitly set. City affects gameplay routing but not production rates currently.

### 4. Bank Interest VIP Bonus Unimplemented

`BALANCE.vip.bankInterestBonus = 0` — VIP does not boost bank interest yet. The `vipUntil` param in `calcBankInterest()` is accepted but suppressed with `void vipUntil`.

### 5. Cavalry Losses Not Tracked in BattleReport

`battleReport.attacker.losses = { soldiers: attLossesScaled, cavalry: 0 }` — cavalry losses are hardcoded to 0 in the battle report. In combat, `deployedSoldiers = attArmy.soldiers` (not cavalry), so cavalry are not included in loss calculation either. Cavalry contribute to PP but are not deployed/lost in combat.

### 6. Advanced Training Cost is Flat (no real exponential currently)

The comment in balance.config.ts mentions exponential growth above `EXPONENTIAL_GROWTH_FLOOR = 10,000`. Whether the actual upgrade route implements this correctly should be verified in `app/api/training/advance/route.ts`.

---

*Document written from codebase trace on 2026-03-13. All formulas verified against actual runtime code. Cite this file when discussing balance changes — update it when implementation changes.*
