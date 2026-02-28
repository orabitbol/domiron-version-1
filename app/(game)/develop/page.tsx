import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { DevelopClient } from './DevelopClient'

export default async function DevelopPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const [
    { data: player },
    { data: development },
    { data: resources },
    { data: army },
  ] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).single(),
    supabase.from('development').select('*').eq('player_id', playerId).single(),
    supabase.from('resources').select('*').eq('player_id', playerId).single(),
    supabase.from('army').select('*').eq('player_id', playerId).single(),
  ])

  if (!player || !development || !resources || !army) return null

  return (
    <DevelopClient
      player={player}
      development={development}
      resources={resources}
      army={army}
    />
  )
}
