/**
 * Next.js Instrumentation — Dev-only auto-tick.
 *
 * In production, Vercel Cron calls GET /api/tick on its schedule (vercel.json).
 * In local dev (`npm run dev`), Vercel Cron never fires.  This file starts
 * a Node.js setInterval that calls the same endpoint with the CRON_SECRET
 * header so the dev server processes ticks automatically.
 *
 * Next.js 14.1+ runs register() once at server startup.
 * register() may be called multiple times (Edge + Node runtimes).
 *
 * Guard logic:
 *   - Skip when NODE_ENV !== 'development' (never run in production)
 *   - Skip when NEXT_RUNTIME === 'edge' (Edge runtime — no setInterval)
 *   - Allow when NEXT_RUNTIME is undefined OR 'nodejs' (both are Node.js in dev)
 *
 * Interval: always 30 minutes — matches BALANCE.tick.intervalMinutes and vercel.json.
 * To trigger a tick on demand in dev: curl http://localhost:3000/api/tick -H "x-cron-secret: <CRON_SECRET>"
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

  // 30 === BALANCE.tick.intervalMinutes. Hardcoded here (not imported) to keep
  // this file dependency-free. Change only if vercel.json and BALANCE are also updated.
  const intervalMinutes = 30
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
