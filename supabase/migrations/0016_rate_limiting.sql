-- ============================================================
-- Domiron v5 — 0016_rate_limiting.sql
-- Adds per-player rate-limit timestamp columns and updates
-- the attack_resolve_apply / spy_resolve_apply RPCs to record
-- the timestamp atomically inside the existing transaction.
-- ============================================================
--
-- Why inside the RPC, not a separate route update?
-- ─────────────────────────────────────────────────
-- The RPCs already hold a FOR UPDATE lock on the players row
-- and apply all mutations atomically. Recording last_attack_at /
-- last_spy_at inside the same transaction means the timestamp
-- is always consistent with the actual committed action — it can
-- never be set on a transaction that later rolls back, and it
-- cannot create a new unguarded UPDATE outside the RPC contract.
-- Structural tests in attack-resolve.test.ts / spy-resolve.test.ts
-- (which enforce "no direct players.update in the route") continue
-- to pass unchanged.
--
-- Cooldown enforcement
-- ─────────────────────
-- The TypeScript route reads last_attack_at / last_spy_at from
-- the already-fetched player row and rejects with HTTP 429 if
-- the elapsed time is < 1 000 ms.  The RPC then records the new
-- timestamp so subsequent requests see the updated value.
-- ============================================================

-- ── 1. Add columns ────────────────────────────────────────────────────────────

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS last_attack_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_spy_at    TIMESTAMPTZ DEFAULT NULL;

-- ── 2. Replace attack_resolve_apply — adds last_attack_at stamp ──────────────

CREATE OR REPLACE FUNCTION attack_resolve_apply(
  p_attacker_id     UUID,
  p_defender_id     UUID,
  p_turns_used      INT,
  p_food_cost       BIGINT,
  p_gold_stolen     BIGINT,
  p_iron_stolen     BIGINT,
  p_wood_stolen     BIGINT,
  p_food_stolen     BIGINT,
  p_attacker_losses INT,
  p_defender_losses INT,
  p_outcome         TEXT,
  p_atk_power       BIGINT,
  p_def_power       BIGINT,
  p_season_id       INT,
  p_slaves_taken    INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_att_turns    INT;
  v_att_food     BIGINT;
  v_att_soldiers INT;
  v_att_city     INT;
  v_def_city     INT;
  v_def_soldiers INT;
BEGIN

  IF p_turns_used < 1 OR p_turns_used > 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_turns');
  END IF;

  -- ── Acquire row-level locks in ascending UUID order ───────────────────────

  IF p_attacker_id <= p_defender_id THEN

    SELECT p.turns, p.city, a.soldiers, r.food
      INTO v_att_turns, v_att_city, v_att_soldiers, v_att_food
      FROM players   p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id
      WHERE p.id = p_attacker_id
      FOR UPDATE;

    SELECT p.city, a.soldiers
      INTO v_def_city, v_def_soldiers
      FROM players   p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id
      WHERE p.id = p_defender_id
      FOR UPDATE;

  ELSE

    SELECT p.city, a.soldiers
      INTO v_def_city, v_def_soldiers
      FROM players   p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id
      WHERE p.id = p_defender_id
      FOR UPDATE;

    SELECT p.turns, p.city, a.soldiers, r.food
      INTO v_att_turns, v_att_city, v_att_soldiers, v_att_food
      FROM players   p
      JOIN army      a ON a.player_id = p.id
      JOIN resources r ON r.player_id = p.id
      WHERE p.id = p_attacker_id
      FOR UPDATE;

  END IF;

  -- ── Post-lock re-validation ────────────────────────────────────────────────

  IF v_att_turns < p_turns_used THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_turns');
  END IF;

  IF v_att_food < p_food_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_food');
  END IF;

  IF v_att_soldiers <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_soldiers');
  END IF;

  IF v_att_city != v_def_city THEN
    RETURN jsonb_build_object('ok', false, 'error', 'different_city');
  END IF;

  -- ── Apply mutations ────────────────────────────────────────────────────────

  -- Attacker: deduct turns + stamp rate-limit timestamp
  UPDATE players
    SET turns          = turns - p_turns_used,
        last_attack_at = now()
    WHERE id = p_attacker_id;

  UPDATE army
    SET soldiers   = GREATEST(0, soldiers - p_attacker_losses),
        slaves     = slaves + p_slaves_taken,
        updated_at = now()
    WHERE player_id = p_attacker_id;

  UPDATE resources
    SET gold       = gold + p_gold_stolen,
        iron       = iron + p_iron_stolen,
        wood       = wood + p_wood_stolen,
        food       = GREATEST(0, food - p_food_cost + p_food_stolen),
        updated_at = now()
    WHERE player_id = p_attacker_id;

  UPDATE army
    SET soldiers   = GREATEST(0, soldiers - p_defender_losses),
        updated_at = now()
    WHERE player_id = p_defender_id;

  UPDATE resources
    SET gold       = GREATEST(0, gold - p_gold_stolen),
        iron       = GREATEST(0, iron - p_iron_stolen),
        wood       = GREATEST(0, wood - p_wood_stolen),
        food       = GREATEST(0, food - p_food_stolen),
        updated_at = now()
    WHERE player_id = p_defender_id;

  INSERT INTO attacks (
    attacker_id,       defender_id,       turns_used,
    atk_power,         def_power,         outcome,
    attacker_losses,   defender_losses,   slaves_taken,
    gold_stolen,       iron_stolen,       wood_stolen,   food_stolen,
    season_id
  ) VALUES (
    p_attacker_id,     p_defender_id,     p_turns_used,
    p_atk_power,       p_def_power,       p_outcome,
    p_attacker_losses, p_defender_losses, p_slaves_taken,
    p_gold_stolen,     p_iron_stolen,     p_wood_stolen, p_food_stolen,
    p_season_id
  );

  RETURN jsonb_build_object('ok', true);

END;
$$;

GRANT EXECUTE ON FUNCTION attack_resolve_apply(
  UUID, UUID, INT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
  INT, INT, TEXT, BIGINT, BIGINT, INT, INT
) TO postgres, service_role;

-- ── 3. Replace spy_resolve_apply — adds last_spy_at stamp ────────────────────

CREATE OR REPLACE FUNCTION spy_resolve_apply(
  p_spy_owner_id  UUID,
  p_target_id     UUID,
  p_spies_sent    INT,
  p_turn_cost     INT,
  p_spies_caught  INT,
  p_success       BOOLEAN,
  p_data_revealed JSONB,
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

  -- ── Apply mutations ────────────────────────────────────────────────────────

  -- Deduct turns + stamp rate-limit timestamp
  UPDATE players
    SET turns      = turns - p_turn_cost,
        last_spy_at = now()
    WHERE id = p_spy_owner_id;

  v_new_spies := GREATEST(0, v_spies - p_spies_caught);
  IF p_spies_caught > 0 THEN
    UPDATE army
      SET spies      = v_new_spies,
          updated_at = now()
      WHERE player_id = p_spy_owner_id;
  END IF;

  INSERT INTO spy_history (
    spy_owner_id,  target_id,      success,
    spies_caught,  data_revealed,  season_id
  ) VALUES (
    p_spy_owner_id, p_target_id,  p_success,
    p_spies_caught, p_data_revealed, p_season_id
  );

  RETURN jsonb_build_object(
    'ok',        true,
    'new_turns', v_turns - p_turn_cost,
    'new_spies', v_new_spies
  );

END;
$$;

GRANT EXECUTE ON FUNCTION spy_resolve_apply(
  UUID, UUID, INT, INT, INT, BOOLEAN, JSONB, INT
) TO postgres, service_role;
