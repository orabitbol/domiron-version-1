# API Regression Checklist

**Last audited:** 2026-03-02
**Audited by:** Claude Code (full read of every route file)
**Total routes:** 37 route handlers across 21 files

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Correct — session check, season guard, Zod validation, correct envelope, no bugs |
| ⚠️ | Style/minor issue — not functionally broken but noted |
| 🐛 | Bug found and **FIXED** |
| 🚧 | Known limitation documented in MEMORY.md |

---

## Auth

### `POST /api/auth/register`
**File:** `app/api/auth/register/route.ts`
**Status:** ✅ (fixed ⚠️)

- No session required (public registration)
- No season freeze guard (intentional — MEMORY.md)
- Zod schema: username, email, password, army_name, race
- Creates all 7 related rows in parallel
- Returns `{ data: { player_id } }` with status 201
- **Fixed:** `.single()` → `.maybeSingle()` for email/username uniqueness checks

### `GET/POST /api/auth/[...nextauth]`
**File:** `app/api/auth/[...nextauth]/route.ts`
**Status:** ✅

- Standard NextAuth route — not custom code
- Handled by NextAuth's `CredentialsProvider`

---

## Player

### `GET /api/player`
**File:** `app/api/player/route.ts`
**Status:** ✅

- Session check ✅
- Returns safe player data (no `password_hash`)
- Explicit column select prevents data leakage
- Uses `.maybeSingle()` for tribe membership (optional)

---

## Bank

### `POST /api/bank/deposit`
**File:** `app/api/bank/deposit/route.ts`
**Status:** ⚠️ envelope inconsistency (not a bug)

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Day-reset happens BEFORE limit check (correct order, bug was previously fixed)
- Returns `{ bank, resources }` flat — **BankClient reads `data.bank`/`data.resources` directly, this works**
- Note: Inconsistent with `{ data: { ... } }` convention used by most other routes

### `POST /api/bank/withdraw`
**File:** `app/api/bank/withdraw/route.ts`
**Status:** ⚠️ envelope inconsistency (not a bug)

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Returns `{ bank, resources }` flat — BankClient reads this correctly

### `POST /api/bank/upgrade`
**File:** `app/api/bank/upgrade/route.ts`
**Status:** ⚠️ envelope inconsistency (not a bug)

- Session check ✅ | Season freeze guard ✅ | No body (no Zod needed)
- Returns `{ bank, resources }` flat — BankClient reads this correctly

---

## Shop

### `POST /api/shop/buy`
**File:** `app/api/shop/buy/route.ts`
**Status:** ⚠️ envelope inconsistency (not a bug)

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Handles attack/defense/spy/scout weapon categories
- Power recalculated after buy ✅
- Returns `{ weapons, resources }` flat — ShopClient reads this correctly

### `POST /api/shop/sell`
**File:** `app/api/shop/sell/route.ts`
**Status:** ⚠️ envelope inconsistency (not a bug)

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Refund calculated at `BALANCE.weapons.sellRefundPercent`
- Power recalculated after sell ✅
- Returns `{ weapons, resources }` flat — ShopClient reads this correctly

---

## Training

### `POST /api/training/basic`
**File:** `app/api/training/basic/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Units: soldier, slave, spy, scout, cavalry, farmer
- Capacity check for combat units (soldiers/spies/scouts only) ✅
- `free_population` deducted for all non-cavalry units ✅
- Cavalry requires existing soldiers (soldierRatio) ✅
- Power recalculated ✅
- Returns `{ data: { army, resources } }` ✅

### `POST /api/training/untrain`
**File:** `app/api/training/untrain/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Cavalry excluded from untrain (permanent upgrade) ✅
- Units go to `free_population` (NOT to slaves) ✅
- Power recalculated ✅
- Returns `{ data: { army, untrainedCount, freePopulationGained } }` ✅

