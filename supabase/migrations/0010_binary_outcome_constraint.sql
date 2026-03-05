-- ============================================================
-- Domiron v5 — 0010_binary_outcome_constraint.sql
-- Migrate attacks.outcome to binary win/loss (no draw/partial).
-- ============================================================
--
-- Context
-- ───────
-- The old constraint allowed: crushing_win, win, draw, loss, crushing_loss
-- The TypeScript combat engine previously produced 'partial' which was
-- mapped to 'draw' before DB insert. Both partial and draw are now retired.
-- The new binary rule: attackerECP >= defenderECP → 'win'; else → 'loss'.
--
-- Migration steps
-- ───────────────
-- 1. Migrate all legacy outcome values to the canonical binary set:
--      crushing_win  → win
--      draw          → win   (was produced from ratio in [0.75, 1.30); now
--                              ratio >= 1.0 wins, so old draws near 1.0 were
--                              close fights — mapping to 'win' is conservative)
--      crushing_loss → loss
-- 2. Drop old constraint.
-- 3. Add new strict constraint: outcome IN ('win', 'loss').
-- ============================================================

-- Step 1: normalise legacy rows
UPDATE attacks SET outcome = 'win'  WHERE outcome IN ('crushing_win', 'draw');
UPDATE attacks SET outcome = 'loss' WHERE outcome = 'crushing_loss';

-- Step 2: drop old constraint
ALTER TABLE attacks DROP CONSTRAINT IF EXISTS chk_outcome;

-- Step 3: new binary constraint
ALTER TABLE attacks
  ADD CONSTRAINT chk_outcome CHECK (outcome IN ('win', 'loss'));
