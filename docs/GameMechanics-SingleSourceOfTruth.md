# Domiron v5 — Game Mechanics: Single Source of Truth

**Generated:** 2026-03-04
**Status:** Authoritative. Every statement is backed by a code reference. Anything unverified is explicitly marked.

---

## Source Files (ground truth)

| Role | File |
|---|---|
| All game constants | `config/balance.config.ts` |
| Combat engine (pure) | `lib/game/combat.ts` |
| Tick calculations (pure) | `lib/game/tick.ts` |
| Stored power calc | `lib/game/power.ts` |
| Hero effect system | `lib/game/hero-effects.ts` |
| Season management | `lib/game/season.ts` |
| Catch-up multiplier | `lib/utils.ts` → `getCatchUpMultiplier()` |
| Combat resolution API | `app/api/attack/route.ts` |
| Spy mission API | `app/api/spy/route.ts` |
| Tick cron handler | `app/api/tick/route.ts` |
| Registration | `app/api/auth/register/route.ts` |
| DB schema | `supabase/migrations/0001_initial.sql` |

---

## Table of Contents

1. [Tick System](#1-tick-system)
2. [Resource Production](#2-resource-production)
3. [Population System](#3-population-system)
4. [Training System](#4-training-system)
5. [Combat System — Personal Power (PP)](#5-combat-system--personal-power-pp)
6. [Combat System — Effective Combat Power (ECP)](#6-combat-system--effective-combat-power-ecp)
7. [Combat System — Resolution](#7-combat-system--resolution)
8. [Spy System](#8-spy-system)
9. [Hero Effect System](#9-hero-effect-system)
10. [Clan / Tribe System](#10-clan--tribe-system)
11. [Bank System](#11-bank-system)
12. [Weapons System](#12-weapons-system)
13. [Development Upgrades](#13-development-upgrades)
14. [City System & Progression](#14-city-system--progression)
15. [Season System & Freeze Mode](#15-season-system--freeze-mode)
16. [Catch-Up Multiplier (Late Join)](#16-catch-up-multiplier-late-join)
17. [Stored Power vs. Combat PP](#17-stored-power-vs-combat-pp)
18. [Race Bonuses](#18-race-bonuses)
19. [VIP System](#19-vip-system)
20. [Registration Flow](#20-registration-flow)
21. [Rankings](#21-rankings)
22. [Known Gaps / Inconsistencies / Missing / Tuning Needed](#22-known-gaps--inconsistencies--missing--tuning-needed)

---

## 1. Tick System

**Trigger:** Vercel Cron — `GET /api/tick` every 30 minutes, authenticated via `x-cron-secret` header.
**Files:** `lib/game/tick.ts` → `calcTurnsToAdd()`, `app/api/tick/route.ts`

### Turn Regen

```
if currentTurns >= MAX_TURNS:
    return MAX_TURNS  (no change — already capped)

if isVacation:
    toAdd = ceil(turnsPerTick × vacationTurnsMultiplier)
            = ceil(3 × 0.33) = 1
else:
    toAdd = turnsPerTick = 3

newTurns = min(currentTurns + toAdd, MAX_TURNS)
```

| Constant | Value | Annotation |
|---|---|---|
| `tick.turnsPerTick` | 3 | [FIXED] |
| `tick.maxTurns` | 200 | [FIXED] |
| `season.vacationTurnsMultiplier` | 0.33 | [TUNE] |
| Effective vacation regen | 1 turn/tick | Derived: ceil(3×0.33)=1 |

**DB:** `players.turns`, `players.is_vacation`
**Route:** `app/api/tick/route.ts` line 69

> ⚠️ **[INCONSISTENT]** `players.max_turns` DB column default = 30; `BALANCE.tick.maxTurns` = 200. The DB column is not used in any formula — the BALANCE constant governs all logic. The DB column is dead weight.

### Tick Processing Order

Per player (sequential in loop, per-player writes parallel):

1. Turns → `calcTurnsToAdd(player.turns, player.is_vacation)`
2. Population growth → `calcPopulationGrowth(dev.population_level, player.vip_until)`
3. Slave production per resource → 4× `calcSlaveProduction(slaves_X, dev.X_level, city, vip_until)`
4. Hero mana → `calcHeroManaGain(hero.level, player.vip_until)`
5. Bank interest (only when calendar day changes) → `calcBankInterest(...)`

Then globally:

6. Tribe mana per tribe → `calcTribeManaGain(memberCount)`
7. Power recalculation → `recalculatePower(playerId, supabase)` for all players
8. Rankings update (global + per-city)
9. Realtime broadcast → `broadcastTickCompleted(supabase)`

---

## 2. Resource Production

**Files:** `lib/game/tick.ts` → `calcSlaveProduction()`, `app/api/tick/route.ts`

### Slave Production Formula

Each slave must be manually assigned to a resource type via `/api/mine/allocate`. Unassigned slaves produce nothing.

```
devOffset = (devLevel - 1) × 0.5

rateMin = (baseMin + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)
rateMax = (baseMax + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)

produced = random integer in [floor(slavesAllocated × rateMin), floor(slavesAllocated × rateMax)]
```

Random value in the tick route:
```
goldGained = floor(goldProd.min + random() × (goldProd.max - goldProd.min))
```

| Constant | Value | Annotation |
|---|---|---|
| `production.baseMin` | 1.0 | [TUNE] |
| `production.baseMax` | 3.0 | [TUNE] |
| devOffset per level | +0.5 | Hardcoded in `tick.ts:55` |
| `cities.CITY_PRODUCTION_MULT[1..5]` | ALL `undefined` | [TUNE: unassigned] — code defaults to `?? 1` |

**DB columns involved:** `army.slaves_gold`, `army.slaves_iron`, `army.slaves_wood`, `army.slaves_food`
**Allocation route:** `POST /api/mine/allocate`
**Constraint:** `slaves_gold + slaves_iron + slaves_wood + slaves_food ≤ army.slaves`

### Farmer Contribution to Food

Farmers are added to `slaves_food` count for production calculation only:
```
foodProd = calcSlaveProduction(army.slaves_food + army.farmers, dev.food_level, city, vip_until)
```

`lib/game/tick.ts` line 80 in the tick route. Farmers use the same production formula as food slaves.

### Hero Slave Bonus

Applied as `(1 + slaveBonus)` multiplier where `slaveBonus` = `totalSlaveBonus` from active hero effects (0.0–0.50).

> ⚠️ **[MISSING]** The tick route does **not** fetch hero effects per player. `calcSlaveProduction` accepts a `slaveBonus` parameter but the tick route always passes the default `0`. Hero slave bonuses are **not applied** during tick processing.

### Race Gold Bonus

`raceGoldBonus` parameter exists in `calcSlaveProduction` signature but the tick route always passes the default `0`. Race gold bonuses (`human: +15%`, `dwarf: +3%`) are **not applied** during production.

> ⚠️ **[MISSING]** Neither hero slave bonus nor race gold bonus are fed into the tick production loop.

---

## 3. Population System

**Files:** `lib/game/tick.ts` → `calcPopulationGrowth()`, `app/api/training/train/route.ts`

### Growth Formula

```
base = BALANCE.training.populationPerTick[populationLevel]  // lookup table
vipMult = isVipActive(vip_until) ? 1.10 : 1.0
newPop = floor(base × vipMult)
```

Population Growth Table:

| Level | Base pop/tick |
|---|---|
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 8 |
| 7 | 10 |
| 8 | 14 |
| 9 | 18 |
| 10 | 23 |

Source: `config/balance.config.ts` `training.populationPerTick`

**DB:** `army.free_population`, `development.population_level`

### Starting Population

New players begin with `free_population = 50`.
Source: `BALANCE.startingResources.startingPopulation = 50`, set in `app/api/auth/register/route.ts:104`.

### Population Consumption / Return

| Action | free_population effect |
|---|---|
| Train soldier | −amount |
| Train slave | −amount |
| Train spy | −amount |
| Train scout | −amount |
| Train farmer | −amount |
| Train cavalry | **no change** (uses existing soldiers) |
| Untrain soldier | +amount |
| Untrain spy | +amount |
| Untrain scout | +amount |
| Untrain farmer | +amount |
| Untrain cavalry | **[MISSING]** not supported — no route |
| Combat losses | **no change** (soldiers lost ≠ population returned) |

Source: `app/api/training/train/route.ts`, `app/api/training/untrain/route.ts`

---

## 4. Training System

**Files:** `app/api/training/train/route.ts`, `app/api/training/untrain/route.ts`
**Balance:** `config/balance.config.ts` → `BALANCE.training`

### Unit Costs

| Unit | Gold cost | Capacity cost | Population cost | Special requirement |
|---|---|---|---|---|
| soldier | 60 | 1 | 1 free_pop | — |
| slave | 0 | 0 | 1 free_pop | — |
| spy | 80 | 1 | 1 free_pop | — |
| scout | 80 | 1 | 1 free_pop | — |
| cavalry | 200 | 2 | **0** | amount × 5 existing soldiers |
| farmer | 20 | 0 | 1 free_pop | — |

Source: `BALANCE.training.unitCost`

### Capacity System

```
capacity = baseCapacity + fortification_level × capacityPerDevelopmentLevel
         = 1000         + fortification_level × 200
```

Capacity is stored in `players.capacity` and updated whenever fortification upgrades.

| Constant | Value |
|---|---|
| `training.baseCapacity` | 1,000 |
| `training.capacityPerDevelopmentLevel` | 200 |

> ⚠️ **[INCONSISTENT]** `players.capacity` DB default = 2,500. But formula at level 1 fortification = 1,000 + 1×200 = 1,200. DB default does not match formula. Only `fortification_level` upgrades update the stored capacity.

### Gate Order (train route)

1. Auth check → 401
2. Season freeze check → 423
3. Input validation (unit, amount ≥ 1)
4. Fetch army + resources
5. Gold sufficiency check
6. Capacity check (soldiers/spies/scouts: capacity − current ≥ amount)
7. Free population check (if not cavalry)
8. Cavalry ratio check (if cavalry: soldiers ≥ amount × 5)
9. DB writes: resources (deduct gold), army (add unit, deduct free_pop if applicable)
10. Recalculate power

### Gate Order (untrain route)

1. Auth check → 401
2. Season freeze check → 423
3. Unit must be soldier/spy/scout/farmer (cavalry untrain **[MISSING]**)
4. Sufficient units exist
5. DB writes: army (deduct unit, add free_pop)

### Advanced Training (Skills)

Skills: `attack_level`, `defense_level`, `spy_level`, `scout_level` (all in `training` table).

Cost per level-up: `{ gold: 300, food: 300 }`
Effect: `multiplier = 1 + level × 0.08` applied to the relevant power calculation.

Source: `BALANCE.training.advancedCost`, `BALANCE.training.advancedMultiplierPerLevel = 0.08`

---

## 5. Combat System — Personal Power (PP)

**File:** `lib/game/combat.ts` → `calculatePersonalPower()`

### Formula

```
PP = floor(
    soldierScore × W_SOLDIERS      (1.0)
  + equipScore   × W_EQUIPMENT     (1.0)
  + skillScore   × W_SKILLS        (1.0)
  + min(devScore, DEV_CAP) × W_DEV (1.0)
  + spyScore     × W_SPY           (1.0)
)
```

All component weights = 1.0 ([TUNE: placeholder] — intended distribution is soldiers ~45%, equipment ~25%, skills ~15%, dev ~10%, spy ~5%).

### Sub-Scores

**SoldierScore:**
```
TierValue[tier] = SOLDIER_V × SOLDIER_K ^ (tier − 1)
SoldierScore = Σ Count[tier] × TierValue[tier]

Tier 1 (soldiers):  1 × 3^0 = 1 PP each
Tier 2 (cavalry):   1 × 3^1 = 3 PP each
```

Constants: `SOLDIER_V = 1` [TUNE: placeholder], `SOLDIER_K = 3` [TUNE: placeholder]

**EquipScore:** Defined below in §12.

**SkillScore:**
```
SkillScore = attack_level × 100
           + defense_level × 100
           + spy_level × 80
           + scout_level × 80
```

**DevScore:**
```
DevScore = gold_level × 50 + food_level × 50 + wood_level × 50
         + iron_level × 50 + population_level × 75 + fortification_level × 100
DevScoreCapped = min(DevScore, 10,000)
```

**SpyScore:**
```
SpyScore = spies × 5 + scouts × 5
```

### What Triggers PP Recalculation

PP recalculates (via `recalculatePower()`) after:
- Soldier/cavalry count changes (train, untrain, combat losses)
- Equipment changes (buy, sell)
- Skill level changes (advanced training)
- Fortification level changes (development upgrade)
- Every tick (global recalc for all players)

PP does **not** recalculate on: clan join/leave, hero activation, resource changes, city migration alone.

---

## 6. Combat System — Effective Combat Power (ECP)

**File:** `lib/game/combat.ts` → `calculateECP()`, `calculateClanBonus()`

### Clan Bonus

```
efficiencyRate = CLAN.EFFICIENCY[clan.developmentLevel]
raw = clan.totalClanPP × efficiencyRate
cap = CLAN.BONUS_CAP_RATE × playerPP   (= 0.20 × playerPP)
ClanBonus = floor(min(raw, cap))
```

If player has no clan: `ClanBonus = 0`

| Dev Level | Efficiency Rate |
|---|---|
| 1 | 0.05 |
| 2 | 0.08 |
| 3 | 0.10 |
| 4 | 0.12 |
| 5 | 0.15 |

Source: `BALANCE.clan.EFFICIENCY`, all [FIXED]

### ECP Formula

```
ECP = floor((PlayerPP × (1 + heroBonus)) + ClanBonus)
```

`heroBonus` = `totalAttackBonus` (attacker) or `totalDefenseBonus` (defender), clamped to [0, 0.50].

**Invariant:** Hero bonus multiplies PP **only** — never ClanBonus. This prevents the monetization lever from amplifying the social mechanic.

**Defensive clamp:** `calculateECP()` itself calls `clampBonus(heroBonus)` internally even if the caller already clamped. Callers are still expected to pre-clamp. Source: `lib/game/combat.ts` — added 2026-03-04.

**DB:** `tribes.power_total` (for ClanContext), `tribes.level` (for efficiency lookup)

---

## 7. Combat System — Resolution

**Files:** `lib/game/combat.ts` → `resolveCombat()`, `app/api/attack/route.ts`

### Attack Gates (route order)

1. Auth check → 401
2. Input validation: `{ defender_id: UUID, turns: int 1–10 }` → 400
3. Self-attack check → 400
4. Season freeze → 423
5. Fetch attacker data (player, army, weapons, training, development, resources, tribe)
6. Attacker has enough turns → 400
7. Attacker has enough food (`turns × 1`) → 400
8. Attacker has soldiers > 0 → 400
9. Fetch defender data
10. Defender exists → 404
11. Fetch clan data for both sides
12. Count kill cooldown (attacker→defender kills in last 6h)
13. Count loot decay (attacker→defender attacks in last 12h)
14. Fetch hero effects for attacker → **throws `HeroEffectsUnavailableError` on DB error → 503**
15. Fetch hero effects for defender → **throws `HeroEffectsUnavailableError` on DB error → 503**
16. Calculate PP for both sides
17. `resolveCombat()` → result
18. DB writes (6 parallel): turns, attacker army+resources, defender army+resources, attacks insert
19. Recalculate power for both players

> **Food cost** in the route: `foodCost = turnsUsed × BALANCE.combat.foodCostPerTurn` (= turns × 1).
> `calculateFoodCost(deployedSoldiers)` function in `combat.ts` uses `soldiers × FOOD_PER_SOLDIER` — **this function is not called by the route**. See §22.

> **Deployed soldiers:** The route always passes `attArmy.soldiers` as `deployedSoldiers` — meaning **all soldiers are always deployed**. There is no partial deployment mechanic.

### Combat Resolution Order of Operations

```
Step 1: attackerECP = calculateECP(attackerPP, attackerClan, attackBonus)
        defenderECP = calculateECP(defenderPP, defenderClan, defenseBonus)

Step 2: ratio   = attackerECP / defenderECP  (or WIN_THRESHOLD + 1 if defenderECP = 0)
        outcome = determineCombatOutcome(ratio)

Step 3: losses  = calculateSoldierLosses(deployedSoldiers, defenderSoldiers, ratio,
                    killCooldownActive, attackerIsProtected, defenderIsProtected)

Step 4: Soldier Shield applied (AFTER Step 3):
        if soldierShieldActive || defenderIsProtected || killCooldownActive:
            defenderLosses = 0

Step 5: rawLoot = calculateLoot(defenderUnbanked, outcome, attackCountInWindow, defenderIsProtected)

Step 6: Resource Shield applied (AFTER Step 5):
        if resourceShieldActive:
            loot = { gold: 0, iron: 0, wood: 0, food: 0 }
        else:
            loot = rawLoot
```

### Outcome Thresholds

```
R ≥ WIN_THRESHOLD  (1.30) → 'win'
R < LOSS_THRESHOLD (0.75) → 'loss'
otherwise                  → 'partial'
```

DB maps `'partial' → 'draw'` on insert (attacks table constraint). Source: `attack/route.ts:262`

### Soldier Loss Rates

```
rawAttackerRate  = BASE_LOSS / max(ratio, 0.01)
rawDefenderRate  = BASE_LOSS × ratio

attackerLossRate = attackerIsProtected ? 0 : clamp(rawAttackerRate, ATTACKER_FLOOR, MAX_LOSS_RATE)
defenderLossRate = (killCooldown || defenderIsProtected) ? 0 : clamp(rawDefenderRate, DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)

attackerLosses = floor(deployedSoldiers × attackerLossRate)
defenderLosses = floor(defenderSoldiers × defenderLossRate)
```

| Constant | Value | Annotation |
|---|---|---|
| `combat.BASE_LOSS` | 0.15 | [TUNE: placeholder] |
| `combat.MAX_LOSS_RATE` | 0.30 | [FIXED] |
| `combat.DEFENDER_BLEED_FLOOR` | 0.05 | [TUNE] |
| `combat.ATTACKER_FLOOR` | 0.03 | [TUNE] |

### Loot Formula

```
if defenderIsProtected || outcome == 'loss':
    loot = 0 per resource

outcomeMult = { win: 1.0, partial: 0.5, loss: 0.0 }
decayFactor = LOOT_DECAY_STEPS[min(attackCount − 1, 4)]
totalMult   = BASE_LOOT_RATE × outcomeMult × decayFactor
loot[r]     = floor(unbanked[r] × totalMult)
```

| Constant | Value | Annotation |
|---|---|---|
| `combat.BASE_LOOT_RATE` | 0.20 | [FIXED] |
| `antiFarm.DECAY_WINDOW_HOURS` | 12 | [FIXED] |
| `antiFarm.LOOT_DECAY_STEPS` | [1.0, 0.70, 0.40, 0.20, 0.10] | Attack 1–5+ |

**Loot is from unbanked resources only.** Banked gold is `theftProtection = 1.0` safe.

### New Player Protection

```
gateMs = protectionStartDays × 24h × 3600 × 1000    (= 10 days in ms)
if (now − seasonStart) < gateMs:
    return false    (no protection during first 10 days of season)

protectionMs = PROTECTION_HOURS × 3600 × 1000    (= 24h in ms)
return (now − playerCreatedAt) < protectionMs
```

When `defenderIsProtected`: `defenderLosses = 0`, `loot = 0`.
When `attackerIsProtected`: `attackerLosses = 0`.
**Attack is never blocked.** Attacker always pays turns + food.

### Kill Cooldown

- Window: 6 hours per `(attacker_id, defender_id)` pair
- Trigger: any attack where `defender_losses > 0`
- Effect: `defenderLosses = 0` (attacker still loses normally; loot still applies)
- DB query: counts rows in `attacks` WHERE `attacker_id=$1 AND defender_id=$2 AND defender_losses>0 AND created_at >= (now − 6h)`

### Food Cost (actual)

```
foodCost = turnsUsed × foodCostPerTurn    (= turns × 1)
```

`foodCostPerTurn = 1` — one food per turn used (not per soldier).
**Note:** `calculateFoodCost(deployedSoldiers)` in `combat.ts` is a separate function using `FOOD_PER_SOLDIER` but is **not called** by the attack route (see §22).

### Slaves from Combat

**Zero.** `attacks` table has `slaves_taken` column but it is always inserted as `0`. `CAPTURE_RATE` and `convertKilledToSlaves` have been removed from the codebase.

---

## 8. Spy System

**File:** `app/api/spy/route.ts`
**Balance:** `BALANCE.spy`

### Spy Power Formula

```
spyTrainMult  = 1 + spy_level   × 0.08
scoutTrainMult = 1 + scout_level × 0.08

spyWeaponMult  = 1.0
    × (shadow_cloak > 0 ? 1.15 : 1)
    × (dark_mask > 0    ? 1.30 : 1)
    × (elven_gear > 0   ? 1.50 : 1)

scoutWeaponMult = 1.0
    × (scout_boots > 0  ? 1.15 : 1)
    × (scout_cloak > 0  ? 1.30 : 1)
    × (elven_boots > 0  ? 1.50 : 1)

raceMult (spy)   = elf ? 1.20 : 1.0
raceMult (scout) = elf ? 1.20 : 1.0

spyPower     = floor(spies_sent × spyTrainMult   × spyWeaponMult  × raceMult_spy)
scoutDefense = floor(scouts     × scoutTrainMult × scoutWeaponMult × raceMult_scout)
```

### Success / Failure

```
success = spyPower > scoutDefense

if failure:
    ratio       = min(scoutDefense / max(spyPower, 1), 1.0)
    spiesCaught = min(
        floor(spies_sent × catchRate × ratio),
        floor(spies_sent × MAX_CATCH_RATE)
    )
```

| Constant | Value | Annotation |
|---|---|---|
| `spy.turnCost` | 1 | [TUNE] |
| `spy.minSpies` | 1 | [FIXED] |
| `spy.catchRate` | 0.30 | [TUNE] |
| `spy.MAX_CATCH_RATE` | 0.80 | [FIXED] |

### Spy Mission Gates

1. Auth → 401
2. Season freeze → 423
3. Input: `{ target_id: UUID, spies_sent: int ≥ 1 }`
4. Self-spy check → 400
5. Fetch attacker (player, army, weapons, training)
6. `spies_sent ≤ army.spies` → 400
7. `player.turns ≥ turnCost` → 400
8. Fetch target (player, army, weapons, training)

### Data Revealed on Success

```json
{
  "army_name", "soldiers", "spies", "scouts", "cavalry", "slaves", "farmers",
  "gold", "iron", "wood", "food",
  "power_attack", "power_defense", "power_spy", "power_scout", "power_total",
  "soldier_shield_active": bool,
  "resource_shield_active": bool
}
```

Shield active state is revealed — expiration time is NOT.

### DB Writes (spy route)

1. `players.update({turns: turns − turnCost})`
2. `army.update({spies: spies − spiesCaught})` (only if caught > 0)
3. `spy_history.insert({spy_owner_id, target_id, success, spies_caught, data_revealed, season_id})`

---

## 9. Hero Effect System

**File:** `lib/game/hero-effects.ts`

### Effect Types

| Type | Category | Rate | Stacks? |
|---|---|---|---|
| `SLAVE_OUTPUT_10` | Production | +0.10 | Yes |
| `SLAVE_OUTPUT_20` | Production | +0.20 | Yes |
| `SLAVE_OUTPUT_30` | Production | +0.30 | Yes |
| `ATTACK_POWER_10` | Combat ECP | +0.10 | Yes |
| `DEFENSE_POWER_10` | Combat ECP | +0.10 | Yes |
| `RESOURCE_SHIELD` | Shield | loot=0 | N/A |
| `SOLDIER_SHIELD` | Shield | defLosses=0 | N/A |

### Stacking & Clamping

```
TotalBonus[category] = min( Σ EFFECT_RATES[e_i], MAX_STACK_RATE )
MAX_STACK_RATE = 0.50   [FIXED]
```

`clampBonus(total, max = 0.50)` — called at `calcActiveHeroEffects()` output and defensively inside `calculateECP()`.

### Active Effect Query

```sql
SELECT * FROM player_hero_effects
WHERE player_id = $1 AND ends_at > now()
```

Source: `lib/game/hero-effects.ts:147–150`

### Shield Timing Model

```
|-- SHIELD_ACTIVE_HOURS (23h) --|-- SHIELD_COOLDOWN_HOURS (1h) --|
         active window                 vulnerability window
```

- Active: `now < ends_at`
- Vulnerability: `ends_at ≤ now < cooldown_ends_at`
- Next activation allowed: only after `cooldown_ends_at`

### DB Error Behavior

**`getActiveHeroEffects()` throws `HeroEffectsUnavailableError` on any DB error.**

Attack route catches `HeroEffectsUnavailableError` before the generic 500 handler and returns:
```json
HTTP 503
{ "error": "HeroEffectsUnavailable", "message": "Temporary issue loading hero effects. Please try again." }
```

No DB state is modified (attack aborted before `resolveCombat()`).

Source: `lib/game/hero-effects.ts:HeroEffectsUnavailableError`, `app/api/attack/route.ts` catch block.

> The old behavior (fail-safe all-zeros fallback) was **removed** on 2026-03-04. An empty result (no active effects) still returns all-zeros normally — only a DB error triggers 503.

### Mana Regen (per tick)

```
mana = base (1)
     + (heroLevel >= 10 ? level10bonus : 0)   (+1)
     + (heroLevel >= 50 ? level50bonus : 0)   (+1)
     + (isVipActive ? vipBonus : 0)            (+1)
```

Maximum mana per tick: 4 (level ≥ 50, VIP active).

### Mana Costs (spell purchase)

| Spell | Mana Cost |
|---|---|
| SOLDIER_SHIELD | 10 [TUNE] |
| RESOURCE_SHIELD | 10 [TUNE] |

Source: `BALANCE.hero.SOLDIER_SHIELD_MANA`, `BALANCE.hero.RESOURCE_SHIELD_MANA`

### Hero XP / Leveling

`hero.xpPerLevel = 100` exists in BALANCE and `hero.xp` / `hero.xp_next_level` columns exist in DB. **No route increments XP.** XP is display-only.

### DB Schema

```sql
player_hero_effects:
  id               UUID PK
  player_id        UUID FK players.id ON DELETE CASCADE
  type             TEXT (one of 7 HeroEffectType values)
  starts_at        TIMESTAMPTZ
  ends_at          TIMESTAMPTZ
  cooldown_ends_at TIMESTAMPTZ (null for non-shield effects)
  metadata         JSONB
```

---

## 10. Clan / Tribe System

**Files:** `app/api/tribe/*/route.ts`, `lib/game/combat.ts` → `calculateClanBonus()`

### Clan Rules

- Max members: 20 (`BALANCE.clan.maxMembers`)
- Clan is locked to a single city (`tribes.city`)
- Player must **leave clan** before city migration
- Post-migration clan join cooldown: 48h
- Normal leave cooldown: 10 minutes

### Clan Combat Bonus (see also §6)

```
ClanBonus = floor(min(clan.power_total × EFFICIENCY[clan.level], 0.20 × playerPP))
```

Applied additively to ECP. Never multiplied by hero bonus.

### Tribe Mana

**Regen per tick:**
```
manaGain = max(1, floor(memberCount × 1))
```

`BALANCE.tribe.manaPerMemberPerTick = 1` [TUNE]

**Tax → Mana conversion:**
`POST /api/tribe/pay-tax`: `tax_amount` gold deducted from player → `tax_amount` mana added to tribe (1:1).
Tax limit per city: city1=1000, city2=2500, city3=5000, city4=10000, city5=20000.

### Spells

| Spell Key | Mana Cost | Duration |
|---|---|---|
| `combat_boost` | 20 | 6h |
| `tribe_shield` | 30 | 12h |
| `production_blessing` | 25 | 8h |
| `mass_spy` | 15 | 0h (instant) |
| `war_cry` | 40 | 4h |

Spells are stored in `tribe_spells` table. `mass_spy` is the only implemented spell with a route (`POST /api/tribe/spell`). Effect of other spells on game mechanics: **[MISSING]** — no route consumes them during combat or production.

### Tribe Power

`tribes.power_total` = sum of all member `power_total` values. **[MISSING]** — no route recalculates this automatically. Updated only indirectly via tick recalculation that updates individual `players.power_total`. No aggregation query runs.

> ⚠️ **[INCONSISTENT]** `tribes.power_total` is used in `calculateClanBonus()` for combat but there is no code that updates `tribes.power_total` after individual power changes. It may be stale.

---

## 11. Bank System

**Files:** `app/api/bank/deposit/route.ts`, `app/api/bank/withdraw/route.ts`, `app/api/bank/upgrade/route.ts`

### Deposit

```
today = new Date().toISOString().split('T')[0]
depositsToday = (bank.last_deposit_reset === today) ? bank.deposits_today : 0

Gates:
  depositsToday < depositsPerDay (5)
  amount ≤ floor(resources.gold × maxDepositPercent) = floor(gold × 1.0) = gold
  amount ≤ resources.gold
```

Resets happen lazily at deposit time (not at midnight tick).

| Constant | Value | Annotation |
|---|---|---|
| `bank.depositsPerDay` | 5 | [TUNE] |
| `bank.maxDepositPercent` | 1.0 (100%) | [TUNE] |
| `bank.theftProtection` | 1.0 (100% safe) | [FIXED] |

> ⚠️ **[INCONSISTENT]** `bank.maxLifetimeDeposits = 5` — this field name implies a lifetime limit, but it equals `depositsPerDay = 5` and is **not referenced** in any route. Only `depositsPerDay` is used. The `maxLifetimeDeposits` constant is dead code.

### Withdraw

Gate: `amount ≤ bank.balance`
No daily limit on withdrawals.

### Interest (Bank Upgrade + Tick)

```
upgradeCost = upgradeBaseCost × (currentInterestLevel + 1)
            = 2000 × (level + 1)
```

Interest formula (run once per calendar day in tick):
```
interest = floor(balance × BANK_INTEREST_RATE_BASE)
         + floor(balance × interestLevel × BANK_INTEREST_RATE_PER_LEVEL)
         + floor(balance × vipBankInterestBonus)
```

> ⚠️ **[TUNE: unassigned]** `BANK_INTEREST_RATE_BASE = undefined` and `BANK_INTEREST_RATE_PER_LEVEL = undefined`. Bank interest produces `NaN` in production. The tick code comment explicitly warns: *"Do not call this in production until both are set."*
> `vip.bankInterestBonus = 0` so VIP contributes nothing to interest either.

---

## 12. Weapons System

**Files:** `app/api/shop/buy/route.ts`, `app/api/shop/sell/route.ts`, `lib/game/power.ts`

### Attack Weapons (PP ranking: additive per unit, Combat power: additive per unit)

| Weapon | PP value | Combat power | Max/player | Cost (iron) |
|---|---|---|---|---|
| slingshot | 2 | 2 | 25 | 200 |
| boomerang | 5 | 5 | 12 | 400 |
| pirate_knife | 12 | 12 | 6 | 800 |
| axe | 28 | 28 | 3 | 1,600 |
| master_knife | 64 | 64 | 1 | 3,200 |
| knight_axe | 148 | 148 | 1 | 6,400 |
| iron_ball | 340 | 340 | 1 | 12,800 |

PP values = combat power values (same numbers). PP is **additive per unit**.
Attack power formula in `power.ts`: `(baseUnits + Σ weaponCount×power) × trainMult × raceMult`

### Defense Weapons (PP ranking: binary once owned, Combat power: multiplicative)

| Armor | PP bonus (binary) | Combat multiplier | Cost (gold) |
|---|---|---|---|
| wood_shield | 150 | ×1.10 | 1,500 |
| iron_shield | 800 | ×1.25 | 8,000 |
| leather_armor | 2,500 | ×1.40 | 25,000 |
| chain_armor | 8,000 | ×1.55 | 80,000 |
| plate_armor | 25,000 | ×1.70 | 250,000 |
| mithril_armor | 70,000 | ×1.90 | 700,000 |
| gods_armor | 150,000 | ×2.20 | 1,000,000g + 500,000i + 300,000w |

Defense multipliers **stack multiplicatively**. Full stack: 1.10×1.25×1.40×1.55×1.70×1.90×2.20 ≈ ×29.7.

### Spy / Scout Gear (PP ranking: binary, Combat: multiplicative multiplier on unit power)

| Gear | PP bonus | Combat multiplier | Cost (gold) |
|---|---|---|---|
| shadow_cloak / scout_boots | 500 | ×1.15 | 5,000 |
| dark_mask / scout_cloak | 2,000 | ×1.30 | 20,000 |
| elven_gear / elven_boots | 8,000 | ×1.50 | 80,000 |

### Sell Refund

```
refund = floor(originalCost × sellRefundPercent × amount)
       = floor(cost × 0.20 × amount)
```

20% of original purchase price. Source: `BALANCE.weapons.sellRefundPercent = 0.20`

---

## 13. Development Upgrades

**File:** `app/api/develop/upgrade/route.ts`
**Balance:** `BALANCE.production.developmentUpgradeCost`

### Cost Formula

```
nextLevel = currentLevel + 1

if nextLevel ≤ 2:  costCfg = { gold: 3,   resource: 3   }
elif nextLevel ≤ 3: costCfg = { gold: 9,   resource: 9   }
elif nextLevel ≤ 5: costCfg = { gold: 50,  resource: 50  }
else:               costCfg = { gold: 500, resource: 500 }

totalGold     = costCfg.gold     × nextLevel
totalResource = costCfg.resource × nextLevel
```

Examples:
- Level 1→2: gold = 3×2 = 6, resource = 3×2 = 6
- Level 4→5: gold = 50×5 = 250, resource = 50×5 = 250
- Level 9→10: gold = 500×10 = 5,000, resource = 500×10 = 5,000

### Development Fields

| Field | Resource deducted | Effect |
|---|---|---|
| `gold_level` | gold | production output ↑ |
| `food_level` | food | production output ↑ |
| `wood_level` | wood | production output ↑ |
| `iron_level` | iron | production output ↑ |
| `population_level` | gold (only) | pop growth/tick ↑ |
| `fortification_level` | gold + wood | capacity ↑, defense power ↑ |

Fortification also updates `players.capacity = baseCapacity + level × 200`.

---

## 14. City System & Progression

**Balance:** `BALANCE.cities`

### Cities

| # | Name |
|---|---|
| 1 | Izrahland |
| 2 | Masterina |
| 3 | Rivercastlor |
| 4 | Grandoria |
| 5 | Nerokvor |

### Promotion Thresholds

All promotion parameters are `[TUNE: unassigned]`:
- `S_base`, `s_growth` — soldier threshold formula
- `P_base`, `p_growth` — PP threshold formula
- `R_base[gold/iron/wood/food]`, `r_growth` — resource cost formula

```
SoldierThreshold(C) = S_base × s_growth ^ (C − 2)
PowerThreshold(C)   = P_base × p_growth ^ (C − 2)
ResourceCost(C)[r]  = R_base[r] × r_growth ^ (C − 2)
for C ∈ {2, 3, 4, 5}
```

`promotionRequirements` table exists in BALANCE with `undefined` values.
**No promotion route exists.** City change API: **[MISSING]**.

### City Production Multiplier

`CITY_PRODUCTION_MULT[1..5]` all `undefined`. Tick code defaults to `?? 1` so all cities produce at the same rate until tuned.

### Clan-City Locking

Clans are locked to one city (`tribes.city`). Players must leave clan before migrating. 48h cooldown after migration before joining another clan.

---

## 15. Season System & Freeze Mode

**File:** `lib/game/season.ts`
**Duration:** 90 days
**Balance:** `BALANCE.season`

### Active Season Check

```typescript
getActiveSeason(supabase): Season | null
// Queries: status='active' AND ends_at > now()
// Returns null if season ended, expired, or missing
```

### Freeze Response

```
HTTP 423 (Locked)
{ "error": "SeasonEnded", "message": "Season has ended. Game is in freeze mode." }
```

### Routes with Freeze Guard (25 total)

All gameplay write routes call `getActiveSeason()` immediately after auth check.

**Exceptions — no freeze guard:**
- `POST /api/admin/season/reset` (admin only)
- `POST /api/auth/register`
- `POST /api/mine/allocate`

### Season Reset (Admin)

`POST /api/admin/season/reset` — hard reset: deletes all data in FK-safe order, creates Season 1 with `created_by = null`.

Delete order:
```
tribe_spells → tribe_members → hero_spells → player_hero_effects →
spy_history → attacks → hero → bank → development → training →
weapons → army → resources → hall_of_fame → tribes →
[null out season_id on seasons] → seasons → players
```

### Hall of Fame

`BALANCE.season.hallOfFamePlayers = 20`, `hallOfFameTribes = 5`. Populated at season end (mechanism not implemented in API routes — no `/api/season/end` route).

---

## 16. Catch-Up Multiplier (Late Join)

**File:** `lib/utils.ts` → `getCatchUpMultiplier(seasonStartDate: Date): number`

```
daysSinceStart = floor((Date.now() − seasonStart) / (1000 × 60 × 60 × 24))

daysSinceStart ≤ 7:  multiplier = 1
daysSinceStart ≤ 30: multiplier = 2
daysSinceStart ≤ 60: multiplier = 5
daysSinceStart ≤ 80: multiplier = 10
daysSinceStart > 80: multiplier = 20
```

Applied at registration:
```
gold  = 5000 × catchUpMult
iron  = 5000 × catchUpMult
wood  = 5000 × catchUpMult
food  = 5000 × catchUpMult
```

`free_population` is fixed at 50 (not multiplied).

---

## 17. Stored Power vs. Combat PP

**File:** `lib/game/power.ts` (stored), `lib/game/combat.ts` (combat)

These are **two different systems** that diverge in important ways:

| Aspect | Stored Power (`power.ts`) | Combat PP (`combat.ts`) |
|---|---|---|
| Purpose | Rankings, display | Combat ECP calculation |
| Storage | `players.power_attack/defense/spy/scout/total` | Computed fresh per combat |
| Race bonuses | **Applied** (orc, human, elf, dwarf) | **Not applied** |
| Defense formula | `baseUnits × defWeaponMult × trainMult × fortMult × raceMult` | Uses PP weights (all 1.0) |
| Attack formula | `(baseUnits + weaponPower) × trainMult × raceMult` | Uses SoldierScore+EquipScore+SkillScore |
| Fortification | Applied via `fortMult = 1 + (level−1) × 0.10` | Applied via DevScore += `level × 100` |

> ⚠️ **[INCONSISTENT]** Race bonuses affect stored power but **not** ECP. A player's displayed attack/defense power includes their race bonus, but during actual combat, race bonuses have no effect on the outcome. This is architecturally inconsistent — either race bonuses should be wired into ECP or removed from stored power.

### Power Total (Ranking)

```
power_total = power_attack + power_defense + power_spy + power_scout
```

Simple sum. Rankings sorted by `power_total` descending.

---

## 18. Race Bonuses

**Balance:** `BALANCE.raceBonuses`

| Race | Bonus | Applied in |
|---|---|---|
| orc | +10% attack, +3% defense | `power.ts` stored power only |
| human | +15% gold production, +3% attack | `power.ts` stored power + spy route (production: [MISSING] in tick) |
| elf | +20% spy, +20% scout | `power.ts` + `spy/route.ts` |
| dwarf | +15% defense, +3% gold production | `power.ts` stored power + production: [MISSING] in tick |

Race bonuses are:
- Applied in `recalculatePower()` for stored power
- Applied in spy route (`spy/route.ts`) for spy mission power
- **Not** applied in `calculatePersonalPower()` for combat ECP
- **Not** applied in tick for resource production

---

## 19. VIP System

**Balance:** `BALANCE.vip`

| Effect | Value | Applied |
|---|---|---|
| Production multiplier | ×1.10 | `calcSlaveProduction()`, `calcPopulationGrowth()` |
| Hero mana bonus/tick | +1 | `calcHeroManaGain()` |
| Weekly turns bonus | +50 | **[MISSING]** — no route applies this |
| Bank interest bonus | +0 | `calcBankInterest()` (value is 0 — no effect) |

VIP status: `players.vip_until` (TIMESTAMPTZ). Checked via `isVipActive(vip_until)`.
Crystal purchase flow for VIP: `vip.crystalCost = 500` crystals, no purchase route implemented.

---

## 20. Registration Flow

**File:** `app/api/auth/register/route.ts`

### Validation

- `username`: 3–20 chars, `/^[a-zA-Z0-9]+$/`
- `email`: valid email format
- `password`: ≥ 8 chars
- `army_name`: 3–20 chars
- `race`: `orc | human | elf | dwarf`

### DB Writes (parallel, 8 rows)

1. `players.insert(...)` — created sequentially first for ID
2. `resources.insert(gold/iron/wood/food = 5000 × catchUpMult)`
3. `army.insert(free_population = 50)` — all combat units = 0
4. `weapons.insert(...)` — all columns default 0
5. `training.insert(...)` — all levels default 0
6. `development.insert(...)` — all levels default 1
7. `hero.insert(...)` — level=1, mana=0
8. `bank.insert(...)` — balance=0

**No freeze guard** on registration.

---

## 21. Rankings

**File:** `app/api/tick/route.ts` (ranking update in tick)

```
rank_global: sorted by power_total DESC globally
rank_city:   sorted by power_total DESC within each city (1–5)
```

Updated every tick (every 30 minutes) for all players simultaneously. Not real-time between ticks.

---

## 22. Known Gaps / Inconsistencies / Missing / Tuning Needed

### A. Inconsistencies (code contradicts itself)

| # | Issue | Location |
|---|---|---|
| I1 | **Race bonuses in stored power but not ECP.** Stored power includes race bonuses; combat ECP does not. Player rankings reflect race, combat resolution ignores it. | `power.ts` vs `combat.ts` |
| I2 | **Two food cost formulas.** `calculateFoodCost(soldiers)` in `combat.ts` uses `soldiers × FOOD_PER_SOLDIER`. Attack route uses `turns × foodCostPerTurn`. Route does not call the function. Both constants = 1 so values happen to match only when `turns = soldiers`. | `combat.ts:541` vs `attack/route.ts:73` |
| I3 | **`maxLifetimeDeposits` vs `depositsPerDay`.** Both = 5 but `maxLifetimeDeposits` is never referenced in code. The actually enforced limit is `depositsPerDay`. | `balance.config.ts:309,323` |
| I4 | **`players.max_turns` DB default = 30** vs `BALANCE.tick.maxTurns = 200`. DB column unused in logic. | DB schema vs `tick.ts` |
| I5 | **`players.capacity` DB default = 2,500** vs formula at level-1 fortification = 1,200. | DB schema vs `balance.config.ts` |
| I6 | **`tribes.power_total` is never recalculated.** Used in `calculateClanBonus()` but no route or tick process aggregates member power into the tribe total after individual power changes. Value may be perpetually stale. | `tribe/create/route.ts` vs `combat.ts:calculateClanBonus` |

### B. Missing Implementations

| # | Feature | Status |
|---|---|---|
| M1 | Hero slave bonus in tick | `calcSlaveProduction` has `slaveBonus` param; tick always passes 0 |
| M2 | Race gold production bonus in tick | `calcSlaveProduction` has `raceGoldBonus` param; tick always passes 0 |
| M3 | Cavalry untrain | No route exists |
| M4 | City migration route | No route exists; `players.city` never changes |
| M5 | Hall of Fame population | Season-end snapshotting not implemented |
| M6 | VIP weekly turns bonus | `weeklyTurnsBonus = 50` in BALANCE; no route applies it |
| M7 | Tribe combat_boost / tribe_shield / production_blessing / war_cry effects | Spells stored in DB; no route consumes them during combat/production |
| M8 | Hero XP leveling | `hero.xp` column + `xpPerLevel` in BALANCE; no route increments XP |
| M9 | Crystal purchase flow | Packages defined in BALANCE; no purchase route |
| M10 | Season promotion gate for protection | New-player protection implemented; season promotion itself has no route |
| M11 | Tribe power aggregation | `tribes.power_total` set at creation; never updated via aggregation |

### C. Tuning Needed (constants set to placeholder or unassigned values)

| # | Constant | Current Value | Impact |
|---|---|---|---|
| T1 | `BANK_INTEREST_RATE_BASE` | `undefined` | Bank interest = NaN in prod |
| T2 | `BANK_INTEREST_RATE_PER_LEVEL` | `undefined` | Bank interest = NaN in prod |
| T3 | `CITY_PRODUCTION_MULT[1..5]` | `undefined` (defaults to 1) | All cities produce equally |
| T4 | City promotion thresholds (S_base, P_base, etc.) | `undefined` | Promotion system inert |
| T5 | PP weights (W_SOLDIERS etc.) | All `1.0` placeholder | Target distribution not met |
| T6 | `SOLDIER_V`, `SOLDIER_K` | `1`, `3` placeholder | Tier balance untuned |
| T7 | `combat.BASE_LOSS` | `0.15` placeholder | Loss rates untuned |
| T8 | Race bonuses (orc/human/elf/dwarf values) | Set but [TUNE] | May need adjustment |

### D. Refactor Hotspots

| # | Issue | Recommendation |
|---|---|---|
| R1 | **6 separate Supabase calls in attack route.** No transaction. Partial failure leaves inconsistent state. | Migrate to `supabase.rpc()` stored function for atomicity |
| R2 | **Power recalc on every tick for every player.** `N × 5` queries per tick. | Debounce or compute lazily on read |
| R3 | **Two divergent power systems** (combat PP vs stored power). | Unify: either apply race bonuses to ECP or remove from stored power |
| R4 | **Food cost formula split.** `calculateFoodCost()` is dead code in practice. | Delete `calculateFoodCost()` or wire it into the attack route |
| R5 | **`tribes.power_total` staleness.** Used in combat but never refreshed post-creation. | Add tribe power aggregation to tick or use a live subquery |
| R6 | **Bank interest with `undefined` rates.** Will produce NaN silently in prod. | Block bank interest code path until rates are assigned; or add validation guard |
| R7 | **Diagnostic logging in attack route.** 20+ `console.log` lines marked for removal. | Remove after root cause confirmed |
