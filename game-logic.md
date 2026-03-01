# Domiron — Game Logic

> **Source of truth**: This document describes ONLY what is currently implemented in `/lib/game/` and `/config/balance.config.ts`.
> Unimplemented features do not appear here.
> Admin can override numeric values via Admin Panel → `balance_overrides` table.

---

## Last Updated / Verified

| Field | Value |
|-------|-------|
| Date | 2026-03-01 |
| Commit | e697427 (last git commit); doc reflects all session changes |
| TypeScript | `npx tsc --noEmit` → 0 errors |
| Tests | `npx vitest run` → 173 tests, 173 passing |
| Auditor | Full codebase scan — values, formulas, mutation/refresh patterns, battle report fields all verified |

---

## Implemented Systems Checklist

| System | Status | Key Files |
|--------|--------|-----------|
| Tick (turns + population + production + bank + rankings + realtime) | ✅ | `lib/game/tick.ts`, `app/api/tick/route.ts` |
| Race bonuses | ✅ | `config/balance.config.ts`, `lib/game/power.ts`, `lib/game/combat.ts` |
| Combat (PP + ECP + clan + loot + cooldowns + anti-farm) | ✅ | `lib/game/combat.ts`, `app/api/attack/route.ts` |
| Weapons shop (buy / sell) | ✅ | `app/api/weapons/route.ts` |
| Training (basic, advanced, untrain) | ✅ | `app/api/training/basic/route.ts`, `advanced/route.ts`, `untrain/route.ts` |
| Resource production (slave output, dev levels) | ✅ | `lib/game/tick.ts` |
| Bank (deposit, upgrade, interest) | ✅ | `app/api/bank/deposit/route.ts`, `upgrade/route.ts` |
| Power rankings (city + global + tribe) | ✅ | `lib/game/power.ts`, `app/api/tick/route.ts` |
| Hero effects (attack/defense/slave boosts, shields) | ✅ | `lib/game/hero-effects.ts`, `app/api/hero/` |
| Tribe (create, join, spells, tax, mana) | ✅ | `app/api/tribe/` sub-routes |
| New player protection (24 h) | ✅ | `lib/game/combat.ts` |
| Kill cooldown (6 h) | ✅ | `lib/game/combat.ts` |
| Anti-farm loot decay | ✅ | `lib/game/combat.ts` |
| Spy system | ✅ | `app/api/spy/route.ts`, `app/(game)/spy/` |
| Real-time events | ✅ | `lib/game/realtime.ts` |
| Vacation mode | ⚠️ Tick respects `is_vacation` flag; toggle route not yet built | `lib/game/tick.ts` |
| City production multipliers | ⚠️ Structure exists; values `[TUNE: unassigned]`, default to ×1 | `config/balance.config.ts` |
| City promotion thresholds | ⚠️ Structure exists; values `[TUNE: unassigned]`, route not built | `config/balance.config.ts` |
| Bank interest rates | ⚠️ Function exists; rates `[TUNE: unassigned]`, interest = 0 until set | `lib/game/tick.ts` |
| Hero XP / leveling | ❌ Not implemented | — |
| City promotion route | ❌ Not implemented | — |
| Season reset route | ❌ Not implemented | — |
| Crystals / VIP purchase flow | ❌ Config defined; payment route not implemented | — |

---

## How to Update This Document

**Rule 1 — Code is the only truth.**
Before writing any value here, verify it in source:
- Numbers → `config/balance.config.ts`
- Formulas → `lib/game/` functions
- Route behavior → `app/api/` handlers

**Rule 2 — Sync on every code change.**
When you change a `BALANCE.*` value, formula, or route behavior:
1. Update the relevant section below.
2. Update the "Last Updated / Verified" table (date + commit).
3. Run `npx tsc --noEmit` + `npx vitest run` — both must pass.

**Rule 3 — Delete before guessing.**
If something is not yet in the code, delete it from this doc or mark it ⚠️ with a note.
Never write aspirational or speculative content.

**Rule 4 — `[TUNE: unassigned]` handling.**
If a BALANCE value is `undefined as unknown as number`, write it as "not yet assigned — defaults to X" rather than a specific number.

**Rule 5 — Per system, always include:**
- Files involved
- Key functions
- BALANCE keys used
- API routes

---

## 0. State Update Flow (No Page Refresh Required)

All mutations follow the **refetch-after-mutation** pattern. No page refresh is ever required.

### Update Flow Per Action

```
User Action
  ↓
Client calls API route (POST/PUT)
  ↓
API route validates, applies DB changes, recalculates power
  ↓
API response returns updated snapshot (army, resources, turns, etc.)
  ↓
Client updates local state immediately from response data
  ↓
Client calls refresh() to sync full PlayerContext (/api/player)
  ↓
Sidebar + ResourceBar update live (they read from PlayerContext)
```

### Per-Page State Sync Pattern (✅ fully audited)

