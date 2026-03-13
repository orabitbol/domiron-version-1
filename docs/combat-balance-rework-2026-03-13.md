# Combat Balance Rework — 2026-03-13

## Summary

Full re-tune of combat balance constants plus a complete battle report UI redesign.

Goals:
- Fights feel more impactful and rewarding
- Strong attackers benefit much more clearly from their ratio advantage
- Loot is more generous across all turn counts
- Captives/slaves are meaningfully higher
- Battle report instantly communicates what happened

---

## Part 1 — Soldier Loss Constants

### Formula (unchanged in structure)

```
rawAttackerRate = ATTACKER_BASE_LOSS / R ^ ATTACKER_LOSS_EXPONENT
rawDefenderRate = DEFENDER_BASE_LOSS × R ^ DEFENDER_LOSS_EXPONENT

attackerLossRate = clamp(rawAttackerRate, ATTACKER_FLOOR,       MAX_LOSS_RATE)
defenderLossRate = clamp(rawDefenderRate, DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)

-- Returns floats; floor happens AFTER turn-scaling in route:
finalAttackerLosses = floor(min(attackerLosses_float × turnsUsed, attArmy.soldiers))
finalDefenderLosses = floor(min(defenderLosses_float × turnsUsed, defArmy.soldiers))
```

### Constants Changed

| Constant | Before | After | Ratio |
|---|---|---|---|
| `ATTACKER_BASE_LOSS` | 0.00025 | **0.0005** | ×2 |
| `ATTACKER_LOSS_EXPONENT` | 2.3 | **2.5** | steeper |
| `DEFENDER_BASE_LOSS` | 0.00035 | **0.0015** | ×4.3 |
| `DEFENDER_LOSS_EXPONENT` | 1.7 | **2.0** | steeper |
| `MAX_LOSS_RATE` | 0.003 | **0.02** | ×6.7 |
| `DEFENDER_BLEED_FLOOR` | 0.0001 | **0.0002** | ×2 |
| `ATTACKER_FLOOR` | 0.000001 | 0.000001 | unchanged |

### Expected Outcomes: 10,000 soldiers per side, 10-turn attack, no shields

| R (ratio) | Att losses before | Att losses after | Def losses before | Def losses after |
|---|---|---|---|---|
| R=1.0 | ~25 | **~50** | ~35 | **~150** |
| R=1.5 | ~11 | **~18** | ~62 | **~338** |
| R=2.0 | ~5 | **~8** | ~113 | **~600** |
| R=3.0 | ~2 | **~3** | ~226 | **~1350** |

**Key effects:**
- Even fights (R=1.0): both sides take real, noticeable losses now
- Dominant wins (R=2.0+): attacker loses almost nothing; defender takes heavy casualties
- The ratio gap between attacker and defender losses grows steeply with R
- MAX_LOSS_RATE increased from 0.3%/turn to 2%/turn — dominant attacker can now eliminate up to 20% of defenders in a 10-turn attack

---

## Part 2 — Loot Constants

### Formula (unchanged in structure)

```
ratioMult  = min(R, LOOT_RATIO_CAP) ^ LOOT_RATIO_EXPONENT
totalMult  = BASE_LOOT_RATE × outcomeMult × decayFactor × ratioMult
loot[r]    = floor(unbanked[r] × totalMult) × turnsUsed    (then safety-clamped to defender's actual resources)
```

### Constants Changed

| Constant | Before | After | Notes |
|---|---|---|---|
| `BASE_LOOT_RATE` | 0.10 | **0.12** | +20% base |
| `LOOT_RATIO_EXPONENT` | 0.85 | **1.0** | linear scaling (was sub-linear) |
| `LOOT_RATIO_CAP` | 3.0 | 3.0 | unchanged |

### Loot Scenarios (% of unbanked taken, first attack, no decay)

| Turns used | R=1.0 before→after | R=2.0 before→after | R=3.0 before→after |
|---|---|---|---|
| 1 turn | 10% → **12%** | 18% → **24%** | 25% → **36%** |
| 3 turns | 30% → **36%** | 54% → **72%** | 76% → **all** |
| 5 turns | 50% → **60%** | 90% → **all** | all → **all** |
| 10 turns | all → **all** | all → **all** | all → **all** |

**Key effects:**
- 1-turn attacks: meaningfully more loot at all ratios
- 3-turn dominant attacks: take 72–100% of unbanked (was 54–76%)
- Linear exponent (1.0): R=2 gives exactly 2× loot, R=3 gives exactly 3× — clean and predictable

