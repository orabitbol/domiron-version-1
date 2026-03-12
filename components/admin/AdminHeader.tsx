'use client'

import React from 'react'
import { signOut } from 'next-auth/react'

interface AdminHeaderProps {
  username: string
  email:    string
}

export default function AdminHeader({ username, email }: AdminHeaderProps) {
  function handleSignOut() {
    signOut({ callbackUrl: '/admin/login' })
  }

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900 flex items-center justify-between px-6 shrink-0">
      {/* Left */}
      <span className="text-sm font-semibold text-slate-300 tracking-wide">
        Domiron Admin Console
      </span>

      {/* Right */}
      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-sm text-slate-200 leading-none">{username}</p>
          <p className="text-xs text-slate-500 mt-0.5">{email}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded border border-slate-700 hover:border-red-800"
        >
          Sign Out
        </button>
      </div>
    </header>
  )
}
