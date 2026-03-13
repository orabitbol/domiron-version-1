'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Race } from '@/types/game'

const RACES: { value: Race; label: string; bonus: string; image: string }[] = [
  { value: 'orc',   label: 'אורק',  bonus: '+10% תקיפה, +3% הגנה',              image: '/character/orc.png' },
  { value: 'human', label: 'אנושי', bonus: '+15% ייצור זהב, +3% תקיפה',         image: '/character/human.png' },
  { value: 'elf',   label: 'אלף',   bonus: '+20% כוח ריגול וסיור',              image: '/character/fairy.png' },
  { value: 'dwarf', label: 'גמד',   bonus: '+15% הגנה, +3% ייצור זהב',          image: '/character/dwarf.png' },
]

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    username:  '',
    email:     '',
    password:  '',
    army_name: '',
    race:      'orc' as Race,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'הרשמה נכשלה')
      setLoading(false)
      return
    }

    await signIn('credentials', {
      email:    form.email,
      password: form.password,
      redirect: false,
    })

    router.push('/base')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md animate-fade-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-game-4xl gold-gradient-text uppercase tracking-widest text-title-glow">
            Domiron
          </h1>
          <p className="text-game-text-secondary font-body mt-2">הצטרף לקרב</p>
        </div>

        <div className="panel-ornate p-6">
          <h2 className="font-heading text-game-xl text-game-gold-bright uppercase tracking-wide mb-2 text-center text-title-glow">
            יצירת חשבון
          </h2>
          <div className="divider-gold mb-6" />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="שם משתמש"
                value={form.username}
                onChange={(e) => update('username', e.target.value)}
                placeholder="שמך"
                hint="3–20 תווים אלפאנומריים"
                required
              />
              <Input
                label="שם הצבא"
                value={form.army_name}
                onChange={(e) => update('army_name', e.target.value)}
                placeholder="הלגיון הברזלי"
                required
              />
            </div>
            <Input
              label="אימייל"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="your@email.com"
              required
            />
            <Input
              label="סיסמה"
              type="password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              placeholder="מינימום 8 תווים"
              required
            />

            {/* Race selection */}
            <div className="space-y-2">
              <label className="text-game-sm font-heading text-game-text-secondary font-semibold uppercase tracking-wider block">
                בחר גזע
              </label>
              <div className="grid grid-cols-2 gap-3">
                {RACES.map((race) => (
                  <button
                    key={race.value}
                    type="button"
                    onClick={() => update('race', race.value)}
                    className={cn(
                      'relative text-center p-3 rounded-game-lg border transition-all duration-200 cursor-pointer overflow-hidden',
                      form.race === race.value
                        ? 'border-game-gold-bright bg-gradient-to-b from-game-gold/15 to-game-gold/5 text-game-text-white shadow-gold-glow scale-[1.02]'
                        : 'border-game-border bg-game-elevated/50 text-game-text-secondary hover:border-game-border-gold hover:bg-game-elevated'
                    )}
                  >
                    <div className={cn(
                      'relative w-16 h-16 mx-auto mb-2 rounded-full overflow-hidden border-2 transition-all',
                      form.race === race.value
                        ? 'border-game-gold shadow-gold-glow-sm'
                        : 'border-game-border/50'
                    )}>
                      <Image
                        src={race.image}
                        alt={race.label}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    </div>
                    <div className="font-heading text-game-sm uppercase tracking-wide">
                      {race.label}
                    </div>
                    <div className="text-game-xs font-body text-game-text-muted mt-0.5">
                      {race.bonus}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-game-xs text-game-red-bright font-body text-center bg-game-red/10 border border-game-red/20 rounded-game px-3 py-2">{error}</p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-2"
            >
              התחל את כיבושך
            </Button>
          </form>

          {/* Google sign-up */}
          <div className="flex items-center gap-3 mt-4">
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
            הירשם עם Google
          </button>

          <p className="text-center text-game-sm text-game-text-secondary font-body mt-2">
            כבר יש לך חשבון?{' '}
            <Link href="/login" className="text-game-gold-bright hover:text-game-gold transition-colors font-semibold">
              התחבר
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
