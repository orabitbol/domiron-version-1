import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { HeroClient } from './HeroClient'

export default async function HeroPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const [
    { data: hero },
    { data: heroSpells },
  ] = await Promise.all([
    supabase.from('hero').select('*').eq('player_id', playerId).single(),
    supabase.from('hero_spells').select('*').eq('player_id', playerId),
  ])

  if (!hero) return null

  return <HeroClient hero={hero} heroSpells={heroSpells ?? []} />
}
