import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'

// Root page: redirect authenticated users to /base, others to /login
export default async function RootPage() {
  const session = await getServerSession(authOptions)

  if (session) {
    redirect('/base')
  } else {
    redirect('/login')
  }
}
