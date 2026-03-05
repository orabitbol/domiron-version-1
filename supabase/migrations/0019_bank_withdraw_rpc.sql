-- ============================================================
-- Domiron v5 — 0019_bank_withdraw_rpc.sql
-- Makes bank withdrawals atomic via a single Postgres function:
-- bank_withdraw_apply().
-- ============================================================
--
-- Problem it solves
-- ─────────────────
-- The withdraw route previously ran two writes in Promise.all():
--   1. resources.gold  += amount
--   2. bank.balance    -= amount
-- A crash between these creates gold from nothing if resources.gold
-- is credited before bank.balance is debited — or destroys gold if
-- the debit succeeds but the credit does not.
-- The balance check was also read before any lock, so two concurrent
-- withdraw requests for the same amount could both see a sufficient
-- balance and both commit — creating gold from nothing.
--
-- Atomicity guarantee
-- ───────────────────
-- bank_withdraw_apply() wraps both writes in one implicit Postgres
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
-- The RPC re-validates the balance after acquiring the lock,
-- catching any concurrent withdrawal that changed the balance
-- between the route's read and the lock acquisition:
--   • bank.balance >= p_amount
--
-- Parameters
-- ──────────
-- p_player_id — player performing the withdrawal
-- p_amount    — gold amount to withdraw (validated > 0 by route Zod)
-- ============================================================

CREATE OR REPLACE FUNCTION bank_withdraw_apply(
  p_player_id UUID,
  p_amount    BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance BIGINT;
  v_gold    BIGINT;
BEGIN

  -- ── Acquire row-level locks ────────────────────────────────────────────────
  --
  -- Lock bank + resources in a single JOIN (same pattern as
  -- bank_interest_upgrade_apply in 0015_bank_upgrade_rpc.sql).

  SELECT b.balance, r.gold
    INTO v_balance, v_gold
    FROM bank      b
    JOIN resources r ON r.player_id = b.player_id
    WHERE b.player_id = p_player_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_not_found');
  END IF;

  -- ── Post-lock re-validation ────────────────────────────────────────────────

  IF p_amount > v_balance THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance');
  END IF;

  -- ── Apply mutations (all within this transaction) ──────────────────────────

  UPDATE bank
    SET balance    = balance - p_amount,
        updated_at = now()
    WHERE player_id = p_player_id;

  UPDATE resources
    SET gold       = gold + p_amount,
        updated_at = now()
    WHERE player_id = p_player_id;

  -- ── Return updated snapshot ────────────────────────────────────────────────

  RETURN jsonb_build_object(
    'ok',          true,
    'new_gold',    v_gold    + p_amount,
    'new_balance', v_balance - p_amount
  );

END;
$$;

-- Grant execute to service_role (used by createAdminClient() in API routes).
GRANT EXECUTE ON FUNCTION bank_withdraw_apply(UUID, BIGINT) TO postgres, service_role;
