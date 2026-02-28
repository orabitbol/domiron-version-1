import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createAdminClient } from '@/lib/supabase/server'
import { SettingsClient } from './SettingsClient'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createAdminClient()
  const { data: player } = await supabase
    .from('players')
    .select('id,username,email,role,race,city,turns,max_turns,power_total,vip_until')
    .eq('id', session.user.id)
    .single()

  if (!player) return null

  return <SettingsClient player={player} />
}
