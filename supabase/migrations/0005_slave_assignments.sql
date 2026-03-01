-- ============================================================
-- Domiron — Slave Assignment System Migration
-- Adds per-resource slave allocation columns to the army table.
--
-- Previously all slaves produced ALL resources simultaneously each tick.
-- This migration introduces persistent per-resource assignment so that
-- each slave produces exactly ONE resource based on player assignment.
--
-- New columns:
--   slaves_gold  — slaves assigned to gold production
--   slaves_iron  — slaves assigned to iron production
--   slaves_wood  — slaves assigned to wood production
--   slaves_food  — slaves assigned to food production
--   idle = army.slaves - (slaves_gold + slaves_iron + slaves_wood + slaves_food)
--
-- Invariant (enforced at application layer):
--   slaves_gold + slaves_iron + slaves_wood + slaves_food <= slaves
-- ============================================================

ALTER TABLE army
  ADD COLUMN slaves_gold INT NOT NULL DEFAULT 0,
  ADD COLUMN slaves_iron INT NOT NULL DEFAULT 0,
  ADD COLUMN slaves_wood INT NOT NULL DEFAULT 0,
  ADD COLUMN slaves_food INT NOT NULL DEFAULT 0;

ALTER TABLE army
  ADD CONSTRAINT chk_slaves_gold CHECK (slaves_gold >= 0),
  ADD CONSTRAINT chk_slaves_iron CHECK (slaves_iron >= 0),
  ADD CONSTRAINT chk_slaves_wood CHECK (slaves_wood >= 0),
  ADD CONSTRAINT chk_slaves_food CHECK (slaves_food >= 0);
