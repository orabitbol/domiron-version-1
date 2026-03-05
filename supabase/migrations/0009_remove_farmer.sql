-- Migration: Remove Farmer unit
--
-- Farmers duplicated the "slaves assigned to food" mechanic.
-- Any existing farmers are converted to slaves + food-assigned slaves
-- before the column is dropped.
--
-- Safe to run multiple times (idempotent guards via IF EXISTS).

-- 1. Backfill: convert army.farmers > 0 into slaves + slaves_food
UPDATE army
SET
  slaves      = slaves      + farmers,
  slaves_food = slaves_food + farmers
WHERE farmers > 0;

-- 2. Drop constraint and column
ALTER TABLE army DROP CONSTRAINT IF EXISTS chk_farmers;
ALTER TABLE army DROP COLUMN IF EXISTS farmers;
