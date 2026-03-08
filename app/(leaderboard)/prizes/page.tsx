import { Crown, Trophy, Star } from 'lucide-react'

// ─── Prize data ───────────────────────────────────────────────────────────────

const PRIZES = [
  {
    place: 2,
    rank: '#2',
    label: 'PlayStation 5',
    sublabel: 'Console + Controller',
    value: '~₪2,200',
    color: 'rgba(148,163,184,1)',
    colorDim: 'rgba(148,163,184,0.55)',
    colorBg: 'rgba(148,163,184,0.07)',
    borderColor: 'rgba(148,163,184,0.28)',
    glowColor: 'rgba(148,163,184,0.18)',
    scale: '0.88',
    icon: (
      <svg viewBox="0 0 80 80" width="80" height="80" fill="none">
        {/* PS5 body silhouette */}
        <rect x="12" y="28" width="56" height="36" rx="8" fill="rgba(30,30,36,0.9)" stroke="rgba(148,163,184,0.4)" strokeWidth="1.5"/>
        <rect x="20" y="34" width="40" height="6" rx="3" fill="rgba(148,163,184,0.15)"/>
        <circle cx="40" cy="52" r="10" fill="rgba(20,20,26,1)" stroke="rgba(148,163,184,0.35)" strokeWidth="1.2"/>
        <path d="M34 52 L40 47 L46 52 L40 57 Z" fill="rgba(148,163,184,0.5)"/>
        <rect x="26" y="20" width="28" height="12" rx="6" fill="rgba(25,25,32,0.95)" stroke="rgba(148,163,184,0.3)" strokeWidth="1"/>
        <circle cx="30" cy="26" r="2.5" fill="rgba(148,163,184,0.25)"/>
        <circle cx="50" cy="26" r="2.5" fill="rgba(148,163,184,0.25)"/>
      </svg>
    ),
  },
  {
    place: 1,
    rank: '#1',
    label: 'iPhone 16 Pro',
    sublabel: '256GB · Desert Titanium',
    value: '~₪5,200',
    color: 'rgba(240,192,48,1)',
    colorDim: 'rgba(240,192,48,0.6)',
    colorBg: 'rgba(240,192,48,0.07)',
    borderColor: 'rgba(240,192,48,0.38)',
    glowColor: 'rgba(240,192,48,0.22)',
    scale: '1',
    icon: (
      <svg viewBox="0 0 80 80" width="80" height="80" fill="none">
        {/* iPhone silhouette */}
        <rect x="24" y="8" width="32" height="64" rx="8" fill="rgba(30,24,8,0.95)" stroke="rgba(240,192,48,0.5)" strokeWidth="1.5"/>
        <rect x="28" y="14" width="24" height="42" rx="4" fill="rgba(15,10,3,1)" stroke="rgba(240,192,48,0.18)" strokeWidth="0.8"/>
        {/* Dynamic island */}
        <rect x="33" y="16" width="14" height="5" rx="2.5" fill="rgba(10,7,2,1)" stroke="rgba(240,192,48,0.3)" strokeWidth="0.6"/>
        {/* Screen glow */}
        <rect x="30" y="22" width="20" height="32" rx="3" fill="rgba(240,192,48,0.04)"/>
        <path d="M35 32 L45 32 M35 37 L43 37 M35 42 L41 42" stroke="rgba(240,192,48,0.25)" strokeWidth="1.2" strokeLinecap="round"/>
        {/* Home indicator */}
        <rect x="34" y="60" width="12" height="2" rx="1" fill="rgba(240,192,48,0.3)"/>
      </svg>
    ),
  },
  {
    place: 3,
    rank: '#3',
    label: '₪700 Gift Card',
    sublabel: 'Amazon Israel',
    value: '₪700',
    color: 'rgba(190,120,55,1)',
    colorDim: 'rgba(190,120,55,0.55)',
    colorBg: 'rgba(190,120,55,0.07)',
    borderColor: 'rgba(190,120,55,0.28)',
    glowColor: 'rgba(190,120,55,0.18)',
    scale: '0.82',
    icon: (
      <svg viewBox="0 0 80 80" width="80" height="80" fill="none">
        {/* Gift card silhouette */}
        <rect x="10" y="22" width="60" height="40" rx="6" fill="rgba(30,18,6,0.95)" stroke="rgba(190,120,55,0.45)" strokeWidth="1.5"/>
        <rect x="10" y="22" width="60" height="12" rx="6" fill="rgba(190,120,55,0.12)"/>
        <rect x="10" y="28" width="60" height="6" fill="rgba(190,120,55,0.08)"/>
        {/* Ribbon vertical */}
        <rect x="36" y="22" width="8" height="40" fill="rgba(190,120,55,0.15)"/>
        {/* ₪ symbol */}
        <text x="40" y="52" textAnchor="middle" fontFamily="serif" fontSize="14" fill="rgba(190,120,55,0.8)" fontWeight="700">₪</text>
        {/* Shine */}
        <rect x="16" y="38" width="14" height="2" rx="1" fill="rgba(190,120,55,0.2)"/>
        <rect x="16" y="43" width="20" height="1.5" rx="0.75" fill="rgba(190,120,55,0.15)"/>
      </svg>
    ),
  },
]

