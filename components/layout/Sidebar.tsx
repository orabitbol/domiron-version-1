'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  Home, Sword, Users, Star, Dumbbell, Building2, ShoppingBag,
  Pickaxe, Landmark, History, LogOut
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/base',     icon: Home,        label: 'Base' },
  { href: '/attack',   icon: Sword,       label: 'Attack' },
  { href: '/tribe',    icon: Users,       label: 'Tribe' },
  { href: '/hero',     icon: Star,        label: 'Hero' },
  { href: '/training', icon: Dumbbell,    label: 'Training' },
  { href: '/develop',  icon: Building2,   label: 'Development' },
  { href: '/shop',     icon: ShoppingBag, label: 'Shop' },
  { href: '/mine',     icon: Pickaxe,     label: 'Mine & Fields' },
  { href: '/bank',     icon: Landmark,    label: 'Bank' },
  { href: '/history',  icon: History,     label: 'History' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sidebar hidden md:flex flex-col',
          'fixed top-header bottom-0 start-0 z-30',
          'w-sidebar border-e border-game-border bg-game-surface',
          'overflow-y-auto'
        )}
      >
        {/* Logo */}
        <div className="px-4 py-5 border-b border-game-border">
          <span className="font-display text-game-xl text-game-gold-bright uppercase tracking-wider">
            Domiron
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md',
                  'text-game-sm font-heading uppercase tracking-wide',
                  'transition-colors duration-150',
                  isActive
                    ? 'bg-game-gold/20 text-game-gold-bright border border-game-border-gold'
                    : 'text-game-text-secondary hover:bg-game-elevated hover:text-game-text'
                )}
              >
                <Icon className="size-5 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-game-border">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className={cn(
              'flex items-center gap-3 px-4 py-2.5 w-full rounded-md',
              'text-game-sm font-heading uppercase tracking-wide',
              'text-game-text-secondary hover:bg-game-red/20 hover:text-game-red-bright',
              'transition-colors duration-150 cursor-pointer'
            )}
          >
            <LogOut className="size-5 shrink-0" />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile bottom navigation */}
      <nav
        className={cn(
          'md:hidden fixed bottom-0 start-0 end-0 z-30',
          'bg-game-surface border-t border-game-border',
          'flex items-center justify-around px-2 py-2',
          'safe-area-bottom'
        )}
      >
        {NAV_ITEMS.slice(0, 5).map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 px-2 py-1.5 rounded-md min-w-[44px]',
                'transition-colors duration-150',
                isActive ? 'text-game-gold-bright' : 'text-game-text-muted'
              )}
            >
              <Icon className="size-5" />
              <span className="text-[10px] font-heading uppercase tracking-wide">{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
