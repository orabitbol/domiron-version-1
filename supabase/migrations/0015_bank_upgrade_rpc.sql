-- ============================================================
-- Domiron v5 — 0015_bank_upgrade_rpc.sql
-- Makes the bank interest upgrade atomic via a single Postgres
-- function: bank_interest_upgrade_apply().
-- ============================================================
--
-- Problem it solves
-- ─────────────────
-- The upgrade route previously ran two writes in Promise.all():
--   1. resources.gold -= upgradeCost
--   2. bank.interest_level = nextLevel
-- A crash between these leaves partial state (gold deducted,
-- level unchanged — or vice-versa on reorder).
--
-- Atomicity guarantee
-- ───────────────────
-- bank_interest_upgrade_apply() wraps both writes in one
-- Postgres transaction. Either both commit or neither does.
--
-- Row locking
-- ───────────
-- SELECT … FOR UPDATE on bank + resources in a single JOIN.
-- Only one player's rows are mutated, so no deadlock risk.
--
-- Post-lock re-validation (TOCTTOU-safe)
-- ───────────────────────────────────────
-- The route does a fast pre-check before calling the RPC.
-- The RPC re-validates the same conditions after acquiring
-- the lock, catching any concurrent state change:
--   • bank.interest_level is still below MAX (passed as p_max_level)
--   • bank.interest_level + 1 == p_next_level (stale read guard)
--   • resources.gold >= p_cost_gold
-- ============================================================

CREATE OR REPLACE FUNCTION bank_interest_upgrade_apply(
  p_player_id  UUID,
  p_cost_gold  INT,
  p_next_level INT,
  p_max_level  INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_interest_level INT;
  v_gold           INT;
BEGIN

  -- ── Acquire row-level locks ────────────────────────────────────────────────
  --
  -- Lock bank + resources in a single JOIN.

  SELECT b.interest_level, r.gold
    INTO v_interest_level, v_gold
    FROM bank      b
    JOIN resources r ON r.player_id = b.player_id
    WHERE b.player_id = p_player_id
    FOR UPDATE;

  -- ── Post-lock re-validation ────────────────────────────────────────────────

  IF v_interest_level >= p_max_level THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_max_level');
  END IF;

  IF v_interest_level + 1 <> p_next_level THEN
    -- Concurrent upgrade already ran — caller's view of current level is stale.
    RETURN jsonb_build_object('ok', false, 'error', 'stale_level');
  END IF;

  IF v_gold < p_cost_gold THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_gold');
  END IF;

  -- ── Apply mutations (all within this transaction) ──────────────────────────

  UPDATE resources
    SET gold       = gold - p_cost_gold,
        updated_at = now()
    WHERE player_id = p_player_id;

  UPDATE bank
    SET interest_level = p_next_level,
        updated_at     = now()
    WHERE player_id = p_player_id;

  -- ── Return updated snapshot ────────────────────────────────────────────────

  RETURN jsonb_build_object(
    'ok',        true,
    'new_level', p_next_level,
    'new_gold',  v_gold - p_cost_gold
  );

END;
$$;

-- Grant execute to service_role (used by createAdminClient() in API routes).
GRANT EXECUTE ON FUNCTION bank_interest_upgrade_apply(
  UUID, INT, INT, INT
) TO postgres, service_role;