| Page     | Immediate local state update                                          | Full context refresh       | Status |
|----------|-----------------------------------------------------------------------|----------------------------|--------|
| Attack   | `turns` + `resources` + full `AttackResult` (incl. `blockers`) from response | `refresh()` | ✅ |
| Bank     | `bank` + `resources` from response                                    | `refresh()` | ✅ |
| Develop  | `devState` level + `resources` from response                          | `refresh()` | ✅ |
| Hero     | `mana` + `spell_points` from response; `localEffects` on shield activation | `refresh()` | ✅ |
| Mine     | no local state (informational route — no DB write)                    | `refresh()` | ✅ |
| Shop     | `weapons` + `resources` from response                                 | `refresh()` | ✅ |
| Spy      | `turns` + `spies` from response                                       | `refresh()` | ✅ |
| Training | `army` + `resources` from response                                    | `refresh()` | ✅ |
| Tribe    | `localMembers` filtered on kick; create/join: `router.refresh()`     | `refresh()` on kick        | ✅ |

### Notes on Tribe page
- **Kick**: removes member from `localMembers` state immediately, then calls `refresh()`.
- **Create / Join**: calls `router.refresh()` from `next/navigation` — re-fetches server components without a full page reload (no flicker).

### Rules
- `window.location.reload()` is **banned** — 0 occurrences (verified by grep).
- Never rely on SSR props after first mutation — always use live state.
- All API mutations re-read relevant rows from DB before validating (race-condition protection).
- All API mutations return a complete snapshot (not a delta) in the response body.
- `refresh()` calls `GET /api/player` to sync the full player bundle.
- `router.refresh()` (`next/navigation`) re-fetches server components; used only when SSR-prop state (non-PlayerContext) must be updated.
- Supabase Realtime handles cross-player events (attacks, tick, tribe spells).
- Tests: `lib/game/mutation-patterns.test.ts` — 20 tests covering immediate-update contract, race conditions, and blocker derivation.

---

## 1. Tick System

**Files:** `lib/game/tick.ts`, `app/api/tick/route.ts`
**Key functions:** `calcTurnsToAdd`, `calcPopulationGrowth`, `calcSlaveProduction`, `calcHeroManaGain`, `calcTribeManaGain`, `calcBankInterest`
**BALANCE keys:** `tick.*`, `training.populationPerTick`, `production.*`, `tribe.manaPerMemberPerTick`, `season.vacationTurnsMultiplier`
**Cron schedule:** Every 30 minutes (Vercel Cron → `GET /api/tick`, verified via `x-cron-secret` header)

### What happens per tick (in order):
1. Add turns to every player (cap: **200**). Vacation: +1/tick instead of +3.
2. Add free population based on `population_level`.
3. Process slave production (per resource type, all resources simultaneously).
4. Add hero mana based on hero level and VIP status.
5. Add tribe mana to each tribe.
6. Apply bank interest (daily — fires only on ticks where the date changes).
7. Recalculate all power scores + rankings.
8. Fire Supabase Realtime broadcast to all connected players.

### Turns per tick
```
Normal:   min(current_turns + 3, 200)
Vacation: min(current_turns + ceil(3 × 0.33), 200)  → +1/tick
```

---

## 2. Races & Bonuses

**Files:** `config/balance.config.ts`, `lib/game/power.ts`, `lib/game/combat.ts`, `app/api/spy/route.ts`
**BALANCE keys:** `raceBonuses.*`

Applied as multipliers at calculation time — never stored in DB.

| Race  | Bonus 1                          | Bonus 2                   |
|-------|----------------------------------|---------------------------|
| Orc   | +10% attack power                | +3% defense power         |
| Human | +15% gold production per tick    | +3% attack power          |
| Elf   | +20% spy power                   | +20% scout power          |
| Dwarf | +15% defense power               | +3% gold production       |

Race bonuses apply to:
- Combat ECP (attack/defense)
- Stored `power_attack`, `power_defense`, `power_spy`, `power_scout` (rankings)
- Spy/scout power during spy missions

---

## 3. Combat System

**Files:** `lib/game/combat.ts`, `app/api/attack/route.ts`
**Key functions:** `calculatePersonalPower`, `calculateClanBonus`, `calculateECP`, `resolveCombat`, `calculateSoldierLosses`, `calculateLoot`, `isKillCooldownActive`, `isNewPlayerProtected`
**BALANCE keys:** `combat.*`, `antiFarm.*`, `pp.*`, `clan.*`
**API route:** `POST /api/attack`

### 3.1 Personal Power (PP)

PP is computed fresh at combat time. It is NOT the same as the stored `power_attack`/`power_defense` columns (those are for ranking only — see §3a).

```
PP = (SoldierScore          × W_SOLDIERS)
   + (EquipScore            × W_EQUIPMENT)
   + (SkillScore            × W_SKILLS)
   + min(DevScore, DEV_CAP) × W_DEVELOPMENT
   + (SpyScore              × W_SPY)

W_SOLDIERS = W_EQUIPMENT = W_SKILLS = W_DEVELOPMENT = W_SPY = 1.0 [TUNE: placeholder]
DEV_CAP = 10,000 [TUNE]
```

