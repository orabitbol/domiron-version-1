-- ============================================================
-- Domiron — 0020_tribe_v1.sql
-- Tribe V1: role system, mana contributions, automated tax,
-- audit log, new spell keys, deputy removal from tribes table.
-- ============================================================

-- ── 1. Add role column to tribe_members ──────────────────────────────────────
--
-- 'leader'  — exactly 1 per tribe (always tribe.leader_id)
-- 'deputy'  — up to 3 per tribe, tax-exempt, can cast spells
-- 'member'  — regular member, pays taxes, cannot cast spells

ALTER TABLE tribe_members
  ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
  CONSTRAINT chk_tribe_member_role CHECK (role IN ('leader', 'deputy', 'member'));

-- Promote existing leaders to role='leader'
UPDATE tribe_members tm
SET role = 'leader'
FROM tribes t
WHERE tm.tribe_id = t.id
  AND tm.player_id = t.leader_id;

-- Promote existing single deputy_id to role='deputy'
-- (deputy_id column will be dropped below)
UPDATE tribe_members tm
SET role = 'deputy'
FROM tribes t
WHERE tm.tribe_id = t.id
  AND t.deputy_id IS NOT NULL
  AND tm.player_id = t.deputy_id
  AND tm.role = 'member';

-- ── 2. Drop deputy_id from tribes (now tracked via tribe_members.role) ────────
ALTER TABLE tribes DROP COLUMN IF EXISTS deputy_id;

-- ── 3. Track last automated tax collection date per tribe ─────────────────────
ALTER TABLE tribes ADD COLUMN IF NOT EXISTS last_tax_collected_date DATE;

-- ── 4. tribe_mana_contributions ───────────────────────────────────────────────
--
-- Records every personal-mana → tribe-mana contribution.
-- Permanent — no refunds, no withdrawals. Kept for audit/display.

