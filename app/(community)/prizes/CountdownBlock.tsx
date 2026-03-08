'use client'

import { useState, useEffect } from 'react'

function formatMs(ms: number): string {
  if (ms <= 0) return 'Season Ended'
  const s   = Math.floor(ms / 1000)
  const d   = Math.floor(s / 86400)
  const h   = Math.floor((s % 86400) / 3600)
  const m   = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const hh  = String(h).padStart(2, '0')
  const mm  = String(m).padStart(2, '0')
  const ss  = String(sec).padStart(2, '0')
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`
}

export function SeasonCountdownBlock({ endsAt }: { endsAt: string | null }) {
  const [display, setDisplay] = useState<string | null>(null)

  useEffect(() => {
    if (!endsAt) {
      setDisplay('—')
      return
    }
    function update() {
      setDisplay(formatMs(new Date(endsAt!).getTime() - Date.now()))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [endsAt])

  if (display === null) return null

  const isEnded = display === 'Season Ended'

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid rgba(201,144,26,0.25)',
        borderTop: '1px solid rgba(201,144,26,0.5)',
        background: 'linear-gradient(150deg, rgba(20,14,5,0.99) 0%, rgba(10,6,2,1) 100%)',
        boxShadow:
          '0 6px 40px rgba(0,0,0,0.65), 0 0 80px rgba(240,192,48,0.04), inset 0 1px 0 rgba(240,192,48,0.07)',
        padding: '1.75rem 2rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top shimmer line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(240,192,48,0.55) 50%, transparent 100%)',
        }}
      />

      {/* Eyebrow */}
      <div
        style={{
          fontFamily: '"Cinzel", serif',
          fontSize: '0.6rem',
          letterSpacing: '0.28em',
          textTransform: 'uppercase',
          color: 'rgba(140,100,30,0.7)',
          marginBottom: '0.75rem',
        }}
      >
        ⚔ Season closes in
      </div>

      {/* Countdown digits */}
      <div
        style={{
          fontFamily: '"Cinzel", serif',
          fontSize: 'clamp(1.9rem, 5vw, 2.75rem)',
          fontWeight: 700,
          letterSpacing: '0.1em',
          fontVariantNumeric: 'tabular-nums',
          color: isEnded ? 'rgba(220,60,60,0.9)' : 'rgba(240,192,48,1)',
          textShadow: isEnded
            ? '0 0 30px rgba(220,60,60,0.4)'
            : '0 0 28px rgba(240,192,48,0.4), 0 0 60px rgba(240,192,48,0.15)',
          lineHeight: 1.1,
        }}
      >
        {display}
      </div>

      {/* Subline */}
      {!isEnded && (
        <div
          style={{
            fontFamily: '"Cinzel", serif',
            fontSize: '0.58rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(100,76,28,0.55)',
            marginTop: '0.75rem',
          }}
        >
          Winner claims the throne
        </div>
      )}
    </div>
  )
}
