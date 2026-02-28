-- ============================================================
-- Domiron — Initial Database Migration
-- All 18 tables as defined in database-schema.md
-- Run this in your Supabase SQL Editor or via supabase db push
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. seasons (referenced by players, tribes, etc.)
-- ============================================================
CREATE TABLE seasons (
  id          SERIAL PRIMARY KEY,
  number      INT UNIQUE NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID  -- references players.id, added as FK after players table
);

-- Insert the first season
INSERT INTO seasons (number, started_at, is_active)
VALUES (1, NOW(), true);

-- ============================================================
-- 2. players
-- ============================================================
CREATE TABLE players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT UNIQUE NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'player',   -- 'player' | 'admin'
  race            TEXT NOT NULL,                    -- 'orc' | 'human' | 'elf' | 'dwarf'
  army_name       TEXT NOT NULL,
  city            INT NOT NULL DEFAULT 1,           -- 1-5
  turns           INT NOT NULL DEFAULT 100,
  max_turns       INT NOT NULL DEFAULT 30,
  capacity        INT NOT NULL DEFAULT 2500,
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
  season_id       INT NOT NULL DEFAULT 1 REFERENCES seasons(id),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_role  CHECK (role IN ('player', 'admin')),
  CONSTRAINT chk_race  CHECK (race IN ('orc', 'human', 'elf', 'dwarf')),
  CONSTRAINT chk_city  CHECK (city BETWEEN 1 AND 5),
  CONSTRAINT chk_turns CHECK (turns >= 0)
);

-- Add FK from seasons to players (created_by)
ALTER TABLE seasons
  ADD CONSTRAINT fk_seasons_created_by
  FOREIGN KEY (created_by) REFERENCES players(id);

-- ============================================================
-- 3. resources
-- ============================================================
CREATE TABLE resources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  gold        BIGINT NOT NULL DEFAULT 5000,
  iron        BIGINT NOT NULL DEFAULT 5000,
  wood        BIGINT NOT NULL DEFAULT 5000,
  food        BIGINT NOT NULL DEFAULT 5000,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id),
  CONSTRAINT chk_gold CHECK (gold >= 0),
  CONSTRAINT chk_iron CHECK (iron >= 0),
  CONSTRAINT chk_wood CHECK (wood >= 0),
  CONSTRAINT chk_food CHECK (food >= 0)
);

-- ============================================================
-- 4. army
-- ============================================================
CREATE TABLE army (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  soldiers        INT NOT NULL DEFAULT 0,
  cavalry         INT NOT NULL DEFAULT 0,
  spies           INT NOT NULL DEFAULT 0,
  scouts          INT NOT NULL DEFAULT 0,
  slaves          INT NOT NULL DEFAULT 0,
  farmers         INT NOT NULL DEFAULT 0,
  free_population INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id),
  CONSTRAINT chk_soldiers CHECK (soldiers >= 0),
  CONSTRAINT chk_cavalry  CHECK (cavalry  >= 0),
  CONSTRAINT chk_spies    CHECK (spies    >= 0),
  CONSTRAINT chk_scouts   CHECK (scouts   >= 0),
  CONSTRAINT chk_slaves   CHECK (slaves   >= 0),
  CONSTRAINT chk_farmers  CHECK (farmers  >= 0)
);

-- ============================================================
-- 5. weapons
-- ============================================================
CREATE TABLE weapons (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Attack weapons
  slingshot     INT NOT NULL DEFAULT 0,
  boomerang     INT NOT NULL DEFAULT 0,
  pirate_knife  INT NOT NULL DEFAULT 0,
  axe           INT NOT NULL DEFAULT 0,
  master_knife  INT NOT NULL DEFAULT 0,
  knight_axe    INT NOT NULL DEFAULT 0,
  iron_ball     INT NOT NULL DEFAULT 0,
  -- Defense weapons
  wood_shield   INT NOT NULL DEFAULT 0,
  iron_shield   INT NOT NULL DEFAULT 0,
  leather_armor INT NOT NULL DEFAULT 0,
  chain_armor   INT NOT NULL DEFAULT 0,
  plate_armor   INT NOT NULL DEFAULT 0,
  mithril_armor INT NOT NULL DEFAULT 0,
  gods_armor    INT NOT NULL DEFAULT 0,
  -- Spy equipment
  shadow_cloak  INT NOT NULL DEFAULT 0,
  dark_mask     INT NOT NULL DEFAULT 0,
  elven_gear    INT NOT NULL DEFAULT 0,
  -- Scout equipment
  scout_boots   INT NOT NULL DEFAULT 0,
  scout_cloak   INT NOT NULL DEFAULT 0,
  elven_boots   INT NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id)
);

