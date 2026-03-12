# Domiron v5 — Game Formulas Reference

> **Source:** All formulas extracted verbatim from:
> `lib/game/tick.ts`, `lib/game/combat.ts`, `lib/game/power.ts`, `lib/game/hero-effects.ts`, `lib/game/season.ts`, `app/api/attack/route.ts`, `app/api/spy/route.ts`, `app/api/training/basic/route.ts`, `app/api/training/advanced/route.ts`, `app/api/training/untrain/route.ts`, `app/api/mine/allocate/route.ts`, `app/api/develop/upgrade/route.ts`, `config/balance.config.ts`
>
> Values annotated `[TUNE: unassigned]` are intentionally undefined. Do not use in production until set.

---

## 1. Resource Production Per Tick

**Source:** `lib/game/tick.ts` → `calcSlaveProduction`, `app/api/tick/route.ts`

### Formula

```
devOffset  = (devLevel - 1) × 0.5
cityMult   = slaveProductionMultByCity[city]   (1.0 / 1.3 / 1.7 / 2.2 / 3.0 for cities 1–5)
vipMult    = 1.10  if vip_until > now()  else  1.0
slaveBonus = clamped hero SLAVE_OUTPUT bonus (0–0.50)  [UNCERTAIN: not applied in tick route]

rateMin = (baseMin + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)
rateMax = (baseMax + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)

output_min = floor(slavesAssigned × rateMin)
output_max = floor(slavesAssigned × rateMax)
output_tick = floor(output_min + random() × (output_max - output_min))
```

**Constants:**
- `baseMin = 1.0`, `baseMax = 3.0` `[TUNE]`
- `slaveProductionMultByCity` = City 1: ×1.0 | City 2: ×1.3 | City 3: ×1.7 | City 4: ×2.2 | City 5: ×3.0

**Per-resource assignment (migration 0005):**
```
gold produced by  slaves_gold  × f(gold_level)
iron produced by  slaves_iron  × f(iron_level)
wood produced by  slaves_wood  × f(wood_level)
food produced by  slaves_food × f(food_level)
idle slaves (slaves - assigned total) produce nothing
```

**Example (dev level 3, city mult = 1, no VIP):**
```
devOffset = (3-1) × 0.5 = 1.0
rateMin = (1.0 + 1.0) × 1 × 1 = 2.0
rateMax = (3.0 + 1.0) × 1 × 1 = 4.0
50 slaves assigned to gold:
  output_min = floor(50 × 2.0) = 100
  output_max = floor(50 × 4.0) = 200
  expected avg = 150 gold / tick
```

**Scaling:** Linear in slave count. Linear in devLevel (additive offset). Multiplicative with city/VIP.

**Balance risk:**
- All slaves previously produced ALL resources simultaneously (pre-migration). The new system requires intentional assignment — idle slaves produce nothing.
- `raceGoldBonus` (human +0.15, dwarf +0.03) is currently NOT applied in the tick route. [UNCERTAIN]
- `slaveBonus` from hero effects is NOT applied in the tick route. [UNCERTAIN]

---

## 2. Population Growth Per Tick

**Source:** `lib/game/tick.ts` → `calcPopulationGrowth`

```
base = populationPerTick[population_level]
vipMult = 1.10 if VIP else 1.0
popAdded = floor(base × vipMult)
```

**Lookup table:**
| Level | pop/tick |
|-------|---------|
| 1 | 3 |
| 2 | 6 |
| 3 | 9 |
| 4 | 12 |
| 5 | 15 |
| 6 | 18 |
| 7 | 21 |
| 8 | 24 |
| 9 | 27 |
| 10 | 30 |

Applied to: `army.free_population += popAdded` each tick.
**Scaling:** Linear (+3 per level). Level 10 produces 10× level 1.

---

## 3. Unit Training

**Source:** `app/api/training/basic/route.ts`, `config/balance.config.ts`

### Basic training cost

```
goldCost = unitCost[unit].gold × amount
```

