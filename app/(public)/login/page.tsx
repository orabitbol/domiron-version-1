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
      <div className="relative w-full max-w-sm animate-fade-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className={cn(
              'size-20 rounded-game-xl flex items-center justify-center text-4xl',
              'bg-gradient-to-br from-game-gold/20 to-game-gold/5',
              'border border-game-gold/30 shadow-gold-glow',
              'animate-float'
            )}>
              ⚔️
            </div>
          </div>
          <h1 className="font-display text-game-4xl gold-gradient-text uppercase tracking-widest text-title-glow">
            Domiron
          </h1>
          <p className="text-game-text-secondary font-body mt-2 text-game-sm">
            הכנס למשחק והמשך את כיבושך
          </p>
        </div>

        {/* Card */}
        <div className="panel-ornate p-6 space-y-5">
          <h2 className="font-heading text-game-base text-game-gold-bright uppercase tracking-wider text-center text-title-glow">
            כניסה לחשבון
          </h2>
          <div className="divider-gold" />

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

          {/* Google sign-in */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-game-border" />
            <span className="text-game-xs text-game-text-muted font-body shrink-0">או</span>
            <div className="flex-1 h-px bg-game-border" />
          </div>

          <button
            type="button"
            onClick={() => signIn('google', { callbackUrl: '/base' })}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-game border border-game-border bg-game-elevated hover:bg-game-elevated/80 hover:border-game-border-gold/40 transition-all duration-200 font-heading text-game-sm text-game-text-secondary tracking-wide"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            המשך עם Google
          </button>

          <div className="divider-ornate" />

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
