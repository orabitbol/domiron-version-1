# Domiron — Database Architecture Reference

> **Derived from:** `supabase/migrations/0001_initial.sql` through `0005_slave_assignments.sql`, `types/game.ts`, all API routes, and `lib/game/*.ts`.
> All column types, constraints, and relationships are extracted verbatim from migration files.
> Values annotated `[TUNE: unassigned]` are intentionally undefined in `config/balance.config.ts`.

---

## Table of Contents

1. [Table Categories](#table-categories)
2. [Table Reference](#table-reference)
   - [seasons](#seasons)
   - [players](#players)
   - [resources](#resources)
   - [army](#army)
   - [weapons](#weapons)
   - [training](#training)
   - [development](#development)
   - [hero](#hero)
   - [hero\_spells](#hero_spells)
   - [player\_hero\_effects](#player_hero_effects)
   - [bank](#bank)
   - [tribes](#tribes)
   - [tribe\_members](#tribe_members)
   - [tribe\_spells](#tribe_spells)
   - [attacks](#attacks)
   - [spy\_history](#spy_history)
   - [hall\_of\_fame](#hall_of_fame)
   - [balance\_overrides](#balance_overrides)
   - [admin\_logs](#admin_logs)
3. [How State Is Persisted](#how-state-is-persisted)
4. [Season Reset Mechanics](#season-reset-mechanics)
5. [ER Diagram](#er-diagram)

---

## Table Categories

| Category | Tables |
|----------|--------|
| **Season** | `seasons` |
| **Player identity / auth** | `players` |
| **Player game state** | `resources`, `bank`, `development` |
| **Army / combat** | `army`, `weapons`, `training`, `attacks` |
| **Slaves / workforce** | `army` (slaves, slaves_gold, slaves_iron, slaves_wood, slaves_food, farmers) |
| **Hero system** | `hero`, `hero_spells`, `player_hero_effects` |
| **Clan / tribe** | `tribes`, `tribe_members`, `tribe_spells` |
| **Logs / history** | `spy_history`, `attacks`, `hall_of_fame`, `admin_logs` |
| **Admin / config** | `balance_overrides`, `admin_logs` |

---

## Table Reference

---

### `seasons`

**Purpose:** Tracks game seasons. One active season at a time. Season lifecycle controls freeze mode for all gameplay routes.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | SERIAL | NO | auto | Primary key |
| `number` | INT | NO | — | Season number (1, 2, …). UNIQUE. |
| `starts_at` | TIMESTAMPTZ | NO | — | Season start timestamp (renamed from `started_at` in migration 0004) |
| `ends_at` | TIMESTAMPTZ | NO | — | Hard 90-day deadline. Added in migration 0004. |
| `status` | VARCHAR(10) | NO | `'active'` | `'active'` or `'ended'`. CHECK constraint. |
| `ended_at` | TIMESTAMPTZ | YES | NULL | Set when season transitions to `'ended'` |
| `created_at` | TIMESTAMPTZ | NO | `now()` | Row insertion timestamp. Added in migration 0004. |
| `created_by` | UUID | YES | NULL | FK → `players.id`. Nullable to allow season creation before any players exist. |

**Primary key:** `id`
**Foreign keys:** `created_by` → `players(id)` (nullable)
**Indexes:** `idx_seasons_one_active` — partial unique index on `(status) WHERE status = 'active'`; enforces at most one active season.
**Unique constraints:** `number` UNIQUE; `idx_seasons_one_active` (partial)

**Relationships:**
- `players.season_id` → `seasons.id` (each player belongs to one season)
- `tribes.season_id` → `seasons.id`
- `attacks.season_id` → `seasons.id`
- `spy_history.season_id` → `seasons.id`
- `hall_of_fame.season_id` → `seasons.id`

---

### `players`

**Purpose:** Player identity, auth credentials, and aggregate power/ranking scores.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `username` | TEXT | NO | — | UNIQUE |
| `email` | TEXT | NO | — | UNIQUE |
| `password_hash` | TEXT | NO | — | bcryptjs hash (cost 12) |
| `role` | TEXT | NO | `'player'` | `'player'` or `'admin'`. CHECK constraint. |
| `race` | TEXT | NO | — | `'orc'`, `'human'`, `'elf'`, `'dwarf'`. CHECK constraint. |
| `army_name` | TEXT | NO | — | Display name for the player's army |
| `city` | INT | NO | `1` | City tier 1–5. CHECK `city BETWEEN 1 AND 5`. |
| `turns` | INT | NO | `100` | Current turns available. CHECK `turns >= 0`. |
| `max_turns` | INT | NO | `30` | Max turns cap (note: BALANCE.tick.maxTurns = 200; this column appears unused by tick logic) |
| `capacity` | INT | NO | `2500` | Max combat units (soldiers + spies + scouts) |
| `reputation` | INT | NO | `0` | Season reputation score |
| `rank_city` | INT | YES | NULL | Rank within city. Updated by tick. |
| `rank_global` | INT | YES | NULL | Global rank. Updated by tick. |
| `power_attack` | BIGINT | NO | `0` | Cached attack power (recalculated by `recalculatePower`) |
| `power_defense` | BIGINT | NO | `0` | Cached defense power |
| `power_spy` | BIGINT | NO | `0` | Cached spy power |
| `power_scout` | BIGINT | NO | `0` | Cached scout power |
| `power_total` | BIGINT | NO | `0` | Sum of all power columns. Used for rankings. |
| `vip_until` | TIMESTAMPTZ | YES | NULL | VIP active while `now() < vip_until` |
| `is_vacation` | BOOLEAN | NO | `false` | When true: turn regen reduced to ×0.33 |
| `vacation_days_used` | INT | NO | `0` | Lifetime vacation days consumed |
| `season_id` | INT | NO | `1` | FK → `seasons(id)`. NOT NULL. |
| `joined_at` | TIMESTAMPTZ | NO | `now()` | When the player joined this season |
| `last_seen_at` | TIMESTAMPTZ | NO | `now()` | Updated on activity |
| `created_at` | TIMESTAMPTZ | NO | `now()` | Account creation time |

**Primary key:** `id`
**Foreign keys:** `season_id` → `seasons(id)`
**Unique constraints:** `username`, `email`
**CHECK constraints:** `chk_role`, `chk_race`, `chk_city`, `chk_turns (turns >= 0)`
**Indexes:** `idx_players_city`, `idx_players_rank_global`, `idx_players_rank_city`, `idx_players_season`, `idx_players_power_total`
**RLS:** Enabled. SELECT policy allows all reads (filtered by API). Writes are service-role only.

---

### `resources`

**Purpose:** Stores the player's unbanked (stealable) gold, iron, wood, and food.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `player_id` | UUID | NO | — | FK → `players(id)` ON DELETE CASCADE |
| `gold` | BIGINT | NO | `5000` | CHECK `gold >= 0` |
| `iron` | BIGINT | NO | `5000` | CHECK `iron >= 0` |
| `wood` | BIGINT | NO | `5000` | CHECK `wood >= 0` |
| `food` | BIGINT | NO | `5000` | CHECK `food >= 0` |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Updated on every write |

**Primary key:** `id`
**Foreign keys:** `player_id` → `players(id)` ON DELETE CASCADE
**Unique constraints:** `UNIQUE(player_id)` — one row per player
**RLS:** Enabled. All reads allowed (API filters by player_id).

**Notes:**
- Banked gold is in `bank.balance`, not here. Only unbanked resources are stealable.
- New players start with `BALANCE.startingResources.{gold,iron,wood,food} × catchUpMultiplier`.

---

### `army`

**Purpose:** Stores all unit counts and slave workforce, including per-resource slave assignments.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | Primary key |
| `player_id` | UUID | NO | — | FK → `players(id)` ON DELETE CASCADE |
| `soldiers` | INT | NO | `0` | Combat unit (Tier 1). CHECK `>= 0`. |
| `cavalry` | INT | NO | `0` | Combat unit (Tier 2, costs soldiers). CHECK `>= 0`. |
| `spies` | INT | NO | `0` | Intel unit. CHECK `>= 0`. |
| `scouts` | INT | NO | `0` | Counter-intel unit. CHECK `>= 0`. |
| `slaves` | INT | NO | `0` | **Total slave count** (assigned + idle). CHECK `>= 0`. |
| `slaves_gold` | INT | NO | `0` | Slaves assigned to gold production. CHECK `>= 0`. Added migration 0005. |
| `slaves_iron` | INT | NO | `0` | Slaves assigned to iron production. CHECK `>= 0`. Added migration 0005. |
| `slaves_wood` | INT | NO | `0` | Slaves assigned to wood production. CHECK `>= 0`. Added migration 0005. |
| `slaves_food` | INT | NO | `0` | Slaves assigned to food production. CHECK `>= 0`. Added migration 0005. |
| `farmers` | INT | NO | `0` | Separate food-producing unit (always produces food, not assignment-based). CHECK `>= 0`. |
| `free_population` | INT | NO | `0` | Untrained population — consumed when training any unit (except cavalry). |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | Updated on every write |

**Primary key:** `id`
**Foreign keys:** `player_id` → `players(id)` ON DELETE CASCADE
**Unique constraints:** `UNIQUE(player_id)` — one row per player
**Application invariant:** `slaves_gold + slaves_iron + slaves_wood + slaves_food ≤ slaves`
**Idle slaves:** `slaves - (slaves_gold + slaves_iron + slaves_wood + slaves_food)` — produce nothing per tick

**Slave flow:**
1. Train slave: `free_population - N`, `slaves + N` (free, no gold cost — the only way to create slaves)
2. Assign via `/api/mine/allocate`: sets `slaves_gold`, `slaves_iron`, `slaves_wood`, `slaves_food`

**Slave rules (source of truth):**
- Slaves are created **only** by training from `free_population`. No other source.
- Slaves are **never** created or destroyed by combat. Attacks do not touch `army.slaves`.
- Untraining any unit (soldier, spy, scout, farmer) returns that unit to `free_population`, NOT to slaves.
- Idle slaves (unassigned) produce nothing per tick.
- Slaves cannot be stolen, captured, or converted in any direction once created.

---

### `weapons`

**Purpose:** Counts of every weapon and equipment item owned by the player.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | UUID | NO | `gen_random_uuid()` |
| `player_id` | UUID | NO | — |
| `slingshot` | INT | NO | `0` |
| `boomerang` | INT | NO | `0` |
| `pirate_knife` | INT | NO | `0` |
| `axe` | INT | NO | `0` |
| `master_knife` | INT | NO | `0` |
| `knight_axe` | INT | NO | `0` |
| `iron_ball` | INT | NO | `0` |
| `wood_shield` | INT | NO | `0` |
| `iron_shield` | INT | NO | `0` |
| `leather_armor` | INT | NO | `0` |
| `chain_armor` | INT | NO | `0` |
| `plate_armor` | INT | NO | `0` |
| `mithril_armor` | INT | NO | `0` |
| `gods_armor` | INT | NO | `0` |
| `shadow_cloak` | INT | NO | `0` |
| `dark_mask` | INT | NO | `0` |
| `elven_gear` | INT | NO | `0` |
| `scout_boots` | INT | NO | `0` |
| `scout_cloak` | INT | NO | `0` |
| `elven_boots` | INT | NO | `0` |
| `updated_at` | TIMESTAMPTZ | NO | `now()` |

**Primary key:** `id` | **FK:** `player_id → players(id)` ON DELETE CASCADE | **Unique:** `player_id`

Attack weapons: additive per unit (PP and combat power).
Defense/spy/scout gear: binary (owned = multiplier applied, unowned = no effect).

---

### `training`

**Purpose:** Advanced skill levels for attack, defense, spy, and scout training.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | |
| `player_id` | UUID | NO | — | FK → `players(id)` ON DELETE CASCADE |
| `attack_level` | INT | NO | `0` | Each level adds `+8%` attack power. CHECK `>= 0`. |
| `defense_level` | INT | NO | `0` | Each level adds `+8%` defense power. CHECK `>= 0`. |
| `spy_level` | INT | NO | `0` | Each level adds `+8%` spy power. CHECK `>= 0`. |
| `scout_level` | INT | NO | `0` | Each level adds `+8%` scout power. CHECK `>= 0`. |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Primary key:** `id` | **FK:** `player_id → players(id)` ON DELETE CASCADE | **Unique:** `player_id`
**No upper level cap** — BALANCE Risk: unbounded progression [UNCERTAIN: no max level enforced in schema or API]

---

### `development`

**Purpose:** City infrastructure upgrade levels affecting production rates and defense.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | |
| `player_id` | UUID | NO | — | FK → `players(id)` ON DELETE CASCADE |
| `gold_level` | INT | NO | `1` | Gold mine level (1–10) |
| `food_level` | INT | NO | `1` | Farmland level (1–10) |
| `wood_level` | INT | NO | `1` | Lumber mill level (1–10) |
| `iron_level` | INT | NO | `1` | Iron foundry level (1–10) |
| `population_level` | INT | NO | `1` | Population growth rate level (1–10) |
| `fortification_level` | INT | NO | `1` | Defense multiplier level (1–5) |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Primary key:** `id` | **FK:** `player_id → players(id)` ON DELETE CASCADE | **Unique:** `player_id`
**CHECK:** `gold_level BETWEEN 1 AND 10`, ..., `fortification_level BETWEEN 1 AND 5`

---

### `hero`

**Purpose:** Hero progression (level, XP, spell points, mana).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | |
| `player_id` | UUID | NO | — | FK → `players(id)` ON DELETE CASCADE |
| `level` | INT | NO | `1` | CHECK `1 ≤ level ≤ 100` |
| `xp` | INT | NO | `0` | CHECK `xp >= 0` |
| `xp_next_level` | INT | NO | `100` | XP required to reach next level |
| `spell_points` | INT | NO | `1` | Unspent spell points for purchasing spells |
| `mana` | INT | NO | `0` | Current mana. Regenerates per tick. CHECK `mana >= 0`. |
| `mana_per_tick` | INT | NO | `1` | Base mana regen rate (overridden by calcHeroManaGain) |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Primary key:** `id` | **FK:** `player_id → players(id)` ON DELETE CASCADE | **Unique:** `player_id`

---

### `hero_spells`

**Purpose:** Records which spells a player has permanently purchased.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | UUID | NO | `gen_random_uuid()` |
| `player_id` | UUID | NO | — |
| `spell_key` | TEXT | NO | — |
| `purchased_at` | TIMESTAMPTZ | NO | `now()` |

**Primary key:** `id` | **FK:** `player_id → players(id)` ON DELETE CASCADE
**Unique:** `(player_id, spell_key)` — each spell purchased once
**Indexes:** `idx_hero_spells_player ON (player_id)`

---

### `player_hero_effects`

**Purpose:** Active temporary hero effects (slave output boosts, combat power boosts, shields). Replaces legacy `player_boosts` table (dropped in migration 0003).

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | |
| `player_id` | UUID | NO | — | FK → `players(id)` ON DELETE CASCADE |
| `type` | hero_effect_type | NO | — | Enum: `SLAVE_OUTPUT_10`, `SLAVE_OUTPUT_20`, `SLAVE_OUTPUT_30`, `RESOURCE_SHIELD`, `SOLDIER_SHIELD`, `ATTACK_POWER_10`, `DEFENSE_POWER_10` |
| `starts_at` | TIMESTAMPTZ | NO | `now()` | Effect activation time |
| `ends_at` | TIMESTAMPTZ | NO | — | Effect expiration time. CHECK `ends_at > starts_at`. |
| `cooldown_ends_at` | TIMESTAMPTZ | YES | NULL | For shields: when a new shield of this type may start. NULL for non-shield types. |
| `metadata` | JSONB | YES | NULL | UI fields (imageKey, nameKey, priceId, etc.) |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Primary key:** `id` | **FK:** `player_id → players(id)` ON DELETE CASCADE
**Indexes:** `idx_player_hero_effects_active ON (player_id, ends_at DESC)` — primary hot-path lookup
`idx_player_hero_effects_cooldown ON (player_id, type, cooldown_ends_at) WHERE cooldown_ends_at IS NOT NULL`
**RLS:** Players can SELECT own rows. Only service role may write.

**Active effect query:** `WHERE player_id = $1 AND ends_at > now()`
Effects are never deleted — they expire naturally. No cleanup job needed.

---

### `bank`

**Purpose:** Stores banked gold (100% theft-protected) and deposit tracking.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | |
| `player_id` | UUID | NO | — | FK → `players(id)` ON DELETE CASCADE |
| `balance` | BIGINT | NO | `0` | Banked gold. CHECK `balance >= 0`. Earns daily interest. |
| `interest_level` | INT | NO | `0` | Upgrade level for interest rate. |
| `deposits_today` | INT | NO | `0` | Deposits made today. CHECK `0 ≤ deposits_today ≤ 2`. |
| `last_deposit_reset` | DATE | NO | `CURRENT_DATE` | Date of last reset. Tick resets when date changes. |
| `updated_at` | TIMESTAMPTZ | NO | `now()` | |

**Primary key:** `id` | **FK:** `player_id → players(id)` ON DELETE CASCADE | **Unique:** `player_id`
**Notes:** `BANK_INTEREST_RATE_BASE` and `BANK_INTEREST_RATE_PER_LEVEL` are `[TUNE: unassigned]` — interest not active in production.

---

### `tribes`

**Purpose:** Clan/tribe identity, mana pool, and aggregate power.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | |
| `name` | TEXT | NO | — | UNIQUE |
| `anthem` | TEXT | YES | NULL | Optional flavour text |
| `city` | INT | NO | — | City tier 1–5. Tribe locked to one city. CHECK `BETWEEN 1 AND 5`. |
| `leader_id` | UUID | NO | — | FK → `players(id)` |
| `deputy_id` | UUID | YES | NULL | FK → `players(id)` |
| `level` | INT | NO | `1` | Tribe development level (1–5) — affects clan combat efficiency |
| `reputation` | BIGINT | NO | `0` | Tribe season reputation |
| `mana` | INT | NO | `0` | Tribe mana pool. Regenerates per tick per member. |
| `max_members` | INT | NO | `25` | Max member cap (BALANCE.clan.maxMembers = 20) |
| `tax_amount` | BIGINT | NO | `0` | Current daily tax in gold |
| `power_total` | BIGINT | NO | `0` | Sum of all members' power_total. Used for clan bonus calculation. |
| `season_id` | INT | NO | `1` | FK → `seasons(id)` |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Primary key:** `id` | **FKs:** `leader_id → players(id)`, `deputy_id → players(id)`, `season_id → seasons(id)`
**Indexes:** `idx_tribes_city ON (city, season_id)`

---

### `tribe_members`

**Purpose:** Junction table linking players to their tribe.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | UUID | NO | `gen_random_uuid()` |
| `tribe_id` | UUID | NO | — |
| `player_id` | UUID | NO | — |
| `reputation` | INT | NO | `0` |
| `reputation_pct` | FLOAT | NO | `0` |
| `tax_paid_today` | BOOLEAN | NO | `false` |
| `tax_exempt` | BOOLEAN | NO | `false` |
| `joined_at` | TIMESTAMPTZ | NO | `now()` |

**Primary key:** `id`
**FKs:** `tribe_id → tribes(id)` ON DELETE CASCADE, `player_id → players(id)` ON DELETE CASCADE
**Unique:** `(tribe_id, player_id)` — one membership per player per tribe
**Indexes:** `idx_tribe_members_player ON (player_id)`

---

### `tribe_spells`

**Purpose:** Records active tribe spells (buffs) with expiry timestamps.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | |
| `tribe_id` | UUID | NO | — | FK → `tribes(id)` ON DELETE CASCADE |
| `spell_key` | TEXT | NO | — | CHECK: `combat_boost`, `tribe_shield`, `production_blessing`, `mass_spy`, `war_cry` |
| `activated_by` | UUID | NO | — | FK → `players(id)` |
| `expires_at` | TIMESTAMPTZ | NO | — | When the spell effect ends |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Primary key:** `id` | **FKs:** `tribe_id → tribes(id)` ON DELETE CASCADE, `activated_by → players(id)`

---

### `attacks`

**Purpose:** Immutable log of every attack (both sides). Used for kill cooldown, loot decay, and history display.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | |
| `attacker_id` | UUID | NO | — | FK → `players(id)` |
| `defender_id` | UUID | NO | — | FK → `players(id)` |
| `turns_used` | INT | NO | — | 1–10. CHECK constraint. |
| `atk_power` | BIGINT | NO | — | Attacker ECP at time of attack |
| `def_power` | BIGINT | NO | — | Defender ECP at time of attack |
| `outcome` | TEXT | NO | — | CHECK: `crushing_win`, `win`, `draw`, `loss`, `crushing_loss` (**Note:** code uses `win`/`partial`→`draw`/`loss`; `crushing_*` are DB legacy values) |
| `attacker_losses` | INT | NO | `0` | Soldiers lost by attacker |
| `defender_losses` | INT | NO | `0` | Soldiers lost by defender |
| `slaves_taken` | INT | NO | `0` | Slaves created from killed defender soldiers |
| `gold_stolen` | BIGINT | NO | `0` | |
| `iron_stolen` | BIGINT | NO | `0` | |
| `wood_stolen` | BIGINT | NO | `0` | |
| `food_stolen` | BIGINT | NO | `0` | |
| `season_id` | INT | NO | `1` | FK → `seasons(id)` |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Primary key:** `id`
**FKs:** `attacker_id → players(id)`, `defender_id → players(id)`, `season_id → seasons(id)`
**Indexes:** `idx_attacks_defender ON (defender_id, created_at DESC)`, `idx_attacks_attacker ON (attacker_id, created_at DESC)`, `idx_attacks_season ON (season_id)`
**Realtime:** Enabled on this table.

---

### `spy_history`

**Purpose:** Log of all spy missions. Revealed data stored as JSONB.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | |
| `spy_owner_id` | UUID | NO | — | FK → `players(id)` |
| `target_id` | UUID | NO | — | FK → `players(id)` |
| `success` | BOOLEAN | NO | — | Whether the mission succeeded |
| `spies_caught` | INT | NO | `0` | Spies lost on failure |
| `data_revealed` | JSONB | YES | NULL | Full target snapshot (only on success) |
| `season_id` | INT | NO | `1` | FK → `seasons(id)` |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Primary key:** `id`
**Indexes:** `idx_spy_owner ON (spy_owner_id, created_at DESC)`, `idx_spy_target ON (target_id, created_at DESC)`

---

### `hall_of_fame`

**Purpose:** Archived end-of-season rankings for players and tribes.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | UUID | NO | `gen_random_uuid()` | |
| `season_id` | INT | NO | — | FK → `seasons(id)` |
| `type` | TEXT | NO | — | `'player'` or `'tribe'`. CHECK constraint. |
| `rank` | INT | NO | — | Final rank |
| `name` | TEXT | NO | — | Player username or tribe name |
| `race` | TEXT | YES | NULL | Player race (null for tribes) |
| `city` | INT | YES | NULL | City tier (null for tribes) |
| `power_total` | BIGINT | NO | — | Final power score |
| `created_at` | TIMESTAMPTZ | NO | `now()` | |

**Primary key:** `id` | **FK:** `season_id → seasons(id)`
**Indexes:** `idx_hof_season ON (season_id, type, rank)`

---

### `balance_overrides`

**Purpose:** Runtime config overrides for BALANCE values. Not currently used in production; reserved for admin hot-fixes.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | UUID | NO | `gen_random_uuid()` |
| `key` | TEXT | NO | — |
| `value` | JSONB | NO | — |
| `updated_by` | UUID | YES | NULL |
| `updated_at` | TIMESTAMPTZ | NO | `now()` |

**Primary key:** `id` | **Unique:** `key` | **FK:** `updated_by → players(id)` (nullable)
**RLS:** No SELECT policy — service role only. Client cannot read this table.

---

### `admin_logs`

**Purpose:** Audit log for admin actions.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | UUID | NO | `gen_random_uuid()` |
| `admin_id` | UUID | NO | — |
| `action` | TEXT | NO | — |
| `target_id` | UUID | YES | NULL |
| `details` | JSONB | YES | NULL |
| `created_at` | TIMESTAMPTZ | NO | `now()` |

**Primary key:** `id` | **FK:** `admin_id → players(id)`
**Indexes:** `idx_admin_logs_admin ON (admin_id, created_at DESC)`
**RLS:** No SELECT policy — service role only.

---

## How State Is Persisted

### Player state
All mutable game state (resources, army, bank, weapons, training, development, hero) is stored in separate tables linked to `players.id`. The `players` table stores only denormalized aggregate columns (`power_*`, `rank_*`) that are expensive to compute on every read.

### Resources
- **Unbanked resources** (`resources.gold/iron/wood/food`): earned by tick, stolen in combat, spent on training/upgrades.
- **Banked gold** (`bank.balance`): deposited manually, earns daily interest, 100% theft-protected.

### Army counts
All unit counts live in `army`. Slaves are a workforce (not combat), stored in `army.slaves` + per-assignment columns (`slaves_gold`, `slaves_iron`, `slaves_wood`, `slaves_food`). `army.free_population` is the untrained population pool.

### Season reset
See [Season Reset Mechanics](#season-reset-mechanics).

---

## Season Reset Mechanics

The hard reset endpoint (`POST /api/admin/season/reset`) wipes all game-progress data in FK-safe order:

```
1.  tribe_spells
2.  tribe_members
3.  hero_spells
4.  player_hero_effects
5.  spy_history
6.  attacks
7.  hero
8.  bank
9.  development
10. training
11. weapons
12. army
13. resources
14. hall_of_fame
15. tribes
16. seasons.created_by → NULL  (break circular FK)
17. players
18. seasons
→  INSERT Season 1 (starts_at = now, ends_at = now + 90d, status = 'active')
```

**Tables NOT wiped:** `balance_overrides`, `admin_logs` (preserved across seasons).
**After reset:** No players exist. Admin must re-register via `/api/auth/register`.

### Freeze mode
The game auto-freezes when `getActiveSeason()` returns null:
```sql
SELECT * FROM seasons WHERE status = 'active' AND ends_at > now()
```
All 25 gameplay write routes return `423 SeasonEnded` when no active season is found.
No cron job needed to flip status — the `ends_at` timestamp is the gate.

---

## ER Diagram

```
seasons ──────────────────────────────────────┐
   │                                           │
   │ (season_id)                               │ (season_id)
   ▼                                           ▼
players ──┬──────── resources          tribes ──── tribe_members ──── players
   │      │                              │
   │      ├──────── army                 ├──────── tribe_spells
   │      │  (slaves, slaves_gold,       │
   │      │   slaves_iron, slaves_wood,  └──── seasons
   │      │   slaves_food, farmers,
   │      │   free_population, ...)
   │      │
   │      ├──────── weapons
   │      │
   │      ├──────── training
   │      │
   │      ├──────── development
   │      │
   │      ├──────── hero
   │      │            └── hero_spells
   │      │            └── player_hero_effects
   │      │
   │      ├──────── bank
   │      │
   │      ├──────── attacks (attacker_id, defender_id)
   │      │
   │      ├──────── spy_history (spy_owner_id, target_id)
   │      │
   │      └──────── hall_of_fame (via season)

admin_logs ──── players (admin_id)
balance_overrides ──── players (updated_by, nullable)
```

### Key relationships
- **1 player : 1 resources** — UNIQUE(player_id) on resources
- **1 player : 1 army** — UNIQUE(player_id) on army
- **1 player : 1 bank** — UNIQUE(player_id) on bank
- **1 player : 1 development** — UNIQUE(player_id) on development
- **1 player : 1 training** — UNIQUE(player_id) on training
- **1 player : 1 weapons** — UNIQUE(player_id) on weapons
- **1 player : 1 hero** — UNIQUE(player_id) on hero
- **1 player : N hero_spells** — each spell purchased once (player_id, spell_key UNIQUE)
- **1 player : N player_hero_effects** — multiple active effects; expire naturally
- **1 player : 0–1 tribe** — via tribe_members (player cannot be in 2 tribes simultaneously)
- **1 tribe : N tribe_members**
- **N attacks : 2 players** — (attacker_id, defender_id)
- **1 season : N players** — via season_id
