# Domiron v5 — Hero Effect System Implementation

**Source files:**
- `lib/game/hero-effects.ts` — canonical implementation (table: `player_hero_effects`)
- `lib/game/boosts.ts` — legacy VIP path (table: `player_boosts`), same logic
- `config/balance.config.ts` — all constants under `BALANCE.hero.*`
- `lib/game/combat.ts` — `calculateECP()`, `resolveCombat()`

---

## 1. Constants (`BALANCE.hero`)

```typescript
BALANCE.hero = {
  MAX_STACK_RATE: 0.50,          // [FIXED] Hard cap on any single bonus category

  EFFECT_RATES: {
    SLAVE_OUTPUT_10:  0.10,      // [FIXED]
    SLAVE_OUTPUT_20:  0.20,      // [FIXED]
    SLAVE_OUTPUT_30:  0.30,      // [FIXED]
    ATTACK_POWER_10:  0.10,      // [FIXED]
    DEFENSE_POWER_10: 0.10,      // [FIXED]
  },

  SHIELD_ACTIVE_HOURS:   23,     // [FIXED]
  SHIELD_COOLDOWN_HOURS:  1,     // [FIXED]
}
```

---

## 2. Effect Types

| Type | Category | Value | Stacks? |
|---|---|---|---|
| `SLAVE_OUTPUT_10` | Production | +10% per tick | Yes |
| `SLAVE_OUTPUT_20` | Production | +20% per tick | Yes |
| `SLAVE_OUTPUT_30` | Production | +30% per tick | Yes |
| `ATTACK_POWER_10` | Combat ECP | +10% attacker PP | Yes |
| `DEFENSE_POWER_10` | Combat ECP | +10% defender PP | Yes |
| `RESOURCE_SHIELD` | Shield | Loot = 0 | N/A |
| `SOLDIER_SHIELD` | Shield | DefenderLosses = 0 | N/A |

---

## 3. Stacking Formula

Effects within the same category accumulate additively, then are clamped:

```
TotalBonus[category] = min( Σ EFFECT_RATES[e_i], MAX_STACK_RATE )
```

**Clamping is mandatory and server-side.** Call `clampBonus()` before passing any accumulated
total into `calculateECP()` or slave production.

```typescript
// lib/game/hero-effects.ts — clampBonus
export function clampBonus(total: number, max = BALANCE.hero.MAX_STACK_RATE): number {
  return Math.min(total, max)
}
```

Categories are **fully independent**: a slave bonus never bleeds into the attack bonus.

### Stack examples

| Active effects | Raw total | Clamped total |
|---|---|---|
| SLAVE_OUTPUT_10 + SLAVE_OUTPUT_20 | 0.30 | 0.30 |
| SLAVE_OUTPUT_30 + SLAVE_OUTPUT_30 | 0.60 | **0.50** |
| 6× ATTACK_POWER_10 | 0.60 | **0.50** |
| SLAVE_OUTPUT_30 + ATTACK_POWER_10 | each 0.30 / 0.10 | 0.30 / 0.10 (independent) |

---

## 4. ECP Formula

### Why hero does NOT multiply ClanBonus

The clan bonus is a social mechanic earned by group play. The hero effect is a monetization lever.
Allowing a hero effect to multiply the clan bonus would let paying players compound a free social
advantage — creating an unfair interaction between the two systems.

**Correct formula:**

```
ECP = (PlayerPP × (1 + heroBonus)) + ClanBonus
```

**Forbidden alternative:**

```
ECP = (PlayerPP + ClanBonus) × (1 + heroBonus)   ← NEVER DO THIS
```

**Implementation (`lib/game/combat.ts`):**