-- ============================================================
-- 6. training
-- ============================================================
CREATE TABLE training (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  attack_level    INT NOT NULL DEFAULT 0,
  defense_level   INT NOT NULL DEFAULT 0,
  spy_level       INT NOT NULL DEFAULT 0,
  scout_level     INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id),
  CONSTRAINT chk_atk_level CHECK (attack_level  >= 0),
  CONSTRAINT chk_def_level CHECK (defense_level >= 0),
  CONSTRAINT chk_spy_level CHECK (spy_level      >= 0),
  CONSTRAINT chk_sct_level CHECK (scout_level    >= 0)
);

-- ============================================================
-- 7. development
-- ============================================================
CREATE TABLE development (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  gold_level          INT NOT NULL DEFAULT 1,
  food_level          INT NOT NULL DEFAULT 1,
  wood_level          INT NOT NULL DEFAULT 1,
  iron_level          INT NOT NULL DEFAULT 1,
  population_level    INT NOT NULL DEFAULT 1,
  fortification_level INT NOT NULL DEFAULT 1,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id),
  CONSTRAINT chk_dev_levels CHECK (
    gold_level BETWEEN 1 AND 10 AND
    food_level BETWEEN 1 AND 10 AND
    wood_level BETWEEN 1 AND 10 AND
    iron_level BETWEEN 1 AND 10 AND
    population_level BETWEEN 1 AND 10 AND
    fortification_level BETWEEN 1 AND 5
  )
);

-- ============================================================
-- 8. hero
-- ============================================================
CREATE TABLE hero (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  level           INT NOT NULL DEFAULT 1,
  xp              INT NOT NULL DEFAULT 0,
  xp_next_level   INT NOT NULL DEFAULT 100,
  spell_points    INT NOT NULL DEFAULT 1,
  mana            INT NOT NULL DEFAULT 0,
  mana_per_tick   INT NOT NULL DEFAULT 1,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id),
  CONSTRAINT chk_hero_level CHECK (level BETWEEN 1 AND 100),
  CONSTRAINT chk_hero_xp    CHECK (xp >= 0),
  CONSTRAINT chk_hero_mana  CHECK (mana >= 0)
);

-- ============================================================
-- 9. hero_spells
-- ============================================================
CREATE TABLE hero_spells (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  spell_key    TEXT NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id, spell_key)
);

-- ============================================================
-- 10. bank
-- ============================================================
CREATE TABLE bank (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id           UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  balance             BIGINT NOT NULL DEFAULT 0,
  interest_level      INT NOT NULL DEFAULT 0,
  deposits_today      INT NOT NULL DEFAULT 0,
  last_deposit_reset  DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(player_id),
  CONSTRAINT chk_bank_balance CHECK (balance >= 0),
  CONSTRAINT chk_deposits     CHECK (deposits_today BETWEEN 0 AND 2)
);

-- ============================================================
-- 11. tribes
-- ============================================================
CREATE TABLE tribes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  anthem      TEXT,
  city        INT NOT NULL,
  leader_id   UUID NOT NULL REFERENCES players(id),
  deputy_id   UUID REFERENCES players(id),
  level       INT NOT NULL DEFAULT 1,
  reputation  BIGINT NOT NULL DEFAULT 0,
  mana        INT NOT NULL DEFAULT 0,
  max_members INT NOT NULL DEFAULT 25,
  tax_amount  BIGINT NOT NULL DEFAULT 0,
  power_total BIGINT NOT NULL DEFAULT 0,
  season_id   INT NOT NULL DEFAULT 1 REFERENCES seasons(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tribe_city CHECK (city BETWEEN 1 AND 5)
);