**SoldierScore** (tier-based, exponential between tiers):
```
TierValue[tier] = SOLDIER_V × SOLDIER_K^(tier-1)
SoldierScore    = Σ Count[tier] × TierValue[tier]

SOLDIER_V = 1, SOLDIER_K = 3 [TUNE: placeholder]
  Tier 1 (army.soldiers): value = 1
  Tier 2 (army.cavalry):  value = 3
```

**EquipScore**:
- Attack weapons: additive per unit (`weapons.slingshot × PP[slingshot]` + …)
- Defense gear (wood_shield → gods_armor): binary — full PP value if count > 0, else 0
- Spy gear (shadow_cloak, dark_mask, elven_gear): binary
- Scout gear (scout_boots, scout_cloak, elven_boots): binary

**SkillScore**: `Σ (training_level × SKILL_PP[skill])`
- attack: 100/level | defense: 100/level | spy: 80/level | scout: 80/level

**DevScore**: `Σ (dev_level × DEVELOPMENT_PP[type])` (capped at DEV_CAP before weight)
- gold: 50 | food: 50 | wood: 50 | iron: 50 | population: 75 | fortification: 100

**SpyScore**: `spies × 5 + scouts × 5`

### 3.2 Clan Bonus

```
ClanBonus_raw = TotalClanPP × EfficiencyRate(devLevel)
ClanBonus     = min(ClanBonus_raw, BONUS_CAP_RATE × PlayerPP)

BONUS_CAP_RATE = 0.20 [FIXED]

Efficiency by clan dev level:
  Level 1: 5% | Level 2: 8% | Level 3: 10% | Level 4: 12% | Level 5: 15%

Returns 0 if player has no clan.
```

### 3.3 Effective Combat Power (ECP)

```
ECP = (PP × (1 + heroBonus)) + ClanBonus

heroBonus: pre-clamped TotalAttackBonus or TotalDefenseBonus from active hero effects (0 – 0.50)
HeroBonus multiplies PP ONLY — never ClanBonus
```

### 3.4 Combat Resolution

```
R = AttackerECP / DefenderECP
(If DefenderECP = 0: R treated as WIN_THRESHOLD + 1 → automatic win)

R ≥ WIN_THRESHOLD  (1.30) → win
R < LOSS_THRESHOLD (0.75) → loss
Otherwise                 → partial
```

### 3.5 Soldier Losses

```
AttackerLossRate = clamp(BASE_LOSS / R,     ATTACKER_FLOOR,       MAX_LOSS_RATE)
DefenderLossRate = clamp(BASE_LOSS × R,     DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)

BASE_LOSS             = 0.15 [TUNE: placeholder]
MAX_LOSS_RATE         = 0.30 [FIXED] — neither side ever loses more than 30%
ATTACKER_FLOOR        = 0.03 [TUNE] — attacker always loses at least 3%
DEFENDER_BLEED_FLOOR  = 0.05 [TUNE] — defender bleeds ≥ 5% even from weak attacker

attacker_losses = floor(deployed_soldiers  × AttackerLossRate)
defender_losses = floor(defender_soldiers  × DefenderLossRate)
```

Override rules (applied in this priority order):
- `killCooldownActive = true` → `defender_losses = 0`
- `defenderIsProtected = true` → `defender_losses = 0`
- `soldierShieldActive = true` → `defender_losses = 0`
- `attackerIsProtected = true` → `attacker_losses = 0`

**Attacker always pays turns + food regardless of any protection or cooldown flag.**
Losses apply to deployed soldiers only (not total army).

### 3.6 Slave Conversion

```
slaves_created = floor(defender_losses × CAPTURE_RATE)
CAPTURE_RATE = 0.35 [TUNE]

Zero when defender_losses = 0 (cooldown, protection, or Soldier Shield).
```

### 3.7 Loot

```
BaseLoot[r]  = unbanked[r] × BASE_LOOT_RATE
FinalLoot[r] = BaseLoot[r] × OutcomeMult × DecayFactor

BASE_LOOT_RATE = 0.20 [FIXED] — 20% of each unbanked resource

Outcome multipliers:
  win:     ×1.0
  partial: ×0.5
  loss:    ×0.0 (no loot on loss)
```

Anti-farm decay (per attack on same target within `DECAY_WINDOW_HOURS = 12`):

| Attack # in window | Loot multiplier |
|--------------------|-----------------|
| 1st  | ×1.00 |
| 2nd  | ×0.70 |
| 3rd  | ×0.40 |
| 4th  | ×0.20 |
| 5th+ | ×0.10 |

Loot overridden to **0** if `defenderIsProtected` or `resourceShieldActive`.
Banked gold is always theft-proof (100% — `bank.theftProtection: 1.00`).