| Unit | Gold Each | Pop Cost | Special |
|------|-----------|----------|---------|
| soldier | 60 | 1 | combat (Tier 1) |
| slave | **0** | 1 | converts pop → idle slave (FREE) |
| spy | 80 | 1 | intel |
| scout | 80 | 1 | counter-intel |
| cavalry | 10,000 | 5 | costs 5 `free_population` per unit (`popCost = 5`) |
**Flow:**
```
free_population  -= amount    (all units; cavalry costs 5 per unit, all others cost 1)
[unit column]    += amount
resources.gold   -= goldCost
```

**Note:** Farmer unit does not exist in v5. Removed from training system.
**Note:** No capacity cap on combat units. `players.capacity` is a legacy DB column — not used by any training gate.
**Note:** Cavalry has **no soldier requirement**. Only requires gold + 5 `free_population` per unit.

**Slave cost is FREE** — converts `free_population → army.slaves` (idle), no gold spent.

---

## 4. Unit Untrain — REMOVED

**Source:** `app/api/training/untrain/route.ts` (tombstone — returns 410 Gone)

Training is **irreversible**. There is no untrain mechanic in v5. The route exists only as a tombstone to return a clear error to stale clients. Any documentation or UI describing an untrain flow is stale.

---

## 5. Advanced Skill Training

**Source:** `app/api/training/advanced/route.ts`

```
goldCost = advancedCost.gold × (currentLevel + 1)
foodCost = advancedCost.food × (currentLevel + 1)
         = 5000 × (currentLevel + 1)  for each resource
```

**Effect:** Each level adds `advancedMultiplierPerLevel = 0.08` (8%) to the relevant power calculation.

**Example:**
- Level 0 → 1: costs 5,000 gold + 5,000 food. Multiplier: ×1.00 → ×1.08
- Level 4 → 5: costs 25,000 gold + 25,000 food. Multiplier: ×1.32 → ×1.40

**Scaling:** Linear cost growth. Multiplicative power gain. No upper level cap [UNCERTAIN: balance risk].

---

## 6. Slave Assignment

**Source:** `app/api/mine/allocate/route.ts`

```
gold + iron + wood + food ≤ army.slaves   (server-validated)
idle = army.slaves - (gold + iron + wood + food)
```

- Each slave is in exactly one state: idle, gold, iron, wood, or food.
- Assignment persisted in `army.slaves_gold/iron/wood/food`.
- Effective next tick.
- Season-gated (423 if season ended).

---

## 7. Development Upgrade Cost

**Source:** `app/api/develop/upgrade/route.ts`, `app/(game)/develop/DevelopClient.tsx`

```
next = currentLevel + 1

if next ≤ 2:  costConfig = level2  { gold: 50,     resource: 50     }
elif next ≤ 3: costConfig = level3  { gold: 250,    resource: 250    }
elif next ≤ 5: costConfig = level5  { gold: 20,000, resource: 20,000 }
else:          costConfig = level10 { gold: 75,000, resource: 75,000 }

goldCost     = costConfig.gold     × next
resourceCost = costConfig.resource × next
```

**Resource type per field:** gold_level → gold; food_level → food; wood_level → wood; iron_level → iron; fortification_level → gold (no resource cost)

**Example (iron_level 4 → 5):**
```
next = 5, costConfig = level5
goldCost     = 20,000 × 5 = 100,000 gold
resourceCost = 20,000 × 5 = 100,000 iron
```

**Max levels:** gold/food/wood/iron/population = 10; fortification = 5.

---

## 8. Personal Power (PP)

**Source:** `lib/game/combat.ts` → `calculatePersonalPower`, `lib/game/power.ts`

```
PP = (SoldierScore          × W_SOLDIERS  )
   + (EquipScore            × W_EQUIPMENT )
   + (min(DevScore, DEV_CAP) × W_DEVELOPMENT)
   + (SkillScore            × W_SKILLS   )
   + (SpyScore              × W_SPY      )

PP = floor(above sum)
```

**All weights currently = 1.0 [TUNE: placeholder]**

### Soldier Score
```
TierValue[tier] = SOLDIER_V × SOLDIER_K^(tier-1)   (SOLDIER_V=1, SOLDIER_K=3)
Tier 1 (soldiers): value = 1
Tier 2 (cavalry):  value = 3

SoldierScore = soldiers × 1 + cavalry × 3
```

