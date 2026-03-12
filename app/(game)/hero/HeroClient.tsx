'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { HeroSpell } from '@/types/game'
import type { PlayerHeroEffect } from '@/lib/game/hero-effects'

// ── Game config (unchanged) ───────────────────────────────────────────────────

const CFG = {
  SOLDIER_MANA:  BALANCE.hero.SOLDIER_SHIELD_MANA  ?? 10,
  RESOURCE_MANA: BALANCE.hero.RESOURCE_SHIELD_MANA ?? 10,
  SHIELD_HOURS:  BALANCE.hero.SHIELD_ACTIVE_HOURS   ?? 23,
  XP_PER_LEVEL:  BALANCE.hero.xpPerLevel            ?? 100,
} as const

// ── Display metadata (UI only — no gameplay meaning) ─────────────────────────

type PathDef = { name: string; tiers: [string, string, string, string, string] }

const MASTERY_PATHS: Record<string, [PathDef, PathDef, PathDef]> = {
  combat: [
    { name: 'זעם הברסרקר',    tiers: ['מכה עזה',        'זעם קרב',        'זעם ברזל',       'טירוף מלחמה',     'חרב הברסרקר']   },
    { name: 'קצה האדון',      tiers: ['מכה טקטית',      'שליטת קרב',      'פיקוד מלחמה',    'מומחיות מצור',    'רצון האדון']    },
    { name: 'שבועת דם',       tiers: ['מחיר הדם',       'רעב קרב',        'ברית לוחמים',    'גאות כבוד',       'ברית המוות']    },
  ],
  defense: [
    { name: 'מבצר האבן',      tiers: ['מוקשה',          'חומות',          'רוח מבצר',       'שמירת גרניט',     'בלתי שביר']     },
    { name: 'שבועת השומר',    tiers: ['משמר',            'שומר',           'חומת מגנים',     'שומר ברזל',       'מבצר נצחי']     },
    { name: 'נחישות פלדה',    tiers: ['יציב',            'עמידות',         'רצון ברזל',      'איתן',            'בלתי מנוצח']    },
  ],
  spy: [
    { name: 'צעדי הצל',       tiers: ['רגל קלה',        'מיזוג בצל',      'הליכת רוח',      'צעד רפאים',       'היעלמות']       },
    { name: 'מסך הרמייה',     tiers: ['הטעיה',           'שביל מזויף',     'תעלול מחשבה',    'כיסוי עמוק',      'אדון הרמייה']   },
    { name: 'עין הריק',       tiers: ['עין חדה',         'ראיית לילה',     'ראיית ריק',      'עין הנפש',        'כול-ידיעה']     },
  ],
  scout: [
    { name: 'שביל הסייר',     tiers: ['הליכת יער',      'חוש שביל',       'סיור מרוחק',     'טווח רחוק',       'שביל הנשר']     },
    { name: 'משמר הנשר',      tiers: ['מצפה גבוה',      'עין נשר',        'מבט הבז',        'רואה-הכל',        'נשגב']          },
    { name: 'רוכב הרוח',      tiers: ['מהיר',            'קל רגל',         'צעד רוח',        'גאות סערה',       'רוכב סערה']     },
  ],
  production: [
    { name: 'מנהל העבדים',    tiers: ['מפקח',            'אדון משימות',    'יד השוט',        'אחיזת ברזל',      'שליטה מוחלטת']  },
    { name: 'מרשל השדה',      tiers: ['מאורגן',          'יעיל',           'אופטימלי',       'תפוקת שיא',       'תשואה מרבית']   },
    { name: 'אדון המשאבים',   tiers: ['מלאי',            'אגירה',          'אדון מאגר',      'שומר הכספת',      'אל המשאבים']    },
  ],
  utility: [
    { name: 'זרימת הארקן',    tiers: ['ברז מאנה',        'קו כוח',         'מצב זרימה',      'ערוץ כוח',        'שיטפון מאנה']   },
    { name: 'שליטת תורות',    tiers: ['לומד מהיר',       'חוש זמן',        'פריצת פעולה',    'חיפזון',          'אדון הזמן']     },
    { name: 'חסד המזל',       tiers: ['מזלן',            'ברוך',           'חיוך המזל',      'גורלי',           'בן הגורל']      },
  ],
}