---

## Part 3 — Captives

| Constant | Before | After |
|---|---|---|
| `CAPTURE_RATE` | 0.40 | **0.50** |

With defender losses ~4× higher AND 50% capture rate (was 40%), captives per attack are approximately **5× more** than before.

**Invariant always holds**: `captives = floor(defenderLosses × 0.50) < defenderLosses` because 0.50 < 1.0.

---

## Part 4 — Shields / Protections (Behavior Unchanged)

These all function identically:

| Mechanic | Effect |
|---|---|
| Soldier Shield | `defenderLosses = 0` → captives also 0 (derived) |
| Resource Shield | `loot = 0` for all resources |
| Defender Protection | `defenderLosses = 0` and `loot = 0` |
| Attacker Protection | `attackerLosses = 0` |
| Kill Cooldown | `defenderLosses = 0` and captives 0; loot still applies |
| Cavalry | Contributes to PP; never dies in combat |
| Anti-farm decay | Steps [1.0, 0.7, 0.4, 0.2, 0.1] — unchanged |
| Multi-turn scaling | `loot × turnsUsed`; `floor(losses_float × turnsUsed)` |

---

## Part 5 — Battle Report UI Redesign

### Old Layout (problems)
1. Small "Victory/Defeat" text with muted ratio inline
2. Two small cards (Your Attack / Enemy Defense) with multiple text rows for PP/clan/tribe
3. Horizontal strip: turns spent + food
4. 3-column table: unit | you lost | enemy lost
5. 2-col resource grid for gains + italic anti-farm note
6. Conditional "why nothing" section OR modifiers section
7. Close button

**Issues**: flat visual weight, no immediate outcome clarity, gains section looks like a data table not a reward, WIN and LOSS states look similar, zero values look broken.

### New Layout
1. **Outcome Banner** — full-width color panel. Gold/amber for WIN, red/dark for LOSS. Large display title + ratio badge inline.
2. **Power Comparison** — 2-col grid. Each: large ECP number + PP below + clan bonus if active.
3. **Cost | Gains** — 2-col grid. Left: turns + food paid. Right: only non-zero resources shown (gold-colored `+N`), captives in amber. Gains panel highlighted amber when non-empty. Shows "—" cleanly when nothing gained.
4. **Casualties** — 2-col grid. Left: your soldiers lost (red if > 0, muted if 0). Right: enemy soldiers lost (green if > 0, muted if 0). Large bold tabular numbers.
5. **Modifiers** — only rendered if `report.reasons.length > 0`. Compact bullet list.
6. Close button

### What Is Better
- Outcome is unmistakable in 0.1 seconds (banner + color)
- Cost and gains are adjacent and visually paired
- Non-zero gains pop out in gold — feels rewarding
- Zero casualties look clean and intentional, not broken
- Separate casualties section from gains section — clearer mental model
- Modal size changed `md` → `lg` for better spacing
- No "why nothing was gained" section — now the modifiers section covers this whenever it matters

---

## Part 6 — Cleanup

- Removed `console.log('[attack/debug]', JSON.stringify({...}))` from `app/api/attack/route.ts` — was logging all combat state on every attack (noisy in production)
- Removed unused `OUTCOME_COLORS` constant from `AttackClient.tsx`
- Fixed misleading test description: was `'MAX_LOSS_RATE (30%)'` — corrected to `'MAX_LOSS_RATE per turn'` (the old value was 0.003 = 0.3%, not 30%)

---

## Files Changed

| File | Change |
|---|---|
| `config/balance.config.ts` | Retuned 6 loss constants + BASE_LOOT_RATE + LOOT_RATIO_EXPONENT + CAPTURE_RATE |
| `lib/game/combat.ts` | Updated doc comment (formula + expected outcomes) |
| `app/api/attack/route.ts` | Removed verbose debug log |
| `app/(game)/attack/AttackClient.tsx` | Full redesign of `BattleReportModal`; removed `OUTCOME_COLORS`; modal size `md`→`lg` |
| `lib/game/combat.test.ts` | Fixed test description string |
| `messages/he.json` | Added `attack.your_losses`, `attack.enemy_losses` |
| `messages/en.json` | Added `attack.your_losses`, `attack.enemy_losses` |

`lib/game/balance-validate.ts` — no changes needed (all combat values are `z.number()` with no min/max constraints).

`lib/game/attack-integrity.test.ts` — no changes needed (all assertions are driven by `BALANCE.*` constants and will adapt automatically to the new values).
