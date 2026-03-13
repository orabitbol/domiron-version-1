import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import { CompleteProfileClient } from './CompleteProfileClient'

export const dynamic = 'force-dynamic'

export default async function CompleteProfilePage() {
  const session = await getServerSession(authOptions)

  if (!session) redirect('/login')

  // Fully set-up users should not see this page
  if (!session.user.needsSetup) redirect('/base')

  return <CompleteProfileClient email={session.user.email} />
}
