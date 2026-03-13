'use client'

import { useState } from 'react'
import { Zap, Shield, Sword, Eye, Radar, X } from 'lucide-react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { PlayerHeroEffect } from '@/lib/game/hero-effects'

// ── Constants ─────────────────────────────────────────────────────────────────

const MANA_PER_HOUR    = BALANCE.hero.SHIELD_MANA_PER_HOUR          // 25
const COOLDOWN_HOURS   = BALANCE.hero.SHIELD_COOLDOWN_HOURS          // 1
const XP_PER_LEVEL     = BALANCE.hero.xpPerLevel                     // 100
const DURATION_PRESETS = BALANCE.hero.SHIELD_DURATION_PRESETS as unknown as readonly number[]
// [4, 8, 12, 15, 23]

const BOOST_MANA = BALANCE.hero.BOOST_MANA  // { SMALL: 50, MEDIUM: 100, LARGE: 150 }

const MANA_PACKAGES = [
  { name: 'ניצוץ',   mana: 2500,  turns: 250,  priceUSD: 9.90,  bonus: null,         popular: false },
  { name: 'שלהבת',   mana: 5500,  turns: 550,  priceUSD: 19.90, bonus: null,         popular: false },
  { name: 'לפיד',    mana: 11000, turns: 1100, priceUSD: 39.90, bonus: null,         popular: true  },
  { name: 'מבול',    mana: 27000, turns: 2700, priceUSD: 79.90, bonus: 'גיבור מתנה!', popular: false },
] as const

const BOOST_ACTIONS = [
  { key: 'production', label: 'ייצור',  Icon: Zap,    color: '#FACC15', colorRgb: '250,204,21',  tiers: ['+10%', '+20%', '+30%'] },
  { key: 'defense',    label: 'הגנה',   Icon: Shield, color: '#38BDF8', colorRgb: '56,189,248',  tiers: ['+10%', '+20%', '+30%'] },
  { key: 'attack',     label: 'התקפה',  Icon: Sword,  color: '#F87171', colorRgb: '248,113,113', tiers: ['+5%',  '+10%', '+15%'] },
  { key: 'spy',        label: 'ריגול',  Icon: Eye,    color: '#C084FC', colorRgb: '192,132,252', tiers: ['+15%', '+25%', '+35%'] },
  { key: 'scout',      label: 'סיור',   Icon: Radar,  color: '#2DD4BF', colorRgb: '45,212,191',  tiers: ['+10%', '+20%', '+30%'] },
] as const

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  activeEffects: PlayerHeroEffect[]
}

type ShieldKey = 'soldier_shield' | 'resource_shield'

type ShieldStatus =
  | { state: 'active';   endsAt: string }
  | { state: 'cooldown'; cooldownEndsAt: string }
  | { state: 'available' }

interface ConfirmPayload {
  kind:     'shield' | 'boost'
  // for shield activations
  shieldKey?: ShieldKey
  hours?:    number
  // display-ready fields
  icon:      string          // emoji or text glyph
  label:     string
  detail:    string          // "הגנה למשך X שעות" or "+10% למשך 24 שעות"
  manaCost:  number
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

// ── Styles ────────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
  background: 'linear-gradient(160deg, rgba(10,8,22,0.99), rgba(5,4,14,1))',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 12, overflow: 'hidden',
}

const divider: React.CSSProperties = { borderTop: '1px solid rgba(255,255,255,0.05)' }

function manaChip(): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: 11, padding: '2px 8px', borderRadius: 5, flexShrink: 0,
    background: 'rgba(96,176,255,0.07)', border: '1px solid rgba(96,176,255,0.2)',
    color: '#93C5FD', fontFamily: 'var(--font-body, sans-serif)', whiteSpace: 'nowrap',
  }
}

// ── Confirmation Modal ────────────────────────────────────────────────────────

