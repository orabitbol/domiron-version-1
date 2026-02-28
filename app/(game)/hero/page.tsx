import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { HeroClient } from './HeroClient'

export default async function HeroPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const now = new Date().toISOString()

  const [
    { data: hero },
    { data: heroSpells },
    { data: activeEffects },
  ] = await Promise.all([
    supabase.from('hero').select('*').eq('player_id', playerId).single(),
    supabase.from('hero_spells').select('*').eq('player_id', playerId),
    // Players can read their own effects (RLS policy: player read own)
    supabase
      .from('player_hero_effects')
      .select('id, player_id, type, starts_at, ends_at, cooldown_ends_at, metadata')
      .eq('player_id', playerId)
      .gt('cooldown_ends_at', now),  // include cooling-down effects so UI can show cooldown
  ])

  if (!hero) return null

  return (
    <HeroClient
      hero={hero}
      heroSpells={heroSpells ?? []}
      activeEffects={activeEffects ?? []}
    />
  )
}
