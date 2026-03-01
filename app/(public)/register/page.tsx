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
  { value: 'orc',   label: 'Orc',   bonus: '+10% Attack, +3% Defense',          image: '/character/orc.png' },
  { value: 'human', label: 'Human', bonus: '+15% Gold Production, +3% Attack',  image: '/character/human.png' },
  { value: 'elf',   label: 'Elf',   bonus: '+20% Spy & Scout Power',            image: '/character/fairy.png' },
  { value: 'dwarf', label: 'Dwarf', bonus: '+15% Defense, +3% Gold Production', image: '/character/dwarf.png' },
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
      setError(data.error ?? 'Registration failed')
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
          <p className="text-game-text-secondary font-body mt-2">Join the Battle</p>
        </div>

        <div className="panel-ornate p-6">
          <h2 className="font-heading text-game-xl text-game-gold-bright uppercase tracking-wide mb-2 text-center text-title-glow">
            Create Account
          </h2>
          <div className="divider-gold mb-6" />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Username"
                value={form.username}
                onChange={(e) => update('username', e.target.value)}
                placeholder="YourName"
                hint="3–20 alphanumeric chars"
                required
              />
              <Input
                label="Army Name"
                value={form.army_name}
                onChange={(e) => update('army_name', e.target.value)}
                placeholder="The Iron Legion"
                required
              />
            </div>
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="your@email.com"
              required
            />
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              placeholder="Min 8 characters"
              required
            />

            {/* Race selection */}
            <div className="space-y-2">
              <label className="text-game-sm font-heading text-game-text-secondary font-semibold uppercase tracking-wider block">
                Choose Race
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
              Begin Your Conquest
            </Button>
          </form>

          <p className="text-center text-game-sm text-game-text-secondary font-body mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-game-gold-bright hover:text-game-gold transition-colors font-semibold">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