### 3.8 Attack Cost

```
food_cost = turns_used × foodCostPerTurn (= 1 [TUNE])
Turn range: 1–10 per attack (player chooses at attack screen)
```

### 3.9 Kill Cooldown

```
KILL_COOLDOWN_HOURS = 6 [FIXED]

Active after any attack where defender_losses > 0 against the same target.
When active: defender_losses = 0, slavesCreated = 0.
Loot still resolves normally based on outcome.
```

### 3.10 New Player Protection

```
PROTECTION_HOURS = 24 [FIXED]

Window: 24 hours after account creation.
Attacks are NEVER blocked at the gate.
When defenderIsProtected: defender_losses = 0, loot = 0.
When attackerIsProtected: attacker_losses = 0.
Attacker always pays turns + food.
```

### 3.11 Battle Report API Response

`POST /api/attack` returns:

```typescript
{
  result: {
    outcome:         'win' | 'partial' | 'loss'
    ratio:           number        // attackerECP / defenderECP
    attacker_ecp:    number
    defender_ecp:    number
    attacker_losses: number        // soldiers lost
    defender_losses: number        // soldiers lost
    slaves_created:  number        // floor(defender_losses × CAPTURE_RATE)
    gold_stolen:     number
    iron_stolen:     number
    wood_stolen:     number
    food_stolen:     number
    turns_used:      number        // turns the player chose to spend
    food_cost:       number        // turns_used × foodCostPerTurn
    blockers:        AttackBlocker[] // why gains/losses may be zeroed (see below)
  },
  turns:     number    // attacker's remaining turns (snapshot, not delta)
  resources: { gold, iron, wood, food }  // attacker's new resource totals
}
```

**Blocker types** (`AttackBlocker`):

| Value | Condition | Effect |
|-------|-----------|--------|
| `resource_shield` | `defHero.resourceShieldActive` | loot = 0 |
| `soldier_shield` | `defHero.soldierShieldActive` | defender losses = 0, slaves = 0 |
| `defender_protected` | defender within 24h of creation | loot = 0, defender losses = 0 |
| `kill_cooldown` | recent kill on this target (6h window) | defender losses = 0, slaves = 0 |
| `attacker_protected` | attacker within 24h of creation | attacker losses = 0 |
| `loot_decay` | 2nd+ attack on same target in decay window | loot reduced by anti-farm multiplier |

Blockers are evaluated in the order listed. Multiple blockers may be present. The UI (`BattleReport` component) renders a "Why" section listing each blocker with a human-readable explanation.

---

## 3a. Power Types — Ranking vs Combat

**Files:** `lib/game/power.ts` (stored ranking power), `lib/game/combat.ts` (combat PP)

| Power Type | Purpose | Formula |
|------------|---------|---------|
| Personal Power (PP) | Combat ECP input | Weighted component sum — soldiers, equipment, skills, dev, spy (§3.1) |
| ECP | Battle outcome number | `(PP × (1 + heroBonus)) + ClanBonus` |
| `power_attack` (stored) | City/global ranking | `floor((soldiers + cavalry×2 + weaponPower) × trainMult × raceMult)` |
| `power_defense` (stored) | City/global ranking | `floor(units × defWeaponMult × trainMult × fortMult × raceMult)` |
| `power_spy` (stored) | City/global ranking | `floor(spies × trainMult × spyWeaponMult × raceMult)` |
| `power_scout` (stored) | City/global ranking | `floor(scouts × trainMult × scoutWeaponMult × raceMult)` |
| `power_total` (stored) | Leaderboard | `power_attack + power_defense + power_spy + power_scout` (simple sum, no weights) |

**Key rule:** PP (combat.ts formula) ≠ stored `power_attack` (power.ts formula). Different purposes, different calculations.
PP feeds ECP for combat outcomes. Stored power columns feed leaderboard rankings.

**Attack result UI must always display:**
- Your Attack ECP number
- Defender Defense ECP number
- Ratio comparison
- Explicit outcome text (e.g. "Your attack power (X) was lower than defender defense (Y).")

---

## 4. Weapons Catalog

**Files:** `config/balance.config.ts`, `app/api/weapons/route.ts`
**BALANCE keys:** `weapons.*`, `pp.EQUIPMENT_PP`
**API routes:** `POST /api/weapons/buy`, `POST /api/weapons/sell`

### Attack Weapons (additive per unit — iron cost)
| Key | Power (PP per unit) | Max | Cost (iron) |
|-----|---------------------|-----|-------------|
| slingshot | 2 | 25 | 200 |
| boomerang | 5 | 12 | 400 |
| pirate_knife | 12 | 6 | 800 |
| axe | 28 | 3 | 1,600 |
| master_knife | 64 | 1 | 3,200 |
| knight_axe | 148 | 1 | 6,400 |
| iron_ball | 340 | 1 | 12,800 |

