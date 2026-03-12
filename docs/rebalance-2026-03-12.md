# Domiron Economy Rebalance — 2026-03-12

## Summary

First-pass rebalance after completing the balance simulation audit (`scripts/balance-sim.test.ts`).
Two changes implemented. Three systems reviewed and left unchanged.

---

## Systems Audited

| System | Action | Reason |
|---|---|---|
| Bank interest rates | **Reduced ÷10** | Compound interest at 30%/day is catastrophically dominant |
| Advanced training costs | **Increased ×5** | +80% combat power at max was trivially cheap |
| Dev/infrastructure upgrade costs (level5 bracket) | **Increased ×4** | Mid-game gate was too cheap; level 3–5 upgrades now cost 200g vs 50g |
| Cavalry cost | **Increased ×50** | Cavalry is a rare premium late-game asset, not a spammable unit |
| Basic training (soldier/spy/scout) | No change | 60–80g per unit is reasonable |
| Shop (weapons) costs | No change | All-4-resource pricing model is well-calibrated |

---

## 1. Bank Interest Rates

### Problem

Bank interest compounds daily. At level 10 (30%/day), starting with 100,000g:
- Day 30: ~26 billion gold
- Day 90: ~1.8 trillion gold

Even the corrected simulation (BankFirst strategy, city 1, 100 slaves) shows ~149 trillion gold at day 90 at level 10. This completely dominates every other economic activity and invalidates the rest of the game economy.

At 3%/day (new max), a 100,000g deposit grows to:
- Day 30: ~243,000g (+143%) — meaningful but not game-breaking
- Day 90: ~1,427,000g (+1,327%) — strong end-game reward for the investment

### Change

All non-zero `INTEREST_RATE_BY_LEVEL` values divided by 10.

| Level | Before | After | Upgrade cost (unchanged) |
|---|---|---|---|
| 0 | 0% | 0% | — |
| 1 | 5.0% | 0.5% | 2,000 gold |
| 2 | 7.5% | 0.75% | 4,000 gold |
| 3 | 10.0% | 1.0% | 6,000 gold |
| 4 | 12.5% | 1.25% | 8,000 gold |
| 5 | 15.0% | 1.5% | 10,000 gold |
| 6 | 17.5% | 1.75% | 12,000 gold |
| 7 | 20.0% | 2.0% | 14,000 gold |
| 8 | 22.5% | 2.25% | 16,000 gold |
| 9 | 25.0% | 2.5% | 18,000 gold |
| 10 | 30.0% | 3.0% | 20,000 gold |

**Total to max (lv0→10):** 110,000 gold (unchanged).

**Invariants preserved:** monotonically non-decreasing, level 0 present, `MAX_INTEREST_LEVEL = 10` unchanged. `balance-validate.ts` Zod checks pass.

### Impact on Bank ROI

At new max 3%/day with 100,000g deposited (compounding over 90 days):
- Level 10 day-90 balance: ~1,427,000g (+1.3M gain)
- Break-even on 110k upgrade cost: ~day 6 at max level
- Bank remains a strong investment — just not universally dominant

---

## 2. Advanced Training Costs

### Problem

Advanced training cost formula: `goldCost = advancedCost.gold × (currentLevel + 1)`

At `advancedCost.gold = 300`, total to max one skill (level 0→10):
- Σ(300 × L, L=1..10) = 300 × 55 = **16,500 gold + 16,500 food**

At max level, the skill grants +80% multiplier (`10 × 0.08 = 0.8`). This is a +80% combat power boost for 16,500g. A player trains 144 soldiers/day (144 × 60g = 8,640g/day), meaning advanced training to max costs less than 2 days of basic training spend — but gives a permanent +80% multiplier.

Advanced training was trivially cheap and dominated combat with no meaningful resource gate.

### Change

`advancedCost` increased 5×: `{ gold: 300, food: 300 }` → `{ gold: 1500, food: 1500 }`

| Metric | Before | After |
|---|---|---|
| Cost per level (lv0→1) | 300g + 300f | 1,500g + 1,500f |
| Total to max one skill | 16,500g + 16,500f | 82,500g + 82,500f |
| Total to max all 4 skills | 66,000g + 66,000f | 330,000g + 330,000f |
| Days to max one skill (1k slaves, eq. split, city 1) | ~3 days | ~14 days |
| % of season budget (90-day BankFirst economy) | ~0.001% | ~0.005% |

**Rationale:** Maxing a single skill now requires ~14 days of production income at mid-game rates. Still achievable in a 90-day season but requires deliberate investment. Four skills at max represents a 330k gold + 330k food total spend — a significant late-game commitment.

---

## 3. Systems Left Unchanged

## 3. Development Level5 Bracket

### Problem

The mid-game development bracket (`next_level ≤ 5`) was only 50g + 50r per base cost, making levels 3–5 feel trivially cheap compared to the level 5→6 jump (500g × 6 = 3,000g). The gate between mid and late development had no real mid-section.

### Change

`developmentUpgradeCost.level5`: `{ gold: 50, resource: 50 }` → `{ gold: 200, resource: 200 }`

| Upgrade | Before | After |
|---|---|---|
| 3 → 4 | 50×4 = 200g | 200×4 = 800g |
| 4 → 5 | 50×5 = 250g | 200×5 = 1,000g |

Total cost to level 5 (per field, from level 1): was 483g → now 1,833g. This is intentional: hitting level 5 before the 500g/level cliff now requires real investment.

---

## 4. Cavalry Cost

### Problem

At 200g per cavalry, with `popCost = 5`, cavalry was cheap enough to bulk-train once a player had soldiers. At 200g, a player spending 10,000g on cavalry gets 50 cavalry. Given cavalry contributes as Tier 2 (×3 over soldiers), this was strong value for modest cost.

### Change

`cavalry.gold`: 200 → 10,000

| Metric | Before | After |
|---|---|---|
| Cost per cavalry | 200g | 10,000g |
| 10 cavalry | 2,000g | 100,000g |
| 50 cavalry | 10,000g | 500,000g |

**Design intent:** Cavalry is a rare, premium, irreversible asset. Even a small cavalry force represents a major late-game investment. This is acceptable; cavalry is meant to be exceptional, not a default combat choice.

---

## 5. Systems Left Unchanged

### Shop (Weapons)

All-4-resource pricing enforces economy-wide trade-offs. Power progression scales from 200g×4 (slingshot) to 12,800g×4 (iron_ball). No change.

---

## Files Modified

| File | Change |
|---|---|
| `config/balance.config.ts` | `INTEREST_RATE_BY_LEVEL` ÷10, `advancedCost` ×5, `level5` ×4, `cavalry.gold` ×50 |
| `lib/game/tick.test.ts` | Updated 3 hardcoded bank interest test assertions |
| `docs/GameMechanics-SingleSourceOfTruth.md` | Bank interest table, advanced training cost, cavalry cost, dev level5 formula + example |
| `docs/System-Audit-Report.md` | Bank interest rate mention |
| `docs/GAME_MECHANICS.md` | `advancedCost`, `cavalry`, dev level5 formula + cost table + cumulative |
| `docs/formulas.md` | `cavalry` cost row, dev level5 formula line |
| `game-logic.md` | Dev level 5 upgrade cost row |
