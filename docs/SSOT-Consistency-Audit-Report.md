# SSOT Consistency Audit Report

> **Audited:** 2026-03-05
> **Auditor:** Claude Code (automated + manual review)
> **SSOT source:** `docs/GameMechanics-SingleSourceOfTruth.md`
> **Scope:** BALANCE/validateBalance · DB migrations · Tick system · Core gameplay write routes · Pure logic formulas · UI correctness

---

## 1. Executive Summary

**Result: PASS — no true mismatches found.**

Every formula, constant, gate order, and mechanic described in the SSOT as *currently implemented* matches the codebase exactly. No divergences were found between SSOT descriptions and actual code.

What this audit did find is a set of **known, pre-documented atomicity gaps** that are already tracked in `docs/Atomicity-and-PromiseAll-Playbook.md` with assigned priorities (P2–P4). These are future work items, not regressions. They are listed in §5 for completeness with exact file/line references.

One piece of **dead code** was identified (`calcTurnsAfterRegen` in `combat.ts`) — it is correct but unused by the tick system, which has its own more complete implementation (`calcTurnsToAdd` in `tick.ts`). No action needed; it is covered by tests.

---

## 2. Mismatches Table

| ID | System | SSOT Excerpt | Code Excerpt | Status |
|----|--------|-------------|--------------|--------|
| — | All | — | — | **No mismatches found** |

---

## 3. Verification Results by Area

### A — BALANCE / validateBalance

| Check | Result |
|-------|--------|
| All game constants in `config/balance.config.ts`, imported via `@/lib/game/balance` | PASS |
| `validateBalance()` called at module load, throws on missing/invalid key | PASS |
| No hardcoded game numbers in any route or RPC | PASS |
| `depositsPerDay: 5`, `maxDepositPercent: 1.0` match SSOT §11 | PASS |
| `turnsPerTick: 3`, `maxTurns: 200` match SSOT §1 | PASS |
| `WIN_THRESHOLD: 1.0`, `FOOD_PER_SOLDIER: 0.05`, `CAPTURE_RATE: 0.10` match SSOT §5–7 | PASS |
| `SOLDIER_SHIELD_MANA: 10`, `RESOURCE_SHIELD_MANA: 10` match SSOT §9 | PASS |
| Bank interest rates correctly marked `[TUNE: unassigned]` | PASS |
| City production multipliers correctly marked `[TUNE: unassigned]` | PASS |
| Zod refiners: bank monotonicity, level-0 presence, MAX_INTEREST_LEVEL, cities coverage 1..maxCity | PASS |

### B — DB Migrations vs SSOT

| Check | Result |
|-------|--------|
| All 19 migrations (0001–0019) applied to live DB (pushed 2026-03-05) | PASS |
| `bank.deposits_today` constraint: `BETWEEN 0 AND 5` (migration 0007) | PASS |
| `world_state` table created, seeded, RLS policy applied (migration 0008 — idempotency fixed) | PASS |
| `army.farmers` column removed (migration 0009 — idempotency fixed) | PASS |
| `player_hero_effects` table present (migration 0003) | PASS |
| `spy_history` table present for spy RPC writes | PASS |
| All RPC migrations (0012–0019) applied | PASS |

### C — Tick System

| Check | Formula / Rule | File:Line | Result |
|-------|---------------|-----------|--------|
| Turns regen | `min(current + turnsPerTick × vacationMult, maxTurns)`, `Math.ceil` | `lib/game/tick.ts:calcTurnsToAdd` | PASS |
| Slave production | `slaves × (1 + devOffset × devLevel) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)` | `lib/game/tick.ts:calcSlaveProduction` | PASS |
| Population growth | `BALANCE.production.populationPerTick[level]` | `lib/game/tick.ts:calcPopulationGrowth` | PASS |
| Bank interest | `floor(balance × rate)` per level, VIP bonus suppressed (0) | `lib/game/tick.ts:calcBankInterest` | PASS |
| Tribe mana gain | `max(1, floor(memberCount × 1))` | `lib/game/tick.ts:calcTribeManaGain` | PASS |
| Hero mana gain | levels 10/50 + VIP | `lib/game/tick.ts:calcHeroManaGain` | PASS |
| Rankings | global sort `power_total DESC`, `joined_at ASC` tiebreak | `app/api/tick/route.ts` | PASS |
| `next_tick_at` update | `upsert({ id: 1, next_tick_at })` on world_state | `app/api/tick/route.ts` | PASS |
| Broadcast | `broadcastTickCompleted` after upsert | `app/api/tick/route.ts` | PASS |
| Dev auto-tick | `NODE_ENV !== 'development'` + `NEXT_RUNTIME === 'edge'` guards, 3-s delay | `instrumentation.ts` | PASS |

