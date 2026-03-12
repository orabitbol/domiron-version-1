'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { ResourceBar } from '@/components/game/ResourceBar'
import { ToastProvider } from '@/components/game/ToastSystem'
import { ConnectionStatus } from './ConnectionStatus'
import { PageTransition } from './PageTransition'
import { PlayerProvider } from '@/lib/context/PlayerContext'
import { TickProvider } from '@/lib/context/TickContext'
import { FreezeModeBanner } from '@/components/game/FreezeModeBanner'
import { RealtimeSync } from './RealtimeSync'
import { OnboardingProvider } from '@/components/onboarding/OnboardingProvider'
import { OnboardingTour } from '@/components/onboarding/OnboardingTour'
import type { PlayerData } from '@/types/game'

function GameContent({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RealtimeSync />
      <ResourceBar />
      <FreezeModeBanner />
      <ConnectionStatus />
      <Sidebar />

      <main
        className={cn(
          'pt-header',
          'md:ps-[272px]',
          'pb-24 md:pb-0',
          'min-h-screen',
          'overflow-x-hidden'
        )}
      >
        <div className="max-w-content mx-auto px-3 sm:px-4 md:px-8 py-4 sm:py-6">
          <div className="glass-panel p-4 sm:p-5 md:p-8 min-h-[calc(100vh-7rem)]">
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
        <TickProvider>
          <OnboardingProvider>
            <GameContent>{children}</GameContent>
            {/* OnboardingTour uses createPortal — renders to document.body above all game UI */}
            <OnboardingTour />
          </OnboardingProvider>
        </TickProvider>
      </PlayerProvider>
    </ToastProvider>
  )
}
