# Atomicity & Promise.all Playbook

> **Last updated:** 2026-03-05
> **Scope:** `app/api/**`, `lib/**`, `supabase/migrations/**`

---

## 1. Executive Summary

Domiron is an economy game. Every write to gold, soldiers, mana, or bank balance is a game-state mutation that players can observe and exploit if it's inconsistent. A failed half-write (gold debited, unit not granted) is a player-visible bug that erodes trust and can be economically gamed.

**"Atomic" in this codebase** means: all writes for one logical action either all commit or all roll back together — enforced by a single Postgres function wrapped in an implicit transaction (`supabase.rpc(...)`).

**The 3 rules we never break:**
1. Any route that writes to 2+ tables MUST use an RPC unless it qualifies as an approved exception (§8).
2. Any route that moves value between two players, a player and a tribe, or a player and the bank MUST use an RPC with `SELECT … FOR UPDATE` row locks.
3. The UI may apply optimistic patches (`applyPatch`) for responsiveness, but game correctness lives entirely server-side — the DB is always the source of truth.

---

## 2. Definitions

| Term | Meaning in this repo |
|---|---|
| **Single-table write** | One `supabase.from('x').update(...)` — safe, inherently atomic |
| **Multi-table write** | Two or more `.update/.insert/.delete` calls touching different tables in the same request — non-atomic unless wrapped in an RPC |
| **Cross-player transfer** | A write that reads from player A and writes to player B (or tribe, or bank) — race-prone; always requires RPC + FOR UPDATE |
| **TOCTTOU** | Time-of-Check-to-Time-of-Use: reading a balance, then writing a new value in a separate statement. Concurrent requests can both pass the read check before either write commits — enabling double-spends |
| **RPC transaction pattern** | A Postgres function (migration `NNNN_*_apply.sql`) that executes all writes in one implicit `BEGIN/COMMIT`. Called via `supabase.rpc('fn_name', params)`. All existing safe routes use this pattern |

---

## 3. Golden Rules

- **2+ table writes → RPC.** If a route touches more than one table for writes, it belongs in a Postgres function. No exceptions without explicit approval (§8).
- **Cross-player / cross-entity value transfer → RPC + FOR UPDATE.** `tribe/pay-tax` (player gold → tribe gold), `attack`, `spy` — all must lock rows before reading balances.
- **Read-then-write in same request → lock the row.** Any `SELECT … WHERE id=? ` followed by `UPDATE … WHERE id=?` in separate statements is a TOCTTOU race. Use `SELECT … FOR UPDATE` inside the RPC.
- **BALANCE is the only source of numbers.** No hardcoded costs/rates in RPCs or routes. RPCs may read BALANCE-derived values passed as function parameters (validated by the route before calling).
- **Season freeze guard before every write.** All gameplay write routes call `getActiveSeason()` and return `seasonFreezeResponse()` if no active season. RPCs do not need to re-check — the route guards the entry point.
- **Routes always return updated slices.** After any write, the route returns the affected rows so the client can call `applyPatch({ ... })` immediately — no separate polling required.
- **`applyPatch` is optimistic, never authoritative.** It updates local React state for UI responsiveness. The `refresh()` call that follows fetches the server-authoritative snapshot. Never design game logic around what `applyPatch` returns.

---

## 4. Decision Tree

```
Route performs a DB write?
│
├── NO  → Promise.all for parallel reads is fine. Done.
│
└── YES → How many tables are written?
          │
          ├── ONE TABLE → Single .update/.insert is atomic. Allowed as-is.
          │               Still needs: auth, freeze guard, Zod validation.
          │
          └── TWO+ TABLES → Does it transfer value between players/tribe/bank?
                            │
                            ├── YES (cross-entity) → MUST be RPC + FOR UPDATE locks.
                            │                        Flag as P1 if not already.
                            │
                            └── NO (same player only) → Is there concurrency risk?
                                                         (same user in two tabs, bots)
                                                         │
                                                         ├── YES → RPC preferred (P2).
                                                         │         At minimum: read inside
                                                         │         transaction (FOR UPDATE).
                                                         │
                                                         └── LOW → RPC still preferred.
                                                                    Exception allowed only
                                                                    if approved (§8).
```

