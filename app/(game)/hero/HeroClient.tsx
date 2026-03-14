'use client'

import { useState } from 'react'
import { Zap, X, Loader2 } from 'lucide-react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { PlayerHeroEffect } from '@/lib/game/hero-effects'

// ── Constants ─────────────────────────────────────────────────────────────────

const MANA_PER_HOUR    = BALANCE.hero.SHIELD_MANA_PER_HOUR
const XP_PER_LEVEL     = BALANCE.hero.xpPerLevel
const DURATION_PRESETS = BALANCE.hero.SHIELD_DURATION_PRESETS as unknown as readonly number[]

const BOOST_MANA = BALANCE.hero.BOOST_MANA

const MANA_PACKAGES = [
  {
    name: 'ניצוץ', mana: 1900,  turns: 190,  priceUSD: 9.90,
    popular: false, accent: '#818CF8', accentRgb: '129,140,248', tagline: 'כניסה לעולם המאנה',
  },
  {
    name: 'שלהבת', mana: 4100,  turns: 410,  priceUSD: 19.90,
    popular: false, accent: '#FB923C', accentRgb: '251,146,60',  tagline: 'לוחם מנוסה',
  },
  {
    name: 'לפיד',  mana: 8250,  turns: 825,  priceUSD: 39.90,
    popular: true,  accent: '#F0C030', accentRgb: '240,192,48',  tagline: 'הפופולרי ביותר',
  },
  {
    name: 'מבול',  mana: 20000, turns: 2000, priceUSD: 79.90,
    popular: false, accent: '#C084FC', accentRgb: '192,132,252', tagline: 'שליטה מוחלטת',
  },
] as const

const BOOST_ACTIONS: ReadonlyArray<{
  key: string; label: string; icon: React.ReactNode
  color: string; colorRgb: string; tiers: readonly [string, string, string]
}> = [
  { key: 'production', label: 'ייצור',  icon: <Zap style={{width:14,height:14,color:'#FACC15'}} />,                                                                                              color: '#FACC15', colorRgb: '250,204,21',  tiers: ['+10%', '+20%', '+30%'] },
  { key: 'defense',    label: 'הגנה',   icon: <img src="/icons/defense-power.png"  style={{width:30,height:30,objectFit:'contain',flexShrink:0}} alt="" />, color: '#38BDF8', colorRgb: '56,189,248',  tiers: ['+10%', '+20%', '+30%'] },
  { key: 'attack',     label: 'התקפה',  icon: <img src="/icons/attack-power.png"   style={{width:30,height:30,objectFit:'contain',flexShrink:0}} alt="" />, color: '#F87171', colorRgb: '248,113,113', tiers: ['+5%',  '+10%', '+15%'] },
  { key: 'spy',        label: 'ריגול',  icon: <img src="/icons/spy-power.png"      style={{width:30,height:30,objectFit:'contain',flexShrink:0}} alt="" />, color: '#C084FC', colorRgb: '192,132,252', tiers: ['+15%', '+25%', '+35%'] },
  { key: 'scout',      label: 'סיור',   icon: <img src="/icons/renger-power.png"   style={{width:30,height:30,objectFit:'contain',flexShrink:0}} alt="" />, color: '#2DD4BF', colorRgb: '45,212,191',  tiers: ['+10%', '+20%', '+30%'] },
]

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  activeEffects: PlayerHeroEffect[]
  /** Echoed from ?payment= query param after Lemon redirect. */
  paymentStatus?: string
}

type ShieldKey = 'soldier_shield' | 'resource_shield'

type ShieldStatus =
  | { state: 'active';   endsAt: string }
  | { state: 'cooldown'; cooldownEndsAt: string }
  | { state: 'available' }

