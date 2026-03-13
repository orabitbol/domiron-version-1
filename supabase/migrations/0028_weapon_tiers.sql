-- ============================================================
-- Domiron v5 — 0028_weapon_tiers.sql
--
-- Adds new weapon tier columns to the weapons table:
--   Attack tiers 8–10: battle_axe, war_hammer, dragon_sword
--   Defense tiers 8–10: shadow_armor, void_armor, celestial_armor
--   Spy tiers 4–7: mystic_cloak, shadow_veil, phantom_shroud, arcane_veil
--   Scout tiers 4–7: swift_boots, shadow_steps, phantom_stride, arcane_lens
--
-- Also recreates shop_buy_apply() and shop_sell_apply() with the
-- expanded whitelist to allow buying/selling the new items.
-- ============================================================

-- ── 1. Add new weapon columns to weapons table ────────────────────────────

-- Attack tier 8–10
ALTER TABLE weapons
  ADD COLUMN IF NOT EXISTS battle_axe    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS war_hammer    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dragon_sword  INT NOT NULL DEFAULT 0;

-- Defense tier 8–10
ALTER TABLE weapons
  ADD COLUMN IF NOT EXISTS shadow_armor    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS void_armor      INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS celestial_armor INT NOT NULL DEFAULT 0;

-- Spy tier 4–7
ALTER TABLE weapons
  ADD COLUMN IF NOT EXISTS mystic_cloak   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shadow_veil    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phantom_shroud INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arcane_veil    INT NOT NULL DEFAULT 0;

-- Scout tier 4–7
ALTER TABLE weapons
  ADD COLUMN IF NOT EXISTS swift_boots    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shadow_steps   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phantom_stride INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arcane_lens    INT NOT NULL DEFAULT 0;

-- ── 2. Recreate shop_buy_apply() with expanded whitelist ──────────────────

CREATE OR REPLACE FUNCTION shop_buy_apply(
  p_player_id  UUID,
  p_weapon     TEXT,
  p_amount     INT,
  p_is_multi   BOOLEAN,
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

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF p_total_gold < 0 OR p_total_iron < 0 OR p_total_wood < 0 OR p_total_food < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_cost');
  END IF;

  IF p_weapon NOT IN (
    -- attack (tiers 1–10)
    'slingshot', 'boomerang', 'pirate_knife', 'axe',
    'master_knife', 'knight_axe', 'iron_ball',
    'battle_axe', 'war_hammer', 'dragon_sword',
    -- defense (tiers 1–10)
    'wood_shield', 'iron_shield', 'leather_armor',
    'chain_armor', 'plate_armor', 'mithril_armor', 'gods_armor',
    'shadow_armor', 'void_armor', 'celestial_armor',
    -- spy (tiers 1–7)
    'shadow_cloak', 'dark_mask', 'elven_gear',
    'mystic_cloak', 'shadow_veil', 'phantom_shroud', 'arcane_veil',
    -- scout (tiers 1–7)
    'scout_boots', 'scout_cloak', 'elven_boots',
    'swift_boots', 'shadow_steps', 'phantom_stride', 'arcane_lens'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_weapon');
  END IF;

  SELECT r.gold, r.iron, r.wood, r.food, p.last_shop_at
    INTO v_gold, v_iron, v_wood, v_food, v_last_shop_at
    FROM resources r
    JOIN players   p ON p.id = r.player_id
    WHERE r.player_id = p_player_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_state_not_found');
  END IF;

  IF v_last_shop_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (now() - v_last_shop_at)) * 1000 < p_cooldown_ms
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_requests');
  END IF;

  SELECT COALESCE((to_jsonb(w) ->> p_weapon)::INT, 0)
    INTO v_current_owned
    FROM weapons w
    WHERE w.player_id = p_player_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_state_not_found');
  END IF;

  IF NOT p_is_multi AND v_current_owned > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_owned');
  END IF;

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

  UPDATE resources
    SET gold       = gold - p_total_gold,
        iron       = iron - p_total_iron,
        wood       = wood - p_total_wood,
        food       = food - p_total_food,
        updated_at = now()
    WHERE player_id = p_player_id;

  EXECUTE format(
    'UPDATE weapons SET %I = %I + $1, updated_at = now() WHERE player_id = $2',
    p_weapon, p_weapon
  ) USING p_amount, p_player_id;

  UPDATE players
    SET last_shop_at = now()
    WHERE id = p_player_id;

  RETURN jsonb_build_object('ok', true);

END;
$$;

-- ── 3. Recreate shop_sell_apply() with expanded whitelist ─────────────────

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

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF p_refund_gold < 0 OR p_refund_iron < 0 OR p_refund_wood < 0 OR p_refund_food < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_refund');
  END IF;

  IF p_weapon NOT IN (
    -- attack (tiers 1–10)
    'slingshot', 'boomerang', 'pirate_knife', 'axe',
    'master_knife', 'knight_axe', 'iron_ball',
    'battle_axe', 'war_hammer', 'dragon_sword',
    -- defense (tiers 1–10)
    'wood_shield', 'iron_shield', 'leather_armor',
    'chain_armor', 'plate_armor', 'mithril_armor', 'gods_armor',
    'shadow_armor', 'void_armor', 'celestial_armor',
    -- spy (tiers 1–7)
    'shadow_cloak', 'dark_mask', 'elven_gear',
    'mystic_cloak', 'shadow_veil', 'phantom_shroud', 'arcane_veil',
    -- scout (tiers 1–7)
    'scout_boots', 'scout_cloak', 'elven_boots',
    'swift_boots', 'shadow_steps', 'phantom_stride', 'arcane_lens'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_weapon');
  END IF;

  SELECT r.gold, r.iron, r.wood, r.food, p.last_shop_at
    INTO v_gold, v_iron, v_wood, v_food, v_last_shop_at
    FROM resources r
    JOIN players   p ON p.id = r.player_id
    WHERE r.player_id = p_player_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_state_not_found');
  END IF;

  IF v_last_shop_at IS NOT NULL
    AND EXTRACT(EPOCH FROM (now() - v_last_shop_at)) * 1000 < p_cooldown_ms
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_requests');
  END IF;

  SELECT COALESCE((to_jsonb(w) ->> p_weapon)::INT, 0)
    INTO v_current_owned
    FROM weapons w
    WHERE w.player_id = p_player_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'player_state_not_found');
  END IF;

  IF v_current_owned < p_amount THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'not_enough_owned',
      'owned', v_current_owned
    );
  END IF;

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

  RETURN jsonb_build_object('ok', true);

END;
$$;

-- ── 4. Re-grant execute to service_role ───────────────────────────────────

GRANT EXECUTE ON FUNCTION shop_buy_apply(
  UUID, TEXT, INT, BOOLEAN, BIGINT, BIGINT, BIGINT, BIGINT, INT
) TO postgres, service_role;

GRANT EXECUTE ON FUNCTION shop_sell_apply(
  UUID, TEXT, INT, BIGINT, BIGINT, BIGINT, BIGINT, INT
) TO postgres, service_role;