function ConfirmModal({
  payload, loading, onConfirm, onCancel,
}: {
  payload:   ConfirmPayload
  loading:   boolean
  onConfirm: () => void
  onCancel:  () => void
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, rgba(18,10,36,0.99), rgba(8,5,20,1))',
        border: '1px solid rgba(192,112,255,0.35)',
        borderRadius: 14, padding: '24px 28px', width: '100%', maxWidth: 340,
        boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(192,112,255,0.1)',
        position: 'relative',
      }}>
        {/* Close */}
        <button
          onClick={onCancel}
          style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: 4 }}
        >
          <X size={14} />
        </button>

        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(192,112,255,0.5)', marginBottom: 6 }}>
            אישור הפעלה
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{payload.icon}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 15, fontWeight: 700, color: '#F0C030', letterSpacing: '0.05em' }}>
                {payload.label}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body, sans-serif)', marginTop: 2 }}>
                {payload.detail}
              </div>
            </div>
          </div>
        </div>

        {/* Cost */}
        <div style={{
          background: 'rgba(96,176,255,0.06)', border: '1px solid rgba(96,176,255,0.18)',
          borderRadius: 8, padding: '10px 14px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-body, sans-serif)' }}>עלות מאנה</span>
          <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 16, fontWeight: 700, color: '#93C5FD' }}>
            🔮 {payload.manaCost}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" size="sm" onClick={onCancel} style={{ flex: 1 }}>ביטול</Button>
          <Button variant="magic" size="sm" loading={loading} onClick={onConfirm} style={{ flex: 1 }}>אשר הפעלה</Button>
        </div>
      </div>
    </div>
  )
}

// ── ShieldRow ─────────────────────────────────────────────────────────────────