interface ConfirmPayload {
  kind: 'shield' | 'boost'
  shieldKey?: ShieldKey
  hours?: number
  icon: React.ReactNode
  label: string
  detail: string
  manaCost: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeRemaining(endsAt: string): string | null {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}ש ${m}ד` : `${m}ד`
}

function heroTitle(level: number): string {
  if (level >= 50) return 'ארכימאג גרנד'
  if (level >= 25) return 'ארכימאג'
  if (level >= 10) return 'בקיא'
  if (level >= 5)  return 'חניך'
  return 'טירון'
}

function getShieldStatus(effects: PlayerHeroEffect[], type: 'SOLDIER_SHIELD' | 'RESOURCE_SHIELD'): ShieldStatus {
  const now = Date.now()
  const matching = effects.filter((e) => e.type === type)
  if (!matching.length) return { state: 'available' }
  const latest = [...matching].sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
  )[0]
  if (now < new Date(latest.ends_at).getTime())
    return { state: 'active', endsAt: latest.ends_at }
  if (latest.cooldown_ends_at && now < new Date(latest.cooldown_ends_at).getTime())
    return { state: 'cooldown', cooldownEndsAt: latest.cooldown_ends_at }
  return { state: 'available' }
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const outerPanel: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(10,8,22,0.99), rgba(5,4,14,1))',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 12, overflow: 'hidden',
}

const rowDivider: React.CSSProperties = { borderTop: '1px solid rgba(255,255,255,0.05)' }

function manaChipStyle(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, padding: '2px 8px', borderRadius: 5, flexShrink: 0,
    background: 'rgba(96,176,255,0.07)', border: '1px solid rgba(96,176,255,0.2)',
    color: '#93C5FD', fontFamily: 'var(--font-body, sans-serif)', whiteSpace: 'nowrap',
  }
}

// ── Section label (with flanking lines) ──────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 4px' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
      <span style={{
        fontSize: 9, fontFamily: 'var(--font-heading, sans-serif)',
        letterSpacing: '0.2em', textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.2)', whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
    </div>
  )
}

// ── Confirmation Modal ────────────────────────────────────────────────────────

function ConfirmModal({ payload, loading, onConfirm, onCancel }: {
  payload: ConfirmPayload; loading: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, rgba(18,10,36,0.99), rgba(8,5,20,1))',
        border: '1px solid rgba(192,112,255,0.38)',
        borderRadius: 14, padding: '24px 26px', width: '100%', maxWidth: 340, margin: '0 16px',
        boxShadow: '0 28px 72px rgba(0,0,0,0.85), 0 0 0 1px rgba(192,112,255,0.08)',
        position: 'relative',
      }}>
        <button onClick={onCancel} style={{
          position: 'absolute', top: 12, right: 12,
          background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: 4,
        }}>
          <X size={14} />
        </button>

        <div style={{
          fontFamily: 'var(--font-heading, sans-serif)', fontSize: 8,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'rgba(192,112,255,0.45)', marginBottom: 14,
        }}>
          אישור הפעלה
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: 'rgba(192,112,255,0.1)', border: '1px solid rgba(192,112,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>
            {payload.icon}
          </div>
          <div>
            <div style={{
              fontFamily: 'var(--font-heading, sans-serif)', fontSize: 15, fontWeight: 700,
              color: '#F0C030', letterSpacing: '0.04em', lineHeight: 1.2,
            }}>
              {payload.label}
            </div>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.38)',
              fontFamily: 'var(--font-body, sans-serif)', marginTop: 3,
            }}>
              {payload.detail}
            </div>
          </div>
        </div>

        <div style={{
          background: 'rgba(96,176,255,0.07)', border: '1px solid rgba(96,176,255,0.18)',
          borderRadius: 9, padding: '11px 14px', marginBottom: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-body, sans-serif)' }}>עלות מאנה</span>
          <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 17, fontWeight: 700, color: '#93C5FD' }}>
            🔮 {payload.manaCost}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 9 }}>
          <Button variant="ghost" size="sm" onClick={onCancel} style={{ flex: 1 }}>ביטול</Button>
          <Button variant="magic" size="sm" loading={loading} onClick={onConfirm} style={{ flex: 1 }}>אשר הפעלה</Button>
        </div>
      </div>
    </div>
  )
}

// ── ShieldRow ─────────────────────────────────────────────────────────────────

function ShieldRow({ icon, label, effect, shieldKey, status, currentMana, selectedHours, onSelectHours, onActivate }: {
  icon: React.ReactNode; label: string; effect: string
  shieldKey: ShieldKey; status: ShieldStatus; currentMana: number
  selectedHours: number; onSelectHours: (h: number) => void
  onActivate: (payload: ConfirmPayload) => void
}) {
  const manaCost    = selectedHours * MANA_PER_HOUR
  const canActivate = status.state === 'available' && currentMana >= manaCost
  const isActive    = status.state === 'active'
  const isCooldown  = status.state === 'cooldown'

  return (
    <div style={{ padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: isActive ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${isActive ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.08)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>
          {icon}
        </div>
        {/* Label + effect + status */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: 'var(--font-heading, sans-serif)', fontSize: 12,
              fontWeight: 700, color: 'rgba(255,255,255,0.88)', lineHeight: 1,
            }}>
              {label}
            </span>
            {isActive && (
              <span style={{
                fontSize: 10, lineHeight: 1.4,
                color: '#4ade80', background: 'rgba(74,222,128,0.09)',
                border: '1px solid rgba(74,222,128,0.22)', borderRadius: 4, padding: '1px 6px',
                fontFamily: 'var(--font-body, sans-serif)',
              }}>
                ● פעיל · פג ב-{timeRemaining((status as { state: 'active'; endsAt: string }).endsAt) ?? 'עוד מעט'}
              </span>
            )}
            {isCooldown && (
              <span style={{
                fontSize: 10, lineHeight: 1.4,
                color: 'rgba(255,255,255,0.32)', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.09)', borderRadius: 4, padding: '1px 6px',
                fontFamily: 'var(--font-body, sans-serif)',
              }}>
                קירור · {timeRemaining((status as { state: 'cooldown'; cooldownEndsAt: string }).cooldownEndsAt) ?? 'עוד מעט'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-body, sans-serif)', marginTop: 2 }}>
            {effect}
          </div>
        </div>
        {/* Cost + button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <span style={manaChipStyle()}>🔮 {manaCost}</span>
          <Button
            variant={isActive ? 'ghost' : 'primary'} size="sm"
            disabled={!canActivate}
            onClick={() => onActivate({
              kind: 'shield', shieldKey, icon, label,
              detail: `הגנה למשך ${selectedHours} שעות`,
              hours: selectedHours, manaCost,
            })}
          >
            {isActive ? 'מוגן' : isCooldown ? 'קירור' : 'הפעל'}
          </Button>
        </div>
      </div>

      {/* Duration selector */}
      {!isActive && !isCooldown && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8, paddingInlineStart: 42 }}>
          {DURATION_PRESETS.map((h) => {
            const sel = selectedHours === h
            return (
              <button key={h} onClick={() => onSelectHours(h)} style={{
                padding: '3px 9px', borderRadius: 5, fontSize: 10,
                background: sel ? 'rgba(147,197,253,0.13)' : 'rgba(255,255,255,0.03)',
                border: sel ? '1px solid rgba(147,197,253,0.42)' : '1px solid rgba(255,255,255,0.07)',
                color: sel ? '#93C5FD' : 'rgba(255,255,255,0.28)',
                cursor: 'pointer', fontFamily: 'var(--font-body, sans-serif)',
                transition: 'all 0.12s ease',
              }}>
                {h}ש
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── BoostRow ──────────────────────────────────────────────────────────────────

function BoostRow({ cat, tierIdx, onSelectTier }: {
  cat: typeof BOOST_ACTIONS[number]
  tierIdx: 0 | 1 | 2
  onSelectTier: (i: 0 | 1 | 2) => void
}) {
  const tierLabels = ['קטן', 'בינוני', 'גדול'] as const
  const tierMana   = [BOOST_MANA.SMALL, BOOST_MANA.MEDIUM, BOOST_MANA.LARGE]

  return (
    <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        background: `rgba(${cat.colorRgb},0.1)`, border: `1px solid rgba(${cat.colorRgb},0.2)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {cat.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
          {cat.label}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.26)', fontFamily: 'var(--font-body, sans-serif)', marginInlineStart: 6 }}>
          {cat.tiers[tierIdx]} · 24ש
        </span>
      </div>
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {tierLabels.map((lbl, i) => (
          <button key={lbl} onClick={() => onSelectTier(i as 0 | 1 | 2)} style={{
            padding: '3px 7px', borderRadius: 5, fontSize: 10,
            background: tierIdx === i ? `rgba(${cat.colorRgb},0.15)` : 'rgba(255,255,255,0.04)',
            border: tierIdx === i ? `1px solid rgba(${cat.colorRgb},0.5)` : '1px solid rgba(255,255,255,0.07)',
            color: tierIdx === i ? cat.color : 'rgba(255,255,255,0.26)',
            cursor: 'pointer', transition: 'all 0.12s ease',
            fontFamily: 'var(--font-body, sans-serif)',
          }}>
            {lbl}
          </button>
        ))}
      </div>
      <span style={manaChipStyle()}>🔮 {tierMana[tierIdx]}</span>
      <Button variant="magic" size="sm" disabled style={{ flexShrink: 0, opacity: 0.4 }}>הפעל</Button>
    </div>
  )
}

