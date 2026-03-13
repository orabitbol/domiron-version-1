import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { HeroClient } from './HeroClient'

// Hero row comes from PlayerContext — only fetch spells and active effects here.
export const dynamic = 'force-dynamic'

export default async function HeroPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const now = new Date().toISOString()

  const { data: activeEffects } = await supabase
    .from('player_hero_effects')
    .select('id, player_id, type, starts_at, ends_at, cooldown_ends_at, metadata')
    .eq('player_id', playerId)
    .gt('cooldown_ends_at', now)  // include cooling-down effects so UI can show cooldown

  const paymentStatus =
    typeof searchParams?.payment === 'string'
      ? searchParams.payment
      : undefined

  return (
    <HeroClient
      activeEffects={activeEffects ?? []}
      paymentStatus={paymentStatus}
    />
  )
}
