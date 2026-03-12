-- ============================================================
-- Domiron — Payments / Revenue Foundation (Migration 0025)
--
-- Creates the minimum schema needed for future payment integration.
-- No payment provider is connected yet. This migration creates the
-- persistence layer only — connect a provider (Stripe, etc.) later.
-- ============================================================

CREATE TABLE payments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Player who made the purchase. SET NULL on player deletion so
  -- revenue history is preserved even if the account is removed.
  player_id       UUID        REFERENCES players(id) ON DELETE SET NULL,
  -- Amount in the smallest currency unit (e.g. cents for USD).
  -- BIGINT: avoids overflow for high-volume or high-denomination currencies.
  amount_cents    BIGINT      NOT NULL,
  -- ISO 4217 currency code.
  currency        TEXT        NOT NULL DEFAULT 'USD',
  -- Internal product identifier (e.g. 'boost_slave_output_10', 'vip_7d').
  product_key     TEXT        NOT NULL,
  -- Payment provider name (e.g. 'stripe', 'paypal', 'manual').
  provider        TEXT        NOT NULL,
  -- Provider-side reference (charge ID, payment intent ID, etc.).
  provider_ref    TEXT,
  -- Lifecycle status.
  status          TEXT        NOT NULL DEFAULT 'pending',
  -- Arbitrary provider/product metadata for future extensibility.
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,

  CONSTRAINT chk_payment_amount   CHECK (amount_cents > 0),
  CONSTRAINT chk_payment_status   CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  CONSTRAINT chk_payment_currency CHECK (char_length(currency) BETWEEN 3 AND 10)
);

-- Performance indexes for the admin revenue dashboard
CREATE INDEX idx_payments_player     ON payments (player_id, created_at DESC);
CREATE INDEX idx_payments_status     ON payments (status, created_at DESC);
CREATE INDEX idx_payments_created_at ON payments (created_at DESC);

-- Idempotency: prevent the same external payment from being inserted twice.
-- Partial index so rows with NULL provider_ref (e.g. manually created records)
-- are exempt — only non-null provider references are de-duplicated.
CREATE UNIQUE INDEX idx_payments_provider_ref
  ON payments (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

-- RLS: payments are internal — no player-facing read/write policies.
-- All access goes through service-role (createAdminClient).
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
