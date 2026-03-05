-- ============================================================
-- Domiron v5 — 0012_city_promote_rpc.sql
-- Atomic city promotion: deduct resources + advance city in
-- one Postgres transaction with row-level locking.
-- ============================================================
--
-- Why RPC / why not two UPDATE calls?
-- ─────────────────────────────────────
-- Without a transaction the sequence is:
--   1. Deduct resources
--   2. Set players.city = next_city
-- A crash/timeout between (1) and (2) leaves the player with
-- resources deducted but still at the old city — unrecoverable.
-- The RPC wraps both writes in a single BEGIN…COMMIT so they
-- are either both applied or both rolled back.
--
-- Row-level locking (FOR UPDATE on the joined rows)
-- ─────────────────────────────────────────────────
-- SELECT … FOR UPDATE on players + resources + army prevents
-- concurrent mutations (tick run, another promote attempt,
-- attack loot write) from reading or modifying those rows
-- until this transaction commits.
--
-- Server-side re-validation inside the transaction
-- ─────────────────────────────────────────────────
-- The API route validates requirements before calling this RPC
-- (good UX — fast rejection). The RPC re-validates the same
-- conditions *after* acquiring the locks so that any state
-- that changed between the route's read and the lock
-- acquisition is caught deterministically:
--   • player.city still at current value (not already promoted
--     by a concurrent call)
--   • player still not in tribe_members
--   • army.soldiers still >= minimum
--   • resources still >= cost
-- ============================================================

CREATE OR REPLACE FUNCTION city_promote_apply(
  p_player_id    UUID,
  p_next_city    INT,
  p_min_soldiers INT,
  p_cost_gold    INT,
  p_cost_wood    INT,
  p_cost_iron    INT,
  p_cost_food    INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_city      INT;
  v_soldiers  INT;
  v_gold      BIGINT;
  v_wood      BIGINT;
  v_iron      BIGINT;
  v_food      BIGINT;
  v_in_tribe  BOOLEAN;
BEGIN

  -- ── Acquire row-level locks ────────────────────────────────────────────────
  --
  -- Lock players, resources, and army rows for this player in a single
  -- JOIN so Postgres acquires all three locks atomically (no interleave).
  -- Only one player involved — no need for UUID-ordering (no deadlock risk).

  SELECT p.city, r.gold, r.wood, r.iron, r.food, a.soldiers
    INTO v_city, v_gold, v_wood, v_iron, v_food, v_soldiers
    FROM players   p
    JOIN resources r ON r.player_id = p.id
    JOIN army      a ON a.player_id = p.id
    WHERE p.id = p_player_id
    FOR UPDATE;

  -- ── Post-lock re-validation ────────────────────────────────────────────────

  -- Already promoted (concurrent call beat us, or city was already next_city)
  IF v_city >= p_next_city THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_max_city');
  END IF;

  -- Sanity: next_city must be exactly city + 1
  IF v_city + 1 != p_next_city THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_max_city');
  END IF;

  -- Tribe membership check (plain SELECT — tribe_members insert also validates
  -- player state, and we hold the players row lock which prevents any cascade)
  SELECT EXISTS (
    SELECT 1 FROM tribe_members WHERE player_id = p_player_id
  ) INTO v_in_tribe;

  IF v_in_tribe THEN
    RETURN jsonb_build_object('ok', false, 'error', 'in_tribe');
  END IF;

  -- Soldiers requirement
  IF v_soldiers < p_min_soldiers THEN
    RETURN jsonb_build_object(
      'ok',       false,
      'error',    'not_enough_soldiers',
      'required', p_min_soldiers,
      'have',     v_soldiers
    );
  END IF;

  -- Resource requirements (single check — return first deficit only)
  IF v_gold < p_cost_gold OR v_wood < p_cost_wood
     OR v_iron < p_cost_iron OR v_food < p_cost_food
  THEN
    RETURN jsonb_build_object(
      'ok',       false,
      'error',    'not_enough_resources',
      'required', jsonb_build_object(
        'gold', p_cost_gold, 'wood', p_cost_wood,
        'iron', p_cost_iron, 'food', p_cost_food
      ),
      'have',     jsonb_build_object(
        'gold', v_gold, 'wood', v_wood,
        'iron', v_iron, 'food', v_food
      )
    );
  END IF;

  -- ── Apply mutations (within this transaction) ──────────────────────────────

  UPDATE resources
    SET gold       = gold - p_cost_gold,
        wood       = wood - p_cost_wood,
        iron       = iron - p_cost_iron,
        food       = food - p_cost_food,
        updated_at = now()
    WHERE player_id = p_player_id;

  UPDATE players
    SET city = p_next_city
    WHERE id = p_player_id;

  -- ── Return updated snapshot for UI ────────────────────────────────────────

  RETURN jsonb_build_object(
    'ok',   true,
    'city', p_next_city,
    'gold', v_gold - p_cost_gold,
    'wood', v_wood - p_cost_wood,
    'iron', v_iron - p_cost_iron,
    'food', v_food - p_cost_food
  );

END;
$$;

-- Grant execute to service_role (used by createAdminClient() in API routes).
GRANT EXECUTE ON FUNCTION city_promote_apply(
  UUID, INT, INT, INT, INT, INT, INT
) TO postgres, service_role;