```typescript
export function calculateECP(
  playerPP:  number,
  clan:      ClanContext | null,
  heroBonus: number = 0,   // pre-clamped, 0–0.50
): number {
  // Defensive clamp: guard against callers that forgot to clamp before passing in.
  // Callers are still expected to pre-clamp via clampBonus(); this is a server-side
  // safety net only — valid values (0 – 0.50) are never modified by this step.
  heroBonus = clampBonus(heroBonus)

  const clanBonus = calculateClanBonus(playerPP, clan)
  return Math.floor((playerPP * (1 + heroBonus)) + clanBonus)
}
```

`heroBonus` is the pre-clamped `totalAttackBonus` or `totalDefenseBonus` from
`calcActiveHeroEffects()`. Routes that use `getActiveHeroEffects()` must **not** re-clamp these
values before passing them into `resolveCombat()` / `calculateECP()` — they are already clamped
at the hero-effects layer. `calculateECP()` additionally enforces a **defensive clamp** via
`clampBonus()` as a server-side safety layer, ensuring the cap is guaranteed even if a future
caller passes an unclamped value.

---

## 5. Slave Production Formula

```
SlaveOutput = BaseRate × CITY_PRODUCTION_MULT[city] × VipMult × (1 + TotalSlaveBonus)

TotalSlaveBonus = clampBonus(Σ active SLAVE_OUTPUT_* effects)   // 0.0 – 0.50
```

---

## 6. Shield Behavior

### Timing model

```
|-- SHIELD_ACTIVE_HOURS (23h) --|-- SHIELD_COOLDOWN_HOURS (1h) --|
         active                         vulnerability window
  ends_at = starts_at + 23h
  cooldown_ends_at = starts_at + 24h
```

- **Active window** (`now < ends_at`): shield is in effect.
- **Vulnerability window** (`ends_at ≤ now < cooldown_ends_at`): shield is expired, no protection.
- A new shield of the same type can only be activated after `cooldown_ends_at`.

### Resource Shield (`RESOURCE_SHIELD`)

Applied **after** loot calculation, **inside** `resolveCombat()`:

```
if resourceShieldActive → loot = { gold: 0, iron: 0, wood: 0, food: 0 }
```

- Soldier losses still apply normally.
- Slave creation still applies normally.
- Loot decay counting still applies (attack is still counted in the window).

### Soldier Shield (`SOLDIER_SHIELD`)

Applied **after** soldier loss calculation, **inside** `resolveCombat()`:

```
if soldierShieldActive → defenderLosses = 0 → slavesCreated = 0
```

- Attacker losses still apply normally.
- Loot still applies unless `resourceShieldActive` is also true.

### Both shields active simultaneously

```
defenderLosses = 0
slavesCreated  = 0
loot           = { gold: 0, iron: 0, wood: 0, food: 0 }
attackerLosses = (computed normally)
```

### Shields never block at the gate

Shields are flags passed into `resolveCombat()` and applied during resolution.
They do **not** prevent the attack from proceeding. Gate checks (same clan, same city,
insufficient turns/food) are entirely separate and are unaffected by shield state.

---

## 7. Full Combat Resolution Order

```
1.  calculatePersonalPower(attacker) → attackerPP
    calculatePersonalPower(defender) → defenderPP

2.  getActiveHeroEffects(supabase, attackerId) → { totalAttackBonus, ... }
    getActiveHeroEffects(supabase, defenderId) → { totalDefenseBonus, resourceShieldActive, soldierShieldActive, ... }

3.  calculateECP(attackerPP, attackerClan, totalAttackBonus)  → attackerECP
    calculateECP(defenderPP, defenderClan, totalDefenseBonus) → defenderECP

4.  calculateCombatRatio(attackerECP, defenderECP) → ratio

5.  determineCombatOutcome(ratio) → outcome

6.  calculateSoldierLosses(deployedSoldiers, defenderSoldiers, ratio, ...) → { attackerLosses, defenderLosses }

7.  Apply Soldier Shield (AFTER step 6):
      if soldierShieldActive → defenderLosses = 0

8.  convertKilledToSlaves(defenderLosses) → slavesCreated

9.  calculateLoot(defenderUnbanked, outcome, attackCountInWindow, defenderIsProtected) → rawLoot

10. Apply Resource Shield (AFTER step 9):
      if resourceShieldActive → loot = { gold: 0, iron: 0, wood: 0, food: 0 }
      else                    → loot = rawLoot
```

