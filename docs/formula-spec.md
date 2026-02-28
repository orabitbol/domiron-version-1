# Domiron v5 — Formula & Implementation Specification

**Status:** Final v1 (corrected)
**Source files:** `config/balance.config.ts`, `lib/game/combat.ts`, `lib/game/tick.ts`
**All constants annotated [FIXED] or [TUNE]. Do not change [FIXED] without GDD update.**

Annotation key:
- `[FIXED]` — Confirmed by design spec. Do not change without GDD update.
- `[TUNE]` — Value confirmed as needed; exact number set during balance phase.
- `[TUNE: placeholder]` — Placeholder value used for structural/test purposes. Replace before production.
- `[TUNE: unassigned]` — No default. Must be explicitly assigned before this constant can be used in production logic.

---

## Table of Contents

1. [Constants & Types](#1-constants--types)
2. [Personal Power (PP)](#2-personal-power-pp)
3. [Clan Combat Bonus](#3-clan-combat-bonus)
4. [Hero Multiplier](#4-hero-multiplier)
5. [Effective Combat Power (ECP)](#5-effective-combat-power-ecp)
6. [Combat Outcome](#6-combat-outcome)
7. [Soldier Losses](#7-soldier-losses)
8. [Kill Cooldown](#8-kill-cooldown)
9. [Slave Conversion](#9-slave-conversion)
10. [Loot System](#10-loot-system)
11. [New Player Protection](#11-new-player-protection)
12. [Turns & Food](#12-turns--food)
13. [Bank Rules](#13-bank-rules)
14. [Cities & Promotion](#14-cities--promotion)
15. [Season](#15-season)
16. [Implementation Checklist](#16-implementation-checklist)
17. [Required DB Migrations](#17-required-db-migrations)

---

## 1. Constants & Types

All constants live in `config/balance.config.ts` and are exported as `BALANCE`.
Never hardcode these values in API routes or components.
Import via `@/lib/game/balance` (barrel re-export).

### Config Object Shape (abbreviated)

```typescript
BALANCE = {
  tick: {
    intervalMinutes:  30,    // [FIXED] Vercel Cron frequency
    turnsPerTick:     3,     // [FIXED] turns added per tick
    maxTurns:         200,   // [FIXED] hard cap
    turnsPerDay:      144,   // [FIXED] informational only (3 × 48 ticks)
  },

  pp: {
    W_SOLDIERS:    number,  // [TUNE: placeholder] component weight
    W_EQUIPMENT:   number,  // [TUNE: placeholder]
    W_SKILLS:      number,  // [TUNE: placeholder]
    W_DEVELOPMENT: number,  // [TUNE: placeholder]
    W_SPY:         number,  // [TUNE: placeholder]
    DEV_CAP:       number,  // [TUNE: placeholder] absolute ceiling on DevScore

    // Soldier tier formula parameters
    SOLDIER_V: number,  // [TUNE: placeholder] Base PP value for a Tier 1 soldier
    SOLDIER_K: number,  // [TUNE: placeholder] Inter-tier multiplier (must be > 1)
    // TierValue[tier] = SOLDIER_V × SOLDIER_K ^ (tier - 1)
    // SoldierScore    = Σ Count[tier] × TierValue[tier]

    EQUIPMENT_PP:   { /* per weapon/item */           },  // [TUNE] per item
    SKILL_PP:       { attack, defense, spy, scout },      // [TUNE] per level
    DEVELOPMENT_PP: { gold, food, wood, iron,
                      population, fortification },        // [TUNE] per level
    SPY_UNIT_VALUE:   number,  // [TUNE]
    SCOUT_UNIT_VALUE: number,  // [TUNE]
  },

  clan: {
    maxMembers:                 20,    // [FIXED]
    BONUS_CAP_RATE:             0.20,  // [FIXED] ClanBonus ≤ 0.20 × PlayerPP
    postMigrationCooldownHours: 48,    // [FIXED]
    normalLeaveCooldownMinutes: 10,    // [FIXED]
    EFFICIENCY: {
      1: 0.05, 2: 0.08, 3: 0.10, 4: 0.12, 5: 0.15
    },                                 // [FIXED]
  },

  hero: {
    HERO_MAX_BONUS: undefined,  // [TUNE: unassigned] Must be set before production
    // ⚠️ clampHeroMultiplier() throws at runtime if this is unassigned.
    // Range guidance once monetization is designed: 0.15–0.50.
  },

  combat: {
    WIN_THRESHOLD:        number,  // [TUNE]
    LOSS_THRESHOLD:       number,  // [TUNE]
    BASE_LOSS:            number,  // [TUNE]
    MAX_LOSS_RATE:        0.30,    // [FIXED] hard cap — never lose more than 30%
    DEFENDER_BLEED_FLOOR: number,  // [TUNE]
    ATTACKER_FLOOR:       number,  // [TUNE]
    CAPTURE_RATE:         0.35,    // [TUNE]
    BASE_LOOT_RATE:       0.20,    // [FIXED]
    FOOD_PER_SOLDIER:     number,  // [TUNE]
    KILL_COOLDOWN_HOURS:  6,       // [FIXED]
    PROTECTION_HOURS:     24,      // [FIXED]
  },

  antiFarm: {
    DECAY_WINDOW_HOURS: 12,       // [FIXED]
    LOOT_DECAY_STEPS: [1.0, 0.70, 0.40, 0.20, 0.10],  // [FIXED]
  },

  bank: {
    maxLifetimeDeposits:      5,         // [FIXED]
    theftProtection:          1.00,      // [FIXED] 100% of banked gold is safe
    BANK_INTEREST_RATE_BASE:      undefined, // [TUNE: unassigned]
    BANK_INTEREST_RATE_PER_LEVEL: undefined, // [TUNE: unassigned]
  },

  cities: {
    total:    5,          // [FIXED]
    S_base:   undefined,  // [TUNE: unassigned] soldier threshold at City 2
    P_base:   undefined,  // [TUNE: unassigned] PP threshold at City 2
    R_base:   { gold, iron, wood, food }, // [TUNE: unassigned] resource cost at City 2
    s_growth: undefined,  // [TUNE: unassigned] per-city multiplier on soldier threshold
    p_growth: undefined,  // [TUNE: unassigned] per-city multiplier on PP threshold
    r_growth: undefined,  // [TUNE: unassigned] per-city multiplier on resource costs
    CITY_PRODUCTION_MULT: { 1, 2, 3, 4, 5 }, // [TUNE: unassigned] per-city output multiplier
    names: { 1:'Izrahland', 2:'Masterina', 3:'Rivercastlor', 4:'Grandoria', 5:'Nerokvor' },
  },
}
```

### Core Types

```typescript
type CombatOutcome = 'win' | 'partial' | 'loss'

interface PersonalPowerInputs {
  army:        Pick<Army, 'soldiers' | 'cavalry' | 'spies' | 'scouts'>
  weapons:     Weapons
  training:    Training
  development: Development
}

interface ClanContext {
  totalClanPP:      number   // Σ PP of all current members
  developmentLevel: number   // 1–5
}

interface HeroContext {
  multiplier: number         // 1.0 = no hero; clamped to 1 + HERO_MAX_BONUS
}

interface UnbankedResources {
  gold: number; iron: number; wood: number; food: number
}
```

---

## 2. Personal Power (PP)

### Formula

```
PP = (SoldierScore           × W_SOLDIERS)
   + (EquipScore             × W_EQUIPMENT)
   + (SkillScore             × W_SKILLS)
   + (min(DevScore, DEV_CAP) × W_DEVELOPMENT)
   + (SpyScore               × W_SPY)
```

### Sub-Score Definitions

#### SoldierScore — Generic Tier Formula

```
TierValue[tier] = SOLDIER_V × SOLDIER_K ^ (tier - 1)

SoldierScore    = Σ Count[tier] × TierValue[tier]
                  for all tiers present in the army
```

**Current DB tier mapping** (subject to final design decision):
- Tier 1 → `army.soldiers`
- Tier 2 → `army.cavalry`

Future soldier tier columns (e.g. elite soldiers) require DB schema extension.

At the placeholder values `SOLDIER_V = 1`, `SOLDIER_K = 3`:

| Tier | Unit column | TierValue |
|---|---|---|
| 1 | soldiers | 1 |
| 2 | cavalry  | 3 |
| 3 | (future) | 9 |
| 4 | (future) | 27 |

**Pseudocode:**
```typescript
function calcSoldierScore(army: { soldiers: number; cavalry: number }): number {
  const { SOLDIER_V, SOLDIER_K } = BALANCE.pp
  const tierCounts = [army.soldiers, army.cavalry]
  return tierCounts.reduce((sum, count, index) => {
    const tier      = index + 1
    const tierValue = SOLDIER_V * Math.pow(SOLDIER_K, tier - 1)
    return sum + count * tierValue
  }, 0)
}
```

**Tuning guide:** Adjust `SOLDIER_K` so upgrading tiers feels meaningful but lower tiers remain
useful as an army base. Target `k ≈ 2.5–3`. `SOLDIER_V` scales the overall PP contribution of
soldiers relative to equipment/skills — adjust alongside `W_SOLDIERS`.

#### EquipScore

```
EquipScore = Σ(attackWeapon_count × EQUIPMENT_PP[weapon])   // additive per unit
           + Σ(defenseItem_owned  × EQUIPMENT_PP[item])     // binary (0 or 1 per item)
           + Σ(spyItem_owned      × EQUIPMENT_PP[item])     // binary
           + Σ(scoutItem_owned    × EQUIPMENT_PP[item])     // binary
```

- **Attack weapons** (slingshot → iron_ball): count × PP value. Multiple units stack.
- **Defense/Spy/Scout gear**: binary. Owning any count > 0 grants the PP value once.

#### SkillScore

```
SkillScore = (attack_level  × SKILL_PP.attack)
           + (defense_level × SKILL_PP.defense)
           + (spy_level     × SKILL_PP.spy)
           + (scout_level   × SKILL_PP.scout)
```

#### DevScore (with mandatory cap)

```
DevScore_raw = (gold_level          × DEVELOPMENT_PP.gold)
             + (food_level          × DEVELOPMENT_PP.food)
             + (wood_level          × DEVELOPMENT_PP.wood)
             + (iron_level          × DEVELOPMENT_PP.iron)
             + (population_level    × DEVELOPMENT_PP.population)
             + (fortification_level × DEVELOPMENT_PP.fortification)

DevScore = min(DevScore_raw, DEV_CAP)
```

`DEV_CAP` is mandatory. Without it, fully-developed late-game players would flatten rank
differences driven by soldiers and equipment.

#### SpyScore

```
SpyScore = (spies  × SPY_UNIT_VALUE)
         + (scouts × SCOUT_UNIT_VALUE)
```

Values are intentionally low to keep Spy at ~5% of total PP.

### When PP Recalculates

| Event | PP updates? |
|---|---|
| Soldier count changes (train / combat losses) | ✅ Yes |
| Equipment bought or sold | ✅ Yes |
| Skill level changes | ✅ Yes |
| Development level changes | ✅ Yes |
| Clan join / leave | ❌ No |
| Hero activated / deactivated | ❌ No |
| Resource changes | ❌ No |
| City migration | ❌ No |

PP is written to the `players` table on every relevant mutation. It is **not** recalculated only on tick.

### Design Rules

- **Hero NEVER affects PP.** `calculatePersonalPower()` has no hero parameter.
- **Clan NEVER affects PP.** `calculatePersonalPower()` has no clan parameter.
- PP is the sole input to the ranking leaderboard. ECP is never stored as a rank.

---

## 3. Clan Combat Bonus

### Assumptions

- Clans start at Development Level 1 automatically (Level 0 is not reachable in play).
- The clan bonus is **additive**. It is **never multiplied by Hero**.
- The bonus applies **only during combat resolution** (attack, defense, spy, scout).
- The bonus **never affects**: loot amount, economy, PP, ranking.

### Efficiency Table (FIXED)

| Dev Level | EfficiencyRate |
|---|---|
| 1 | 5% |
| 2 | 8% |
| 3 | 10% |
| 4 | 12% |
| 5 | 15% |

### Formula

```
TotalClanPP    = Σ PP[member_i]   for all active clan members

ClanBonus_raw  = TotalClanPP × EfficiencyRate(devLevel)

ClanBonus      = min(ClanBonus_raw, 0.20 × PlayerPP)
```

The cap `0.20 × PlayerPP` is evaluated **per player per combat resolution**. It scales with the
individual player's own PP.

**Pseudocode:**
```typescript
function calculateClanBonus(playerPP: number, clan: ClanContext | null): number {
  if (!clan) return 0
  const rate = BALANCE.clan.EFFICIENCY[clan.developmentLevel]
  if (!rate) return 0
  const raw = clan.totalClanPP * rate
  const cap = BALANCE.clan.BONUS_CAP_RATE * playerPP   // 0.20 × playerPP
  return Math.floor(Math.min(raw, cap))
}
```

### Cap Behaviour at Scale

For a full 20-member clan at Level 5 with uniform member PP:

```
TotalClanPP   = 20 × PlayerPP
ClanBonus_raw = 20 × PlayerPP × 0.15 = 3.0 × PlayerPP
ClanBonus     = min(3.0 × PlayerPP, 0.20 × PlayerPP) = 0.20 × PlayerPP
```

A maxed clan always hits the cap. The 20% ceiling is the binding constraint, not the efficiency rate.

---

## 4. Hero Multiplier

```
HeroMultiplier = 1 + HeroBonusRate
HeroBonusRate  ≤ HERO_MAX_BONUS     [TUNE: unassigned]
```

- No hero active → `HeroMultiplier = 1.0`
- Hero affects **ECP only**. Never PP. Never ranking.

> ⚠️ **HERO_MAX_BONUS is intentionally unassigned.**
> It must be determined during monetization tier design.
> Range guidance once monetization is designed: 0.15–0.50.
> Do not call `clampHeroMultiplier()` in production logic until HERO_MAX_BONUS is set.

**Validation function (throws if unassigned):**
```typescript
function clampHeroMultiplier(rawMultiplier: number): number {
  const heroMaxBonus = BALANCE.hero.HERO_MAX_BONUS
  if (heroMaxBonus === undefined) {
    throw new Error('BALANCE.hero.HERO_MAX_BONUS is not assigned. Assign before use.')
  }
  return Math.min(rawMultiplier, 1 + heroMaxBonus)
}
```

---

## 5. Effective Combat Power (ECP)

### Order of Operations (mandatory)

```
Step 1:  ClanBonus = calculateClanBonus(PlayerPP, clan)
Step 2:  ECP = (PlayerPP × HeroMultiplier) + ClanBonus
```

**Why this order matters:**
Hero multiplies **only** PlayerPP. If we computed `(PlayerPP + ClanBonus) × HeroMultiplier`, the
hero would amplify clan contributions — a monetization lever amplifying a social mechanic, creating
exploitable compounding.

### Attacker vs. Defender

```
AttackerECP = (AttackerPP × AttackerHeroMultiplier) + AttackerClanBonus
DefenderECP = (DefenderPP × DefenderHeroMultiplier) + DefenderClanBonus
```

Both attacker and defender use the same clan efficiency rates. This can be split in a future
balance pass by adding `attackEfficiency` and `defenseEfficiency` to the clan config.

### Pseudocode

```typescript
function calculateECP(
  playerPP: number,
  hero: HeroContext,
  clan: ClanContext | null
): number {
  const clanBonus = calculateClanBonus(playerPP, clan)
  return Math.floor((playerPP * hero.multiplier) + clanBonus)
}
```

---

## 6. Combat Outcome

### Ratio

```
R = AttackerECP / DefenderECP

If DefenderECP = 0: R treated as WIN_THRESHOLD + 1 (attacker wins by default)
```

### Outcome Thresholds

```
R ≥ WIN_THRESHOLD  → 'win'
R < LOSS_THRESHOLD → 'loss'
Otherwise          → 'partial'
```

### Design Target: 50–60% Partial

**Tuning method (not numbers):**
1. Simulate 1,000 same-city combat pairs where both players have identical PP.
2. Measure the fraction of outcomes that fall in `[LOSS_THRESHOLD, WIN_THRESHOLD)`.
3. Adjust `WIN_THRESHOLD` up (fewer wins → more partials) or `LOSS_THRESHOLD` down (fewer losses
   → more partials) until the partial fraction hits 50–60%.
4. Re-run simulation with ±20% PP variance to confirm the target holds for near-peers.

### Pseudocode

```typescript
function determineCombatOutcome(ratio: number): CombatOutcome {
  if (ratio >= BALANCE.combat.WIN_THRESHOLD)  return 'win'
  if (ratio <  BALANCE.combat.LOSS_THRESHOLD) return 'loss'
  return 'partial'
}
```

---

## 7. Soldier Losses

### Formulas

```
DefenderLossRate = clamp(BASE_LOSS × R,    DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)
AttackerLossRate = clamp(BASE_LOSS / R,    ATTACKER_FLOOR,       MAX_LOSS_RATE)

killed_soldiers_attacker = floor(DeployedSoldiers_attacker × AttackerLossRate)
killed_soldiers_defender = floor(DeployedSoldiers_defender × DefenderLossRate)
```

Where `clamp(x, lo, hi) = min(max(x, lo), hi)`.

### Loss Rate Behaviour by R

| R | Defender loses | Attacker loses |
|---|---|---|
| `R >> WIN_THRESHOLD` | Near `MAX_LOSS_RATE` (30%) | Near `ATTACKER_FLOOR` |
| `R ≈ 1.0` | `BASE_LOSS%` | `BASE_LOSS%` |
| `R << LOSS_THRESHOLD` | `DEFENDER_BLEED_FLOOR` (floor) | Near `MAX_LOSS_RATE` (30%) |

### Key Guarantees

| Guarantee | Mechanism |
|---|---|
| Neither side ever loses > 30% | `MAX_LOSS_RATE` upper clamp |
| Attacker always loses something | `ATTACKER_FLOOR` lower clamp |
| Defender bleeds even from weak attackers | `DEFENDER_BLEED_FLOOR` lower clamp |
| No single attack wipes an army | 30% cap leaves 70% of army intact |

### Losses Apply to Deployed Only

Losses are computed against `deployedSoldiers`, not total army. A player who sends 500 of their
5,000 soldiers can lose at most 30% of those 500 (= 150 soldiers), not 30% of 5,000.

### Kill Cooldown Interaction

If `killCooldownActive = true`:
- `killed_soldiers_defender = 0` (soldiers protected from kills)
- `slavesCreated = 0`
- `killed_soldiers_attacker` still computed normally (they still fought)
- Loot calculation proceeds normally based on outcome

### Protection Interaction

If `defenderIsProtected = true` (< 24h old):
- `killed_soldiers_defender = 0`
- All loot = 0

If `attackerIsProtected = true` (< 24h old):
- `killed_soldiers_attacker = 0`
- Attacker still pays turns and food (the attack was initiated)

**The attack is NEVER blocked at the gate due to protection.** See [Section 11](#11-new-player-protection).

### Pseudocode

```typescript
function calculateSoldierLosses(
  deployedSoldiers:    number,
  defenderSoldiers:    number,
  ratio:               number,
  killCooldownActive:  boolean,
  attackerIsProtected: boolean,
  defenderIsProtected: boolean,
): SoldierLossResult {
  const rawAttackerRate  = BASE_LOSS / Math.max(ratio, 0.01)
  const attackerLossRate = attackerIsProtected
    ? 0
    : clamp(rawAttackerRate, ATTACKER_FLOOR, MAX_LOSS_RATE)

  const rawDefenderRate  = BASE_LOSS * ratio
  const defenderLossRate = (killCooldownActive || defenderIsProtected)
    ? 0
    : clamp(rawDefenderRate, DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)

  return {
    attackerLosses: Math.floor(deployedSoldiers * attackerLossRate),
    defenderLosses: Math.floor(defenderSoldiers * defenderLossRate),
  }
}
```

---

## 8. Kill Cooldown

```
Cooldown window: KILL_COOLDOWN_HOURS = 6 hours [FIXED]
Tracking: per (attacker_id, target_id) pair
Trigger:  last attack where defenderLosses > 0
```

**Storage:** The API route saves `killed_at: timestamp` in the `attacks` table. The query checks
whether any row with `defenderLosses > 0` exists for `(attacker_id, target_id)` within the last
6 hours.

**Pseudocode:**
```typescript
function isKillCooldownActive(lastKillAt: Date | null, now: Date): boolean {
  if (!lastKillAt) return false
  const elapsed = now.getTime() - lastKillAt.getTime()
  return elapsed < KILL_COOLDOWN_HOURS * 3_600_000
}
```

**During cooldown:** Loot is still allowed. The attacker can attack, the outcome resolves, loot
transfers — but zero soldiers die on the defender's side.

---

## 9. Slave Conversion

```
slaves_gained = floor(killed_soldiers_defender × CAPTURE_RATE)
```

`CAPTURE_RATE = 0.35` [TUNE] — midpoint of the confirmed 0.30–0.40 range.

### Slave Rules (enforced by game logic, not formulas)

| Rule | Enforcement |
|---|---|
| Slaves are permanent | No auto-expiry job exists |
| Slaves produce resources | Included in tick production via `calcSlaveProduction()` |
| Slaves cannot become soldiers | Training API rejects conversion request |
| Slaves never affect PP | Not included in any PP sub-score formula |

If `defenderLosses = 0` (cooldown or protection), then `slaves_gained = 0` automatically —
no special case needed in the slave formula.

---

## 10. Loot System

### Formula

```
BaseLoot[r]  = Unbanked[r] × BASE_LOOT_RATE           (0.20 — 20% of each resource)

OutcomeMult  = { win: 1.0,  partial: 0.5,  loss: 0.0 }

DecayFactor  = LOOT_DECAY_STEPS[min(attackCount - 1, 4)]

FinalLoot[r] = floor(BaseLoot[r] × OutcomeMult × DecayFactor)
```

### Loot Decay Table (FIXED)

| Attack # in 12h window | DecayFactor |
|---|---|
| 1st | 1.00 (100%) |
| 2nd | 0.70 (70%)  |
| 3rd | 0.40 (40%)  |
| 4th | 0.20 (20%)  |
| 5th+ | 0.10 (10%) |

The minimum is 10% — loot never reaches zero from decay alone. The 5+ case uses the last array
index (no further decay beyond 10%).

### Design Rules

| Rule | Value |
|---|---|
| Hard loot cap | None |
| Power-gap block | None — city restriction is the main limiter |
| Bank protection | 100% — only unbanked resources can be looted |
| Decay window | Rolling 12-hour window per (attacker_id, target_id) pair |
| Decay tracking | Count rows in `attacks` table for this pair within 12h |

### Pseudocode

```typescript
function calculateLoot(
  unbanked:            UnbankedResources,
  outcome:             CombatOutcome,
  attackCountInWindow: number,   // minimum 1 (current attack)
  defenderIsProtected: boolean,
): UnbankedResources {
  if (defenderIsProtected || outcome === 'loss') return ZERO_LOOT
  const outcomeMult = LOOT_OUTCOME_MULTIPLIER[outcome]
  const decayFactor = LOOT_DECAY_STEPS[Math.min(attackCountInWindow - 1, 4)]
  const mult        = BASE_LOOT_RATE * outcomeMult * decayFactor
  return {
    gold: Math.floor(unbanked.gold * mult),
    iron: Math.floor(unbanked.iron * mult),
    wood: Math.floor(unbanked.wood * mult),
    food: Math.floor(unbanked.food * mult),
  }
}
```

---

## 11. New Player Protection

```
PROTECTION_HOURS = 24  [FIXED]

isProtected = (now - player.created_at) < 24 hours
```

### Protection Is a Flag — NOT a Gate

**Attacks on protected players are NEVER blocked.** The attack executes, a battle screen is shown,
and the attacker always pays turns + food. Protection is a flag applied inside combat resolution
that zeroes permanent consequences on the protected side.

| Condition | Defender protected | Attacker protected |
|---|---|---|
| Loot transferred | ❌ 0 | N/A |
| Defender soldier losses | ❌ 0 | N/A |
| Slaves created | ❌ 0 | N/A |
| Attacker soldier losses | N/A | ❌ 0 |
| Attack costs (turns + food) | Attacker still pays | Still paid |
| Combat ratio computed | ✅ Yes | ✅ Yes |
| Outcome determined | ✅ Yes | ✅ Yes |
| Battle screen / UX shown | ✅ Yes | ✅ Yes |

This is intentional: new players can experience the full battle flow without being hit with
permanent damage. Attackers cannot "probe" a protected player for free — they still spend resources.

**Pseudocode:**
```typescript
function isNewPlayerProtected(createdAt: Date, now: Date): boolean {
  return (now.getTime() - createdAt.getTime()) < PROTECTION_HOURS * 3_600_000
}
```

---

## 12. Turns & Food

### Turn Regeneration

```
new_turns = min(current_turns + 3, 200)

Condition: regen only occurs when current_turns < 200
Frequency: every 30 minutes (tick)
Daily potential: 48 ticks × 3 = 144 turns/day
```

**Pseudocode:**
```typescript
function calcTurnsAfterRegen(currentTurns: number): number {
  if (currentTurns >= BALANCE.tick.maxTurns) return BALANCE.tick.maxTurns
  return Math.min(currentTurns + BALANCE.tick.turnsPerTick, BALANCE.tick.maxTurns)
}
```

### Attack Cost

```
turns_cost = player_choice (1–10)
food_cost  = deployed_soldiers × FOOD_PER_SOLDIER
```

Both are consumed atomically at attack initiation. If either is insufficient, the attack is blocked
before any combat calculation runs.

### Food as Primary Aggression Limiter

Design constraint (must hold after tuning):

```
MaxAttacks_food  = FoodProducedPerDay / food_cost_per_attack
MaxAttacks_turns = 144 / turns_per_attack

Required: MaxAttacks_food < MaxAttacks_turns
```

If turns are the binding constraint instead of food, food becomes irrelevant as a gate. Tune
`FOOD_PER_SOLDIER` and food production rates together to satisfy this inequality.

**Daily attack ceiling target for a fully active player:** [TUNE] 8–15 attacks/day.

### Gate Check Order (server-side, fail-fast)

```
1. Same clan?              → Block
2. Same city?              → Block (player targeting restriction)
3. Insufficient turns?     → Block
4. Insufficient food?      → Block
5. Kill cooldown active?   → Note (allows attack, blocks soldier kill only)
→ Proceed to combat resolution
   (protection state passed as flags — never blocks the attack)
```

---

## 13. Bank Rules

```
Bank protection:           100% — banked resources are never lootable  [FIXED]
Max lifetime deposits:     5                                            [FIXED]
No deposit delay
No lock-in period
```

### Interest Formula

```
interest = floor(balance × BANK_INTEREST_RATE_BASE)
          + floor(balance × interestLevel × BANK_INTEREST_RATE_PER_LEVEL)
          + floor(balance × vipBankInterestBonus)
```

- `BANK_INTEREST_RATE_BASE` — flat base rate regardless of bank level. `[TUNE: unassigned]`
- `BANK_INTEREST_RATE_PER_LEVEL` — additional rate per bank upgrade level. `[TUNE: unassigned]`
- Both must be assigned during economy balance. Neither has a default value.

> ⚠️ `calcBankInterest()` in `tick.ts` will produce NaN until both rate constants are assigned.

**Pseudocode:**
```typescript
function calcBankInterest(
  balance:       number,
  interestLevel: number,
  vipUntil:      string | null
): number {
  const baseRate  = BALANCE.bank.BANK_INTEREST_RATE_BASE
  const levelRate = interestLevel * BALANCE.bank.BANK_INTEREST_RATE_PER_LEVEL
  const vipRate   = isVipActive(vipUntil) ? BALANCE.vip.bankInterestBonus : 0
  return Math.floor(balance * (baseRate + levelRate + vipRate))
}
```

**Deposit validation:**
```typescript
if (bank.total_deposits >= BALANCE.bank.maxLifetimeDeposits) {
  return error('Maximum lifetime deposits reached')
}
```

**DB migration required:** Add `total_deposits INTEGER NOT NULL DEFAULT 0` to the `bank` table.
The existing `deposits_today` and `last_deposit_reset` columns are retired — the new model tracks
lifetime count only.

---

## 14. Cities & Promotion

```
Total cities: 5  [FIXED]
Promotion:    Sequential only (City 1 → 2 → 3 → 4 → 5)
```

### Promotion Threshold Formulas

All parameters are `[TUNE: unassigned]`. No invented numbers. Assign during balance testing.

```
For C ∈ {2, 3, 4, 5}:

  SoldierThreshold(C) = S_base × s_growth ^ (C - 2)
  PowerThreshold(C)   = P_base × p_growth ^ (C - 2)
  ResourceCost(C)[r]  = R_base[r] × r_growth ^ (C - 2)
```

| Parameter | Meaning | Status |
|---|---|---|
| `S_base` | Min soldiers required to enter City 2 | [TUNE: unassigned] |
| `P_base` | Min PersonalPower required to enter City 2 | [TUNE: unassigned] |
| `R_base[r]` | Resource cost (per type) to enter City 2 | [TUNE: unassigned] |
| `s_growth` | Multiplier applied to soldier threshold per city step | [TUNE: unassigned] |
| `p_growth` | Multiplier applied to PP threshold per city step | [TUNE: unassigned] |
| `r_growth` | Multiplier applied to resource cost per city step | [TUNE: unassigned] |

All three conditions (soldiers, PP, resources) must be satisfied simultaneously to promote.

### Production Multipliers

Higher cities produce more resources per tick. Each city tier has an independently tunable
multiplier — they are not constrained to a linear sequence.

```
SlaveOutput(city)[r] = BaseRate[r] × CITY_PRODUCTION_MULT[city] × vipMult × devOffset
```

| City | `CITY_PRODUCTION_MULT` |
|---|---|
| 1 (Izrahland) | [TUNE: unassigned] |
| 2 (Masterina) | [TUNE: unassigned] |
| 3 (Rivercastlor) | [TUNE: unassigned] |
| 4 (Grandoria) | [TUNE: unassigned] |
| 5 (Nerokvor) | [TUNE: unassigned] |

The production multiplier is the primary economic incentive for promotion. It must be tuned so that
each city tier provides a meaningful and visible production increase over the previous tier.

### Migration Rules

- Player must leave their clan before promoting. If clan leader, leadership must be transferred first.
- After city migration: 48-hour restriction on joining any new clan.
- Normal clan leave: 10-minute restriction before joining a new clan.
- Clan is permanently bound to one city. All members must share that city.
- Resources are consumed on promotion (non-refundable).

---

## 15. Season

```
Duration:    90 days  [FIXED]
Reset scope: Full — soldiers, equipment, skills, development, resources, rank
Carry-over:  Cosmetics only (titles, badges, hall of fame records)
Boundary:    Executed at end of Day 90 tick
```

---

## 16. Implementation Checklist

### `config/balance.config.ts`
- [x] `tick.maxTurns` = 200
- [x] `tick.turnsPerTick` = 3
- [x] `pp.*` — all weights, `SOLDIER_V`, `SOLDIER_K`, sub-score value tables
- [x] `clan.*` — efficiency table, cap rate, cooldowns
- [x] `hero.HERO_MAX_BONUS` — `[TUNE: unassigned]` (explicitly undefined, throws on use)
- [x] `combat.*` — thresholds, loss rates, capture rate, loot rate, food cost, cooldown/protection hours
- [x] `antiFarm.*` — decay window and steps
- [x] `bank.maxLifetimeDeposits` = 5, `BANK_INTEREST_RATE_BASE` and `BANK_INTEREST_RATE_PER_LEVEL` unassigned
- [x] `cities.*` — growth formula constants (S_base, P_base, R_base, s/p/r_growth), `CITY_PRODUCTION_MULT` unassigned
- [x] `season.durationDays` = 90

### `lib/game/combat.ts`
- [x] `calcSoldierScore()` — generic `SOLDIER_V × SOLDIER_K ^ (tier - 1)` formula; accepts tier array or army object
- [x] `calculatePersonalPower()` — PP formula with all sub-scores
- [x] `calculateClanBonus()` — efficiency × totalClanPP, capped at 0.20 × playerPP
- [x] `clampHeroMultiplier()` — throws if `HERO_MAX_BONUS` is unassigned
- [x] `calculateECP()` — correct order: (PP × hero) + clan, no cross-multiplication
- [x] `calculateCombatRatio()` — R = attackerECP / defenderECP
- [x] `determineCombatOutcome()` — win / partial / loss thresholds
- [x] `calculateSoldierLosses()` — clamp formula; protection is a flag (no gate block)
- [x] `convertKilledToSlaves()` — CAPTURE_RATE × killed
- [x] `isKillCooldownActive()` — 6h per attacker→target pair
- [x] `isNewPlayerProtected()` — 24h window; does not block attacks
- [x] `getLootDecayMultiplier()` — decay step array lookup
- [x] `calculateLoot()` — base × outcome × decay, no hard cap; zero when defender protected
- [x] `calculateFoodCost()` — deployed × FOOD_PER_SOLDIER
- [x] `calcTurnsAfterRegen()` — +3 per tick, cap 200
- [x] `resolveCombat()` — orchestrator with correct step order; protection never gates

### `lib/game/tick.ts`
- [x] `calcTurnsToAdd()` — references `BALANCE.tick.maxTurns` (200)
- [x] `calcPopulationGrowth()` — references `BALANCE.training.populationPerTick`
- [x] `calcSlaveProduction()` — uses `BALANCE.cities.CITY_PRODUCTION_MULT` (not removed `production.cityMultipliers`)
- [x] `calcBankInterest()` — uses `BANK_INTEREST_RATE_BASE` + `interestLevel × BANK_INTEREST_RATE_PER_LEVEL`

### `lib/game/combat.test.ts`
- [x] PP: zero state, hero exclusion, clan exclusion, dev cap
- [x] PP: equipment binary vs additive, soldier count scaling
- [x] PP: cavalry contributes more than equal soldiers (tier 2 > tier 1 via generic formula)
- [x] Clan bonus: null clan, cap enforcement, efficiency table (all 5 levels)
- [x] ECP: hero does not multiply clan bonus (correct order of operations verified)
- [x] Outcome: win/partial/loss boundary conditions
- [x] Losses: 30% cap, attacker floor, defender bleed floor
- [x] Losses: kill cooldown zeroes defender losses only
- [x] Losses: protection zeroes respective side; attack NOT blocked
- [x] Losses: applies to deployed count only
- [x] Slaves: capture rate, zero killed → zero slaves
- [x] Loot decay: full sequence 1→5+, floor at 10%
- [x] Loot: outcome multipliers, defender protection, no hard cap
- [x] Kill cooldown: active/inactive boundary at 6h
- [x] Protection: active/inactive boundary at 24h
- [x] Turn regen: +3, cap=200, no-regen at cap, daily consistency
- [x] Hero: `clampHeroMultiplier` throws when `HERO_MAX_BONUS` is unassigned

### `types/game.ts`
- [x] `AttackOutcome` → `'win' | 'partial' | 'loss'`
- [x] `Bank.total_deposits` added (deprecates `deposits_today`)
- [x] `AttackResult` updated with `ratio`, `attacker_ecp`, `defender_ecp`, `slaves_created`

---

## 17. Required DB Migrations

The following schema changes are required before deploying v5 logic:

```sql
-- 1. Update attacks.outcome column constraint
ALTER TABLE attacks
  DROP CONSTRAINT IF EXISTS attacks_outcome_check;

ALTER TABLE attacks
  ADD CONSTRAINT attacks_outcome_check
  CHECK (outcome IN ('win', 'partial', 'loss'));

-- Migrate existing data (map old values to new)
UPDATE attacks SET outcome = 'win'     WHERE outcome IN ('crushing_win');
UPDATE attacks SET outcome = 'partial' WHERE outcome = 'draw';
UPDATE attacks SET outcome = 'loss'    WHERE outcome IN ('crushing_loss');

-- 2. Replace bank deposit tracking
ALTER TABLE bank
  ADD COLUMN IF NOT EXISTS total_deposits INTEGER NOT NULL DEFAULT 0;

ALTER TABLE bank
  DROP COLUMN IF EXISTS deposits_today,
  DROP COLUMN IF EXISTS last_deposit_reset;

-- 3. Add kill cooldown tracking index
-- (Query the attacks table directly: filter WHERE defender_losses > 0
--  within the last 6 hours per (attacker_id, defender_id) pair.)
CREATE INDEX IF NOT EXISTS idx_attacks_pair_created
  ON attacks (attacker_id, defender_id, created_at DESC);
```

---

*All systems aligned to agreed design.*