### Equipment Score
```
Attack weapons (additive per unit):
  slingshot    × 2  + boomerang    × 5  + pirate_knife × 12
+ axe          × 28 + master_knife × 64 + knight_axe   × 148 + iron_ball × 340

Defense gear (binary — 1 if owned, 0 if not):
  wood_shield    → 150    iron_shield    → 800    leather_armor → 2,500
  chain_armor    → 8,000  plate_armor    → 25,000 mithril_armor → 70,000  gods_armor → 150,000

Spy gear (binary): shadow_cloak → 500, dark_mask → 2,000, elven_gear → 8,000
Scout gear (binary): scout_boots → 500, scout_cloak → 2,000, elven_boots → 8,000

EquipScore = sum of all above
```

### Skill Score
```
SkillScore = attack_level  × 100
           + defense_level × 100
           + spy_level     × 80
           + scout_level   × 80
```

### Dev Score
```
DevScore_raw = gold_level          × 50
             + food_level          × 50
             + wood_level          × 50
             + iron_level          × 50
             + population_level    × 75
             + fortification_level × 100

DevScore = min(DevScore_raw, DEV_CAP)    DEV_CAP = 10,000
```

### Spy Score
```
SpyScore = spies × 5 + scouts × 5
```

**Example (100 soldiers, 20 cavalry, axe ×3, attack_level 2, gold_level 3):**
```
SoldierScore = 100 × 1 + 20 × 3 = 160
EquipScore   = 3 × 28 = 84
SkillScore   = 2 × 100 = 200
DevScore     = min(3 × 50, 10000) = 150
SpyScore     = 0
PP = 160 + 84 + 200 + 150 + 0 = 594
```

**PP does NOT change on:** clan join/leave, hero activation, resource changes, city migration alone.
**PP recalculates after:** soldier count change, equipment buy/sell, skill level up, development level up.

---

## 9. Stored Power (power.ts)

**Source:** `lib/game/power.ts` → `recalculatePower`

Stored power differs from PP — it uses actual combat formulas and race bonuses.

### Attack Power
```
baseAttackUnits  = soldiers + cavalry × cavalryMultiplier (2)
weaponPower      = Σ(weapon_count × weapon.power)
attackTrainMult  = 1 + attack_level × 0.08
raceAttackMult   = 1.10 for orc / 1.03 for human / 1.0 others

power_attack = floor((baseAttackUnits + weaponPower) × attackTrainMult × raceAttackMult)
```

### Defense Power
```
baseDefenseUnits = soldiers + cavalry × cavalryMultiplier (2)
defWeaponMult    = product of all owned defense gear multipliers (1.10 × 1.25 × ... × 2.20)
defenseTrainMult = 1 + defense_level × 0.08
fortMult         = 1 + (fortification_level - 1) × 0.10
raceDefenseMult  = 1.15 for dwarf / 1.03 for orc / 1.0 others

power_defense = floor(baseDefenseUnits × defWeaponMult × defenseTrainMult × fortMult × raceDefenseMult)
```

### Spy Power
```
spyTrainMult  = 1 + spy_level × 0.08
spyWeaponMult = product of owned spy gear (shadow_cloak ×1.15, dark_mask ×1.30, elven_gear ×1.50)
raceSpyMult   = 1.20 for elf / 1.0 others

power_spy = floor(spies × spyTrainMult × spyWeaponMult × raceSpyMult)
```

### Scout Power
```
scoutTrainMult  = 1 + scout_level × 0.08
scoutWeaponMult = product of owned scout gear (scout_boots ×1.15, scout_cloak ×1.30, elven_boots ×1.50)
raceScoutMult   = 1.20 for elf / 1.0 others

power_scout = floor(scouts × scoutTrainMult × scoutWeaponMult × raceScoutMult)
```

### Total
```
power_total = power_attack + power_defense + power_spy + power_scout
```

---

## 10. Combat Resolution

**Source:** `lib/game/combat.ts` → `resolveCombat`, `app/api/attack/route.ts`

### Step 1: Personal Power
```
attackerPP = calculatePersonalPower(attacker's army/weapons/training/development)
defenderPP = calculatePersonalPower(defender's army/weapons/training/development)
```

