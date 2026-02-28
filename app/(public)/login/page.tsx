'use client'

import React, { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('Invalid email or password')
    } else {
      router.push('/base')
    }
  }

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-game-4xl text-game-gold-bright uppercase tracking-widest">
            Domiron
          </h1>
          <p className="text-game-text-secondary font-body mt-2">
            Real-time Multiplayer Strategy
          </p>
        </div>

        {/* Login card */}
        <div className="bg-game-surface border border-game-border-gold rounded-lg p-6 shadow-gold-glow">
          <h2 className="font-heading text-game-xl text-game-text-white uppercase tracking-wide mb-6 text-center">
            Login
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <p className="text-game-xs text-game-red-bright font-body text-center">{error}</p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-2"
            >
              Enter the Battle
            </Button>
          </form>

          <p className="text-center text-game-sm text-game-text-secondary font-body mt-4">
            No account?{' '}
            <Link href="/register" className="text-game-gold hover:text-game-gold-bright transition-colors">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
