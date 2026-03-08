import React from 'react'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { Crown, ChevronLeft, LogIn, Trophy, Sword, Gift } from 'lucide-react'

export default async function LeaderboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  return (
    <div className="min-h-screen bg-game-bg">
      {/* ── Minimal public header ── */}
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
          href={session ? '/base' : '/'}
          className="flex items-center gap-1.5 shrink-0 hover:opacity-80 transition-opacity"
        >
          <Crown className="size-4 text-game-gold-bright drop-shadow-[0_0_6px_rgba(240,192,48,0.4)]" />
          <span className="font-display text-game-sm text-game-gold-bright uppercase tracking-widest text-title-glow">
            Domiron
          </span>
        </Link>

        {/* Sub-nav: Rankings | Hall of Fame */}
        <nav className="flex items-center gap-1 ms-3">
          <Link
            href="/rankings"
            className={[
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-game',
              'font-heading text-[10px] uppercase tracking-wide border',
              'transition-all duration-150',
              'text-game-text-secondary hover:text-game-text hover:bg-game-elevated/50 border-transparent',
            ].join(' ')}
          >
            <Sword className="size-3 shrink-0" />
            <span className="hidden sm:inline">Rankings</span>
          </Link>
          <Link
            href="/halloffame"
            className={[
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-game',
              'font-heading text-[10px] uppercase tracking-wide border',
              'transition-all duration-150',
              'text-game-text-secondary hover:text-game-text hover:bg-game-elevated/50 border-transparent',
            ].join(' ')}
          >
            <Trophy className="size-3 shrink-0" />
            <span className="hidden sm:inline">Hall of Fame</span>
          </Link>
          <Link
            href="/prizes"
            className={[
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-game',
              'font-heading text-[10px] uppercase tracking-wide border',
              'transition-all duration-150',
              'text-game-gold hover:text-game-gold-bright hover:bg-game-gold/8 border-transparent',
            ].join(' ')}
          >
            <Gift className="size-3 shrink-0" />
            <span className="hidden sm:inline">Prizes</span>
          </Link>
        </nav>

        <div className="flex-1" />

        {/* CTA — logged-in: back to game | logged-out: play */}
        {session ? (
          <Link
            href="/base"
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-game shrink-0',
              'font-heading text-[10px] uppercase tracking-wide',
              'text-game-gold border border-game-border-gold/40',
              'hover:bg-game-gold/10 transition-all',
            ].join(' ')}
          >
            <ChevronLeft className="size-3.5" />
            Back to Game
          </Link>
        ) : (
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
            Play
          </Link>
        )}
      </header>

      {/* ── Page content ── */}
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
