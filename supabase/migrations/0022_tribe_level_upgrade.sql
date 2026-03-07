-- ============================================================
-- Domiron — 0022_tribe_level_upgrade.sql
--
-- Tribe Level Upgrade System
--
-- Tribe level is a permanent, irreversible progression track
-- (level 1 through 5). Upgrades cost TRIBE MANA only.
-- Only tribe leaders and deputies may perform upgrades.
--
-- Atomicity guarantee
-- ───────────────────
-- tribe_upgrade_level_apply() wraps mana deduction and level
-- increment in one Postgres transaction. Either both commit
-- or neither does.
--
-- Row locking
-- ───────────
-- FOR UPDATE on tribe_members first (derives tribe_id + role),
-- then tribes (mana + level read-modify-write).
--
-- Lock order safety
-- ─────────────────
-- tribe_upgrade_level_apply  : tribe_members → tribes
-- tribe_contribute_mana_apply: tribe_members → hero → tribes (UPDATE)
-- tribe_set_member_role_apply: tribe_members (two rows, UUID order)
-- tribe_transfer_leadership  : tribe_members (two rows, UUID order)
-- tribe_collect_member_tax   : resources (two rows, UUID order)
--
-- No path acquires tribes before tribe_members, so the
-- members→tribes order is consistent with all other RPCs.
-- No deadlock risk.
--
-- Post-lock re-validation (TOCTTOU-safe)
-- ───────────────────────────────────────
-- The API route pre-validates before calling the RPC.
-- The RPC re-validates all conditions after acquiring locks,
-- catching any concurrent state change:
--   • role is still leader or deputy
--   • current tribe level + 1 == p_next_level (stale-read guard)
--   • current tribe level < p_max_level
--   • tribe mana >= p_mana_cost
--
-- Cost authority
-- ──────────────
-- Mana cost is computed by the API from
-- BALANCE.tribe.levelUpgrade.manaCostByLevel — the single
-- source of truth. The RPC enforces atomicity; costs are
-- passed in as p_mana_cost.
-- ============================================================

-- ── 1. CHECK constraint: tribes.level must be 1–5 ────────────────────────────
--
-- All existing rows have level=1 (the column default), so this
-- constraint is safe to add without a migration data fix.

ALTER TABLE tribes
  ADD CONSTRAINT chk_tribe_level CHECK (level BETWEEN 1 AND 5);

-- ── 2. tribe_upgrade_level_apply() ───────────────────────────────────────────
--
-- Atomically upgrades tribe level by 1, deducting tribe mana.
--
-- Parameters:
--   p_player_id  — UUID of the player requesting the upgrade
--   p_mana_cost  — tribe mana to deduct (computed from BALANCE by the API)
--   p_next_level — expected new level; must equal current_level + 1 (stale-read guard)
--   p_max_level  — maximum allowed level (from BALANCE.tribe.levelUpgrade.maxLevel)
--
-- Returns:
--   { ok: true,  new_level: N, new_tribe_mana: N }
--   { ok: false, error: 'not_in_tribe'     }  — player has no tribe_members row
--   { ok: false, error: 'not_authorized'   }  — caller is not leader or deputy
--   { ok: false, error: 'already_max_level'}  — tribe.level >= p_max_level
--   { ok: false, error: 'stale_level'      }  — level changed since API pre-check
--   { ok: false, error: 'not_enough_mana'  }  — tribe.mana < p_mana_cost

CREATE OR REPLACE FUNCTION tribe_upgrade_level_apply(
  p_player_id  UUID,
  p_mana_cost  INT,
  p_next_level INT,
  p_max_level  INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tribe_id   UUID;
  v_role       TEXT;
  v_tribe_mana INT;
  v_tribe_lvl  INT;
  v_new_mana   INT;
BEGIN

  -- ── Step 1: Lock tribe_members row ────────────────────────────────────────
  -- Derives tribe_id and role for this player. FOR UPDATE prevents another
  -- concurrent upgrade or role-change from racing past the role check.

  SELECT tribe_id, role
    INTO v_tribe_id, v_role
    FROM tribe_members
    WHERE player_id = p_player_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_tribe');
  END IF;

  -- ── Step 2: Post-lock role validation ────────────────────────────────────

  IF v_role NOT IN ('leader', 'deputy') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- ── Step 3: Lock tribes row ───────────────────────────────────────────────
  -- FOR UPDATE prevents concurrent upgrade from reading the same mana/level
  -- and both committing.

  SELECT mana, level
    INTO v_tribe_mana, v_tribe_lvl
    FROM tribes
    WHERE id = v_tribe_id
    FOR UPDATE;

  -- ── Step 4: Post-lock constraint validation ───────────────────────────────

  IF v_tribe_lvl >= p_max_level THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_max_level');
  END IF;

  -- Stale-read guard: if another upgrade committed between the API pre-check
  -- and this RPC call, the level will have already incremented.
  IF v_tribe_lvl + 1 <> p_next_level THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_level');
  END IF;

  IF v_tribe_mana < p_mana_cost THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_mana');
  END IF;

  -- ── Step 5: Apply mutations (atomic — within this SECURITY DEFINER txn) ──

  UPDATE tribes
    SET mana  = mana  - p_mana_cost,
        level = level + 1
    WHERE id = v_tribe_id
  RETURNING mana INTO v_new_mana;

  -- ── Step 6: Permanent audit record ────────────────────────────────────────
  -- tribe_audit_log schema: (tribe_id, actor_id, action TEXT, target_id UUID?, details JSONB?)
  -- 'level_upgrade' is a valid value for the action column (TEXT, no enum constraint).

  INSERT INTO tribe_audit_log (tribe_id, actor_id, action, details)
    VALUES (
      v_tribe_id,
      p_player_id,
      'level_upgrade',
      jsonb_build_object(
        'previous_level', v_tribe_lvl,
        'new_level',      p_next_level,
        'mana_cost',      p_mana_cost
      )
    );

  -- ── Step 7: Return snapshot ───────────────────────────────────────────────

  RETURN jsonb_build_object(
    'ok',             true,
    'new_level',      p_next_level,
    'new_tribe_mana', v_new_mana
  );

END;
$$;

GRANT EXECUTE ON FUNCTION tribe_upgrade_level_apply(UUID, INT, INT, INT)
  TO postgres, service_role;
