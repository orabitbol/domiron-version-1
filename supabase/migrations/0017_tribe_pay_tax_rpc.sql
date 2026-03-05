-- ============================================================
-- Domiron v5 — 0017_tribe_pay_tax_rpc.sql
-- Makes tribe tax payment atomic via a single Postgres
-- function: tribe_pay_tax_apply().
-- ============================================================
--
-- Problem it solves
-- ─────────────────
-- The pay-tax route previously ran three writes in Promise.all():
--   1. resources.gold -= tax_amount        (player loses gold)
--   2. tribes.mana   += tax_amount        (tribe gains mana)
--   3. tribe_members.tax_paid_today = true  (guard against re-pay)
-- This is a cross-entity transfer (player → tribe). A partial
-- failure lets the player lose gold with the tribe gaining nothing,
-- OR lets the tribe gain mana without the player paying.
-- The tax_paid_today guard was also read before any lock, so two
-- concurrent requests could both see tax_paid_today=false and both
-- commit — charging the player twice and doubling the tribe mana.
--
-- Atomicity guarantee
-- ───────────────────
-- tribe_pay_tax_apply() wraps all three writes in one implicit
-- Postgres transaction. Either all three commit or none do.
--
-- Row locking & lock order
-- ────────────────────────
-- Locks are acquired in a consistent order to prevent deadlock:
--   1. tribe_members (by player_id)  — one row per player
--   2. tribes        (by tribe_id)   — one row per tribe
--   3. resources     (by player_id)  — one row per player
-- Two players paying to the same tribe simultaneously will each
-- hold their own tribe_members lock, then queue on the tribes row.
-- This is wait-safe, not a deadlock.
--
-- Post-lock re-validation (TOCTTOU-safe)
-- ───────────────────────────────────────
-- The route does a fast pre-check before calling the RPC.
-- The RPC re-validates the same conditions after acquiring locks,
-- catching any concurrent state change:
--   • player is still in a tribe (membership not removed)
--   • tax_exempt is still false
--   • tax_paid_today is still false (catches double-submit)
--   • tribe still exists and tax_amount > 0
--   • resources.gold >= tax_amount (catches concurrent spend)
-- ============================================================

CREATE OR REPLACE FUNCTION tribe_pay_tax_apply(
  p_player_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tribe_id        UUID;
  v_tax_paid_today  BOOLEAN;
  v_tax_exempt      BOOLEAN;
  v_tax_amount      BIGINT;
  v_tribe_mana      INT;
  v_gold            BIGINT;
BEGIN

  -- ── 1. Lock tribe_members row ─────────────────────────────────────────────
  --
  -- This must come first so the derived tribe_id is stable for the
  -- subsequent tribe lock (consistent ordering prevents deadlock).

  SELECT tribe_id, tax_paid_today, tax_exempt
    INTO v_tribe_id, v_tax_paid_today, v_tax_exempt
    FROM tribe_members
    WHERE player_id = p_player_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_tribe');
  END IF;

  -- Post-lock re-validation: membership flags
  IF v_tax_exempt THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tax_exempt');
  END IF;

  IF v_tax_paid_today THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_paid');
  END IF;

  -- ── 2. Lock tribes row ────────────────────────────────────────────────────

  SELECT mana, tax_amount
    INTO v_tribe_mana, v_tax_amount
    FROM tribes
    WHERE id = v_tribe_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tribe_not_found');
  END IF;

  IF v_tax_amount = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_tax_set');
  END IF;

  -- ── 3. Lock resources row ─────────────────────────────────────────────────

  SELECT gold
    INTO v_gold
    FROM resources
    WHERE player_id = p_player_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'resources_not_found');
  END IF;

  -- Post-lock re-validation: sufficient gold
  IF v_gold < v_tax_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_gold');
  END IF;

  -- ── Apply mutations (all within this transaction) ──────────────────────────

  UPDATE resources
    SET gold       = gold - v_tax_amount,
        updated_at = now()
    WHERE player_id = p_player_id;

  -- Gold converts to tribe mana at 1:1 (game design rule: gold → tribe mana)
  UPDATE tribes
    SET mana = mana + v_tax_amount
    WHERE id = v_tribe_id;

  UPDATE tribe_members
    SET tax_paid_today = true
    WHERE player_id = p_player_id
      AND tribe_id  = v_tribe_id;

  -- ── Return updated snapshot ────────────────────────────────────────────────

  RETURN jsonb_build_object(
    'ok',        true,
    'gold_paid', v_tax_amount,
    'new_gold',  v_gold - v_tax_amount,
    'new_mana',  v_tribe_mana + v_tax_amount
  );

END;
$$;

-- Grant execute to service_role (used by createAdminClient() in API routes).
GRANT EXECUTE ON FUNCTION tribe_pay_tax_apply(UUID) TO postgres, service_role;