// ─── Rank badge ───────────────────────────────────────────────────────────────

function PlaceBadge({ prize }: { prize: typeof PRIZES[0] }) {
  const isFirst = prize.place === 1
  return (
    <div
      style={{
        width: isFirst ? 36 : 28,
        height: isFirst ? 36 : 28,
        borderRadius: '50%',
        background: prize.colorBg,
        border: `${isFirst ? 2 : 1.5}px solid ${prize.borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: `0 0 ${isFirst ? 12 : 8}px ${prize.glowColor}`,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: '"Cinzel Decorative", "Cinzel", serif',
          fontSize: isFirst ? '0.75rem' : '0.62rem',
          fontWeight: 700,
          color: prize.color,
          lineHeight: 1,
        }}
      >
        {prize.place}
      </span>
    </div>
  )
}

// ─── Prize card ───────────────────────────────────────────────────────────────

function PrizeCard({ prize }: { prize: typeof PRIZES[0] }) {
  const isFirst = prize.place === 1

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flex: isFirst ? '0 0 auto' : '0 0 auto',
        width: isFirst ? 260 : 210,
        transform: `scale(${prize.scale})`,
        transformOrigin: 'bottom center',
        position: 'relative',
      }}
    >
      {/* Top rank badge */}
      <div style={{ marginBottom: '0.75rem' }}>
        <PlaceBadge prize={prize} />
      </div>

      {/* Card body */}
      <div
        style={{
          width: '100%',
          borderRadius: 14,
          border: `1px solid ${prize.borderColor}`,
          borderTop: `1px solid ${isFirst ? 'rgba(240,192,48,0.55)' : prize.borderColor}`,
          background: isFirst
            ? 'linear-gradient(180deg, rgba(22,16,4,0.99) 0%, rgba(12,8,2,1) 100%)'
            : 'linear-gradient(180deg, rgba(18,14,6,0.98) 0%, rgba(10,7,3,1) 100%)',
          boxShadow: [
            `0 8px 40px rgba(0,0,0,0.7)`,
            `0 0 60px ${prize.glowColor}`,
            isFirst ? 'inset 0 1px 0 rgba(240,192,48,0.06)' : '',
          ].filter(Boolean).join(', '),
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Gold shimmer strip for #1 */}
        {isFirst && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(240,192,48,0.6), transparent)',
          }} />
        )}

        {/* Icon area */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isFirst ? '2rem 1.5rem 1.5rem' : '1.5rem 1.25rem 1.25rem',
            background: `radial-gradient(ellipse at center, ${prize.colorBg} 0%, transparent 70%)`,
          }}
        >
          <div
            style={{
              filter: `drop-shadow(0 0 ${isFirst ? 20 : 12}px ${prize.glowColor})`,
            }}
          >
            {prize.icon}
          </div>
        </div>

        {/* Info area */}
        <div
          style={{
            padding: '0 1.25rem 1.25rem',
            borderTop: `1px solid ${prize.colorBg}`,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: '"Cinzel", serif',
              fontSize: isFirst ? '1.05rem' : '0.88rem',
              fontWeight: 700,
              color: prize.color,
              letterSpacing: '0.04em',
              textShadow: `0 0 20px ${prize.glowColor}`,
              paddingTop: '0.875rem',
              paddingBottom: '0.25rem',
            }}
          >
            {prize.label}
          </div>
          <div
            style={{
              fontFamily: '"Cinzel", serif',
              fontSize: '0.62rem',
              color: prize.colorDim,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '0.75rem',
            }}
          >
            {prize.sublabel}
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.3rem 0.875rem',
              borderRadius: 999,
              background: prize.colorBg,
              border: `1px solid ${prize.borderColor}`,
            }}
          >
            <span
              style={{
                fontFamily: '"Cinzel", serif',
                fontSize: '0.72rem',
                fontWeight: 600,
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
          height: prize.place === 1 ? 48 : prize.place === 2 ? 32 : 20,
          background: `linear-gradient(180deg, ${prize.colorBg}, transparent)`,
          borderBottom: `2px solid ${prize.borderColor}`,
          borderLeft: `1px solid ${prize.borderColor}`,
          borderRight: `1px solid ${prize.borderColor}`,
          borderBottomLeftRadius: 6,
          borderBottomRightRadius: 6,
        }}
      />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Render order: place 2 (left), place 1 (center), place 3 (right)
const PODIUM_ORDER = [PRIZES[0], PRIZES[1], PRIZES[2]]

export default function PrizesPage() {
  return (
    <div className="space-y-8">

      {/* ── Page header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Crown className="size-4" style={{ color: 'rgba(201,144,26,0.7)' }} />
          <span
            style={{
              fontFamily: '"Cinzel", serif',
              fontSize: '0.58rem',
              letterSpacing: '0.22em',
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
            <p className="text-game-sm text-game-text-secondary font-body mt-1">
              Top warriors claim legendary rewards at season end
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="chip card-gold text-game-xs">🏆 Top 3 Rewarded</span>
            <span className="chip card-game text-game-xs">Season ends in 90 days</span>
          </div>
        </div>
      </div>

      {/* ── Podium ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: '1.5rem',
          padding: '3rem 1rem 0',
          position: 'relative',
          overflowX: 'auto',
          overflowY: 'visible',
        }}
      >
        {/* Ambient glow behind podium */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(ellipse 60% 40% at 50% 80%, rgba(240,192,48,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {PODIUM_ORDER.map((prize) => (
          <PrizeCard key={prize.place} prize={prize} />
        ))}
      </div>

      {/* ── Divider ── */}
      <div className="divider-gold" />

      {/* ── How it works ── */}
      <div
        style={{
          borderRadius: 12,
          padding: '1.5rem',
          background: 'rgba(12,8,3,0.7)',
          border: '1px solid rgba(201,144,26,0.15)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Star className="size-3.5" style={{ color: 'rgba(201,144,26,0.65)' }} />
          <span
            style={{
              fontFamily: '"Cinzel", serif',
              fontSize: '0.58rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(140,100,30,0.8)',
            }}
          >
            How prizes are awarded
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">
          {[
            'Rankings are determined by total power at season end',
            'Prizes awarded to top 3 individual players',
            'Winners contacted via registered email within 7 days',
            'Physical prizes shipped to Israel addresses only',
            'Gift cards delivered digitally to registered email',
            'Season duration: 90 days from start date',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <div
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: 'rgba(201,144,26,0.5)',
                  flexShrink: 0,
                  marginTop: 6,
                }}
              />
              <span className="font-body text-game-xs text-game-text-secondary">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer disclaimer ── */}
      <p className="font-body text-game-xs text-game-text-muted text-center pb-2">
        Prizes subject to availability. Domiron reserves the right to substitute prizes of equal or greater value.
      </p>

    </div>
  )
}
