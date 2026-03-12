import React from 'react'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { loadPlayerData } from '@/lib/server/loadPlayerData'
import { GameLayout } from '@/components/layout/GameLayout'
import { Crown, ChevronLeft, LogIn, Trophy, Sword, Gift, BookOpen } from 'lucide-react'

/**
 * Hybrid layout for public-facing pages (Rankings, Hall of Fame, Prizes).
 *
 * Auth users  → full game shell (sidebar + ResourceBar), same experience
 *               as any other game page.
 * Public users → minimal leaderboard shell with sub-nav and Play CTA.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  // ── Authenticated: render inside the normal game shell ──────────────────────
  if (session) {
    const initial = await loadPlayerData(session.user.id)
    if (initial) {
      return <GameLayout initial={initial}>{children}</GameLayout>
    }
    // Player row not found (edge case) → fall through to public shell below
  }

  // ── Unauthenticated: minimal public leaderboard shell ───────────────────────
  return (
    <div className="min-h-screen bg-game-bg">

      {/* Public header */}
      <header
        className={[
          'fixed top-0 start-0 end-0 z-40',
          'h-header flex items-center px-4 md:px-6 gap-3',
          'bg-gradient-to-b from-game-surface/97 to-game-surface/90',
          'backdrop-blur-game border-b border-game-border-gold/30',
          'shadow-[0_2px_24px_rgba(0,0,0,0.65),inset_0_-1px_0_rgba(201,144,26,0.08)]',
        ].join(' ')}
      >
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity"
        >
          <Crown className="size-4 text-game-gold-bright drop-shadow-[0_0_6px_rgba(240,192,48,0.4)]" />
          <span className="font-display text-game-sm text-game-gold-bright uppercase tracking-widest text-title-glow">
            Domiron
          </span>
        </Link>

        {/* Sub-nav */}
        <nav className="flex items-center gap-1 ms-3">
          {[
            { href: '/rankings',   Icon: Sword,     label: 'דירוגים'      },
            { href: '/halloffame', Icon: Trophy,    label: 'היכל התהילה'  },
            { href: '/prizes',     Icon: Gift,      label: 'פרסים'        },
            { href: '/guide',      Icon: BookOpen,  label: 'מדריך'        },
          ].map(({ href, Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-game',
                'font-heading text-[10px] uppercase tracking-wide border border-transparent',
                'text-game-text-secondary hover:text-game-text hover:bg-game-elevated/50',
                'transition-all duration-150',
              ].join(' ')}
            >
              <Icon className="size-3 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Play CTA */}
        <Link
          href="/login"
          className={[
            'flex items-center gap-1.5 px-3 py-1.5 rounded-game shrink-0',
            'font-heading text-[10px] uppercase tracking-wide',
            'text-game-gold border border-game-border-gold/40',
            'hover:bg-game-gold/10 transition-all',
          ].join(' ')}
        >
          <LogIn className="size-3.5" />
          שחק
        </Link>
      </header>

      {/* Page content */}
      <main className="pt-header">
        <div className="max-w-content mx-auto px-4 md:px-8 py-6">
          <div className="glass-panel p-5 md:p-8 min-h-[calc(100vh-7rem)]">
            {children}
          </div>
        </div>
      </main>

    </div>
  )
}