### `POST /api/training/advanced`
**File:** `app/api/training/advanced/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Types: attack, defense, spy, scout
- Cost: `base * (current_level + 1)` (gold + food) ✅
- Power recalculated ✅
- Returns `{ data: { training, resources } }` ✅

---

## Mine

### `POST /api/mine/allocate`
**File:** `app/api/mine/allocate/route.ts`
**Status:** ✅ (fixed ⚠️)

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Invariant: `gold + iron + wood + food <= army.slaves` enforced ✅
- **Fixed:** Added `console.error('Mine/allocate DB error:', updateError)` for diagnostics
- Returns `{ data: { army } }` ✅
- Migration `0005_slave_assignments.sql` applied 2026-03-02 via `npx supabase db push`. Columns confirmed live. ✅

---

## Attack

### `POST /api/attack`
**File:** `app/api/attack/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- ECP-based combat formula (`resolveCombat`) ✅
- Slaves NOT involved in combat (fixed in prior session) ✅
- `slaves_taken: 0` inserted into attacks table ✅
- Loot stolen respects `BALANCE.combat.stealPercent` ✅
- Resource shield protects gold ✅
- Soldier shield protects defender soldiers ✅
- Hero effects applied (ATTACK_POWER, DEFENSE_POWER bonuses) ✅
- Turn cost deducted ✅
- Power recalculated for both attacker and defender ✅
- Returns `{ data: { report, attacker, defender } }` ✅
- Note: `[ATK_DIAG]` diagnostic console.log still present (non-blocking, remove when stable)

---

## Develop

### `POST /api/develop/upgrade`
**File:** `app/api/develop/upgrade/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Fields: gold_level, food_level, wood_level, iron_level, population_level, fortification_level
- Upgrade cost mirrors `DevelopClient.getUpgradeCost` ✅
- Fortification: updates player capacity + recalculates power ✅
- Returns `{ data: { development, resources } }` ✅

### `POST /api/develop/move-city`
**File:** `app/api/develop/move-city/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅ | No body (no Zod needed)
- City cap at 5 enforced ✅
- Promotion requirements from `BALANCE.cities.promotionRequirements` (may be `[TUNE: unassigned]` → skipped) ✅
- Returns `{ data: { city, cityName } }` ✅

---

## Spy

### `GET /api/spy`
**File:** `app/api/spy/route.ts`
**Status:** ✅

- Session check ✅ | No season guard (read-only list)
- Returns same-city players as spy targets
- Returns `{ data: { targets } }` ✅

### `POST /api/spy`
**File:** `app/api/spy/route.ts`
**Status:** ⚠️ envelope inconsistency (not a bug)

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Formula: `spyPower > scoutDefense` → success; else spies caught proportional
- Turn cost paid regardless of outcome ✅
- Spies caught on failure (catchRate × ratio, capped at MAX_CATCH_RATE) ✅
- Full intel revealed on success ✅
- Returns `{ result: { success, spy_power, scout_defense, ... }, turns: newTurns }` — inconsistent with `{ data: {...} }` pattern but SpyClient reads this correctly

---

## History

### `GET /api/history`
**File:** `app/api/history/route.ts`
**Status:** ✅

- Session check ✅
- Returns attacks as both attacker and defender ✅
- No `slaves_taken` in select (removed in prior session) ✅
- Returns `{ data: { as_attacker, as_defender } }` ✅

---

## Rankings

### `GET /api/rankings`
**File:** `app/api/rankings/route.ts`
**Status:** ✅

- Session check ✅
- Returns top 20 players by `rank_global`
- Includes `power_attack, power_defense, power_spy, power_scout, power_total`
- Returns `{ data: { players } }` ✅
- Note: No `tribe_name` included (tribes are a separate ranking endpoint)

### `GET /api/rankings/tribes`
**File:** `app/api/rankings/tribes/route.ts`
**Status:** ✅

- Session check ✅
- Returns tribe rankings
- Returns `{ data: { tribes } }` ✅

---

## Hall of Fame

### `GET /api/halloffame`
**File:** `app/api/halloffame/route.ts`
**Status:** ✅

- No session required (public read)
- Uses `createAdminClient()` for read (consistent with other public routes)
- Throws → 500 if no active season (acceptable since no active season is a server config error)
- Returns `{ data: { players, tribes } }` ✅

---

## Hero

### `GET /api/hero/spell`
**File:** `app/api/hero/spell/route.ts`
**Status:** ⚠️ minor

- Session check ✅
- Uses `createAdminClient()` for a read-only query (could use `createClient()` instead, minor)
- Returns `{ data: { effects } }` ✅