### Step 2: Clan Bonus
```
ClanBonus_raw = totalClanPP × EFFICIENCY[devLevel]
EFFICIENCY[1] = 0.05, [2] = 0.08, [3] = 0.10, [4] = 0.12, [5] = 0.15

ClanBonus = min(ClanBonus_raw, 0.20 × PlayerPP)
         = 0  if no clan
```

### Step 3: ECP (Effective Combat Power)
```
ECP = floor((PP × (1 + heroBonus)) + ClanBonus)
heroBonus = clamped TotalAttackBonus or TotalDefenseBonus (0–0.50)
```
Hero multiplies PP only — NEVER multiplies ClanBonus.

### Step 4: Ratio & Outcome
```
R = attackerECP / defenderECP    (if defenderECP = 0 → R = WIN_THRESHOLD + 1)

R ≥ 1.0  → 'win'   [FIXED — binary, no partial/draw]
R <  1.0  → 'loss'
```

### Step 5: Soldier Losses
```
rawAttackerRate  = BASE_LOSS (0.15) / max(R, 0.01)
rawDefenderRate  = BASE_LOSS (0.15) × R

attackerLossRate = clamp(rawAttackerRate, ATTACKER_FLOOR (0.03), MAX_LOSS_RATE (0.30))
defenderLossRate = clamp(rawDefenderRate, DEFENDER_BLEED_FLOOR (0.05), MAX_LOSS_RATE (0.30))

attackerLosses = floor(deployedSoldiers × attackerLossRate)
defenderLosses = floor(defenderSoldiers × defenderLossRate)
```

**Protection flags (applied after rate calculation):**
- `defenderIsProtected` OR `killCooldownActive` OR `soldierShieldActive` → `defenderLosses = 0`
- `attackerIsProtected` → `attackerLosses = 0`
- Attacker always pays turns + food regardless.

### Step 6: Slave Conversion
```
slavesCreated = floor(defenderLosses × CAPTURE_RATE (0.10))
             = 0  if defenderLosses = 0
```
Converts killed defender soldiers into slaves for the attacker. Does NOT touch defender's existing slaves.

### Step 7: Loot
```
if defenderIsProtected OR outcome = 'loss':  loot = {0,0,0,0}

outcomeMult = { win: 1.0, loss: 0.0 }
decayFactor = LOOT_DECAY_STEPS[min(attackCount-1, 4)]  →  [1.0, 0.70, 0.40, 0.20, 0.10]
totalMult   = BASE_LOOT_RATE (0.10) × outcomeMult × decayFactor

loot[r] = floor(unbanked[r] × totalMult)   for r in {gold, iron, wood, food}
```

**Resource shield:** if active → `loot = {0,0,0,0}` (applied after calculation)

### Step 8: Food Cost (gate, not formula)
```
foodCost = ceil(soldiers × FOOD_PER_SOLDIER (0.05) × turnsUsed × foodMultiplier)
foodMultiplier = 1.0 normally; 0.75 if tribe battle_supply active (−25%)
```
Paid upfront before combat. Deducted regardless of outcome.

**Example (R = 1.35, 200 deployed soldiers, 100 defender soldiers, 1000 gold unbanked):**
```
attackerLossRate = clamp(0.15/1.35, 0.03, 0.30) = clamp(0.111, ...) = 0.111
defenderLossRate = clamp(0.15×1.35, 0.05, 0.30) = clamp(0.2025, ...) = 0.2025

attackerLosses = floor(200 × 0.111) = 22
defenderLosses = floor(100 × 0.2025) = 20
slavesCreated  = floor(20 × 0.10) = 2

loot.gold = floor(1000 × 0.20 × 1.0 × 1.0) = 200  (win, first attack)
```

**Scaling:** Ratio is the key lever. Loss rate is clamped — no total wipes. Loot decays exponentially with repeat attacks.

---

## 11. Kill Cooldown Check

**Source:** `lib/game/combat.ts` → `isKillCooldownActive`

```
cooldownActive = (now - lastKillAt) < KILL_COOLDOWN_HOURS × 3,600,000 ms
lastKillAt = most recent attack where defenderLosses > 0 in the (attacker→target) pair
```

