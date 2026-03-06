import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Tailwind class merge utility (shadcn/ui pattern)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Format large numbers: 15000 → "15,000" or "15K"
export function formatNumber(n: number, compact = false): string {
  if (compact) {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`
  }
  return n.toLocaleString('en-US')
}

// Get catch-up bonus multiplier based on season day
export function getCatchUpMultiplier(seasonStartDate: Date): number {
  const daysSinceStart = Math.floor(
    (Date.now() - seasonStartDate.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysSinceStart <= 7) return 1
  if (daysSinceStart <= 30) return 2
  if (daysSinceStart <= 60) return 5
  if (daysSinceStart <= 80) return 10
  return 20
}

// Local-clock fallback estimate of time until next tick.
// Assumes the cron fires at :00 and :30 of every hour (vercel.json "*/30 * * * *").
// Only accurate when the cron is on-schedule and the tick processes in < 1 second.
//
// IMPORTANT — fallback only. The authoritative countdown source is
// world_state.next_tick_at, exposed by GET /api/tick-status and consumed by
// useTickCountdown (lib/hooks/useTickCountdown.ts).
// Never use this as the primary countdown source — it will drift from the server timer.
export function getTimeUntilNextTick(): number {
  const now = new Date()
  const minutes = now.getMinutes()
  const seconds = now.getSeconds()
  const minutesUntilNext = minutes < 30
    ? 30 - minutes
    : 60 - minutes
  return (minutesUntilNext * 60 - seconds) * 1000
}

// Format seconds as mm:ss countdown
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

// Check if player has VIP active
export function isVipActive(vipUntil: string | null): boolean {
  if (!vipUntil) return false
  return new Date(vipUntil) > new Date()
}
