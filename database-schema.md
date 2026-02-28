# Domiron — Database Schema

> All tables are in Supabase (PostgreSQL).
> Row Level Security (RLS) is enabled on all tables.
> All timestamps are UTC.

---

## Tables Overview

| Table | Purpose |
|-------|---------|
| `players` | Core player account + stats |
| `resources` | Player resources (gold, iron, wood, food) |
| `army` | Player army units |
| `weapons` | Player weapons inventory |
| `training` | Advanced training levels |
| `development` | Resource/population development levels |
| `hero` | Hero level, XP, spell points |
| `hero_spells` | Purchased spells per player |
| `bank` | Bank deposit + interest level |
| `tribes` | Tribe data |
| `tribe_members` | Tribe membership |
| `tribe_spells` | Active tribe spells |
| `attacks` | Attack history |
| `spy_history` | Spy mission history |
| `seasons` | Season metadata |
| `hall_of_fame` | Hall of fame entries |
| `balance_overrides` | Admin-editable balance values |
| `admin_logs` | Audit log for admin actions |

---

## 1. players

```sql
CREATE TABLE players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT UNIQUE NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'player', -- 'player' | 'admin'
  race            TEXT NOT NULL,                  -- 'orc' | 'human' | 'elf' | 'dwarf'
  army_name       TEXT NOT NULL,
  city            INT NOT NULL DEFAULT 1,         -- 1-5
  turns           INT NOT NULL DEFAULT 100,
  max_turns       INT NOT NULL DEFAULT 30,        -- accumulation cap per tick: 30
  capacity        INT NOT NULL DEFAULT 2500,      -- max trained units
  reputation      INT NOT NULL DEFAULT 0,
  rank_city       INT,
  rank_global     INT,
  power_attack    BIGINT NOT NULL DEFAULT 0,
  power_defense   BIGINT NOT NULL DEFAULT 0,
  power_spy       BIGINT NOT NULL DEFAULT 0,
  power_scout     BIGINT NOT NULL DEFAULT 0,
  power_total     BIGINT NOT NULL DEFAULT 0,
  vip_until       TIMESTAMPTZ,
  is_vacation     BOOLEAN NOT NULL DEFAULT false,
  vacation_days_used INT NOT NULL DEFAULT 0,
  season_id       INT NOT NULL DEFAULT 1,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Race bonus applied at query time (not stored) — see `balance.config.ts`**

---

## 2. resources

```sql
CREATE TABLE resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  gold        BIGINT NOT NULL DEFAULT 5000,
  iron        BIGINT NOT NULL DEFAULT 5000,
  wood        BIGINT NOT NULL DEFAULT 5000,
  food        BIGINT NOT NULL DEFAULT 5000,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id)
);
```

---

## 3. army

```sql
CREATE TABLE army (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  soldiers        INT NOT NULL DEFAULT 0,
  cavalry         INT NOT NULL DEFAULT 0,   -- max 1 per 10 soldiers
  spies           INT NOT NULL DEFAULT 0,
  scouts          INT NOT NULL DEFAULT 0,
  slaves          INT NOT NULL DEFAULT 0,   -- captured enemy soldiers
  farmers         INT NOT NULL DEFAULT 0,   -- food production
  free_population INT NOT NULL DEFAULT 0,   -- untrained population
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id)
);
```

---

## 4. weapons

```sql
CREATE TABLE weapons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Attack weapons
  slingshot       INT NOT NULL DEFAULT 0,   -- power: 2,  max: 25
  boomerang       INT NOT NULL DEFAULT 0,   -- power: 5,  max: 12
  pirate_knife    INT NOT NULL DEFAULT 0,   -- power: 12, max: 6
  axe             INT NOT NULL DEFAULT 0,   -- power: 28, max: 3
  master_knife    INT NOT NULL DEFAULT 0,   -- power: 64, max: 1
  knight_axe      INT NOT NULL DEFAULT 0,   -- power: 148, max: 1
  iron_ball       INT NOT NULL DEFAULT 0,   -- power: 340, max: 1
  -- Defense weapons (mirror structure, different names)
  wood_shield     INT NOT NULL DEFAULT 0,
  iron_shield     INT NOT NULL DEFAULT 0,
  leather_armor   INT NOT NULL DEFAULT 0,
  chain_armor     INT NOT NULL DEFAULT 0,
  plate_armor     INT NOT NULL DEFAULT 0,
  mithril_armor   INT NOT NULL DEFAULT 0,
  gods_armor      INT NOT NULL DEFAULT 0,
  -- Spy equipment
  shadow_cloak    INT NOT NULL DEFAULT 0,
  dark_mask       INT NOT NULL DEFAULT 0,
  elven_gear      INT NOT NULL DEFAULT 0,
  -- Scout equipment
  scout_boots     INT NOT NULL DEFAULT 0,
  scout_cloak     INT NOT NULL DEFAULT 0,
  elven_boots     INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id)
);
```

---

## 5. training

```sql
CREATE TABLE training (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Basic training types (each is a level, cost: 300 gold + 300 food per level)
  attack_level          INT NOT NULL DEFAULT 0,   -- "use stones"
  defense_level         INT NOT NULL DEFAULT 0,   -- "tent technology"
  spy_level             INT NOT NULL DEFAULT 0,   -- "basic infiltration"
  scout_level           INT NOT NULL DEFAULT 0,   -- "basic patrol"
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id)
);
```

---

## 6. development

```sql
CREATE TABLE development (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id             UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Production levels (1–10 each)
  gold_level            INT NOT NULL DEFAULT 1,
  food_level            INT NOT NULL DEFAULT 1,
  wood_level            INT NOT NULL DEFAULT 1,
  iron_level            INT NOT NULL DEFAULT 1,
  population_level      INT NOT NULL DEFAULT 1,
  -- Fortifications (1–5, +10% defense per level)
  fortification_level   INT NOT NULL DEFAULT 1,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id)
);
```

---

## 7. hero

```sql
CREATE TABLE hero (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  level           INT NOT NULL DEFAULT 1,         -- 1–100
  xp              INT NOT NULL DEFAULT 0,
  xp_next_level   INT NOT NULL DEFAULT 100,
  spell_points    INT NOT NULL DEFAULT 1,          -- unspent points
  mana            INT NOT NULL DEFAULT 0,          -- personal mana
  mana_per_tick   INT NOT NULL DEFAULT 1,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id)
);
```

---

## 8. hero_spells

```sql
CREATE TABLE hero_spells (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  spell_key   TEXT NOT NULL,   -- e.g. 'gold_1', 'attack_30', 'resource_45'
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id, spell_key)
);
```

**Spell keys follow pattern: `{category}_{bonus_percent}`**
Categories: `gold`, `attack`, `defense`, `spy`, `scout`, `resource`

---

## 9. bank

```sql
CREATE TABLE bank (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  balance             BIGINT NOT NULL DEFAULT 0,
  interest_level      INT NOT NULL DEFAULT 0,     -- 0 = 0%, each level +0.125%
  deposits_today      INT NOT NULL DEFAULT 0,     -- resets daily, max 2
  last_deposit_reset  DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id)
);
```

---

## 10. tribes

```sql
CREATE TABLE tribes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  anthem      TEXT,                               -- tribe motto/anthem
  city        INT NOT NULL,                       -- tribes are city-specific
  leader_id   UUID NOT NULL REFERENCES players(id),
  deputy_id   UUID REFERENCES players(id),
  level       INT NOT NULL DEFAULT 1,
  reputation  BIGINT NOT NULL DEFAULT 0,
  mana        INT NOT NULL DEFAULT 0,
  max_members INT NOT NULL DEFAULT 25,
  tax_amount  BIGINT NOT NULL DEFAULT 0,          -- daily tax in gold
  power_total BIGINT NOT NULL DEFAULT 0,          -- avg of all members
  season_id   INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 11. tribe_members

