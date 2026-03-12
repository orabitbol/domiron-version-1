import React from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/options'
import AdminNav from '@/components/admin/AdminNav'
import AdminHeader from '@/components/admin/AdminHeader'

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Defense in depth — middleware already guards this, but double-check server-side
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/admin/login')
  }

  if (session.user.role !== 'admin') {
    redirect('/admin/login?reason=forbidden')
  }

  return (
    <div dir="ltr" className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <AdminNav />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader
          username={session.user.name ?? 'Admin'}
          email={session.user.email ?? ''}
        />
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
