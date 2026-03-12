-- ============================================================
-- Domiron — Player Onboarding State (Migration 0027)
--
-- Tracks whether a player has completed the first-time game tour.
-- New players (DEFAULT false) see the tour automatically.
-- Existing players are backfilled to true so they are not interrupted.
-- ============================================================

ALTER TABLE players
  ADD COLUMN has_completed_onboarding BOOLEAN NOT NULL DEFAULT false;

-- Existing accounts have already experienced the game.
-- Mark them as done so the tour does not appear retroactively.
-- New registrations receive DEFAULT false from the column definition.
UPDATE players SET has_completed_onboarding = true;
