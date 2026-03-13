-- ============================================================
-- Domiron — Google OAuth Support (Migration 0031)
--
-- 1. Makes password_hash nullable so Google-only accounts (which
--    have no password) can be stored in the same players table.
-- 2. Adds google_id column for future account-linking scenarios.
--
-- Security invariant: the credentials provider authorize() already
-- guards against null password_hash (returns null → auth denied),
-- so existing credentials accounts are not affected.
-- ============================================================

-- Allow NULL for OAuth users who never set a password
ALTER TABLE players
  ALTER COLUMN password_hash DROP NOT NULL;

-- Optional: link to the Google account ID for future multi-provider linking.
-- Nullable — only populated for Google-authenticated users.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
