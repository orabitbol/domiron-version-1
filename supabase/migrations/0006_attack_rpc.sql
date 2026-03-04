-- ============================================================
-- Domiron v5 — 0006_attack_rpc.sql
-- Atomic multi-turn attack stored function.
-- ============================================================
--
-- Design contract
-- ───────────────
-- Combat math (resolveCombat, multi-turn scaling, loot/loss
-- clamping) is performed in TypeScript in app/api/attack/route.ts.
-- This function receives the pre-computed deltas and is the sole
-- place that writes to the database, ensuring:
--
--   1. All mutations happen in ONE transaction (atomicity).
--   2. Row-level locks (FOR UPDATE) prevent races where two parallel
--      requests from the same attacker would both pass the TS-side
--      pre-check but then jointly overspend turns or food.
--   3. Locks are acquired in ascending UUID order so that A→B and
--      B→A simultaneous attacks never enter a deadlock cycle.
--
-- Return value
-- ────────────
--   { "ok": true }
--   { "ok": false, "error": "<code>" }
--
-- Error codes (mapped to HTTP 400 by the TypeScript caller):
--   invalid_turns    p_turns_used outside 1–10
--   not_enough_turns attacker turns < p_turns_used (post-lock)
--   not_enough_food  attacker food  < p_food_cost  (post-lock)
--   no_soldiers      attacker soldiers <= 0         (post-lock)
--   different_city   attacker.city != defender.city (post-lock)
-- ============================================================

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
  p_season_id       INT
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
  -- Each branch locks three rows per player atomically (players, army, resources)
  -- via a single SELECT … FOR UPDATE with JOINs.
  --
  -- Why this ordering prevents deadlocks
  -- ─────────────────────────────────────
  -- Suppose A (UUID = 'aaa…') attacks B (UUID = 'bbb…') at the same time as
  -- B attacks A.  Both transactions want to lock A's rows and B's rows.
  -- With random ordering, T1 might lock A first while T2 locks B first — deadlock.
  -- With ascending UUID ordering, both T1 and T2 try to lock 'aaa…' first.
  -- One of them acquires the lock; the other blocks cleanly and waits.
  -- No deadlock cycle is possible.
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
  --
  -- These checks repeat the TS-side pre-checks but now run against the locked,
  -- current DB state.  A concurrent attack from the same attacker could have
  -- spent turns/food in the milliseconds between the TS pre-check and this lock.
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

  UPDATE army
    SET soldiers   = GREATEST(0, soldiers - p_attacker_losses),
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
    p_attacker_losses, p_defender_losses, 0,
    p_gold_stolen,     p_iron_stolen,     p_wood_stolen, p_food_stolen,
    p_season_id
  );

  RETURN jsonb_build_object('ok', true);

END;
$$;

-- Grant execute to the postgres and service_role used by createAdminClient().
-- Explicit grants make this reproducible across Supabase project resets.
GRANT EXECUTE ON FUNCTION attack_multi_turn_apply(
  UUID, UUID, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
  INT, INT, TEXT, BIGINT, BIGINT, INT
) TO postgres, service_role;