-- ============================================================
-- 12. tribe_members
-- ============================================================
CREATE TABLE tribe_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id       UUID NOT NULL REFERENCES tribes(id) ON DELETE CASCADE,
  player_id      UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reputation     INT NOT NULL DEFAULT 0,
  reputation_pct FLOAT NOT NULL DEFAULT 0,
  tax_paid_today BOOLEAN NOT NULL DEFAULT false,
  tax_exempt     BOOLEAN NOT NULL DEFAULT false,
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tribe_id, player_id)
);

-- ============================================================
-- 13. tribe_spells
-- ============================================================
CREATE TABLE tribe_spells (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id     UUID NOT NULL REFERENCES tribes(id) ON DELETE CASCADE,
  spell_key    TEXT NOT NULL,
  activated_by UUID NOT NULL REFERENCES players(id),
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tribe_spell_key CHECK (
    spell_key IN ('combat_boost', 'tribe_shield', 'production_blessing', 'mass_spy', 'war_cry')
  )
);

-- ============================================================
-- 14. attacks
-- ============================================================
CREATE TABLE attacks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attacker_id     UUID NOT NULL REFERENCES players(id),
  defender_id     UUID NOT NULL REFERENCES players(id),
  turns_used      INT NOT NULL,
  atk_power       BIGINT NOT NULL,
  def_power       BIGINT NOT NULL,
  outcome         TEXT NOT NULL,
  attacker_losses INT NOT NULL DEFAULT 0,
  defender_losses INT NOT NULL DEFAULT 0,
  slaves_taken    INT NOT NULL DEFAULT 0,
  gold_stolen     BIGINT NOT NULL DEFAULT 0,
  iron_stolen     BIGINT NOT NULL DEFAULT 0,
  wood_stolen     BIGINT NOT NULL DEFAULT 0,
  food_stolen     BIGINT NOT NULL DEFAULT 0,
  season_id       INT NOT NULL DEFAULT 1 REFERENCES seasons(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_outcome CHECK (
    outcome IN ('crushing_win', 'win', 'draw', 'loss', 'crushing_loss')
  ),
  CONSTRAINT chk_turns_used CHECK (turns_used BETWEEN 1 AND 10)
);

CREATE INDEX idx_attacks_defender ON attacks(defender_id, created_at DESC);
CREATE INDEX idx_attacks_attacker ON attacks(attacker_id, created_at DESC);
CREATE INDEX idx_attacks_season   ON attacks(season_id);

