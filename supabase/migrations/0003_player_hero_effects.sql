-- ============================================================
-- Domiron v5 — Hero Effect System Migration
-- Replaces the legacy player_boosts table.
-- Canonical source for all active hero/VIP temporary modifiers.
-- ============================================================

-- ─────────────────────────────────────────
-- Drop legacy VIP boost system
-- ─────────────────────────────────────────
DROP TABLE IF EXISTS player_boosts;
DROP TYPE  IF EXISTS boost_type;

-- ─────────────────────────────────────────
-- Hero effect type enum (7 values)
-- ─────────────────────────────────────────
CREATE TYPE hero_effect_type AS ENUM (
  'SLAVE_OUTPUT_10',
  'SLAVE_OUTPUT_20',
  'SLAVE_OUTPUT_30',
  'RESOURCE_SHIELD',
  'SOLDIER_SHIELD',
  'ATTACK_POWER_10',
  'DEFENSE_POWER_10'
);

-- ─────────────────────────────────────────
-- player_hero_effects table
-- ─────────────────────────────────────────
CREATE TABLE player_hero_effects (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id        UUID             NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  type             hero_effect_type NOT NULL,
  starts_at        TIMESTAMPTZ      NOT NULL DEFAULT now(),
  ends_at          TIMESTAMPTZ      NOT NULL,
  -- For shields: timestamp after which the next shield of this type may start.
  -- NULL for non-shield effect types.
  cooldown_ends_at TIMESTAMPTZ,
  -- Arbitrary JSON payload for UI fields (imageKey, priceId, nameKey, etc.).
  -- Keeps naming dynamic: UI reads metadata.imageKey, metadata.nameKey, etc.
  metadata         JSONB,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT now(),

  CONSTRAINT chk_effect_window  CHECK (ends_at > starts_at),
  CONSTRAINT chk_cooldown_order CHECK (
    cooldown_ends_at IS NULL OR cooldown_ends_at >= ends_at
  )
);

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────

-- Primary lookup: active effects for a player (getActiveHeroEffects hot path)
CREATE INDEX idx_player_hero_effects_active
  ON player_hero_effects (player_id, ends_at DESC);

-- Shield vulnerability window lookup
CREATE INDEX idx_player_hero_effects_cooldown
  ON player_hero_effects (player_id, type, cooldown_ends_at)
  WHERE cooldown_ends_at IS NOT NULL;

-- ─────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────
ALTER TABLE player_hero_effects ENABLE ROW LEVEL SECURITY;

-- Players can read their own effects (for Hero page countdown display)
CREATE POLICY "player_hero_effects: player read own"
  ON player_hero_effects FOR SELECT
  USING (auth.uid() = player_id);

-- Only the service role (API routes via createAdminClient) may write.
-- No direct client-side insert/update/delete policies.
