-- ============================================================
-- Domiron — Lemon Squeezy Payment Integration (Migration 0030)
--
-- 1. Extends the payments table with mana_amount + turns_amount
--    so fulfilled rewards are permanently recorded on the row.
-- 2. Creates the fulfill_lemon_purchase() RPC which atomically:
--      a. Checks for duplicate (idempotency)
--      b. Locks player + hero rows to prevent concurrent double-grants
--      c. Inserts the payment record (unique constraint is the last guard)
--      d. Grants mana to hero
--      e. Grants purchased turns to player via the purchased-turns path
--         (capped at purchasedTurnsMaxCap = 5000, NOT the 200-turn regen cap)
-- ============================================================

-- ── 1. Extend payments table ──────────────────────────────────────────────────

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS mana_amount  INT,
  ADD COLUMN IF NOT EXISTS turns_amount INT;

-- ── 2. Atomic fulfill RPC ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fulfill_lemon_purchase(
  p_player_id    UUID,
  p_order_id     TEXT,          -- Lemon order ID → stored as provider_ref
  p_pack_key     TEXT,          -- '1900' | '4100' | '8250' | '20000'
  p_mana_amount  INT,
  p_turns_amount INT,
  p_amount_cents BIGINT DEFAULT 0,
  p_currency     TEXT   DEFAULT 'USD',
  p_payload      JSONB  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_mana  INT;
  v_new_mana      INT;
  v_current_turns INT;
  v_new_turns     INT;
  -- purchasedTurnsMaxCap from BALANCE.tick — intentionally above the 200 regen
  -- cap so purchased turns are never silently discarded.
  v_purchased_cap INT := 5000;
BEGIN

  -- ── Guard: basic input sanity ──────────────────────────────────────────────
  IF p_mana_amount  <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_mana_amount');  END IF;
  IF p_turns_amount <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_turns_amount'); END IF;

  -- ── Fast idempotency check (non-locking) ──────────────────────────────────
  -- If a completed record already exists for this Lemon order we skip everything.
  IF EXISTS (
    SELECT 1 FROM payments
    WHERE provider     = 'lemon'
      AND provider_ref = p_order_id
      AND status       = 'completed'
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  -- ── Lock player row (prevents concurrent double-grants) ───────────────────
  SELECT turns INTO v_current_turns
  FROM players
  WHERE id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_not_found');
  END IF;

  -- ── Lock hero row ──────────────────────────────────────────────────────────
  SELECT mana INTO v_current_mana
  FROM hero
  WHERE player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'hero_not_found');
  END IF;

  -- ── Insert payment record ─────────────────────────────────────────────────
  -- The UNIQUE INDEX on (provider, provider_ref) is the hard idempotency guard.
  -- A concurrent transaction that passed the fast check above will fail here.
  BEGIN
    INSERT INTO payments (
      player_id,
      provider,
      provider_ref,
      product_key,
      mana_amount,
      turns_amount,
      amount_cents,
      currency,
      status,
      metadata,
      completed_at
    ) VALUES (
      p_player_id,
      'lemon',
      p_order_id,
      p_pack_key,
      p_mana_amount,
      p_turns_amount,
      GREATEST(p_amount_cents, 1),   -- payments.amount_cents CHECK (> 0)
      p_currency,
      'completed',
      p_payload,
      now()
    );
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent request already inserted — treat as already processed
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END;

  -- ── Grant mana ────────────────────────────────────────────────────────────
  -- No hard mana ceiling; hero accumulates mana freely for spending on spells.
  v_new_mana := v_current_mana + p_mana_amount;

  UPDATE hero
  SET mana       = v_new_mana,
      updated_at = now()
  WHERE player_id = p_player_id;

  -- ── Grant purchased turns (purchased-turns path) ──────────────────────────
  -- This is intentionally separate from the tick regen path (capped at 200).
  -- Purchased turns are allowed up to purchasedTurnsMaxCap (5000) so that
  -- buying multiple packs works correctly without silently discarding turns.
  v_new_turns := LEAST(v_current_turns + p_turns_amount, v_purchased_cap);

  UPDATE players
  SET turns = v_new_turns
  WHERE id = p_player_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'new_mana',   v_new_mana,
    'new_turns',  v_new_turns
  );

END;
$$;

GRANT EXECUTE ON FUNCTION fulfill_lemon_purchase(UUID, TEXT, TEXT, INT, INT, BIGINT, TEXT, JSONB)
  TO postgres, service_role;