---

## 5. Checklists

### A — Before merging any route with DB mutations

- [ ] `getServerSession` → 401 if not found
- [ ] `getActiveSeason` → `seasonFreezeResponse()` if no active season (skip for: `auth/register`, `mine/allocate`, admin routes)
- [ ] Zod schema validates all inputs; `safeParse` used, not `parse`
- [ ] List every table written — if 2+ tables, this needs an RPC (or an approved exception in §8)
- [ ] Identify TOCTTOU risk: is there a read-then-write on the same column?
- [ ] Response includes updated slices (`army`, `resources`, `development`, etc.) for `applyPatch`
- [ ] Error path returns a consistent JSON `{ error: string }` with correct HTTP status
- [ ] At least one structural test asserting the route uses `.rpc(...)` and not direct `.update()`/`.insert()` for the critical path

### B — When `Promise.all` is allowed

**Allowed — parallel reads:**
```typescript
// Safe: all reads, no writes
const [{ data: army }, { data: resources }] = await Promise.all([
  supabase.from('army').select('*').eq('player_id', id).single(),
  supabase.from('resources').select('*').eq('player_id', id).single(),
])
```

**Allowed — single-table write + parallel post-write reads:**
```typescript
// Safe: one write, then parallel reads to build response snapshot
await supabase.from('army').update({ soldiers: newCount }).eq('player_id', id)
const [{ data: army }, { data: resources }] = await Promise.all([...reads...])
```

**Not allowed — two writes that must be consistent:**
```typescript
// RISK: gold can vanish if second write fails
await Promise.all([
  supabase.from('resources').update({ gold: gold - cost }),   // ← write 1
  supabase.from('army').update({ soldiers: soldiers + amt }), // ← write 2
])
```

### C — RPC implementation checklist

- [ ] Function name follows `*_apply` convention (e.g., `training_basic_apply`)
- [ ] All parameters are primitive types (int, text, uuid) — no JSON objects passed in
- [ ] Route validates all values via Zod before passing to RPC
- [ ] `SELECT … FOR UPDATE` on every row that will be mutated
- [ ] Post-lock re-validation: re-check balances AFTER locking, not before
- [ ] Returns a JSON snapshot of affected rows (`RETURNS json`)
- [ ] `GRANT EXECUTE ON FUNCTION fn_name TO service_role;` included
- [ ] Error codes returned as `{ "error": "CODE" }` and mapped in the route via a `*_RPC_ERROR_MAP`
- [ ] Migration file named `NNNN_<feature>_rpc.sql` (e.g., `0016_training_basic_rpc.sql`)
- [ ] Old `Promise.all` write block removed from the route after RPC is live
- [ ] Migration is idempotent (`CREATE OR REPLACE FUNCTION`)

### D — Testing checklist

- [ ] **Structural test**: read route source with `fs.readFileSync`, assert `.rpc(` is present, assert direct `.update(` / `.insert(` is absent for the critical write path
- [ ] **Balance test**: assert route uses `BALANCE.*` constants — no hardcoded numbers
- [ ] **Pure-logic test**: simulate the happy path and one failure path (not enough gold, etc.) using a standalone simulation function (no DB, no HTTP)
- [ ] **Monotonicity / invariant test** where applicable (e.g., bank balance cannot go negative after withdraw)
- [ ] Test group naming: `'<RouteName> — <what it enforces>'`

---

## 6. Current State

### P1 Completed — converted to atomic RPC (2026-03-05)

The following routes were in the "Risky — P1" category. All three have been
converted from `Promise.all` multi-write to a single Postgres RPC with
`SELECT … FOR UPDATE` row locks and post-lock re-validation.

**What was wrong:** Each route performed 2–3 separate `.update()` calls
wrapped in `Promise.all`. A crash or timeout between any two writes left
partial state (gold destroyed or created, mana not transferred, tax_paid_today
not set). The pre-write checks were also unguarded — two concurrent requests
could both pass the validation gate before either committed (TOCTTOU), allowing
double-pays, over-limit deposits, and duplicate withdrawals.

