# Domiron v5 — Game Mechanics: Single Source of Truth

**Generated:** 2026-03-04
**Last updated:** 2026-03-05 — Audit #4: players.max_turns removed from all SELECT queries; BALANCE.tick.maxTurns confirmed as sole turn-cap SSOT. Prior: city promotion threshold formula, bank upgrade RPC atomicity.
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
| Countdown UI component | `components/layout/Sidebar.tsx` → `TickCountdown` |
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

---

## 1. Tick System

**Trigger:** Vercel Cron — `GET /api/tick` every 30 minutes, authenticated via `x-cron-secret` header.
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

#### How to Verify the Full Tick Pipeline

**Required `.env` values:**
```
CRON_SECRET=<any non-empty string, must match between .env and Supabase>
SUPABASE_SERVICE_ROLE_KEY=<set>
TICK_INTERVAL_MINUTES=1    # 1-minute debug cadence; change to 30 for production parity
TICK_DEBUG=1               # Verbose per-player logs
```

**Start dev server:** `npm run dev`

**Expected terminal output (within 5 seconds):**
```
[INSTRUMENTATION] register() called — NEXT_RUNTIME="undefined" NODE_ENV="development"
[DEV CRON] Scheduler armed — interval=1min url=http://localhost:3000/api/tick
[DEV CRON] Auto-tick STARTED (every 1 min / 60s)
[DEV CRON] → calling http://localhost:3000/api/tick at 2026-…
[TICK] auth=ok — tick starting at 2026-…
[TICK] playersFound=7
[TICK] Processing 7 player(s) at 2026-…
[TICK] player[0]=<id> turns: X→Y gold: A→B(+N) freePop: C→D
[TICK] world_state OK: sent=2026-…Z confirmed=2026-…+00:00 diffSec=60
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

**To revert to 30-minute production cadence:**
1. In `.env`: set `TICK_INTERVAL_MINUTES=30` (or delete the line)
2. In `vercel.json`: set cron schedule back to `*/30 * * * *`

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
| Train cavalry | **no change** (uses existing soldiers) |
| Untrain soldier | +amount |
| Untrain spy | +amount |
| Untrain scout | +amount |
| Untrain cavalry | **[MISSING]** not supported — no route |
| Combat losses | **no change** (soldiers lost ≠ population returned) |

Source: `app/api/training/train/route.ts`, `app/api/training/untrain/route.ts`

---

## 4. Training System

**Files:** `app/api/training/train/route.ts`, `app/api/training/untrain/route.ts`
**Balance:** `config/balance.config.ts` → `BALANCE.training`

### Unit Costs

| Unit | Gold cost | Population cost | Special requirement |
|---|---|---|---|
| soldier | 60 | 1 free_pop | — |
| slave | 0 | 1 free_pop | — |
| spy | 80 | 1 free_pop | — |
| scout | 80 | 1 free_pop | — |
| cavalry | 200 | **0** | amount × 5 existing soldiers |

Source: `BALANCE.training.unitCost`

### No Unit Cap — Training Gates Only

There is **no capacity cap** on any unit type. The old `players.capacity` DB column is legacy and is not used in any training gate. Training is gated only by:

1. Gold sufficiency
2. Free population (all units except cavalry consume 1 free_pop per unit)
3. Cavalry soldier ratio (cavalry requires `amount × 5` existing soldiers)

`players.capacity` column remains in DB for historical reference — not read, not written by any route.

### Gate Order (train route)

1. Auth check → 401
2. Season freeze check → 423
3. Input validation (unit, amount ≥ 1)
4. Fetch army + resources
5. Gold sufficiency check
6. Free population check (if not cavalry)
7. Cavalry ratio check (if cavalry: `soldiers ≥ amount × 5`)
8. DB writes: resources (deduct gold), army (add unit, deduct free_pop if applicable)
9. Recalculate power

### Gate Order (untrain route)

1. Auth check → 401
2. Season freeze check → 423
3. Unit must be soldier/spy/scout (cavalry untrain **[MISSING]**)
4. Sufficient units exist
5. DB writes: army (deduct unit, add free_pop)

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
- Soldier/cavalry count changes (train, untrain, combat losses)
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
- `tribeMultiplier` = active combat spell multiplier (war_cry: 1.25, combat_boost: 1.15, tribe_shield: 1.15, none: 1.0)

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
7. Attacker has enough food (`turns × 1`) → 400
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

> **Food cost** in the route: `foodCost = turnsUsed × BALANCE.combat.foodCostPerTurn` (= turns × 1). `calculateFoodCost(deployedSoldiers)` has been **removed** from `combat.ts` (was dead code).

> **Deployed soldiers:** The route always passes `attArmy.soldiers` as `deployedSoldiers` — meaning **all soldiers are always deployed**. There is no partial deployment mechanic.

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

### Food Cost (actual)

```
foodCost = turnsUsed × foodCostPerTurn    (= turns × 1)
```

`foodCostPerTurn = 1` — one food per turn used (not per soldier). `FOOD_PER_SOLDIER` remains in `BALANCE.combat` as a tuning note but `calculateFoodCost(deployedSoldiers)` has been removed from `combat.ts` (was dead code — the route never called it).

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

**Files:** `app/api/tribe/*/route.ts`, `lib/game/combat.ts` → `calculateClanBonus()`

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

### Tribe Mana

**Regen per tick:**
```
manaGain = max(1, floor(memberCount × 1))
```

`BALANCE.tribe.manaPerMemberPerTick = 1` [TUNE]

**Tax → Mana conversion:**
`POST /api/tribe/pay-tax`: `tax_amount` gold deducted from player → `tax_amount` mana added to tribe (1:1).
Tax limit per city: city1=1000, city2=2500, city3=5000, city4=10000, city5=20000.

### Spells

| Spell Key | Mana Cost | Duration | Combat/Production Effect |
|---|---|---|---|
| `combat_boost` | 20 | 6h | Attacker ECP ×1.15 |
| `tribe_shield` | 30 | 12h | Defender ECP ×1.15 |
| `production_blessing` | 25 | 8h | Tick production ×1.20 |
| `mass_spy` | 15 | 0h (instant) | (instant; route: `POST /api/tribe/spell`) |
| `war_cry` | 40 | 4h | Attacker ECP ×1.25 (takes priority over `combat_boost` if both active) |

Activation route: `POST /api/tribe/activate-spell`. Spell multipliers: `BALANCE.tribe.spellEffects.*`.

**combat_boost vs war_cry priority:** If both are active, `war_cry` (1.25) takes priority (checked first in attack route). In practice a tribe cannot activate both simultaneously (different spell keys, but no technical guard against it — the route just picks the higher-priority one).

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

**Update timing:** Computed and persisted ONLY on tick (every 30 minutes via Vercel Cron). No other route touches these fields.

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
| I4 | **`BALANCE.combat.FOOD_PER_SOLDIER`** (dead constant). Documented as `food_cost = soldiers × FOOD_PER_SOLDIER` but no route uses this formula. Actual cost: `turns × foodCostPerTurn`. | `balance.config.ts:278` |
| I5 | **`calcTurnsAfterRegen`** in `combat.ts` is dead production code — only called from tests. Tick route uses `calcTurnsToAdd(turns, isVacation)` from `tick.ts` (with vacation modifier). | `lib/game/combat.ts:574` |

### B. Missing Implementations

| # | Feature | Status |
|---|---|---|
| M1 | Cavalry untrain | No route exists |
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
- `app/api/training/untrain/route.ts` — `farmer` removed from unit enum
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
| `TrainingClient` | train/untrain | `army`, `resources` | After advanced upgrade (training levels change) |
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