// ── ManaPackageCard ───────────────────────────────────────────────────────────

function ManaPackageCard({
  pkg,
  loading,
  onBuy,
}: {
  pkg: typeof MANA_PACKAGES[number]
  loading: boolean
  onBuy: () => void
}) {
  const { popular, accent, accentRgb } = pkg

  return (
    <div style={{
      margin: '0 12px',
      background: popular
        ? `linear-gradient(135deg, rgba(${accentRgb},0.08) 0%, rgba(10,8,20,0.99) 60%)`
        : 'rgba(255,255,255,0.02)',
      border: popular
        ? `1px solid rgba(${accentRgb},0.4)`
        : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 10, overflow: 'hidden',
      boxShadow: popular ? `0 0 18px rgba(${accentRgb},0.1), inset 0 1px 0 rgba(${accentRgb},0.06)` : 'none',
      position: 'relative',
    }}>
      {/* Left accent bar */}
      <div style={{
        position: 'absolute', insetInlineStart: 0, top: 0, bottom: 0, width: 3,
        background: `linear-gradient(180deg, ${accent}, rgba(${accentRgb},0.3))`,
        borderRadius: '10px 0 0 10px',
      }} />

      {/* Popular ribbon */}
      {popular && (
        <div style={{
          position: 'absolute', top: 0, insetInlineEnd: 0,
          background: `linear-gradient(135deg, rgba(${accentRgb},0.9), rgba(${accentRgb},0.6))`,
          borderRadius: '0 10px 0 8px',
          padding: '3px 10px',
          fontSize: 9, fontFamily: 'var(--font-heading, sans-serif)',
          fontWeight: 700, color: '#000', letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          ★ פופולרי
        </div>
      )}

      <div style={{ padding: '13px 14px 13px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Left: name + tagline */}
        <div style={{ width: 58, flexShrink: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display, serif)', fontSize: 16, fontWeight: 700,
            color: accent, letterSpacing: '0.02em', lineHeight: 1,
            textShadow: `0 0 12px rgba(${accentRgb},0.5)`,
          }}>
            {pkg.name}
          </div>
          <div style={{
            fontSize: 9, color: `rgba(${accentRgb},0.5)`,
            fontFamily: 'var(--font-body, sans-serif)', marginTop: 3, lineHeight: 1.2,
          }}>
            {pkg.tagline}
          </div>
        </div>

        {/* Center: rewards */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Mana — primary reward */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 11 }}>🔮</span>
            <span style={{
              fontFamily: 'var(--font-display, serif)', fontSize: 18, fontWeight: 700,
              color: '#d8b4fe', lineHeight: 1,
              textShadow: '0 0 8px rgba(192,132,252,0.35)',
            }}>
              {pkg.mana.toLocaleString()}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-body, sans-serif)' }}>מאנה</span>
          </div>
          {/* Turns — secondary reward */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <span style={{ fontSize: 10 }}>⚡</span>
            <span style={{
              fontFamily: 'var(--font-heading, sans-serif)', fontSize: 12, fontWeight: 600,
              color: '#FDE68A', lineHeight: 1,
            }}>
              {pkg.turns.toLocaleString()}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.26)', fontFamily: 'var(--font-body, sans-serif)' }}>תורות</span>
          </div>
        </div>

        {/* Right: price + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0, minWidth: 72 }}>
          <div style={{ textAlign: 'end', marginTop: popular ? 6 : 0 }}>
            <div style={{
              fontFamily: 'var(--font-heading, sans-serif)', fontSize: 16, fontWeight: 700,
              color: popular ? accent : 'rgba(255,255,255,0.72)', lineHeight: 1,
            }}>
              ${pkg.priceUSD.toFixed(2)}
            </div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.18)', fontFamily: 'var(--font-body, sans-serif)', marginTop: 1 }}>
              USD
            </div>
          </div>
          <button
            disabled={loading}
            onClick={onBuy}
            style={{
              padding: '5px 16px',
              borderRadius: 7,
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
              fontFamily: 'var(--font-heading, sans-serif)',
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em',
              background: popular
                ? `linear-gradient(135deg, ${accent}, rgba(${accentRgb},0.7))`
                : 'rgba(255,255,255,0.06)',
              border: popular
                ? `1px solid rgba(${accentRgb},0.5)`
                : '1px solid rgba(255,255,255,0.12)',
              color: popular ? '#000' : 'rgba(255,255,255,0.45)',
              boxShadow: popular ? `0 2px 10px rgba(${accentRgb},0.3)` : 'none',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {loading
              ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} />
              : null}
            רכוש
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function HeroClient({ activeEffects, paymentStatus }: Props) {
  const { hero, refresh, applyPatch } = usePlayer()

  const [localEffects,   setLocalEffects]   = useState<PlayerHeroEffect[]>(activeEffects)
  const [shieldLoading,  setShieldLoading]  = useState(false)
  const [message,        setMessage]        = useState<{ text: string; ok: boolean } | null>(null)
  const [premiumTab,     setPremiumTab]     = useState<'spells' | 'buy'>('spells')
  const [confirmPayload, setConfirmPayload] = useState<ConfirmPayload | null>(null)
  /** The pack key currently being purchased (null = idle). Disables all buy buttons while set. */
  const [buyingPackKey,  setBuyingPackKey]  = useState<string | null>(null)

  const [soldierHours,  setSoldierHours]  = useState<number>(DURATION_PRESETS[2])
  const [resourceHours, setResourceHours] = useState<number>(DURATION_PRESETS[2])

  const [boostTiers, setBoostTiers] = useState<Record<string, 0 | 1 | 2>>(
    Object.fromEntries(BOOST_ACTIONS.map((a) => [a.key, 0]))
  )

  if (!hero) return null

  const xpForNextLevel = hero.level * XP_PER_LEVEL
  const xpPct          = Math.min(100, Math.round((hero.xp / xpForNextLevel) * 100))
  const manaPerTick    =
    (BALANCE.hero.manaPerTick?.base ?? 1) +
    (hero.level >= 10 ? (BALANCE.hero.manaPerTick?.level10bonus ?? 0) : 0) +
    (hero.level >= 50 ? (BALANCE.hero.manaPerTick?.level50bonus ?? 0) : 0)

  const soldierStatus  = getShieldStatus(localEffects, 'SOLDIER_SHIELD')
  const resourceStatus = getShieldStatus(localEffects, 'RESOURCE_SHIELD')

  async function handleActivateShield(shieldKey: ShieldKey, hours: number) {
    const manaCost = hours * MANA_PER_HOUR
    if (hero.mana < manaCost) return
    setShieldLoading(true)
    setMessage(null)
    try {
      const res  = await fetch('/api/hero/activate-shield', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shield_type: shieldKey, hours }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'הפעלת מגן נכשלה', ok: false })
      } else {
        const label = shieldKey === 'soldier_shield' ? 'מגן חיילים' : 'מגן משאבים'
        setMessage({ text: `${label} הופעל ל-${hours} שעות`, ok: true })
        applyPatch({ hero: { ...hero, mana: hero.mana - manaCost } })
        const effectType = shieldKey === 'soldier_shield' ? 'SOLDIER_SHIELD' : 'RESOURCE_SHIELD' as const
        setLocalEffects((prev) => [...prev, {
          id: `local-${Date.now()}`, player_id: '', type: effectType,
          starts_at: new Date().toISOString(),
          ends_at: data.data.ends_at,
          cooldown_ends_at: data.data.cooldown_ends_at,
          metadata: null,
        }])
        refresh()
      }
    } catch {
      setMessage({ text: 'שגיאת רשת', ok: false })
    } finally {
      setShieldLoading(false)
      setConfirmPayload(null)
    }
  }

  function handleConfirmActivate() {
    if (!confirmPayload) return
    if (confirmPayload.kind === 'shield' && confirmPayload.shieldKey && confirmPayload.hours) {
      handleActivateShield(confirmPayload.shieldKey, confirmPayload.hours)
    }
  }

  async function handleBuyPack(packKey: string) {
    if (buyingPackKey) return          // already processing another pack
    setBuyingPackKey(packKey)
    setMessage(null)
    try {
      const res = await fetch('/api/payments/lemon/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packKey }),
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        setMessage({ text: data.error ?? 'שגיאה ביצירת עמוד תשלום', ok: false })
        return
      }
      // Redirect to Lemon Squeezy hosted checkout
      window.location.href = data.url
    } catch {
      setMessage({ text: 'שגיאת רשת — נסה שנית', ok: false })
    } finally {
      setBuyingPackKey(null)
    }
  }

  return (
    <>
      {confirmPayload && (
        <ConfirmModal
          payload={confirmPayload} loading={shieldLoading}
          onConfirm={handleConfirmActivate} onCancel={() => setConfirmPayload(null)}
        />
      )}

      <div className="space-y-4">

        {/* ── Hero identity ──────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(160deg, rgba(22,8,42,0.99), rgba(10,4,22,1))',
          border: '1px solid rgba(192,112,255,0.28)', borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(192,112,255,0.8) 40%, rgba(240,192,48,0.6) 70%, transparent)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'radial-gradient(circle at 38% 32%, rgba(192,112,255,0.28), rgba(8,3,20,1))',
                border: '2px solid rgba(192,112,255,0.45)',
                boxShadow: '0 0 20px rgba(192,112,255,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <img src="/icons/attack-power.png" style={{width:68,height:68,objectFit:'contain'}} alt="" />
              </div>
              <div style={{
                position: 'absolute', bottom: -3, right: -6,
                background: 'linear-gradient(135deg, #6D28D9, #A855F7)',
                border: '1px solid rgba(240,192,48,0.5)',
                borderRadius: 20, padding: '1px 7px',
                fontSize: 10, fontWeight: 700, color: '#fff',
                fontFamily: 'var(--font-heading, sans-serif)',
                letterSpacing: '0.06em', whiteSpace: 'nowrap',
              }}>
                {hero.level}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div>
                  <span style={{ fontFamily: 'var(--font-display, serif)', fontSize: 16, fontWeight: 700, color: '#C070FF', letterSpacing: '0.07em', textTransform: 'uppercase' }}>גיבור</span>
                  <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 9, color: 'rgba(192,112,255,0.42)', letterSpacing: '0.12em', textTransform: 'uppercase', marginInlineStart: 8 }}>
                    רמה {hero.level} · {heroTitle(hero.level)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(96,176,255,0.1)', border: '1px solid rgba(96,176,255,0.22)', borderRadius: 20, padding: '3px 10px' }}>
                  <span style={{ fontSize: 11 }}>🔮</span>
                  <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 13, fontWeight: 700, color: '#93C5FD' }}>{formatNumber(hero.mana)}</span>
                  <span style={{ fontSize: 9, color: 'rgba(147,197,253,0.42)', fontFamily: 'var(--font-body, sans-serif)' }}>+{manaPerTick}/טיק</span>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(192,112,255,0.45)' }}>ניסיון</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', fontFamily: 'var(--font-body, sans-serif)' }}>
                    {formatNumber(hero.xp)} / {formatNumber(xpForNextLevel)} — {xpPct}%
                  </span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${xpPct}%`, background: 'linear-gradient(90deg, #6D28D9, #A855F7, #C070FF)', borderRadius: 4, boxShadow: '0 0 6px rgba(192,112,255,0.4)', transition: 'width 0.4s ease' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment return banner (from Lemon redirect) */}
        {paymentStatus === 'success' && (
          <div style={{
            padding: '11px 16px', borderRadius: 9,
            background: 'rgba(74,222,128,0.07)',
            border: '1px solid rgba(74,222,128,0.25)',
            color: '#4ade80',
            fontFamily: 'var(--font-body, sans-serif)', fontSize: 13,
          }}>
            ✓ התשלום התקבל! המאנה והתורות יעודכנו בחשבונך תוך דקה.
          </div>
        )}
        {paymentStatus === 'cancel' && (
          <div style={{
            padding: '11px 16px', borderRadius: 9,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.45)',
            fontFamily: 'var(--font-body, sans-serif)', fontSize: 13,
          }}>
            הרכישה בוטלה — תוכל לרכוש בכל עת.
          </div>
        )}

        {/* Message (in-page action feedback) */}
        {message && (
          <div style={{
            padding: '9px 16px', borderRadius: 9,
            background: message.ok ? 'rgba(74,222,128,0.07)' : 'rgba(255,85,85,0.07)',
            border: `1px solid ${message.ok ? 'rgba(74,222,128,0.22)' : 'rgba(255,85,85,0.22)'}`,
            color: message.ok ? '#4ade80' : '#FF6060',
            fontFamily: 'var(--font-body, sans-serif)', fontSize: 13,
          }}>
            {message.text}
          </div>
        )}

        {/* ── Premium 2-tab panel ─────────────────────────────────────────── */}
        <div style={outerPanel}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {(['spells', 'buy'] as const).map((tab) => {
              const active = premiumTab === tab
              return (
                <button key={tab} onClick={() => setPremiumTab(tab)} style={{
                  flex: 1, padding: '11px 8px',
                  fontFamily: 'var(--font-heading, sans-serif)',
                  fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: active ? '#F0C030' : 'rgba(255,255,255,0.3)',
                  background: active ? 'rgba(240,192,48,0.05)' : 'transparent',
                  borderBottom: active ? '2px solid rgba(240,192,48,0.5)' : '2px solid transparent',
                  cursor: 'pointer', transition: 'all 0.15s ease', fontWeight: active ? 700 : 400,
                }}>
                  {tab === 'spells' ? 'הפעלת קסמים' : 'רכישת מאנה'}
                </button>
              )
            })}
          </div>

          {/* ── TAB 1: הפעלת קסמים ──────────────────────────────────────── */}
          {premiumTab === 'spells' && (
            <div>
              <SectionLabel label="מגנים" />

              <ShieldRow
                icon={<img src="/icons/solders.png" style={{width:18,height:18,objectFit:'contain'}} alt="" />} label="מגן חיילים" effect="חוסם נפילות חיילים בהגנה"
                shieldKey="soldier_shield" status={soldierStatus} currentMana={hero.mana}
                selectedHours={soldierHours} onSelectHours={setSoldierHours}
                onActivate={setConfirmPayload}
              />

              <div style={rowDivider} />

              <ShieldRow
                icon={<img src="/icons/gold.png" style={{width:18,height:18,objectFit:'contain'}} alt="" />} label="מגן משאבים" effect="חוסם ביזת משאבים בתקיפה"
                shieldKey="resource_shield" status={resourceStatus} currentMana={hero.mana}
                selectedHours={resourceHours} onSelectHours={setResourceHours}
                onActivate={setConfirmPayload}
              />

              <SectionLabel label="חיזוקים · 24 שעות" />

              {BOOST_ACTIONS.map((cat, i) => (
                <div key={cat.key}>
                  {i > 0 && <div style={rowDivider} />}
                  <BoostRow
                    cat={cat}
                    tierIdx={boostTiers[cat.key]}
                    onSelectTier={(t) => setBoostTiers((prev) => ({ ...prev, [cat.key]: t }))}
                  />
                </div>
              ))}

              <div style={{ height: 8 }} />
            </div>
          )}

          {/* ── TAB 2: רכישת מאנה ────────────────────────────────────────── */}
          {premiumTab === 'buy' && (
            <div style={{ paddingTop: 8, paddingBottom: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {MANA_PACKAGES.map((pkg) => {
                const packKey = String(pkg.mana)
                return (
                  <ManaPackageCard
                    key={pkg.name}
                    pkg={pkg}
                    loading={buyingPackKey === packKey}
                    onBuy={() => handleBuyPack(packKey)}
                  />
                )
              })}
            </div>
          )}

        </div>

      </div>
    </>
  )
}
