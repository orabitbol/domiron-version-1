-- ============================================================
-- Domiron v5 — 0008_world_state.sql
-- Single-row world_state table for server-authoritative tick timing.
-- ============================================================
--
-- Why:
--   Client timers used the local wall-clock (:00/:30 boundary), causing
--   every browser to show a different countdown and desynchronising after
--   a tick runs slightly late.
--
-- How it works:
--   1. This table holds a single row (id=1) with next_tick_at.
--   2. After every tick execution, /api/tick sets next_tick_at = now() + interval.
--   3. /api/tick-status (public, unauthenticated) returns { server_now, next_tick_at }.
--   4. The Sidebar TickCountdown fetches that endpoint on mount and on each
--      tick_completed realtime broadcast, then counts down locally.
--
-- Switching back to 30-minute ticks:
--   1. Set TICK_INTERVAL_MINUTES=30 in env (or remove env var — defaults to 30)
--   2. Change vercel.json cron schedule from "* * * * *" back to "*/30 * * * *"
-- ============================================================

CREATE TABLE IF NOT EXISTS world_state (
  id           INT PRIMARY KEY DEFAULT 1,
  next_tick_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT world_state_single_row CHECK (id = 1)
);

-- Seed the single row.  The first real tick will overwrite next_tick_at.
INSERT INTO world_state (id, next_tick_at) VALUES (1, now()) ON CONFLICT (id) DO NOTHING;

-- RLS: enable + public read (anyone can ask when the next tick is)
ALTER TABLE world_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'world_state' AND policyname = 'world_state_select_public'
  ) THEN
    CREATE POLICY "world_state_select_public"
      ON world_state FOR SELECT
      USING (true);
  END IF;
END $$;