type CategoryMeta = {
  label: string; icon: string; subtitle: string
  color: string; glowRgb: string; panelBg: string; headerBg: string
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  combat:     { label: 'שליטת קרב',    icon: '\u2694\uFE0F',  subtitle: 'שלוט בשדה הקרב',
                color: '#FF5555', glowRgb: '255,85,85',
                panelBg: 'linear-gradient(160deg, rgba(35,6,6,0.97), rgba(16,3,3,1))',
                headerBg: 'rgba(255,85,85,0.1)' },
  defense:    { label: 'מבצר ברזל',    icon: '\uD83D\uDEE1\uFE0F',  subtitle: 'הגנה בלתי נשברת',
                color: '#F0C030', glowRgb: '240,192,48',
                panelBg: 'linear-gradient(160deg, rgba(35,28,3,0.97), rgba(16,13,2,1))',
                headerBg: 'rgba(240,192,48,0.1)' },
  spy:        { label: 'אמנות הצל',    icon: '\uD83C\uDF11',  subtitle: 'אדון הרמייה',
                color: '#C070FF', glowRgb: '192,112,255',
                panelBg: 'linear-gradient(160deg, rgba(22,7,40,0.97), rgba(10,3,20,1))',
                headerBg: 'rgba(192,112,255,0.1)' },
  scout:      { label: 'שביל הסייר',   icon: '\uD83D\uDC41\uFE0F',  subtitle: 'עיני הממלכה',
                color: '#60B0FF', glowRgb: '96,176,255',
                panelBg: 'linear-gradient(160deg, rgba(3,16,38,0.97), rgba(2,8,18,1))',
                headerBg: 'rgba(96,176,255,0.1)' },
  production: { label: 'שליטת ייצור',  icon: '\u2699\uFE0F',  subtitle: 'שליטה מוחלטת במשאבים',
                color: '#48D0A0', glowRgb: '72,208,160',
                panelBg: 'linear-gradient(160deg, rgba(3,24,18,0.97), rgba(2,11,8,1))',
                headerBg: 'rgba(72,208,160,0.1)' },
  utility:    { label: 'אמנות הארקן',  icon: '\u2736',   subtitle: 'סודות הנסתר',
                color: '#9898C0', glowRgb: '152,152,192',
                panelBg: 'linear-gradient(160deg, rgba(10,10,22,0.97), rgba(5,5,14,1))',
                headerBg: 'rgba(152,152,192,0.1)' },
}

const CATEGORY_KEYS = ['combat', 'defense', 'spy', 'scout', 'production', 'utility'] as const

// ── Logic helpers (unchanged) ─────────────────────────────────────────────────

function buildSpellKey(category: string, col: number, row: number) {
  return `${category}_${col}_${row}`
}

function timeRemaining(endsAt: string): string | null {
  const ms = new Date(endsAt).getTime() - Date.now()
  if (ms <= 0) return null
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function heroTitle(level: number): string {
  if (level >= 50) return 'ארכימאג גרנד'
  if (level >= 25) return 'ארכימאג'
  if (level >= 10) return 'בקיא'
  if (level >= 5)  return 'חניך'
  return 'טירון'
}

type ShieldStatus =
  | { state: 'active';    endsAt: string }
  | { state: 'cooldown';  cooldownEndsAt: string }
  | { state: 'available' }

function getShieldStatus(
  effects: PlayerHeroEffect[],
  type: 'SOLDIER_SHIELD' | 'RESOURCE_SHIELD',
): ShieldStatus {
  const now = Date.now()
  const matching = effects.filter((e) => e.type === type)
  if (matching.length === 0) return { state: 'available' }
  const sorted = [...matching].sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
  )
  const latest = sorted[0]
  if (now < new Date(latest.ends_at).getTime()) {
    return { state: 'active', endsAt: latest.ends_at }
  }
  if (latest.cooldown_ends_at && now < new Date(latest.cooldown_ends_at).getTime()) {
    return { state: 'cooldown', cooldownEndsAt: latest.cooldown_ends_at }
  }
  return { state: 'available' }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  heroSpells:    HeroSpell[]
  activeEffects: PlayerHeroEffect[]
}

// ── Main component ────────────────────────────────────────────────────────────

