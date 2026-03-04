-- ============================================================
-- Domiron v5 — 0007_bank_deposits_cap.sql
-- Fix bank.deposits_today constraint to match BALANCE.bank.depositsPerDay (5).
-- ============================================================
--
-- Bug: 0001_initial.sql created:
--   CONSTRAINT chk_deposits CHECK (deposits_today BETWEEN 0 AND 2)
-- but BALANCE.bank.depositsPerDay = 5, so the 3rd deposit attempt would
-- raise a constraint violation (error 23514) without a clear user message.
--
-- Fix: drop the old constraint and add a new one with cap = 5.
-- ============================================================

ALTER TABLE bank
  DROP CONSTRAINT IF EXISTS chk_deposits;

ALTER TABLE bank
  ADD CONSTRAINT chk_deposits CHECK (deposits_today BETWEEN 0 AND 5);
