import { createAdminClient } from '@/lib/supabase/server'
import { Gift, Trophy } from 'lucide-react'
import { SeasonCountdownBlock } from './CountdownBlock'
import type React from 'react'

// ─── Icon components (module-level — never defined inside render) ─────────────

function IPhoneIcon() {
  return (
    <svg viewBox="0 0 64 110" width="64" height="110" fill="none">
      {/* Body */}
      <rect x="2" y="2" width="60" height="106" rx="10"
        fill="rgba(26,18,5,0.98)" stroke="rgba(240,192,48,0.5)" strokeWidth="1.5" />
      {/* Screen area */}
      <rect x="6" y="8" width="52" height="90" rx="7"
        fill="rgba(8,5,1,1)" />
      {/* Dynamic island */}
      <rect x="20" y="12" width="24" height="7" rx="3.5"
        fill="rgba(4,3,0,1)" stroke="rgba(240,192,48,0.22)" strokeWidth="0.5" />
      {/* Crown glyph on screen */}
      <text x="32" y="62" textAnchor="middle" fontSize="20"
        fill="rgba(240,192,48,0.65)" fontFamily="serif">♛</text>
      {/* Faint screen lines */}
      <rect x="14" y="76" width="16" height="1.5" rx="0.75"
        fill="rgba(240,192,48,0.18)" />
      <rect x="14" y="80" width="24" height="1.5" rx="0.75"
        fill="rgba(240,192,48,0.12)" />
      {/* Home bar */}
      <rect x="22" y="94" width="20" height="3" rx="1.5"
        fill="rgba(240,192,48,0.32)" />
      {/* Side volume buttons */}
      <rect x="0" y="26" width="2.5" height="10" rx="1.25"
        fill="rgba(240,192,48,0.28)" />
      {/* Power button */}
      <rect x="61.5" y="34" width="2.5" height="16" rx="1.25"
        fill="rgba(240,192,48,0.28)" />
    </svg>
  )
}

function PS5Icon() {
  return (
    <svg viewBox="0 0 120 76" width="120" height="76" fill="none">
      {/* Console main body */}
      <path
        d="M18 28 Q18 16 32 16 L88 16 Q102 16 102 28 L102 58 Q102 66 88 66 L32 66 Q18 66 18 58 Z"
        fill="rgba(18,18,26,0.98)" stroke="rgba(148,163,184,0.45)" strokeWidth="1.5"
      />
      {/* Curved top accent — white wing panels */}
      <path d="M36 16 Q60 6 84 16" stroke="rgba(148,163,184,0.25)" strokeWidth="1" fill="none" />
      {/* Disc slot */}
      <rect x="26" y="34" width="30" height="3" rx="1.5"
        fill="rgba(148,163,184,0.2)" stroke="rgba(148,163,184,0.1)" strokeWidth="0.5" />
      {/* Center button cluster */}
      <circle cx="74" cy="42" r="9"
        fill="rgba(12,12,20,1)" stroke="rgba(148,163,184,0.35)" strokeWidth="1.2" />
      <text x="74" y="46" textAnchor="middle" fontSize="8"
        fill="rgba(148,163,184,0.55)" fontFamily="monospace" fontWeight="700">PS</text>
      {/* USB port */}
      <rect x="26" y="50" width="10" height="4" rx="1"
        fill="rgba(148,163,184,0.1)" stroke="rgba(148,163,184,0.18)" strokeWidth="0.5" />
      {/* LED strip */}
      <rect x="18" y="42" width="6" height="2" rx="1"
        fill="rgba(148,163,184,0.3)" />
    </svg>
  )
}

function GiftCardIcon() {
  return (
    <svg viewBox="0 0 100 66" width="100" height="66" fill="none">
      {/* Card body */}
      <rect x="2" y="2" width="96" height="62" rx="8"
        fill="rgba(26,14,4,0.98)" stroke="rgba(190,120,55,0.5)" strokeWidth="1.5" />
      {/* Top band */}
      <rect x="2" y="2" width="96" height="17" rx="8"
        fill="rgba(190,120,55,0.16)" />
      <rect x="2" y="13" width="96" height="6" fill="rgba(190,120,55,0.08)" />
      {/* Ribbon vertical */}
      <rect x="43" y="2" width="14" height="62" fill="rgba(190,120,55,0.09)" />
      {/* Ribbon horizontal */}
      <rect x="2" y="27" width="96" height="5" fill="rgba(190,120,55,0.06)" />
      {/* Bow knot */}
      <circle cx="50" cy="19" r="5"
        fill="rgba(190,120,55,0.12)" stroke="rgba(190,120,55,0.3)" strokeWidth="0.8" />
      {/* Shine lines */}
      <rect x="10" y="36" width="20" height="2" rx="1"
        fill="rgba(190,120,55,0.22)" />
      <rect x="10" y="41" width="30" height="1.5" rx="0.75"
        fill="rgba(190,120,55,0.14)" />
      {/* Value text */}
      <text x="50" y="58" textAnchor="middle" fontSize="16"
        fill="rgba(190,120,55,0.8)" fontFamily="serif" fontWeight="700">₪700</text>
    </svg>
  )
}