export function HeroClient({ heroSpells, activeEffects }: Props) {
  const { hero, refresh, applyPatch } = usePlayer()

  const [purchasedSpells, setPurchasedSpells] = useState<Set<string>>(
    new Set<string>(heroSpells.map((s) => s.spell_key))
  )
  const [localEffects, setLocalEffects]   = useState<PlayerHeroEffect[]>(activeEffects)
  const [loading, setLoading]             = useState<string | null>(null)
  const [shieldLoading, setShieldLoading] = useState<string | null>(null)
  const [message, setMessage]             = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  if (!hero) return null

  const xpForNextLevel   = hero.level * CFG.XP_PER_LEVEL
  const xpPct            = Math.min(100, Math.round((hero.xp / xpForNextLevel) * 100))
  const manaPct          = Math.min(100, Math.round((hero.mana / 100) * 100))
  const manaPerTickTotal =
    (BALANCE.hero.manaPerTick?.base ?? 1) +
    (hero.level >= 10 ? (BALANCE.hero.manaPerTick?.level10bonus ?? 0) : 0) +
    (hero.level >= 50 ? (BALANCE.hero.manaPerTick?.level50bonus ?? 0) : 0)

  const soldierStatus  = getShieldStatus(localEffects, 'SOLDIER_SHIELD')
  const resourceStatus = getShieldStatus(localEffects, 'RESOURCE_SHIELD')

  async function handlePurchaseSpell(spellKey: string) {
    if (hero.spell_points <= 0) return
    setLoading(spellKey)
    setMessage(null)
    try {
      const res = await fetch('/api/hero/spell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spell_key: spellKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'רכישת לחש נכשלה', type: 'error' })
      } else {
        setMessage({ text: 'לחש נלמד!', type: 'success' })
        setPurchasedSpells((prev) => new Set<string>([...Array.from(prev), spellKey]))
        applyPatch({ hero: { ...hero, spell_points: hero.spell_points - 1 } })
        refresh()
      }
    } catch {
      setMessage({ text: 'שגיאת רשת', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handleActivateShield(shieldType: 'soldier_shield' | 'resource_shield') {
    const manaCost = shieldType === 'soldier_shield' ? CFG.SOLDIER_MANA : CFG.RESOURCE_MANA
    if (hero.mana < manaCost) return
    setShieldLoading(shieldType)
    setMessage(null)
    try {
      const res = await fetch('/api/hero/activate-shield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shield_type: shieldType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'הפעלת מגן נכשלה', type: 'error' })
      } else {
        const label = shieldType === 'soldier_shield' ? 'מגן חיילים' : 'מגן משאבים'
        setMessage({ text: `${label} הופעל ל-${CFG.SHIELD_HOURS} שעות!`, type: 'success' })
        applyPatch({ hero: { ...hero, mana: hero.mana - manaCost } })
        const effectType: 'SOLDIER_SHIELD' | 'RESOURCE_SHIELD' = shieldType === 'soldier_shield' ? 'SOLDIER_SHIELD' : 'RESOURCE_SHIELD'
        setLocalEffects((prev) => [
          ...prev,
          {
            id:               `local-${Date.now()}`,
            player_id:        '',
            type:             effectType,
            starts_at:        new Date().toISOString(),
            ends_at:          data.data.ends_at,
            cooldown_ends_at: data.data.cooldown_ends_at,
            metadata:         null,
          },
        ])
        refresh()
      }
    } catch {
      setMessage({ text: 'שגיאת רשת', type: 'error' })
    } finally {
      setShieldLoading(null)
    }
  }

  return (
    <div className="space-y-5">

      {/* ── Hero Identity ──────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(160deg, rgba(22,8,42,0.99), rgba(10,4,22,1))',
        border: '1px solid rgba(192,112,255,0.3)',
        boxShadow: '0 0 48px rgba(192,112,255,0.1)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {/* Accent band */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, transparent 0%, rgba(192,112,255,0.9) 30%, rgba(240,192,48,0.7) 70%, transparent 100%)' }} />

        <div style={{ display: 'flex', gap: 28, padding: '24px 28px', alignItems: 'center', flexWrap: 'wrap' }}>

          {/* Emblem */}
          <div style={{ flexShrink: 0, position: 'relative' }}>
            <div style={{
              width: 112, height: 112, borderRadius: '50%',
              background: 'radial-gradient(circle at 38% 30%, rgba(192,112,255,0.28), rgba(8,3,20,1))',
              border: '2px solid rgba(192,112,255,0.5)',
              boxShadow: '0 0 36px rgba(192,112,255,0.35), inset 0 0 24px rgba(192,112,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 46,
            }}>
              {'\u2694\uFE0F'}
            </div>
            {/* Outer glow ring */}
            <div style={{
              position: 'absolute', inset: -10, borderRadius: '50%',
              border: '1px solid rgba(240,192,48,0.18)',
              pointerEvents: 'none',
            }} />
            {/* Level badge */}
            <div style={{
              position: 'absolute', bottom: -1, right: -4,
              background: 'linear-gradient(135deg, #7C3AED, #A855F7)',
              border: '1px solid rgba(240,192,48,0.55)',
              borderRadius: 20, padding: '2px 9px',
              fontSize: 11, fontWeight: 700, color: '#fff',
              fontFamily: 'var(--font-display, serif)',
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap',
            }}>
              LVL {hero.level}
            </div>
          </div>

          {/* Stats */}
          <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display, serif)', fontSize: 24, fontWeight: 700, color: '#C070FF', letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1 }}>
                  Hero
                </div>
                <div style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 11, color: 'rgba(192,112,255,0.5)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 4 }}>
                  Level {hero.level} {heroTitle(hero.level)}
                </div>
              </div>
              {hero.spell_points > 0 && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(240,192,48,0.18), rgba(180,130,20,0.08))',
                  border: '1px solid rgba(240,192,48,0.55)',
                  boxShadow: '0 0 14px rgba(240,192,48,0.2)',
                  borderRadius: 8, padding: '7px 16px',
                  fontSize: 12, fontWeight: 700, color: '#F0C030',
                  fontFamily: 'var(--font-heading, sans-serif)',
                  letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}>
                  {'\u2736'} {hero.spell_points} {hero.spell_points === 1 ? 'נקודת לחש' : 'נקודות לחש'} מוכנות
                </div>
              )}
            </div>

            {/* XP bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(192,112,255,0.65)' }}>ניסיון</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-body, sans-serif)', color: 'rgba(255,255,255,0.35)' }}>
                  {formatNumber(hero.xp)} / {formatNumber(xpForNextLevel)} &mdash; {xpPct}% לרמה {hero.level + 1}
                </span>
              </div>
              <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 7, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${xpPct}%`,
                  background: 'linear-gradient(90deg, #6D28D9, #A855F7, #C070FF)',
                  borderRadius: 7,
                  boxShadow: '0 0 10px rgba(192,112,255,0.6)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

            {/* Mana bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(96,176,255,0.65)' }}>מאנה</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-body, sans-serif)', color: 'rgba(255,255,255,0.35)' }}>
                  {hero.mana} / 100 &nbsp;&middot;&nbsp; +{manaPerTickTotal}/טיק
                  {hero.level >= 10 && <span style={{ color: 'rgba(255,255,255,0.22)' }}> (בונוס רמה 10+ פעיל)</span>}
                </span>
              </div>
              <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 7, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${manaPct}%`,
                  background: 'linear-gradient(90deg, #1D4ED8, #3B82F6, #60B0FF)',
                  borderRadius: 7,
                  boxShadow: '0 0 10px rgba(96,176,255,0.5)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Message ────────────────────────────────────────────────────────────── */}
      {message && (
        <div className={`rounded-game-lg border px-4 py-3 font-body text-game-sm ${
          message.type === 'success'
            ? 'bg-game-green/10 border-green-900 text-game-green-bright'
            : 'bg-game-red/10 border-red-900 text-game-red-bright'
        }`}>
          {message.text}
        </div>
      )}

      {/* ── Active Powers ─────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(160deg, rgba(10,10,22,0.98), rgba(5,5,14,1))',
        border: '1px solid rgba(255,255,255,0.09)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {/* Section header */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 14 }}>{'\u26A1'}</span>
          <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>
            Active Powers
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginInlineStart: 2 }}>
            Arcane abilities that shape the battlefield
          </span>
        </div>

        {/* Shield cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          <ShieldAbility
            icon={'\uD83D\uDDE1\uFE0F'}
            label="Soldier Shield"
            lore={`Forges an arcane barrier around your army, preventing all soldier losses in combat for ${CFG.SHIELD_HOURS} hours.`}
            accentColor="#FF5555"
            glowRgb="255,85,85"
            manaCost={CFG.SOLDIER_MANA}
            currentMana={hero.mana}
            status={soldierStatus}
            loading={shieldLoading === 'soldier_shield'}
            onActivate={() => handleActivateShield('soldier_shield')}
            hasDivider
          />
          <ShieldAbility
            icon={'\uD83D\uDCB0'}
            label="Resource Shield"
            lore={`Seals your treasury with ancient magic, making your gold and resources untouchable for ${CFG.SHIELD_HOURS} hours.`}
            accentColor="#F0C030"
            glowRgb="240,192,48"
            manaCost={CFG.RESOURCE_MANA}
            currentMana={hero.mana}
            status={resourceStatus}
            loading={shieldLoading === 'resource_shield'}
            onActivate={() => handleActivateShield('resource_shield')}
            hasDivider={false}
          />
        </div>

        {/* Footer note */}
        <div style={{ padding: '8px 20px 12px', fontSize: 10, color: 'rgba(255,255,255,0.22)', fontFamily: 'var(--font-body, sans-serif)' }}>
          Shield lasts {CFG.SHIELD_HOURS}h active &middot; {BALANCE.hero.SHIELD_COOLDOWN_HOURS ?? 1}h cooldown before next cast &middot; Shield status is visible to other players (no timer shown)
        </div>
      </div>

      {/* ── Power Domains ─────────────────────────────────────────────────────── */}
      <div>
        {/* Section heading */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(240,192,48,0.6)', marginBottom: 4 }}>
              Spell Mastery
            </div>
            <div style={{ fontFamily: 'var(--font-display, serif)', fontSize: 20, color: '#F0C030', letterSpacing: '0.04em', textTransform: 'uppercase', lineHeight: 1 }}>
              Power Domains
            </div>
          </div>
          {hero.spell_points > 0 && (
            <div style={{
              fontSize: 11, color: 'rgba(240,192,48,0.75)',
              fontFamily: 'var(--font-body, sans-serif)',
              background: 'rgba(240,192,48,0.08)',
              border: '1px solid rgba(240,192,48,0.22)',
              borderRadius: 6, padding: '5px 12px',
              whiteSpace: 'nowrap',
            }}>
              {hero.spell_points} point{hero.spell_points !== 1 ? 's' : ''} to spend
            </div>
          )}
        </div>

        {/* Category panels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CATEGORY_KEYS.map((catKey) => (
            <MasteryPanel
              key={catKey}
              catKey={catKey}
              meta={CATEGORY_META[catKey]}
              paths={MASTERY_PATHS[catKey]}
              purchasedSpells={purchasedSpells}
              hasSpellPoints={hero.spell_points > 0}
              loading={loading}
              onPurchase={handlePurchaseSpell}
            />
          ))}
        </div>

        <div style={{ marginTop: 14, fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: 'var(--font-body, sans-serif)', textAlign: 'center' }}>
          Each tier within a path must be unlocked in order &middot; Each spell costs 1 spell point &middot; Points are earned on level up
        </div>
      </div>

    </div>
  )
}

// ── ShieldAbility ─────────────────────────────────────────────────────────────

interface ShieldAbilityProps {
  icon:         string
  label:        string
  lore:         string
  accentColor:  string
  glowRgb:      string
  manaCost:     number
  currentMana:  number
  status:       ShieldStatus
  loading:      boolean
  onActivate:   () => void
  hasDivider:   boolean
}

function ShieldAbility({
  icon, label, lore, accentColor, glowRgb,
  manaCost, currentMana, status, loading, onActivate, hasDivider,
}: ShieldAbilityProps) {
  const canActivate = status.state === 'available' && currentMana >= manaCost && !loading

  return (
    <div style={{
      borderInlineEnd: hasDivider ? '1px solid rgba(255,255,255,0.06)' : 'none',
      padding: '18px 20px',
      display: 'flex', gap: 16, alignItems: 'flex-start',
      background: status.state === 'active' ? `rgba(${glowRgb},0.04)` : 'transparent',
      transition: 'background 0.3s ease',
    }}>

      {/* Icon box */}
      <div style={{
        width: 52, height: 52, borderRadius: 12, flexShrink: 0,
        background: status.state === 'active'
          ? `radial-gradient(circle, rgba(${glowRgb},0.35), rgba(${glowRgb},0.05))`
          : 'rgba(255,255,255,0.04)',
        border: `1px solid ${status.state === 'active' ? accentColor : 'rgba(255,255,255,0.1)'}`,
        boxShadow: status.state === 'active' ? `0 0 18px rgba(${glowRgb},0.45)` : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, transition: 'all 0.3s ease',
      }}>
        {icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Title + status badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-heading, sans-serif)', fontSize: 13, fontWeight: 700,
            color: accentColor, letterSpacing: '0.07em', textTransform: 'uppercase',
          }}>
            {label}
          </span>
          {status.state === 'active' && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, color: '#50D080',
              background: 'rgba(80,208,128,0.1)', border: '1px solid rgba(80,208,128,0.3)',
              borderRadius: 4, padding: '1px 7px',
              fontFamily: 'var(--font-body, sans-serif)',
            }}>
              <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: '#50D080', boxShadow: '0 0 5px #50D080' }} />
              Active
            </span>
          )}
          {status.state === 'cooldown' && (
            <span style={{
              fontSize: 10, color: 'rgba(255,255,255,0.35)',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4, padding: '1px 7px',
              fontFamily: 'var(--font-body, sans-serif)',
            }}>
              Cooldown
            </span>
          )}
        </div>

        {/* Lore */}
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'var(--font-body, sans-serif)', lineHeight: 1.55, marginBottom: 10 }}>
          {lore}
        </div>

        {/* Timer */}
        {status.state === 'active' && (
          <div style={{ fontSize: 11, color: '#50D080', fontFamily: 'var(--font-body, sans-serif)', marginBottom: 10 }}>
            Expires in {timeRemaining(status.endsAt) ?? 'soon'}
          </div>
        )}
        {status.state === 'cooldown' && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', fontFamily: 'var(--font-body, sans-serif)', marginBottom: 10 }}>
            Available in {timeRemaining(status.cooldownEndsAt) ?? 'soon'}
          </div>
        )}

        {/* Mana + button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11, color: 'rgba(96,176,255,0.75)',
            background: 'rgba(96,176,255,0.08)', border: '1px solid rgba(96,176,255,0.2)',
            borderRadius: 5, padding: '3px 10px',
            fontFamily: 'var(--font-body, sans-serif)',
          }}>
            {'\uD83D\uDD2E'} {manaCost} Mana
          </span>
          <Button
            variant="primary"
            size="sm"
            disabled={!canActivate}
            loading={loading}
            onClick={onActivate}
          >
            {status.state === 'active'   ? 'מוגן'     :
             status.state === 'cooldown' ? 'המתנה'    : 'הפעל'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── MasteryPanel ──────────────────────────────────────────────────────────────

interface MasteryPanelProps {
  catKey:          string
  meta:            CategoryMeta
  paths:           [PathDef, PathDef, PathDef]
  purchasedSpells: Set<string>
  hasSpellPoints:  boolean
  loading:         string | null
  onPurchase:      (key: string) => void
}

function MasteryPanel({ catKey, meta, paths, purchasedSpells, hasSpellPoints, loading, onPurchase }: MasteryPanelProps) {
  const totalPurchased = paths.reduce((acc, _, colIdx) => {
    for (let row = 1; row <= 5; row++) {
      if (purchasedSpells.has(buildSpellKey(catKey, colIdx + 1, row))) acc++
    }
    return acc
  }, 0)

  return (
    <div style={{
      background: meta.panelBg,
      border: `1px solid rgba(${meta.glowRgb},0.2)`,
      borderRadius: 12,
      overflow: 'hidden',
    }}>
      {/* Category header */}
      <div style={{
        background: meta.headerBg,
        borderBottom: `1px solid rgba(${meta.glowRgb},0.12)`,
        padding: '11px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 17 }}>{meta.icon}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 12, fontWeight: 700, color: meta.color, letterSpacing: '0.09em', textTransform: 'uppercase', lineHeight: 1 }}>
              {meta.label}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', fontFamily: 'var(--font-body, sans-serif)', letterSpacing: '0.05em', marginTop: 2 }}>
              {meta.subtitle}
            </div>
          </div>
        </div>
        <div style={{
          fontSize: 10, color: 'rgba(255,255,255,0.28)',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 5, padding: '3px 9px',
          fontFamily: 'var(--font-body, sans-serif)',
        }}>
          {totalPurchased} / 15 learned
        </div>
      </div>

      {/* Paths */}
      <div style={{ padding: '4px 0' }}>
        {paths.map((path, colIdx) => {
          const col = colIdx + 1
          const tierStates = [0, 1, 2, 3, 4].map((idx) => {
            const row         = idx + 1
            const key         = buildSpellKey(catKey, col, row)
            const isPurchased = purchasedSpells.has(key)
            const prevKey     = row > 1 ? buildSpellKey(catKey, col, row - 1) : null
            const isUnlocked  = !prevKey || purchasedSpells.has(prevKey)
            return { key, row, isPurchased, isUnlocked, name: path.tiers[idx] }
          })

          const nextAvailable   = tierStates.find((t) => !t.isPurchased && t.isUnlocked)
          const isFullyMastered = tierStates.every((t) => t.isPurchased)
          const purchasedCount  = tierStates.filter((t) => t.isPurchased).length

          return (
            <div
              key={col}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '10px 18px',
                borderBottom: colIdx < 2 ? `1px solid rgba(${meta.glowRgb},0.07)` : 'none',
              }}
            >
              {/* Path name */}
              <div style={{ width: 148, flexShrink: 0 }}>
                <div style={{
                  fontSize: 12, fontFamily: 'var(--font-heading, sans-serif)',
                  color: isFullyMastered ? meta.color : 'rgba(255,255,255,0.6)',
                  fontWeight: 600, letterSpacing: '0.03em',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {path.name}
                </div>
                {purchasedCount > 0 && !isFullyMastered && (
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-body, sans-serif)', marginTop: 2 }}>
                    Tier {purchasedCount} learned
                  </div>
                )}
              </div>

              {/* Progress dots */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {tierStates.map((t) => {
                  const isNext = nextAvailable?.key === t.key
                  const size   = t.isPurchased ? 13 : isNext ? 12 : 9
                  return (
                    <div
                      key={t.row}
                      title={t.name}
                      style={{
                        width: size, height: size, borderRadius: '50%', flexShrink: 0,
                        background: t.isPurchased
                          ? meta.color
                          : isNext
                          ? `rgba(${meta.glowRgb},0.35)`
                          : 'rgba(255,255,255,0.07)',
                        border: t.isPurchased
                          ? `1px solid ${meta.color}`
                          : isNext
                          ? `1px solid rgba(${meta.glowRgb},0.75)`
                          : '1px solid rgba(255,255,255,0.1)',
                        boxShadow: t.isPurchased
                          ? `0 0 7px rgba(${meta.glowRgb},0.75)`
                          : isNext
                          ? `0 0 9px rgba(${meta.glowRgb},0.55)`
                          : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    />
                  )
                })}
              </div>

              {/* Action */}
              <div style={{ flexShrink: 0, width: 172 }}>
                {isFullyMastered ? (
                  <span style={{
                    fontSize: 11, color: meta.color, opacity: 0.8,
                    fontFamily: 'var(--font-heading, sans-serif)',
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>
                    {'\u2736'} Mastered
                  </span>
                ) : nextAvailable ? (
                  <button
                    disabled={!hasSpellPoints || loading === nextAvailable.key}
                    onClick={() => onPurchase(nextAvailable.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 12px', borderRadius: 7,
                      background: hasSpellPoints
                        ? `linear-gradient(135deg, rgba(${meta.glowRgb},0.22), rgba(${meta.glowRgb},0.08))`
                        : 'rgba(255,255,255,0.03)',
                      border: hasSpellPoints
                        ? `1px solid rgba(${meta.glowRgb},0.5)`
                        : '1px solid rgba(255,255,255,0.08)',
                      color: hasSpellPoints ? meta.color : 'rgba(255,255,255,0.25)',
                      fontSize: 11, fontFamily: 'var(--font-body, sans-serif)', fontWeight: 600,
                      cursor: hasSpellPoints && loading !== nextAvailable.key ? 'pointer' : 'not-allowed',
                      opacity: loading === nextAvailable.key ? 0.55 : 1,
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: 172,
                    }}
                  >
                    {loading === nextAvailable.key ? (
                      <span style={{ opacity: 0.6 }}>{'\u2026'}</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 9, flexShrink: 0 }}>{'\u2736'}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          Learn: {nextAvailable.name}
                        </span>
                      </>
                    )}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