### D — Core Gameplay Write Routes

| Route | Atomic? | Gate Order Matches SSOT? | Result |
|-------|---------|--------------------------|--------|
| `POST /api/attack` | RPC (`attack_resolve_apply`) | Auth → Input → Self-check → Freeze → Rate-limit → Turns/food/soldiers | PASS |
| `POST /api/spy` | RPC (`spy_resolve_apply`) | Auth → Input → Self-check → Freeze → Rate-limit → Turns/spies | PASS |
| `POST /api/bank/deposit` | RPC (`bank_deposit_apply`) | Auth → Input → Freeze → Pre-validate → RPC | PASS |
| `POST /api/bank/withdraw` | RPC (`bank_withdraw_apply`) | Auth → Input → Freeze → Pre-validate → RPC | PASS |
| `POST /api/bank/upgrade` | RPC (`bank_interest_upgrade_apply`) | Auth → Input → Freeze → Pre-validate → RPC | PASS |
| `POST /api/city/promote` | RPC (`city_promote_apply`) | Auth → Freeze → maxCity → tribe → soldiers → resources | PASS |
| `POST /api/tribe/pay-tax` | RPC (`tribe_pay_tax_apply`) | Auth → Freeze → membership → paid-today → amount → RPC | PASS |
| `POST /api/training/basic` | **Non-atomic** `Promise.all` | Correct gate order | KNOWN GAP (P2) |
| `POST /api/hero/buy-spell` | **Non-atomic** `Promise.all` | Correct gate order | KNOWN GAP (P2) |
| `POST /api/hero/activate-shield` | **Non-atomic** `Promise.all` | Correct gate order | KNOWN GAP (P2) |
| `POST /api/shop/buy` | **Non-atomic** `Promise.all` | Correct gate order | KNOWN GAP (P3) |
| `POST /api/shop/sell` | **Non-atomic** `Promise.all` | Correct gate order | KNOWN GAP (P3) |
| `POST /api/training/advanced` | **Non-atomic** `Promise.all` | Correct gate order | KNOWN GAP (P3) |
| `POST /api/develop/upgrade` | **Non-atomic** `Promise.all` | Correct gate order | KNOWN GAP (P3) |
| `POST /api/tribe/activate-spell` | **Non-atomic** `Promise.all` | Correct gate order | KNOWN GAP (P4) |
| `POST /api/tribe/spell` | **Non-atomic** `Promise.all` | Correct gate order | KNOWN GAP (P4) |
| `POST /api/tribe/create` | Sequential inserts | n/a | KNOWN GAP (P4) |
| `POST /api/auth/register` | `Promise.all` 7 inserts | n/a | APPROVED EXCEPTION (§8) |
| `GET /api/tick` | `Promise.all` per player | n/a | APPROVED EXCEPTION (§8) |

### E — Pure Logic Formulas

