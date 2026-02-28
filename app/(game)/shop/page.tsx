import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { ShopClient } from './ShopClient'

export default async function ShopPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const [
    { data: weapons },
    { data: resources },
  ] = await Promise.all([
    supabase.from('weapons').select('*').eq('player_id', playerId).single(),
    supabase.from('resources').select('*').eq('player_id', playerId).single(),
  ])

  if (!weapons || !resources) return null

  return <ShopClient weapons={weapons} resources={resources} />
}
