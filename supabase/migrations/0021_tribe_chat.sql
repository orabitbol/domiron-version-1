-- ============================================================
-- Migration 0021 — Tribe Chat (V1)
-- Generated: 2026-03-04
-- Adds tribe-scoped chat messages.
-- Only tribe members can read/insert for their own tribe.
-- ============================================================

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tribe_chat (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id   uuid        NOT NULL REFERENCES tribes(id)   ON DELETE CASCADE,
  player_id  uuid        NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  message    text        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tribe_chat_tribe_created
  ON tribe_chat (tribe_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE tribe_chat ENABLE ROW LEVEL SECURITY;

-- Tribe members can read their own tribe's messages
CREATE POLICY "tribe_members_read_chat" ON tribe_chat
  FOR SELECT
  USING (
    tribe_id IN (
      SELECT tribe_id FROM tribe_members WHERE player_id = auth.uid()
    )
  );

-- Tribe members can insert messages for their own tribe, attributed to themselves
CREATE POLICY "tribe_members_send_chat" ON tribe_chat
  FOR INSERT
  WITH CHECK (
    player_id = auth.uid()
    AND tribe_id IN (
      SELECT tribe_id FROM tribe_members WHERE player_id = auth.uid()
    )
  );