function ShieldRow({
  icon, label, effect, shieldKey, status, currentMana,
  selectedHours, onSelectHours, onActivate,
}: {
  icon: string; label: string; effect: string
  shieldKey: ShieldKey
  status: ShieldStatus; currentMana: number
  selectedHours: number
  onSelectHours: (h: number) => void
  onActivate: (payload: ConfirmPayload) => void
}) {
  const manaCost    = selectedHours * MANA_PER_HOUR
  const canActivate = status.state === 'available' && currentMana >= manaCost
  const isActive    = status.state === 'active'
  const isCooldown  = status.state === 'cooldown'

  return (
    <div style={{ padding: '13px 16px' }}>
      {/* Top row: icon + label + status badge + action button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0, width: 24, textAlign: 'center' }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2 }}>
              {label}
            </span>
            {isActive && (
              <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-body, sans-serif)', lineHeight: 1.4 }}>
                ● פעיל · פג ב-{timeRemaining((status as { state: 'active'; endsAt: string }).endsAt) ?? 'עוד מעט'}
              </span>
            )}
            {isCooldown && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-body, sans-serif)', lineHeight: 1.4 }}>
                קירור · {timeRemaining((status as { state: 'cooldown'; cooldownEndsAt: string }).cooldownEndsAt) ?? 'עוד מעט'}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body, sans-serif)', marginTop: 2, lineHeight: 1.3 }}>{effect}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={manaChip()}>🔮 {manaCost}</span>
          <Button
            variant={isActive ? 'ghost' : 'primary'}
            size="sm"
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
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', paddingInlineStart: 34 }}>
          {DURATION_PRESETS.map((h) => (
            <button
              key={h}
              onClick={() => onSelectHours(h)}
              style={{
                padding: '3px 9px', borderRadius: 5, fontSize: 10,
                background: selectedHours === h ? 'rgba(147,197,253,0.15)' : 'rgba(255,255,255,0.04)',
                border: selectedHours === h ? '1px solid rgba(147,197,253,0.45)' : '1px solid rgba(255,255,255,0.08)',
                color: selectedHours === h ? '#93C5FD' : 'rgba(255,255,255,0.3)',
                cursor: 'pointer', fontFamily: 'var(--font-body, sans-serif)',
                transition: 'all 0.12s ease',
              }}
            >
              {h}ש
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── BoostRow ──────────────────────────────────────────────────────────────────

function BoostRow({
  cat, tierIdx, onSelectTier,
}: {
  cat: typeof BOOST_ACTIONS[number]
  tierIdx: 0 | 1 | 2
  onSelectTier: (i: 0 | 1 | 2) => void
}) {
  const tierLabels = ['קטן', 'בינוני', 'גדול'] as const
  const tierMana   = [BOOST_MANA.SMALL, BOOST_MANA.MEDIUM, BOOST_MANA.LARGE]
  const { Icon }   = cat

  return (
    <div style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon style={{ width: 16, height: 16, color: cat.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.78)' }}>
          {cat.label}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-body, sans-serif)', marginInlineStart: 6 }}>
          {cat.tiers[tierIdx]} · 24ש
        </span>
      </div>
      {/* Tier pills */}
      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
        {tierLabels.map((lbl, i) => (
          <button
            key={lbl}
            onClick={() => onSelectTier(i as 0 | 1 | 2)}
            style={{
              padding: '3px 7px', borderRadius: 5, fontSize: 10,
              background: tierIdx === i ? `rgba(${cat.colorRgb},0.16)` : 'rgba(255,255,255,0.04)',
              border: tierIdx === i ? `1px solid rgba(${cat.colorRgb},0.5)` : '1px solid rgba(255,255,255,0.08)',
              color: tierIdx === i ? cat.color : 'rgba(255,255,255,0.28)',
              cursor: 'pointer', transition: 'all 0.12s ease',
              fontFamily: 'var(--font-body, sans-serif)',
            }}
          >
            {lbl}
          </button>
        ))}
      </div>
      <span style={manaChip()}>🔮 {tierMana[tierIdx]}</span>
      <Button variant="magic" size="sm" disabled style={{ flexShrink: 0, opacity: 0.42 }}>
        הפעל
      </Button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function HeroClient({ activeEffects }: Props) {
  const { hero, refresh, applyPatch } = usePlayer()

  const [localEffects,   setLocalEffects]   = useState<PlayerHeroEffect[]>(activeEffects)
  const [shieldLoading,  setShieldLoading]  = useState(false)
  const [message,        setMessage]        = useState<{ text: string; ok: boolean } | null>(null)
  const [premiumTab,     setPremiumTab]     = useState<'spells' | 'buy'>('spells')
  const [confirmPayload, setConfirmPayload] = useState<ConfirmPayload | null>(null)

  // Per-shield selected duration
  const [soldierHours,   setSoldierHours]   = useState<number>(DURATION_PRESETS[2])   // 12h default
  const [resourceHours,  setResourceHours]  = useState<number>(DURATION_PRESETS[2])

  // Per-boost selected tier
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

  // ── Shield activation ──────────────────────────────────────────────────────

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
          id:               `local-${Date.now()}`,
          player_id:        '',
          type:             effectType,
          starts_at:        new Date().toISOString(),
          ends_at:          data.data.ends_at,
          cooldown_ends_at: data.data.cooldown_ends_at,
          metadata:         null,
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
    // boosts: disabled for now, but flow is wired
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Confirmation modal */}
      {confirmPayload && (
        <ConfirmModal
          payload={confirmPayload}
          loading={shieldLoading}
          onConfirm={handleConfirmActivate}
          onCancel={() => setConfirmPayload(null)}
        />
      )}

      <div className="space-y-4">

        {/* ── Hero identity ───────────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(160deg, rgba(22,8,42,0.99), rgba(10,4,22,1))',
          border: '1px solid rgba(192,112,255,0.28)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(192,112,255,0.8) 40%, rgba(240,192,48,0.6) 70%, transparent)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
            {/* Emblem */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: 'radial-gradient(circle at 38% 32%, rgba(192,112,255,0.28), rgba(8,3,20,1))',
                border: '2px solid rgba(192,112,255,0.45)',
                boxShadow: '0 0 20px rgba(192,112,255,0.22)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
              }}>
                ⚔️
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
            {/* Stats */}
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

        {/* Message */}
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
        <div style={panel}>

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

          {/* ── TAB 1: Spell activation ───────────────────────────────────── */}
          {premiumTab === 'spells' && (
            <div>
              {/* Section label */}
              <div style={{ padding: '8px 16px 0', fontSize: 9, fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)' }}>
                מגנים
              </div>

              <ShieldRow
                icon="🗡️"
                label="מגן חיילים"
                effect="חוסם נפילות חיילים בהגנה"
                shieldKey="soldier_shield"
                status={soldierStatus}
                currentMana={hero.mana}
                selectedHours={soldierHours}
                onSelectHours={setSoldierHours}
                onActivate={setConfirmPayload}
              />

              <div style={divider} />

              <ShieldRow
                icon="💰"
                label="מגן משאבים"
                effect="חוסם ביזת משאבים בתקיפה"
                shieldKey="resource_shield"
                status={resourceStatus}
                currentMana={hero.mana}
                selectedHours={resourceHours}
                onSelectHours={setResourceHours}
                onActivate={setConfirmPayload}
              />

              <div style={{ ...divider, marginTop: 4 }} />

              {/* Section label */}
              <div style={{ padding: '8px 16px 0', fontSize: 9, fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)' }}>
                חיזוקים · 24 שעות
              </div>

              {BOOST_ACTIONS.map((cat, i) => (
                <div key={cat.key}>
                  {i > 0 && <div style={divider} />}
                  <BoostRow
                    cat={cat}
                    tierIdx={boostTiers[cat.key]}
                    onSelectTier={(t) => setBoostTiers((prev) => ({ ...prev, [cat.key]: t }))}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── TAB 2: Buy mana ──────────────────────────────────────────── */}
          {premiumTab === 'buy' && (
            <div>
              {MANA_PACKAGES.map((pkg, i) => (
                <div key={pkg.name}>
                  {i > 0 && <div style={divider} />}
                  <div style={{
                    padding: '13px 16px',
                    background: pkg.popular ? 'rgba(201,144,26,0.05)' : 'transparent',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    {/* Name */}
                    <div style={{ width: 54, flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 12, fontWeight: 700, color: pkg.popular ? '#F0C030' : 'rgba(255,255,255,0.55)', letterSpacing: '0.04em', lineHeight: 1.2 }}>
                        {pkg.name}
                      </div>
                      {pkg.popular && (
                        <div style={{ fontSize: 9, color: 'rgba(240,192,48,0.5)', fontFamily: 'var(--font-body, sans-serif)', marginTop: 1 }}>★ פופולרי</div>
                      )}
                    </div>
                    {/* Mana + turns */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 12 }}>🔮</span>
                        <span style={{ fontFamily: 'var(--font-display, serif)', fontSize: 15, color: '#d8b4fe', fontWeight: 700 }}>
                          {pkg.mana.toLocaleString()}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontFamily: 'var(--font-body, sans-serif)' }}>מאנה</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 11 }}>⚡</span>
                        <span style={{ fontFamily: 'var(--font-display, serif)', fontSize: 13, color: '#FDE68A', fontWeight: 600 }}>
                          {pkg.turns.toLocaleString()}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontFamily: 'var(--font-body, sans-serif)' }}>תורות</span>
                        {pkg.bonus && (
                          <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,0.09)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '1px 7px', fontFamily: 'var(--font-body, sans-serif)', marginInlineStart: 3 }}>
                            {pkg.bonus}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Price + CTA */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: 700 }}>
                        ${pkg.priceUSD.toFixed(2)}
                      </span>
                      <Button variant={pkg.popular ? 'primary' : 'ghost'} size="sm" disabled>
                        רכוש
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

      </div>
    </>
  )
}