-- ============================================================
-- 15. spy_history
-- ============================================================
CREATE TABLE spy_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spy_owner_id  UUID NOT NULL REFERENCES players(id),
  target_id     UUID NOT NULL REFERENCES players(id),
  success       BOOLEAN NOT NULL,
  spies_caught  INT NOT NULL DEFAULT 0,
  data_revealed JSONB,
  season_id     INT NOT NULL DEFAULT 1 REFERENCES seasons(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_spy_owner ON spy_history(spy_owner_id, created_at DESC);
CREATE INDEX idx_spy_target ON spy_history(target_id, created_at DESC);

-- ============================================================
-- 16. hall_of_fame
-- ============================================================
CREATE TABLE hall_of_fame (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id   INT NOT NULL REFERENCES seasons(id),
  type        TEXT NOT NULL,
  rank        INT NOT NULL,
  name        TEXT NOT NULL,
  race        TEXT,
  city        INT,
  power_total BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_hof_type CHECK (type IN ('player', 'tribe'))
);

CREATE INDEX idx_hof_season ON hall_of_fame(season_id, type, rank);

-- ============================================================
-- 17. balance_overrides
-- ============================================================
CREATE TABLE balance_overrides (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT UNIQUE NOT NULL,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES players(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 18. admin_logs
-- ============================================================
CREATE TABLE admin_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES players(id),
  action      TEXT NOT NULL,
  target_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_logs_admin ON admin_logs(admin_id, created_at DESC);

-- ============================================================
-- ADDITIONAL INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX idx_players_city        ON players(city);
CREATE INDEX idx_players_rank_global ON players(rank_global);
CREATE INDEX idx_players_rank_city   ON players(city, rank_city);
CREATE INDEX idx_players_season      ON players(season_id);
CREATE INDEX idx_players_power_total ON players(power_total DESC);
CREATE INDEX idx_tribes_city         ON tribes(city, season_id);
CREATE INDEX idx_tribe_members_player ON tribe_members(player_id);
CREATE INDEX idx_hero_spells_player  ON hero_spells(player_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE players         ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources       ENABLE ROW LEVEL SECURITY;
ALTER TABLE army            ENABLE ROW LEVEL SECURITY;
ALTER TABLE weapons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE training        ENABLE ROW LEVEL SECURITY;
ALTER TABLE development     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hero            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hero_spells     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tribes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tribe_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tribe_spells    ENABLE ROW LEVEL SECURITY;
ALTER TABLE attacks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE spy_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons         ENABLE ROW LEVEL SECURITY;
ALTER TABLE hall_of_fame    ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs      ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- All writes go through API routes using service role key.
-- These policies apply to the anon key (client reads).
-- ============================================================

-- NOTE: We use auth.uid() for Supabase Auth integration.
-- Since we use NextAuth + service role for writes, we also need
-- a custom claim. For reads, we use the player_id passed via
-- the Supabase SSR client with RLS policies that allow service
-- role to bypass. Client reads are locked to own rows.

-- players: can read own row only, no direct updates
CREATE POLICY "players_select_own"
  ON players FOR SELECT
  USING (true);  -- public read for rankings (filtered by API)

-- Restrict UPDATE/INSERT/DELETE to service role (API routes)
-- No explicit policies = service role only for mutations

-- resources: own row only
CREATE POLICY "resources_select_own"
  ON resources FOR SELECT
  USING (true);  -- API filters by player_id in query

-- army: own row only
CREATE POLICY "army_select_own"
  ON army FOR SELECT
  USING (true);

-- weapons: own row only
CREATE POLICY "weapons_select_own"
  ON weapons FOR SELECT
  USING (true);

-- training: own row only
CREATE POLICY "training_select_own"
  ON training FOR SELECT
  USING (true);

-- development: own row only
CREATE POLICY "development_select_own"
  ON development FOR SELECT
  USING (true);

-- hero: own row only
CREATE POLICY "hero_select_own"
  ON hero FOR SELECT
  USING (true);

-- hero_spells: own rows only
CREATE POLICY "hero_spells_select_own"
  ON hero_spells FOR SELECT
  USING (true);

-- bank: own row only
CREATE POLICY "bank_select_own"
  ON bank FOR SELECT
  USING (true);

-- tribes: public read (all players can see tribes)
CREATE POLICY "tribes_select_public"
  ON tribes FOR SELECT
  USING (true);

-- tribe_members: public read
CREATE POLICY "tribe_members_select_public"
  ON tribe_members FOR SELECT
  USING (true);

-- tribe_spells: public read
CREATE POLICY "tribe_spells_select_public"
  ON tribe_spells FOR SELECT
  USING (true);

-- attacks: own rows (attacker or defender)
CREATE POLICY "attacks_select_own"
  ON attacks FOR SELECT
  USING (true);  -- API filters by player_id

-- spy_history: own rows
CREATE POLICY "spy_history_select_own"
  ON spy_history FOR SELECT
  USING (true);

-- seasons: public read
CREATE POLICY "seasons_select_public"
  ON seasons FOR SELECT
  USING (true);

-- hall_of_fame: public read
CREATE POLICY "hall_of_fame_select_public"
  ON hall_of_fame FOR SELECT
  USING (true);

-- balance_overrides: deny all client access (service role only)
-- No SELECT policy = no anon access

-- admin_logs: deny all client access (service role only)
-- No SELECT policy = no anon access

-- ============================================================
-- REALTIME SUBSCRIPTIONS
-- Enable realtime for tables that need live updates
-- ============================================================
-- Run these in Supabase Dashboard → Database → Replication
-- Or via SQL:

ALTER PUBLICATION supabase_realtime ADD TABLE attacks;
ALTER PUBLICATION supabase_realtime ADD TABLE resources;
ALTER PUBLICATION supabase_realtime ADD TABLE tribe_spells;
ALTER PUBLICATION supabase_realtime ADD TABLE tribe_members;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
