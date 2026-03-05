-- ============================================================
-- Domiron v5 — 0011_attack_rpc_captives.sql
-- Add captive-soldier support to the attack stored function.
-- ============================================================
--
-- Changes from 0006_attack_rpc.sql
-- ──────────────────────────────────
-- 1. New parameter: p_slaves_taken INT
--    Computed by the TypeScript route as:
--      floor(safeDefLosses × CAPTURE_RATE)   (CAPTURE_RATE = 0.10)
--    Zero whenever defenderLosses is 0 (kill cooldown, shields, protection).
--
-- 2. Attacker army update now also increments army.slaves:
--      SET soldiers = soldiers - p_attacker_losses,
--          slaves   = slaves   + p_slaves_taken
--
-- 3. attacks INSERT uses p_slaves_taken instead of the old hardcoded 0.
--
-- Backwards compatibility
-- ────────────────────────
-- CREATE OR REPLACE cannot replace a function with a different signature;
-- the old 14-param overload must be dropped first.
-- ============================================================

-- Drop old 14-parameter overload
DROP FUNCTION IF EXISTS attack_multi_turn_apply(
  UUID, UUID, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
  INT, INT, TEXT, BIGINT, BIGINT, INT
);

-- Create new 15-parameter version
CREATE OR REPLACE FUNCTION attack_multi_turn_apply(
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

  -- Input bounds (schema CHECK covers this on INSERT; checked here first so the
  -- caller receives a clean error code rather than a constraint violation).
  IF p_turns_used < 1 OR p_turns_used > 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_turns');
  END IF;

  -- ── Acquire row-level locks in ascending UUID order ───────────────────────
  --
  -- Locks are acquired in ascending UUID order so that A→B and B→A
  -- simultaneous attacks never deadlock.
  IF p_attacker_id <= p_defender_id THEN

    -- Lock attacker rows first
    SELECT p.turns, p.city, a.soldiers, r.food
      INTO v_att_turns, v_att_city, v_att_soldiers, v_att_food
      FROM players p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id
      WHERE p.id = p_attacker_id
      FOR UPDATE;

    -- Lock defender rows second
    SELECT p.city, a.soldiers
      INTO v_def_city, v_def_soldiers
      FROM players p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id   -- joined to acquire the lock
      WHERE p.id = p_defender_id
      FOR UPDATE;

  ELSE

    -- Lock defender rows first (smaller UUID)
    SELECT p.city, a.soldiers
      INTO v_def_city, v_def_soldiers
      FROM players p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id
      WHERE p.id = p_defender_id
      FOR UPDATE;

    -- Lock attacker rows second
    SELECT p.turns, p.city, a.soldiers, r.food
      INTO v_att_turns, v_att_city, v_att_soldiers, v_att_food
      FROM players p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id
      WHERE p.id = p_attacker_id
      FOR UPDATE;

  END IF;

  -- ── Post-lock re-validation ───────────────────────────────────────────────
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

  UPDATE players
    SET turns = turns - p_turns_used
    WHERE id = p_attacker_id;

  -- Attacker: lose soldiers, gain captive slaves
  UPDATE army
    SET soldiers   = GREATEST(0, soldiers - p_attacker_losses),
        slaves     = slaves + p_slaves_taken,
        updated_at = now()
    WHERE player_id = p_attacker_id;

  UPDATE resources
    SET gold       = gold + p_gold_stolen,
        iron       = iron + p_iron_stolen,
        wood       = wood + p_wood_stolen,
        -- food = before − cost + stolen.  GREATEST(0,…) guards the edge case
        -- where a concurrent drain reduced food below food_cost after our lock.
        food       = GREATEST(0, food - p_food_cost + p_food_stolen),
        updated_at = now()
    WHERE player_id = p_attacker_id;

  -- Defender: lose soldiers (0 when kill cooldown / shields / protection active)
  UPDATE army
    SET soldiers   = GREATEST(0, soldiers - p_defender_losses),
        updated_at = now()
    WHERE player_id = p_defender_id;

  UPDATE resources
    SET gold       = GREATEST(0, gold - p_gold_stolen),
        iron       = GREATEST(0, iron - p_iron_stolen),
        wood       = GREATEST(0, wood - p_wood_stolen),
        food       = GREATEST(0, food - p_food_stolen),
        updated_at = now()
    WHERE player_id = p_defender_id;

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

-- Grant execute to postgres and service_role used by createAdminClient().
GRANT EXECUTE ON FUNCTION attack_multi_turn_apply(
  UUID, UUID, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
  INT, INT, TEXT, BIGINT, BIGINT, INT, INT
) TO postgres, service_role;
