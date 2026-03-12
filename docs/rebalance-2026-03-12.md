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
| Dev/infrastructure upgrade costs | No change | Existing cost cliff (lv5→6 ×12) is an intentional progression gate |
| Basic training unit costs | No change | 60–200g per unit is reasonable relative to the corrected economy |
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

### Dev/Infrastructure Upgrade Costs

Cost formula: `config × nextLevel` where tier bracket determines config:
- Levels 1→2: 3g + 3r
- Levels 2→3: 9g + 9r
- Levels 3→4: 27g + 27r (×3 per tier)
- Levels 4→5: 50g + 50r (×1.85×)
- Levels 5→6: 300g + 300r (×6×)
- Levels 6→10: 500g + 500r × level

The cost cliff at level 5→6 is an intentional progression gate. Total to max all 6 dev categories is high but well-distributed. No change.

### Basic Training

Soldier: 60g, Spy: 80g, Scout: 80g, Cavalry: 200g. These are calibrated relative to production rates. No change.

### Shop (Weapons)

All-4-resource pricing enforces economy-wide trade-offs. Power progression scales from 200g×4 (slingshot) to 12,800g×4 (iron_ball). No change.

---

## Files Modified

| File | Change |
|---|---|
| `config/balance.config.ts` | `INTEREST_RATE_BY_LEVEL` ÷10, `advancedCost` ×5 |
| `lib/game/tick.test.ts` | Updated 3 hardcoded bank interest test assertions |
| `docs/GameMechanics-SingleSourceOfTruth.md` | Bank interest table, advanced training cost |
| `docs/System-Audit-Report.md` | Bank interest rate mention |
| `docs/GAME_MECHANICS.md` | `advancedCost` constants |
