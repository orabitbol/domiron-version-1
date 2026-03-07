-- ============================================================
-- Domiron v5 — 0023_shop_rpc.sql
--
-- Atomic shop buy/sell RPCs.
-- Also adds last_shop_at column for global shop throttle.
-- ============================================================
--
-- Atomicity guarantee
-- ───────────────────
-- Each RPC wraps all mutations in one Postgres transaction.
-- Either all committed or none.
--
-- NOT FOUND guards (correctness critical)
-- ────────────────────────────────────────
-- PL/pgSQL SELECT INTO without STRICT leaves variables NULL
-- when no row is found; FOUND is false but execution continues.
-- NULL comparisons in IF conditions evaluate as false — all
-- guards are silently skipped, UPDATEs affect 0 rows, and
-- the function returns { ok: true } (false success / silent no-op).
-- Fix: explicit IF NOT FOUND THEN checks after every locked SELECT.
--
-- Input guards (defense in depth)
-- ────────────────────────────────
-- Numeric inputs are validated inside the RPC even though the
-- route already validates them.  Direct RPC calls (e.g. from
-- Supabase dashboard or tests) must not be able to pass invalid
-- values and reach the mutation path.
--
-- Row locking (TOCTTOU-safe)
-- ──────────────────────────
-- 1. SELECT resources JOIN players FOR UPDATE
-- 2. IF NOT FOUND → player_state_not_found
-- 3. SELECT weapons FOR UPDATE
-- 4. IF NOT FOUND → player_state_not_found
-- All validations run after acquiring locks.
--
-- Global shop throttle (last_shop_at)
-- ────────────────────────────────────
-- last_shop_at is a global shop-action rate-limiter stamped
-- atomically after every successful action.  Throttles ALL
-- shop actions (buy + sell, any item) within the cooldown
-- window.  Intentional — consistent with last_attack_at /
-- last_spy_at in this codebase.  Not per-request idempotency.
--
-- SET search_path = public (SECURITY DEFINER hardening)
-- ───────────────────────────────────────────────────────
-- SECURITY DEFINER functions run with the definer's privileges.
-- Without a fixed search_path a malicious caller could shadow
-- system functions by creating objects in a schema that appears
-- earlier in the default search path.  Pinning to 'public'
-- eliminates that attack surface.
--
-- SQL injection safety
-- ────────────────────
-- p_weapon is validated against a hard-coded whitelist before
-- any dynamic SQL.  Dynamic UPDATE uses format('%I')
-- (quote_ident()) as a second layer of defense.
-- ============================================================

-- ── 1. Add global shop throttle column ───────────────────────────────────
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS last_shop_at TIMESTAMPTZ DEFAULT NULL;

