import React from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { GameLayout } from '@/components/layout/GameLayout'
import { loadPlayerData } from '@/lib/server/loadPlayerData'

export default async function GameRouteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Google user who authenticated but hasn't chosen a username yet
  if (session.user.needsSetup) redirect('/complete-profile')

  const initial = await loadPlayerData(session.user.id)
  if (!initial) redirect('/login')

  return (
    <GameLayout initial={initial}>
      {children}
    </GameLayout>
  )
}