**New pattern:** A single `supabase.rpc('*_apply', params)` call invokes a
Postgres function that acquires `SELECT … FOR UPDATE` row locks on all mutated
rows atomically, re-validates all constraints under lock, then applies every
write in one implicit `BEGIN/COMMIT`. Either all writes commit or none do.

| Route | Was | Now | Migration |
|---|---|---|---|
| `POST /api/tribe/pay-tax` | `Promise.all` of 3 `.update()` calls across resources, tribes, tribe_members | `tribe_pay_tax_apply` RPC — locks tribe_members → tribes → resources in consistent order | `0017_tribe_pay_tax_rpc.sql` |
| `POST /api/bank/deposit` | `Promise.all` of 2 `.update()` calls; deposits_today counter unguarded | `bank_deposit_apply` RPC — locks bank + resources via JOIN; day-reset logic inside lock | `0018_bank_deposit_rpc.sql` |
| `POST /api/bank/withdraw` | `Promise.all` of 2 `.update()` calls; balance unguarded against concurrent draws | `bank_withdraw_apply` RPC — locks bank + resources via JOIN; balance re-checked under lock | `0019_bank_withdraw_rpc.sql` |

Tests added: `lib/game/tribe-pay-tax.test.ts`, `lib/game/bank-deposit-withdraw.test.ts`

---

### Already atomic (GOOD)

| Route | Mechanism |
|---|---|
| `POST /api/attack` | `attack_resolve_apply` RPC |
| `POST /api/spy` | `spy_resolve_apply` RPC |
| `POST /api/bank/upgrade` | `bank_interest_upgrade_apply` RPC |
| `POST /api/city/promote` | `city_promote_apply` RPC |
| `POST /api/tribe/pay-tax` | `tribe_pay_tax_apply` RPC (**P1 fixed 2026-03-05**) |
| `POST /api/bank/deposit` | `bank_deposit_apply` RPC (**P1 fixed 2026-03-05**) |
| `POST /api/bank/withdraw` | `bank_withdraw_apply` RPC (**P1 fixed 2026-03-05**) |
| `POST /api/tribe/kick`, `leave`, `kick-member` | Single `.delete()` |
| `POST /api/tribe/join`, `join-request`, `accept-member` | Single `.insert()` |
| `POST /api/tribe/set-tax` | Single `.update()` on `tribes` |
| `POST /api/mine/allocate` | Single `.update()` on `army` |
| `POST /api/training/untrain` | 410 tombstone — no writes |
| `POST /api/develop/move-city` | 410 tombstone — no writes |
| `POST /api/auth/register` | 7-row `Promise.all` insert — approved exception (§8) |
| `GET /api/tick` | Cron-only; 5-table `Promise.all` per player — approved exception (§8) |

### Risky routes

**P1 — Exploitable / cross-entity**

*(All P1 routes resolved as of 2026-03-05)*

**P2 — Same-player race / mana/spell integrity** *(next sprint)*

| Route | File | What can go wrong | Target fix |
|---|---|---|---|
| `hero/buy-spell` | `app/api/hero/buy-spell/route.ts:66` | Mana deducted, spell not stored — or spell gained for free. Double-purchase race possible. | `hero_buy_spell_apply` RPC |
| `hero/activate-shield` | `app/api/hero/activate-shield/route.ts:82` | Same pattern: mana lost, shield effect not inserted. | `hero_activate_shield_apply` RPC |
| `training/basic` | `app/api/training/basic/route.ts:91` | Gold lost, units not granted — or vice versa. | `training_basic_apply` RPC |

**P3 — Degraded UX if partial failure**

| Route | File | What can go wrong | Target fix |
|---|---|---|---|
| `shop/buy` | `app/api/shop/buy/route.ts:125` | Gold lost but weapon not received. | `shop_buy_apply` RPC |
| `shop/sell` | `app/api/shop/sell/route.ts:74` | Weapon gone but gold not returned. | `shop_sell_apply` RPC |
| `training/advanced` | `app/api/training/advanced/route.ts:58` | Resources spent, level not incremented. | `training_advanced_apply` RPC |
| `develop/upgrade` | `app/api/develop/upgrade/route.ts:101` | Resources spent, dev level not incremented. | `develop_upgrade_apply` RPC |

