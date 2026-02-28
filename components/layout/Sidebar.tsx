'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  Home, Sword, Users, Star, Dumbbell, Building2,
  ShoppingBag, Pickaxe, Landmark, History, LogOut,
  Trophy, Map, Settings, Gem, Crown,
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/base',     icon: Home,        label: 'בסיס',      labelEn: 'Base' },
  { href: '/attack',   icon: Sword,       label: 'תקיפה',     labelEn: 'Attack' },
  { href: '/tribe',    icon: Users,       label: 'שבט',       labelEn: 'Clan' },
  { href: '/hero',     icon: Star,        label: 'גיבור',     labelEn: 'Hero' },
  { href: '/training', icon: Dumbbell,    label: 'אימון',     labelEn: 'Train' },
  { href: '/develop',  icon: Building2,   label: 'פיתוח',     labelEn: 'Develop' },
  { href: '/shop',     icon: ShoppingBag, label: 'חנות',      labelEn: 'Shop' },
  { href: '/mine',     icon: Pickaxe,     label: 'מכרות',     labelEn: 'Mines' },
  { href: '/bank',     icon: Landmark,    label: 'בנק',       labelEn: 'Bank' },
  { href: '/map',      icon: Map,         label: 'מפה',       labelEn: 'Map' },
  { href: '/rankings', icon: Trophy,      label: 'דירוג',     labelEn: 'Rankings' },
  { href: '/history',  icon: History,     label: 'היסטוריה',  labelEn: 'History' },
  { href: '/settings', icon: Settings,    label: 'הגדרות',    labelEn: 'Settings' },
  { href: '/vip',      icon: Gem,         label: 'VIP',       labelEn: 'VIP' },
]

// Items shown in the mobile bottom nav (the 5 most important)
const MOBILE_NAV = ['/base', '/attack', '/tribe', '/hero', '/training']

export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────── */}
      <aside
        className={cn(
          'sidebar hidden md:flex flex-col',
          'fixed top-header bottom-0 start-0 z-30',
          'w-sidebar',
          'border-e border-game-border bg-game-surface/95 backdrop-blur-game',
          'overflow-y-auto overflow-x-hidden'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'px-4 py-4 border-b border-game-border',
          'flex items-center gap-2.5'
        )}>
          <Crown className="size-5 text-game-gold-bright shrink-0" />
          <span className="font-display text-game-lg text-game-gold-bright uppercase tracking-widest">
            Domiron
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 space-y-0.5">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'nav-link',
                  isActive && 'active'
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Divider + Logout */}
        <div className="p-3 border-t border-game-border">
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
        {/* More button → opens full nav (simplified: just links to settings) */}
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