| Function | File | Matches SSOT? |
|----------|------|---------------|
| `calculatePersonalPower` | `lib/game/combat.ts:189` | PASS — PP = soldierScore×W + equipScore×W + skillScore×W + min(devScore,DEV_CAP)×W + spyScore×W |
| `calcSoldierScore` | `lib/game/combat.ts:217` | PASS — SoldierScore = Σ Count[tier] × (SOLDIER_V × SOLDIER_K^(tier-1)) |
| `calcEquipScore` | `lib/game/combat.ts:238` | PASS — attack: additive per unit; defense/spy/scout: binary per item |
| `calculateClanBonus` | `lib/game/combat.ts:325` | PASS — raw = TotalClanPP × EfficiencyRate; cap = 0.20 × PlayerPP; floor(min(raw,cap)) |
| `calculateECP` | `lib/game/combat.ts:356` | PASS — floor((PP × (1+heroBonus) × (1+raceBonus)) + ClanBonus) |
| `resolveCombat` tribe mult | `lib/game/combat.ts:604` | PASS — tribe multiplier applied after ECP, before ratio |
| `calculateSoldierLosses` | `lib/game/combat.ts:417` | PASS — DEFENDER_BLEED_FLOOR, ATTACKER_FLOOR, MAX_LOSS_RATE all from BALANCE |
| `calculateCaptives` | `lib/game/combat.ts:457` | PASS — floor(defenderLosses × CAPTURE_RATE) |
| `calculateLoot` | `lib/game/combat.ts:544` | PASS — BASE_LOOT_RATE × outcomeMult × decayFactor, win only |
| `getLootDecayMultiplier` | `lib/game/combat.ts:525` | PASS — LOOT_DECAY_STEPS indexed, last step repeated |
| `isKillCooldownActive` | `lib/game/combat.ts:470` | PASS — elapsed < KILL_COOLDOWN_HOURS × ms |
| `isNewPlayerProtected` | `lib/game/combat.ts:498` | PASS — season gate (protectionStartDays) + per-player PROTECTION_HOURS |
| `calcActiveHeroEffects` | `lib/game/hero-effects.ts:73` | PASS — sums effect rates, clamps at MAX_STACK_RATE (0.50) |
| `clampBonus` | `lib/game/hero-effects.ts:65` | PASS — min(total, MAX_STACK_RATE) |
| `getActiveHeroEffects` | `lib/game/hero-effects.ts:154` | PASS — throws HeroEffectsUnavailableError on DB failure (no silent fallback) |
| `calcTurnsToAdd` (tick) | `lib/game/tick.ts` | PASS — vacation multiplier applied, Math.ceil, capped at maxTurns |
| `calcTurnsAfterRegen` (combat) | `lib/game/combat.ts:574` | DEAD CODE (see §6) |
| Spy formula | `app/api/spy/route.ts:38–66` | PASS — spyPower = floor(spies × trainMult × weapMult × raceMult) |
| Scout formula | `app/api/spy/route.ts:53–66` | PASS — same structure |
| Spies caught | `app/api/spy/route.ts:231–233` | PASS — ratio × catchRate × spiesSent, capped at MAX_CATCH_RATE |
| Development upgrade cost | `app/api/develop/upgrade/route.ts:17–44` | PASS — matches BALANCE.production.developmentUpgradeCost, multiplied by next level |

### F — UI Correctness

| Check | Result |
|-------|--------|
| No hardcoded numbers in UI components — all use `BALANCE.*` | PASS |
| `tick-status` endpoint returns `{ server_now, next_tick_at }` — `noStore()` applied | PASS |
| Sidebar/ResourceBar uses `usePlayer()` — never derives game state independently | PASS |
| `applyPatch` used for optimistic updates; `refresh()` always follows for server-authoritative state | PASS |
| Shield dots shown in AttackDialog — two per target (resource/soldier) | PASS |
| VIP bank bonus display uses `?? 0` fallback (value is `[TUNE: unassigned]`) | PASS |
| City production multiplier uses `?? 1` fallback (value is `[TUNE: unassigned]`) | PASS |

---

## 4. Doc Gaps

None found. The SSOT covers all currently implemented systems. All known future systems (hero XP, vacation toggle, crystal purchases) are already marked as "not implemented" in the SSOT.

---

## 5. Code Gaps (Atomicity — Known Future Work)

These are not regressions. They are pre-documented in `docs/Atomicity-and-PromiseAll-Playbook.md` with the exact priority, risk, and target fix. Listed here for completeness.