**P4 — Log integrity / low user impact**

| Route | File | What can go wrong | Target fix |
|---|---|---|---|
| `tribe/activate-spell` | `app/api/tribe/activate-spell/route.ts:89` | Mana deducted, spell log not inserted — spell appears re-castable. | `tribe_activate_spell_apply` RPC |
| `tribe/spell` (mass_spy) | `app/api/tribe/spell/route.ts:89` | Same pattern. | Same RPC or extend above |
| `tribe/create` | `app/api/tribe/create/route.ts` | Sequential inserts: tribe row exists with no leader if second insert fails. | Wrap in `tribe_create_apply` RPC or add cleanup in catch |

---

## 7. Coding Patterns

### Good — RPC route pattern (bank upgrade)

```typescript
// app/api/bank/upgrade/route.ts (simplified)
const { data, error } = await supabase.rpc('bank_interest_upgrade_apply', {
  p_player_id:    playerId,
  p_current_level: bank.interest_level,
  p_gold_cost:    cost,
})
if (error) {
  const msg = BANK_UPGRADE_RPC_ERROR_MAP[data?.error] ?? 'Upgrade failed'
  return NextResponse.json({ error: msg }, { status: 400 })
}
return NextResponse.json({ data: { bank: data.bank, resources: data.resources } })
```

```sql
-- supabase/migrations/0015_bank_upgrade_rpc.sql (simplified)
CREATE OR REPLACE FUNCTION bank_interest_upgrade_apply(
  p_player_id uuid, p_current_level int, p_gold_cost int
) RETURNS json AS $$
DECLARE
  r_resources resources%ROWTYPE;
  r_bank      bank%ROWTYPE;
BEGIN
  SELECT * INTO r_resources FROM resources WHERE player_id = p_player_id FOR UPDATE;
  IF r_resources.gold < p_gold_cost THEN
    RETURN json_build_object('error', 'NOT_ENOUGH_GOLD');
  END IF;
  UPDATE resources SET gold = gold - p_gold_cost WHERE player_id = p_player_id
    RETURNING * INTO r_resources;
  UPDATE bank SET interest_level = interest_level + 1 WHERE player_id = p_player_id
    RETURNING * INTO r_bank;
  RETURN json_build_object('bank', row_to_json(r_bank), 'resources', row_to_json(r_resources));
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION bank_interest_upgrade_apply TO service_role;
```

### Bad — Promise.all multi-write (bank deposit, current state)

```typescript
// app/api/bank/deposit/route.ts:61 — RISK
await Promise.all([
  supabase.from('resources').update({ gold: resources.gold - amount, updated_at: now })
    .eq('player_id', playerId),
  supabase.from('bank').update({ balance: bank.balance + amount, updated_at: now })
    .eq('player_id', playerId),
])
// If the second write fails: gold is gone, bank balance unchanged.
// If the first write fails: bank balance grows, gold stays — free money.
```

---

## 8. Exceptions

The following patterns are **intentionally non-atomic** and are approved as exceptions. Each must include a comment in the code explaining the justification.

| Route | Pattern | Justification | Monitoring |
|---|---|---|---|
| `auth/register` | `Promise.all` of 7 inserts for a new player | Player record does not exist yet — no concurrent mutation possible. Partial failure is recoverable: re-registration cleans up via unique constraints. | Registration error rate alert |
| `tick` (cron) | `Promise.all` of 5 updates per player | No concurrent user request; cron is single-tenant. Partial failures are logged per-player and surfaced in `[TICK] UPDATE ERRORS` logs. Tick resumes next 30-min window. | Tick error logs in Vercel |

**Any new exception must:**
1. Be documented here with justification.
2. Include a `// ATOMICITY-EXCEPTION: <reason>` comment at the write site.
3. Have a follow-up ticket to revisit if the route becomes higher-risk (e.g., admin-accessible, replay-able).

---

*This playbook reflects the state of the codebase as of 2026-03-05. Re-run the scan (`rg -n "Promise\.all" app lib`) and update §6 after each refactor sprint.*
