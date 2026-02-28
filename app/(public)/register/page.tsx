'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Race } from '@/types/game'

const RACES: { value: Race; label: string; bonus: string }[] = [
  { value: 'orc',   label: 'Orc',   bonus: '+10% Attack, +3% Defense' },
  { value: 'human', label: 'Human', bonus: '+15% Gold Production, +3% Attack' },
  { value: 'elf',   label: 'Elf',   bonus: '+20% Spy & Scout Power' },
  { value: 'dwarf', label: 'Dwarf', bonus: '+15% Defense, +3% Gold Production' },
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

    // Auto-login after register
    await signIn('credentials', {
      email:    form.email,
      password: form.password,
      redirect: false,
    })

    router.push('/base')
  }

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-game-4xl text-game-gold-bright uppercase tracking-widest">
            Domiron
          </h1>
          <p className="text-game-text-secondary font-body mt-2">Join the Battle</p>
        </div>

        <div className="bg-game-surface border border-game-border-gold rounded-lg p-6 shadow-gold-glow">
          <h2 className="font-heading text-game-xl text-game-text-white uppercase tracking-wide mb-6 text-center">
            Create Account
          </h2>

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
              <label className="text-game-sm font-body text-game-text-secondary font-medium block">
                Choose Race
              </label>
              <div className="grid grid-cols-2 gap-2">
                {RACES.map((race) => (
                  <button
                    key={race.value}
                    type="button"
                    onClick={() => update('race', race.value)}
                    className={`
                      text-start p-3 rounded-lg border transition-colors duration-150 cursor-pointer
                      ${form.race === race.value
                        ? 'border-game-border-active bg-game-gold/10 text-game-text-white'
                        : 'border-game-border bg-game-elevated text-game-text-secondary hover:border-game-border-gold'
                      }
                    `}
                  >
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
              <p className="text-game-xs text-game-red-bright font-body text-center">{error}</p>
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
            <Link href="/login" className="text-game-gold hover:text-game-gold-bright transition-colors">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