-- ── 2. shop_buy_apply() ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION shop_buy_apply(
  p_player_id  UUID,
  p_weapon     TEXT,
  p_amount     INT,
  p_is_multi   BOOLEAN,    -- true = attack (stackable); false = defense/spy/scout (one per player)
  p_total_gold BIGINT,
  p_total_iron BIGINT,
  p_total_wood BIGINT,
  p_total_food BIGINT,
  p_cooldown_ms INT DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gold          BIGINT;
  v_iron          BIGINT;
  v_wood          BIGINT;
  v_food          BIGINT;
  v_last_shop_at  TIMESTAMPTZ;
  v_current_owned INT;
BEGIN

  -- ── Input guards (defense in depth) ───────────────────────────────────────
  --
  -- The route already validates these, but direct RPC calls must also be safe.

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF p_total_gold < 0 OR p_total_iron < 0 OR p_total_wood < 0 OR p_total_food < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_cost');
  END IF;

  -- ── Whitelist validation (SQL-side defense-in-depth) ──────────────────────
  --
  -- The route already validated the weapon name against BALANCE keys.
  -- This second check prevents any direct RPC call with an injected column.

  IF p_weapon NOT IN (
    -- attack
    'slingshot', 'boomerang', 'pirate_knife', 'axe',
    'master_knife', 'knight_axe', 'iron_ball',
    -- defense
    'wood_shield', 'iron_shield', 'leather_armor',
    'chain_armor', 'plate_armor', 'mithril_armor', 'gods_armor',
    -- spy
    'shadow_cloak', 'dark_mask', 'elven_gear',
    -- scout
    'scout_boots', 'scout_cloak', 'elven_boots'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_weapon');
  END IF;

  -- ── Acquire locks: resources + players (single JOIN) ──────────────────────
  --
  -- Locking both in one statement prevents interleaving with other
  -- transactions that might lock them in different orders.

  SELECT r.gold, r.iron, r.wood, r.food, p.last_shop_at
    INTO v_gold, v_iron, v_wood, v_food, v_last_shop_at
    FROM resources r
    JOIN players   p ON p.id = r.player_id
    WHERE r.player_id = p_player_id
    FOR UPDATE;

  -- ── NOT FOUND guard ────────────────────────────────────────────────────────
  --
  -- Without this check, all variables remain NULL when no row is found.
  -- NULL comparisons in IF conditions evaluate as false in PL/pgSQL —
  -- all subsequent guards are silently skipped, UPDATEs affect 0 rows,
  -- and the function would return { ok: true } (false success).

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_state_not_found');
  END IF;

  -- ── Global shop throttle (post-lock re-check) ─────────────────────────────

  IF v_last_shop_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (now() - v_last_shop_at)) * 1000 < p_cooldown_ms
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_requests');
  END IF;

  -- ── Acquire lock: weapons — read current quantity via to_jsonb ────────────

  SELECT COALESCE((to_jsonb(w) ->> p_weapon)::INT, 0)
    INTO v_current_owned
    FROM weapons w
    WHERE w.player_id = p_player_id
    FOR UPDATE;

  -- ── NOT FOUND guard for weapons row ───────────────────────────────────────

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_state_not_found');
  END IF;

  -- ── Ownership guard (non-stackable items: one per player) ─────────────────

  IF NOT p_is_multi AND v_current_owned > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_owned');
  END IF;

  -- ── Affordability checks (post-lock, TOCTTOU-safe) ────────────────────────

  IF v_gold < p_total_gold THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_gold');
  END IF;
  IF v_iron < p_total_iron THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_iron');
  END IF;
  IF v_wood < p_total_wood THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_wood');
  END IF;
  IF v_food < p_total_food THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_food');
  END IF;

  -- ── Apply mutations (all in one transaction) ───────────────────────────────

  UPDATE resources
    SET gold       = gold - p_total_gold,
        iron       = iron - p_total_iron,
        wood       = wood - p_total_wood,
        food       = food - p_total_food,
        updated_at = now()
    WHERE player_id = p_player_id;

  -- Dynamic column update — p_weapon is already whitelist-validated above.
  -- format('%I') additionally applies quote_ident() as defense-in-depth.
  EXECUTE format(
    'UPDATE weapons SET %I = %I + $1, updated_at = now() WHERE player_id = $2',
    p_weapon, p_weapon
  ) USING p_amount, p_player_id;

  UPDATE players
    SET last_shop_at = now()
    WHERE id = p_player_id;

  -- Note: recalculatePower() is called by the route AFTER this transaction
  -- commits.  power_attack/defense/spy/scout are denormalized caches —
  -- their brief staleness is acceptable and self-correcting.

  RETURN jsonb_build_object('ok', true);

END;
$$;

-- ── 3. shop_sell_apply() ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION shop_sell_apply(
  p_player_id   UUID,
  p_weapon      TEXT,
  p_amount      INT,
  p_refund_gold BIGINT,
  p_refund_iron BIGINT,
  p_refund_wood BIGINT,
  p_refund_food BIGINT,
  p_cooldown_ms INT DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gold          BIGINT;
  v_iron          BIGINT;
  v_wood          BIGINT;
  v_food          BIGINT;
  v_last_shop_at  TIMESTAMPTZ;
  v_current_owned INT;
BEGIN

  -- ── Input guards (defense in depth) ───────────────────────────────────────

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF p_refund_gold < 0 OR p_refund_iron < 0 OR p_refund_wood < 0 OR p_refund_food < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_refund');
  END IF;

  -- ── Whitelist validation ───────────────────────────────────────────────────

  IF p_weapon NOT IN (
    'slingshot', 'boomerang', 'pirate_knife', 'axe',
    'master_knife', 'knight_axe', 'iron_ball',
    'wood_shield', 'iron_shield', 'leather_armor',
    'chain_armor', 'plate_armor', 'mithril_armor', 'gods_armor',
    'shadow_cloak', 'dark_mask', 'elven_gear',
    'scout_boots', 'scout_cloak', 'elven_boots'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_weapon');
  END IF;

  -- ── Acquire locks: resources + players ────────────────────────────────────

  SELECT r.gold, r.iron, r.wood, r.food, p.last_shop_at
    INTO v_gold, v_iron, v_wood, v_food, v_last_shop_at
    FROM resources r
    JOIN players   p ON p.id = r.player_id
    WHERE r.player_id = p_player_id
    FOR UPDATE;

  -- ── NOT FOUND guard ────────────────────────────────────────────────────────

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_state_not_found');
  END IF;

  -- ── Global shop throttle (post-lock re-check) ─────────────────────────────

  IF v_last_shop_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (now() - v_last_shop_at)) * 1000 < p_cooldown_ms
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_requests');
  END IF;

  -- ── Acquire lock: weapons — read current quantity ─────────────────────────

  SELECT COALESCE((to_jsonb(w) ->> p_weapon)::INT, 0)
    INTO v_current_owned
    FROM weapons w
    WHERE w.player_id = p_player_id
    FOR UPDATE;

  -- ── NOT FOUND guard for weapons row ───────────────────────────────────────

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_state_not_found');
  END IF;

  -- ── Ownership check (post-lock) ────────────────────────────────────────────

  IF v_current_owned < p_amount THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'not_enough_owned',
      'owned', v_current_owned
    );
  END IF;

  -- ── Apply mutations ────────────────────────────────────────────────────────

  UPDATE resources
    SET gold       = gold + p_refund_gold,
        iron       = iron + p_refund_iron,
        wood       = wood + p_refund_wood,
        food       = food + p_refund_food,
        updated_at = now()
    WHERE player_id = p_player_id;

  EXECUTE format(
    'UPDATE weapons SET %I = %I - $1, updated_at = now() WHERE player_id = $2',
    p_weapon, p_weapon
  ) USING p_amount, p_player_id;

  UPDATE players
    SET last_shop_at = now()
    WHERE id = p_player_id;

  -- Note: recalculatePower() is called by the route AFTER this transaction
  -- commits.  power columns are denormalized caches — brief staleness is
  -- acceptable and self-correcting.

  RETURN jsonb_build_object('ok', true);

END;
$$;

-- ── 4. Grant execute to service_role ──────────────────────────────────────

GRANT EXECUTE ON FUNCTION shop_buy_apply(
  UUID, TEXT, INT, BOOLEAN, BIGINT, BIGINT, BIGINT, BIGINT, INT
) TO postgres, service_role;

GRANT EXECUTE ON FUNCTION shop_sell_apply(
  UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, INT
) TO postgres, service_role;
