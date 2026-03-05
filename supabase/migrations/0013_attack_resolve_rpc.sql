-- ============================================================
-- Domiron v5 — 0013_attack_resolve_rpc.sql
-- Renames attack_multi_turn_apply → attack_resolve_apply and
-- makes it the canonical, sole atomic write path for all attack
-- mutations.
-- ============================================================
--
-- History
-- ───────
-- 0006_attack_rpc.sql        — introduced attack_multi_turn_apply (14 params)
-- 0011_attack_rpc_captives.sql — added p_slaves_taken (15 params)
-- 0013_attack_resolve_rpc.sql — renames to attack_resolve_apply;
--                               drops attack_multi_turn_apply.
--
-- Why a canonical name?
-- ─────────────────────
-- "attack_multi_turn_apply" described an implementation detail (multi-turn
-- scaling). "attack_resolve_apply" describes the purpose: atomically
-- resolve and persist one attack. Structural tests in
-- lib/game/attack-resolve.test.ts now enforce exactly one
-- .rpc('attack_resolve_apply', …) call in the route, with no
-- direct .update() calls on players / resources / army.
--
-- Atomicity guarantee (unchanged from 0011)
-- ──────────────────────────────────────────
-- All mutations happen inside one Postgres transaction:
--   • players.turns deducted
--   • attacker army.soldiers reduced, army.slaves incremented
--   • attacker resources: food debited, loot credited
--   • defender army.soldiers reduced
--   • defender resources: loot debited
--   • attacks row inserted
-- Row locks acquired with SELECT … FOR UPDATE in ascending UUID
-- order so that A→B and B→A concurrent attacks never deadlock.
-- All conditions are re-validated under lock (TOCTTOU-safe):
--   turns ≥ p_turns_used, food ≥ p_food_cost, soldiers > 0, same city.
-- ============================================================

-- Drop the old function (15-param version from 0011).
DROP FUNCTION IF EXISTS attack_multi_turn_apply(
  UUID, UUID, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
  INT, INT, TEXT, BIGINT, BIGINT, INT, INT
);

-- Create the canonical attack_resolve_apply function.
CREATE OR REPLACE FUNCTION attack_resolve_apply(
  p_attacker_id     UUID,
  p_defender_id     UUID,
  p_turns_used      INT,
  p_food_cost       BIGINT,
  p_gold_stolen     BIGINT,
  p_iron_stolen     BIGINT,
  p_wood_stolen     BIGINT,
  p_food_stolen     BIGINT,
  p_attacker_losses INT,
  p_defender_losses INT,
  p_outcome         TEXT,
  p_atk_power       BIGINT,
  p_def_power       BIGINT,
  p_season_id       INT,
  p_slaves_taken    INT        -- captive soldiers added to attacker army.slaves
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_att_turns    INT;
  v_att_food     BIGINT;
  v_att_soldiers INT;
  v_att_city     INT;
  v_def_city     INT;
  v_def_soldiers INT;
BEGIN

  -- Input bounds check (schema CHECK covers this on INSERT; checked here first
  -- so the caller receives a clean error code rather than a constraint violation).
  IF p_turns_used < 1 OR p_turns_used > 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_turns');
  END IF;

  -- ── Acquire row-level locks in ascending UUID order ───────────────────────
  --
  -- Locks are acquired in ascending UUID order so that A→B and B→A
  -- simultaneous attacks never deadlock.

  IF p_attacker_id <= p_defender_id THEN

    -- Lock attacker rows first (smaller UUID)
    SELECT p.turns, p.city, a.soldiers, r.food
      INTO v_att_turns, v_att_city, v_att_soldiers, v_att_food
      FROM players   p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id
      WHERE p.id = p_attacker_id
      FOR UPDATE;

    -- Lock defender rows second
    SELECT p.city, a.soldiers
      INTO v_def_city, v_def_soldiers
      FROM players   p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id   -- join to acquire the lock
      WHERE p.id = p_defender_id
      FOR UPDATE;

  ELSE

    -- Lock defender rows first (smaller UUID)
    SELECT p.city, a.soldiers
      INTO v_def_city, v_def_soldiers
      FROM players   p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id
      WHERE p.id = p_defender_id
      FOR UPDATE;

    -- Lock attacker rows second
    SELECT p.turns, p.city, a.soldiers, r.food
      INTO v_att_turns, v_att_city, v_att_soldiers, v_att_food
      FROM players   p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id
      WHERE p.id = p_attacker_id
      FOR UPDATE;

  END IF;

  -- ── Post-lock re-validation (TOCTTOU-safe) ────────────────────────────────

  IF v_att_turns < p_turns_used THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_turns');
  END IF;

  IF v_att_food < p_food_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_food');
  END IF;

  IF v_att_soldiers <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_soldiers');
  END IF;

  IF v_att_city != v_def_city THEN
    RETURN jsonb_build_object('ok', false, 'error', 'different_city');
  END IF;

  -- ── Apply mutations (all within this transaction) ─────────────────────────

  -- Attacker: deduct turns
  UPDATE players
    SET turns = turns - p_turns_used
    WHERE id = p_attacker_id;

  -- Attacker: lose soldiers, gain captive slaves
  UPDATE army
    SET soldiers   = GREATEST(0, soldiers - p_attacker_losses),
        slaves     = slaves + p_slaves_taken,
        updated_at = now()
    WHERE player_id = p_attacker_id;

  -- Attacker: deduct food cost, credit all loot
  UPDATE resources
    SET gold       = gold + p_gold_stolen,
        iron       = iron + p_iron_stolen,
        wood       = wood + p_wood_stolen,
        -- food = before - cost + stolen.  GREATEST(0, …) guards edge cases
        -- where a concurrent drain reduced food below food_cost after our lock.
        food       = GREATEST(0, food - p_food_cost + p_food_stolen),
        updated_at = now()
    WHERE player_id = p_attacker_id;

  -- Defender: lose soldiers
  UPDATE army
    SET soldiers   = GREATEST(0, soldiers - p_defender_losses),
        updated_at = now()
    WHERE player_id = p_defender_id;

  -- Defender: loot deducted
  UPDATE resources
    SET gold       = GREATEST(0, gold - p_gold_stolen),
        iron       = GREATEST(0, iron - p_iron_stolen),
        wood       = GREATEST(0, wood - p_wood_stolen),
        food       = GREATEST(0, food - p_food_stolen),
        updated_at = now()
    WHERE player_id = p_defender_id;

  -- Record the attack
  INSERT INTO attacks (
    attacker_id,       defender_id,       turns_used,
    atk_power,         def_power,         outcome,
    attacker_losses,   defender_losses,   slaves_taken,
    gold_stolen,       iron_stolen,       wood_stolen,   food_stolen,
    season_id
  ) VALUES (
    p_attacker_id,     p_defender_id,     p_turns_used,
    p_atk_power,       p_def_power,       p_outcome,
    p_attacker_losses, p_defender_losses, p_slaves_taken,
    p_gold_stolen,     p_iron_stolen,     p_wood_stolen, p_food_stolen,
    p_season_id
  );

  RETURN jsonb_build_object('ok', true);

END;
$$;

-- Grant execute to postgres and service_role (used by createAdminClient()).
GRANT EXECUTE ON FUNCTION attack_resolve_apply(
  UUID, UUID, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
  INT, INT, TEXT, BIGINT, BIGINT, INT, INT
) TO postgres, service_role;
