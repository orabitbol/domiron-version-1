import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { createClient } from '@/lib/supabase/server'
import { HistoryClient } from './HistoryClient'

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { tab?: string; page?: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const supabase = createClient()
  const playerId = session.user.id

  const tab = searchParams.tab ?? 'outgoing'
  const page = Math.max(1, parseInt(searchParams.page ?? '1') || 1)
  const PAGE_SIZE = 15
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // Fetch outgoing attacks
  const { data: outgoingAttacks, count: outgoingCount } = await supabase
    .from('attacks')
    .select('*, defender:players!attacks_defender_id_fkey(army_name, username)', { count: 'exact' })
    .eq('attacker_id', playerId)
    .order('created_at', { ascending: false })
    .range(from, to)

  // Fetch incoming attacks
  const { data: incomingAttacks, count: incomingCount } = await supabase
    .from('attacks')
    .select('*, attacker:players!attacks_attacker_id_fkey(army_name, username)', { count: 'exact' })
    .eq('defender_id', playerId)
    .order('created_at', { ascending: false })
    .range(from, to)

  // Fetch spy history
  const { data: spyHistory, count: spyCount } = await supabase
    .from('spy_history')
    .select('*, target:players!spy_history_target_id_fkey(army_name)', { count: 'exact' })
    .eq('spy_owner_id', playerId)
    .order('created_at', { ascending: false })
    .range(from, to)

  return (
    <HistoryClient
      outgoingAttacks={outgoingAttacks ?? []}
      incomingAttacks={incomingAttacks ?? []}
      spyHistory={spyHistory ?? []}
      outgoingCount={outgoingCount ?? 0}
      incomingCount={incomingCount ?? 0}
      spyCount={spyCount ?? 0}
      currentPage={page}
      pageSize={PAGE_SIZE}
      initialTab={tab}
    />
  )
}