`KILL_COOLDOWN_HOURS = 6`

When active: `defenderLosses = 0`, `slavesCreated = 0`. Loot still applies.

---

## 12. New Player Protection

**Source:** `lib/game/combat.ts` → `isNewPlayerProtected`

```
Season gate:
  if (now - seasonStartedAt) < protectionStartDays × 86,400,000 ms → protected = false

Per-player check (after gate opens):
  protected = (now - playerCreatedAt) < PROTECTION_HOURS × 3,600,000 ms

PROTECTION_HOURS = 24, protectionStartDays = 10
```

- `defenderIsProtected = true` → `defenderLosses = 0`, loot = 0
- `attackerIsProtected = true` → `attackerLosses = 0`
- Attacks are NEVER blocked — they resolve for UX, just have no effect.

---

## 13. Loot Decay (Anti-Farm)

**Source:** `lib/game/combat.ts` → `getLootDecayMultiplier`

```
attackCount = attacks by (this attacker, this target) within DECAY_WINDOW_HOURS (12h) including current

decayFactor = LOOT_DECAY_STEPS[min(attackCount-1, 4)]
            = [1.0, 0.70, 0.40, 0.20, 0.10]
```

1st attack = 1.0×, 2nd = 0.70×, 3rd = 0.40×, 4th = 0.20×, 5th+ = 0.10×.

---

## 14. Spy Mission

**Source:** `app/api/spy/route.ts`

### Spy Power
```
trainMult    = 1 + spy_level × 0.08
weaponMult   = product of owned spy gear (shadow_cloak ×1.15, dark_mask ×1.30, elven_gear ×1.50)
raceSpyMult  = 1.20 for elf, 1.0 for others

spyPower = floor(spiesSent × trainMult × weaponMult × raceSpyMult)
```

### Scout Defense
```
scoutTrainMult  = 1 + scout_level × 0.08
scoutWeaponMult = product of owned scout gear (×1.15, ×1.30, ×1.50)
raceScoutMult   = 1.20 for elf, 1.0 for others

scoutDefense = floor(scouts × scoutTrainMult × scoutWeaponMult × raceScoutMult)
```

### Outcome
```
success = spyPower > scoutDefense

On failure:
  ratio      = min(scoutDefense / max(spyPower, 1), 1.0)
  rawCatch   = floor(spiesSent × catchRate (0.30) × ratio)
  spiesCaught = min(rawCatch, floor(spiesSent × MAX_CATCH_RATE (0.80)))
```

Turn cost: `BALANCE.spy.turnCost = 1` (paid regardless of outcome).

---

## 15. Hero Mana Per Tick

**Source:** `lib/game/tick.ts` → `calcHeroManaGain`

```
mana = base (1)
     + level10bonus (1)   if heroLevel >= 10
     + level50bonus (1)   if heroLevel >= 50
     + vipBonus    (1)    if VIP active
```

Hero mana regenerates each tick regardless of shield or effect state.

---

## 16. Hero Effects

**Source:** `lib/game/hero-effects.ts` → `calcActiveHeroEffects`

Active effects: `WHERE player_id = $1 AND ends_at > now()`

**Stack rule:**
```
rawSlaveBonus   += EFFECT_RATES[type]   (additive per active effect)
rawAttackBonus  += ...
rawDefenseBonus += ...

totalSlaveBonus   = min(rawSlaveBonus,   MAX_STACK_RATE = 0.50)
totalAttackBonus  = min(rawAttackBonus,  0.50)
totalDefenseBonus = min(rawDefenseBonus, 0.50)
```

Effect rates: SLAVE_OUTPUT_10 = +0.10, SLAVE_OUTPUT_20 = +0.20, SLAVE_OUTPUT_30 = +0.30
ATTACK_POWER_10 = +0.10, DEFENSE_POWER_10 = +0.10

**Shields:**
```
RESOURCE_SHIELD → loot = 0 in combat
SOLDIER_SHIELD  → defenderLosses = 0 in combat
Shield active: 23h | Cooldown: 1h
```

---

## 17. Bank System

**Source:** `app/api/bank/deposit/route.ts`, `lib/game/tick.ts` → `calcBankInterest`

