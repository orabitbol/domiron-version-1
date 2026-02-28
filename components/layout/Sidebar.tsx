'use client'

import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn, formatNumber, formatCountdown, getTimeUntilNextTick } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import { BALANCE } from '@/lib/game/balance'
import {
  Home, Sword, Users, Star, Dumbbell, Building2,
  ShoppingBag, Pickaxe, Landmark, History, LogOut,
  Settings, Gem, Zap, Crown,
} from 'lucide-react'

// Map / Rankings / Settings have moved to the top nav header
const NAV_ITEMS = [
  { href: '/base',     icon: Home,        label: 'בסיס',     labelEn: 'Base' },
  { href: '/attack',   icon: Sword,       label: 'תקיפה',    labelEn: 'Attack' },
  { href: '/tribe',    icon: Users,       label: 'שבט',      labelEn: 'Clan' },
  { href: '/hero',     icon: Star,        label: 'גיבור',    labelEn: 'Hero' },
  { href: '/training', icon: Dumbbell,    label: 'אימון',    labelEn: 'Train' },
  { href: '/develop',  icon: Building2,   label: 'פיתוח',    labelEn: 'Develop' },
  { href: '/shop',     icon: ShoppingBag, label: 'חנות',     labelEn: 'Shop' },
  { href: '/mine',     icon: Pickaxe,     label: 'מכרות',    labelEn: 'Mines' },
  { href: '/bank',     icon: Landmark,    label: 'בנק',      labelEn: 'Bank' },
  { href: '/history',  icon: History,     label: 'היסטוריה', labelEn: 'History' },
  { href: '/vip',      icon: Gem,         label: 'VIP',      labelEn: 'VIP' },
]

const MOBILE_NAV = ['/base', '/attack', '/tribe', '/hero', '/training']

const RACE_LABEL: Record<string, string> = {
  orc: 'אורק', human: 'אדם', elf: 'אלף', dwarf: 'גמד',
}

// ── Animated counter (moved from ResourceBar) ─────────────────────────────
function AnimatedNumber({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const prev = prevRef.current
    if (prev === value) return
    prevRef.current = value
    const diff = value - prev
    const steps = 18
    const stepSize = diff / steps
    let step = 0
    const id = setInterval(() => {
      step++
      setDisplayed(Math.round(prev + stepSize * step))
      if (step >= steps) { clearInterval(id); setDisplayed(value) }
    }, 16)
    return () => clearInterval(id)
  }, [value])

  return <span className="tabular-nums">{formatNumber(displayed, true)}</span>
}