```sql
CREATE TABLE tribe_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id        UUID NOT NULL REFERENCES tribes(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reputation      INT NOT NULL DEFAULT 0,
  reputation_pct  FLOAT NOT NULL DEFAULT 0,       -- % of tribe total
  tax_paid_today  BOOLEAN NOT NULL DEFAULT false,
  tax_exempt      BOOLEAN NOT NULL DEFAULT false, -- set by leader/deputy
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tribe_id, player_id)
);
```

---

## 12. tribe_spells

```sql
CREATE TABLE tribe_spells (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id    UUID NOT NULL REFERENCES tribes(id) ON DELETE CASCADE,
  spell_key   TEXT NOT NULL,   -- 'combat_boost' | 'tribe_shield' | 'production_blessing' etc.
  activated_by UUID NOT NULL REFERENCES players(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 13. attacks

```sql
CREATE TABLE attacks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id     UUID NOT NULL REFERENCES players(id),
  defender_id     UUID NOT NULL REFERENCES players(id),
  turns_used      INT NOT NULL,
  atk_power       BIGINT NOT NULL,
  def_power       BIGINT NOT NULL,
  outcome         TEXT NOT NULL,   -- 'crushing_win' | 'win' | 'draw' | 'loss' | 'crushing_loss'
  attacker_losses INT NOT NULL DEFAULT 0,
  defender_losses INT NOT NULL DEFAULT 0,
  slaves_taken    INT NOT NULL DEFAULT 0,
  gold_stolen     BIGINT NOT NULL DEFAULT 0,
  iron_stolen     BIGINT NOT NULL DEFAULT 0,
  wood_stolen     BIGINT NOT NULL DEFAULT 0,
  food_stolen     BIGINT NOT NULL DEFAULT 0,
  season_id       INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast history queries
