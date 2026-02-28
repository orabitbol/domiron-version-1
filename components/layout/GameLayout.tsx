'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { ResourceBar } from '@/components/game/ResourceBar'
import { ToastProvider } from '@/components/game/ToastSystem'
import { PlayerProvider, usePlayer } from '@/lib/context/PlayerContext'
import type { PlayerData } from '@/types/game'

function GameContent({ children }: { children: React.ReactNode }) {
  const { player, resources, hero } = usePlayer()

  return (
    <>
      <ResourceBar
        gold={resources?.gold ?? 0}
        iron={resources?.iron ?? 0}
        wood={resources?.wood ?? 0}
        food={resources?.food ?? 0}
        turns={player?.turns ?? 0}
        maxTurns={player?.max_turns ?? 30}
        mana={hero?.mana}
      />
      <Sidebar />
      <main
        className={cn(
          'pt-header',
          'md:ps-sidebar',
          'pb-16 md:pb-0',
          'min-h-screen'
        )}
      >
        <div className="max-w-content mx-auto px-4 py-6 animate-fade-in">
          {children}
        </div>
      </main>
    </>
  )
}

interface GameLayoutProps {
  children: React.ReactNode
  initial: PlayerData
}

export function GameLayout({ children, initial }: GameLayoutProps) {
  return (
    <ToastProvider>
      <PlayerProvider initial={initial}>
        <GameContent>{children}</GameContent>
      </PlayerProvider>
    </ToastProvider>
  )
}