### Deposit limits
```
maxDepositPercent = 1.0  (100% of hand)
depositsPerDay    = 5    (resets at midnight via last_deposit_reset)
maxLifetimeDeposits = 5  (total deposits ever — historical cap)
```

### Interest (daily, applied once at midnight tick)
```
interest = floor(balance × INTEREST_RATE_BY_LEVEL[interestLevel])
```

| Level | Rate |
|-------|------|
| 0 | 0% |
| 1 | 0.5% |
| 2 | 0.75% |
| 3 | 1.0% |
| 4 | 1.25% |
| 5 | 1.5% |
| 6 | 1.75% |
| 7 | 2.0% |
| 8 | 2.25% |
| 9 | 2.5% |
| 10 | 3.0% |

---

## 18. Tribe/Clan Mana Per Tick

**Source:** `lib/game/tick.ts` → `calcTribeManaGain`

```
manaGain = max(1, floor(memberCount × manaPerMemberPerTick (1)))
```

1 mana per tick per member, minimum 1.

---

## 19. Turn Regeneration Per Tick

**Source:** `lib/game/tick.ts` → `calcTurnsToAdd`

```
if is_vacation:
  toAdd = ceil(turnsPerTick (3) × vacationTurnsMultiplier (0.33)) = 1

else:
  toAdd = turnsPerTick (3)

new_turns = min(current_turns + toAdd, maxTurns (200))
```

No regen if already at maxTurns.

---

## 20. Season Freeze Logic

**Source:** `lib/game/season.ts` → `getActiveSeason`

```sql
SELECT * FROM seasons
WHERE status = 'active' AND ends_at > now()
LIMIT 1
```

Returns `null` if:
- No season with `status = 'active'` (hard reset just ran), OR
- Active season's `ends_at` ≤ now (season expired — auto-freeze, no cron needed)

All gameplay write routes check: `if (!activeSeason) return seasonFreezeResponse()` → HTTP 423.

---

## 21. Catch-Up Multiplier

**Source:** `lib/utils.ts` → `getCatchUpMultiplier`

Applied to starting resources for late-joining players.

```
days = floor((now - seasonStart) / 86,400,000)

days ≤ 7:  multiplier = 1×
days ≤ 30: multiplier = 2×
days ≤ 60: multiplier = 5×
days ≤ 80: multiplier = 10×
else:      multiplier = 20×
```

Applied only to starting gold/iron/wood/food. NOT applied to turns or population.

---

## 22. City Production Multiplier

**Source:** `config/balance.config.ts` → `slaveProductionMultByCity`

```
City 1 → ×1.0   (baseline)
City 2 → ×1.3   (+30%)
City 3 → ×1.7   (+70%)
City 4 → ×2.2   (+120%)
City 5 → ×3.0   (+200%)
```

Applied in `calcSlaveProduction` as `cityMult`. Affects slave resource output only — no effect on combat, power, loot, or bank.

---

## 23. Fortification Defense Bonus

**Source:** `lib/game/power.ts`

```
fortMult = 1 + (fortification_level - 1) × 0.10

Level 1 → ×1.00 (no bonus)
Level 2 → ×1.10
Level 3 → ×1.20
Level 4 → ×1.30
Level 5 → ×1.40
```

Multiplied into `power_defense` calculation.

---

## Clamps and Min/Max Summary

| Value | Clamp |
|-------|-------|
| turns | `[0, 200]` |
| resources.gold/iron/wood/food | `>= 0` |
| attackerLossRate | `[ATTACKER_FLOOR 0.03, MAX_LOSS_RATE 0.30]` |
| defenderLossRate | `[DEFENDER_BLEED_FLOOR 0.05, MAX_LOSS_RATE 0.30]` |
| ClanBonus | `[0, 0.20 × PlayerPP]` |
| heroBonus (any category) | `[0, MAX_STACK_RATE 0.50]` |
| spiesCaught | `[0, floor(spiesSent × 0.80)]` |
| lootDecay | `[0.10, 1.0]` |
| slaves assigned | `[0, army.slaves]` (summed) |
| idle slaves | derived: `army.slaves − assigned_total ≥ 0` |
