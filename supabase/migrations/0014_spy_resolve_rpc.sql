-- ============================================================
-- Domiron v5 — 0014_spy_resolve_rpc.sql
-- Makes all spy mission DB writes atomic via a single Postgres
-- function: spy_resolve_apply().
-- ============================================================
--
-- Problem it solves
-- ─────────────────
-- The spy route previously ran three writes in Promise.all():
--   1. players.turns -= turnCost
--   2. army.spies -= spiesCaught  (conditional)
--   3. spy_history INSERT
-- A timeout or crash between any of these left partial state
-- (e.g. turns deducted, spy log never written; or spies lost
-- but mission result not recorded).
--
-- Atomicity guarantee
-- ───────────────────
-- spy_resolve_apply() wraps all three writes in one Postgres
-- transaction. Either all three commit or none do.
--
-- Row locking
-- ───────────
-- SELECT … FOR UPDATE on the attacker's players + army rows.
-- Only the attacker's rows are mutated (defender is read-only
-- in the spy flow), so a single-player join lock is sufficient
-- and there is no deadlock risk.
--
-- Post-lock re-validation (TOCTTOU-safe)
-- ───────────────────────────────────────
-- The route does a fast pre-check before calling the RPC.
-- The RPC re-validates the same conditions after acquiring the
-- locks, so any state that changed between the route's read
-- and the lock acquisition is caught deterministically:
--   • turns ≥ p_turn_cost (a concurrent action may have spent turns)
--   • spies ≥ p_spies_sent (a concurrent untrain may have removed spies)
-- ============================================================

CREATE OR REPLACE FUNCTION spy_resolve_apply(
  p_spy_owner_id  UUID,
  p_target_id     UUID,
  p_spies_sent    INT,
  p_turn_cost     INT,
  p_spies_caught  INT,
  p_success       BOOLEAN,
  p_data_revealed JSONB,    -- NULL on failure; full intel object on success
  p_season_id     INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_turns     INT;
  v_spies     INT;
  v_new_spies INT;
BEGIN

  -- ── Acquire row-level locks ────────────────────────────────────────────────
  --
  -- Lock attacker's players and army rows in a single JOIN.
  -- Defender rows are NOT locked — they are read-only in the spy flow.

  SELECT p.turns, a.spies
    INTO v_turns, v_spies
    FROM players p
    JOIN army    a ON a.player_id = p.id
    WHERE p.id = p_spy_owner_id
    FOR UPDATE;

  -- ── Post-lock re-validation ────────────────────────────────────────────────

  IF v_turns < p_turn_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_turns');
  END IF;

  IF v_spies < p_spies_sent THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_spies');
  END IF;

  -- ── Apply mutations (all within this transaction) ──────────────────────────

  -- Deduct turns
  UPDATE players
    SET turns = turns - p_turn_cost
    WHERE id = p_spy_owner_id;

  -- Deduct caught spies (only when any were caught)
  v_new_spies := GREATEST(0, v_spies - p_spies_caught);
  IF p_spies_caught > 0 THEN
    UPDATE army
      SET spies      = v_new_spies,
          updated_at = now()
      WHERE player_id = p_spy_owner_id;
  END IF;

  -- Record the mission (always, regardless of success/failure)
  INSERT INTO spy_history (
    spy_owner_id,  target_id,      success,
    spies_caught,  data_revealed,  season_id
  ) VALUES (
    p_spy_owner_id, p_target_id,  p_success,
    p_spies_caught, p_data_revealed, p_season_id
  );

  -- ── Return updated snapshot ────────────────────────────────────────────────

  RETURN jsonb_build_object(
    'ok',        true,
    'new_turns', v_turns - p_turn_cost,
    'new_spies', v_new_spies
  );

END;
$$;

-- Grant execute to service_role (used by createAdminClient() in API routes).
GRANT EXECUTE ON FUNCTION spy_resolve_apply(
  UUID, UUID, INT, INT, INT, BOOLEAN, JSONB, INT
) TO postgres, service_role;
