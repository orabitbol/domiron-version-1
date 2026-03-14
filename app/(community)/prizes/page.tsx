import { createAdminClient } from '@/lib/supabase/server'
import { Gift, Trophy } from 'lucide-react'
import { SeasonCountdownBlock } from './CountdownBlock'
import Image from 'next/image'

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
  image: string
  imgH: number
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
    image: '/sony-5-winner-2.png',
    imgH: 128,
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
    image: '/iphone-winner-1.png',
    imgH: 168,
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
    image: '/gift-card-winner-3.png',
    imgH: 112,
  },
]

// ─── גובה מדרגת פודיום (אולימפי: 1 גבוה, 2 בינוני, 3 נמוך) ─────────────────
const PODIUM_STEP_PX: Record<number, number> = { 1: 72, 2: 44, 3: 24 }

// ─── Prize card — מספר ותווית מעל התמונה, מתחת מדרגת פודיום ─────────────────

function PrizeCard({ prize }: { prize: Prize }) {
  const isFirst = prize.place === 1
  const stepH = PODIUM_STEP_PX[prize.place] ?? 24

  return (
    <div className="flex flex-col items-center w-full min-w-0 flex-1">
      {/* דירוג מעל הכרטיס — לא על התמונה */}
      <div
        className="flex flex-col items-center mb-3 shrink-0"
        style={{ fontFamily: '"Cinzel", serif' }}
      >
        <span
          className="uppercase tracking-[0.2em] text-game-text-secondary"
          style={{ fontSize: '0.55rem' }}
        >
          {prize.placeLabel}
        </span>
        <span
          className="flex items-center justify-center rounded-full font-bold mt-1.5"
          style={{
            width: isFirst ? 44 : 34,
            height: isFirst ? 44 : 34,
            background: prize.colorBg,
            border: `2px solid ${prize.borderColor}`,
            color: prize.color,
            fontSize: isFirst ? '1.15rem' : '0.9rem',
            boxShadow: `0 0 16px ${prize.glowColor}, 0 2px 8px rgba(0,0,0,0.3)`,
          }}
        >
          {prize.place}
        </span>
      </div>

      {/* כרטיס — רק תמונה, בלי טקסט על התמונה */}
      <div
        className="relative w-full overflow-hidden rounded-xl shrink-0"
        style={{
          aspectRatio: '3/4',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,144,26,0.12)',
          border: `1px solid ${isFirst ? 'rgba(240,192,48,0.4)' : 'rgba(201,144,26,0.2)'}`,
        }}
      >
        <Image
          src={prize.image}
          alt={prize.label}
          fill
          sizes="(max-width: 640px) 100vw, 280px"
          style={{ objectFit: 'cover', objectPosition: 'center' }}
          priority={isFirst}
        />
        {isFirst && (
          <div
            className="absolute top-0 left-0 right-0 h-px z-10"
            style={{
              background: 'linear-gradient(90deg, transparent 10%, rgba(240,192,48,0.65) 50%, transparent 90%)',
            }}
          />
        )}
      </div>

      {/* מדרגת פודיום — מקום ראשון הכי גבוה, שלישי הכי נמוך */}
      <div
        className="w-full shrink-0 rounded-b-md flex items-center justify-center"
        style={{
          height: stepH,
          background: `linear-gradient(180deg, ${prize.colorBg} 0%, rgba(0,0,0,0.25) 100%)`,
          border: `1px solid ${prize.borderColor}`,
          borderTop: 'none',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <span
          className="font-bold tabular-nums"
          style={{
            fontFamily: '"Cinzel", serif',
            fontSize: stepH >= 48 ? '0.7rem' : '0.6rem',
            color: prize.colorDim,
            letterSpacing: '0.12em',
          }}
        >
          מקום {prize.place}
        </span>
      </div>
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

      {/* ── פודיום אולימפי — מקום 2 שמאל, 1 מרכז (גבוה), 3 ימין ── */}
      <div className="w-full overflow-hidden px-4 sm:px-6 py-8">
        <div className="flex flex-wrap justify-center items-end gap-4 sm:gap-8 max-w-4xl mx-auto min-h-0">
          <div className="w-full sm:w-[200px] flex flex-col items-center order-2 sm:order-1">
            <PrizeCard prize={PODIUM_ORDER[0]} />
          </div>
          <div className="w-full sm:w-[240px] flex flex-col items-center order-1 sm:order-2">
            <PrizeCard prize={PODIUM_ORDER[1]} />
          </div>
          <div className="w-full sm:w-[200px] flex flex-col items-center order-3">
            <PrizeCard prize={PODIUM_ORDER[2]} />
          </div>
        </div>
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