CREATE TABLE IF NOT EXISTS tribe_mana_contributions (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id    UUID    NOT NULL REFERENCES tribes(id)   ON DELETE CASCADE,
  player_id   UUID    NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  mana_amount INT     NOT NULL CHECK (mana_amount > 0),
  season_id   INT     NOT NULL REFERENCES seasons(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tribe_mana_contrib
  ON tribe_mana_contributions(tribe_id, created_at DESC);

-- ── 5. tribe_tax_log ──────────────────────────────────────────────────────────
--
-- One row per (tribe, member, day). UNIQUE constraint prevents double-collection.
-- paid=true  → gold was deducted from member and transferred to leader
-- paid=false → member lacked gold; no transfer; recorded for visibility

CREATE TABLE IF NOT EXISTS tribe_tax_log (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id       UUID    NOT NULL REFERENCES tribes(id)   ON DELETE CASCADE,
  player_id      UUID    NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  collected_date DATE    NOT NULL,
  tax_amount     BIGINT  NOT NULL,
  paid           BOOLEAN NOT NULL,
  season_id      INT     NOT NULL REFERENCES seasons(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tribe_id, player_id, collected_date)
);

CREATE INDEX IF NOT EXISTS idx_tribe_tax_log
  ON tribe_tax_log(tribe_id, collected_date DESC);

-- ── 6. tribe_audit_log ────────────────────────────────────────────────────────
--
-- Permanent ledger of leadership and economy actions.
-- action values: 'leadership_transfer', 'deputy_appoint', 'deputy_remove',
--                'member_kick', 'spell_cast', 'mana_contribute', 'tax_set',
--                'tribe_created', 'tribe_disbanded'

CREATE TABLE IF NOT EXISTS tribe_audit_log (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id   UUID    NOT NULL REFERENCES tribes(id)   ON DELETE CASCADE,
  actor_id   UUID    NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  action     TEXT    NOT NULL,
  target_id  UUID    REFERENCES players(id),
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tribe_audit_log
  ON tribe_audit_log(tribe_id, created_at DESC);

-- ── 7. RLS for new tables ─────────────────────────────────────────────────────

ALTER TABLE tribe_mana_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tribe_tax_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tribe_audit_log          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tribe_mana_contrib_select"
  ON tribe_mana_contributions FOR SELECT USING (true);

CREATE POLICY "tribe_tax_log_select"
  ON tribe_tax_log FOR SELECT USING (true);

CREATE POLICY "tribe_audit_log_select"
  ON tribe_audit_log FOR SELECT USING (true);

-- ── 8. Update tribe_spells constraint — V1 keys only ─────────────────────────

ALTER TABLE tribe_spells DROP CONSTRAINT IF EXISTS chk_tribe_spell_key;
ALTER TABLE tribe_spells ADD CONSTRAINT chk_tribe_spell_key CHECK (
  spell_key IN ('war_cry', 'tribe_shield', 'production_blessing', 'spy_veil', 'battle_supply')
);

-- ── 9. tribe_contribute_mana_apply() ─────────────────────────────────────────
--
-- Atomically transfers personal mana → tribe mana.
-- Locks tribe_members → hero → tribes rows to prevent race conditions.
--
-- Returns:
--   { ok: false, error: 'invalid_amount' | 'not_in_tribe' | 'hero_not_found' | 'not_enough_mana' }

CREATE OR REPLACE FUNCTION tribe_contribute_mana_apply(
  p_player_id UUID,
  p_amount    INT,
  p_season_id INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tribe_id   UUID;
  v_hero_mana  INT;
  v_tribe_mana INT;
BEGIN
  -- Guard: amount must be positive
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Lock tribe_members row (derives tribe_id)
  SELECT tribe_id INTO v_tribe_id
  FROM tribe_members
  WHERE player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_tribe');
  END IF;

  -- Lock hero row (personal mana source)
  SELECT mana INTO v_hero_mana
  FROM hero
  WHERE player_id = p_player_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'hero_not_found');
  END IF;

  IF v_hero_mana < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_enough_mana');
  END IF;

  -- Deduct personal mana
  UPDATE hero
    SET mana       = mana - p_amount,
        updated_at = now()
    WHERE player_id = p_player_id;

  -- Add to tribe mana (permanent — no withdrawal path) and capture new value
  UPDATE tribes
    SET mana = mana + p_amount
    WHERE id = v_tribe_id
  RETURNING mana INTO v_tribe_mana;

  -- Record for audit
  INSERT INTO tribe_mana_contributions (tribe_id, player_id, mana_amount, season_id)
    VALUES (v_tribe_id, p_player_id, p_amount, p_season_id);

  RETURN jsonb_build_object(
    'ok',               true,
    'mana_contributed', p_amount,
    'new_hero_mana',    v_hero_mana - p_amount,
    'new_tribe_mana',   v_tribe_mana,
    'tribe_id',         v_tribe_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION tribe_contribute_mana_apply(UUID, INT, INT)
  TO postgres, service_role;

-- ── 10. tribe_collect_member_tax() ───────────────────────────────────────────
--
-- Atomically processes one member's daily tax.
-- Called once per non-exempt member per collection cycle.
-- UNIQUE constraint on tribe_tax_log prevents duplicate collection.
--
-- Locking strategy: both resource rows are locked upfront in deterministic
-- UUID order (smaller UUID first) before any reads or writes, preventing
-- deadlocks when two concurrent cron runs process members from the same tribe.
--
-- Returns:
--   { ok: true,  paid: true/false, tax_amount: N }
--   { ok: true,  skipped: true }   ← already processed today
--   { ok: false, error: 'member_resources_not_found' | 'leader_resources_not_found' }

CREATE OR REPLACE FUNCTION tribe_collect_member_tax(
  p_member_player_id UUID,
  p_tribe_id         UUID,
  p_leader_id        UUID,
  p_tax_amount       BIGINT,
  p_collected_date   DATE,
  p_season_id        INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_gold BIGINT;
  v_paid        BOOLEAN;
BEGIN
  -- Idempotency guard — already logged for this date?
  IF EXISTS (
    SELECT 1 FROM tribe_tax_log
    WHERE tribe_id       = p_tribe_id
      AND player_id      = p_member_player_id
      AND collected_date = p_collected_date
  ) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  -- Acquire both resource row locks upfront in deterministic UUID order.
  -- Smaller UUID always locked first — prevents deadlocks under concurrency.
  -- Member gold is read after both locks are held.
  IF p_member_player_id < p_leader_id THEN
    SELECT gold INTO v_member_gold
    FROM resources WHERE player_id = p_member_player_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'member_resources_not_found');
    END IF;

    PERFORM FROM resources WHERE player_id = p_leader_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'leader_resources_not_found');
    END IF;

  ELSE
    PERFORM FROM resources WHERE player_id = p_leader_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'leader_resources_not_found');
    END IF;

    SELECT gold INTO v_member_gold
    FROM resources WHERE player_id = p_member_player_id FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'member_resources_not_found');
    END IF;
  END IF;

  v_paid := v_member_gold >= p_tax_amount;

  IF v_paid THEN
    -- Deduct from member (both rows already locked — no partial-write risk)
    UPDATE resources
      SET gold       = gold - p_tax_amount,
          updated_at = now()
      WHERE player_id = p_member_player_id;

    -- Credit leader directly (row already locked above)
    UPDATE resources
      SET gold       = gold + p_tax_amount,
          updated_at = now()
      WHERE player_id = p_leader_id;
  END IF;

  -- Record outcome (both paid and unpaid are logged for visibility)
  INSERT INTO tribe_tax_log
    (tribe_id, player_id, collected_date, tax_amount, paid, season_id)
  VALUES
    (p_tribe_id, p_member_player_id, p_collected_date, p_tax_amount, v_paid, p_season_id);

  RETURN jsonb_build_object(
    'ok',         true,
    'paid',       v_paid,
    'tax_amount', p_tax_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION tribe_collect_member_tax(UUID, UUID, UUID, BIGINT, DATE, INT)
  TO postgres, service_role;

-- ── 11. tribe_set_member_role_apply() ────────────────────────────────────────
--
-- Atomic deputy appointment / removal with cap enforcement.
-- Locks both membership rows before any read-modify-write, preventing the
-- TOCTTOU race where two concurrent appoint requests both pass the cap check.
--
-- Locks are acquired in UUID order (smaller first) to avoid deadlocks.
--
-- Returns:
--   { ok: true,  action: 'appoint'|'remove' }
--   { ok: false, error: 'actor_not_in_tribe' | 'not_leader' | 'target_not_in_tribe'
--                      | 'cannot_change_leader' | 'already_deputy' | 'not_deputy'
--                      | 'deputy_cap_reached' | 'invalid_action' }

CREATE OR REPLACE FUNCTION tribe_set_member_role_apply(
  p_actor_id  UUID,
  p_target_id UUID,
  p_action    TEXT,    -- 'appoint' | 'remove'
  p_tribe_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_role   TEXT;
  v_target_role  TEXT;
  v_deputy_count INT;
BEGIN
  -- Lock both membership rows in deterministic UUID order (prevents deadlocks)
  IF p_actor_id < p_target_id THEN
    SELECT role INTO v_actor_role  FROM tribe_members WHERE player_id = p_actor_id  AND tribe_id = p_tribe_id FOR UPDATE;
    SELECT role INTO v_target_role FROM tribe_members WHERE player_id = p_target_id AND tribe_id = p_tribe_id FOR UPDATE;
  ELSE
    SELECT role INTO v_target_role FROM tribe_members WHERE player_id = p_target_id AND tribe_id = p_tribe_id FOR UPDATE;
    SELECT role INTO v_actor_role  FROM tribe_members WHERE player_id = p_actor_id  AND tribe_id = p_tribe_id FOR UPDATE;
  END IF;

  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'actor_not_in_tribe');
  END IF;

  IF v_actor_role != 'leader' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_leader');
  END IF;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_not_in_tribe');
  END IF;

  IF v_target_role = 'leader' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_change_leader');
  END IF;

  IF p_action = 'appoint' THEN
    IF v_target_role = 'deputy' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_deputy');
    END IF;

    -- Count deputies under lock (no race — both rows are locked above)
    SELECT COUNT(*) INTO v_deputy_count
    FROM tribe_members
    WHERE tribe_id = p_tribe_id AND role = 'deputy';

    IF v_deputy_count >= 3 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'deputy_cap_reached');
    END IF;

    UPDATE tribe_members SET role = 'deputy'
      WHERE player_id = p_target_id AND tribe_id = p_tribe_id;

    INSERT INTO tribe_audit_log (tribe_id, actor_id, action, target_id)
      VALUES (p_tribe_id, p_actor_id, 'deputy_appoint', p_target_id);

  ELSIF p_action = 'remove' THEN
    IF v_target_role != 'deputy' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_deputy');
    END IF;

    UPDATE tribe_members SET role = 'member'
      WHERE player_id = p_target_id AND tribe_id = p_tribe_id;

    INSERT INTO tribe_audit_log (tribe_id, actor_id, action, target_id)
      VALUES (p_tribe_id, p_actor_id, 'deputy_remove', p_target_id);

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_action');
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', p_action);
END;
$$;

GRANT EXECUTE ON FUNCTION tribe_set_member_role_apply(UUID, UUID, TEXT, UUID)
  TO postgres, service_role;

-- ── 12. tribe_transfer_leadership_apply() ────────────────────────────────────
--
-- Atomic leadership transfer — all three writes (tribes.leader_id,
-- new-leader role, old-leader role) run within a single PG transaction.
-- Locks both membership rows in UUID order to prevent TOCTTOU races.
--
-- Returns:
--   { ok: true,  new_leader_id: ID }
--   { ok: false, error: 'same_player' | 'actor_not_in_tribe' | 'not_leader'
--                      | 'target_not_in_tribe' | 'target_not_deputy' }

CREATE OR REPLACE FUNCTION tribe_transfer_leadership_apply(
  p_actor_id      UUID,
  p_new_leader_id UUID,
  p_tribe_id      UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_role  TEXT;
  v_target_role TEXT;
BEGIN
  IF p_actor_id = p_new_leader_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'same_player');
  END IF;

  -- Lock both membership rows in deterministic UUID order (prevents deadlocks)
  IF p_actor_id < p_new_leader_id THEN
    SELECT role INTO v_actor_role  FROM tribe_members WHERE player_id = p_actor_id      AND tribe_id = p_tribe_id FOR UPDATE;
    SELECT role INTO v_target_role FROM tribe_members WHERE player_id = p_new_leader_id AND tribe_id = p_tribe_id FOR UPDATE;
  ELSE
    SELECT role INTO v_target_role FROM tribe_members WHERE player_id = p_new_leader_id AND tribe_id = p_tribe_id FOR UPDATE;
    SELECT role INTO v_actor_role  FROM tribe_members WHERE player_id = p_actor_id      AND tribe_id = p_tribe_id FOR UPDATE;
  END IF;

  IF v_actor_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'actor_not_in_tribe');
  END IF;

  IF v_actor_role != 'leader' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_leader');
  END IF;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_not_in_tribe');
  END IF;

  IF v_target_role != 'deputy' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_not_deputy');
  END IF;

  -- All three writes in one atomic transaction (SECURITY DEFINER already wraps in txn)
  UPDATE tribes        SET leader_id = p_new_leader_id              WHERE id        = p_tribe_id;
  UPDATE tribe_members SET role = 'leader'                          WHERE player_id = p_new_leader_id AND tribe_id = p_tribe_id;
  UPDATE tribe_members SET role = 'deputy'                          WHERE player_id = p_actor_id      AND tribe_id = p_tribe_id;

  INSERT INTO tribe_audit_log (tribe_id, actor_id, action, target_id)
    VALUES (p_tribe_id, p_actor_id, 'leadership_transfer', p_new_leader_id);

  RETURN jsonb_build_object('ok', true, 'new_leader_id', p_new_leader_id);
END;
$$;

GRANT EXECUTE ON FUNCTION tribe_transfer_leadership_apply(UUID, UUID, UUID)
  TO postgres, service_role;

-- ── 13. One-leader-per-tribe SQL invariant ────────────────────────────────────
--
-- Partial unique index: at most one row per tribe may have role = 'leader'.
-- This is a DB-level hard constraint that backs the application-level invariant.
-- All RPCs (set_role, transfer_leadership) maintain this through atomic writes,
-- but the index provides a final safety net if any direct write bypasses them.

CREATE UNIQUE INDEX IF NOT EXISTS uidx_tribe_one_leader
  ON tribe_members (tribe_id)
  WHERE role = 'leader';
