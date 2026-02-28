'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { ResourceBar } from '@/components/game/ResourceBar'
import { ToastProvider } from '@/components/game/ToastSystem'
import { ConnectionStatus } from './ConnectionStatus'
import { PageTransition } from './PageTransition'
import { PlayerProvider } from '@/lib/context/PlayerContext'
import type { PlayerData } from '@/types/game'

// GameContent renders the shell — ResourceBar and Sidebar source their own
// data directly from PlayerContext, so no props need threading through here.
function GameContent({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ResourceBar />
      <ConnectionStatus />
      <Sidebar />

      {/* Main content — offset for fixed header + sidebar */}
      <main
        className={cn(
          'pt-header',
          'md:ps-sidebar',
          'pb-20 md:pb-0',
          'min-h-screen'
        )}
      >
        <div className="max-w-content mx-auto px-3 md:px-6 py-5">
          {/* Glass panel */}
          <div className="glass-panel p-4 md:p-6 min-h-[calc(100vh-5.5rem)]">
            <PageTransition>
              {children}
            </PageTransition>
          </div>
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