### Defense Weapons (binary — multiplier on `power_defense`)
| Key | Multiplier | Cost (gold) |
|-----|-----------|-------------|
| wood_shield | ×1.10 | 1,500 |
| iron_shield | ×1.25 | 8,000 |
| leather_armor | ×1.40 | 25,000 |
| chain_armor | ×1.55 | 80,000 |
| plate_armor | ×1.70 | 250,000 |
| mithril_armor | ×1.90 | 700,000 |
| gods_armor | ×2.20 | 1,000,000 gold + 500,000 iron + 300,000 wood |

### Spy Weapons (binary — multiplier on `power_spy` and spy mission power)
| Key | Multiplier | Cost (gold) |
|-----|-----------|-------------|
| shadow_cloak | ×1.15 | 5,000 |
| dark_mask | ×1.30 | 20,000 |
| elven_gear | ×1.50 | 80,000 |

### Scout Weapons (binary — multiplier on `power_scout` and scout defense)
| Key | Multiplier | Cost (gold) |
|-----|-----------|-------------|
| scout_boots | ×1.15 | 5,000 |
| scout_cloak | ×1.30 | 20,000 |
| elven_boots | ×1.50 | 80,000 |

Sell refund: 20% of original cost (`sellRefundPercent: 0.20`).

---

## 5. Training Costs

**Files:** `config/balance.config.ts`, `app/api/training/basic/route.ts`
**BALANCE keys:** `training.unitCost`, `training.baseCapacity`, `training.capacityPerDevelopmentLevel`
**API route:** `POST /api/training/basic`

### Basic Training
| Unit | Gold | Capacity Used | Notes |
|------|------|--------------|-------|
| Soldier | 60 | 1 | Consumes 1 `free_population` |
| Slave | 10 | 0 | Consumes 1 `free_population` |
| Spy | 80 | 1 | Consumes 1 `free_population` |
| Scout | 80 | 1 | Consumes 1 `free_population` |
| Cavalry | 200 | 2 | Requires `soldiers ≥ amount × 5`; no population consumed |
| Farmer | 20 | 0 | Consumes 1 `free_population` |

### Capacity (max units that consume capacity)
```
max_capacity = baseCapacity(1,000) + fortification_level × capacityPerDevelopmentLevel(200)
```
- Farmers, slaves, and cavalry do NOT count toward capacity.
- When at capacity, soldier/spy/scout training is blocked.

### Advanced Training
**Key function:** `advancedMultiplierPerLevel = 0.08`
**Cost per level:** 300 gold + 300 food
**Effect:** `trainMult = 1 + (level × 0.08)` applied to attack, defense, spy, or scout power.

---

## 5a. Training Flow (Population & Slave Rules)

**Files:** `app/api/training/basic/route.ts`, `app/api/training/untrain/route.ts`
**API routes:** `POST /api/training/basic`, `POST /api/training/untrain`

### Population ≠ Slaves

| Pool | Source | Purpose |
|------|--------|---------|
| `free_population` | Gained per tick via `population_level` | Converts to trained units (consumed on train) |
| `slaves` | Captured from combat OR trained from population with gold | Produce resources per tick |

**Critical rules (enforced in API):**
1. Training any unit (except cavalry) consumes 1 `free_population`.
2. Untraining any unit adds to `slaves` — NEVER to `free_population`.
3. Free population and slaves are completely separate pools.
4. Slaves produce all resource types simultaneously per tick.
5. Slaves cannot be reassigned to combat roles for free — re-training costs gold.

### Training Validations (per unit)

| Unit | Requires | Consumes |
|------|----------|----------|
| Soldier | Enough gold, enough capacity, `free_population ≥ amount` | gold + free_population |
| Slave | Enough gold, `free_population ≥ amount` | gold + free_population |
| Spy | Enough gold, enough capacity, `free_population ≥ amount` | gold + free_population |
| Scout | Enough gold, enough capacity, `free_population ≥ amount` | gold + free_population |
| Cavalry | Enough gold, `soldiers ≥ amount × soldierRatio(5)` | gold only (no population) |
| Farmer | Enough gold, `free_population ≥ amount` | gold + free_population |

### Untrain API (`POST /api/training/untrain`)

```typescript
Body:     { unit: 'soldier' | 'spy' | 'scout' | 'farmer', amount: number }
Response: { data: { army, untrainedCount, slavesGained } }
```

- Deducts `amount` from the unit column.
- Adds `amount` to `army.slaves`.
- Does NOT restore `free_population`.
- Cavalry cannot be untrained.
- Power recalculated immediately.

---

## 6. Resource Production

**Files:** `lib/game/tick.ts`, `config/balance.config.ts`
**Key function:** `calcSlaveProduction(slavesAllocated, devLevel, city, vipUntil, raceGoldBonus, slaveBonus)`
**BALANCE keys:** `production.baseMin`, `production.baseMax`, `cities.CITY_PRODUCTION_MULT`, `vip.productionMultiplier`

