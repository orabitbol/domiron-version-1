/**
 * Next.js Instrumentation — Dev-only auto-tick.
 *
 * In production, Vercel Cron calls GET /api/tick on schedule (vercel.json).
 * In local dev (`npm run dev`), Vercel Cron never fires.  This file starts
 * a Node.js setInterval that calls the same endpoint with the CRON_SECRET
 * header so developers don't have to manually trigger ticks.
 *
 * Next.js 14.1+ runs register() once at server startup.
 * register() may be called multiple times (Edge + Node runtimes).
 *
 * Guard logic:
 *   - Skip when NODE_ENV !== 'development' (never run in production)
 *   - Skip when NEXT_RUNTIME === 'edge' (Edge runtime — no setInterval)
 *   - Allow when NEXT_RUNTIME is undefined OR 'nodejs' (both are Node.js in dev)
 *
 * To revert to 30-minute ticks: remove TICK_INTERVAL_MINUTES from .env
 * (or set it to 30). Do NOT change vercel.json — it only controls the production
 * Vercel Cron and must stay at "*\/30 * * * *" at all times.
 */

// Module-level flag prevents duplicate intervals across HMR reloads.
let devCronStarted = false

export async function register() {
  // Unconditional — fires for EVERY runtime (Edge + Node). Proves the file loads.
  console.log(
    `[INSTRUMENTATION] register() called — NEXT_RUNTIME="${process.env.NEXT_RUNTIME}" NODE_ENV="${process.env.NODE_ENV}"`
  )

  // Only in development
  if (process.env.NODE_ENV !== 'development') return

  // Skip the Edge runtime (no setInterval / fetch available there).
  // NOTE: Do NOT check for 'nodejs' — in Next.js 14 dev the Node.js
  // invocation has NEXT_RUNTIME=undefined, not 'nodejs'.
  if (process.env.NEXT_RUNTIME === 'edge') {
    console.log('[INSTRUMENTATION] skipping — Edge runtime')
    return
  }

  if (devCronStarted) {
    console.log('[INSTRUMENTATION] skipping — interval already running')
    return
  }
  devCronStarted = true

  // Mirror the dev-mode logic in app/api/tick/route.ts: env var overrides BALANCE value.
  // NOTE: instrumentation.ts only runs in development (guard above), so no production guard needed here.
  const rawInterval = Number(process.env.TICK_INTERVAL_MINUTES)
  const intervalMinutes =
    Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 30
  // 30 === BALANCE.tick.intervalMinutes — kept as literal to avoid importing BALANCE here.
  const intervalMs = intervalMinutes * 60_000

  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.warn('[DEV CRON] CRON_SECRET not set — auto-tick disabled')
    return
  }

  const port = process.env.PORT ?? '3000'
  const url  = `http://localhost:${port}/api/tick`

  console.log(`[DEV CRON] Scheduler armed — interval=${intervalMinutes}min url=${url}`)

  const runTick = async () => {
    console.log(`[DEV CRON] → calling ${url} at ${new Date().toISOString()}`)
    try {
      const res = await fetch(url, { headers: { 'x-cron-secret': secret } })
      const text = await res.text()
      if (!res.ok) {
        console.warn(`[DEV CRON] Tick HTTP ${res.status}:`, text)
      } else {
        console.log(`[DEV CRON] Tick OK (HTTP ${res.status}):`, text)
      }
    } catch (err) {
      // Server not ready yet — will retry on next interval
      console.error('[DEV CRON] Tick fetch error:', (err as Error).message)
    }
  }

  // Delay first tick 3 s so the dev server finishes booting.
  setTimeout(() => {
    console.log(`[DEV CRON] Auto-tick STARTED (every ${intervalMinutes} min / ${intervalMs / 1000}s)`)
    runTick()
    setInterval(runTick, intervalMs)
  }, 3_000)
}
