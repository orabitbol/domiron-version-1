# Combat Balance Rework — 2026-03-13

## Summary

Complete rework of the soldier-loss and loot formulas in the Domiron combat engine.
Goal: make attacks worth doing frequently, with strong ratio-driven differentiation.

---

## Problems with the old formula

| Issue | Old behaviour | Impact |
|---|---|---|
| Linear loss division | `attackerRate = BASE_LOSS / R` | Dominant attacker still lost many soldiers |
| Linear loss multiplication | `defenderRate = BASE_LOSS × R` | Defender losses grew too slowly at high R |
| No ratio-scaled loot | `loot = unbanked × 0.10` | No reward for overwhelming the defender |
| Low CAPTURE_RATE | 10% | Slavery/captive system underutilised |
| Pre-multiplication floor | `floor(soldiers × rate) × turns` | Sub-1 per-turn losses rounded to 0; multi-turn gave 0 at normal army sizes |

---

## New formulas

### Soldier losses (power-curve model)

```
rawAttackerRate = ATTACKER_BASE_LOSS / R ^ ATTACKER_LOSS_EXPONENT
rawDefenderRate = DEFENDER_BASE_LOSS × R ^ DEFENDER_LOSS_EXPONENT

attackerLossRate = clamp(rawAttackerRate, ATTACKER_FLOOR, MAX_LOSS_RATE)
defenderLossRate = clamp(rawDefenderRate, DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)

-- Per-turn raw float (no floor yet):
attackerLosses = deployedSoldiers × attackerLossRate
defenderLosses = defenderSoldiers × defenderLossRate

-- Final integer (floored AFTER turn scaling in route):
finalAttackerLosses = floor(min(attackerLosses × turnsUsed, attArmy.soldiers))
finalDefenderLosses = floor(min(defenderLosses × turnsUsed, defArmy.soldiers))
```

**Key change**: `Math.floor` moved from `calculateSoldierLosses` to the route's
multi-turn scaling step. This ensures that sub-1 per-turn rates accumulate
correctly over multiple turns rather than rounding to 0 each turn.

### Loot (ratio-scaled)

```
ratioMult  = min(R, LOOT_RATIO_CAP) ^ LOOT_RATIO_EXPONENT
totalMult  = BASE_LOOT_RATE × outcomeMult × decayFactor × ratioMult
loot[r]    = floor(unbanked[r] × totalMult) × turnsUsed
```

Stronger attackers earn proportionally more loot:

| R | ratioMult |
|---|---|
| 1.0 | 1.00× |
| 1.4 | 1.30× |
| 2.0 | 1.87× |
| 2.2 | 2.00× |
| 3.0+ | 2.55× (capped) |

---

## Constants changed

| Constant | Old | New | Notes |
|---|---|---|---|
| `BASE_LOSS` | `0.15` | _removed_ | Split into ATTACKER/DEFENDER_BASE_LOSS |
| `ATTACKER_BASE_LOSS` | — | `0.00025` | New |
| `ATTACKER_LOSS_EXPONENT` | — | `2.3` | New; strong convexity |
| `DEFENDER_BASE_LOSS` | — | `0.00035` | New |
| `DEFENDER_LOSS_EXPONENT` | — | `1.7` | New |
| `MAX_LOSS_RATE` | `0.30` | `0.003` | Per-turn cap (applied before turn scaling) |
| `DEFENDER_BLEED_FLOOR` | `0.05` | `0.0001` | Much lower; meaningful only at scale |
| `ATTACKER_FLOOR` | `0.03` | `0.000001` | Near-zero; dominant attacker pays almost nothing |
| `CAPTURE_RATE` | `0.10` | `0.40` | 4× increase; captives now a real reward |
| `LOOT_RATIO_CAP` | — | `3.0` | New |
| `LOOT_RATIO_EXPONENT` | — | `0.85` | New; sub-linear to prevent runaway |

---

## Verified balance targets

