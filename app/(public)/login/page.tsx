'use client'

import React, { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
    const result = await signIn('credentials', { email, password, redirect: false })
    setLoading(false)
    if (result?.error) setError('אימייל או סיסמה שגויים')
    else router.push('/base')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" dir="rtl">

      {/* Stars / glow background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(201,144,26,0.06)_0%,transparent_60%)]" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className={cn(
              'size-20 rounded-2xl flex items-center justify-center text-4xl',
              'bg-gradient-to-br from-game-gold/15 to-transparent',
              'border border-game-gold/30 shadow-gold-glow',
              'animate-float'
            )}>
              ⚔️
            </div>
          </div>
          <h1 className="font-display text-game-4xl gold-gradient-text uppercase tracking-widest">
            Domiron
          </h1>
          <p className="text-game-text-secondary font-body mt-2 text-game-sm">
            הכנס למשחק והמשך את כיבושך
          </p>
        </div>

        {/* Card */}
        <div className={cn(
          'rounded-game-xl p-6 space-y-5',
          'bg-game-surface/80 backdrop-blur-game',
          'border border-game-border-gold/40 shadow-panel'
        )}>
          <h2 className="font-heading text-game-base text-game-text-white uppercase tracking-wider text-center">
            כניסה לחשבון
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="אימייל"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
            />
            <Input
              label="סיסמה"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <p className="text-game-xs text-game-red-bright font-body text-center bg-game-red/10 border border-game-red/20 rounded-game px-3 py-2">
                ❌ {error}
              </p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full"
            >
              כנס למשחק ⚔️
            </Button>
          </form>

          <div className="text-center">
            <p className="text-game-sm text-game-text-secondary font-body">
              אין לך חשבון?{' '}
              <Link href="/register" className="text-game-gold-bright hover:text-game-gold transition-colors font-semibold">
                הירשם עכשיו
              </Link>
            </p>
          </div>

          <div className="divider-gold" />

          <p className="text-center text-game-xs text-game-text-muted font-body">
            בכניסה הינך מסכים ל
            <Link href="#" className="text-game-gold hover:underline mx-1">תנאי השימוש</Link>
            ול
            <Link href="#" className="text-game-gold hover:underline mx-1">מדיניות הפרטיות</Link>
          </p>
        </div>

        <div className="mt-4 text-center">
          <Link href="/landing" className="text-game-xs text-game-text-muted hover:text-game-text transition-colors font-body">
            ← חזרה לדף הבית
          </Link>
        </div>

      </div>
    </div>
  )
}
