-- ============================================================
-- Domiron v5 — VIP Boost System Migration
-- Adds the player_boosts table for temporary purchasable modifiers.
-- ============================================================

-- ─────────────────────────────────────────
-- Boost type enum
-- ─────────────────────────────────────────
CREATE TYPE boost_type AS ENUM (
  'SLAVE_OUTPUT_10',
  'SLAVE_OUTPUT_20',
  'SLAVE_OUTPUT_30',
  'RESOURCE_SHIELD',
  'SOLDIER_SHIELD',
  'ATTACK_POWER_10',
  'DEFENSE_POWER_10'
);

-- ─────────────────────────────────────────
-- player_boosts table
-- ─────────────────────────────────────────
CREATE TABLE player_boosts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type             boost_type  NOT NULL,
  starts_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at          TIMESTAMPTZ NOT NULL,
  -- For shields: timestamp after which the next shield of this type may start.
  -- Null for non-shield boost types.
  cooldown_ends_at TIMESTAMPTZ,
  -- Arbitrary JSON payload for UI fields (imageKey, priceId, purchaseRef, etc.)
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_boost_window CHECK (ends_at > starts_at),
  CONSTRAINT chk_cooldown_after_end CHECK (
    cooldown_ends_at IS NULL OR cooldown_ends_at >= ends_at
  )
);

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────

-- Primary lookup: active boosts for a player (used by getActiveBoostTotals)
CREATE INDEX idx_player_boosts_active
  ON player_boosts (player_id, ends_at DESC);

-- Shield vulnerability window lookup
CREATE INDEX idx_player_boosts_cooldown
  ON player_boosts (player_id, type, cooldown_ends_at)
  WHERE cooldown_ends_at IS NOT NULL;

-- ─────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────
ALTER TABLE player_boosts ENABLE ROW LEVEL SECURITY;

-- Players can read their own boosts
CREATE POLICY "player_boosts: player read own"
  ON player_boosts FOR SELECT
  USING (auth.uid() = player_id);

-- Only the service role (API routes via createAdminClient) may insert/update/delete.
-- No direct client-side write policies.
