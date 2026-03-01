import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { MineClient } from './MineClient'

export default async function MinePage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const [
    { data: player },
    { data: army },
    { data: development },
  ] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).single(),
    supabase.from('army').select('*').eq('player_id', playerId).single(),
    supabase.from('development').select('*').eq('player_id', playerId).single(),
  ])

  if (!player || !army || !development) return null

  return <MineClient player={player} army={army} development={development} />
}