### Per Tick Formula
```
devOffset = (devLevel - 1) × 0.5
rateMin   = (baseMin + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)
rateMax   = (baseMax + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)

production per resource = random value in [slaves × rateMin, slaves × rateMax]

baseMin = 1.0 [TUNE]
baseMax = 3.0 [TUNE]
cityMult = CITY_PRODUCTION_MULT[city] — ⚠️ not yet assigned, defaults to ×1
vipMult  = 1.10 if VIP active, else 1.0
```

### Development Levels (production rate range per slave)
| Level | Rate range | Dev Upgrade Cost |
|-------|-----------|-----------------|
| 1 | 1.0 – 3.0 | — |
| 2 | 1.5 – 3.5 | 3 gold + 3 [resource] |
| 3 | 2.0 – 4.0 | 9 gold + 9 [resource] |
| 5 | 3.0 – 5.0 | 50 gold + 50 [resource] |
| 10 | 5.5 – 7.5 | 500 gold + 500 [resource] |

### Population per Tick

**Key function:** `calcPopulationGrowth(populationLevel, vipUntil)`

```
growth = populationPerTick[level] × vipMult

Level 1: +1  | Level 2: +2  | Level 3: +3  | Level 4: +4  | Level 5: +5
Level 6: +8  | Level 7: +10 | Level 8: +14 | Level 9: +18 | Level 10: +23
```

---

## 7. Bank System

**Files:** `app/api/bank/deposit/route.ts`, `app/api/bank/upgrade/route.ts`, `lib/game/tick.ts`
**Key function:** `calcBankInterest(balance, interestLevel, vipUntil)` — ⚠️ rates unassigned
**BALANCE keys:** `bank.*`
**API routes:** `POST /api/bank/deposit`, `POST /api/bank/upgrade`

```
deposit_limit         = 100% of gold on hand (maxDepositPercent: 1.0)
deposits_per_day      = 5 (resets at midnight)
max_lifetime_deposits = 5 (total across account lifetime)
upgrade_cost          = upgradeBaseCost(2,000) × (current_level + 1) gold
theft_protection      = 100% — banked gold cannot be stolen
```

### Interest Rate

⚠️ **Not yet active.** Both `BANK_INTEREST_RATE_BASE` and `BANK_INTEREST_RATE_PER_LEVEL` are `[TUNE: unassigned]`. The function exists in `tick.ts` but produces 0 until values are set in `balance.config.ts`.

```
interest = floor(balance × BANK_INTEREST_RATE_BASE)
         + floor(balance × interestLevel × BANK_INTEREST_RATE_PER_LEVEL)
         + floor(balance × vipRate)

Applied: once per day (on the first tick when the calendar date changes)
```

---

## 8. Ranking Formula

**Files:** `lib/game/power.ts`, `app/api/tick/route.ts`
**Key function:** `recalculatePower(playerId, supabase)` — writes to `players` table

```
power_total = power_attack + power_defense + power_spy + power_scout
```

Simple additive sum — no weights. Updated every tick and immediately after any army, weapons, training, or development change.

