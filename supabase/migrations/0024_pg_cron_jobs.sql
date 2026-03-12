-- ============================================================
-- Migration 0024: Replace Vercel Cron with pg_cron + pg_net
-- ============================================================
--
-- Moves the two production scheduled jobs from Vercel Cron into
-- Supabase-native pg_cron (scheduler) + pg_net (HTTP caller).
-- No game logic changes — only the scheduler moves.
--
-- Jobs migrated:
--   domiron-game-tick    */30 * * * *  GET  /api/tick
--   domiron-tax-collect  0 * * * *     POST /api/tribe/tax-collect
--
-- Season freeze is NOT scheduled. It is passive: getActiveSeason()
-- checks `status='active' AND ends_at > now()`. When ends_at passes,
-- every gameplay write route returns 423 automatically. No cron needed.
--
-- ┌─────────────────────────────────────────────────────────────────────┐
-- │  ONE-TIME MANUAL SETUP  (Supabase Dashboard → SQL Editor)          │
-- │  Do this BEFORE applying this migration:                           │
-- │                                                                     │
-- │  1. Enable extensions (Dashboard → Database → Extensions):         │
-- │       pg_cron  (pre-installed on Supabase Pro; enable if needed)   │
-- │       pg_net   (pre-installed on Supabase Pro; enable if needed)   │
-- │                                                                     │
-- │  2. Store secrets in Supabase Vault:                               │
-- │                                                                     │
-- │     SELECT vault.create_secret(                                     │
-- │       'https://YOUR-APP.vercel.app',                               │
-- │       'app_next_url',                                               │
-- │       'Base URL of the deployed Next.js app (no trailing slash)'   │
-- │     );                                                              │
-- │     SELECT vault.create_secret(                                     │
-- │       'YOUR-CRON-SECRET-VALUE',                                     │
-- │       'cron_secret',                                                │
-- │       'Matches CRON_SECRET env var on Vercel; guards /api/tick'    │
-- │     );                                                              │
-- │                                                                     │
-- │  Note: vault.create_secret is preferred over ALTER DATABASE SET    │
-- │  because Vault secrets are encrypted at rest and are NOT visible    │
-- │  in pg_catalog or information_schema. The cron job SQL does NOT     │
-- │  embed the raw secret — it reads it at runtime from Vault.         │
-- │                                                                     │
-- │  3. To update a secret later:                                       │
-- │     UPDATE vault.secrets SET secret = 'new-value'                  │
-- │       WHERE name = 'cron_secret';                                   │
-- └─────────────────────────────────────────────────────────────────────┘
--
-- Monitoring:
--   Job history (start/end times, errors):
--     SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
--   HTTP response log (async — may arrive seconds after the job row):
--     SELECT * FROM net._http_response ORDER BY created DESC LIMIT 20;
--
-- Rollback: see comment at the bottom of this file.
-- ============================================================

-- Remove old jobs if they exist (safe to re-run / idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'domiron-game-tick',
    'domiron-tax-collect'
  );
END $$;


-- ── Job 1: Main game tick ─────────────────────────────────────────────────────
--
-- Schedule : every 30 minutes  ("*/30 * * * *")
-- Must always match BALANCE.tick.intervalMinutes (30).
-- If the interval ever changes, update BOTH this schedule AND the
-- hardcoded constant in instrumentation.ts.
--
-- Auth     : x-cron-secret header — value read live from Vault at each firing.
--            Raw secret never stored in cron.job.command.
--
-- Method   : GET  (the route is exported as GET in app/api/tick/route.ts)
-- Idempotency: duplicate-run guard at route level checks world_state.next_tick_at.
--
SELECT cron.schedule(
  'domiron-game-tick',
  '*/30 * * * *',
  $$
  SELECT net.http_get(
    url     := (
                 SELECT decrypted_secret
                 FROM   vault.decrypted_secrets
                 WHERE  name = 'app_next_url'
               ) || '/api/tick',
    headers := jsonb_build_object(
      'x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    )
  );
  $$
);


-- ── Job 2: Tribe tax collection ───────────────────────────────────────────────
--
-- Schedule : every hour at :00  ("0 * * * *")
-- The route itself checks Israel local time >= BALANCE.tribe.taxCollectionHour (20).
-- Running hourly means collection fires within ≤60 minutes after 20:00 Israel time,
-- regardless of DST transitions — no timezone arithmetic in the cron expression.
--
-- Auth     : same x-cron-secret, same Vault reference.
-- Method   : POST
-- Idempotency: tribes.last_tax_collected_date + tribe_tax_log UNIQUE constraint.
--
SELECT cron.schedule(
  'domiron-tax-collect',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := (
                 SELECT decrypted_secret
                 FROM   vault.decrypted_secrets
                 WHERE  name = 'app_next_url'
               ) || '/api/tribe/tax-collect',
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'x-cron-secret',
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
    )
  );
  $$
);


-- ── Verify ────────────────────────────────────────────────────────────────────
-- After applying, confirm the two jobs are active:
--   SELECT jobid, jobname, schedule, active
--   FROM   cron.job
--   WHERE  jobname LIKE 'domiron-%';


-- ── Rollback ──────────────────────────────────────────────────────────────────
-- To revert to Vercel Cron:
--   1. Restore vercel.json with the two original cron entries.
--   2. Unschedule the pg_cron jobs:
--        DO $$ BEGIN
--          PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'domiron-%';
--        END $$;
--   3. No code changes needed — routes and x-cron-secret auth are unchanged.
