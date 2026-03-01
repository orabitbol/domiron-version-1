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

  // Ensure assignment fields are numbers (schema: INT NOT NULL DEFAULT 0); avoids NaN when DB returns null
  const armyForClient = {
    ...army,
    slaves_gold: typeof army.slaves_gold === 'number' ? army.slaves_gold : 0,
    slaves_iron: typeof army.slaves_iron === 'number' ? army.slaves_iron : 0,
    slaves_wood: typeof army.slaves_wood === 'number' ? army.slaves_wood : 0,
    slaves_food: typeof army.slaves_food === 'number' ? army.slaves_food : 0,
  }

  return <MineClient player={player} army={armyForClient} development={development} />
}