### `POST /api/hero/buy-spell`
**File:** `app/api/hero/buy-spell/route.ts`
**Status:** ✅ (fixed ⚠️)

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- **Fixed:** `.single()` → `.maybeSingle()` for existing spell check
- Mana cost from `BALANCE.hero.SOLDIER_SHIELD_MANA` / `RESOURCE_SHIELD_MANA` ✅
- Returns `{ data: { spell_key, message } }` ✅

### `POST /api/hero/activate-shield`
**File:** `app/api/hero/activate-shield/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Uses `.maybeSingle()` for active spell check ✅
- 23h active + 1h cooldown via `expires_at` ✅
- Returns `{ data: { effect } }` ✅

### `GET /api/hero/shield`
**File:** `app/api/hero/shield/route.ts`
**Status:** ✅

- Session check ✅
- Returns BALANCE config for shield costs (no DB call needed)
- Returns `{ data: { shields: [...] } }` ✅

---

## Tribe

### `POST /api/tribe/create`
**File:** `app/api/tribe/create/route.ts`
**Status:** ✅ (fixed ⚠️)

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- **Fixed:** `.single()` → `.maybeSingle()` for membership and name uniqueness checks
- Leader added as tax-exempt member ✅
- Returns `{ data: { tribe } }` with status 201 ✅

### `POST /api/tribe/join`
**File:** `app/api/tribe/join/route.ts`
**Status:** ✅ (fixed ⚠️)

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- **Fixed:** `.single()` → `.maybeSingle()` for membership check
- Tribe capacity enforced via `BALANCE.clan.maxMembers` ✅
- Returns `{ data: { tribe_id, message } }` ✅

### `POST /api/tribe/join-request`
**File:** `app/api/tribe/join-request/route.ts`
**Status:** ✅ (fixed ⚠️)

- Alias for `/tribe/join` — direct join, no pending state
- **Fixed:** `.single()` → `.maybeSingle()` for membership check
- Returns `{ data: { tribe_id, message } }` ✅

### `POST /api/tribe/accept-member`
**File:** `app/api/tribe/accept-member/route.ts`
**Status:** ✅ (fixed ⚠️)

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Verifies requester is tribe leader ✅
- **Fixed:** `.single()` → `.maybeSingle()` for target membership check
- Tribe capacity enforced ✅
- Returns `{ data: { message } }` ✅

### `POST /api/tribe/leave`
**File:** `app/api/tribe/leave/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅
- Leader cannot leave (must transfer leadership first) ✅
- Returns `{ data: { message } }` ✅

### `POST /api/tribe/kick` / `POST /api/tribe/kick-member`
**File:** `app/api/tribe/kick/route.ts` + `app/api/tribe/kick-member/route.ts`
**Status:** ✅

- `kick` is an alias for `kick-member`
- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Verifies requester is tribe leader ✅
- Cannot kick yourself ✅
- Returns `{ data: { message } }` ✅

### `POST /api/tribe/set-tax`
**File:** `app/api/tribe/set-tax/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Verifies tribe leader via `.single()` on required membership (correct — leader must exist) ✅
- Tax amount validated against `BALANCE.clan.taxLimits` ✅
- Returns `{ data: { tax_amount } }` ✅

### `POST /api/tribe/pay-tax`
**File:** `app/api/tribe/pay-tax/route.ts`
**Status:** ✅ (fixed 🐛)

- Session check ✅ | Season freeze guard ✅
- Tax exempt check ✅ | Already paid today check ✅
- **Fixed:** `mana: tribe.mana + 1` → `mana: tribe.mana + tribe.tax_amount` (was always adding 1 mana regardless of tax paid)
- Returns `{ data: { message, gold_paid, new_gold } }` ✅

### `POST /api/tribe/activate-spell`
**File:** `app/api/tribe/activate-spell/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Verifies tribe leader ✅
- Mana cost checked against `BALANCE.tribe.spells[spell_key].manaCost` ✅
- Cooldown enforced via active spell check ✅
- Returns `{ data: { effect } }` ✅

### `POST /api/tribe/spell`
**File:** `app/api/tribe/spell/route.ts`
**Status:** ✅

