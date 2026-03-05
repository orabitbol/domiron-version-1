-- ============================================================
-- Domiron v5 — 0018_bank_deposit_rpc.sql
-- Makes bank deposits atomic via a single Postgres function:
-- bank_deposit_apply().
-- ============================================================
--
-- Problem it solves
-- ─────────────────
-- The deposit route previously ran two writes in Promise.all():
--   1. resources.gold -= amount
--   2. bank.balance   += amount  (+ deposits_today++, last_deposit_reset)
-- A crash between these leaves partial state (gold destroyed, bank
-- balance unchanged — or bank inflated, gold still present).
-- The deposits_today counter was also read before any lock, so two
-- concurrent deposit requests at deposits_today=4 (one below the
-- per-day limit of 5) could both pass and both commit — writing a
-- 6th deposit and exceeding the daily limit.
-- The day-reset branch (last_deposit_reset !== today) was similarly
-- unguarded, allowing two concurrent requests to both trigger a
-- day-reset and each count as deposits_today=1 instead of 1 + 2.
--
-- Atomicity guarantee
-- ───────────────────
-- bank_deposit_apply() wraps both writes in one implicit Postgres
-- transaction. Either both commit or neither does.
--
-- Row locking
-- ───────────
-- SELECT … FOR UPDATE on bank + resources in a single JOIN.
-- Only one player's rows are mutated, so no deadlock risk.
--
-- Post-lock re-validation (TOCTTOU-safe)
-- ───────────────────────────────────────
-- The route does a fast pre-check before calling the RPC.
-- The RPC re-validates the same conditions after acquiring locks:
--   • effective deposits_today < p_deposits_per_day (day-reset aware)
--   • p_amount ≤ floor(gold × p_max_deposit_fraction)
--   • p_amount ≤ gold
--
-- Parameters
-- ──────────
-- p_player_id            — player performing the deposit
-- p_amount               — gold amount to deposit (validated > 0 by route Zod)
-- p_deposits_per_day     — BALANCE.bank.depositsPerDay (passed by route; SSOT)
-- p_max_deposit_fraction — BALANCE.bank.maxDepositPercent (passed by route; SSOT)
-- ============================================================

CREATE OR REPLACE FUNCTION bank_deposit_apply(
  p_player_id            UUID,
  p_amount               BIGINT,
  p_deposits_per_day     INT,
  p_max_deposit_fraction NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance            BIGINT;
  v_gold               BIGINT;
  v_deposits_today     INT;
  v_last_deposit_reset DATE;
  v_effective_deposits INT;
BEGIN

  -- ── Acquire row-level locks ────────────────────────────────────────────────
  --
  -- Lock bank + resources in a single JOIN (same pattern as
  -- bank_interest_upgrade_apply in 0015_bank_upgrade_rpc.sql).

  SELECT b.balance, b.deposits_today, b.last_deposit_reset, r.gold
    INTO v_balance, v_deposits_today, v_last_deposit_reset, v_gold
    FROM bank      b
    JOIN resources r ON r.player_id = b.player_id
    WHERE b.player_id = p_player_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_not_found');
  END IF;

  -- ── Compute effective deposits_today (day-reset aware) ─────────────────────
  --
  -- If last_deposit_reset is not today, the counter effectively resets to 0.
  -- This must happen inside the lock so two concurrent requests cannot both
  -- read an unconsumed reset and independently set deposits_today = 1.

  v_effective_deposits := CASE
    WHEN v_last_deposit_reset = CURRENT_DATE THEN v_deposits_today
    ELSE 0
  END;

  -- ── Post-lock re-validation ────────────────────────────────────────────────

  IF v_effective_deposits >= p_deposits_per_day THEN
    RETURN jsonb_build_object('ok', false, 'error', 'deposits_exhausted');
  END IF;

  -- max deposit fraction check (e.g. maxDepositPercent = 1.0 → 100% of gold)
  IF p_amount > floor(v_gold * p_max_deposit_fraction) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'exceeds_max_deposit_fraction');
  END IF;

  IF p_amount > v_gold THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_gold');
  END IF;

  -- ── Apply mutations (all within this transaction) ──────────────────────────

  UPDATE resources
    SET gold       = gold - p_amount,
        updated_at = now()
    WHERE player_id = p_player_id;

  UPDATE bank
    SET balance            = balance + p_amount,
        deposits_today     = v_effective_deposits + 1,
        last_deposit_reset = CURRENT_DATE,
        updated_at         = now()
    WHERE player_id = p_player_id;

  -- ── Return updated snapshot ────────────────────────────────────────────────

  RETURN jsonb_build_object(
    'ok',           true,
    'new_gold',     v_gold    - p_amount,
    'new_balance',  v_balance + p_amount,
    'deposits_today', v_effective_deposits + 1
  );

END;
$$;

-- Grant execute to service_role (used by createAdminClient() in API routes).
GRANT EXECUTE ON FUNCTION bank_deposit_apply(UUID, BIGINT, INT, NUMERIC) TO postgres, service_role;
