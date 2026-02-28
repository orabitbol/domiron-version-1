import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { TrainingClient } from './TrainingClient'

export default async function TrainingPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const [
    { data: player },
    { data: army },
    { data: training },
    { data: resources },
  ] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).single(),
    supabase.from('army').select('*').eq('player_id', playerId).single(),
    supabase.from('training').select('*').eq('player_id', playerId).single(),
    supabase.from('resources').select('*').eq('player_id', playerId).single(),
  ])

  if (!player || !army || !training || !resources) return null

  return (
    <TrainingClient
      player={player}
      army={army}
      training={training}
      resources={resources}
    />
  )
}