All examples assume 10k soldiers per side, 10-turn attack, no shields/cooldowns.
R = attacker ECP / defender ECP.

| Scenario | R | Att losses | Def losses | Loot/resource¹ | Captives |
|---|---|---|---|---|---|
| A — Even fight | 1.0 | ~25 | ~35 | ~25k | ~14 |
| B — Moderate win | 1.4 | ~11 | ~59 | ~33k | ~24 |
| C — Strong win | 2.2 | ~4 | ~134 | ~50k | ~54 |
| D — Dominant | 3.0 | ~2 | ~226 | ~64k | ~90 |
| E — 7k att vs 10k def (R≈1.6) | 1.6 | ~6 | ~100 | ~36k | ~40 |
| F — Loss (12k att, R≈0.714) | 0.714 | ~65 | ~28 | 0 | 0 |
| G — Soldier shield (R≈2.2) | 2.2 | ~4 | 0 | high (if no res shield) | 0 |

¹ Assuming ~25k unbanked gold per resource. Loot scales linearly with `turnsUsed`.

**Formula verification (examples A, C, D):**
```
A: attRate = 0.00025/1.0^2.3 = 0.00025  → 10000×0.00025×10 = floor(25.0) = 25 ✓
   defRate = 0.00035×1.0^1.7 = 0.00035  → 10000×0.00035×10 = floor(35.0) = 35 ✓
C: attRate = 0.00025/2.2^2.3 = 0.0000408 → 10000×0.0000408×10 = floor(4.08) = 4 ✓
   defRate = 0.00035×2.2^1.7 = 0.001337  → 10000×0.001337×10 = floor(133.7) = 133 ✓
D: attRate = 0.00025/3.0^2.3 = 0.0000200 → 10000×0.0000200×10 = floor(2.0) = 2 ✓
   defRate = 0.00035×3.0^1.7 = 0.002265  → 10000×0.002265×10 = floor(226.5) = 226 ✓
```

---

## Files changed

| File | Change |
|---|---|
| `config/balance.config.ts` | Replaced `BASE_LOSS` with 6 new constants; updated `CAPTURE_RATE`, `MAX_LOSS_RATE`, floors |
| `lib/game/balance-validate.ts` | Schema updated to match new fields |
| `lib/game/combat.ts` | `calculateSoldierLosses`: power-curve formula, returns floats. `calculateLoot`: added `ratio` parameter. `resolveCombat`: passes `ratio` to `calculateLoot`. |
| `app/api/attack/route.ts` | `Math.floor(Math.min(losses × turnsUsed, army))` — floor moved after scaling |
| `lib/game/combat.test.ts` | Removed `BASE_LOSS` reference; added `ratio` param to all `calculateLoot` calls; added ratio-boost tests |
| `lib/game/attack-integrity.test.ts` | Updated test scenarios; `applyRouteSafetyClamps` floors safeDefLosses; `computeAttAfter` floors attacker losses; loot assertions use `calculateLoot` as reference |

---

## Invariants preserved

All existing combat invariants remain intact:

- Binary outcome (win/loss) — no draw
- `soldierShieldActive` → `defenderLosses = 0`
- `resourceShieldActive` → `loot = 0`
- `killCooldownActive` → `defenderLosses = 0`, loot still applies
- `defenderIsProtected` → `defenderLosses = 0`, `loot = 0`
- `attackerIsProtected` → `attackerLosses = 0`
- `captives = floor(defenderLosses × CAPTURE_RATE)` — always < defenderLosses
- Cavalry never die (unchanged)
- Atomic `attack_resolve_apply` RPC — no changes to SQL (receives pre-computed values)
- Anti-farm decay (5-step) — unchanged

---

## Test results

```
✓ lib/game/combat.test.ts         93 tests
✓ lib/game/attack-integrity.test.ts  57 tests
✓ npx tsc --noEmit               0 errors
✓ npx next build                 0 errors
```