Kill cooldown (`killCooldownActive`) and new player protection (`defenderIsProtected`,
`attackerIsProtected`) are separate flags handled inside `calculateSoldierLosses()` and
`calculateLoot()` — they are not affected by hero shields.

---

## 8. Where Clamping Occurs

| Location | What is clamped | Enforced by |
|---|---|---|
| `calcActiveHeroEffects()` / `calcActiveBoostTotals()` | Each bonus category total → 0.50 | `clampBonus()` (primary clamp) |
| `calculateECP()` | `heroBonus` → 0.50 (defensive, internal) | `clampBonus()` — safety layer |
| `resolveCombat()` | Receives pre-clamped `attackBonus` / `defenseBonus` | Callers that use `getActiveHeroEffects()` should not re-clamp |
| `calculateSoldierLosses()` | Loss rates → `[FLOOR, MAX_LOSS_RATE]` | Internal `clamp()` |

`calculateECP()` applies a **defensive internal clamp** via `clampBonus()` immediately before
`heroBonus` is used in the formula. This is a server-side safety layer only — valid values
(0 – 0.50) pass through unchanged. The canonical place where hero bonuses are clamped is
`calcActiveHeroEffects()` / `calcActiveBoostTotals()`. Callers that obtain bonuses from these
helpers should pass them through unchanged into `resolveCombat()` / `calculateECP()`.

---

## 9. UI Rules

- **Two status circles** on every player info card: one for Resource Shield, one for Soldier Shield.
- Show active/inactive state only.
- **No expiration timer or countdown** is exposed to other players. Only the effect owner
  (viewing their own Hero page) sees remaining time.
- The vulnerability window is invisible to all parties — it is purely a server-side timing
  constraint on shield re-activation.

---

## 10. DB Data Model

### `player_hero_effects` (canonical)

```sql
id               UUID        PRIMARY KEY DEFAULT gen_random_uuid()
player_id        UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE
type             TEXT        NOT NULL   -- one of the 7 HeroEffectType values
starts_at        TIMESTAMPTZ NOT NULL
ends_at          TIMESTAMPTZ NOT NULL
cooldown_ends_at TIMESTAMPTZ            -- NULL for non-shield types
metadata         JSONB                  -- imageKey, priceId, nameKey, etc.
```

Active query:

```sql
SELECT * FROM player_hero_effects
WHERE player_id = $1 AND ends_at > now()
```

### `player_boosts` (legacy VIP path — same shape)

```sql
id               UUID        PRIMARY KEY DEFAULT gen_random_uuid()
player_id        UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE
type             boost_type  NOT NULL   -- DB enum with the same 7 values
starts_at        TIMESTAMPTZ NOT NULL
ends_at          TIMESTAMPTZ NOT NULL
cooldown_ends_at TIMESTAMPTZ
metadata         JSONB
```

Active query:

```sql
SELECT * FROM player_boosts
WHERE player_id = $1 AND ends_at > now()
```

---

## 11. Design Invariants (must never be violated)

| Invariant | Verification |
|---|---|
| Hero never modifies PP | `calculatePersonalPower()` has no hero parameter |
| Hero bonus multiplies PP only, not ClanBonus | ECP formula; verified in 175 unit tests |
| All bonus categories capped at 50% | `clampBonus()` called on every category before use |
| Shields apply inside combat, not at the gate | `resolveCombat()` inputs; gate checks are separate |
| Loot decay counting is unaffected by shields | `attackCountInWindow` is incremented regardless |
| Fail-safe on DB error | `getActiveHeroEffects()` returns all-zeros on error; combat never blocked |