// ─── Prize definitions ────────────────────────────────────────────────────────

interface Prize {
  place: number
  placeLabel: string
  label: string
  sublabel: string
  value: string
  color: string
  colorDim: string
  colorBg: string
  borderColor: string
  glowColor: string
  cardW: number
  podiumH: number
  Icon: () => React.ReactElement
}

const PRIZES: Prize[] = [
  {
    place: 2,
    placeLabel: 'Runner-Up',
    label: 'PlayStation 5',
    sublabel: 'Console + Controller',
    value: '~₪2,200',
    color: 'rgba(148,163,184,1)',
    colorDim: 'rgba(148,163,184,0.5)',
    colorBg: 'rgba(148,163,184,0.07)',
    borderColor: 'rgba(148,163,184,0.28)',
    glowColor: 'rgba(148,163,184,0.15)',
    cardW: 205,
    podiumH: 30,
    Icon: PS5Icon,
  },
  {
    place: 1,
    placeLabel: 'Champion',
    label: 'iPhone 16 Pro',
    sublabel: '256GB · Desert Titanium',
    value: '~₪5,200',
    color: 'rgba(240,192,48,1)',
    colorDim: 'rgba(240,192,48,0.55)',
    colorBg: 'rgba(240,192,48,0.07)',
    borderColor: 'rgba(240,192,48,0.38)',
    glowColor: 'rgba(240,192,48,0.2)',
    cardW: 260,
    podiumH: 58,
    Icon: IPhoneIcon,
  },
  {
    place: 3,
    placeLabel: 'Third Place',
    label: '₪700 Gift Card',
    sublabel: 'Amazon Israel',
    value: '₪700',
    color: 'rgba(190,120,55,1)',
    colorDim: 'rgba(190,120,55,0.5)',
    colorBg: 'rgba(190,120,55,0.07)',
    borderColor: 'rgba(190,120,55,0.28)',
    glowColor: 'rgba(190,120,55,0.15)',
    cardW: 182,
    podiumH: 16,
    Icon: GiftCardIcon,
  },
]

// ─── Prize card ───────────────────────────────────────────────────────────────

function PrizeCard({ prize }: { prize: Prize }) {
  const isFirst = prize.place === 1

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: prize.cardW,
        flexShrink: 0,
      }}
    >
      {/* Place label */}
      <div
        style={{
          fontFamily: '"Cinzel", serif',
          fontSize: '0.55rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: prize.colorDim,
          marginBottom: '0.5rem',
        }}
      >
        {prize.placeLabel}
      </div>

      {/* Number badge */}
      <div
        style={{
          width: isFirst ? 44 : 32,
          height: isFirst ? 44 : 32,
          borderRadius: '50%',
          background: prize.colorBg,
          border: `${isFirst ? 2 : 1.5}px solid ${prize.borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 ${isFirst ? 20 : 10}px ${prize.glowColor}`,
          marginBottom: '0.75rem',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: '"Cinzel", serif',
            fontSize: isFirst ? '1.1rem' : '0.78rem',
            fontWeight: 700,
            color: prize.color,
            lineHeight: 1,
          }}
        >
          {prize.place}
        </span>
      </div>

      {/* Card body */}
      <div
        style={{
          width: '100%',
          borderRadius: 14,
          border: `1px solid ${prize.borderColor}`,
          borderTopColor: isFirst ? 'rgba(240,192,48,0.6)' : prize.borderColor,
          background: isFirst
            ? 'linear-gradient(180deg, rgba(22,16,4,0.99) 0%, rgba(10,6,1,1) 100%)'
            : 'linear-gradient(180deg, rgba(16,12,5,0.98) 0%, rgba(10,7,3,1) 100%)',
          boxShadow: [
            '0 10px 48px rgba(0,0,0,0.75)',
            `0 0 ${isFirst ? 64 : 32}px ${prize.glowColor}`,
            isFirst ? 'inset 0 1px 0 rgba(240,192,48,0.07)' : '',
          ]
            .filter(Boolean)
            .join(', '),
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Shimmer top edge for #1 */}
        {isFirst && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background:
                'linear-gradient(90deg, transparent 0%, rgba(240,192,48,0.7) 50%, transparent 100%)',
            }}
          />
        )}

        {/* Icon area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isFirst ? '2.25rem 1.5rem 1.5rem' : '1.625rem 1rem 1.25rem',
            background: `radial-gradient(ellipse at 50% 65%, ${prize.colorBg} 0%, transparent 68%)`,
          }}
        >
          <div
            style={{
              filter: `drop-shadow(0 0 ${isFirst ? 28 : 12}px ${prize.glowColor})`,
            }}
          >
            <prize.Icon />
          </div>
        </div>

        {/* Info area */}
        <div
          style={{
            padding: isFirst ? '0 1.5rem 1.625rem' : '0 1.125rem 1.25rem',
            borderTop: `1px solid ${prize.colorBg}`,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: '"Cinzel", serif',
              fontSize: isFirst ? '1.05rem' : '0.84rem',
              fontWeight: 700,
              color: prize.color,
              letterSpacing: '0.04em',
              textShadow: `0 0 22px ${prize.glowColor}`,
              paddingTop: '0.875rem',
              paddingBottom: '0.25rem',
            }}
          >
            {prize.label}
          </div>

          <div
            style={{
              fontFamily: '"Cinzel", serif',
              fontSize: '0.58rem',
              color: prize.colorDim,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '1rem',
            }}
          >
            {prize.sublabel}
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: isFirst ? '0.45rem 1.25rem' : '0.3rem 0.875rem',
              borderRadius: 999,
              background: prize.colorBg,
              border: `1px solid ${prize.borderColor}`,
              boxShadow: `0 0 12px ${prize.glowColor}`,
            }}
          >
            <span
              style={{
                fontFamily: '"Cinzel", serif',
                fontSize: isFirst ? '0.9rem' : '0.72rem',
                fontWeight: 700,
                color: prize.color,
                letterSpacing: '0.06em',
              }}
            >
              {prize.value}
            </span>
          </div>
        </div>
      </div>

      {/* Podium step */}
      <div
        style={{
          width: '100%',
          height: prize.podiumH,
          background: `linear-gradient(180deg, ${prize.colorBg} 0%, rgba(0,0,0,0) 100%)`,
          borderBottom: `2px solid ${prize.borderColor}`,
          borderLeft: `1px solid ${prize.borderColor}`,
          borderRight: `1px solid ${prize.borderColor}`,
          borderBottomLeftRadius: 6,
          borderBottomRightRadius: 6,
          flexShrink: 0,
        }}
      />
    </div>
  )
}

