'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const USERNAME_RE = /^[\u0590-\u05FFa-zA-Z0-9]+$/

interface Props {
  email: string
}

export function CompleteProfileClient({ email }: Props) {
  const router    = useRouter()
  const { update } = useSession()

  const [username,  setUsername]  = useState('')
  const [checking,  setChecking]  = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function formatOk(value: string) {
    return value.length >= 3 && value.length <= 20 && USERNAME_RE.test(value)
  }

  async function checkAvailability(value: string) {
    if (!formatOk(value)) {
      setAvailable(null)
      return
    }
    setChecking(true)
    try {
      const res  = await fetch(`/api/auth/check-username?username=${encodeURIComponent(value)}`)
      const data = await res.json() as { available: boolean }
      setAvailable(data.available)
    } catch {
      setAvailable(null)
    } finally {
      setChecking(false)
    }
  }

  function handleUsernameChange(value: string) {
    setUsername(value)
    setAvailable(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => checkAvailability(value), 350)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (available !== true || !formatOk(username)) return
    setError('')
    setLoading(true)

    try {
      const res  = await fetch('/api/auth/complete-google-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }

      if (!res.ok) {
        setError(data.error ?? 'שגיאה, נסה שנית')
        // If the username was just taken by a race condition, reset availability
        if (res.status === 409) setAvailable(false)
        return
      }

      // Refresh JWT to pick up the new player ID and clear needsSetup
      await update()
      router.push('/base')
    } catch {
      setError('שגיאת רשת — נסה שנית')
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = formatOk(username) && available === true && !loading

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
              'animate-float',
            )}>
              ⚔️
            </div>
          </div>
          <h1 className="font-display text-game-4xl gold-gradient-text uppercase tracking-widest text-title-glow">
            Domiron
          </h1>
          <p className="text-game-text-secondary font-body mt-2 text-game-sm">
            רק עוד צעד אחד
          </p>
        </div>

        {/* Card */}
        <div className="panel-ornate p-6 space-y-5">
          <h2 className="font-heading text-game-base text-game-gold-bright uppercase tracking-wider text-center text-title-glow">
            בחר שם קרב
          </h2>
          <div className="divider-gold" />

          <p className="text-game-sm text-game-text-secondary font-body text-center leading-relaxed">
            שם הקרב שלך יוצג לכל שחקני Domiron.
            <br />
            בחר בחכמה — זוהי הזהות שלך בקרב.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                label="שם קרב"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="הכנס שם ייחודי"
                hint="3–20 תווים (עברית, אנגלית או מספרים)"
                maxLength={20}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />

              {/* Live availability feedback */}
              {username.length > 0 && (
                <div className="mt-1.5 text-game-xs font-body ps-1">
                  {checking && (
                    <span className="text-game-text-muted">בודק זמינות...</span>
                  )}
                  {!checking && available === true && (
                    <span className="text-game-green-bright">✓ השם זמין</span>
                  )}
                  {!checking && available === false && (
                    <span className="text-game-red-bright">✗ השם כבר תפוס — בחר שם אחר</span>
                  )}
                  {!checking && available === null && username.length > 0 && !formatOk(username) && (
                    <span className="text-game-text-muted">עברית, אנגלית או מספרים — 3–20 תווים</span>
                  )}
                </div>
              )}
            </div>

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
              disabled={!canSubmit}
              className="w-full"
            >
              כנס לקרב ⚔️
            </Button>
          </form>

          <p className="text-center text-game-xs text-game-text-muted font-body">
            מחובר כ-{email}
          </p>
        </div>

      </div>
    </div>
  )
}