Used for:
- City ranking (`rank_city`)
- Global ranking (`rank_global`)
- Tribe ranking (average of all members' `power_total`)

---

## 9. Hero System

**Files:** `lib/game/hero-effects.ts`, `app/api/hero/`
**Key functions:** `calcActiveHeroEffects`, `getActiveHeroEffects`, `clampBonus`
**BALANCE keys:** `hero.*`
**DB table:** `player_hero_effects`

Hero effects NEVER modify Personal Power (PP) or ranking power. They only affect:
- (a) ECP — via temporary attack/defense bonus multipliers on PP
- (b) Slave production — via temporary output boost
- (c) Combat outcomes — via Resource Shield and Soldier Shield

### Hero Effect Types

| Type | Category | Rate | Stacks |
|------|----------|------|--------|
| `SLAVE_OUTPUT_10` | Slave production | +10% | Yes (additive) |
| `SLAVE_OUTPUT_20` | Slave production | +20% | Yes (additive) |
| `SLAVE_OUTPUT_30` | Slave production | +30% | Yes (additive) |
| `ATTACK_POWER_10` | ECP multiplier (attacker PP only) | +10% | Yes (additive) |
| `DEFENSE_POWER_10` | ECP multiplier (defender PP only) | +10% | Yes (additive) |
| `SOLDIER_SHIELD` | Combat protection | — | No (boolean) |
| `RESOURCE_SHIELD` | Loot protection | — | No (boolean) |

**Stack cap:** All additive bonus categories are clamped at `MAX_STACK_RATE = 0.50` before use.

### Active Shields

| Shield | Mana Cost | Active Duration | Cooldown |
|--------|-----------|----------------|----------|
| Soldier Shield | 10 mana | 23 hours | 1 hour |
| Resource Shield | 10 mana | 23 hours | 1 hour |

**Soldier Shield:** When active: `defender_losses = 0`, `slavesCreated = 0`. Loot still applies unless Resource Shield also active.
**Resource Shield:** When active: `loot = 0` for all resources. Soldier losses still resolve normally.

Cooldown = vulnerability window before next shield of the same type can start.
Timer visible to owner only (Hero page). Other players see active/inactive status only — never expiration time.

### Personal Mana per Tick

**Key function:** `calcHeroManaGain(heroLevel, vipUntil)`

```
mana_per_tick = 1 (base)
              + 1 if heroLevel ≥ 10
              + 1 if heroLevel ≥ 50
              + 1 if VIP active
```

### Hero Effects in Combat (Order of Operations)

```
1. calculatePersonalPower(attacker), calculatePersonalPower(defender)
2. getActiveHeroEffects(attacker) → attackBonus (clamped 0–0.50)
   getActiveHeroEffects(defender) → defenseBonus, soldierShieldActive, resourceShieldActive
3. AttackerECP = (AttackerPP × (1 + attackBonus)) + AttackerClanBonus
   DefenderECP = (DefenderPP × (1 + defenseBonus)) + DefenderClanBonus
4. Resolve ratio → outcome → losses → slaves → loot
5. If soldierShieldActive  → defenderLosses = 0, slavesCreated = 0
6. If resourceShieldActive → loot = 0
```

---

## 10. Tribe System

**Files:** `app/api/tribe/` sub-routes, `lib/game/tick.ts`, `lib/game/combat.ts`
**BALANCE keys:** `tribe.*`, `clan.*`
**DB tables:** `tribes`, `tribe_members`, `tribe_spells`

### Tribe in Combat (Clan Bonus)

Clan bonus is applied to ECP during battle — see §3.2 for the formula.

```
Max members:                    20  [FIXED]
Post-migration join cooldown:   48 hours  [FIXED]
Normal leave cooldown:          10 minutes  [FIXED]
```

### Tribe Mana per Tick

**Key function:** `calcTribeManaGain(memberCount)`

```
tribe_mana_per_tick = max(1, floor(memberCount × manaPerMemberPerTick))
manaPerMemberPerTick = 1 [TUNE]

Example: 10 members → 10 mana/tick
```

### Tribe Spells

| Key | Mana Cost | Duration | Effect |
|-----|-----------|----------|--------|
| combat_boost | 20 | 6 hours | +20% attack for all members |
| tribe_shield | 30 | 12 hours | +40% defense for all members |
| production_blessing | 25 | 8 hours | +50% production for all members |
| mass_spy | 15 | Instant (0 h) | Reveals all enemy armies in city |
| war_cry | 40 | 4 hours | +50% attack + removes defender tribe bonus |

Tribe leader activates spells. Cost deducted from `tribes.mana`.

### Tax Limits by City

| City 1 | City 2 | City 3 | City 4 | City 5 |
|--------|--------|--------|--------|--------|
| 1,000 | 2,500 | 5,000 | 10,000 | 20,000 |

Leader and deputy are always tax-exempt.

---

## 11. City System

**Files:** `config/balance.config.ts`
**BALANCE keys:** `cities.*`

5 cities total. Players start in city 1. Promotion is sequential (1→2→3→4→5 only).

### City Names

| City 1 | City 2 | City 3 | City 4 | City 5 |
|--------|--------|--------|--------|--------|
| Izrahland | Masterina | Rivercastlor | Grandoria | Nerokvor |

### City Production Multipliers

⚠️ `CITY_PRODUCTION_MULT[1–5]` are `[TUNE: unassigned]`. All cities currently produce at ×1 (`?? 1` fallback in `calcSlaveProduction`). Higher city production is a core promotion incentive but values are not yet set.

### Promotion Requirements

⚠️ Promotion threshold parameters (`S_base`, `P_base`, `R_base`, `s_growth`, `p_growth`, `r_growth`) are all `[TUNE: unassigned]`. The city promotion route is not yet built.

### City Rules
- Player must leave tribe before promoting.
- After migration: 48-hour clan join restriction.
- Resources, soldiers, weapons, hero all transfer on migration.

---

## 12. Season System

**Files:** `config/balance.config.ts`
**BALANCE keys:** `season.*`

```
Season duration:         90 days  [FIXED]
Hall of fame:            Top 20 players + Top 5 tribes saved at season end
At season end (reset):   resources, army, weapons, training, development, hero, bank, tribes
Kept across seasons:     player accounts, usernames, hall_of_fame entries
Vacation turn modifier:  vacationTurnsMultiplier = 0.33  → +1 turn/tick instead of +3
```

⚠️ The season reset logic and hall-of-fame save route are not yet implemented.

---

## 13. New Player Protection

**Files:** `lib/game/combat.ts`
**Key function:** `isNewPlayerProtected(playerCreatedAt, now)`
**BALANCE key:** `combat.PROTECTION_HOURS = 24 [FIXED]`

```
Protection window: 24 hours after account creation

Attacks on protected players are NEVER blocked at the gate.
  defenderIsProtected = true → defender_losses = 0, loot = 0
  attackerIsProtected = true → attacker_losses = 0
Attacker always pays turns + food regardless.
```

---

## 14. Real-Time Events (Supabase Realtime)

**Files:** `lib/game/realtime.ts`
**Realtime enabled on tables:** `attacks`, `resources`, `tribe_spells`, `tribe_members`, `players`

| DB Change | Table | Event fired to |
|-----------|-------|---------------|
| New attack | `attacks` INSERT | defender (if online) |
| Resources updated | `resources` UPDATE | owner |
| Tribe spell activated | `tribe_spells` INSERT | all tribe members |
| Tribe kick | `tribe_members` DELETE | kicked player |
| Rank change (significant) | `players` UPDATE (rank) | player |
| Tick completed | — (broadcast) | all connected players |

### Toast mapping
```typescript
const TOAST_MAP = {
  'attack_incoming':    { type: 'attack',  duration: 8000, navigateTo: '/history' },
  'battle_result_win':  { type: 'victory', duration: 5000 },
  'battle_result_loss': { type: 'defeat',  duration: 10000 },
  'tick_completed':     { type: 'info',    duration: 4000 },
  'tribe_spell_cast':   { type: 'magic',   duration: 5000 },
  'tribe_kicked':       { type: 'error',   duration: 8000 },
  'rank_improved':      { type: 'success', duration: 5000 },
  'spy_caught':         { type: 'warning', duration: 6000 },
  'enemy_spy_caught':   { type: 'success', duration: 5000 },
}
```

---

## 16. Spy System

**Files:** `app/api/spy/route.ts`, `app/(game)/spy/page.tsx`, `app/(game)/spy/SpyClient.tsx`
**BALANCE keys:** `spy.*`, `training.advancedMultiplierPerLevel`, `raceBonuses.elf`
**API routes:** `GET /api/spy`, `POST /api/spy`
**DB table:** `spy_history`

### Overview

Spy missions are non-combat intelligence operations. They reveal enemy data without causing damage.

| Feature | Attack | Spy |
|---------|--------|-----|
| Causes soldier losses | Yes | No |
| Steals resources | Yes | No |
| Reveals enemy data | No | Yes (on success) |
| Turn cost | 1–10 turns | `spy.turnCost` (= 1) |
| Population consumed | No | No |

### Formula

```
Spy Power     = spies × (1 + spy_level × advancedMultiplierPerLevel)
              × spyWeaponMultiplier × raceMult

Scout Defense = scouts × (1 + scout_level × advancedMultiplierPerLevel)
              × scoutWeaponMultiplier × raceMult
```

**Spy weapon multipliers (stacking):**
| Weapon | Multiplier |
|--------|-----------|
| shadow_cloak | ×1.15 |
| dark_mask | ×1.30 |
| elven_gear | ×1.50 |

**Scout weapon multipliers (stacking):**
| Weapon | Multiplier |
|--------|-----------|
| scout_boots | ×1.15 |
| scout_cloak | ×1.30 |
| elven_boots | ×1.50 |

**Race bonus:** Elf gets +20% spy power and +20% scout defense.

### Resolution

```
if (spyPower > scoutDefense):
    success = true
    spies_caught = 0
    data_revealed = full intel snapshot

else:
    success = false
    ratio = min(scoutDefense / spyPower, 1.0)
    spies_caught = floor(spies_sent × catchRate × ratio)
    spies_caught = min(spies_caught, floor(spies_sent × MAX_CATCH_RATE))
    data_revealed = null

catchRate    = 0.30 [TUNE]
MAX_CATCH_RATE = 0.80 [FIXED] — never lose more than 80% of sent spies
```

### API

#### `GET /api/spy`
Returns list of spyable targets in same city with visible scout count.

#### `POST /api/spy`
```typescript
Body:     { target_id: string, spies_sent: number }
Response: {
  result: {
    success:       boolean
    spy_power:     number
    scout_defense: number
    spies_sent:    number
    spies_caught:  number
    revealed?:     SpyRevealedData  // only on success
  },
  turns: number  // updated turn count
}
```

### Revealed Data Structure (`SpyRevealedData`)

On success:
```typescript
{
  army_name, soldiers, spies, scouts, cavalry, slaves, farmers,
  gold, iron, wood, food,
  power_attack, power_defense, power_spy, power_scout, power_total,
  soldier_shield:  boolean,  // whether Soldier Shield is active
  resource_shield: boolean,  // whether Resource Shield is active
}
```

Shield expiration timers are NOT revealed. Active/inactive status only.

### Validation Rules

- Player must have ≥ `spy.minSpies` (= 1) spies.
- Player must have ≥ `spy.turnCost` (= 1) turns.
- Cannot spy on yourself.
- Cannot spy on players in a different city.
- Target's vacation status does NOT block spy missions (unlike attacks).

### History

All spy missions recorded in `spy_history` table. Viewable in `/history?tab=spy`.
