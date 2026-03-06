# Domiron v5 — Game Mechanics: Single Source of Truth

**Generated:** 2026-03-04
**Last updated:** 2026-03-06 — (1) Spy intel expanded with bank/weapons/training fields. (2) Tribe V1 hardened: role system (`leader`/`deputy`/`member`), automated daily tax via `/api/tribe/tax-collect` cron (hourly `0 * * * *`, collects at 20:00 Israel time), mana contribution RPC, all management routes use atomic RPCs. Legacy spell keys `combat_boost` and `mass_spy` removed. V1 spells: `war_cry`, `tribe_shield`, `production_blessing`, `spy_veil`, `battle_supply`. Tax goes to leader personal gold (no tribe treasury). Deputy cap (3) enforced by `tribe_set_member_role_apply` RPC. Leader invariant enforced by leave/disband/transfer-leadership routes. (3) Pass 2 hardening: tax RPC deterministic UUID-ordered locking, leader resources existence check, `p_amount > 0` guard in mana RPC, partial unique index `uidx_tribe_one_leader`. (4) Tribe page simplified to 4-tab UI (Overview / Members / Spells / Chat): Requests tab removed (open-join, no request flow), Chat tab added (non-realtime: lazy fetch + optimistic send + manual refresh button). Leadership transfer moved to explicit modal flow (deputies only). Member actions replaced with "Manage ▾" portal dropdown (React Portal, immune to overflow-hidden clipping). Leave/Disband/Transfer now use Modal component. Tribute panel redesigned as prominent amber block. Tax schedule verified: `0 * * * *` cron, collects once daily at 20:00 Israel time, idempotent via `last_tax_collected_date`. (5) Tick cron corrected to `*/30 * * * *` (every 30 minutes). Tribe chat is NOT realtime — no Supabase realtime subscription, no publication setup.
**Status:** Authoritative. Every statement is backed by a code reference. Anything unverified is explicitly marked.

---

## Source Files (ground truth)

| Role | File |
|---|---|
| All game constants | `config/balance.config.ts` |
| Combat engine (pure) | `lib/game/combat.ts` |
| Tick calculations (pure) | `lib/game/tick.ts` |
| Stored power calc | `lib/game/power.ts` |
| Hero effect system | `lib/game/hero-effects.ts` |
| Season management | `lib/game/season.ts` |
| Catch-up multiplier | `lib/utils.ts` → `getCatchUpMultiplier()` |
| Combat resolution API | `app/api/attack/route.ts` |
| Spy mission API | `app/api/spy/route.ts` |
| Tick cron handler | `app/api/tick/route.ts` |
| Tick status (server clock) | `app/api/tick-status/route.ts` |
| Dev auto-tick scheduler | `instrumentation.ts` |
| Supabase server clients | `lib/supabase/server.ts` |
| Countdown hook (shared) | `lib/hooks/useTickCountdown.ts` → `useTickCountdown()` |
| Countdown UI — desktop | `components/layout/Sidebar.tsx` → `TickCountdown` |
| Countdown UI — mobile | `components/game/ResourceBar.tsx` → `MobileTickCountdown` |
| Registration | `app/api/auth/register/route.ts` |
| DB schema | `supabase/migrations/0001_initial.sql` |
| World-state timer seed | `supabase/migrations/0008_world_state.sql` |
| Farmer unit removal | `supabase/migrations/0009_remove_farmer.sql` |

---

## Table of Contents

