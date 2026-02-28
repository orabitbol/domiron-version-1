import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { BankClient } from './BankClient'

export default async function BankPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const [
    { data: bank },
    { data: resources },
  ] = await Promise.all([
    supabase.from('bank').select('*').eq('player_id', playerId).single(),
    supabase.from('resources').select('*').eq('player_id', playerId).single(),
  ])

  if (!bank || !resources) return null

  return <BankClient bank={bank} resources={resources} />
}
