'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn, signOut, getSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'

export default function AdminLoginPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const callbackUrl = searchParams.get('callbackUrl') ?? '/admin'
  const reason      = searchParams.get('reason')

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  // Pre-fill error from ?reason param
  useEffect(() => {
    if (reason === 'forbidden') {
      setError('Your account does not have admin privileges.')
    }
  }, [reason])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (!result || result.error) {
        setError('Invalid email or password.')
        setLoading(false)
        return
      }

      // signIn succeeded — check the role from the session
      const session = await getSession()

      if (session?.user?.role === 'admin') {
        router.push(callbackUrl)
        router.refresh()
      } else {
        // Signed in but not an admin — sign them back out
        await signOut({ redirect: false })
        setError('This account does not have admin access.')
        setLoading(false)
      }
    } catch (err) {
      console.error('[AdminLogin] Unexpected error:', err)
      setError('An unexpected error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div dir="ltr" className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-indigo-600/20 border border-indigo-500/30 mb-4">
            <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-100 tracking-wide uppercase">
            Domiron Admin
          </h1>
          <p className="text-sm text-slate-500 mt-1">Administration Console</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 shadow-xl">
          {/* Reason / Error banner */}
          {error && (
            <div className="mb-4 p-3 rounded bg-red-950/60 border border-red-800/60 text-red-300 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-email"
                className="text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Email Address
              </label>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="admin@example.com"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 placeholder:text-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="admin-password"
                className="text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                Password
              </label>
              <input
                id="admin-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 placeholder:text-slate-600 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 border-indigo-700 from-indigo-500 via-indigo-600 to-indigo-700 text-white mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>

          {/* Note */}
          <p className="mt-4 text-xs text-slate-600 text-center">
            Admin accounts are identified by email address.
          </p>
        </div>

        {/* Back link */}
        <p className="text-center mt-4">
          <a href="/login" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
            ← Back to game login
          </a>
        </p>
      </div>
    </div>
  )
}