1. [Tick System](#1-tick-system)
2. [Resource Production](#2-resource-production)
3. [Population System](#3-population-system)
4. [Training System](#4-training-system)
5. [Combat System — Personal Power (PP)](#5-combat-system--personal-power-pp)
6. [Combat System — Effective Combat Power (ECP)](#6-combat-system--effective-combat-power-ecp)
7. [Combat System — Resolution](#7-combat-system--resolution)
8. [Spy System](#8-spy-system)
9. [Hero Effect System](#9-hero-effect-system)
10. [Clan / Tribe System](#10-clan--tribe-system)
11. [Bank System](#11-bank-system)
12. [Weapons System](#12-weapons-system)
13. [Development Upgrades](#13-development-upgrades)
14. [City System & Progression](#14-city-system--progression)
15. [Season System & Freeze Mode](#15-season-system--freeze-mode)
16. [Catch-Up Multiplier (Late Join)](#16-catch-up-multiplier-late-join)
17. [Stored Power vs. Combat PP](#17-stored-power-vs-combat-pp)
18. [Race Bonuses](#18-race-bonuses)
19. [VIP System](#19-vip-system)
20. [Registration Flow](#20-registration-flow)
21. [Rankings](#21-rankings)
22. [Known Gaps / Inconsistencies / Missing / Tuning Needed](#22-known-gaps--inconsistencies--missing--tuning-needed)
23. [Recent Changes](#23-recent-changes)
24. [Missing From Documentation](#24-missing-from-documentation)
25. [UI Update Rules (Immediate vs Tick-only)](#25-ui-update-rules-immediate-vs-tick-only)
26. [Rate Limiting](#26-rate-limiting)

---

## 1. Tick System

**Trigger:** Vercel Cron — `POST /api/tick` every 30 minutes (`*/30 * * * *`), authenticated via `x-cron-secret` header.
**Files:** `lib/game/tick.ts` → `calcTurnsToAdd()`, `app/api/tick/route.ts`

### Turn Regen

```
if currentTurns >= MAX_TURNS:
    return MAX_TURNS  (no change — already capped)

if isVacation:
    toAdd = ceil(turnsPerTick × vacationTurnsMultiplier)
            = ceil(3 × 0.33) = 1
else:
    toAdd = turnsPerTick = 3

newTurns = min(currentTurns + toAdd, MAX_TURNS)
```

| Constant | Value | Annotation |
|---|---|---|
| `tick.turnsPerTick` | 3 | [FIXED] |
| `tick.maxTurns` | 200 | [FIXED] |
| `season.vacationTurnsMultiplier` | 0.33 | [TUNE] |
| Effective vacation regen | 1 turn/tick | Derived: ceil(3×0.33)=1 |

**DB:** `players.turns`, `players.is_vacation`
**Route:** `app/api/tick/route.ts` line 69

> ✅ **[RESOLVED — Audit #4]** `players.max_turns` DB column is **dead/legacy**. It is never SELECTed in any route or query and must not be used for any gameplay logic. `BALANCE.tick.maxTurns = 200` is the single source of truth for the turn cap, enforced by `calcTurnsToAdd()` in `lib/game/tick.ts`. The DB column is retained in the schema but marked `@deprecated` in `types/game.ts`. Structural regression guard: `lib/game/max-turns-audit.test.ts`.

### Tick Processing Order

Pre-loop (batch fetches):
- Batch-fetch all active `player_hero_effects` (slave bonuses) → grouped by `player_id`
- Batch-fetch active `tribe_spells` with `spell_key = 'production_blessing'` → `Set<tribe_id>`

Per player (sequential in loop, per-player writes parallel):

1. Turns → `calcTurnsToAdd(player.turns, player.is_vacation)`
2. Population growth → `calcPopulationGrowth(dev.population_level, player.vip_until)`
3. Slave production per resource:
   - Compute `slaveBonus` from active hero effects (`calcActiveHeroEffects`)
   - Compute `raceGoldBonus` from `player.race` (human/dwarf get gold bonus)
   - Compute `tribeProdMult` from tribe production_blessing spell (1.20 if active, else 1.0)
   - 4× `calcSlaveProduction(slaves_X, dev.X_level, city, vip_until, raceGoldBonus, slaveBonus)`
   - Final: `floor(rawProduction × tribeProdMult)`
4. Hero mana → `calcHeroManaGain(hero.level, player.vip_until)`
5. Bank interest (only when calendar day changes) → `calcBankInterest(balance, interest_level, vip_until)`

Then globally:

6. Tribe mana per tribe → `calcTribeManaGain(memberCount)`
7. Power recalculation → `recalculatePower(playerId, supabase)` for all players
8. Rankings update (global + per-city)
9. Tribe power aggregation → `tribes.power_total` = sum of member `power_total` values
10. **`world_state` upsert** — `next_tick_at = tickDoneAt + TICK_INTERVAL_MINUTES` (`app/api/tick/route.ts` ~line 347)
11. Realtime broadcast — `broadcastTickCompleted(supabase, nextTickAt)` includes `next_tick_at` in payload

---

### Server-Authoritative Countdown (Local Dev + Production)

**Summary:** Every client reads `world_state.next_tick_at` (single DB row, `id=1`) to drive the Sidebar countdown. The tick route advances this value after each tick completes. In production, Vercel Cron triggers the tick. In local dev, `instrumentation.ts` runs a Node.js `setInterval` that calls the same endpoint.

**DB table:** `supabase/migrations/0008_world_state.sql`
```sql
CREATE TABLE world_state (
  id           INT PRIMARY KEY DEFAULT 1,
  next_tick_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT world_state_single_row CHECK (id = 1)
);
INSERT INTO world_state (id, next_tick_at) VALUES (1, now());
ALTER TABLE world_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "world_state_select_public" ON world_state FOR SELECT USING (true);
```
The seed value (`now()` at migration time) becomes immediately stale, which is why the tick must run within the first minute of any dev session.

---

#### Root Cause Analysis — Why the countdown was stuck at 00:00 (all 4 bugs, in discovery order)

**Bug 1 — `next.config.mjs` missing `instrumentationHook` flag**
- **File:** `next.config.mjs`
- **Symptom:** No `[INSTRUMENTATION]` log ever appeared in the terminal. `instrumentation.ts:register()` was never called.
- **Root cause:** Next.js 14.x requires `experimental: { instrumentationHook: true }` to activate `instrumentation.ts`. This flag was removed only in Next.js 15. Without it, the file is silently ignored.
- **Fix:**
  ```js
  // next.config.mjs
  const nextConfig = {
    experimental: {
      instrumentationHook: true,  // required for Next.js 14; not needed in Next.js 15+
    },
  }
  ```

**Bug 2 — `instrumentation.ts` guard exited early on `NEXT_RUNTIME = undefined`**
- **File:** `instrumentation.ts` line 29 (pre-fix)
- **Symptom:** Even after enabling the hook, `register()` was called but exited before starting the interval. Visible in logs as `[INSTRUMENTATION] register() … NEXT_RUNTIME="undefined"` with no scheduler armed log.
- **Root cause:** The guard was `if (process.env.NEXT_RUNTIME !== 'nodejs') return`. In Next.js 14 dev, the Node.js server invocation has `NEXT_RUNTIME = undefined` (not `'nodejs'`). So `undefined !== 'nodejs'` evaluated `true` and the function returned immediately.
- **Fix:**
  ```ts
  // instrumentation.ts
  // WRONG: if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // CORRECT: skip only the Edge runtime; allow undefined (= Node.js dev) through
  if (process.env.NEXT_RUNTIME === 'edge') return
  ```

**Bug 3 — `world_state` UPDATE silently matched 0 rows**
- **File:** `app/api/tick/route.ts` ~line 349 (pre-fix)
- **Symptom:** `[TICK] world_state updated` log appeared but `/api/tick-status` still returned the stale seeded timestamp.
- **Root cause:** Supabase `.update().eq('id', 1)` returns `{ data: [], error: null }` when 0 rows match. The code checked `if (wsError)` — which was `null` — and logged success. But the row was not updated. (Cause of 0-row match was the stale seeded row existing but the UPDATE being silently no-op'd before the upsert fix was applied.)
- **Fix:** Replace `update()` with `upsert()` + `.select()` to confirm the persisted value:
  ```ts
  // app/api/tick/route.ts
  const { data: wsData, error: wsError } = await supabase
    .from('world_state')
    .upsert({ id: 1, next_tick_at: nextTickAt })
    .select('next_tick_at')
  // wsData[0].next_tick_at is the confirmed DB value — log both sent and confirmed
  const confirmedAt = wsData?.[0]?.next_tick_at ?? '(no row returned)'
  console.log(`[TICK] world_state OK: sent=${nextTickAt} confirmed=${confirmedAt} diffSec=${diffSec}`)
  ```
  > **Note:** `sent` ends in `Z` and `confirmed` ends in `+00:00` — Supabase normalises `TIMESTAMPTZ` to `+00:00` in the response. These are the same UTC instant and the MISMATCH log is a false positive.

**Bug 4 — Next.js 14 fetch cache served stale DB values from `/api/tick-status`**
- **Files:** `lib/supabase/server.ts`, `app/api/tick-status/route.ts`
- **Symptom:** Supabase DB confirmed (via direct REST call) that `next_tick_at` was in the future, but `/api/tick-status` still returned the 10-hour-old seeded value.
- **Root cause:** Next.js 14 patches the global `fetch` and caches responses by default. `export const dynamic = 'force-dynamic'` prevents the _route response_ from being cached but does **not** prevent Next.js from caching the individual `fetch()` calls made by the Supabase client internally. The Supabase `createServerClient` uses `fetch` for all DB requests, so the `world_state` SELECT was served from the Next.js fetch cache.
- **Fix 1 — `lib/supabase/server.ts`:** Pass `cache: 'no-store'` in the global fetch override so every Supabase HTTP call from `createAdminClient()` bypasses the cache:
  ```ts
  export function createAdminClient() {
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        global: {
          fetch: (url: RequestInfo | URL, init?: RequestInit) =>
            fetch(url, { ...init, cache: 'no-store' }),
        },
        cookies: { getAll() { return [] }, setAll() {} },
      }
    )
  }
  ```
- **Fix 2 — `app/api/tick-status/route.ts`:** Belt-and-suspenders: call `noStore()` at request time:
  ```ts
  import { unstable_noStore as noStore } from 'next/cache'
  export const dynamic = 'force-dynamic'

  export async function GET() {
    noStore()
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('world_state').select('next_tick_at').eq('id', 1).maybeSingle()
    return NextResponse.json({
      server_now:   new Date().toISOString(),
      next_tick_at: data?.next_tick_at ?? null,
    })
  }
  ```

---

#### `instrumentation.ts` — Dev Auto-Tick Scheduler

**File:** `instrumentation.ts` (project root)
**Purpose:** In local dev, Vercel Cron never fires. This file registers a Node.js `setInterval` at server startup that calls `GET /api/tick` with the `x-cron-secret` header, exactly as Vercel Cron does in production.

**Guard logic (in order):**
```ts
export async function register() {
  console.log(`[INSTRUMENTATION] register() called — NEXT_RUNTIME="${process.env.NEXT_RUNTIME}" …`)
  if (process.env.NODE_ENV !== 'development') return      // Never run in production
  if (process.env.NEXT_RUNTIME === 'edge') return         // Skip Edge runtime (no setInterval)
  // NEXT_RUNTIME === undefined → Node.js dev → continue
  // NEXT_RUNTIME === 'nodejs'  → Node.js   → continue
  if (devCronStarted) return                              // HMR guard — only one interval
  devCronStarted = true
```

**Interval parsing — rejects empty string:**
```ts
const rawInterval = Number(process.env.TICK_INTERVAL_MINUTES)
const intervalMinutes =
  Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 30
// Number("") = 0 → isFinite(0) = true BUT 0 > 0 = false → falls back to 30
// Number(undefined) = NaN → isFinite(NaN) = false → falls back to 30
// Number("1") = 1 → isFinite(1) = true AND 1 > 0 = true → uses 1
```

**Tick call:**
```ts
const res = await fetch(`http://localhost:${port}/api/tick`, {
  headers: { 'x-cron-secret': secret }
})
// Logs every attempt: [DEV CRON] → calling http://localhost:3000/api/tick at <ISO>
// Logs result:        [DEV CRON] Tick OK (HTTP 200): {"data":{...}}
//                     [DEV CRON] Tick HTTP 401: {"error":"Unauthorized"}
```

**First tick delay:** 3 seconds after server startup (so Next.js dev server finishes booting before the first fetch).

---

#### `/api/tick-status` — Public Clock Endpoint

**File:** `app/api/tick-status/route.ts`
**Auth:** None (public, unauthenticated).
**Response:**
```json
{ "server_now": "2026-03-05T07:22:29.220Z", "next_tick_at": "2026-03-05T07:22:51.863+00:00" }
```
`next_tick_at > server_now` = timer is live and counting down.
`next_tick_at < server_now` = tick has not run yet or world_state update failed.

---

#### `TickCountdown` UI Component — How It Works

**File:** `components/layout/Sidebar.tsx` → `function TickCountdown()`

| Mechanism | Detail |
|---|---|
| Mount | Fetches `/api/tick-status`, sets `nextTickAt` state |
| Heartbeat | Re-fetches every 5 minutes (drift correction) |
| Realtime update | Listens for `window.CustomEvent('domiron:tick-completed')`, dispatched by `RealtimeSync` when the Supabase Realtime broadcast arrives |
| Countdown | `setInterval(1000)`: computes `new Date(nextTickAt).getTime() - Date.now()` |
| Overdue polling | When `ms ≤ 0`: starts a 5-second poll of `/api/tick-status` until `next_tick_at` advances |
| Dev debug label | `(Ns)` shown next to timer, hover tooltip shows `server_now / next_tick_at / diff` |
| Dev console logs | On each `/api/tick-status` response: `server_now`, `next_tick_at`, `parsed toString()`, `isNaN?`, `diff ms FUTURE ✓ / PAST ✗` |

**Parsing:** `new Date(nextTickAt).getTime()` — handles both `Z` and `+00:00` suffixes correctly. If `isNaN` appears in browser console, the server returned a malformed timestamp.

**Two-tab consistency:** Both tabs read the same `world_state.next_tick_at` row and both update via the same Supabase Realtime broadcast → identical countdown on all clients.

---

#### Tick Interval — Single Source of Truth (End-to-End)

The following describes exactly how the tick interval flows from config to DB to UI. Every layer must be consistent with every other.

| Layer | Location | Value | Notes |
|---|---|---|---|
| Canonical interval | `BALANCE.tick.intervalMinutes` | `30` | **The SSOT.** All other layers derive from this. |
| Vercel Cron schedule | `vercel.json` → `"*/30 * * * *"` | 30 min | Fires the GET /api/tick handler in production. Must always match `BALANCE.tick.intervalMinutes`. **Never change this for local testing.** |
| Dev auto-tick | `instrumentation.ts` → `setInterval(intervalMs)` | env var or 30 | Only runs in `NODE_ENV=development`. Reads `TICK_INTERVAL_MINUTES` env var, falls back to 30. In dev you can set `TICK_INTERVAL_MINUTES=1` for faster iteration. |
| Tick route interval | `app/api/tick/route.ts` → `TICK_INTERVAL_MINUTES` const | 30 in prod | **Production: always `BALANCE.tick.intervalMinutes`, env var ignored.** Dev: reads env var. |
| DB timestamp | `world_state.next_tick_at` | ISO timestamp | Set by tick route: `tickDoneAt + TICK_INTERVAL_MINUTES * 60_000`. In production this is always +30 min. |
| Server API | `GET /api/tick-status` | `{ server_now, next_tick_at }` | Reads `world_state` row. `force-dynamic` + `noStore()` prevents caching. |
| Client hook | `useTickCountdown()` | `ms` until next tick | Syncs from `/api/tick-status` on mount, every 5 min (heartbeat), and on Realtime broadcast. Falls back to `getTimeUntilNextTick()` (local clock, :00/:30 assumption) only when server returns `null`. |
| Display | `TickCountdown` (Sidebar) / `MobileTickCountdown` (ResourceBar) | `mm:ss` | Both use `useTickCountdown()`. Show `--:--` before first sync. |

**What was wrong (Bug 5):** If `TICK_INTERVAL_MINUTES=1` was set in Vercel env vars (leftover from debug session), the tick route wrote `next_tick_at = now + 1 min` while Vercel Cron fires every 30 min. Countdown showed 1 minute, hit 00:00, stayed stuck for 29 minutes.

**Fix:** In production (`NODE_ENV !== 'development'`), `TICK_INTERVAL_MINUTES` env var is completely ignored — the IIFE always returns `BALANCE.tick.intervalMinutes`. See `app/api/tick/route.ts`.

---

#### How to Verify the Full Tick Pipeline

**Required `.env` values:**
```
CRON_SECRET=<any non-empty string, must match between .env and Supabase>
SUPABASE_SERVICE_ROLE_KEY=<set>
TICK_INTERVAL_MINUTES=1    # Development only — omit for 30-min cadence.
                           # NEVER set this on Vercel; production ignores it (Bug 5 fix).
TICK_DEBUG=1               # Verbose per-player logs
```

**Start dev server:** `npm run dev`

**Expected terminal output (within 5 seconds):**
```
[INSTRUMENTATION] register() called — NEXT_RUNTIME="undefined" NODE_ENV="development"
[DEV CRON] Scheduler armed — interval=30min url=http://localhost:3000/api/tick
[DEV CRON] Auto-tick STARTED (every 30 min / 1800s)
[DEV CRON] → calling http://localhost:3000/api/tick at 2026-…
[TICK] auth=ok — tick starting at 2026-…
[TICK] playersFound=7
[TICK] Processing 7 player(s) at 2026-…
[TICK] player[0]=<id> turns: X→Y gold: A→B(+N) freePop: C→D
[TICK] world_state OK: sent=2026-…Z confirmed=2026-…+00:00 diffSec=1800
[TICK] Completed: 7 player(s) in Xms — next tick at 2026-…
[DEV CRON] Tick OK (HTTP 200): {"data":{"processed":7,…}}
```

If `playersFound=0`, the log immediately after diagnoses it:
```
[TICK] Raw players table count (no joins): N
# If N > 0: a player is missing army/development/hero/bank/or resources row (!inner join excluded them)
# If N = 0: players table is empty
```

**API verification:**
```bash
curl http://localhost:3000/api/tick-status
# Expected: { "server_now": "…Z", "next_tick_at": "…+00:00" }
# next_tick_at must be AFTER server_now
```

**Browser console verification (open any game page):**
```
[TickCountdown] server_now  2026-…Z
[TickCountdown] next_tick_at  2026-…+00:00
[TickCountdown] parsed toString()  Thu Mar 05 2026 …
[TickCountdown] isNaN?  false
[TickCountdown] diff ms  57234  FUTURE ✓
```

**To use a faster local dev cadence (1-minute ticks):**
1. In `.env`: set `TICK_INTERVAL_MINUTES=1`
2. Production `vercel.json` remains `*/30 * * * *` — do **not** change.
3. Do **not** set `TICK_INTERVAL_MINUTES` on Vercel — production ignores it by design (see Bug 5).

---

## 2. Resource Production

**Files:** `lib/game/tick.ts` → `calcSlaveProduction()`, `app/api/tick/route.ts`

### Slave Production Formula

Each slave must be manually assigned to a resource type via `/api/mine/allocate`. Unassigned slaves produce nothing.

```
devOffset = (devLevel - 1) × 0.5

rateMin = (baseMin + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)
rateMax = (baseMax + devOffset) × cityMult × vipMult × (1 + raceGoldBonus) × (1 + slaveBonus)

produced = random integer in [floor(slavesAllocated × rateMin), floor(slavesAllocated × rateMax)]
```

Random value in the tick route:
```
goldGained = floor(goldProd.min + random() × (goldProd.max - goldProd.min))
```

| Constant | Value | Annotation |
|---|---|---|
| `production.baseMin` | 1.0 | [TUNE] |
| `production.baseMax` | 3.0 | [TUNE] |
| `production.DEV_OFFSET_PER_LEVEL` | +0.5 | [TUNE] — sourced from `config/balance.config.ts` |
| `cities.slaveProductionMultByCity[1]` | 1.0 | [TUNE] |
| `cities.slaveProductionMultByCity[2]` | 1.3 | [TUNE] |
| `cities.slaveProductionMultByCity[3]` | 1.7 | [TUNE] |
| `cities.slaveProductionMultByCity[4]` | 2.2 | [TUNE] |
| `cities.slaveProductionMultByCity[5]` | 3.0 | [TUNE] |

**DB columns involved:** `army.slaves_gold`, `army.slaves_iron`, `army.slaves_wood`, `army.slaves_food`
**Allocation route:** `POST /api/mine/allocate`
**Constraint:** `slaves_gold + slaves_iron + slaves_wood + slaves_food ≤ army.slaves`

### Hero Slave Bonus

Batch-fetched per tick. `slaveBonus` = `totalSlaveBonus` from `calcActiveHeroEffects()` (0.0–0.50).
Applied as `(1 + slaveBonus)` inside `calcSlaveProduction()`. Source: `app/api/tick/route.ts`.

### Race Gold Bonus

Applied only to gold production. `raceGoldBonus`:
- `human`: `BALANCE.raceBonuses.human.goldProductionBonus` = 0.15
- `dwarf`: `BALANCE.raceBonuses.dwarf.goldProductionBonus` = 0.03
- others: 0

Gold: `calcSlaveProduction(slaves_gold, ..., raceGoldBonus, slaveBonus)`
Iron/Wood/Food: `calcSlaveProduction(..., 0, slaveBonus)` — no race bonus.

### Tribe Production Blessing

`production_blessing` spell active for player's tribe → `tribeProdMult = 1.20` applied after production:
```
goldGained = floor(rawGoldGained × tribeProdMult)
```

`BALANCE.tribe.spellEffects.production_blessing.productionMultiplier = 1.20` [TUNE]

---

## 3. Population System

**Files:** `lib/game/tick.ts` → `calcPopulationGrowth()`, `app/api/training/train/route.ts`

### Growth Formula

```
base = BALANCE.training.populationPerTick[populationLevel]  // lookup table
vipMult = isVipActive(vip_until) ? 1.10 : 1.0
newPop = floor(base × vipMult)
```

Population Growth Table:

| Level | Base pop/tick |
|---|---|
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 8 |
| 7 | 10 |
| 8 | 14 |
| 9 | 18 |
| 10 | 23 |

Source: `config/balance.config.ts` `training.populationPerTick`

**DB:** `army.free_population`, `development.population_level`

### Starting Population

New players begin with `free_population = 50`.
Source: `BALANCE.startingResources.startingPopulation = 50`, set in `app/api/auth/register/route.ts:104`.

### Population Consumption / Return

| Action | free_population effect |
|---|---|
| Train soldier | −amount |
| Train slave | −amount |
| Train spy | −amount |
| Train scout | −amount |
| Train cavalry | −(amount × 5) (popCost = 5 per cavalry) |
| Any untrain | **not supported — training is irreversible** |
| Combat losses | **no change** (soldiers lost ≠ population returned) |

Source: `app/api/training/basic/route.ts`

---

## 4. Training System

**Files:** `app/api/training/basic/route.ts`, `app/api/training/advanced/route.ts`
**Balance:** `config/balance.config.ts` → `BALANCE.training`

> **Training is irreversible.** All unit conversions (Free Population → Soldier / Spy / Scout / Cavalry / Slave) are one-way. There is no untrain mechanic for any unit type. `POST /api/training/untrain` returns **410 Gone**.
>
> **Slaves** are a workforce unit. Unallocated slaves produce nothing. Allocate them via `POST /api/mine/allocate` to assign them to gold/iron/wood/food production.

### Unit Costs

| Unit | Gold cost | Population cost | Special requirement |
|---|---|---|---|
| soldier | 60 | 1 free_pop | — |
| slave | 0 | 1 free_pop | — |
| spy | 80 | 1 free_pop | — |
| scout | 80 | 1 free_pop | — |
| cavalry | 200 | **5 free_pop per cavalry** (`popCost = 5`) | `BALANCE.training.enableCavalry = true` |

Source: `BALANCE.training.unitCost`

### No Unit Cap — Training Gates Only

There is **no capacity cap** on any unit type. The old `players.capacity` DB column is legacy and is not used in any training gate. Training is gated only by:

1. Gold sufficiency
2. Free population (all units consume free_pop; cavalry costs 5 free_pop each via `popCost`)

`players.capacity` column remains in DB for historical reference — not read, not written by any route.

### Gate Order (train route)

1. Auth check → 401
2. Season freeze check → 423
3. Input validation (unit, amount ≥ 1)
4. Fetch army + resources
5. Cavalry feature-flag check: if `unit='cavalry'` and `!BALANCE.training.enableCavalry` → 400 `'Cavalry is disabled'`
6. Gold sufficiency check
7. Population check: cavalry needs `amount × popCost (5)` free_pop; others need `amount` free_pop
8. DB writes: resources (deduct gold), army (add unit, deduct free_pop)
9. Recalculate power

### Cavalry Feature Toggle

```typescript
BALANCE.training.enableCavalry: boolean  // default: true
```

**When `true`** (default): cavalry training works normally.

**When `false`**:
- `POST /api/training/basic` with `unit='cavalry'` → 400 `{ error: 'Cavalry is disabled' }`
- TrainingClient hides the cavalry row from Train tab and Army overview
- No crashes for players with existing cavalry in DB — cavalry still counts in power, it's just not trainable
- No DB migration needed — toggle is purely in-memory config

**To disable cavalry:** set `BALANCE.training.enableCavalry = false` in `config/balance.config.ts`. **Single place, no other changes needed.**

Source: `config/balance.config.ts` → `training.enableCavalry`; validated by `lib/game/balance-validate.ts`

### Advanced Training (Skills)

Skills: `attack_level`, `defense_level`, `spy_level`, `scout_level` (all in `training` table).

Cost per level-up: `{ gold: 300, food: 300 }`
Effect: `multiplier = 1 + level × 0.08` applied to the relevant power calculation.

Source: `BALANCE.training.advancedCost`, `BALANCE.training.advancedMultiplierPerLevel = 0.08`

---

## 5. Combat System — Personal Power (PP)

**File:** `lib/game/combat.ts` → `calculatePersonalPower()`

### Formula

```
PP = floor(
    soldierScore × W_SOLDIERS      (1.0)
  + equipScore   × W_EQUIPMENT     (1.0)
  + skillScore   × W_SKILLS        (1.0)
  + min(devScore, DEV_CAP) × W_DEV (1.0)
  + spyScore     × W_SPY           (1.0)
)
```

All component weights = 1.0 ([TUNE: placeholder] — intended distribution is soldiers ~45%, equipment ~25%, skills ~15%, dev ~10%, spy ~5%).

### Sub-Scores

**SoldierScore:**
```
TierValue[tier] = SOLDIER_V × SOLDIER_K ^ (tier − 1)
SoldierScore = Σ Count[tier] × TierValue[tier]

Tier 1 (soldiers):  1 × 3^0 = 1 PP each
Tier 2 (cavalry):   1 × 3^1 = 3 PP each
```

Constants: `SOLDIER_V = 1` [TUNE: placeholder], `SOLDIER_K = 3` [TUNE: placeholder]

**EquipScore:** Defined below in §12.

**SkillScore:**
```
SkillScore = attack_level × 100
           + defense_level × 100
           + spy_level × 80
           + scout_level × 80
```

**DevScore:**
```
DevScore = gold_level × 50 + food_level × 50 + wood_level × 50
         + iron_level × 50 + population_level × 75 + fortification_level × 100
DevScoreCapped = min(DevScore, 10,000)
```

**SpyScore:**
```
SpyScore = spies × 5 + scouts × 5
```

### What Triggers PP Recalculation

PP recalculates (via `recalculatePower()`) after:
- Soldier count changes (train or combat losses) or cavalry count changes (train only — cavalry are never lost in combat)
- Equipment changes (buy, sell)
- Skill level changes (advanced training)
- Fortification level changes (development upgrade)
- Every tick (global recalc for all players)

PP does **not** recalculate on: clan join/leave, hero activation, resource changes, city migration alone.

---

## 6. Combat System — Effective Combat Power (ECP)

**File:** `lib/game/combat.ts` → `calculateECP()`, `calculateClanBonus()`

### Clan Bonus

```
efficiencyRate = CLAN.EFFICIENCY[clan.developmentLevel]
raw = clan.totalClanPP × efficiencyRate
cap = CLAN.BONUS_CAP_RATE × playerPP   (= 0.20 × playerPP)
ClanBonus = floor(min(raw, cap))
```

If player has no clan: `ClanBonus = 0`

| Dev Level | Efficiency Rate |
|---|---|
| 1 | 0.05 |
| 2 | 0.08 |
| 3 | 0.10 |
| 4 | 0.12 |
| 5 | 0.15 |

Source: `BALANCE.clan.EFFICIENCY`, all [FIXED]

### ECP Formula

```
baseECP = floor((PlayerPP × (1 + heroBonus) × (1 + raceBonus)) + ClanBonus)
finalECP = floor(baseECP × tribeMultiplier)
```

- `heroBonus` = `totalAttackBonus` (attacker) or `totalDefenseBonus` (defender), clamped to [0, 0.50]
- `raceBonus` = race-specific combat multiplier (orc: 0.10 atk / 0.03 def; human: 0.03 atk; dwarf: 0.15 def; elf: 0)
- `tribeMultiplier` = active V1 spell multiplier: `war_cry` → 1.25 (attacker), `tribe_shield` → 1.15 (defender), none → 1.0

**Invariants:**
- Hero bonus and race bonus multiply PP **only** — never ClanBonus
- Tribe multiplier is applied **after** the ECP formula, on the full base ECP
- `calculateECP()` defensively calls `clampBonus(heroBonus)` even if caller already clamped

**DB:** `tribes.power_total` (for ClanContext), `tribes.level` (for efficiency lookup)

---

## 7. Combat System — Resolution

**Files:** `lib/game/combat.ts` → `resolveCombat()`, `app/api/attack/route.ts`

### Attack Gates (route order)

1. Auth check → 401
2. Input validation: `{ defender_id: UUID, turns: int 1–10 }` → 400
3. Self-attack check → 400
4. Season freeze → 423
5. Fetch attacker data (player, army, weapons, training, development, resources, tribe)
6. Attacker has enough turns → 400
7. Attacker has enough food (`ceil(soldiers × FOOD_PER_SOLDIER × turns)`) → 400
8. Attacker has soldiers > 0 → 400
9. Fetch defender data
10. Defender exists → 404
11. **Same-city check: `defPlayer.city !== attPlayer.city` → 400** "Target is in a different city"
12. Fetch clan data for both sides
13. Count kill cooldown (attacker→defender kills in last 6h)
14. Count loot decay (attacker→defender attacks in last 12h)
15. Fetch hero effects for attacker → **throws `HeroEffectsUnavailableError` on DB error → 503**
16. Fetch hero effects for defender → **throws `HeroEffectsUnavailableError` on DB error → 503**
17. Fetch active tribe combat spells for both sides
18. Compute race combat bonuses and tribe multipliers
19. Calculate PP for both sides
20. `resolveCombat(... attackerRaceBonus, defenderRaceBonus, attackerTribeMultiplier, defenderTribeMultiplier)` → single-turn result
21. **Multi-turn scaling** (TypeScript, before DB write):
    - `lootTotal = loot × turnsUsed` (per resource, capped at defender's available resource)
    - `attLosses = min(attackerLosses × turnsUsed, attArmy.soldiers)`
    - `defLosses = min(defenderLosses × turnsUsed, defArmy.soldiers)`
22. **Atomic DB write** — single `supabase.rpc('attack_resolve_apply', preComputedDeltas)` call:
    - Locks `players + army + resources` for **both** players with `SELECT … FOR UPDATE` in **ascending UUID order** (prevents A↔B deadlocks)
    - Re-validates turns / food / soldiers / same-city **after acquiring locks** (TOCTTOU-safe)
    - Applies in one Postgres transaction (all-or-nothing, no partial state):
      - `players.turns -= turnsUsed` (attacker)
      - `army.soldiers -= losses`, `army.slaves += captives` (attacker)
      - `resources` loot credited to attacker; food cost deducted
      - `army.soldiers -= losses` (defender)
      - `resources` loot debited from defender
      - `attacks` row inserted
    - Returns `{ ok: true }` or `{ ok: false, error: <code> }`
    - **File:** `supabase/migrations/0013_attack_resolve_rpc.sql`
    - **No direct `.update()` calls remain in the route** — structural test enforces this
23. Recalculate stored power for both players via `recalculatePower()` (non-fatal — failure self-corrects on next tick)

> **Food cost** in the route: `foodCost = Math.ceil(attArmy.soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turnsUsed)` (e.g. 100 soldiers × 0.05 × 3 turns = 15 food). `Math.ceil` is required because food is stored as Postgres `BIGINT` — fractional values such as `0.2` would cause a `22P02` error. `foodCostPerTurn` has been **removed** — `FOOD_PER_SOLDIER` is now the sole formula constant.

> **Deployed soldiers:** The route always passes `attArmy.soldiers` as `deployedSoldiers` — meaning **all soldiers are always deployed**. There is no partial deployment mechanic.

> **Cavalry are permanent:** Cavalry are never lost in combat. `attLosses` and `defLosses` apply to soldiers only. The battle report always shows `cavalry: 0` in `losses` and carries `cavalry: army.cavalry` (unchanged) in the `before`/`after` snapshots. The `attack_resolve_apply` RPC never modifies the `cavalry` column. This rule holds regardless of the `enableCavalry` flag — existing cavalry is always preserved.

### Combat Resolution Order of Operations

```
Step 1: baseAttackerECP = calculateECP(attackerPP, attackerClan, attackBonus, attackerRaceBonus)
        attackerECP     = floor(baseAttackerECP × attackerTribeMultiplier)
        baseDefenderECP = calculateECP(defenderPP, defenderClan, defenseBonus, defenderRaceBonus)
        defenderECP     = floor(baseDefenderECP × defenderTribeMultiplier)

Step 2: ratio   = attackerECP / defenderECP  (or WIN_THRESHOLD + 1 if defenderECP = 0)
        outcome = determineCombatOutcome(ratio)

Step 3: losses  = calculateSoldierLosses(deployedSoldiers, defenderSoldiers, ratio,
                    killCooldownActive, attackerIsProtected, defenderIsProtected)

Step 4: Soldier Shield applied (AFTER Step 3):
        if soldierShieldActive || defenderIsProtected || killCooldownActive:
            defenderLosses = 0

Step 5: rawLoot = calculateLoot(defenderUnbanked, outcome, attackCountInWindow, defenderIsProtected)

Step 6: Resource Shield applied (AFTER Step 5):
        if resourceShieldActive:
            loot = { gold: 0, iron: 0, wood: 0, food: 0 }
        else:
            loot = rawLoot
```

### Outcome Thresholds — Binary (no draw/partial)

```
R ≥ WIN_THRESHOLD (1.0) → 'win'   (attacker at least as strong as defender)
R <  WIN_THRESHOLD      → 'loss'
```

**There is no partial/draw outcome.** The old 3-band model (`partial` for ratio in `[0.75, 1.30)`) has been removed.
- Source: `lib/game/combat.ts` → `determineCombatOutcome()` — `WIN_THRESHOLD = 1.0` (`config/balance.config.ts:combat.WIN_THRESHOLD`)
- DB constraint: `attacks.outcome IN ('win', 'loss')` — migration `0010_binary_outcome_constraint.sql`
- The old `'draw'` and `'crushing_win'`/`'crushing_loss'` DB values have been normalised to `'win'`/`'loss'` by migration `0010`.

**Why ratio = 1.04 previously showed DRAW:**
- Old `WIN_THRESHOLD = 1.30` → ratio 1.04 fell in the partial band `[0.75, 1.30)` → outcome was `'partial'`
- Route mapped `partial → 'draw'` for DB storage
- `AttackClient.tsx` `OUTCOME_LABELS.PARTIAL` was set to `'Draw'`
- All three are now removed.

### Soldier Loss Rates

```
rawAttackerRate  = BASE_LOSS / max(ratio, 0.01)
rawDefenderRate  = BASE_LOSS × ratio

attackerLossRate = attackerIsProtected ? 0 : clamp(rawAttackerRate, ATTACKER_FLOOR, MAX_LOSS_RATE)
defenderLossRate = (killCooldown || defenderIsProtected) ? 0 : clamp(rawDefenderRate, DEFENDER_BLEED_FLOOR, MAX_LOSS_RATE)

attackerLosses = floor(deployedSoldiers × attackerLossRate)
defenderLosses = floor(defenderSoldiers × defenderLossRate)
```

Source: `lib/game/combat.ts` → `calculateSoldierLosses()` + `resolveCombat()` (Step 4)

| Constant | Value | Annotation |
|---|---|---|
| `combat.BASE_LOSS` | 0.15 | [TUNE: placeholder] |
| `combat.MAX_LOSS_RATE` | 0.30 | [FIXED] |
| `combat.DEFENDER_BLEED_FLOOR` | 0.05 | [TUNE] |
| `combat.ATTACKER_FLOOR` | 0.03 | [TUNE] |

#### Conditions that force defenderLosses = 0 (attacker still loses normally)

| Condition | Flag | Set by |
|---|---|---|
| Kill cooldown active | `killCooldownActive = true` | Attacker killed defender soldiers within `KILL_COOLDOWN_HOURS` (6h) — queried as `attacks.defender_losses > 0` in the window |
| Defender has new-player protection | `defenderIsProtected = true` | Defender account created within `PROTECTION_HOURS` (24h) and season gate passed |
| Defender has Soldier Shield active | `soldierShieldActive = true` | `player_hero_effects` has unexpired `SOLDIER_SHIELD` for defender |

**In all three cases, attackerLosses resolve normally** (attacker pays turns + food + loses soldiers). The battle report includes `KILL_COOLDOWN_NO_LOSSES`, `DEFENDER_PROTECTED`, or `SOLDIER_SHIELD_NO_LOSSES` in the `reasons` array to explain the zero defender losses.

**Why "enemy lost 0" while "I lost 141":** The most common cause in normal gameplay (both players post-protection, no shields) is an active kill cooldown — the attacker attacked the same target and killed soldiers within the past 6 hours.

### Loot Formula

```
if defenderIsProtected || outcome == 'loss':
    loot = 0 per resource

outcomeMult = { win: 1.0, loss: 0.0 }    ← no partial bucket
decayFactor = LOOT_DECAY_STEPS[min(attackCount − 1, 4)]
totalMult   = BASE_LOOT_RATE × outcomeMult × decayFactor
loot[r]     = floor(unbanked[r] × totalMult)
```

| Constant | Value | Annotation |
|---|---|---|
| `combat.BASE_LOOT_RATE` | 0.20 | [FIXED] |
| `antiFarm.DECAY_WINDOW_HOURS` | 12 | [FIXED] |
| `antiFarm.LOOT_DECAY_STEPS` | [1.0, 0.70, 0.40, 0.20, 0.10] | Attack 1–5+ |

**Loot is from unbanked resources only.** Banked gold is `theftProtection = 1.0` safe.

### New Player Protection

```
gateMs = protectionStartDays × 24h × 3600 × 1000    (= 10 days in ms)
if (now − seasonStart) < gateMs:
    return false    (no protection during first 10 days of season)

protectionMs = PROTECTION_HOURS × 3600 × 1000    (= 24h in ms)
return (now − playerCreatedAt) < protectionMs
```

When `defenderIsProtected`: `defenderLosses = 0`, `loot = 0`.
When `attackerIsProtected`: `attackerLosses = 0`.
**Attack is never blocked.** Attacker always pays turns + food.

### Kill Cooldown

- Window: `KILL_COOLDOWN_HOURS` = 6 hours per `(attacker_id, defender_id)` pair
- Trigger: any attack where `defender_losses > 0` was recorded in the window
- Effect: `defenderLosses = 0` for the next attack (attacker still loses normally; loot still applies based on outcome)
- DB query in route: `attacks WHERE attacker_id=$1 AND defender_id=$2 AND defender_losses>0 AND created_at >= (now − 6h)` — `count > 0` → cooldown active
- Battle report: `flags.kill_cooldown_active = true`; `reasons` array includes `KILL_COOLDOWN_NO_LOSSES`
- **UI (Battle Report modal):** When `kill_cooldown_active`, the "Combat Modifiers" section appears with the label: *"Kill Cooldown (6h) — you killed this target's soldiers recently; defender loses no soldiers this attack"*
- **UI (Attack targets table):** Amber dot (4th indicator) in the Status column signals kill cooldown is active for that target. Source: `app/(game)/attack/AttackClient.tsx` → `StatusIndicators` + `attack/page.tsx` — batch kill-cooldown query with `getActiveSeason`

### Status Column (Attack Targets Table)

Each target row shows 4 status dots in the `Status` column (formerly `Shields`). All dots are rendered by `StatusIndicators` in `AttackClient.tsx`. Inactive dots are empty/outlined.

| Dot | Color | Meaning | Source flag |
|---|---|---|---|
| 1 | Gold | Resource Shield active | `resource_shield_active` |
| 2 | Blue | Soldier Shield active | `soldier_shield_active` |
| 3 | Green | New Player Protection (24h) | `is_protected` |
| 4 | Amber | Kill Cooldown active (6h) | `kill_cooldown_active` |

`is_protected` and `kill_cooldown_active` are computed server-side in `app/(game)/attack/page.tsx`:
- `is_protected`: `isNewPlayerProtected(target.created_at, activeSeason.starts_at, now)` — requires `created_at` on cityPlayers query and active season from `getActiveSeason(admin)`
- `kill_cooldown_active`: batch query `attacks WHERE attacker_id=$attacker AND defender_id IN ($targets) AND defender_losses>0 AND created_at >= (now − 6h)`

### Battle Report — Power Breakdown

`POST /api/attack` returns `battleReport.attacker.ecp_attack` (final ECP) and `battleReport.attacker.base_ecp_attack` (ECP before tribe spell multiplier). The same pair exists for the defender (`ecp_defense` / `base_ecp_defense`).

**UI behaviour in `BattleReportModal`:**
- When `ecp_attack === base_ecp_attack` (no tribe spell active): shows only the final ECP value.
- When `ecp_attack !== base_ecp_attack` (war_cry active): shows three lines — Base / Tribe +N / Final.
- Same logic applies to the defender side (tribe_shield).

`CombatResolutionResult` in `lib/game/combat.ts` now exports both `baseAttackerECP` and `baseDefenderECP` alongside the final `attackerECP` / `defenderECP`.

### Battle Report Flags and UI Mapping

`POST /api/attack` returns `battleReport.flags` and `battleReport.reasons`:

| Flag | Type | Shown where |
|---|---|---|
| `kill_cooldown_active` | boolean | "Combat Modifiers" section in Battle Report modal (always visible when true, not just when gains=0) |
| `defender_protected` | boolean | "Combat Modifiers" / "Why Nothing Was Gained" + green dot in targets table |
| `attacker_protected` | boolean | "Combat Modifiers" / "Why Nothing Was Gained" |
| `defender_soldier_shield_active` | boolean | "Combat Modifiers" / "Why Nothing Was Gained" + blue dot in targets table |
| `defender_resource_shield_active` | boolean | "Combat Modifiers" / "Why Nothing Was Gained" + gold dot in targets table |
| `anti_farm_decay_mult` | number | Inline in "You Gained" card + "Combat Modifiers" / "Why Nothing Was Gained" via `LOOT_DECAY_REDUCED` reason |

**Section title logic in BattleReportModal:**
- `allGainsZero && reasons.length > 0` → "Why Nothing Was Gained" (amber border)
- `allGainsZero && reasons.length === 0` → "Why Nothing Was Gained" with fallback text
- `!allGainsZero && reasons.length > 0` → "Combat Modifiers" (neutral border)
- `!allGainsZero && reasons.length === 0` → section not shown

Source: `app/(game)/attack/AttackClient.tsx` → `BattleReportModal`

### Food Consumption Formula

```
foodCost = ceil(soldiers × FOOD_PER_SOLDIER × turns)
```

> **Why `ceil`?** Food is stored as a Postgres `BIGINT` parameter in `attack_resolve_apply`. Postgres rejects any fractional JS number passed to a `BIGINT` column with error `22P02: invalid input syntax for type bigint`. `Math.ceil` ensures the value is always a non-negative integer, favouring the server (rounds up, never down).


| Symbol | Meaning |
|---|---|
| `soldiers` | Attacker's total soldiers (`attArmy.soldiers`) — all soldiers are always deployed |
| `FOOD_PER_SOLDIER` | `BALANCE.combat.FOOD_PER_SOLDIER = 0.05` — food consumed per soldier per turn |
| `turns` | `turnsUsed` — number of turns spent on the attack (1–10) |

**Examples:**
- 100 soldiers, 3 turns → `ceil(100 × 0.05 × 3) = ceil(15) = 15`
- 4 soldiers, 1 turn → `ceil(4 × 0.05 × 1) = ceil(0.2) = 1` ← BIGINT-safe
- 21 soldiers, 1 turn → `ceil(21 × 0.05 × 1) = ceil(1.05) = 2`

- **Route:** `app/api/attack/route.ts` — `const foodCostRaw = attArmy.soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turnsUsed; const foodCost = Math.ceil(foodCostRaw)`
- **UI preview:** `components/game/AttackDialog.tsx` — `Math.ceil(armySoldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)`
- **Balance key:** `BALANCE.combat.FOOD_PER_SOLDIER` — `lib/game/balance-validate.ts` enforces it is `finite ≥ 0`
- **Tests:** `lib/game/food-formula.test.ts` — 32 tests (constant invariants, canonical examples, linear scaling, structural contracts for route + dialog, explicit rounding cases)
- `foodCostPerTurn` has been **removed** from `BALANCE.combat` and all code paths.

### UI Consistency Rule

All UI elements displaying food consumption **must** use the same formula as the backend:

```
foodCost = Math.ceil(soldiers × FOOD_PER_SOLDIER × turns)
```

Requirements:
- **Must** reference `BALANCE.combat.FOOD_PER_SOLDIER` — never hardcode food values
- **Must** wrap the multiplication in `Math.ceil(...)` — food is a Postgres `BIGINT`; fractional values cause `22P02` errors
- **Must not** use legacy logic such as `foodCostPerTurn`
- UI preview must match backend calculation exactly (same formula, same rounding, same constant)
- Structural tests enforce this contract automatically (see GROUP 5 + GROUP 7 in `food-formula.test.ts`)

**UI locations subject to this rule:**
| Location | File |
|---|---|
| Attack dialog cost preview | `components/game/AttackDialog.tsx` |
| Any future action dialog with food cost | (same rule applies) |

### Server Authority Rule

**The UI is informational only. The server is the single authority for all gameplay costs.**

The food cost gate is enforced server-side in `app/api/attack/route.ts` before any DB write:

```typescript
const foodCostRaw = attArmy.soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turnsUsed
const foodCost    = Math.ceil(foodCostRaw)  // BIGINT-safe: always an integer
if (attResources.food < foodCost) {
  return NextResponse.json({ error: 'Not enough food' }, { status: 400 })
}
```

Rules:
- A player bypassing the UI and calling `/api/attack` directly will still be rejected if they lack food.
- The DB write (via `attack_resolve_apply` RPC) re-validates food a second time under `FOR UPDATE` lock — preventing TOCTTOU races from concurrent requests.
- **Spy (`/api/spy`)** does **not** enforce food validation — spy missions are intelligence operations, not military deployments; they consume turns only, not food.

**Routes enforcing food validation:**
| Route | Validated | Formula |
|---|---|---|
| `POST /api/attack` | ✅ server-side + RPC re-check | `ceil(soldiers × FOOD_PER_SOLDIER × turns)` |
| `POST /api/spy` | N/A — spy has no food cost | turns only (`BALANCE.spy.turnCost`) |

**Test coverage:** GROUP 6 in `lib/game/food-formula.test.ts` — structural + rejection/acceptance scenarios.

### Multi-Turn Scaling and Persistence

`resolveCombat` is called **once** and produces single-turn values. The route then scales in TypeScript before the DB write:

```
lootTotal[resource]  = loot[resource]  × turnsUsed   (capped to defender's available resource)
attLossesTotal       = attackerLosses  × turnsUsed   (clamped to attArmy.soldiers)
defLossesTotal       = defenderLosses  × turnsUsed   (clamped to defArmy.soldiers)
```

These pre-computed deltas are passed as parameters to `attack_resolve_apply()` (migration `0013_attack_resolve_rpc.sql`) via one `supabase.rpc()` call. The Postgres function acquires `FOR UPDATE` row locks in ascending UUID order, re-validates all conditions under lock, and applies all mutations atomically. There is **no loop** over turns and **no partial writes** — either the entire attack commits or nothing changes.

### Slaves from Combat (Captives)

**Implemented.** Defender soldiers killed in battle may be captured and added to the attacker's `army.slaves`.

```
captives = floor(defenderLossesTotal × CAPTURE_RATE)   (CAPTURE_RATE = 0.10)
captives = 0  when defenderLossesTotal = 0
              (kill cooldown / defender protected / soldier shield all force defenderLosses = 0)
```

- **Function:** `calculateCaptives(defenderLosses)` — `lib/game/combat.ts`
- **Balance key:** `BALANCE.combat.CAPTURE_RATE = 0.10`
- **RPC:** `attack_resolve_apply` (migration `0013_attack_resolve_rpc.sql`) accepts `p_slaves_taken INT`
  and atomically sets `army.slaves = slaves + p_slaves_taken` for the attacker.
- **DB column:** `attacks.slaves_taken` — records actual captives per attack.
- **API:** `app/api/attack/route.ts` computes `captives = calculateCaptives(safeDefLosses)` and passes it to the RPC.
- **BattleReport:** `gained.captives: number` — 0 when defenderLosses = 0 (all blockers above).
- **UI:** Battle Report modal shows a "Captives" row in the "You Gained" section.

---

## 8. Spy System

**File:** `app/api/spy/route.ts`
**Balance:** `BALANCE.spy`

### Spy Power Formula

```
spyTrainMult  = 1 + spy_level   × 0.08
scoutTrainMult = 1 + scout_level × 0.08

spyWeaponMult  = 1.0
    × (shadow_cloak > 0 ? 1.15 : 1)
    × (dark_mask > 0    ? 1.30 : 1)
    × (elven_gear > 0   ? 1.50 : 1)

scoutWeaponMult = 1.0
    × (scout_boots > 0  ? 1.15 : 1)
    × (scout_cloak > 0  ? 1.30 : 1)
    × (elven_boots > 0  ? 1.50 : 1)

raceMult (spy)   = elf ? 1.20 : 1.0
raceMult (scout) = elf ? 1.20 : 1.0

spyPower     = floor(spies_sent × spyTrainMult   × spyWeaponMult  × raceMult_spy)
scoutDefense = floor(scouts     × scoutTrainMult × scoutWeaponMult × raceMult_scout)
```

### Success / Failure

```
success = spyPower > scoutDefense

if failure:
    ratio       = min(scoutDefense / max(spyPower, 1), 1.0)
    spiesCaught = min(
        floor(spies_sent × catchRate × ratio),
        floor(spies_sent × MAX_CATCH_RATE)
    )
```

| Constant | Value | Annotation |
|---|---|---|
| `spy.turnCost` | 1 | [TUNE] |
| `spy.minSpies` | 1 | [FIXED] |
| `spy.catchRate` | 0.30 | [TUNE] |
| `spy.MAX_CATCH_RATE` | 0.80 | [FIXED] |

### Spy Mission Gates

1. Auth → 401
2. Season freeze → 423
3. Input: `{ target_id: UUID, spies_sent: int ≥ 1 }`
4. Self-spy check → 400
5. Fetch attacker (player, army, weapons, training)
6. `spies_sent ≤ army.spies` → 400
7. `player.turns ≥ turnCost` → 400
8. Fetch target (player, army, weapons, training)

### Data Revealed on Success

```json
{
  "army_name", "soldiers", "spies", "scouts", "cavalry", "slaves",
  "gold", "iron", "wood", "food",
  "power_attack", "power_defense", "power_spy", "power_scout", "power_total",
  "soldier_shield_active": bool,
  "resource_shield_active": bool
}
```

Shield active state is revealed — expiration time is NOT.

### DB Writes (spy route) — Atomic via RPC

All three writes happen in **one Postgres transaction** via `spy_resolve_apply()` (migration `0014_spy_resolve_rpc.sql`):

1. `players.turns -= turnCost`
2. `army.spies -= spiesCaught` (only if caught > 0)
3. `spy_history` INSERT

**Route calls:** `supabase.rpc('spy_resolve_apply', { p_spy_owner_id, p_target_id, p_spies_sent, p_turn_cost, p_spies_caught, p_success, p_data_revealed, p_season_id })`

**Row locks:** `SELECT … FOR UPDATE` on attacker's `players + army` rows (single JOIN). Defender rows are read-only — not locked.

**Post-lock re-validation (TOCTTOU-safe):**
- `turns ≥ turnCost` (re-checked under lock)
- `spies ≥ spies_sent` (re-checked under lock)

**RPC returns:** `{ ok: true, new_turns, new_spies }` or `{ ok: false, error: "not_enough_turns" | "not_enough_spies" }`

**No partial state:** If anything fails inside the RPC, Postgres rolls back all three writes automatically.

**File:** `supabase/migrations/0014_spy_resolve_rpc.sql`

---

## 9. Hero Effect System

**File:** `lib/game/hero-effects.ts`

### Effect Types

| Type | Category | Rate | Stacks? |
|---|---|---|---|
| `SLAVE_OUTPUT_10` | Production | +0.10 | Yes |
| `SLAVE_OUTPUT_20` | Production | +0.20 | Yes |
| `SLAVE_OUTPUT_30` | Production | +0.30 | Yes |
| `ATTACK_POWER_10` | Combat ECP | +0.10 | Yes |
| `DEFENSE_POWER_10` | Combat ECP | +0.10 | Yes |
| `RESOURCE_SHIELD` | Shield | loot=0 | N/A |
| `SOLDIER_SHIELD` | Shield | defLosses=0 | N/A |

### Stacking & Clamping

```
TotalBonus[category] = min( Σ EFFECT_RATES[e_i], MAX_STACK_RATE )
MAX_STACK_RATE = 0.50   [FIXED]
```

`clampBonus(total, max = 0.50)` — called at `calcActiveHeroEffects()` output and defensively inside `calculateECP()`.

### Active Effect Query

```sql
SELECT * FROM player_hero_effects
WHERE player_id = $1 AND ends_at > now()
```

Source: `lib/game/hero-effects.ts:147–150`

### Shield Timing Model

```
|-- SHIELD_ACTIVE_HOURS (23h) --|-- SHIELD_COOLDOWN_HOURS (1h) --|
         active window                 vulnerability window
```

- Active: `now < ends_at`
- Vulnerability: `ends_at ≤ now < cooldown_ends_at`
- Next activation allowed: only after `cooldown_ends_at`

### DB Error Behavior

**`getActiveHeroEffects()` throws `HeroEffectsUnavailableError` on any DB error.**

Attack route catches `HeroEffectsUnavailableError` before the generic 500 handler and returns:
```json
HTTP 503
{ "error": "HeroEffectsUnavailable", "message": "Temporary issue loading hero effects. Please try again." }
```

No DB state is modified (attack aborted before `resolveCombat()`).

Source: `lib/game/hero-effects.ts:HeroEffectsUnavailableError`, `app/api/attack/route.ts` catch block.

> The old behavior (fail-safe all-zeros fallback) was **removed** on 2026-03-04. An empty result (no active effects) still returns all-zeros normally — only a DB error triggers 503.

### Mana Regen (per tick)

```
mana = base (1)
     + (heroLevel >= 10 ? level10bonus : 0)   (+1)
     + (heroLevel >= 50 ? level50bonus : 0)   (+1)
     + (isVipActive ? vipBonus : 0)            (+1)
```

Maximum mana per tick: 4 (level ≥ 50, VIP active).

### Mana Costs (spell purchase)

| Spell | Mana Cost |
|---|---|
| SOLDIER_SHIELD | 10 [TUNE] |
| RESOURCE_SHIELD | 10 [TUNE] |

Source: `BALANCE.hero.SOLDIER_SHIELD_MANA`, `BALANCE.hero.RESOURCE_SHIELD_MANA`

### Hero XP / Leveling

`hero.xpPerLevel = 100` exists in BALANCE and `hero.xp` / `hero.xp_next_level` columns exist in DB. **No route increments XP.** XP is display-only.

### DB Schema

```sql
player_hero_effects:
  id               UUID PK
  player_id        UUID FK players.id ON DELETE CASCADE
  type             TEXT (one of 7 HeroEffectType values)
  starts_at        TIMESTAMPTZ
  ends_at          TIMESTAMPTZ
  cooldown_ends_at TIMESTAMPTZ (null for non-shield effects)
  metadata         JSONB
```

---

## 10. Clan / Tribe System

**Files:** `app/api/tribe/*/route.ts`, `lib/game/combat.ts` → `calculateClanBonus()`, `supabase/migrations/0020_tribe_v1.sql`

### Tribe Page — UI Structure (V1)

> UI/product restructuring. No gameplay mechanics changed.
> All existing RPCs, routes, and SSOT rules remain authoritative.

The tribe page (`app/(game)/tribe/`) uses tabs when in a tribe.
If not in a tribe, two-panel "no tribe" state (create + city join list).

**Exact tab structure — 4 tabs:**

| Tab | Key | Purpose | Data source |
|---|---|---|---|
| Overview | `overview` | Identity card + stats strip + prominent tribute panel + mana panel + active spells + Tribe Actions section | SSR props + `GET /api/tribe/tax-status` (countdown) |
| Members | `members` | Tribute header strip + premium roster list (avatar, role accent bar, identity, power, tax pill) + "Manage ▾" action dropdown per row + Transfer Leadership button in panel header (leader only) | SSR props + `taxLogToday` SSR query |
| Spells | `spells` | Mana pool + contribute form + compact spell rows (left-border accent, name/effect, cost/cast) | SSR props (optimistic mana update) |
| Chat | `chat` | Tribe-only chat — message list + send form + manual refresh button | Lazy `GET /api/tribe/chat` on first open; manual refresh re-fetches |

**Tabs removed:** Requests, Taxes, Chronicle, Command — all eliminated.

**Tax Today column (Members tab):**
- `Exempt` badge (blue) — role=leader/deputy or `tax_exempt=true`
- `✓ Paid` (green) — `paid=true` entry in `tribe_tax_log` for today's Israel date
- `✗ Unpaid` (red) — `paid=false` entry
- `—` (dim) — no entry yet (collection not yet run today)

**Tribute panel (Overview):** Prominent amber-accented block. Shows tribute amount (large), animated countdown, "Daily at 20:00 Israel Time" note, last-collected date. Leader inline set-tax form embedded in this panel.

**Leadership transfer — explicit modal flow:**
- Entry point: "Transfer Leadership" button in Members tab panel header (leader only)
- Modal opens showing only current deputies (radio-select style)
- If no deputies: modal explains requirement, no transfer possible
- On confirm: calls `/api/tribe/transfer-leadership` → `router.refresh()` (full page reload required — role changes affect SSR props)
- No "Make Leader" button in row actions

**Member roster — visual design:**
- Panel has no `overflow-hidden` at the outer wrapper level (required so the portal dropdown can render visually above it). Header and footer clips use `rounded-t/b-game-lg overflow-hidden` on those specific sub-elements.
- Each row: `ps-9 pe-6 py-5` — left padding accounts for the 3px accent bar
- Left 3px accent bar: gold gradient (leader), purple gradient (deputy), slate/transparent (member)
- Avatar circle (`size-11`): role-colored border ring + glow `box-shadow`; initials in role-matching text color
- Identity cell (flex-1): army name (heading uppercase, truncated) + "(you)" badge + secondary line with username and power
- Role badge (`min-w-[72px]` centered): gold/purple/default
- Tax status (`min-w-[80px]` end-aligned): pill badges with background colors (blue=Exempt, emerald=Paid, red=Unpaid, dim dash=none yet)
- "Manage ▾" trigger only shown when `canManage && hasActions`
- Transfer Leadership button lives in the panel header right-side (leader only)
- Footer shown only when `isLeader && deputyCount >= 3`

**Member actions — "Manage ▾" portal dropdown:**
- Trigger: "Manage ▾" text button with border; hover transitions border and text to gold; `active:scale-95`
- On click: reads `getBoundingClientRect()` of the trigger, calculates portal position. If dropdown would overflow the viewport bottom, it opens upward instead.
- Dropdown rendered via **`createPortal(…, document.body)`** — completely outside the roster panel DOM, immune to any ancestor `overflow: hidden`. Position set with `position: fixed` at calculated `{ top, right }`.
- Background overlay (`fixed inset-0 z-[998]`) closes menu on outside click; portal renders at `z-index: 9999`.
- Dropdown content: dark-gold themed, identity header (army name + username), then action rows
- Actions shown depend on role + permissions:
  - Appoint Deputy (leader, target=member, deputyCount < 3) — icon circle (↑ purple)
  - Remove Deputy (leader, target=deputy) — icon circle (↓ slate)
  - Kick Member (canManage, excluding leaders and peer deputies) — icon circle (✕ red), separated by `h-px` divider
- "Manage" button only rendered if `canManage && hasActions` (no empty trigger for rows with no available actions)
- Deputy cap = 3 enforced in both UI (conditional display) and backend (RPC)
- `closeMenu()` helper clears both `openMenu` and `menuPos` state atomically

**Leave / Disband — Modal component:**
- Leave: opens `Modal` with confirmation → calls `/api/tribe/leave` → `router.refresh()`
- Disband: opens `Modal` with confirmation → calls `/api/tribe/disband` → `router.refresh()`
  - Disband button only shown when leader is the sole member

### Tribe Chat (V1)

**DB table: `tribe_chat`** (migration `0021_tribe_chat.sql`)
```
tribe_chat
  id         uuid PK
  tribe_id   uuid FK tribes(id) ON DELETE CASCADE
  player_id  uuid FK players(id) ON DELETE CASCADE
  message    text CHECK 1–500 chars
  created_at timestamptz DEFAULT now()
```
Index: `(tribe_id, created_at DESC)`.
RLS: members read and insert only their own tribe's messages.
No Supabase Realtime publication — chat is not live/streaming.

**API routes:**
- `GET /api/tribe/chat` — returns last 100 messages ordered `created_at ASC`, with `username` joined from `players`. Auth + membership check. No season guard (read-only).
- `POST /api/tribe/chat` — inserts a message. Auth + membership + season freeze guard. `message` trimmed, 1–500 chars enforced. Returns the inserted row with `username`.

**Client behavior:**
- Fetch: lazy, triggered on first `activeTab === 'chat'` open via `fetchChatMessages()`. `chatFetched` flag prevents redundant re-fetches.
- Manual refresh: compact `↻ Refresh` button in chat header sets `chatFetched = false`, triggering `fetchChatMessages()` again.
- Send: optimistic insert with `opt-{timestamp}` id, replaced with real server row on success; rolled back on failure. Input restored on failure.
- Scroll: `chatBottomRef` scrolled into view when messages change while Chat tab is active.
- Empty state: message inviting the first speaker.
- No realtime subscription, no Supabase channel, no live indicator.

**Permission rules:**
- Only active tribe members can read or send.
- Enforced at both DB (RLS) and API (membership check) layers.
- No message editing or deletion in V1.

### Daily Tribute / Tax Schedule — Verified

`vercel.json` cron: `/api/tribe/tax-collect` at `0 * * * *` (every hour at :00).

Route behavior:
1. Computes Israel local hour via `Intl.DateTimeFormat('Asia/Jerusalem')`.
2. If `israelHour < BALANCE.tribe.taxCollectionHour` (20) → returns early, no collection.
3. Filters tribes where `last_tax_collected_date ≠ israelToday` (idempotency).
4. Per-member: calls `tribe_collect_member_tax()` RPC (deadlock-safe UUID-order locking).
5. After processing: sets `tribes.last_tax_collected_date = israelToday`.

Result: taxes run at most once per tribe per calendar day, at or after 20:00 Israel time. `GET /api/tribe/tax-status` computes the exact UTC timestamp of the next collection and returns it for the client countdown.

Tax-collect cron (`0 * * * *`) is correct and unchanged. Tick cron was corrected to `*/30 * * * *`.

**Data shape (page.tsx):**
- `players` select includes `power_total`.
- `taxLogToday: Array<{ player_id: string; paid: boolean }>` — SSR-queried from `tribe_tax_log` for today's Israel date.

**Tab state:** `useState<TribeTab>` — no URL routing. Consistent with other tabbed pages.

**Dynamic update strategy:**
- `router.refresh()` (full SSR reload) — used only for structural page-state transitions: create tribe, join tribe, leave tribe, disband tribe, transfer leadership. These change SSR props (tribe/membership context) that can't be patched in place.
- In-place local state updates (no refresh) — kick member (`setLocalMembers`), set role (`setLocalMembers`), set tax (`setLocalTaxAmount`), activate spell (`setLocalSpells` + `setLocalTribeMana`), contribute mana (`setLocalTribeMana`). All return updated data in the response and apply it immediately.
- `refresh()` from `usePlayer()` (PlayerContext) — called after mutations that affect sidebar resource values (mana, gold) to sync the resource bar.

### Clan Rules

- Max members: 20 (`BALANCE.clan.maxMembers`)
- Clan is locked to a single city (`tribes.city`)
- Player must **leave clan** before city migration
- Post-migration clan join cooldown: 48h
- Normal leave cooldown: 10 minutes

### Clan Combat Bonus (see also §6)

```
ClanBonus = floor(min(clan.power_total × EFFICIENCY[clan.level], 0.20 × playerPP))
```

Applied additively to ECP. Never multiplied by hero bonus.

### Role System (V1)

Each tribe member has exactly one role: `leader` | `deputy` | `member`.

| Role | Count | Tax exempt | Cast spells | Manage roles | Transfer leadership |
|---|---|---|---|---|---|
| `leader` | Exactly 1 | Yes | Yes | Yes | Yes |
| `deputy` | 0–3 max | Yes | Yes | No | No |
| `member` | Any | No (unless `tax_exempt=true`) | No | No | No |

**Leader invariant:**
- **DB-level (at most one leader):** Partial unique index `uidx_tribe_one_leader ON tribe_members(tribe_id) WHERE role = 'leader'` prevents two rows with `role='leader'` in the same tribe. This fires for any write, including direct DB access bypassing application code.
- **Route/RPC-level (no zero leaders):** Leave, disband, and transfer-leadership routes each enforce that the tribe cannot reach a state with zero leaders. Transfer requires a deputy target; disband only runs for the last member; leave is blocked for leaders.
- Together, these two guarantees produce the combined invariant: **exactly one leader per tribe** — the DB prevents more than one, the routes prevent fewer than one.

The leader:
- Cannot leave like a normal member.
- If alone → must use `POST /api/tribe/disband` to dissolve the tribe.
- If others present but no deputies → blocked until a deputy is appointed.
- If deputies present → must use `POST /api/tribe/transfer-leadership` first.

**Deputy cap:** Max 3 deputies enforced atomically by `tribe_set_member_role_apply()` SQL RPC (locks both membership rows to prevent TOCTOU race).

**Transfer leadership:** Atomic via `tribe_transfer_leadership_apply()` SQL RPC — locks both rows in UUID order, writes all three updates (tribes.leader_id, new leader role, old leader role) in one transaction. Old leader always becomes deputy. One-leader invariant maintained throughout.

### Tribe Mana

**Regen per tick:**
```
manaGain = max(1, floor(memberCount × BALANCE.tribe.manaPerMemberPerTick))
```

`BALANCE.tribe.manaPerMemberPerTick = 1` [TUNE]

**Contribution:**
`POST /api/tribe/contribute-mana`: personal hero mana → tribe mana.
Atomic RPC (`tribe_contribute_mana_apply`). Permanent — no refunds, no withdrawal.
RPC validates `p_amount > 0` directly (returns `invalid_amount` error if not) — defence in depth beyond route-level Zod schema.
Returns `{ new_hero_mana, new_tribe_mana, tribe_id }` for immediate UI update without extra query.

### Tax System (V1 — Automated)

Manual tax payment is removed (`POST /api/tribe/pay-tax` returns 410).

**Collection schedule:**
- Dedicated cron: `POST /api/tribe/tax-collect` runs **hourly** (Vercel: `"0 * * * *"`)
- Collects only when Israel local time ≥ `BALANCE.tribe.taxCollectionHour` (default: 20)
- Per-tribe idempotency: `tribes.last_tax_collected_date` prevents double-collection
- Per-member idempotency: `tribe_tax_log` UNIQUE `(tribe_id, player_id, collected_date)`

**Mechanics:**
- Tax amount: `tribes.tax_amount` gold (set by leader; city cap enforced)
- Who pays: `tribe_members` with `role='member'` AND `tax_exempt=false`
- Leader + deputies are always exempt
- Payment: gold deducted from member → added directly to **leader's personal `resources.gold`**. No tribe treasury.
- Unpaid (insufficient gold): no deduction; logged with `paid=false`
- RPC `tribe_collect_member_tax()`: locks **both** resource rows upfront in deterministic UUID order (smaller UUID first) before any reads or writes — deadlock-safe under concurrency. Explicitly checks leader resources row exists before any deduction; returns `leader_resources_not_found` if missing (no partial deduction). Error codes: `member_resources_not_found` / `leader_resources_not_found`.
- **Failure handling in route:** `member_resources_not_found` → `console.warn`, skip member, continue. `leader_resources_not_found` → `console.error` (data integrity issue), skip member, continue. In both cases the tribe is still marked `last_tax_collected_date = today` after the member loop — deliberate: retrying next hour cannot fix a missing resources row; a data fix requires manual intervention. Members whose RPC returns `ok:false` are not charged and not logged in `tribe_tax_log`.

**Status endpoint:** `GET /api/tribe/tax-status` → `{ server_now, next_tax_at, last_tax_collected_at }`

Tax limits per city:

| City | Max tax |
|---|---|
| 1 | 1,000 |
| 2 | 2,500 |
| 3 | 5,000 |
| 4 | 10,000 |
| 5 | 20,000 |

### Spells (V1 — active spell keys only)

| Spell Key | Mana Cost | Duration | Effect |
|---|---|---|---|
| `war_cry` | 40 | 4h | Attacker ECP ×1.25 |
| `tribe_shield` | 30 | 12h | Defender ECP ×1.15 |
| `production_blessing` | 25 | 8h | Slave output ×1.20 |
| `spy_veil` | 20 | 6h | Scout defense ×1.30 |
| `battle_supply` | 35 | 6h | Attack food cost −25% |

Activation route: `POST /api/tribe/activate-spell`. Only leader or deputy can activate. Mana deducted from tribe pool.
DB constraint: `chk_tribe_spell_key` enforces only these 5 keys.
Spell multipliers: `BALANCE.tribe.spellEffects.*`.

Legacy spell keys `combat_boost` and `mass_spy` are fully removed from DB constraints, BALANCE, routes, UI, and tests.

### Tribe Power

`tribes.power_total` = sum of all member `power_total` values.
**Updated once per tick** in step 9 of the tick processing order (`app/api/tick/route.ts`). Intentionally stale between ticks — updates in sync with the global power recalculation. Source: `lib/game/tick.ts` → `calcTribePowerTotal()`.

---

## 11. Bank System

**Files:** `app/api/bank/deposit/route.ts`, `app/api/bank/withdraw/route.ts`, `app/api/bank/upgrade/route.ts`, `supabase/migrations/0015_bank_upgrade_rpc.sql`, `lib/game/bank-upgrade.test.ts`

### Deposit

```
today = new Date().toISOString().split('T')[0]
depositsToday = (bank.last_deposit_reset === today) ? bank.deposits_today : 0

Gates:
  depositsToday < depositsPerDay (5)
  amount ≤ floor(resources.gold × maxDepositPercent) = floor(gold × 1.0) = gold
  amount ≤ resources.gold
```

Resets happen lazily at deposit time (not at midnight tick).

| Constant | Value | Annotation |
|---|---|---|
| `bank.depositsPerDay` | 5 | [TUNE] |
| `bank.maxDepositPercent` | 1.0 (100%) | [TUNE] |
| `bank.theftProtection` | 1.0 (100% safe) | [FIXED] |

> ⚠️ **[INCONSISTENT]** `bank.maxLifetimeDeposits = 5` — this field name implies a lifetime limit, but it equals `depositsPerDay = 5` and is **not referenced** in any route. Only `depositsPerDay` is used. The `maxLifetimeDeposits` constant is dead code.

### Withdraw

Gate: `amount ≤ bank.balance`
No daily limit on withdrawals.

### Interest (Bank Upgrade + Tick)

```
upgradeCost = upgradeBaseCost × (currentInterestLevel + 1)
            = 2000 × (level + 1)
```

Interest formula (run once per calendar day in tick):
```
interest = floor(balance × INTEREST_RATE_BY_LEVEL[interestLevel])
```

| Interest Level | Rate | Upgrade cost |
|---|---|---|
| 0 (default) | 0% | — |
| 1 | 5.0% | 2,000 × 1 = 2,000 gold |
| 2 | 7.5% | 2,000 × 2 = 4,000 gold |
| 3 | 10.0% | 2,000 × 3 = 6,000 gold |
| 4 | 12.5% | 2,000 × 4 = 8,000 gold |
| 5 | 15.0% | 2,000 × 5 = 10,000 gold |
| 6 | 17.5% | 2,000 × 6 = 12,000 gold |
| 7 | 20.0% | 2,000 × 7 = 14,000 gold |
| 8 | 22.5% | 2,000 × 8 = 16,000 gold |
| 9 | 25.0% | 2,000 × 9 = 18,000 gold |
| 10 | 30.0% | 2,000 × 10 = 20,000 gold |

`MAX_INTEREST_LEVEL = 10` [FIXED] — upgrade route rejects at level ≥ 10. Must equal highest key in `INTEREST_RATE_BY_LEVEL`.
`vip.bankInterestBonus = 0` — VIP contributes nothing to bank interest.

**Invariants enforced by `validateBalance()` at boot:**
- `INTEREST_RATE_BY_LEVEL` must contain level 0
- All values non-negative
- Values monotonically non-decreasing (level N ≥ level N-1)
- `MAX_INTEREST_LEVEL` equals highest key in the table

Source: `BALANCE.bank.INTEREST_RATE_BY_LEVEL`, `lib/game/tick.ts → calcBankInterest()`

### Bank Upgrade — Atomicity

The upgrade mutation is **fully atomic** via the `bank_interest_upgrade_apply()` Postgres RPC
(`supabase/migrations/0015_bank_upgrade_rpc.sql`).

**Row locks:** `SELECT … FOR UPDATE` on `bank` + `resources` in a single JOIN (no deadlock risk — one player only).

**Post-lock re-validation (TOCTTOU-safe):**
- `bank.interest_level < p_max_level` (concurrent upgrade guard)
- `bank.interest_level + 1 == p_next_level` (stale-read guard → `stale_level` error)
- `resources.gold >= p_cost_gold`

**RPC error codes → HTTP 400:**
| Code | Meaning |
|---|---|
| `already_max_level` | Level is already at `MAX_INTEREST_LEVEL` |
| `not_enough_gold` | Concurrent spend drained gold after pre-check |
| `stale_level` | Another concurrent upgrade ran first |

**No partial state:** either both writes commit (gold deducted + level incremented) or neither does.

**`POST /api/bank/upgrade` response shape:**
```json
{
  "bank":      { /* full bank row */ },
  "resources": { /* full resources row */ },
  "upgrade": {
    "newLevel":     3,
    "currentRate":  0.10,
    "nextRate":     0.125,
    "upgradeCost":  8000,
    "atMaxLevel":   false
  }
}
```
`nextRate` and `upgradeCost` are `null` when `newLevel === MAX_INTEREST_LEVEL`.

---

## 12. Weapons System

**Files:** `app/api/shop/buy/route.ts`, `app/api/shop/sell/route.ts`, `lib/game/power.ts`

### Attack Weapons (PP ranking: additive per unit, Combat power: additive per unit)

| Weapon | PP value | Combat power | Max/player | Cost (iron) |
|---|---|---|---|---|
| slingshot | 2 | 2 | 25 | 200 |
| boomerang | 5 | 5 | 12 | 400 |
| pirate_knife | 12 | 12 | 6 | 800 |
| axe | 28 | 28 | 3 | 1,600 |
| master_knife | 64 | 64 | 1 | 3,200 |
| knight_axe | 148 | 148 | 1 | 6,400 |
| iron_ball | 340 | 340 | 1 | 12,800 |

PP values = combat power values (same numbers). PP is **additive per unit**.
Attack power formula in `power.ts`: `floor((baseUnits + Σ weaponCount×power) × trainMult)`
Race bonuses are **not** applied in stored power — stored power is race-agnostic (see §17).

### Defense Weapons (PP ranking: binary once owned, Combat power: multiplicative)

| Armor | PP bonus (binary) | Combat multiplier | Cost (gold) |
|---|---|---|---|
| wood_shield | 150 | ×1.10 | 1,500 |
| iron_shield | 800 | ×1.25 | 8,000 |
| leather_armor | 2,500 | ×1.40 | 25,000 |
| chain_armor | 8,000 | ×1.55 | 80,000 |
| plate_armor | 25,000 | ×1.70 | 250,000 |
| mithril_armor | 70,000 | ×1.90 | 700,000 |
| gods_armor | 150,000 | ×2.20 | 1,000,000g + 500,000i + 300,000w |

Defense multipliers **stack multiplicatively**. Full stack: 1.10×1.25×1.40×1.55×1.70×1.90×2.20 ≈ ×29.7.

### Spy / Scout Gear (PP ranking: binary, Combat: multiplicative multiplier on unit power)

| Gear | PP bonus | Combat multiplier | Cost (gold) |
|---|---|---|---|
| shadow_cloak / scout_boots | 500 | ×1.15 | 5,000 |
| dark_mask / scout_cloak | 2,000 | ×1.30 | 20,000 |
| elven_gear / elven_boots | 8,000 | ×1.50 | 80,000 |

### Sell Refund

```
refund = floor(originalCost × sellRefundPercent × amount)
       = floor(cost × 0.20 × amount)
```

20% of original purchase price. Source: `BALANCE.weapons.sellRefundPercent = 0.20`

---

## 13. Development Upgrades

**File:** `app/api/develop/upgrade/route.ts`
**Balance:** `BALANCE.production.developmentUpgradeCost`

### Cost Formula

```
nextLevel = currentLevel + 1

if nextLevel ≤ 2:  costCfg = { gold: 3,   resource: 3   }
elif nextLevel ≤ 3: costCfg = { gold: 9,   resource: 9   }
elif nextLevel ≤ 5: costCfg = { gold: 50,  resource: 50  }
else:               costCfg = { gold: 500, resource: 500 }

totalGold     = costCfg.gold     × nextLevel
totalResource = costCfg.resource × nextLevel
```

Examples:
- Level 1→2: gold = 3×2 = 6, resource = 3×2 = 6
- Level 4→5: gold = 50×5 = 250, resource = 50×5 = 250
- Level 9→10: gold = 500×10 = 5,000, resource = 500×10 = 5,000

### Development Fields

| Field | Resource deducted | Effect |
|---|---|---|
| `gold_level` | gold | production output ↑ |
| `food_level` | food | production output ↑ |
| `wood_level` | wood | production output ↑ |
| `iron_level` | iron | production output ↑ |
| `population_level` | gold (only) | pop growth/tick ↑ |
| `fortification_level` | gold + wood | defense power ↑ |

Fortification no longer updates `players.capacity` — there is no unit capacity cap.

---

## 14. City System & Progression

**Balance:** `BALANCE.cities`

### Cities

| # | Name |
|---|---|
| 1 | Izrahland |
| 2 | Masterina |
| 3 | Rivercastlor |
| 4 | Grandoria |
| 5 | Nerokvor |

### City Promotion

- Promotion is **irreversible** (1 → 2 → 3 → 4 → 5 only, no downgrade)
- Can happen any time if requirements are met (even daily)
- Player **must not be in a clan/tribe** to promote
- City affects **only slave production output** — no effect on combat, power, loot, or bank

**Promote route:** `POST /api/city/promote`

Gate order (route-level, fast pre-validation):
auth → season freeze → city < maxCity → **not in tribe** → soldiers ≥ requirement → resources ≥ cost

Then calls the **`city_promote_apply()` RPC** (migration `0012_city_promote_rpc.sql`) which:
1. Acquires `FOR UPDATE` row locks on `players` + `resources` + `army` (single JOIN, no deadlock risk — one player only)
2. Re-validates all conditions after locking (TOCTTOU-safe)
3. Applies both writes in one Postgres transaction: `resources` deduction + `players.city = nextCity`
4. Returns the updated snapshot: `{ ok, city, gold, wood, iron, food }`

If any re-validation fails inside the RPC, the transaction is rolled back automatically — **no partial state is possible**.

Response shape: `{ data: { city, city_name, slave_production_mult, resources: { gold, wood, iron, food } } }`

**Error codes:** `ALREADY_MAX_CITY` · `IN_TRIBE` · `NOT_ENOUGH_SOLDIERS` · `NOT_ENOUGH_RESOURCES`

**Deprecated:** `POST /api/develop/move-city` → returns 410 Gone; use `/api/city/promote`.

**Files:** `app/api/city/promote/route.ts` · `supabase/migrations/0012_city_promote_rpc.sql`

**BALANCE keys:** `cities.maxCity` · `cities.promotion.soldiersRequiredByCity` · `cities.promotion.resourceCostByCity` · `cities.promotionThresholds`

**Files (threshold formula):** `lib/game/city-thresholds.ts` · `lib/game/city-thresholds.test.ts`

#### Promotion Threshold Formula

The six `promotionThresholds` parameters define a geometric-growth formula for computing per-city requirements programmatically. This is the canonical definition; the lookup tables below are tuned from these values.

```
soldiersRequired(city)   = floor(S_base  × s_growth ^ (city-1))
populationRequired(city) = floor(P_base  × p_growth ^ (city-1))
resourcesRequired(city)  = floor(R_base  × r_growth ^ (city-1))
```

At `city=1` the exponent is 0, so each result equals the base value exactly. Growth factors `≥ 1` guarantee monotonic increase.

| Parameter | Value | Rule | Meaning |
|---|---|---|---|
| `S_base` | 20 | > 0 | Soldiers at city 1 |
| `P_base` | 50 | > 0 | Population at city 1 |
| `R_base` | 2,000 | > 0 | Gold-equivalent resources at city 1 |
| `s_growth` | 5 | ≥ 1 | Soldier multiplier per tier |
| `p_growth` | 2 | ≥ 1 | Population multiplier per tier |
| `r_growth` | 4 | ≥ 1 | Resource multiplier per tier |

All six parameters validated by `validateBalance()` at boot (finite, base > 0, growth ≥ 1).

**Derived thresholds (city 1–5):**

| City | Soldiers | Population | Resources (gold-equiv) |
|---|---|---|---|
| 1 | 20 | 50 | 2,000 |
| 2 | 100 | 100 | 8,000 |
| 3 | 500 | 200 | 32,000 |
| 4 | 2,500 | 400 | 128,000 |
| 5 | 12,500 | 800 | 512,000 |

#### Soldiers Required

| Target City | Min Soldiers |
|---|---|
| 2 | 100 [TUNE] |
| 3 | 500 [TUNE] |
| 4 | 2,000 [TUNE] |
| 5 | 10,000 [TUNE] |

#### Resource Cost

| Target City | Gold | Wood | Iron | Food |
|---|---|---|---|---|
| 2 | 5,000 | 2,000 | 1,000 | 500 |
| 3 | 20,000 | 8,000 | 4,000 | 2,000 |
| 4 | 80,000 | 30,000 | 15,000 | 8,000 |
| 5 | 300,000 | 100,000 | 50,000 | 25,000 |

All values [TUNE].

### Slave Production Multiplier by City

Applied as `cityMult` in `calcSlaveProduction()` — multiplies slave resource output per tick only.

`produced = floor(slavesAllocated × rate × cityMult × vipMult × (1 + slaveBonus))`

**BALANCE key:** `cities.slaveProductionMultByCity`

| City | Name | Multiplier |
|---|---|---|
| 1 | Izrahland | ×1.0 [TUNE] |
| 2 | Masterina | ×1.3 [TUNE] |
| 3 | Rivercastlor | ×1.7 [TUNE] |
| 4 | Grandoria | ×2.2 [TUNE] |
| 5 | Nerokvor | ×3.0 [TUNE] |

### Clan-City Restriction

Players must leave clan/tribe before promoting. After leaving, they may promote immediately. The `tribe_members` table is checked at promotion time; if a row exists for the player, promotion is blocked with `IN_TRIBE` error.

---

## 15. Season System & Freeze Mode

**File:** `lib/game/season.ts`
**Duration:** 90 days
**Balance:** `BALANCE.season`

### Active Season Check

```typescript
getActiveSeason(supabase): Season | null
// Queries: status='active' AND ends_at > now()
// Returns null if season ended, expired, or missing
```

### Freeze Response

```
HTTP 423 (Locked)
{ "error": "SeasonEnded", "message": "Season has ended. Game is in freeze mode." }
```

### Routes with Freeze Guard (25 total)

All gameplay write routes call `getActiveSeason()` immediately after auth check.

**Exceptions — no freeze guard:**
- `POST /api/admin/season/reset` (admin only)
- `POST /api/auth/register`
- `POST /api/mine/allocate`

### Season Reset (Admin)

`POST /api/admin/season/reset` — hard reset: deletes all data in FK-safe order, creates Season 1 with `created_by = null`.

Delete order:
```
tribe_spells → tribe_members → hero_spells → player_hero_effects →
spy_history → attacks → hero → bank → development → training →
weapons → army → resources → hall_of_fame → tribes →
[null out season_id on seasons] → seasons → players
```

### Hall of Fame

`BALANCE.season.hallOfFamePlayers = 20`, `hallOfFameTribes = 5`. Populated at season end (mechanism not implemented in API routes — no `/api/season/end` route).

---

## 16. Catch-Up Multiplier (Late Join)

**File:** `lib/utils.ts` → `getCatchUpMultiplier(seasonStartDate: Date): number`

```
daysSinceStart = floor((Date.now() − seasonStart) / (1000 × 60 × 60 × 24))

daysSinceStart ≤ 7:  multiplier = 1
daysSinceStart ≤ 30: multiplier = 2
daysSinceStart ≤ 60: multiplier = 5
daysSinceStart ≤ 80: multiplier = 10
daysSinceStart > 80: multiplier = 20
```

Applied at registration:
```
gold  = 5000 × catchUpMult
iron  = 5000 × catchUpMult
wood  = 5000 × catchUpMult
food  = 5000 × catchUpMult
```

`free_population` is fixed at 50 (not multiplied).

---

## 17. Stored Power vs. Combat PP

**File:** `lib/game/power.ts` (stored), `lib/game/combat.ts` (combat)

These are **two different systems** that diverge in important ways:

| Aspect | Stored Power (`power.ts`) | Combat ECP (`combat.ts`) |
|---|---|---|
| Purpose | Rankings, display | Combat ECP calculation |
| Storage | `players.power_attack/defense/spy/scout/total` | Computed fresh per combat |
| Race bonuses | **Removed** — clean ranking power only | **Applied via `raceBonus` param to `calculateECP()`** |
| Defense formula | `baseUnits × defWeaponMult × trainMult × fortMult` | Uses PP weights (all 1.0) |
| Attack formula | `(baseUnits + weaponPower) × trainMult` | Uses SoldierScore+EquipScore+SkillScore |
| Fortification | Applied via `fortMult = 1 + (level−1) × 0.10` | Applied via DevScore += `level × 100` |
| Tribe multiplier | Not applied | Applied on final ECP after all PP multipliers |

**Stored power** = clean ranking power. It reflects what units and upgrades a player has, without race modifiers.
**Combat ECP** = strategic combat power. Race bonuses are added here via `raceBonus` parameter, applied as `PP × (1 + raceBonus)` before ClanBonus is added.

### Stored Power Component Formulas (`lib/game/power.ts`)

```
baseAttackUnits  = soldiers + cavalry × 2
baseDefenseUnits = soldiers + cavalry × 2     (same as attack)

attackTrainMult  = 1 + attack_level  × 0.08
defenseTrainMult = 1 + defense_level × 0.08
spyTrainMult     = 1 + spy_level     × 0.08
scoutTrainMult   = 1 + scout_level   × 0.08

attackWeaponPower = Σ (count × weaponPPValue)   // per weapon type, additive

defWeaponMult = 1.0
    × (wood_shield   > 0 ? 1.10 : 1)
    × (iron_shield   > 0 ? 1.25 : 1)
    × (leather_armor > 0 ? 1.40 : 1)
    × (chain_armor   > 0 ? 1.55 : 1)
    × (plate_armor   > 0 ? 1.70 : 1)
    × (mithril_armor > 0 ? 1.90 : 1)
    × (gods_armor    > 0 ? 2.20 : 1)

// Multipliers from BALANCE.pp.SPY_GEAR_MULT and BALANCE.pp.SCOUT_GEAR_MULT (config/balance.config.ts)
spyWeaponMult = 1.0
    × (shadow_cloak > 0 ? BALANCE.pp.SPY_GEAR_MULT.shadow_cloak : 1)  // 1.15
    × (dark_mask    > 0 ? BALANCE.pp.SPY_GEAR_MULT.dark_mask    : 1)  // 1.30
    × (elven_gear   > 0 ? BALANCE.pp.SPY_GEAR_MULT.elven_gear   : 1)  // 1.50

scoutWeaponMult = 1.0
    × (scout_boots  > 0 ? BALANCE.pp.SCOUT_GEAR_MULT.scout_boots  : 1)  // 1.15
    × (scout_cloak  > 0 ? BALANCE.pp.SCOUT_GEAR_MULT.scout_cloak  : 1)  // 1.30
    × (elven_boots  > 0 ? BALANCE.pp.SCOUT_GEAR_MULT.elven_boots  : 1)  // 1.50

// BALANCE.pp.FORTIFICATION_MULT_PER_LEVEL = 0.10 (config/balance.config.ts)
fortMult = 1 + (fortification_level − 1) × BALANCE.pp.FORTIFICATION_MULT_PER_LEVEL  // ← applied to stored defense only

power_attack = floor((baseAttackUnits + attackWeaponPower) × attackTrainMult)
power_defense = floor(baseDefenseUnits × defWeaponMult × defenseTrainMult × fortMult)
power_spy    = floor(spies  × spyTrainMult  × spyWeaponMult)
power_scout  = floor(scouts × scoutTrainMult × scoutWeaponMult)
```

> Note: `fortMult` applies only to **stored** defense power (rankings). In combat, fortification contributes via `DevScore += fortification_level × 100` inside `calculatePersonalPower()` — a different treatment.

### Power Total (Ranking)

```
power_total = power_attack + power_defense + power_spy + power_scout
```

Simple sum. Rankings sorted by `power_total` descending.

---

## 18. Race Bonuses

**Balance:** `BALANCE.raceBonuses`

| Race | Bonus | Applied in |
|---|---|---|
| orc | +10% attack ECP, +3% defense ECP | `attack/route.ts` → `resolveCombat(attackerRaceBonus/defenderRaceBonus)` |
| human | +15% gold production, +3% attack ECP | tick route (gold only), attack route |
| elf | +20% spy, +20% scout | `spy/route.ts` |
| dwarf | +15% defense ECP, +3% gold production | attack route, tick route (gold only) |

Race bonuses are:
- **Applied in combat ECP** via `raceBonus` param to `calculateECP()` (source: `attack/route.ts` helpers)
- **Applied in tick gold production** via `raceGoldBonus` param to `calcSlaveProduction()` (human: 0.15, dwarf: 0.03)
- **Applied in spy route** for spy/scout mission power (elf bonus)
- **Not** applied in stored power (`power.ts`) — stored power is clean ranking power without race modifiers
- **Not** applied in `calculatePersonalPower()` — PP is race-agnostic

---

## 19. VIP System

**Balance:** `BALANCE.vip`

| Effect | Value | Applied |
|---|---|---|
| Production multiplier | ×1.10 | `calcSlaveProduction()`, `calcPopulationGrowth()` |
| Hero mana bonus/tick | +1 | `calcHeroManaGain()` |
| Weekly turns bonus | +50 | **[MISSING]** — no route applies this |
| Bank interest bonus | +0 | `calcBankInterest()` (value is 0 — no effect) |

VIP status: `players.vip_until` (TIMESTAMPTZ). Checked via `isVipActive(vip_until)`.
Crystal purchase flow for VIP: `vip.crystalCost = 500` crystals, no purchase route implemented.

---

## 20. Registration Flow

**File:** `app/api/auth/register/route.ts`

### Validation

- `username`: 3–20 chars, `/^[a-zA-Z0-9]+$/`
- `email`: valid email format
- `password`: ≥ 8 chars
- `army_name`: 3–20 chars
- `race`: `orc | human | elf | dwarf`

### DB Writes (parallel, 8 rows)

1. `players.insert(...)` — created sequentially first for ID
2. `resources.insert(gold/iron/wood/food = 5000 × catchUpMult)`
3. `army.insert(free_population = 50)` — all combat units = 0
4. `weapons.insert(...)` — all columns default 0
5. `training.insert(...)` — all levels default 0
6. `development.insert(...)` — all levels default 1
7. `hero.insert(...)` — level=1, mana=0
8. `bank.insert(...)` — balance=0

**No freeze guard** on registration.

---

## 21. Rankings

**File:** `app/api/tick/route.ts` — Step 7

**DB fields** — `players` table, both `INT NULL` (no DEFAULT — `NULL` until first tick):
- `rank_global` — 1-based position among ALL players in the season
- `rank_city`   — 1-based position among players in the same city (1–5)

Indexes: `idx_players_rank_global ON players(rank_global)`, `idx_players_rank_city ON players(city, rank_city)`.

**Computation (tick only — never recalculated elsewhere):**
1. After `recalculatePower()` runs for all players, re-fetch `id, power_total, city, joined_at`
2. Sort once with stable rule:
   - Primary: `power_total DESC`
   - Tie-break: `joined_at ASC` (player who joined earlier ranks higher on equal power)
3. Global rank: assign 1-based index from the global sorted list → `rank_global`
4. City rank: filter per city (1..5) from the same sorted list, assign 1-based index → `rank_city`
5. Batch-write both fields: `Promise.all` of one `UPDATE players SET rank_global=?, rank_city=? WHERE id=?` per player

**Update timing:** Computed and persisted ONLY on tick (every 30 minutes via Vercel Cron, `*/30 * * * *`). No other route touches these fields.

**API:** `GET /api/player` and the server-side `app/(game)/layout.tsx` both SELECT `rank_city,rank_global` explicitly. The `Player` TypeScript type (`types/game.ts:102-103`) defines both as `number | null`.

**Sidebar display** (`components/layout/Sidebar.tsx:186-201`):
- Reads `player.rank_global` and `player.rank_city` from `usePlayer()` (fed by `PlayerContext` initial SSR data + refreshed on any mutation)
- Renders a "Ranking" section label followed by two rows:
  - `Global Rank  #N` (or `—` while null, i.e. before first tick)
  - `City Rank    #N` (or `—` while null)

---

## 22. Known Gaps / Inconsistencies / Missing / Tuning Needed

### A. Inconsistencies (code contradicts itself)

| # | Issue | Location |
|---|---|---|
| I1 | **`maxLifetimeDeposits` vs `depositsPerDay`.** Both = 5 but `maxLifetimeDeposits` is never referenced in code. The actually enforced limit is `depositsPerDay`. | `balance.config.ts` |
| ~~I2~~ | ~~**`players.max_turns` DB default = 30** vs `BALANCE.tick.maxTurns = 200`. DB column unused in logic.~~ | **Resolved (Audit #4)** — column removed from all SELECT queries; `@deprecated` in `types/game.ts`; structural guard in `lib/game/max-turns-audit.test.ts`. |
| ~~I3~~ | ~~`players.capacity` DB default mismatch~~ | **Resolved** — capacity gate removed entirely; `players.capacity` column is legacy (not read or written). |
| ~~I4~~ | ~~**`BALANCE.combat.FOOD_PER_SOLDIER`** (dead constant). Documented as `food_cost = soldiers × FOOD_PER_SOLDIER` but no route uses this formula. Actual cost: `turns × foodCostPerTurn`.~~ | **Resolved (Audit #5)** — `foodCostPerTurn` removed; route + UI now use `soldiers × FOOD_PER_SOLDIER × turns` exclusively; 17 structural tests in `lib/game/food-formula.test.ts`. |
| I5 | **`calcTurnsAfterRegen`** in `combat.ts` is dead production code — only called from tests. Tick route uses `calcTurnsToAdd(turns, isVacation)` from `tick.ts` (with vacation modifier). | `lib/game/combat.ts:574` |

### B. Missing Implementations

| # | Feature | Status |
|---|---|---|
| M1 | ~~Cavalry untrain~~ | **Removed** — training is irreversible by design |
| M2 | Hall of Fame population | Season-end snapshotting not implemented |
| M3 | VIP weekly turns bonus | `weeklyTurnsBonus = 50` in BALANCE; no route applies it |
| M4 | Hero XP leveling | `hero.xp` column + `xpPerLevel` in BALANCE; no route increments XP |
| M5 | Crystal purchase flow | Packages defined in BALANCE; no purchase route |
| M6 | Season promotion gate for protection | New-player protection implemented; season promotion itself has no route |

### C. Tuning Needed (constants set to placeholder values)

| # | Constant | Current Value | Impact |
|---|---|---|---|
| T1 | PP weights (`W_SOLDIERS` etc.) | All `1.0` placeholder | Target power distribution not met |
| T2 | `SOLDIER_V`, `SOLDIER_K` | `1`, `3` placeholder | Tier balance untuned |
| T3 | `combat.BASE_LOSS` | `0.15` placeholder | Loss rates untuned |
| T4 | Race bonuses (orc/human/elf/dwarf values) | Set but [TUNE] | May need adjustment after playtesting |
| T5 | Bank interest levels (`INTEREST_RATE_BY_LEVEL`) | 0%…30% across 11 tiers (levels 0–10) [TUNE] | May need adjustment after playtesting |
| T6 | City slave production multipliers (`slaveProductionMultByCity`) | 1.0/1.3/1.7/2.2/3.0 [TUNE] | May need adjustment after playtesting |
| T7 | City promotion soldiers required (`promotion.soldiersRequiredByCity`) | 100/500/2K/10K [TUNE] | May need adjustment after playtesting |
| T7b | City promotion resource cost (`promotion.resourceCostByCity`) | See §14 table [TUNE] | May need adjustment after playtesting |
| T8 | Tribe spell multipliers (`spellEffects`) | 1.15/1.25/1.20 [TUNE] | May need adjustment after playtesting |

### D. Refactor Hotspots

| # | Issue | Recommendation |
|---|---|---|
| R1 | ~~6 separate Supabase calls in attack route. No transaction.~~ | ✅ **Resolved** — `attack_resolve_apply()` RPC (`0013_attack_resolve_rpc.sql`) is the sole write path; row-level locks + single Postgres transaction guarantee atomicity |
| R2 | **Power recalc on every tick for every player.** `N × 5` queries per tick. | Debounce or compute lazily on read |
| R3 | ~~Diagnostic logging in attack route. 20+ `console.log` lines.~~ | ✅ **Resolved** — all `[ATK_DIAG]` blocks removed |

---

## 23. Recent Changes

### 2026-03-05 — Rate Limiting: Attack / Spy 1 s Cooldown

Added server-side 1 s cooldown for attack and spy actions to prevent spam and unnecessary DB load.

- `supabase/migrations/0016_rate_limiting.sql`: adds `last_attack_at TIMESTAMPTZ` and `last_spy_at TIMESTAMPTZ` columns to `players` (DEFAULT NULL); recreates `attack_resolve_apply` and `spy_resolve_apply` with `last_attack_at = now()` / `last_spy_at = now()` merged into the existing `UPDATE players SET turns = ...` statement (same transaction, no extra DML)
- `app/api/attack/route.ts`: moved `const now = new Date()` to top of handler; added 429 cooldown check before gate checks (`now - last_attack_at < 1_000 ms`)
- `app/api/spy/route.ts`: added `const now = new Date()`; added `last_spy_at` to player SELECT; added 429 cooldown check (`now - last_spy_at < 1_000 ms`)
- `types/game.ts`: added `last_attack_at: string | null` and `last_spy_at: string | null` to `Player` interface
- `lib/game/rate-limiting.test.ts`: **new** — 23 tests (attack structural ×5, spy structural ×5, migration structural ×5, pure-logic gate scenarios ×8)
- `docs/GameMechanics-SingleSourceOfTruth.md`: §26 "Rate Limiting" added

### 2026-03-05 — Untrain Removed: Training is irreversible

All unit conversions are now one-way. There is no untrain for any unit type.

- `app/api/training/untrain/route.ts`: replaced with 410 Gone tombstone. Body: `{ error: 'Untrain removed: training is irreversible' }`.
- `app/(game)/training/TrainingClient.tsx`: Untrain tab removed from `TRAIN_TABS`. All untrain state, handlers, and JSX deleted. `/api/training/untrain` is no longer called from anywhere in the UI.
- `lib/game/training-rules.test.ts`: GROUP 1 updated (route returns 410, no DB logic); GROUP 2 updated (irreversibility pure-logic tests); GROUP 7 updated (no untrain tab in UI).
- `docs/GameMechanics-SingleSourceOfTruth.md`: irreversibility rule added to §4 header; untrain subsection removed; population table updated.

**Slave clarification:** Slaves are a workforce unit. Unallocated slaves produce nothing. Allocate via `/api/mine/allocate`.

**515 → 515 tests passing (35 in training-rules.test.ts — net −1 from removed logic tests + new irreversibility tests). 0 TypeScript errors.**

### 2026-03-05 — Training Rules: Cavalry popCost, Cavalry permanence, enableCavalry toggle

Three behaviour changes (untrain slaves-only step has since been superseded by full untrain removal):

**A) ~~Untrain: slaves only~~ → superseded: training is now fully irreversible**

**B) Cavalry cost: 5 free_population per cavalry (no soldier requirement)**
- `config/balance.config.ts`: cavalry config changed from `{ soldierRatio: 5 }` to `{ popCost: 5 }`.
- `lib/game/balance-validate.ts`: cavalry schema updated accordingly.
- `app/api/training/basic/route.ts`: removed soldier-ratio gate; added population gate (`amount * popCost` free_pop required); cavalry now deducts free_population.
- `app/(game)/training/TrainingClient.tsx`: `canAffordTrain` updated; cavalry requirements text updated to "Costs 5 free population each".

**C) Cavalry permanent — cannot be killed in combat**
- Already true: `attack_resolve_apply` RPC never updates `cavalry` column. Attack route always has `cavalry: 0` in losses and carries `attArmy.cavalry` unchanged in snapshots. No changes needed — confirmed and documented.

**D) enableCavalry feature toggle**
- `config/balance.config.ts`: `BALANCE.training.enableCavalry: true` added (default on).
- `lib/game/balance-validate.ts`: `enableCavalry: z.boolean()` added to training schema.
- `app/api/training/basic/route.ts`: early guard — `if (unit === 'cavalry' && !BALANCE.training.enableCavalry) → 400 'Cavalry is disabled'`.
- `app/(game)/training/TrainingClient.tsx`: cavalry row hidden via `.filter()` when `!enableCavalry`; StatBox cavalry row hidden; population text adapts.

**Tests added:** `lib/game/training-rules.test.ts` — 36 tests (GROUP 1: untrain schema; GROUP 2: untrain pure logic; GROUP 3: cavalry popCost structural; GROUP 4: feature flag structural; GROUP 5: cavalry train pure logic; GROUP 6: combat permanence; GROUP 7: UI toggle).
**Balance test updated:** `lib/game/balance.test.ts` — `soldierRatio` → `popCost`, `enableCavalry` boolean check added.

**To disable cavalry: set `BALANCE.training.enableCavalry = false` in `config/balance.config.ts`. Single place. No other changes needed.**

**479 → 515 tests passing, 0 TypeScript errors.**

### 2026-03-05 — BIGINT Fix: Math.ceil for Food Formula

Fixed Postgres error `22P02: invalid input syntax for type bigint` caused by fractional food costs (e.g. 4 soldiers × 0.05 × 1 turn = 0.2). Canonical rounding rule: `foodCost = Math.ceil(soldiers × FOOD_PER_SOLDIER × turns)`.

- `app/api/attack/route.ts`: `const foodCostRaw = attArmy.soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turnsUsed; const foodCost = Math.ceil(foodCostRaw)`
- `components/game/AttackDialog.tsx`: `const foodCost = Math.ceil(armySoldiers * BALANCE.combat.FOOD_PER_SOLDIER * turns)`
- `lib/game/food-formula.test.ts`: `calcFoodCost` helper now uses `Math.ceil`; GROUP 2 expected values wrapped in `Math.ceil`; GROUP 3 monotonicity changed to `toBeGreaterThanOrEqual`; GROUP 5/6 pure-logic updated; GROUP 7 added (8 tests: explicit rounding cases 4s/1t→1, 20s/1t→1, 21s/1t→2; always-integer invariant; structural `Math.ceil` checks in route + dialog)
- `docs/GameMechanics-SingleSourceOfTruth.md`: Food Consumption Formula updated with `ceil(...)` + BIGINT rationale; UI Consistency Rule + Server Authority Rule updated to mandate `Math.ceil`; test count 24→32

**Test delta: +8 tests (GROUP 7). 0 TypeScript errors.**

### 2026-03-05 — Security Hardening: Server Authority for Food Cost

Confirmed attack route enforces canonical food formula server-side; added GROUP 6 structural + logic tests; documented Server Authority Rule in SSOT.

- `app/api/attack/route.ts`: already correct — `const foodCost = attArmy.soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turnsUsed` + `if (attResources.food < foodCost)` gate at line 93. No changes needed.
- `app/api/spy/route.ts`: confirmed no food validation needed — spy consumes turns only, not food. No legacy identifiers present.
- `lib/game/food-formula.test.ts`: GROUP 6 added (11 tests) — structural: route has `attResources.food < foodCost` guard, returns `'Not enough food'`, foodCost computed before guard; pure-logic: 10s/1t reject-at-zero, accept-at-cost, 10s/5t reject-below/accept-at, 1000s/10t reject-at-zero, soldiers=0 bypass; spy structural: no `FOOD_PER_SOLDIER`, no legacy identifiers
- `docs/GameMechanics-SingleSourceOfTruth.md`: Server Authority Rule subsection added with code snippet, route table, and test reference

**439 → 450 tests passing, 0 TypeScript errors.**

### 2026-03-05 — Attack Page UX: AttackDialog + Spy Integration

Moved turn selection out of the attack table into a dedicated dialog. Spy action added to the same dialog.

- `components/game/AttackDialog.tsx`: **new** — full-screen modal with ATTACK/SPY tabs; turn stepper (1–10) + range slider; food cost preview using `armySoldiers × FOOD_PER_SOLDIER × turns`; client-side validation (not enough food / soldiers / turns) with inline errors; spy tab with spy count stepper + requirements preview + outcome descriptions; SpyResultModal in AttackClient shows revealed intel on success
- `app/(game)/attack/AttackClient.tsx`: removed "Turns" and "Food Cost" columns from attack table; removed old inline turns `<Input>` per row; Attack button now opens AttackDialog directly; added `executeSpy()` function; added spy result state + modal; table headers reduced to 7 columns
- `lib/game/food-formula.test.ts`: GROUP 5 added — 7 UI structural tests: dialog uses `BALANCE.combat.FOOD_PER_SOLDIER`, no `foodCostPerTurn`, multiplies by `armySoldiers`, imports from canonical module; explicit 10-soldier/1-turn and 10-soldier/5-turn cases; UI-backend formula equivalence proof
- `docs/GameMechanics-SingleSourceOfTruth.md`: Food section updated with `AttackDialog` as the UI location; UI Consistency Rule subsection added; test count updated (17→24)

### 2026-03-05 — Audit #5: Food Consumption Formula Standardization

Standardized food consumption to the single canonical formula: `soldiers × FOOD_PER_SOLDIER × turns`. Removed `foodCostPerTurn` from all code paths.

- `config/balance.config.ts`: `FOOD_PER_SOLDIER: 0.05`; removed `foodCostPerTurn`
- `lib/game/balance-validate.ts`: Zod enforces `FOOD_PER_SOLDIER: z.number().finite().min(0)`; removed `foodCostPerTurn` field
- `app/api/attack/route.ts`: `const foodCost = attArmy.soldiers * BALANCE.combat.FOOD_PER_SOLDIER * turnsUsed`
- `app/(game)/attack/AttackClient.tsx`: `(army?.soldiers ?? 0) * BALANCE.combat.FOOD_PER_SOLDIER * t`
- `lib/game/food-formula.test.ts`: **new** — 17 tests (constant invariants, canonical examples, linear scaling, structural contract)
- `lib/game/attack-integrity.test.ts`, `mutation-patterns.test.ts`, `attack-resolve.test.ts`, `balance.test.ts`: updated to new formula
- Inconsistency I4 resolved — `FOOD_PER_SOLDIER` is now the live single constant, not a dead tuning note

### 2026-03-05 — Audit #4: Max Turns SSOT (`players.max_turns` → dead/legacy)

Removed `players.max_turns` from all DB SELECT queries and confirmed `BALANCE.tick.maxTurns = 200` is the sole turn-cap authority.
- `app/api/tick/route.ts`: removed `max_turns` from SELECT string (it was fetched but never used — tick uses `calcTurnsToAdd` which reads `BALANCE.tick.maxTurns`)
- `app/api/player/route.ts`: removed `max_turns` from SELECT string
- `app/(game)/layout.tsx`: removed `max_turns` from SELECT string
- `app/(game)/settings/page.tsx`: removed `max_turns` from SELECT string
- `app/(game)/settings/SettingsClient.tsx`: removed `max_turns: number` from Props interface
- `types/game.ts`: added `@deprecated` JSDoc to `max_turns: number` field
- `lib/game/max-turns-audit.test.ts`: **new** — 14 structural tests: no route SELECTs `max_turns`, tick helper uses BALANCE cap, `calcTurnsToAdd` clamps correctly
- DB column unchanged — retained in schema, `@deprecated` in TS types, not read anywhere

### 2026-03-05 — City Promotion Threshold Formula Parameters

Added `promotionThresholds` to `BALANCE.cities` with six geometric-growth parameters (S_base, P_base, R_base, s_growth, p_growth, r_growth). Enforced with Zod invariants (base > 0, growth ≥ 1, all finite) in `validateBalance()`. Formula implemented in `lib/game/city-thresholds.ts`.
- `config/balance.config.ts`: new `cities.promotionThresholds` object (S_base=20, P_base=50, R_base=2000, s_growth=5, p_growth=2, r_growth=4)
- `lib/game/balance-validate.ts`: Zod schema for `promotionThresholds` with `.refine()` for base > 0 and growth ≥ 1
- `lib/game/city-thresholds.ts`: **new** — exports `soldiersRequired(city)`, `populationRequired(city)`, `resourcesRequired(city)`
- `lib/game/city-thresholds.test.ts`: **new** — 17 tests (config shape, city-1 base values, monotonicity, no NaN/Infinity, validateBalance rejection cases)
- `docs/GameMechanics-SingleSourceOfTruth.md`: §14 expanded with formula, parameter table, derived threshold table for cities 1–5

### 2026-03-05 — Bank Upgrade: Atomic RPC (`bank_interest_upgrade_apply`)

Made the bank interest upgrade fully atomic via `bank_interest_upgrade_apply()`.
- `supabase/migrations/0015_bank_upgrade_rpc.sql`: new RPC — FOR UPDATE lock on bank + resources; post-lock re-validation (already_max_level, stale_level, not_enough_gold); both writes in one transaction (gold deduction + level increment); GRANT to service_role
- `app/api/bank/upgrade/route.ts`: replaced `Promise.all([resources.update, bank.update])` with single `supabase.rpc('bank_interest_upgrade_apply', …)`; RPC error codes mapped via `BANK_UPGRADE_RPC_ERROR_MAP`; upgrade next-info recomputed from BALANCE after RPC success (no extra DB writes)
- `lib/game/bank-upgrade.test.ts`: 15 new tests — structural contract (1 rpc call, no direct .update on bank/resources), error-code mapping, upgrade cost formula, next-upgrade info, atomicity contract

### 2026-03-05 — Bank Interest Table + BALANCE Invariant Guards

Extended `INTEREST_RATE_BY_LEVEL` from 4 levels (0–3) to 11 levels (0–10, max rate 30%). Added `MAX_INTEREST_LEVEL = 10`.
- `config/balance.config.ts`: `INTEREST_RATE_BY_LEVEL` now covers levels 0–10 (0%→5%→7.5%→10%→12.5%→15%→17.5%→20%→22.5%→25%→30%); `MAX_INTEREST_LEVEL = 10`
- `lib/game/balance-validate.ts`: rich Zod `.refine()` guards for bank (level 0 present, non-negative, monotonically non-decreasing, MAX_INTEREST_LEVEL matches highest key) and cities (slaveProductionMultByCity covers 1..maxCity, all values > 0)
- `lib/game/balance.test.ts`: 2 new bank tests — interest table invariants + MAX_INTEREST_LEVEL key alignment
- `docs/GameMechanics-SingleSourceOfTruth.md`: §11 interest table updated with all 11 tiers + invariant notes

### 2026-03-05 — Spy: Atomic RPC (`spy_resolve_apply`)

Made all spy mission DB writes atomic via `spy_resolve_apply()`.
- `supabase/migrations/0014_spy_resolve_rpc.sql`: new RPC — FOR UPDATE lock on attacker's players + army; post-lock re-validation (turns, spies count); all three writes in one transaction (turns deduction, spies deduction, spy_history INSERT); GRANT to service_role
- `app/api/spy/route.ts`: replaced `Promise.all([players.update, army.update, spy_history.insert])` with single `supabase.rpc('spy_resolve_apply', …)`; RPC error codes mapped via SPY_RPC_ERROR_MAP; response now includes `spies` field; removed unused `nowIso` variable
- `lib/game/spy-resolve.test.ts`: 21 new tests — structural contract (1 rpc call, no direct .update/.insert), error-code mapping, spy power formula invariants, atomicity contract

**362 tests passing, 0 TypeScript errors.**

### 2026-03-05 — Attack: Canonical Atomic RPC (`attack_resolve_apply`)

**Renamed** `attack_multi_turn_apply` → `attack_resolve_apply` as the sole atomic write path for all attack mutations.
- `supabase/migrations/0013_attack_resolve_rpc.sql`: drops `attack_multi_turn_apply`; creates `attack_resolve_apply` with same 15-param signature + identical locking/re-validation/write logic; GRANTs updated
- `app/api/attack/route.ts`: updated RPC name + comment to reference migration 0013
- `lib/game/combat.ts`: updated JSDoc comment
- `lib/game/attack-resolve.test.ts`: 22 new tests — structural contract (1 rpc call, no direct .update), RPC error-code→HTTP mapping, pre-RPC invariant safety clamps for 10 combat scenarios
- `docs/GameMechanics-SingleSourceOfTruth.md`: all `attack_multi_turn_apply` references replaced; atomic write step expanded; migration ref updated

**341 tests passing, 0 TypeScript errors.**

### 2026-03-05 — City Promotion: Atomic RPC

**Made promotion atomic** via `city_promote_apply()` Postgres RPC.
- `supabase/migrations/0012_city_promote_rpc.sql`: new RPC — FOR UPDATE locks on players + resources + army; server-side re-validation inside transaction; both writes in one transaction; returns JSONB snapshot
- `app/api/city/promote/route.ts`: updated to call single `supabase.rpc('city_promote_apply', …)`; removed separate update calls; maps RPC error codes to HTTP responses
- `lib/game/city-promote.test.ts`: 19 new tests — config integrity, pre-validation logic, atomicity contract (structural: verifies exactly 1 rpc() call, no direct .update() on players/resources)

**319 tests passing, 0 TypeScript errors.**

### 2026-03-05 — City Promotion Feature

**Replaced** power-threshold gate with soldiers + resources + clan/tribe restriction.
- `config/balance.config.ts`: removed `S_base/P_base/R_base/s_growth/p_growth/r_growth/promotionPowerThreshold`, added `maxCity`, `promotion.soldiersRequiredByCity`, `promotion.resourceCostByCity`, renamed `CITY_PRODUCTION_MULT` → `slaveProductionMultByCity` (new values: 1.0/1.3/1.7/2.2/3.0)
- `lib/game/balance-validate.ts`: updated Zod schema for all new keys
- `lib/game/tick.ts`, `mine/MineClient.tsx`, `develop/DevelopClient.tsx`, `map/page.tsx`: renamed key
- `app/api/city/promote/route.ts`: initial rewrite — soldiers + resources + tribe guard
- `app/api/develop/move-city/route.ts`: deprecated → returns 410 Gone
- `lib/game/tick.test.ts`, `lib/game/balance.test.ts`: new tests for city multipliers and promotion config

### 2026-03-05 — Full System Audit + Dead Code Cleanup

**Files changed (5):**

- `app/api/attack/route.ts` — removed unused `isKillCooldownActive` import (attack route uses DB count query instead)
- `config/balance.config.ts` — moved hardcoded values from engine files into config:
  - `pp.SPY_GEAR_MULT` (shadow_cloak: 1.15, dark_mask: 1.30, elven_gear: 1.50)
  - `pp.SCOUT_GEAR_MULT` (scout_boots: 1.15, scout_cloak: 1.30, elven_boots: 1.50)
  - `pp.FORTIFICATION_MULT_PER_LEVEL: 0.10`
  - `production.DEV_OFFSET_PER_LEVEL: 0.5`
- `lib/game/power.ts` — replaced `SPY_WEAPON_MULTIPLIERS` and `SCOUT_WEAPON_MULTIPLIERS` local consts with `BALANCE.pp.SPY_GEAR_MULT`/`SCOUT_GEAR_MULT`; replaced hardcoded `0.10` with `BALANCE.pp.FORTIFICATION_MULT_PER_LEVEL`
- `lib/game/tick.ts` — replaced hardcoded `0.5` devOffset with `BALANCE.production.DEV_OFFSET_PER_LEVEL`
- `lib/game/balance-validate.ts` — added missing keys to Zod schema: `season.protectionStartDays`, `pp.SPY_GEAR_MULT`, `pp.SCOUT_GEAR_MULT`, `pp.FORTIFICATION_MULT_PER_LEVEL`, `production.DEV_OFFSET_PER_LEVEL`

**Audit deliverable:** `docs/System-Audit-Report.md` — full end-to-end audit (DB → backend → engine → API → UI → docs).

**Test result:** 292 passing, 0 TypeScript errors.

---

### 2026-03-05 — Captives feature + Kill Cooldown root-cause investigation

**Root cause of `KILL_COOLDOWN_NO_LOSSES` when `player_hero_effects` appeared empty:**
Kill cooldown is driven by the `attacks` table (historical records of completed attacks where `defender_losses > 0`), **not** `player_hero_effects` (active hero spell effects). Players checking `player_hero_effects` for rows were looking in the wrong table. The mechanism is correct. Debug logging added to `app/api/attack/route.ts` (`[attack/debug]` prefix) to make this diagnosable via server logs.

**Captives implemented:**

```
captives = floor(defenderLossesTotal × CAPTURE_RATE)   CAPTURE_RATE = 0.10
captives = 0  when defenderLossesTotal = 0 (kill cooldown / protection / shield)
```

**Files changed (10):**
- `config/balance.config.ts` — added `CAPTURE_RATE: 0.10`
- `lib/game/balance-validate.ts` — added `CAPTURE_RATE: z.number()` to combat Zod schema
- `lib/game/combat.ts` — added `calculateCaptives(defenderLosses: number): number`
- `types/game.ts` — added `captives: number` to `BattleReport.gained`
- `app/api/attack/route.ts` — computes captives; passes `p_slaves_taken` to RPC; populates `attacker.after.slaves` + `gained.captives` in BattleReport; adds `[attack/debug]` structured log
- `app/(game)/attack/AttackClient.tsx` — added "Captives" row in "You Gained" section of BattleReportModal
- `supabase/migrations/0011_attack_rpc_captives.sql` — drops 14-param RPC; new 15-param version writes `army.slaves = slaves + p_slaves_taken` atomically
- `lib/game/combat.test.ts` — added `calculateCaptives` tests (5 unit + 1 integration)
- `lib/game/balance.test.ts` — added `CAPTURE_RATE` type check
- `lib/game/mutation-patterns.test.ts` — added `captives: 0` to BattleReport fixture (TypeScript fix)

---

### 2026-03-05 — Kill Cooldown / Protection status in Attack UI + Battle Report

**Problem:** Kill cooldown and new-player protection were silently applied to combat (defender loses 0 soldiers) with no visible indicator. Players saw "enemy lost 0" with no explanation.

**Changes (3 files + docs):**

**`app/(game)/attack/page.tsx`:**
- Added `created_at` to `cityPlayers` select (required for protection check)
- Added `getActiveSeason(admin)` to parallel fetch (required for protection gate)
- Added kill-cooldown batch query: `attacks WHERE attacker_id=$me AND defender_id IN ($targets) AND defender_losses>0 AND created_at >= (now−6h)`
- Added `isNewPlayerProtected()` per-target computation using season gate
- Extended `targetList` with two new fields: `is_protected`, `kill_cooldown_active`

**`app/(game)/attack/AttackClient.tsx`:**
- `Target` interface: added `is_protected: boolean`, `kill_cooldown_active: boolean`
- `ShieldIndicators` → `StatusIndicators` (4 dots: resource shield, soldier shield, protection, kill cooldown)
- Table column renamed `Shields` → `Status`; legend updated for all 4 dot types
- Confirm modal: `Shields` label → `Status`; passes new fields to `StatusIndicators`
- **Battle Report modal:** "Why Nothing Was Gained" now also shows as "Combat Modifiers" when any reason is active but gains > 0 (e.g. kill cooldown active + loot gained). This ensures kill cooldown and other modifiers are always explained, not only when gains are zero.
- `REASON_LABELS` strings updated for clarity (include cooldown hours, shield specifics)

**`docs/GameMechanics-SingleSourceOfTruth.md`:**
- §7 Kill Cooldown section expanded with UI mapping
- New §7 subsections: "Status Column (Attack Targets Table)" and "Battle Report Flags and UI Mapping"

---

### 2026-03-05 — Binary combat outcome (no draw/partial)

**Root cause fixed:** Attacker ECP 1,250 vs defender ECP 1,205 (ratio ≈ 1.04) was showing "Draw" because `WIN_THRESHOLD` was 1.30 — ratio 1.04 fell in the old `[0.75, 1.30)` partial band, which mapped to `'draw'` in the DB and "Draw" in the UI.

**Rule change:** Outcome is now strictly binary — `ratio >= 1.0 → 'win'`; `ratio < 1.0 → 'loss'`. No partial/draw exists.

**Files changed (11):**
- `config/balance.config.ts` — `WIN_THRESHOLD` changed from 1.30 → 1.0; `LOSS_THRESHOLD` removed; `LOOT_OUTCOME_MULTIPLIER.partial` removed
- `lib/game/balance-validate.ts` — removed `LOSS_THRESHOLD` and `partial` from Zod schema
- `lib/game/combat.ts` — `CombatOutcome` type narrowed to `'win' | 'loss'`; `determineCombatOutcome()` simplified to single threshold
- `types/game.ts` — `AttackOutcome` narrowed to `'win' | 'loss'`; `BattleReport.outcome` narrowed to `'WIN' | 'LOSS'`
- `app/api/attack/route.ts` — removed `partial → draw` DB mapping; removed `PARTIAL` from outcomeMap
- `app/(game)/attack/AttackClient.tsx` — removed `PARTIAL` from OUTCOME_COLORS/OUTCOME_LABELS; removed "and slaves" from confirm modal
- `app/(game)/history/HistoryClient.tsx` — removed `partial` from OUTCOME_BADGE; fixed `defOutcome` reversal
- `supabase/migrations/0010_binary_outcome_constraint.sql` — migrates `draw/crushing_win` → `'win'`, `crushing_loss` → `'loss'`; replaces constraint with `IN ('win', 'loss')`
- `lib/game/combat.test.ts` — updated outcome tests; removed partial tests; added "never draw" + boundary tests
- `lib/game/balance.test.ts` — removed `LOSS_THRESHOLD` check
- `docs/GameMechanics-SingleSourceOfTruth.md` — updated §7 outcome thresholds, soldier loss conditions, slaves section

**Also documented:** defenderLosses=0 while attackerLosses>0 is expected when kill cooldown is active (attacker killed defender soldiers within 6h). The `KILL_COOLDOWN_NO_LOSSES` reason code is included in the battle report. See §7 — "Conditions that force defenderLosses = 0".

**Slaves from combat (at time of this entry):** confirmed always 0 (intentional, reserved column). UI modal updated to not mention slaves. *(Superseded — captives implemented; see entry above.)*

---

### 2026-03-05 — Farmer unit completely removed

**Migration:** `supabase/migrations/0009_remove_farmer.sql`

The `Farmer` unit duplicated the slave-food allocation mechanic and was removed in its entirety.

**DB change:**
```sql
-- Backfill: existing farmers become slaves + food-assigned slaves
UPDATE army
SET slaves = slaves + farmers, slaves_food = slaves_food + farmers
WHERE farmers > 0;

ALTER TABLE army DROP CONSTRAINT IF EXISTS chk_farmers;
ALTER TABLE army DROP COLUMN IF EXISTS farmers;
```

**Code changes (17 files):**
- `types/game.ts` — removed `farmers` from `Army`, `SpyRevealedData`, `UnitType`
- `config/balance.config.ts` — removed `farmer` from `training.unitCost`
- `lib/game/balance-validate.ts` — removed `farmer` from training Zod schema
- `app/api/tick/route.ts` — food formula changed from `calcSlaveProduction(slaves_food + farmers, ...)` → `calcSlaveProduction(slaves_food, ...)`
- `app/api/training/basic/route.ts` — `farmer` removed from unit enum
- `app/api/training/untrain/route.ts` — `farmer` removed from unit enum (route later replaced with 410 tombstone)
- `app/api/spy/route.ts` — `farmers` removed from revealed data
- `app/(game)/layout.tsx` — `farmers: 0` removed from fallback army object
- `app/(game)/base/page.tsx` — Farmers row removed from army summary
- `app/(game)/training/TrainingClient.tsx` — farmer removed from all types, labels, state, and rendered lists
- `app/(game)/mine/MineClient.tsx` — farmer summary card and row removed
- `app/(game)/spy/SpyClient.tsx` — Farmers row removed from intel report
- `app/(game)/develop/DevelopClient.tsx` — food upgrade description updated from "farmer" to "food slave"
- `lib/game/combat.test.ts` — `farmers: 0` removed from army fixture
- `messages/en.json`, `messages/he.json` — both "farmers" keys removed

**Food production is now ONLY:**
```
foodProd = calcSlaveProduction(army.slaves_food, dev.food_level, city, vip_until, 0, slaveBonus)
```
Slaves must be explicitly allocated to food via `/api/mine/allocate`. Unallocated slaves produce nothing.

---

## 24. MISSING FROM DOCUMENTATION

Items that exist in the codebase but were not previously documented. Each is a real formula or behavior that affects gameplay.

---

### M-DOC-1: `calcTurnsAfterRegen` — second turn regen function in combat engine

**File:** `lib/game/combat.ts`
**Function:** `calcTurnsAfterRegen(currentTurns: number): number`

```typescript
export function calcTurnsAfterRegen(currentTurns: number): number {
  if (currentTurns >= BALANCE.tick.maxTurns) return currentTurns
  return Math.min(currentTurns + BALANCE.tick.turnsPerTick, BALANCE.tick.maxTurns)
}
```

**Status: Likely dead code.** This function is defined in `combat.ts` but is **not called by any route or other module**. The tick route uses `calcTurnsToAdd(currentTurns, isVacation)` from `lib/game/tick.ts` instead, which correctly handles the vacation modifier. `calcTurnsAfterRegen` omits the vacation modifier and is never called.

**Recommendation:** Delete from `combat.ts`. If turn regen is ever needed in combat context, import from `tick.ts`.

---

### M-DOC-2: `calcSlaveProduction` `avg` return value — computed but never consumed

**File:** `lib/game/tick.ts`
**Function:** `calcSlaveProduction(...): { min: number; max: number; avg: number }`

The function returns three values:
```typescript
return {
  min: Math.floor(slavesAllocated * rateMin),
  max: Math.floor(slavesAllocated * rateMax),
  avg: Math.floor(slavesAllocated * (rateMin + rateMax) / 2),
}
```

The tick route uses only `min` and `max`:
```typescript
const goldGained = Math.floor(goldProd.min + Math.random() * (goldProd.max - goldProd.min))
```

**`avg` is never read by any caller.** The MineClient displays it as the "Production per Tick" estimate in the UI (the `/api/mine/allocate` response returns it as `production`), but the tick itself does not use `avg` — actual production is a random value between `min` and `max`.

**Not a bug** — the UI showing `avg` as the estimate is correct UX. But consumers should know the actual tick value is randomised in [min, max], not exactly `avg`.

---

### M-DOC-3: Fortification multiplier — different treatment in stored power vs. combat PP

Already added to §17 but captured here for cross-reference since it was previously absent from all documentation:

| System | Formula | File |
|---|---|---|
| Stored power (rankings) | `fortMult = 1 + (fortification_level − 1) × 0.10` applied to `power_defense` | `lib/game/power.ts:~84` |
| Combat PP | `DevScore += fortification_level × 100` (capped at 10,000) | `lib/game/combat.ts` → `calculatePersonalPower()` |

At `fortification_level = 1`: stored `fortMult = 1.00` (neutral); combat DevScore += 100.
At `fortification_level = 5`: stored `fortMult = 1.40`; combat DevScore += 500.

The two systems scale differently. A player's visible `power_defense` ranking does not exactly predict their combat defensive ECP.

---

## 25. UI Update Rules (Immediate vs Tick-only)

**Added:** 2026-03-05
**Files:** `lib/context/PlayerContext.tsx`, all `app/(game)/*/` pages and `*Client.tsx` files

### Principle

All player-visible state is held in a single client-side store: `PlayerContext` (`lib/context/PlayerContext.tsx`). After every gameplay mutation the client updates the store **immediately** from the API response — no page reload, no router.refresh(), no re-fetch from Supabase. Two hard exceptions are **tick-only** fields that must never update mid-round.

---

### Mechanism

#### `applyPatch(patch: Partial<PlayerData>)` — synchronous immediate update

Defined in `PlayerContext.tsx`. Called by every `*Client.tsx` immediately after a successful mutation, passing the updated slice(s) returned by the API:

```typescript
applyPatch({ resources: data.resources })
applyPatch({ army: data.army, resources: data.resources })
applyPatch({ player: { ...player, turns: data.turns } })
```

`applyPatch` shallow-merges `patch.player` into the existing player object and replaces all other top-level slices wholesale. It enforces tick-only protection at the context level (see below).

#### `refresh()` — async background sync

Also from `PlayerContext`. Calls `GET /api/player` and overwrites the full store. Used after mutations whose full effect cannot be computed client-side (e.g. city change, training level upgrade). Does **not** need to be awaited — the UI is already updated by `applyPatch`.

#### `export const dynamic = 'force-dynamic'` on every page

All game pages set this to prevent Next.js router cache from serving stale SSR snapshots when the user navigates back to a page.

---

### Tick-only fields — NEVER update immediately

| Field | Reason |
|---|---|
| `player.rank_global` | Recomputed by tick across all players; client cannot know the correct new value |
| `player.rank_city` | Same — depends on all players in the city |
| Attack Table / Attack History | Target list (soldiers, gold, shields) reflects live enemy state; only updated by tick |

**Enforcement in `applyPatch`:**

```typescript
if (patch.player) {
  const { rank_global, rank_city, ...safePlayerPatch } = patch.player
  // rank_global and rank_city are silently dropped — tick is the only writer
  next.player = { ...prev.player, ...safePlayerPatch }
}
```

**`router.refresh()` is absent from `AttackClient.tsx`** intentionally. Adding it would re-run the SSR page and re-fetch the target list after every attack, which violates the tick-only rule.

---

### Per-page update contract

| Page / Client | After mutation | applyPatch slices | Also calls refresh()? |
|---|---|---|---|
| `BaseClient` | (display only — reads context) | — | — |
| `TrainingClient` | train | `army`, `resources` | After advanced upgrade (training levels change) |
| `BankClient` | deposit/withdraw/upgrade | `bank`, `resources` | No |
| `MineClient` | save allocations | `army` | No |
| `DevelopClient` | upgrade | `development`, `resources` | After city move (player.city changed in DB) |
| `ShopClient` | buy/sell | `weapons`, `resources` | No |
| `SpyClient` | spy mission | `player` (turns), `army` (scouts after catch) | No |
| `AttackClient` | attack | `player` (turns), `resources`, `army` (soldiers) | No |
| `HeroClient` | buy spell / activate shield | `hero` (spell_points or mana) | No |

---

### SSR data fetching rules (pages)

Pages only fetch data that is **not** already in `PlayerContext`:

| Page | What it still fetches server-side | What it no longer fetches |
|---|---|---|
| `base/page.tsx` | Nothing | Everything (pure context) |
| `training/page.tsx` | Nothing | player, army, training, resources |
| `bank/page.tsx` | Nothing | player, bank, resources |
| `mine/page.tsx` | Nothing | player, army, development |
| `develop/page.tsx` | Nothing | player, development, resources |
| `shop/page.tsx` | Nothing | player, weapons, resources |
| `spy/page.tsx` | Target list (other players in city) | player, army, training |
| `attack/page.tsx` | Target list + tribe/shield data | player, resources |
| `hero/page.tsx` | `hero_spells`, `player_hero_effects` | hero row (now in context) |

---

### Adding a new mutation — checklist

1. API route returns the updated slice(s) in the response body.
2. `*Client.tsx` calls `applyPatch({ slice: data.slice })` immediately after success.
3. If the mutation changes something only the server can recompute (city, tribe, rankings), also call `refresh()`.
4. Never call `router.refresh()` for gameplay mutations.
5. Never manually update `rank_global` or `rank_city` in client state.

---

## 26. Rate Limiting

**Added:** 2026-03-05
**Migration:** `supabase/migrations/0016_rate_limiting.sql`

### Overview

Attack and spy actions are rate-limited server-side to prevent spam and unnecessary DB load. The limit is enforced in the TypeScript route before the RPC call is issued.

### Cooldown Values

| Action | Cooldown | HTTP status on violation |
|---|---|---|
| Attack (`POST /api/attack`) | 1 000 ms | 429 |
| Spy (`POST /api/spy`) | 1 000 ms | 429 |

### Implementation

**DB columns** (added by migration `0016_rate_limiting.sql`):

```sql
players.last_attack_at  TIMESTAMPTZ  DEFAULT NULL
players.last_spy_at     TIMESTAMPTZ  DEFAULT NULL
```

Both columns are `NULL` until the player's first committed action.

**Check in route (TypeScript):**

```typescript
// Attack route (app/api/attack/route.ts)
if (attPlayer.last_attack_at &&
    now.getTime() - new Date(attPlayer.last_attack_at).getTime() < 1_000) {
  return NextResponse.json({ error: 'Attack cooldown active' }, { status: 429 })
}

// Spy route (app/api/spy/route.ts)
if (attPlayer.last_spy_at &&
    now.getTime() - new Date(attPlayer.last_spy_at).getTime() < 1_000) {
  return NextResponse.json({ error: 'Spy cooldown active' }, { status: 429 })
}
```

**Timestamp written in the RPC** — `attack_resolve_apply` and `spy_resolve_apply` both set the timestamp atomically inside the existing `UPDATE players SET turns = ..., last_*_at = now()` statement. This means:
- The timestamp is always consistent with a committed action.
- No separate `players.update` call exists in the TypeScript route (structural tests in `attack-resolve.test.ts` / `spy-resolve.test.ts` enforce this).

**Types:** `Player.last_attack_at: string | null` and `Player.last_spy_at: string | null` in `types/game.ts`.

**Tests:** `lib/game/rate-limiting.test.ts` — 23 tests across 4 groups: attack structural, spy structural, migration structural, pure-logic gate scenarios.

### 2026-03-06 — Training Page: Layout Restructure (UI-only, SSOT-safe)

Full layout restructure of `app/(game)/training/TrainingClient.tsx`. **No gameplay logic, API contracts, validation, formulas, or SSOT rules changed.**

#### What changed in the UI

**Layout hierarchy (new order):**
1. Page title + irreversibility notice (once, at top)
2. Compact resource/workforce dashboard — 4 chips: Free Pop | Slaves | Gold | Food
3. Army snapshot — horizontal chip row: Soldiers, Cavalry (if enabled), Spies, Scouts, Slaves, Free Pop
4. Basic Training section — table-style rows (no tabs)
5. Advanced Training section — table-style rows (no tabs)

**Tabs removed.** Previously Basic Training and Advanced Training were behind `Tabs` (Train Units / Advanced Training). Now both sections are always visible, stacked vertically. This matches the Izra layout pattern where all training info is available at a glance without navigation.

**Basic Training rows restructured to table columns:**
- `Unit | Owned | Cost / Unit | Amount input | Train button`
- Cost shows "X Gold · Y Pop" compactly (no prose descriptions)
- Total cost preview (color-coded green/red for affordability) appears inline within the Cost column only when an amount is entered
- Desktop: uses CSS grid for aligned columns; Mobile: stacks gracefully

**Advanced Training rows restructured to table columns:**
- `Skill | Level | Next Gain (×current → ×next, +X% power) | Next Cost (Gold + Food badges) | Upgrade button`
- Player immediately sees what upgrading gives without reading explanatory text
- Upgrade cost formula note moved to a single subtitle line under the section header

**Text drastically reduced:**
- Removed verbose descriptions ("converts 1 Untrained Population → 1 Idle Slave", "Slaves work mines and produce resources per tick. Allocate them via the Mine page")
- Removed repeated irreversibility reminders (now stated once in page subtitle)
- Removed tutorial-style badge text for cavalry ("Costs 5 free population each — permanent")
- Population cost shown as compact "5 Pop" in the Cost column, not a sentence

**Components removed from this page:** `StatBox`, `Badge`, `Tabs` — replaced with inline grid/chip patterns that are more compact and scannable.

**Components retained:** `Button`, `Input`, `ResourceBadge`, `usePlayer`, `useFreeze`, `applyPatch`, `refresh`, all API call logic — unchanged.

#### SSOT confirmation
- `trainUnit()` — unchanged
- `upgradeAdvanced()` — unchanged  
- `canAffordTrain()` — unchanged
- `canAffordAdv()` — unchanged
- `BALANCE.training.enableCavalry` filter — unchanged
- All API routes — unchanged (`/api/training/basic`, `/api/training/advanced`)
- `applyPatch` + `refresh()` pattern — unchanged
- `isFrozen` guard on all buttons — unchanged

#### Inspiration
Layout hierarchy and row structure inspired by Izra training screen (competitor game). Visual styling, tokens, and theme remain Domiron's own.

### 2026-03-06 — Development Page: Layout Restructure (UI-only, SSOT-safe)

Full layout restructure of `app/(game)/develop/DevelopClient.tsx`. **No gameplay logic, API contracts, formulas, or SSOT rules changed.**

#### New page order
1. **City Progression** (moved from bottom to top — primary progression CTA)
2. **Resource strip** (compact horizontal HUD: Gold, Iron, Wood, Food)
3. **Population** (compact stat row + inline upgrade action)
4. **Infrastructure Upgrades** (table-style rows, replaced UpgradeCard grid)
5. **Population Growth Reference** (collapsible — hidden by default)

#### City Progression panel
- Promoted to top of page as a prominent full-width panel with gold-tinted border
- Shows current → next city transition bar side by side
- Requirements grid (5 rows: Soldiers, Gold, Wood, Iron, Food) with have/need columns and color-coded affordability
- Promote button bottom-right; note "must not be in a tribe · irreversible" inline
- Max-city state: shows "MAX CITY" badge and current multiplier

#### Resource strip
- Same design as Training page: gold-tinted horizontal strip, icon → value → label per column
- Shows: 🪙 Gold | ⚙️ Iron | 🪵 Wood | 🌾 Food

#### Population section
- Replaced 3 large `PopStat` card blocks with a compact chip row: Untrained | Per Tick | Growth Level
- Upgrade action inline below: "Lv X → X+1: +N pop/tick · [cost] · [Upgrade button]"
- Max level shows "MAX" badge + one line of text

#### Infrastructure upgrades
- Replaced UpgradeCard 2-column grid with a table-style panel (same pattern as Basic/Advanced Training)
- Each row: Icon + Building name | Level + progress bar | Next cost | Upgrade button
- Removed verbose description strings — replaced with short `effectLabel` per upgrade type
- `UpgradeCard` component no longer used on this page

#### Population Growth table
- Moved to bottom of page
- Wrapped in a collapsible toggle (hidden by default, shown on demand)
- Clearly positioned as reference-only information with lower visual weight

#### Components removed from this page
`UpgradeCard`, `PopStat` (internal helper) — replaced with inline table patterns.

#### Components retained
`Badge`, `Button`, `GameTable`, `ResourceBadge`, `usePlayer`, `applyPatch`, `refresh`, all API call logic — unchanged.

#### SSOT confirmation
- `handleUpgrade()` — unchanged
- `handlePromoteCity()` — unchanged
- `getUpgradeCost()` — unchanged
- `canPromote`, `meetsArmy/Gold/Wood/Iron/Food` — unchanged
- `popCanAfford`, `popIsMaxed`, `popCost` — unchanged
- All API routes — unchanged (`/api/develop/upgrade`, `/api/city/promote`)
- `applyPatch` + `refresh()` pattern — unchanged

---

### 2026-03-06 — Tribe Integration Audit + Power Breakdown Fix

Full end-to-end audit of all tribe mechanics vs. existing player mechanics. No integration bugs found. One stale comment fixed. Power breakdown added to battle report UI.

**Audit findings (all ✅ correct):**
- `production_blessing`: tick/route.ts batches active tribe spells once, applies `tribeProdMult` to all 4 resources per player. No double-count with hero slave bonus.
- `war_cry`: attack/route.ts fetches active spell, passes `attackerTribeMultiplier: 1.25` to `resolveCombat()`. Applied after ECP formula, on full baseECP. Does not touch ClanBonus.
- `tribe_shield`: same pattern as war_cry for defender side (`defenderTribeMultiplier: 1.15`).
- `spy_veil`: spy/route.ts fetches active spell for defender's tribe, multiplies `scoutDefense` by `scoutDefenseMultiplier`. Correctly isolated from attack path.
- `battle_supply`: attack/route.ts applies `foodMultiplier = 1 - 0.25 = 0.75` to food cost before deduction. Correctly isolated from combat ECP.
- Hero effects (`totalAttackBonus`, `totalSlaveBonus`, etc.) and tribe spells are completely separate — no shared code paths, no double-counting.
- `tribes.power_total` is meaningful: sum of member `power_total` values, updated once per tick (step 10). Used as `ClanContext.totalClanPP` in combat. Intentionally stale by up to one tick.
- `TICK_INTERVAL_MINUTES` in production is now **ignored** — production always uses `BALANCE.tick.intervalMinutes` (30 minutes). See Bug 5 below.

**Changes made (2026-03-06 session — Tribe Integration Audit):**

- `app/api/tick/route.ts` — Fixed stale debug comment (line 21 referenced old `"* * * * *"` cron). Now says: set `TICK_INTERVAL_MINUTES=1` env var; do NOT change vercel.json.
- `lib/game/combat.ts` — `CombatResolutionResult` now includes `baseAttackerECP: number` and `baseDefenderECP: number` (ECP before tribe spell multiplier). `resolveCombat()` returns both. All existing fields unchanged; additive-only change.
- `types/game.ts` — `BattleReport.attacker` gains `base_ecp_attack: number`; `BattleReport.defender` gains `base_ecp_defense: number`.
- `app/api/attack/route.ts` — Populates `base_ecp_attack: result.baseAttackerECP` and `base_ecp_defense: result.baseDefenderECP` in the battle report.
- `app/(game)/attack/AttackClient.tsx` — `BattleReportModal` power breakdown: when `ecp_attack !== base_ecp_attack`, shows Base / Tribe +N / Final (three lines). When no tribe spell active, shows just the final ECP as before (zero visual change for clanless players).
- `docs/GameMechanics-SingleSourceOfTruth.md` — Added "Battle Report — Power Breakdown" section documenting `base_ecp_attack`/`base_ecp_defense` fields and UI conditional rendering.

---

### 2026-03-06 — Tick Countdown Bug 5 + Full Combat Breakdown Fix

#### Bug 5 — `TICK_INTERVAL_MINUTES` env var misaligns countdown from Vercel Cron in production

**Files:** `app/api/tick/route.ts`, `instrumentation.ts`

**Symptom:** Countdown displays ~1 minute in the Sidebar/ResourceBar, then drops to 00:00 and stays there for ~29 minutes before resetting. The interval shown (1 min) does not match the actual tick cadence (30 min).

**Root cause:** `app/api/tick/route.ts` computed `next_tick_at = tickDoneAt + TICK_INTERVAL_MINUTES * 60_000` where `TICK_INTERVAL_MINUTES` read the env var first. If `TICK_INTERVAL_MINUTES=1` was set on Vercel (e.g. from a debugging session that was never cleaned up), the DB stored `next_tick_at = now + 1 minute` after every tick. But Vercel Cron fires every 30 minutes. The UI faithfully counted down from 1 minute (as the DB said), hit 00:00, then polled every 5 seconds until the actual cron fired 29 minutes later.

**Stale comment:** `instrumentation.ts` had "AND change vercel.json cron schedule back to every-30-min" — implying the developer should modify vercel.json when switching between dev and prod cadences. This was **wrong** and contradicted the (newer, correct) guidance in `tick/route.ts` which says "do NOT change vercel.json".

**Fix — `app/api/tick/route.ts`:** IIFE-style constant that ignores `TICK_INTERVAL_MINUTES` in production:
```ts
const TICK_INTERVAL_MINUTES: number = (() => {
  if (process.env.NODE_ENV !== 'development') {
    return BALANCE.tick.intervalMinutes  // Production: always 30 — matches vercel.json
  }
  const raw = Number(process.env.TICK_INTERVAL_MINUTES)
  return Number.isFinite(raw) && raw > 0 ? raw : BALANCE.tick.intervalMinutes
})()
```

**Fix — `instrumentation.ts`:** Removed "AND change vercel.json" from the revert instructions. vercel.json is never changed for dev/prod tick cadence switching — only the `.env` env var changes.

**Result:** In production `world_state.next_tick_at = tickDoneAt + 30 minutes` always, regardless of any env var. Countdown now correctly reflects the real 30-minute Vercel Cron cadence.

---

#### Full Combat Power Breakdown in Battle Report

**Files:** `types/game.ts`, `app/api/attack/route.ts`, `app/(game)/attack/AttackClient.tsx`

**Problem:** The battle report only showed `base_ecp` (ECP before tribe spell) and `final_ecp`. It did not break out Personal Power (PP), Clan Bonus, or Tribe Spell Bonus as separate items. Players could not see where their effective power came from.

**ECP full stack (for reference):**
```
PP           = calculatePersonalPower(army, weapons, training, development)
ClanBonus    = min(TotalClanPP × EfficiencyRate, 0.20 × PP)  [0 if no clan]
baseECP      = floor(PP × (1 + heroBonus) × (1 + raceBonus)) + ClanBonus
tribeBonus   = baseECP × (tribeMultiplier - 1)   [0 if no tribe spell active]
finalECP     = floor(baseECP × tribeMultiplier)
```

**Fix — `types/game.ts`:** Added 4 new fields to `BattleReport`:
- `attacker.pp_attack: number` — raw personal power
- `attacker.clan_bonus_attack: number` — clan additive bonus (0 if no clan)
- `defender.pp_defense: number` — raw personal power
- `defender.clan_bonus_defense: number` — clan additive bonus (0 if no clan)

**Fix — `app/api/attack/route.ts`:** Imports `calculateClanBonus` and calls it separately for both sides (after PP is computed). Values passed into `battleReport`. No impact on `resolveCombat()` — combat engine unchanged.

**Fix — `app/(game)/attack/AttackClient.tsx`:** `BattleReportModal` power panels now show:
```
Power     [pp_attack]           ← always shown
Clan +N   [clan_bonus_attack]   ← shown only when > 0
Tribe +N  [ecp - base_ecp]     ← shown only when tribe spell active
═══════════════════════════
Final ECP [ecp_attack]          ← always shown
```

No double-counting: `calculateClanBonus` is called for reporting only — `resolveCombat()` calls it internally via `calculateECP()`. Both calls use the same `attackerPP` and `attClanCtx`, so they produce identical values.

**Tribe spell audit (re-confirmed):**
- `war_cry` → `attackerTribeMultiplier = BALANCE.tribe.spellEffects.war_cry.combatMultiplier = 1.25`. Applied as `Math.floor(baseAttackerECP × 1.25)`. Does not touch ClanBonus.
- `tribe_shield` → `defenderTribeMultiplier = BALANCE.tribe.spellEffects.tribe_shield.defenseMultiplier = 1.15`. Same pattern on defender side.
- Tribe multiplier and ClanBonus are completely separate. No double-counting.

**Tribe power audit (re-confirmed):**
- `tribes.power_total` = sum of member `power_total` values, updated per tick (step 10).
- Used as `ClanContext.totalClanPP` in combat (`attClanCtx`, `defClanCtx`).
- `calculateClanBonus` caps the result at `0.20 × playerPP` — never unbounded.
