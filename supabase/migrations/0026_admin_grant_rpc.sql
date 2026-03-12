-- ============================================================
-- Domiron — Admin Grant RPCs (Migration 0026)
--
-- Atomic increment functions for the admin grant endpoint.
-- Each function adds a validated positive amount to a specific field
-- in a single UPDATE ... RETURNING, eliminating the read-then-write
-- race condition.
--
-- All functions are SECURITY DEFINER, callable only via service role.
-- ============================================================

-- ── 1. resources table: gold | iron | wood | food ────────────────────────────
--
-- Uses dynamic SQL (EXECUTE + format %I) after allowlist validation so that
-- a single function covers all four resource columns without branching.
-- %I identifier quoting prevents SQL injection even if the check were bypassed.

CREATE OR REPLACE FUNCTION admin_grant_resource(
  p_player_id UUID,
  p_field     TEXT,
  p_amount    BIGINT
) RETURNS BIGINT
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_new BIGINT;
BEGIN
  -- Server-side allowlist: reject any field not in this set.
  IF p_field NOT IN ('gold', 'iron', 'wood', 'food') THEN
    RAISE EXCEPTION 'admin_grant_resource: invalid field "%"', p_field;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'admin_grant_resource: amount must be positive, got %', p_amount;
  END IF;

  EXECUTE format(
    'UPDATE resources SET %I = %I + $1 WHERE player_id = $2 RETURNING %I',
    p_field, p_field, p_field
  ) INTO v_new USING p_amount, p_player_id;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'admin_grant_resource: no resources row for player %', p_player_id;
  END IF;

  RETURN v_new;
END;
$$;

-- ── 2. army table: free_population ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_grant_free_population(
  p_player_id UUID,
  p_amount    INT
) RETURNS INT
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_new INT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'admin_grant_free_population: amount must be positive, got %', p_amount;
  END IF;

  UPDATE army
     SET free_population = free_population + p_amount
   WHERE player_id = p_player_id
  RETURNING free_population INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'admin_grant_free_population: no army row for player %', p_player_id;
  END IF;

  RETURN v_new;
END;
$$;

-- ── 3. hero table: mana ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_grant_mana(
  p_player_id UUID,
  p_amount    INT
) RETURNS INT
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_new INT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'admin_grant_mana: amount must be positive, got %', p_amount;
  END IF;

  UPDATE hero
     SET mana = mana + p_amount
   WHERE player_id = p_player_id
  RETURNING mana INTO v_new;

  IF v_new IS NULL THEN
    RAISE EXCEPTION 'admin_grant_mana: no hero row for player %', p_player_id;
  END IF;

  RETURN v_new;
END;
$$;