CREATE INDEX idx_attacks_defender ON attacks(defender_id, created_at DESC);
CREATE INDEX idx_attacks_attacker ON attacks(attacker_id, created_at DESC);
```

---

## 14. spy_history

```sql
CREATE TABLE spy_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spy_owner_id    UUID NOT NULL REFERENCES players(id),
  target_id       UUID NOT NULL REFERENCES players(id),
  success         BOOLEAN NOT NULL,
  spies_caught    INT NOT NULL DEFAULT 0,
  data_revealed   JSONB,   -- if success: { soldiers, cavalry, gold, ... }
  season_id       INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 15. seasons

```sql
CREATE TABLE seasons (
  id          SERIAL PRIMARY KEY,
  number      INT UNIQUE NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES players(id)   -- admin who opened it
);
```

---

## 16. hall_of_fame

```sql
CREATE TABLE hall_of_fame (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   INT NOT NULL REFERENCES seasons(id),
  type        TEXT NOT NULL,   -- 'player' | 'tribe'
  rank        INT NOT NULL,    -- 1–20 for players, 1–5 for tribes
  name        TEXT NOT NULL,
  race        TEXT,            -- for players
  city        INT,             -- final city
  power_total BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 17. balance_overrides

```sql
CREATE TABLE balance_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,   -- e.g. 'soldier_cost_gold'
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES players(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Admin Panel writes here. Game logic reads `balance.config.ts` first,
then checks this table for overrides at server startup.**

---

## 18. admin_logs

```sql
CREATE TABLE admin_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES players(id),
  action      TEXT NOT NULL,   -- e.g. 'ban_player', 'edit_balance', 'force_season_end'
  target_id   UUID,            -- player/tribe affected (if any)
  details     JSONB,           -- before/after values
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## RLS Policies (summary)

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| players | own row | — | own row | — |
| resources | own row | — | own row (via API) | — |
| army | own row | — | own row (via API) | — |
| attacks | own rows (attacker/defender) | via API only | — | — |
| tribes | all (public) | via API only | leader/deputy | — |
| hall_of_fame | all (public) | admin only | — | — |
| balance_overrides | admin only | admin only | admin only | admin only |
| admin_logs | admin only | admin only | — | — |

> **All writes go through API Routes, never directly from client to DB.**
> RLS is a safety net, not the primary access control.
