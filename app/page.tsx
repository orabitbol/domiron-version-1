import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'

// Root page: authenticated → /base, guests → /landing
export default async function RootPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/base')
  redirect('/landing')
}
