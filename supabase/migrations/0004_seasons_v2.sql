-- ============================================================
-- Domiron — Season v2 Migration
-- Adds proper season lifecycle columns and replaces the
-- is_active boolean with a typed status column.
-- Run after 0003_player_hero_effects.sql.
-- ============================================================

-- 1. Rename started_at → starts_at (aligns with type definitions and spec)
ALTER TABLE seasons RENAME COLUMN started_at TO starts_at;

-- 2. Add ends_at: the hard 90-day deadline for this season.
--    Backfill for existing seasons so NOT NULL is satisfiable.
ALTER TABLE seasons ADD COLUMN ends_at TIMESTAMPTZ;
UPDATE seasons SET ends_at = starts_at + INTERVAL '90 days';
ALTER TABLE seasons ALTER COLUMN ends_at SET NOT NULL;

-- 3. Replace is_active (boolean) with status ('active' | 'ended').
--    A CHECK constraint makes the allowed values explicit.
ALTER TABLE seasons
  ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'active'
  CONSTRAINT chk_season_status CHECK (status IN ('active', 'ended'));

UPDATE seasons
  SET status = CASE WHEN is_active THEN 'active' ELSE 'ended' END;

ALTER TABLE seasons DROP COLUMN is_active;

-- 4. Audit timestamp for when the season row was inserted.
ALTER TABLE seasons
  ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 5. Unique constraint: only one active season at a time.
--    A partial unique index is the standard Postgres approach.
CREATE UNIQUE INDEX idx_seasons_one_active
  ON seasons (status)
  WHERE status = 'active';