- Session check ✅ | Season freeze guard ✅ | Zod validation ✅
- Casts `mass_spy` spell on enemy tribe
- Verifies tribe leader ✅
- Mana deducted + spell logged in `tribe_spells` ✅
- Reveals target tribe's member list on cast ✅
- Returns `{ data: { target_tribe, members, mana_remaining } }` ✅

---

## Admin

### `POST /api/admin/season/reset`
**File:** `app/api/admin/season/reset/route.ts`
**Status:** ✅

- Session check ✅ | Role check (`role === 'admin'`) ✅
- No season freeze guard (intentional — admin only) ✅
- Hard reset: deletes all tables in FK-safe order ✅
- Creates fresh Season 1 ✅
- Returns `{ ok, mode: 'hard_reset', deletedTables, newSeason }` ✅

---

## Tick (Cron)

### `GET /api/tick`
**File:** `app/api/tick/route.ts`
**Status:** ✅

- Protected by `x-cron-secret` header (not session-based) ✅
- No season freeze guard (cron always runs) ✅
- Per-player processing: turns, population growth, slave production (per assignment), hero mana, bank interest ✅
- Slave production uses `slaves_gold/iron/wood/food` assignments ✅
- Tribe mana gain calculated via `calcTribeManaGain` ✅
- Power recalculated for all players ✅
- Rankings (global + per-city) updated ✅
- Realtime broadcast after tick ✅
- Returns `{ data: { processed, duration, timestamp } }` ✅

---

## Summary

### Bugs Fixed in This Audit

| Route | Bug | Fix |
|-------|-----|-----|
| `tribe/pay-tax` | Hardcoded `mana + 1` regardless of `tax_amount` | Changed to `mana + tribe.tax_amount` |
| `mine/allocate` | Missing `console.error(updateError)` — silent failure | Added diagnostic logging |
| `tribe/create` (×2) | `.single()` on optional membership/name checks | Changed to `.maybeSingle()` |
| `tribe/join` | `.single()` on optional membership check | Changed to `.maybeSingle()` |
| `tribe/join-request` | `.single()` on optional membership check | Changed to `.maybeSingle()` |
| `tribe/accept-member` | `.single()` on optional target membership check | Changed to `.maybeSingle()` |
| `hero/buy-spell` | `.single()` on optional spell ownership check | Changed to `.maybeSingle()` |
| `auth/register` (×2) | `.single()` on optional email/username checks | Changed to `.maybeSingle()` |

### Known Limitations (Not Bugs)

| Route | Issue | Status |
|-------|-------|--------|
| `mine/allocate` | Requires migration `0005_slave_assignments.sql` applied to DB | Must apply via `supabase db push` |
| `bank/*` | Flat `{ bank, resources }` envelope (not `{ data: {...} }`) | Compatible with BankClient — not changed |
| `shop/*` | Flat `{ weapons, resources }` envelope | Compatible with ShopClient — not changed |
| `spy` POST | `{ result, turns }` envelope (not `{ data: {...} }`) | Compatible with SpyClient — not changed |
| `halloffame` | Returns 500 if no active season (should return empty) | Acceptable for normal operation |
| `hero/spell` | Uses `createAdminClient()` for a read-only query | Minor; no security impact |
| `attack` | `[ATK_DIAG]` diagnostic logs still present | Remove when combat is stable |

### Routes with No Issues

✅ `/api/auth/[...nextauth]` — NextAuth standard
✅ `/api/player`
✅ `/api/attack`
✅ `/api/training/basic`
✅ `/api/training/untrain`
✅ `/api/training/advanced`
✅ `/api/develop/upgrade`
✅ `/api/develop/move-city`
✅ `/api/spy` (GET)
✅ `/api/history`
✅ `/api/rankings`
✅ `/api/rankings/tribes`
✅ `/api/halloffame`
✅ `/api/hero/activate-shield`
✅ `/api/hero/shield`
✅ `/api/tribe/leave`
✅ `/api/tribe/kick` / `/api/tribe/kick-member`
✅ `/api/tribe/set-tax`
✅ `/api/tribe/activate-spell`
✅ `/api/tribe/spell`
✅ `/api/admin/season/reset`
✅ `/api/tick`
