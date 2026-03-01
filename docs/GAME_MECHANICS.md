# Domiron v5 — Game Mechanics & Formula Specification

> **Source of truth:** `config/balance.config.ts`, `lib/game/combat.ts`, `lib/game/tick.ts`, `lib/game/power.ts`, `lib/game/hero-effects.ts`, `app/api/attack/route.ts`, `app/api/spy/route.ts`, `app/api/training/*`, `app/api/develop/upgrade/route.ts`.
>
> All formulas are extracted verbatim from code. No guessing. Values annotated `[TUNE: unassigned]` are intentionally undefined and must be set before the related mechanic goes live.

---

## Table of Contents

1. [Tick System](#1-tick-system)
2. [Resource Production](#2-resource-production)
3. [Population & Slaves System](#3-population--slaves-system)
4. [Unit Training](#4-unit-training)
5. [Advanced Skill Training](#5-advanced-skill-training)
6. [Combat Resolution](#6-combat-resolution)
7. [Spy System](#7-spy-system)
8. [Hero Effect System](#8-hero-effect-system)
9. [Clan (Tribe) System](#9-clan-tribe-system)
10. [Bank System](#10-bank-system)
11. [City Progression](#11-city-progression)
12. [Season Mechanics & Freeze Mode](#12-season-mechanics--freeze-mode)
13. [Catch-Up Multiplier](#13-catch-up-multiplier)
14. [VIP System](#14-vip-system)
15. [Race Bonuses](#15-race-bonuses)
16. [Weapons System](#16-weapons-system)
17. [Personal Power (PP) Calculation](#17-personal-power-pp-calculation)
18. [Stored Power vs. Combat Power](#18-stored-power-vs-combat-power)
19. [Balance Risk Analysis](#19-balance-risk-analysis)

---

## 1. Tick System

Ticks are the heartbeat of the game. Every mechanic that changes over time is driven by ticks.

| Parameter | Value | Status |
|-----------|-------|--------|
| Interval | 30 minutes | [FIXED] |
| Turns per tick (normal) | +3 | [FIXED] |
| Max turns cap | 200 | [FIXED] |
| Turns per day | 144 (3 × 48 ticks) | [FIXED] informational |
| Vacation turns per tick | `ceil(3 × 0.33)` = 1 | [TUNE] |

### 1.1 Turn Regen Formula

```
new_turns = min(current_turns + turns_to_add, MAX_TURNS)

turns_to_add =
  if is_vacation: ceil(turnsPerTick × vacationTurnsMultiplier)  → ceil(3 × 0.33) = 1
  else:           turnsPerTick                                    → 3

Regen only fires when current_turns < MAX_TURNS (200).
If current_turns ≥ 200: return current_turns unchanged (never decreases).
```

**Example — normal player at 50 turns:**
```
new_turns = min(50 + 3, 200) = 53
```

**Example — vacation player at 50 turns:**
```
new_turns = min(50 + 1, 200) = 51
```

**Scaling:** Linear. 200 turns cap is reached from 0 in 67 normal ticks (33.5 hours). Vacation cap reached in 200 ticks (100 hours = 4.2 days).

---

## 2. Resource Production

Resources (gold, iron, wood, food) are produced **per tick** by **slaves**. Farmers produce food separately.

> **⚠ City multipliers are `[TUNE: unassigned]`** — the code defaults to `cityMult = 1` via `?? 1` until values are explicitly set.

### 2.1 Slave Production Formula

```
devOffset    = (devLevel - 1) × 0.5
rateMin      = (baseMin + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)
rateMax      = (baseMax + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)

production_min = floor(slavesAllocated × rateMin)
production_max = floor(slavesAllocated × rateMax)
production_avg = floor(slavesAllocated × ((rateMin + rateMax) / 2))
```

Where:
- `baseMin = 1.0`, `baseMax = 3.0` (production range at dev level 1, no modifiers)
- `devLevel` = 1–10 (per resource: `gold_level`, `food_level`, `wood_level`, `iron_level`)
- `cityMult` = city production multiplier `[TUNE: unassigned]` (defaults to 1)
- `vipMult` = 1.10 if VIP active, else 1.0
- `raceGoldBonus` = race gold production bonus (human: 0.15, dwarf: 0.03, others: 0)
- `slaveBonus` = clamped hero slave output bonus (0 – 0.50)

> **Slave assignment:** Each slave is assigned to exactly **one** resource job (Gold Mine, Iron Foundry, Lumber Camp, or Farmlands). Only assigned slaves produce that resource per tick. Idle slaves produce nothing. Assignments are stored in `army.slaves_gold / slaves_iron / slaves_wood / slaves_food` and set via `/api/mine/allocate`. See [§3 — Population & Slaves System](#3-population--slaves-system) for full details.

**Example — 100 slaves, dev level 3, no modifiers:**
```
devOffset = (3-1) × 0.5 = 1.0
rateMin   = (1.0 + 1.0) × 1 × 1 × 1 × 1 = 2.0
rateMax   = (3.0 + 1.0) × 1 × 1 × 1 × 1 = 4.0
min_output = floor(100 × 2.0) = 200 per tick
max_output = floor(100 × 4.0) = 400 per tick
avg_output = floor(100 × 3.0) = 300 per tick
```

**Example — 100 slaves, dev level 10, human race, VIP, hero 30% slave boost:**
```
devOffset   = 9 × 0.5 = 4.5
rateMin     = (1.0 + 4.5) × 1 × 1.10 × 1.15 × 1.30 = 9.09
rateMax     = (3.0 + 4.5) × 1 × 1.10 × 1.15 × 1.30 = 12.38
min_output  = floor(100 × 9.09)  = 909 per tick
max_output  = floor(100 × 12.38) = 1238 per tick
```

**Randomness:** The tick applies a random value between `rateMin` and `rateMax` each tick. This is uniform randomness within the computed range. The exact per-tick roll is `Math.floor(slaves × randomBetween(rateMin, rateMax))`.

**Scaling:** Linear in slaves. Linear-ish in dev level (0.5 per level added to the base range). Combined modifiers are multiplicative, producing super-linear gains at high investment.

### 2.2 Resource Caps

No hard cap on resource storage. Bank is the only safe-storage mechanism with a 100% theft protection.

### 2.3 Farmer Food Production

Farmers produce food per tick using the same formula as slave production with `food_level` as the dev level. A `farmers` column in the `army` table stores this count. Farmers always produce food — they are **not** part of the slave assignment system. The tick computes food production as:

```
food_production = calcSlaveProduction(army.slaves_food + army.farmers, dev.food_level, city, vip)
```

Farmers cost 20 gold + 1 population to train (see §4.1). They have no capacity cost and cannot be reassigned.

---

## 3. Population & Slaves System

The game has **two separate workforce pools** that are commonly confused:

| Pool | DB Column | Description |
|------|-----------|-------------|
| **Untrained Population** | `players.free_population` | Available to train into any unit type |
| **Untrained Slaves (Idle)** | `army.slaves` minus assigned | Slaves not yet assigned to a resource job — produce nothing |

**Key distinction:** Untrained Population (`free_population`) is consumed when training units. Slaves are a separate permanent workforce — created only by training from population, never from combat.

Free population is the workforce pool. Training any unit (except cavalry) permanently consumes 1 population per unit trained.

### 3.1 Starting Population

Every new player begins with **50 free population** (`BALANCE.startingResources.startingPopulation = 50`).

### 3.2 Population Growth Per Tick

```
base    = populationPerTick[population_level]  (table lookup)
vipMult = isVipActive ? 1.10 : 1.0
growth  = floor(base × vipMult)
```

**Lookup table — Population Per Tick by Level:**

| Level | Base Pop/Tick | With VIP (×1.10) |
|-------|--------------|------------------|
| 1     | 1            | 1                |
| 2     | 2            | 2                |
| 3     | 3            | 3                |
| 4     | 4            | 4                |
| 5     | 5            | 5                |
| 6     | 8            | 8                |
| 7     | 10           | 11               |
| 8     | 14           | 15               |
| 9     | 18           | 19               |
| 10    | 23           | 25               |

**Scaling:** Strongly non-linear. Level 10 produces 23× more than level 1. The jump from level 5→6 is disproportionate (+3 vs +1 per previous step). This is a deliberate mid-season acceleration point.

### 3.3 Population Consumption

| Action | Population Cost |
|--------|----------------|
| Train soldier | −1 per unit |
| Train slave | −1 per unit (**no gold cost** — free) |
| Train spy | −1 per unit |
| Train scout | −1 per unit |
| Train farmer | −1 per unit |
| Train cavalry | **0** (converts existing soldiers) |
| Untrain any unit | Returns to `free_population` (NOT to slaves) |

**Cavalry special rule:** Training `N` cavalry requires `N × 5` existing soldiers (soldierRatio). Soldiers are consumed to become cavalry. No population is spent.

### 3.4 Slaves — Source of Truth

**Slaves are created by exactly ONE mechanism:**
- **Trained from Untrained Population:** Via the basic training route. **Free — no gold cost.** Consumes 1 `free_population`; adds 1 to `army.slaves` (idle).

**Slaves are NEVER created from:**
- Combat (attacks do not touch `army.slaves` in any way)
- Untraining other units

Slaves produce resources only when **assigned to a job** (not idle). See [§3.5](#35-slave-assignment-system).

### 3.5 Slave Assignment System

Slaves are distributed across four resource jobs. Each slave is in **exactly one** of these states at all times:

| State | DB Column | Produces |
|-------|-----------|----------|
| Idle | `army.slaves - (slaves_gold + slaves_iron + slaves_wood + slaves_food)` | Nothing |
| Gold Mine | `army.slaves_gold` | Gold per tick |
| Iron Foundry | `army.slaves_iron` | Iron per tick |
| Lumber Camp | `army.slaves_wood` | Wood per tick |
| Farmlands | `army.slaves_food` | Food per tick (stacks with farmers) |

**Invariant (enforced server-side):**
```
slaves_gold + slaves_iron + slaves_wood + slaves_food ≤ army.slaves
idle_slaves = army.slaves - (slaves_gold + slaves_iron + slaves_wood + slaves_food)
idle_slaves ≥ 0
```

**Assignment API:** `POST /api/mine/allocate` with body `{ gold, iron, wood, food }`.
- Validates that `gold + iron + wood + food ≤ army.slaves`.
- Stores to DB immediately; takes effect on the **next tick**.
- Season-gated: returns 423 if season is frozen.

**Tick production (per resource):**
```
gold_prod = calcSlaveProduction(army.slaves_gold,  dev.gold_level, city, vip)
iron_prod = calcSlaveProduction(army.slaves_iron,  dev.iron_level, city, vip)
wood_prod = calcSlaveProduction(army.slaves_wood,  dev.wood_level, city, vip)
food_prod = calcSlaveProduction(army.slaves_food + army.farmers, dev.food_level, city, vip)
```

**Idle slaves produce nothing.** An idle slave is a resource that is being wasted each tick.

### 3.6 Slave Lifecycle Summary

```
free_population
    │
    │  Train Slave (free — no gold, −1 pop)
    ▼
army.slaves [idle]
    │
    │  Assign via /api/mine/allocate
    ▼
army.slaves_gold / slaves_iron / slaves_wood / slaves_food
    │
    │  Each tick: calcSlaveProduction(assigned, devLevel, city, vip)
    ▼
resources.gold / iron / wood / food  (increased)
```

---

## 4. Unit Training

### 4.1 Basic Unit Costs

| Unit | Gold Cost | Pop Cost | Capacity Cost | Special Rule |
|------|-----------|----------|---------------|--------------|
| Soldier | 60 | 1 | 1 | None |
| Slave | **0** | 1 | 0 | Free — converts 1 pop → 1 idle slave; must be assigned to a job to produce |
| Spy | 80 | 1 | 1 | Used for spy missions |
| Scout | 80 | 1 | 1 | Defends against spies |
| Cavalry | 200 | **0** | 2 | Requires `amount × 5` soldiers |
| Farmer | 20 | 1 | 0 | Always produces food (separate from slave assignment) |

**Total gold cost formula:**
```
totalGoldCost = unitCost[unit].gold × amount
```

### 4.2 Capacity System

```
current_capacity = BALANCE.training.baseCapacity
                 + fortification_level × BALANCE.training.capacityPerDevelopmentLevel
                 = 1000 + fortification_level × 200
```

**Combat units** (soldiers, spies, scouts) share the capacity pool. Cavalry does not contribute to the capacity count (it uses `capacityCost: 2` in config but the API checks `combatUnits = soldiers + spies + scouts`).

**Capacity by fortification level:**

| Fortification Level | Capacity |
|---------------------|----------|
| 1 (starting)        | 1,200    |
| 2                   | 1,400    |
| 3                   | 1,600    |
| 4                   | 1,800    |
| 5 (max)             | 2,000    |

### 4.3 Training Validation — Gate Order

The API enforces in this order:
1. Gold check
2. Capacity check (soldiers/spies/scouts only)
3. Population check (all units except cavalry)
4. Soldier ratio check (cavalry only)

---

## 5. Advanced Skill Training

Advanced training upgrades one of four skill dimensions: `attack`, `defense`, `spy`, `scout`.

### 5.1 Cost Formula

```
goldCost = BALANCE.training.advancedCost.gold × (currentLevel + 1)
foodCost = BALANCE.training.advancedCost.food × (currentLevel + 1)

advancedCost.gold = 300
advancedCost.food = 300
```

**Cost by level (current → next):**

| Current Level | Gold Cost | Food Cost |
|--------------|-----------|-----------|
| 0 → 1        | 300       | 300       |
| 1 → 2        | 600       | 600       |
| 2 → 3        | 900       | 900       |
| 3 → 4        | 1,200     | 1,200     |
| 4 → 5        | 1,500     | 1,500     |
| 5 → 6        | 1,800     | 1,800     |
| ...          | ...       | ...       |
| L → L+1      | 300(L+1)  | 300(L+1)  |

**Scaling:** Linear in cost. Each level costs exactly 300 more than the previous. There is no soft cap enforced — theoretically unbounded levels. **Balance risk:** high-level players get disproportionate combat power from skill multipliers (see §6 below).

### 5.2 Effect of Skill Levels

Each skill level adds `advancedMultiplierPerLevel = 0.08` (8%) to the relevant power multiplier:

```
trainMult = 1 + skillLevel × 0.08
```

**Multiplier by level:**

| Level | Multiplier | Effective Gain vs Level 0 |
|-------|-----------|--------------------------|
| 0     | 1.00×     | baseline                 |
| 5     | 1.40×     | +40%                     |
| 10    | 1.80×     | +80%                     |
| 20    | 2.60×     | +160%                    |
| 50    | 5.00×     | +400%                    |

**Scaling:** Linear multiplier growth, but the effect on combat power is multiplicative against the unit base — making this **exponentially valuable** at high levels.

---

## 6. Combat Resolution

Combat is fully deterministic. There is **no randomness** in combat. All results are a pure function of inputs.

### 6.1 Complete Order of Operations

```
1. PP_attacker = calculatePersonalPower(attacker_data)
2. PP_defender = calculatePersonalPower(defender_data)
3. ECP_attacker = (PP_attacker × (1 + heroAttackBonus)) + ClanBonus_attacker
4. ECP_defender = (PP_defender × (1 + heroDefenseBonus)) + ClanBonus_defender
5. R = ECP_attacker / ECP_defender
6. outcome = determineCombatOutcome(R)
7. losses = calculateSoldierLosses(R, flags)
8. apply SoldierShield → defenderLosses = 0 (if active)
9. loot = calculateLoot(unbankedResources, outcome, attackCount, protectionFlags)
10. apply ResourceShield → loot = 0 (if active)
```

### 6.2 Personal Power (PP)

See [§17](#17-personal-power-pp-calculation) for the full PP formula. Summary:

```
PP = floor(
  SoldierScore  × 1.0 +
  EquipScore    × 1.0 +
  SkillScore    × 1.0 +
  min(DevScore, 10_000) × 1.0 +
  SpyScore      × 1.0
)
```

### 6.3 Clan Bonus

```
ClanBonus_raw = totalClanPP × EFFICIENCY[clanDevLevel]
ClanBonus     = floor(min(ClanBonus_raw, 0.20 × PlayerPP))

EFFICIENCY rates:
  Level 1: 5%  | Level 2: 8%  | Level 3: 10%
  Level 4: 12% | Level 5: 15%
```

**Critical design rule:** ClanBonus is **additive** to ECP after hero multiplication. The hero bonus never amplifies the clan contribution.

**Example — player with PP=10,000, clan totalPP=80,000 at level 3:**
```
ClanBonus_raw = 80,000 × 0.10 = 8,000
Cap           = 0.20 × 10,000 = 2,000
ClanBonus     = floor(min(8,000, 2,000)) = 2,000
```

### 6.4 Effective Combat Power (ECP)

```
ECP = floor((PlayerPP × (1 + heroBonus)) + ClanBonus)

heroBonus = totalAttackBonus or totalDefenseBonus from active hero effects
            clamped to [0, 0.50]
```

**Example — attacker PP=10,000, heroBonus=0.20, ClanBonus=2,000:**
```
ECP = floor((10,000 × 1.20) + 2,000) = floor(14,000) = 14,000
```

### 6.5 Combat Ratio and Outcome

```
R = ECP_attacker / ECP_defender
  (if ECP_defender = 0: R = WIN_THRESHOLD + 1 → automatic win)

Outcome thresholds:
  R ≥ 1.30  →  'win'
  R < 0.75  →  'loss'
  otherwise →  'partial' (Draw)
```

**Example — ECP_attacker=14,000, ECP_defender=11,000:**
```
R = 14,000 / 11,000 = 1.273
Outcome: partial (0.75 ≤ 1.273 < 1.30)
```

**Zone widths:**
- Win zone: R ≥ 1.30 (unbounded upward)
- Partial zone: 0.75 ≤ R < 1.30 — width = 0.55 around parity
- Loss zone: R < 0.75 (unbounded downward)

At equal ECP (R=1.0): **partial** outcome. Design target: ~50–60% of same-PP combats yield partial.

### 6.6 Soldier Losses

```
BASE_LOSS           = 0.15   (loss rate at R = 1.0)
MAX_LOSS_RATE       = 0.30   (30% hard cap per battle)
DEFENDER_BLEED_FLOOR = 0.05  (defender always loses ≥ 5% if cooldown inactive)
ATTACKER_FLOOR      = 0.03   (attacker always loses ≥ 3%)

AttackerLossRate_raw = BASE_LOSS / max(R, 0.01)
AttackerLossRate     = clamp(AttackerLossRate_raw, ATTACKER_FLOOR, MAX_LOSS_RATE)
  → exception: if attackerIsProtected: AttackerLossRate = 0

DefenderLossRate_raw = BASE_LOSS × R
DefenderLossRate     = clamp(DefenderLossRate_raw, DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)
  → exception: if killCooldownActive OR defenderIsProtected: DefenderLossRate = 0

attackerLosses = floor(deployedSoldiers × AttackerLossRate)
defenderLosses = floor(defenderSoldiers × DefenderLossRate)
```

**Post-calculation override (Soldier Shield):**
```
if soldierShieldActive: defenderLosses = 0
```

**Loss table at key ratios (no protection, no cooldown, no shield):**

| R (ratio) | Attacker Loss Rate | Defender Loss Rate | Outcome |
|-----------|-------------------|-------------------|---------|
| 0.50      | clamp(0.30, …) = 30% | clamp(0.075, 0.05, 0.30) = 7.5% | loss |
| 0.75      | clamp(0.20, …) = 20% | clamp(0.1125) = 11.25% | partial boundary |
| 1.00      | 15%               | 15%               | partial |
| 1.30      | clamp(0.115, …) = 11.5% | clamp(0.195) = 19.5% | win boundary |
| 2.00      | clamp(0.075) = 7.5% | clamp(0.30) = 30% | win |
| 3.00+     | clamp(0.05→0.03) = 3% | 30% (capped) | win |

**Example — 1,000 deployed soldiers, 1,500 defender soldiers, R=1.273:**
```
AttackerLossRate = clamp(0.15/1.273, 0.03, 0.30) = clamp(0.118) = 11.8%
DefenderLossRate = clamp(0.15×1.273, 0.05, 0.30) = clamp(0.191) = 19.1%
attackerLosses   = floor(1,000 × 0.118) = 118 soldiers
defenderLosses   = floor(1,500 × 0.191) = 286 soldiers
```

### 6.7 Slave Conversion

```
slavesCreated = floor(defenderLosses × CAPTURE_RATE)
CAPTURE_RATE  = 0.35

Blocked by:
  - killCooldownActive = true
  - defenderIsProtected = true
  - soldierShieldActive = true
```

**Example — 286 defender losses:**
```
slavesCreated = floor(286 × 0.35) = floor(100.1) = 100 slaves
```

**DB note:** The attack route applies an additional safety clamp:
```
safeSlaves = min(slavesCreated, max(0, defenderSoldiers − safeDefLosses))
```
This prevents creating more slaves than there are remaining soldiers.

### 6.8 Loot Formula

```
BaseLoot[r]   = unbanked[r] × BASE_LOOT_RATE
FinalLoot[r]  = floor(BaseLoot[r] × outcomeMult × decayFactor)

BASE_LOOT_RATE = 0.20 (20% of each unbanked resource)

outcomeMult:
  win     → 1.0
  partial → 0.5
  loss    → 0.0  (loot = 0 regardless of other factors)

Returns zero loot if:
  - outcome = 'loss'
  - defenderIsProtected = true
```

**Loot Decay (Anti-Farm):**
```
attackCountInWindow = number of attacks by this attacker on this target
                      within the last DECAY_WINDOW_HOURS (12h),
                      INCLUDING the current attack (minimum 1).

decayFactor = LOOT_DECAY_STEPS[min(attackCount - 1, 4)]

LOOT_DECAY_STEPS:
  1st attack: 1.00
  2nd attack: 0.70
  3rd attack: 0.40
  4th attack: 0.20
  5th+ attack: 0.10
```

**Complete loot formula:**
```
FinalLoot[r] = floor(unbanked[r] × 0.20 × outcomeMult × decayFactor)
```

**Example — defender has 10,000 gold unbanked, R=1.5 (win), 1st attack:**
```
FinalLoot[gold] = floor(10,000 × 0.20 × 1.0 × 1.0) = 2,000 gold
```

**Example — same scenario, 3rd attack in 12h window:**
```
FinalLoot[gold] = floor(10,000 × 0.20 × 1.0 × 0.40) = 800 gold
```

**Example — partial outcome, 2nd attack:**
```
FinalLoot[gold] = floor(10,000 × 0.20 × 0.50 × 0.70) = 700 gold
```

**Safety clamp (API route):**
```
goldStolen = min(result.loot.gold, defResources.gold)
```
Cannot steal more than the defender actually has (guards against floating-point edge cases).

### 6.9 Attack Cost

```
foodCost  = turnsUsed × foodCostPerTurn = turns × 1
turnCost  = turnsUsed (1–10 turns per attack)
```

Both are paid **regardless of outcome, protection, or any other flag**. Even attacking a protected player costs turns and food.

### 6.10 Cooldowns and Protection

**Kill Cooldown (per attacker→defender pair):**
```
killCooldownActive = any attack in last KILL_COOLDOWN_HOURS (6h)
                     where defender_losses > 0

Effect when active:
  defenderLosses = 0
  slavesCreated  = 0
  loot resolves normally
```

**New Player Protection:**
```
Season gate: protection is DISABLED for the first protectionStartDays (10) of a season.
             During the first 10 days, no player has protection regardless of creation date.

After gate opens:
  isProtected = (now - player.created_at) < PROTECTION_HOURS (24h)

Effect — defenderIsProtected:
  defenderLosses = 0
  loot           = 0 (reason: DEFENDER_PROTECTED)
  attack proceeds normally for UX

Effect — attackerIsProtected:
  attackerLosses = 0
  attack and loot proceed normally
```

### 6.11 Attack Validity Gates

The attack route checks these conditions before resolving combat:
1. Active season exists (or returns HTTP 423 — freeze mode)
2. Not attacking yourself
3. Attacker has enough turns (`turns ≥ turnsUsed`)
4. Attacker has enough food (`food ≥ turnsUsed × 1`)
5. Attacker has soldiers (`soldiers > 0`)
6. Defender found in same (or any) city — **no city restriction enforced** in current code

---

## 7. Spy System

### 7.1 Spy Power Formula

```
spyPower = floor(
  spies_sent × trainMult × weapMult × raceMult
)

trainMult = 1 + spy_level × 0.08
weapMult  = 1.0
            × (1.15 if shadow_cloak owned)
            × (1.30 if dark_mask owned)
            × (1.50 if elven_gear owned)
raceMult  = 1.20 if elf, else 1.0
```

### 7.2 Scout Defense Formula

```
scoutDefense = floor(
  scouts × trainMult × weapMult × raceMult
)

trainMult = 1 + scout_level × 0.08
weapMult  = 1.0
            × (1.15 if scout_boots owned)
            × (1.30 if scout_cloak owned)
            × (1.50 if elven_boots owned)
raceMult  = 1.20 if elf, else 1.0
```

### 7.3 Outcome

```
success = (spyPower > scoutDefense)  — strict greater-than, no ties
```

**On success:** Full data revealed: army counts, all resources, all power scores, active shields.

**On failure:** Nothing revealed.

### 7.4 Spies Caught (Failure Only)

```
ratio     = min(scoutDefense / max(spyPower, 1), 1.0)
rawCatch  = floor(spies_sent × catchRate × ratio)
          = floor(spies_sent × 0.30 × ratio)
spiesCaught = min(rawCatch, floor(spies_sent × MAX_CATCH_RATE))
            = min(rawCatch, floor(spies_sent × 0.80))
```

**Loss rate by power gap:**
- Equal power (`ratio = 1.0`): 30% of sent spies caught (capped at 80%)
- Overwhelming defender (`ratio = 1.0`, raw = 80%+): hard cap at 80%
- Barely failed (`ratio → 0`): nearly 0% caught

**Example — send 100 spies, scoutDefense = 2× spyPower (ratio = 1.0):**
```
rawCatch    = floor(100 × 0.30 × 1.0) = 30
spiesCaught = min(30, floor(100 × 0.80)) = min(30, 80) = 30
```

### 7.5 Turn Cost

```
turnCost = BALANCE.spy.turnCost = 1 turn
```
Paid regardless of outcome. Requires `spies ≥ 1` and `turns ≥ 1`.

---

## 8. Hero Effect System

The Hero system is the **sole monetization lever**. All temporary combat/economy boosts flow through it.

### 8.1 Effect Types and Rates

| Effect Type | Category | Rate | Notes |
|-------------|----------|------|-------|
| SLAVE_OUTPUT_10 | Slave bonus | +10% | Stacks additively |
| SLAVE_OUTPUT_20 | Slave bonus | +20% | Stacks additively |
| SLAVE_OUTPUT_30 | Slave bonus | +30% | Stacks additively |
| ATTACK_POWER_10 | Attack bonus | +10% | Multiplies attacker PP only |
| DEFENSE_POWER_10 | Defense bonus | +10% | Multiplies defender PP only |
| RESOURCE_SHIELD | Shield | — | Zeroes all loot in combat |
| SOLDIER_SHIELD | Shield | — | Zeroes defender soldier losses |

### 8.2 Stacking and Clamping

```
rawSlaveBonus    = Σ EFFECT_RATES[e] for all active SLAVE_OUTPUT_* effects
rawAttackBonus   = Σ EFFECT_RATES[e] for all active ATTACK_POWER_* effects
rawDefenseBonus  = Σ EFFECT_RATES[e] for all active DEFENSE_POWER_* effects

totalSlaveBonus   = clamp(rawSlaveBonus,   0, MAX_STACK_RATE)  → [0, 0.50]
totalAttackBonus  = clamp(rawAttackBonus,  0, MAX_STACK_RATE)  → [0, 0.50]
totalDefenseBonus = clamp(rawDefenseBonus, 0, MAX_STACK_RATE)  → [0, 0.50]

MAX_STACK_RATE = 0.50 — hard server-side cap per bonus category
```

### 8.3 Integration into Formulas

**In ECP:**
```
AttackerECP = floor((PP_attacker × (1 + totalAttackBonus)) + ClanBonus_attacker)
DefenderECP = floor((PP_defender × (1 + totalDefenseBonus)) + ClanBonus_defender)
```

**In slave production:**
```
rateMin/rateMax = ... × (1 + totalSlaveBonus)
```

**Critical constraint:** Hero bonuses **never** multiply ClanBonus. They multiply only PlayerPP.

### 8.4 Shield Mechanics

```
Duration:   SHIELD_ACTIVE_HOURS   = 23 hours
Cooldown:   SHIELD_COOLDOWN_HOURS = 1 hour
Mana cost:  SOLDIER_SHIELD_MANA   = 10 mana
            RESOURCE_SHIELD_MANA  = 10 mana

Timeline: [Activate] → [23h active] → [1h cooldown] → [can activate again]
```

**Shields block only inside combat resolution, never at the attack gate.**
The attacker always pays turns + food even when hitting a shielded target.

### 8.5 Hero Mana Per Tick

```
mana_gain = base + (heroLevel ≥ 10 ? level10bonus : 0)
                 + (heroLevel ≥ 50 ? level50bonus : 0)
                 + (isVipActive ? vipBonus : 0)

base         = 1
level10bonus = 1
level50bonus = 1
vipBonus     = 1

Max mana/tick = 4 (all conditions met)
```

---

## 9. Clan (Tribe) System

### 9.1 Clan Bonus in Combat

```
ClanBonus_raw = tribes.power_total × EFFICIENCY[tribe.level]
ClanBonus     = floor(min(ClanBonus_raw, BONUS_CAP_RATE × PlayerPP))

BONUS_CAP_RATE = 0.20 (clan bonus ≤ 20% of PlayerPP)
EFFICIENCY:
  Level 1: 0.05 | Level 2: 0.08 | Level 3: 0.10
  Level 4: 0.12 | Level 5: 0.15
```

**What ClanBonus affects:** Attack ECP, defense ECP, spy, scout (in combat context).
**What ClanBonus does NOT affect:** PP ranking, loot, economy, base resource production.

### 9.2 Tribe Mana Regeneration

```
tribeManaGain = max(1, floor(memberCount × manaPerMemberPerTick))
manaPerMemberPerTick = 1

5 members → 5 mana/tick | 20 members (max) → 20 mana/tick
```

### 9.3 Tribe Spells

| Spell | Mana Cost | Duration |
|-------|-----------|----------|
| combat_boost | 20 | 6 hours |
| tribe_shield | 30 | 12 hours |
| production_blessing | 25 | 8 hours |
| mass_spy | 15 | Instant (0h) |
| war_cry | 40 | 4 hours |

### 9.4 Tax Limits (Gold per Day, per City)

| City | Max Daily Tax |
|------|--------------|
| 1 — Izrahland | 1,000 gold |
| 2 — Masterina | 2,500 gold |
| 3 — Rivercastlor | 5,000 gold |
| 4 — Grandoria | 10,000 gold |
| 5 — Nerokvor | 20,000 gold |

### 9.5 Membership Rules

- Max members: 20
- Leaving cooldown: 10 minutes (normal leave)
- City migration cooldown: 48 hours before joining a clan (clan is locked to one city)
- Players must leave their clan before promoting to a new city

---

## 10. Bank System

The bank protects gold from theft. Banked gold is **100% safe** (`theftProtection = 1.00`).

### 10.1 Deposit Rules

| Parameter | Value |
|-----------|-------|
| Max deposits per account lifetime | 5 |
| Max deposits per calendar day | 5 |
| Max deposit amount | 100% of gold on hand |
| Banked gold theft protection | 100% |

### 10.2 Bank Interest

```
interest = floor(balance × BANK_INTEREST_RATE_BASE)
         + floor(balance × interestLevel × BANK_INTEREST_RATE_PER_LEVEL)
         + floor(balance × vipRate)

BANK_INTEREST_RATE_BASE:      [TUNE: unassigned — not yet live]
BANK_INTEREST_RATE_PER_LEVEL: [TUNE: unassigned — not yet live]
vip.bankInterestBonus:        0 [TUNE: unassigned]
```

Interest fires once per day on the tick where the calendar date changes.

### 10.3 Bank Upgrade Cost

```
upgradeCost = BALANCE.bank.upgradeBaseCost = 2,000 gold per upgrade
```

(Level determines the interest rate bonus — rates not assigned yet.)

---

## 11. City Progression

### 11.1 City Production Multipliers

All 5 city production multipliers are `[TUNE: unassigned]`. The code defaults to `cityMult = 1` via `?? 1`. Higher cities are *intended* to produce more resources — this is the primary promotion incentive.

### 11.2 Development Upgrade Costs

Upgrades apply to: `gold_level`, `food_level`, `wood_level`, `iron_level`, `population_level` (max level 10), `fortification_level` (max level 5).

```
cost_gold     = costConfig.gold     × next_level
cost_resource = costConfig.resource × next_level

Resource type paid:
  gold_level         → pay in gold
  food_level         → pay in food
  wood_level         → pay in wood
  iron_level         → pay in iron
  population_level   → pay in food
  fortification_level → pay in gold

costConfig by next level:
  next_level ≤ 2:  { gold:   3, resource:   3 }
  next_level = 3:  { gold:   9, resource:   9 }
  next_level ≤ 5:  { gold:  50, resource:  50 }
  next_level ≤ 10: { gold: 500, resource: 500 }
```

**Full upgrade cost table (both gold + secondary resource):**

| Current → Next | Cost Formula | Gold | Secondary Resource |
|----------------|--------------|------|-------------------|
| 1 → 2 | 3 × 2 | 6 | 6 |
| 2 → 3 | 9 × 3 | 27 | 27 |
| 3 → 4 | 50 × 4 | 200 | 200 |
| 4 → 5 | 50 × 5 | 250 | 250 |
| 5 → 6 | 500 × 6 | 3,000 | 3,000 |
| 6 → 7 | 500 × 7 | 3,500 | 3,500 |
| 7 → 8 | 500 × 8 | 4,000 | 4,000 |
| 8 → 9 | 500 × 9 | 4,500 | 4,500 |
| 9 → 10 | 500 × 10 | 5,000 | 5,000 |

**Cumulative cost (levels 1→10):** 26,289 gold + 26,289 secondary resource.

**Fortification special side-effect:**
```
new_capacity = baseCapacity + new_level × capacityPerDevelopmentLevel
             = 1,000 + fortification_level × 200
```

**Fortification defense multiplier (from power.ts):**
```
fortMult = 1 + (fortification_level - 1) × 0.10

Level 1: 1.00× | Level 2: 1.10× | Level 3: 1.20×
Level 4: 1.30× | Level 5: 1.40×
```

### 11.3 City Promotion Requirements

All threshold values are `[TUNE: unassigned]`. The UI shows the checks (soldiers required, total resources required) but exact numbers must be set before promotion gates are meaningful.

The promotion formula structure (defined in comments, values unset):
```
SoldierThreshold(C) = S_base × s_growth ^ (C - 2)
ResourceCost(C)     = R_base × r_growth ^ (C - 2)
```

---

## 12. Season Mechanics & Freeze Mode

### 12.1 Freeze Gate

Every gameplay write route calls `getActiveSeason(supabase)` before executing any game logic:

```
getActiveSeason():
  query: WHERE status = 'active' AND ends_at > now()
  returns: Season | null

If null → HTTP 423 { error: 'SeasonEnded', message: '...' }
```

**This is self-healing and requires no cron job:** when `ends_at` passes, the next DB query naturally returns null and all writes are blocked immediately.

### 12.2 Season Parameters

| Parameter | Value | Status |
|-----------|-------|--------|
| Duration | 90 days | [FIXED] |
| Hall of Fame players | 20 | |
| Hall of Fame tribes | 5 | |
| Account deletion after inactive seasons | 3 | |
| New player protection gate | 10 days | [FIXED] |
| New player protection window | 24 hours | [FIXED] |

### 12.3 What Freeze Blocks

All **write** routes under `app/api/` except:
- `app/api/admin/season/reset` — admin bypass
- `app/api/auth/register` — auth bypass
- `app/api/mine/allocate` — no DB writes

### 12.4 Freeze UI

Client derives `isFrozen` locally from `PlayerContext.season`:
```
isFrozen = !season || season.status !== 'active' || new Date(season.ends_at) <= Date.now()
```

When frozen:
- `FreezeModeBanner` displays across all game pages
- Submit buttons have `disabled={isFrozen}`

### 12.5 Hard Reset Sequence

Admin-only `POST /api/admin/season/reset` wipes all data in FK-safe order:

```
1. tribe_spells
2. tribe_members
3. hero_spells
4. player_hero_effects
5. spy_history
6. attacks
7. hero
8. bank
9. development
10. training
11. weapons
12. army
13. resources
14. hall_of_fame
15. tribes
--- break circular FK ---
16. UPDATE seasons SET created_by = null  (nullable field)
17. DELETE players                         (holds NOT NULL FK to seasons)
18. DELETE seasons
--- create fresh season ---
19. INSERT seasons (number=1, starts_at=now, ends_at=now+90d, created_by=null)
```

---

## 13. Catch-Up Multiplier

Applied to **starting resources** only when a new player registers mid-season. The multiplier scales starting gold, iron, wood, and food.

```
daysSinceStart = floor((Date.now() - season.starts_at) / 86_400_000)

multiplier:
  days ≤ 7:   ×1
  days ≤ 30:  ×2
  days ≤ 60:  ×5
  days ≤ 80:  ×10
  days > 80:  ×20

startingResources[r] = BALANCE.startingResources[r] × catchUpMultiplier
```

**Example — register on season day 45:**
```
multiplier = ×5
Starting gold = 5,000 × 5 = 25,000
Starting iron = 5,000 × 5 = 25,000
Starting wood = 5,000 × 5 = 25,000
Starting food = 5,000 × 5 = 25,000
Starting turns = 50 (not multiplied)
Starting population = 50 (not multiplied)
```

**Scaling:** Step function with aggressive jumps. Day 80 players get ×10 more resources. Day 81 players get ×20. This is an intentional late-season catch-up mechanic.

---

## 14. VIP System

VIP is activated by spending crystals (premium currency). One crystal package = `vipSeason = 500 crystals`.

| Benefit | Value | Status |
|---------|-------|--------|
| Production multiplier | ×1.10 | Applied to all slave output + population growth |
| Weekly turns bonus | +50 | [TUNE] — delivery mechanism not confirmed in tick code |
| Bank interest bonus | 0 | [TUNE: unassigned] |
| Hero mana bonus | +1/tick | When VIP active |

**VIP production benefit example — 100 slaves, dev level 3:**
```
Without VIP: avg = 300/tick
With VIP:    avg = floor(100 × ((2.0+4.0)/2) × 1.10) = floor(330) = 330/tick
+10% bonus
```

---

## 15. Race Bonuses

Races affect combat power (in `power.ts` stored formulas) but **do not affect PP ranking scores**.

| Race | Attack Bonus | Defense Bonus | Gold Production Bonus | Spy Bonus | Scout Bonus |
|------|-------------|--------------|----------------------|-----------|-------------|
| Orc | +10% | +3% | — | — | — |
| Human | +3% | — | +15% | — | — |
| Elf | — | — | — | +20% | +20% |
| Dwarf | — | +15% | +3% | — | — |

**Applied in power.ts stored power calculation:**
```
powerAttack  = (soldiers + cavalry×2 + attackWeaponPower) × attackTrainMult × raceAttackMult
powerDefense = (soldiers + cavalry×2) × defWeaponMult × defenseTrainMult × fortMult × raceDefenseMult
powerSpy     = spies × spyTrainMult × spyWeaponMult × raceSpyMult
powerScout   = scouts × scoutTrainMult × scoutWeaponMult × raceScoutMult
```

Race multipliers:
- `raceAttackMult`:  orc: 1.10, human: 1.03, else: 1.0
- `raceDefenseMult`: orc: 1.03, dwarf: 1.15, else: 1.0
- `raceSpyMult`:     elf: 1.20, else: 1.0
- `raceScoutMult`:   elf: 1.20, else: 1.0

**Human race gold production:**
Expressed as `raceGoldBonus = 0.15` in `calcSlaveProduction`. Applied as `(1 + 0.15) = 1.15` to gold production rate. Does not affect iron/wood/food production for humans (single bonus applied uniformly in tick processing).

---

## 16. Weapons System

### 16.1 Attack Weapons (Additive per unit)

| Weapon | Combat Power/unit | Max Units | Iron Cost/unit | PP Contribution/unit |
|--------|------------------|-----------|----------------|---------------------|
| Slingshot | 2 | 25 | 200 | 2 |
| Boomerang | 5 | 12 | 400 | 5 |
| Pirate Knife | 12 | 6 | 800 | 12 |
| Axe | 28 | 3 | 1,600 | 28 |
| Master Knife | 64 | 1 | 3,200 | 64 |
| Knight Axe | 148 | 1 | 6,400 | 148 |
| Iron Ball | 340 | 1 | 12,800 | 340 |

**Sell refund:** 20% of purchase price.

**Total max attack weapon power:**
```
25×2 + 12×5 + 6×12 + 3×28 + 1×64 + 1×148 + 1×340 = 50+60+72+84+64+148+340 = 818
```

### 16.2 Defense Weapons (Multiplicative, binary — owned or not)

| Item | Multiplier | Gold Cost |
|------|-----------|-----------|
| Wood Shield | ×1.10 | 1,500 |
| Iron Shield | ×1.25 | 8,000 |
| Leather Armor | ×1.40 | 25,000 |
| Chain Armor | ×1.55 | 80,000 |
| Plate Armor | ×1.70 | 250,000 |
| Mithril Armor | ×1.90 | 700,000 |
| God's Armor | ×2.20 | 1,000,000 gold + 500,000 iron + 300,000 wood |

**All defense multipliers stack multiplicatively:**
```
defWeaponMult = product of all owned defense items' multipliers
```

**Maximum defense multiplier (all items):**
```
1.10 × 1.25 × 1.40 × 1.55 × 1.70 × 1.90 × 2.20 = 17.27×
```

### 16.3 Spy Gear (Multiplicative, binary)

| Item | Spy Power Multiplier | Gold Cost |
|------|---------------------|-----------|
| Shadow Cloak | ×1.15 | 5,000 |
| Dark Mask | ×1.30 | 20,000 |
| Elven Gear | ×1.50 | 80,000 |

**Max spy weapon multiplier:** `1.15 × 1.30 × 1.50 = 2.2425×`

### 16.4 Scout Gear (Multiplicative, binary)

| Item | Scout Defense Multiplier | Gold Cost |
|------|--------------------------|-----------|
| Scout Boots | ×1.15 | 5,000 |
| Scout Cloak | ×1.30 | 20,000 |
| Elven Boots | ×1.50 | 80,000 |

**Max scout weapon multiplier:** `1.15 × 1.30 × 1.50 = 2.2425×`

---

## 17. Personal Power (PP) Calculation

PP is stored in `players.power_*` columns and recalculated after any state change.

### 17.1 PP Formula

```
PP = floor(
  SoldierScore × W_SOLDIERS   +   (W = 1.0)
  EquipScore   × W_EQUIPMENT  +   (W = 1.0)
  SkillScore   × W_SKILLS     +   (W = 1.0)
  min(DevScore, DEV_CAP) × W_DEVELOPMENT +  (W = 1.0, cap = 10,000)
  SpyScore     × W_SPY        (W = 1.0)
)
```

> All weights are currently `1.0` (placeholder). The target distribution is `Soldiers ~45% | Equipment ~25% | Skills ~15% | Dev ~10% | Spy ~5%`. **Balance risk:** current equal weights massively over-reward equipment relative to the 25% target (see §19).

### 17.2 Soldier Score

```
TierValue[tier] = SOLDIER_V × SOLDIER_K ^ (tier - 1)
                = 1 × 3 ^ (tier - 1)

Tier 1 (soldiers):  TierValue = 1 × 3^0 = 1
Tier 2 (cavalry):   TierValue = 1 × 3^1 = 3

SoldierScore = soldiers × 1 + cavalry × 3
```

**Example:** 500 soldiers + 100 cavalry:
```
SoldierScore = 500×1 + 100×3 = 800
```

### 17.3 Equipment Score (PP ranking only)

```
EquipScore = Σ(count × PP[weapon])              for attack weapons  (additive)
           + Σ(count > 0 ? PP[item] : 0)        for defense items   (binary)
           + Σ(count > 0 ? PP[item] : 0)        for spy items       (binary)
           + Σ(count > 0 ? PP[item] : 0)        for scout items     (binary)
```

**Max possible EquipScore:**
```
Attack:  25×2 + 12×5 + 6×12 + 3×28 + 1×64 + 1×148 + 1×340
       = 50 + 60 + 72 + 84 + 64 + 148 + 340 = 818

Defense: 150 + 800 + 2,500 + 8,000 + 25,000 + 70,000 + 150,000 = 256,450
Spy:     500 + 2,000 + 8,000 = 10,500
Scout:   500 + 2,000 + 8,000 = 10,500

Total max EquipScore ≈ 278,268
```

### 17.4 Skill Score

```
SkillScore = attack_level × 100 + defense_level × 100
           + spy_level × 80 + scout_level × 80
```

### 17.5 Development Score

```
DevScore_raw = gold_level×50 + food_level×50 + wood_level×50 + iron_level×50
             + population_level×75 + fortification_level×100

DevScore = min(DevScore_raw, 10,000)

Max at full development (all level 10/5):
  10×50 + 10×50 + 10×50 + 10×50 + 10×75 + 5×100 = 2,750
  (well below 10,000 cap — cap is precautionary)
```

### 17.6 Spy Score

```
SpyScore = spies × 5 + scouts × 5
```

---

## 18. Stored Power vs. Combat Power

**Important distinction:** `power.ts` computes **stored power** (displayed on profile, used for rankings). `combat.ts` computes **PP for combat** from the same raw data. They follow similar but not identical formulas.

### 18.1 Stored Attack Power (`power_attack`)

```
baseAttackUnits  = soldiers + cavalry × cavalryMultiplier  (cavalryMultiplier = 2)
attackWeaponPower = Σ(count × BALANCE.weapons.attack[w].power)  for all attack weapons
attackTrainMult  = 1 + attack_level × 0.08
power_attack     = floor(
  (baseAttackUnits + attackWeaponPower) × attackTrainMult × raceAttackMult
)
```

### 18.2 Stored Defense Power (`power_defense`)

```
baseDefenseUnits = soldiers + cavalry × 2
defWeaponMult    = product of all owned defense item multipliers (1.10 × 1.25 × ...)
defenseTrainMult = 1 + defense_level × 0.08
fortMult         = 1 + (fortification_level - 1) × 0.10
power_defense    = floor(
  baseDefenseUnits × defWeaponMult × defenseTrainMult × fortMult × raceDefenseMult
)
```

### 18.3 Stored Spy Power (`power_spy`)

```
spyTrainMult = 1 + spy_level × 0.08
spyWeaponMult = 1.0 × (1.15 if shadow_cloak) × (1.30 if dark_mask) × (1.50 if elven_gear)
power_spy    = floor(spies × spyTrainMult × spyWeaponMult × raceSpyMult)
```

### 18.4 Stored Scout Power (`power_scout`)

```
scoutTrainMult  = 1 + scout_level × 0.08
scoutWeaponMult = 1.0 × (1.15 if scout_boots) × (1.30 if scout_cloak) × (1.50 if elven_boots)
power_scout     = floor(scouts × scoutTrainMult × scoutWeaponMult × raceScoutMult)
```

### 18.5 Total Power

```
power_total = power_attack + power_defense + power_spy + power_scout
```

---

## 19. Balance Risk Analysis

### 19.1 Snowball Risks

**A. Equipment PP inflation (HIGH RISK)**

The PP weight system targets:
- Soldiers: ~45%, Equipment: ~25%, Skills: ~15%, Dev: ~10%, Spy: ~5%

But all weights are currently `1.0`, meaning equipment is on equal footing. The maximum EquipScore from defense armor alone (256,450) dwarfs anything a mid-season soldier can achieve. A player who reaches God's Armor has a **massive PP boost** that is permanent and immune to combat. Since PP drives rankings and clan contributions, this creates a compounding advantage:

```
God's Armor alone: +150,000 PP (Equipment × 1.0)
vs. 150,000 soldiers: +150,000 PP (Soldier × 1.0)

But soldiers can be killed. Armor cannot.
```

**Risk:** High-investment equipment players become unkillable in PP rankings without ever training soldiers. Adjust `W_EQUIPMENT` downward significantly (target: `~0.25–0.30×` vs soldiers at `1.0`).

**B. Clan bonus self-reinforcement (MEDIUM RISK)**

```
ClanBonus ≤ 0.20 × PlayerPP
```

A clan with powerful members grows even stronger in combat because the bonus scales with collective PP. High-PP clans can generate up to 20% combat bonus for all members. Combined with hero effects (+50%), a top player in a top clan reaches:

```
ECP = PP × (1 + 0.50) × 1.0 + 0.20×PP = PP × 1.70
```

compared to a clanless player with no hero:
```
ECP = PP × 1.0
```

A 1.70× ECP advantage at equal PP means R = 1.70 → guaranteed win, 30% defender losses, 19.5% attacker losses. This creates an entrenchment effect where established clans cannot be challenged by solo players.

**C. Slave production compounding (MEDIUM RISK)**

Slaves produce resources that buy more slaves. The relationship is:
```
more slaves → more resources/tick → can afford more slaves → more resources → ...
```

With hero SLAVE_OUTPUT effects stacked (up to +50%), a whale-tier player at city 5 (once CITY_PRODUCTION_MULT is set) could have production rates that outpace any manual farming. The wealth gap widens every 30 minutes.

**D. Advanced skill training has no level cap (LOW→HIGH RISK)**

The code does not enforce a maximum level on `attack_level`, `defense_level`, etc. Cost scales as `300 × (L+1)` which grows linearly — **not exponentially**. A player willing to spend enough gold can achieve:

```
Level 100: trainMult = 1 + 100 × 0.08 = 9.00× attack multiplier
```

This would make their attack power 9× any equal-sized army with no skill investment. **Immediate recommendation:** add a max level cap (suggested: 20–30).

### 19.2 Late-Game Breaks

**A. City production multipliers unset**

`CITY_PRODUCTION_MULT` is `[TUNE: unassigned]` for all 5 cities. City migration has no production incentive until these values are assigned. Currently all cities produce identically. Players have no reason to promote beyond social/capacity gains.

**B. Bank interest rates unset**

`BANK_INTEREST_RATE_BASE` and `BANK_INTEREST_RATE_PER_LEVEL` are both `[TUNE: unassigned]`. The bank generates zero interest in production. The bank is currently purely a safety vault, not a growth mechanism. This is fine for beta but must be set for season economy to function as designed.

**C. City promotion requirements unset**

All promotion thresholds are `[TUNE: unassigned]`. The city promotion button is currently unconstrained (UI shows requirements but values are undefined). Any player can promote at any time.

**D. Loot decay hard-stops farming but not concentration**

After 5 attacks on the same target in 12 hours, loot decays to 10%. This prevents pure farming of one target. However, an attacker can rotate across many targets for full loot on each. With 144 turns/day (each attack costs 1), and no inter-target cooldown, a highly active player can attack 144 different targets per day at full loot rate. The anti-farm system protects individual players but not the aggregate gold supply.

**E. No defender warning system**

There is no detection or notification for being spied on or attacked (beyond the realtime system). A dominant player can execute multiple attacks per tick-cycle without any counterplay from the defender other than shields (which have limited availability).

### 19.3 Pay-to-Win Dynamics

**A. VIP production bonus is strictly additive and non-trivial**

VIP gives `×1.10` to all slave production and population growth. In a 90-day season:

```
Slave gold output without VIP: S per tick × 4,320 ticks = 4,320S
Slave gold output with VIP:    S × 1.10 × 4,320 = 4,752S

Advantage: +432S total gold across season (10% more)
```

At scale (1,000 slaves, dev level 10, avg rate 6.5/tick): VIP yields +2,800,800 additional gold over the season. This is **significant but not game-breaking** (roughly 10% economy advantage).

**B. Hero shield rotation is a strong defensive capability**

Resource Shield (23h active, 1h cooldown) means a paying player can have near-permanent resource protection with 1-hour gaps each day. During the 1h gap, they can use a Soldier Shield. Combined, a VIP/crystal user could theoretically have near-zero loot exposure.

```
Daily loot windows for a shielded player:
  1 hour unprotected × 2 shield types = at most 2 hours/day of vulnerability
  (if perfectly managed: only 1 gap hour per day)
```

**C. Turns booster (crystals item) is not yet implemented in tick logic**

The `crystals.items.turnBooster` is defined in config but not wired to a purchase/delivery route. Until implemented, this is not a live pay-to-win vector.

**D. Hero mana-to-power conversion is the core monetization loop**

Mana gates hero spell activation. Max natural mana gain is 4/tick (with VIP and level 50+ hero). At 4 mana/tick × 48 ticks/day = 192 mana/day. Each combat shield costs 10 mana. Without purchasing crystals/mana refills, a player gets:
```
192 mana/day ÷ 10 mana/shield = 19.2 shields/day (natural)
```
This is sufficient for continuous coverage without spending. **Pay-to-win risk is lower than expected here** because natural mana is generous.

**E. Attack power effects (ATTACK_POWER_10 at +10%, capped at +50%) give 50% ECP boost**

Combined with clan bonus (+20% of PP): a full-hero + full-clan player has ECP up to `PP × 1.70`. This means a 10,000 PP hero player beats a 14,706 PP unshielded, clanless player in combat. This is the largest pay-to-win gap in the current system.

```
Hero player ECP: 10,000 × 1.50 + 2,000 = 17,000
Plain player ECP: 14,706 × 1.0 = 14,706
Ratio: 17,000 / 14,706 = 1.156 → hero WINS despite 47% less PP
```

**Mitigation:** Defense hero effects (+50%) counter attack hero effects (+50%) symmetrically. The worst case is a whale attacking a free player, which yields a `(PP × 1.50) / (PP × 1.0) = 1.50` ratio advantage — enough for a win against an equal-PP free player but requires the hero player to actually invest in high PP as well.

---

*Document generated by reverse-engineering source code. Update this document whenever `config/balance.config.ts`, `lib/game/combat.ts`, `lib/game/tick.ts`, `lib/game/power.ts`, or any API route formula changes.*

*Last extracted: March 2026.*