| Priority | Route | File | Line | What can go wrong | Target fix |
|----------|-------|------|------|------------------|------------|
| P2 | `training/basic` | `app/api/training/basic/route.ts` | 91–94 | Gold lost, units not granted — or vice versa. Double-training race possible | `training_basic_apply` RPC |
| P2 | `hero/buy-spell` | `app/api/hero/buy-spell/route.ts` | 66–69 | Mana deducted, spell not stored — or spell gained for free | `hero_buy_spell_apply` RPC |
| P2 | `hero/activate-shield` | `app/api/hero/activate-shield/route.ts` | 82 | Mana lost, shield effect not inserted | `hero_activate_shield_apply` RPC |
| P3 | `shop/buy` | `app/api/shop/buy/route.ts` | 125–128 | Gold/iron lost but weapon not received | `shop_buy_apply` RPC |
| P3 | `shop/sell` | `app/api/shop/sell/route.ts` | 74–77 | Weapon gone but gold not returned | `shop_sell_apply` RPC |
| P3 | `training/advanced` | `app/api/training/advanced/route.ts` | 58 | Resources spent, level not incremented | `training_advanced_apply` RPC |
| P3 | `develop/upgrade` | `app/api/develop/upgrade/route.ts` | 101–104 | Resources spent, dev level not incremented | `develop_upgrade_apply` RPC |
| P4 | `tribe/activate-spell` | `app/api/tribe/activate-spell/route.ts` | 89 | Mana deducted, spell log not inserted | `tribe_activate_spell_apply` RPC |
| P4 | `tribe/spell` | `app/api/tribe/spell/route.ts` | 89 | Same pattern | Same RPC or extend above |
| P4 | `tribe/create` | `app/api/tribe/create/route.ts` | — | Sequential inserts: tribe row without leader if second insert fails | `tribe_create_apply` RPC or catch cleanup |

---

## 6. Findings Requiring Attention

### F1 — Dead Code: `calcTurnsAfterRegen` in `lib/game/combat.ts:574`

**Severity:** Low. No runtime impact.

**Description:**
`calcTurnsAfterRegen(currentTurns: number)` is exported from `combat.ts` and tested in `combat.test.ts`. However, the tick system uses `calcTurnsToAdd(currentTurns, isVacation)` from `lib/game/tick.ts`, which applies the vacation multiplier and `Math.ceil`. The `combat.ts` version is a single-parameter stub that does not apply the vacation modifier.

**Risk:**
If a future developer calls `calcTurnsAfterRegen` from a route expecting full tick logic, they will silently skip the vacation multiplier. No current route calls it.

**Recommendation:**
Add a comment marking it as `// @deprecated — tick system uses calcTurnsToAdd in lib/game/tick.ts` or remove it and update its tests. The function is not wrong — it correctly models the non-vacation case — but the naming ambiguity is a maintenance risk.

**No fix applied** — minor risk, does not affect any live path. Tracked here for the next refactor sprint.

---

## 7. Risk Notes

| Risk | Severity | Notes |
|------|----------|-------|
| `calcTurnsAfterRegen` dead code | Low | No live path uses it |
| P2 non-atomic routes (training/basic, hero spells) | Medium | Race requires same player in two tabs or bot-speed requests. Practical risk is low for single-player actions; documented and tracked |
| P3 non-atomic routes (shop, develop/upgrade) | Medium-Low | Same-player only, no cross-player value transfer |
| P4 tribe spell/create routes | Low | Log integrity / UX only |

---

## 8. Final Checklist

- [x] Every SSOT formula verified against implementation
- [x] All BALANCE constants sourced from `config/balance.config.ts` — no hardcoded numbers
- [x] `validateBalance()` runs at import time
- [x] All 19 DB migrations applied to live DB
- [x] All P1 routes atomic (bank deposit/withdraw, tribe pay-tax, attack, spy, city promote)
- [x] Season freeze guard on all 25 gameplay write routes
- [x] `getServerSession` → 401 gate on all routes
- [x] UI uses `BALANCE.*` constants exclusively — no hardcoded display values
- [x] `applyPatch` + `refresh()` pattern verified in all client files
- [ ] P2 routes (training/basic, hero/buy-spell, hero/activate-shield) — future sprint
- [ ] P3 routes (shop, training/advanced, develop/upgrade) — future sprint
- [ ] P4 routes (tribe spell/create) — future sprint
- [ ] `calcTurnsAfterRegen` dead code cleanup — optional

---

*Audit scope: A-F as specified. All files read directly from source. No assumptions made.*
*Re-run this audit after each atomicity refactor sprint by checking the Playbook §6 and grepping: `rg -n "Promise\.all" app lib`*