// ── Live tick countdown (moved from ResourceBar) ──────────────────────────
function TickCountdown() {
  const [ms, setMs] = useState<number | null>(null)

  useEffect(() => {
    setMs(getTimeUntilNextTick())
    const id = setInterval(() => setMs(getTimeUntilNextTick()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="tabular-nums font-semibold text-game-gold-bright">
      {ms === null ? '--:--' : formatCountdown(ms)}
    </span>
  )
}

// ── Decorative section separator ──────────────────────────────────────────
function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-game-border/50">
      <div className="px-3 pt-2 pb-0.5 flex items-center gap-2">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-game-border-gold/50 to-transparent" />
        <span className="text-[9px] font-heading uppercase tracking-[0.18em] text-game-text-muted shrink-0">
          {label}
        </span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-game-border-gold/50 to-transparent" />
      </div>
      {children}
    </div>
  )
}

// ── Single stat row (label left, value right) ─────────────────────────────
function StatRow({
  left,
  right,
  rightClass,
}: {
  left: React.ReactNode
  right: React.ReactNode
  rightClass?: string
}) {
  return (
    <div className="flex items-center justify-between px-3 py-0.5">
      <span className="text-game-xs text-game-text-secondary font-body flex items-center gap-1.5">
        {left}
      </span>
      <span className={cn('text-game-sm font-semibold font-body tabular-nums', rightClass)}>
        {right}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname()
  const { player, resources, hero } = usePlayer()

  const cityName = player ? (BALANCE.cities.names[player.city] ?? `City ${player.city}`) : '—'
  const raceName = player ? (RACE_LABEL[player.race] ?? player.race) : '—'

  return (
    <>
      {/* ── Desktop command panel ─────────────────────── */}
      <aside
        className={cn(
          'sidebar hidden md:flex flex-col',
          'fixed top-header bottom-0 start-0 z-30',
          'w-sidebar',
          'border-e border-game-border bg-game-surface/95 backdrop-blur-game',
          'overflow-y-auto overflow-x-hidden'
        )}
      >
        {/* Brand */}
        <Link
          href="/base"
          className="flex items-center gap-2.5 px-4 py-3 border-b border-game-border hover:opacity-80 transition-opacity shrink-0"
        >
          <Crown className="size-4 text-game-gold-bright shrink-0" />
          <span className="font-display text-game-base text-game-gold-bright uppercase tracking-widest">
            Domiron
          </span>
        </Link>

        {/* Player identity */}
        <div className="px-3 py-2 border-b border-game-border/60 bg-game-elevated/25 shrink-0">
          <p className="font-display text-game-sm text-game-gold-bright truncate leading-snug">
            {player?.username ?? '…'}
          </p>
          <p className="text-[10px] text-game-text-muted font-body mt-0.5 uppercase tracking-wide">
            {raceName} · {cityName}
          </p>
        </div>

        {/* Resources */}
        <PanelSection label="Resources">
          <div className="pb-1.5 pt-0.5">
            <StatRow
              left={<><span className="text-xs leading-none">🪙</span> זהב</>}
              right={<AnimatedNumber value={resources?.gold  ?? 0} />}
              rightClass="text-res-gold"
            />
            <StatRow
              left={<><span className="text-xs leading-none">⚙️</span> ברזל</>}
              right={<AnimatedNumber value={resources?.iron  ?? 0} />}
              rightClass="text-res-iron"
            />
            <StatRow
              left={<><span className="text-xs leading-none">🪵</span> עץ</>}
              right={<AnimatedNumber value={resources?.wood  ?? 0} />}
              rightClass="text-res-wood"
            />
            <StatRow
              left={<><span className="text-xs leading-none">🌾</span> מזון</>}
              right={<AnimatedNumber value={resources?.food  ?? 0} />}
              rightClass="text-res-food"
            />
            {hero?.mana !== undefined && (
              <StatRow
                left={<><span className="text-xs leading-none">🔮</span> מאנה</>}
                right={<AnimatedNumber value={hero.mana} />}
                rightClass="text-res-mana"
              />
            )}
          </div>
        </PanelSection>

        {/* Status */}
        <PanelSection label="Status">
          <div className="pb-1.5 pt-0.5">
            <StatRow
              left={<><Zap className="size-3 text-res-turns shrink-0" /> תורות</>}
              right={
                <>
                  {player?.turns ?? 0}
                  <span className="text-game-text-muted font-normal text-game-xs">
                    /{player?.max_turns ?? 30}
                  </span>
                </>
              }
              rightClass="text-res-turns"
            />
            <StatRow
              left={<><span className="text-xs leading-none">⏱</span> טיק הבא</>}
              right={<TickCountdown />}
            />
          </div>
        </PanelSection>

        {/* Navigation */}
        <div className="flex-1 py-1 min-h-0">
          <div className="px-3 pt-2 pb-0.5 flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-game-border-gold/50 to-transparent" />
            <span className="text-[9px] font-heading uppercase tracking-[0.18em] text-game-text-muted shrink-0">
              Navigation
            </span>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-game-border-gold/50 to-transparent" />
          </div>
          <nav className="mt-1 space-y-0.5">
            {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn('nav-link', isActive && 'active')}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Logout */}
        <div className="p-3 border-t border-game-border shrink-0">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className={cn(
              'nav-link w-full text-start cursor-pointer',
              'hover:!bg-game-red/15 hover:!text-game-red-bright'
            )}
          >
            <LogOut className="size-4 shrink-0" />
            <span>יציאה</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom navigation ─────────────────── */}
      <nav
        className={cn(
          'md:hidden fixed bottom-0 start-0 end-0 z-30',
          'bg-game-surface/95 backdrop-blur-game border-t border-game-border',
          'flex items-center justify-around px-1 py-1.5'
        )}
      >
        {NAV_ITEMS.filter(i => MOBILE_NAV.includes(i.href)).map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg min-w-[52px]',
                'transition-colors duration-150',
                isActive
                  ? 'text-game-gold-bright'
                  : 'text-game-text-muted hover:text-game-text-secondary'
              )}
            >
              <Icon className={cn('size-5', isActive && 'drop-shadow-[0_0_6px_rgba(240,192,48,0.5)]')} />
              <span className="text-[9px] font-heading uppercase tracking-wide">{label}</span>
            </Link>
          )
        })}
        {/* More → settings */}
        <Link
          href="/settings"
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg min-w-[52px]',
            'transition-colors duration-150',
            pathname === '/settings' ? 'text-game-gold-bright' : 'text-game-text-muted'
          )}
        >
          <Settings className="size-5" />
          <span className="text-[9px] font-heading uppercase tracking-wide">עוד</span>
        </Link>
      </nav>
    </>
  )
}