// ─── Rule row ─────────────────────────────────────────────────────────────────

const RULES: [string, string][] = [
  ['⚔', 'Rankings are determined by total power at season end'],
  ['🏆', 'Prizes awarded to top 3 individual players only'],
  ['📧', 'Winners contacted via registered email within 7 days'],
  ['📦', 'Physical prizes shipped to Israel addresses only'],
  ['💳', 'Gift cards delivered digitally to registered email'],
  ['📅', 'Season duration: 90 days from season start date'],
]

// ─── Podium order: #2 left | #1 center | #3 right ────────────────────────────

const PODIUM_ORDER = [PRIZES[0], PRIZES[1], PRIZES[2]]

// ─── Page (server component) ──────────────────────────────────────────────────

export default async function PrizesPage() {
  const supabase = createAdminClient()
  const { data: season } = await supabase
    .from('seasons')
    .select('ends_at')
    .eq('status', 'active')
    .maybeSingle()

  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Gift className="size-4" style={{ color: 'rgba(201,144,26,0.7)' }} />
          <span
            style={{
              fontFamily: '"Cinzel", serif',
              fontSize: '0.58rem',
              letterSpacing: '0.24em',
              textTransform: 'uppercase',
              color: 'rgba(100,76,28,0.75)',
            }}
          >
            Season Rewards
          </span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
              Season Prizes
            </h1>
            <p className="text-game-sm text-game-text-secondary font-body mt-1 max-w-lg">
              Claim glory. Claim your reward. The top three warriors of the realm shall be
              honoured at season end.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <span className="chip card-gold text-game-xs">🏆 Top 3 Rewarded</span>
            <span className="chip card-game text-game-xs">90-Day Season</span>
          </div>
        </div>
      </div>

      {/* ── Season countdown ── */}
      <SeasonCountdownBlock endsAt={season?.ends_at ?? null} />

      {/* ── Podium ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem 0.5rem 0',
          position: 'relative',
          overflowX: 'auto',
          overflowY: 'visible',
        }}
      >
        {/* Ambient floor glow */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse 55% 32% at 50% 88%, rgba(240,192,48,0.055) 0%, transparent 70%)',
          }}
        />

        {PODIUM_ORDER.map((prize) => (
          <PrizeCard key={prize.place} prize={prize} />
        ))}
      </div>

      {/* ── Divider ── */}
      <div className="divider-gold" />

      {/* ── Rules ── */}
      <div
        style={{
          borderRadius: 12,
          padding: '1.5rem 1.75rem',
          background: 'rgba(12,8,3,0.72)',
          border: '1px solid rgba(201,144,26,0.15)',
          borderTop: '1px solid rgba(201,144,26,0.28)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="size-3.5" style={{ color: 'rgba(201,144,26,0.65)' }} />
          <span
            style={{
              fontFamily: '"Cinzel", serif',
              fontSize: '0.58rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(140,100,30,0.8)',
            }}
          >
            Prize Allocation Rules
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
          {RULES.map(([icon, text], i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span style={{ fontSize: '0.75rem', marginTop: 1, flexShrink: 0 }}>{icon}</span>
              <span className="font-body text-game-xs text-game-text-secondary leading-relaxed">
                {text}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer disclaimer ── */}
      <p className="font-body text-game-xs text-game-text-muted text-center pb-2 leading-relaxed">
        Prizes subject to availability. Domiron reserves the right to substitute prizes of equal or
        greater value. Israeli law governs all prize conditions.
      </p>

    </div>
  )
}
