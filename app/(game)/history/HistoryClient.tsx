'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/utils'
import type { AttackOutcome } from '@/types/game'

// ── Data interfaces ────────────────────────────────────────────────────────────

interface AttackRow {
  id: string
  created_at: string
  outcome: AttackOutcome
  attacker_losses: number
  defender_losses: number
  gold_stolen: number
  iron_stolen: number
  wood_stolen: number
  food_stolen: number
  turns_used: number
  defender?: { army_name: string; username: string } | null
  attacker?: { army_name: string; username: string } | null
}

interface SpyRow {
  id: string
  created_at: string
  success: boolean
  spies_caught: number
  data_revealed: Record<string, unknown> | null
  target?: { army_name: string; username?: string } | null
}

interface Props {
  outgoingAttacks: AttackRow[]
  incomingAttacks: AttackRow[]
  spyHistory: SpyRow[]
  outgoingCount: number
  incomingCount: number
  spyCount: number
  currentPage: number
  pageSize: number
  initialTab: string
}

// ── Display helpers ────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }
}

// Safe JSONB accessors — guards against old/missing spy history fields
function safeNum(data: Record<string, unknown>, key: string): number {
  const v = data[key]
  return typeof v === 'number' ? v : 0
}
function safeBool(data: Record<string, unknown>, key: string): boolean {
  return data[key] === true
}
function safeRecord(data: Record<string, unknown>, key: string): Record<string, number> {
  const v = data[key]
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const out: Record<string, number> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'number') out[k] = val
    }
    return out
  }
  return {}
}

const RESOURCE_META = {
  gold: { color: '#F0C030', iconSrc: '/icons/gold.png' },
  iron: { color: '#9898C0', iconSrc: '/icons/iron.png' },
  wood: { color: '#64B450', iconSrc: '/icons/wood.png' },
  food: { color: '#F08C3C', iconSrc: '/icons/food.png' },
} as const

const ATK_WEAPON_LABELS: Record<string, string> = {
  slingshot: 'קלע', boomerang: 'בומרנג', pirate_knife: 'סכין שוד',
  axe: 'גרזן', master_knife: 'סכין מאסטר', knight_axe: 'גרזן פרש', iron_ball: 'כדור ברזל',
}
const DEF_WEAPON_LABELS: Record<string, string> = {
  wood_shield: 'מגן עץ', iron_shield: 'מגן ברזל', leather_armor: 'שריון עור',
  chain_armor: 'שריון שרשרות', plate_armor: 'שריון לוחות', mithril_armor: 'שריון מיתריל', gods_armor: 'שריון האלים',
}
const SPY_WEAPON_LABELS: Record<string, string> = {
  shadow_cloak: 'גלימת צל', dark_mask: 'מסכת חושך', elven_gear: 'ציוד אלפי',
}
const SCOUT_WEAPON_LABELS: Record<string, string> = {
  scout_boots: 'מגפי סיור', scout_cloak: 'גלימת סייר', elven_boots: 'מגפיים אלפיים',
}

function buildPageRange(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | null)[] = [1]
  if (current > 3) pages.push(null)
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p)
  }
  if (current < total - 2) pages.push(null)
  pages.push(total)
  return pages
}

const TABS = [
  { key: 'outgoing', label: 'תקיפות שלי' },
  { key: 'incoming', label: 'תקיפות נכנסות' },
  { key: 'spy',      label: 'משימות ריגול' },
]

// ── Sub-components ─────────────────────────────────────────────────────────────

function PlunderChip({ type, amount }: { type: keyof typeof RESOURCE_META; amount: number }) {
  const m = RESOURCE_META[type]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: `${m.color}18`, border: `1px solid ${m.color}40`,
      borderRadius: 6, padding: '5px 10px',
      fontSize: 12, color: m.color,
      fontFamily: 'var(--font-body, sans-serif)',
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      <img src={m.iconSrc} alt={type} style={{ width: 36, height: 36, objectFit: 'contain', verticalAlign: 'middle', flexShrink: 0, display: 'inline-block' }} />
      {formatNumber(amount)}
    </span>
  )
}

interface AttackRowProps {
  row: AttackRow
  perspective: 'outgoing' | 'incoming'
  isLast: boolean
}

function AttackRow({ row, perspective, isLast }: AttackRowProps) {
  const isOutgoing  = perspective === 'outgoing'
  const myOutcome   = isOutgoing ? row.outcome : (row.outcome === 'win' ? 'loss' : 'win')
  const isWin       = myOutcome === 'win'
  const targetName  = isOutgoing ? (row.defender?.army_name ?? 'Unknown') : (row.attacker?.army_name ?? 'Unknown')
  const myLosses    = isOutgoing ? row.attacker_losses : row.defender_losses
  const theirLosses = isOutgoing ? row.defender_losses : row.attacker_losses
  const { date, time } = formatDate(row.created_at)

  return (
    <div style={{
      display: 'flex',
      borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
    }}>
      {/* Outcome accent bar */}
      <div style={{ width: 3, background: isWin ? '#50D080' : '#FF5555', flexShrink: 0 }} />

      {/* Row content */}
      <div style={{
        flex: 1, padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        minWidth: 0,
      }}>

        {/* Outcome chip + date */}
        <div style={{ flexShrink: 0, width: 78 }}>
          <div style={{
            display: 'inline-block', fontSize: 10, fontWeight: 700,
            color: isWin ? '#50D080' : '#FF5555',
            background: isWin ? 'rgba(80,208,128,0.1)' : 'rgba(255,85,85,0.1)',
            border: `1px solid ${isWin ? 'rgba(80,208,128,0.3)' : 'rgba(255,85,85,0.3)'}`,
            borderRadius: 4, padding: '2px 7px',
            fontFamily: 'var(--font-heading, sans-serif)',
            letterSpacing: '0.07em', textTransform: 'uppercase' as const,
          }}>
            {isWin ? 'ניצחון' : 'הפסד'}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-body, sans-serif)', marginTop: 3, whiteSpace: 'nowrap' as const }}>
            {date} {time}
          </div>
        </div>

        {/* Target */}
        <div style={{ flex: 1, minWidth: 100 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading, sans-serif)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {targetName}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-body, sans-serif)', marginTop: 2 }}>
            {row.turns_used} turn{row.turns_used !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Losses */}
        <div style={{ flexShrink: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: 9, color: 'rgba(255,85,85,0.65)', fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 2 }}>אבדות</div>
            <div style={{ fontSize: 12, color: myLosses > 0 ? '#FF5555' : 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-body, sans-serif)' }}>
              {formatNumber(myLosses)}
            </div>
          </div>
          <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.07)', flexShrink: 0 }} />
          <div style={{ textAlign: 'center' as const }}>
            <div style={{ fontSize: 9, color: 'rgba(80,208,128,0.65)', fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 2 }}>הרוגים</div>
            <div style={{ fontSize: 12, color: theirLosses > 0 ? '#50D080' : 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-body, sans-serif)' }}>
              {formatNumber(theirLosses)}
            </div>
          </div>
        </div>

        {/* Plunder */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 3, justifyContent: 'flex-end' }}>
            <PlunderChip type="gold" amount={row.gold_stolen} />
            <PlunderChip type="iron" amount={row.iron_stolen} />
            <PlunderChip type="wood" amount={row.wood_stolen} />
            <PlunderChip type="food" amount={row.food_stolen} />
          </div>
        </div>

      </div>
    </div>
  )
}

interface SpyMissionRowProps {
  row: SpyRow
  expanded: boolean
  onToggle: () => void
  isLast: boolean
}

function SpyMissionRow({ row, expanded, onToggle, isLast }: SpyMissionRowProps) {
  const { date, time } = formatDate(row.created_at)
  const hasIntel = row.success && row.data_revealed !== null

  return (
    <>
      <div style={{
        display: 'flex',
        borderBottom: (isLast && !expanded) ? 'none' : '1px solid rgba(255,255,255,0.04)',
      }}>
        {/* Accent bar */}
        <div style={{ width: 3, background: row.success ? '#50D080' : '#FF5555', flexShrink: 0 }} />

        {/* Row content */}
        <div style={{
          flex: 1, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const,
          minWidth: 0,
        }}>

          {/* Result chip + date */}
          <div style={{ flexShrink: 0, width: 78 }}>
            <div style={{
              display: 'inline-block', fontSize: 10, fontWeight: 700,
              color: row.success ? '#50D080' : '#FF5555',
              background: row.success ? 'rgba(80,208,128,0.1)' : 'rgba(255,85,85,0.1)',
              border: `1px solid ${row.success ? 'rgba(80,208,128,0.3)' : 'rgba(255,85,85,0.3)'}`,
              borderRadius: 4, padding: '2px 7px',
              fontFamily: 'var(--font-heading, sans-serif)',
              letterSpacing: '0.07em', textTransform: 'uppercase' as const,
            }}>
              {row.success ? 'Success' : 'Failed'}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-body, sans-serif)', marginTop: 3, whiteSpace: 'nowrap' as const }}>
              {date} {time}
            </div>
          </div>

          {/* Target */}
          <div style={{ flex: 1, minWidth: 100 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-heading, sans-serif)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {row.target?.army_name ?? 'Unknown'}
            </div>
            {row.spies_caught > 0 && (
              <div style={{ fontSize: 10, color: '#FF5555', fontFamily: 'var(--font-body, sans-serif)', marginTop: 2 }}>
                {formatNumber(row.spies_caught)} spy{row.spies_caught !== 1 ? 's' : ''} caught
              </div>
            )}
          </div>

          {/* Status + intel toggle */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {row.success && !hasIntel && (
              <span style={{ fontSize: 10, color: 'rgba(80,208,128,0.6)', fontFamily: 'var(--font-body, sans-serif)' }}>
                Intel gathered
              </span>
            )}
            {hasIntel && (
              <button
                onClick={onToggle}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 6,
                  background: expanded ? 'rgba(192,112,255,0.15)' : 'rgba(255,255,255,0.04)',
                  border: expanded ? '1px solid rgba(192,112,255,0.45)' : '1px solid rgba(255,255,255,0.1)',
                  color: expanded ? '#C070FF' : 'rgba(255,255,255,0.5)',
                  fontSize: 11, fontFamily: 'var(--font-body, sans-serif)', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: 10 }}>{'\uD83D\uDD0E'}</span>
                Intel {expanded ? '\u25B2' : '\u25BC'}
              </button>
            )}
            {!row.success && row.spies_caught === 0 && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontFamily: 'var(--font-body, sans-serif)' }}>
                No spies lost
              </span>
            )}
          </div>

        </div>
      </div>

      {/* Expanded intel panel */}
      {expanded && hasIntel && row.data_revealed && (
        <SpyIntelPanel
          data={row.data_revealed}
          isLast={isLast}
        />
      )}
    </>
  )
}

function SpyIntelPanel({ data, isLast }: { data: Record<string, unknown>; isLast: boolean }) {
  const armyName       = String(data.army_name ?? '—')
  const soldiers       = safeNum(data, 'soldiers')
  const cavalry        = safeNum(data, 'cavalry')
  const spies          = safeNum(data, 'spies')
  const scouts         = safeNum(data, 'scouts')
  const slaves         = safeNum(data, 'slaves')
  const freePop        = data.free_population !== undefined ? safeNum(data, 'free_population') : undefined
  const cityLevel      = data.city !== undefined ? safeNum(data, 'city') : undefined
  const gold           = safeNum(data, 'gold')
  const iron           = safeNum(data, 'iron')
  const wood           = safeNum(data, 'wood')
  const food           = safeNum(data, 'food')
  const bankGold       = data.bank_gold !== undefined ? safeNum(data, 'bank_gold') : undefined
  const bankIntLevel   = data.bank_interest_level !== undefined ? safeNum(data, 'bank_interest_level') : undefined
  const pwrAtk         = safeNum(data, 'power_attack')
  const pwrDef         = safeNum(data, 'power_defense')
  const pwrTotal       = safeNum(data, 'power_total')
  const soldierShield  = safeBool(data, 'soldier_shield')
  const resourceShield = safeBool(data, 'resource_shield')
  const atkWeapons     = safeRecord(data, 'attack_weapons')
  const defWeapons     = safeRecord(data, 'defense_weapons')
  const spyWeapons     = safeRecord(data, 'spy_weapons')
  const scoutWeapons   = safeRecord(data, 'scout_weapons')
  const atkLevel       = data.attack_level  !== undefined ? safeNum(data, 'attack_level')  : undefined
  const defLevel       = data.defense_level !== undefined ? safeNum(data, 'defense_level') : undefined
  const spyLevel       = data.spy_level     !== undefined ? safeNum(data, 'spy_level')     : undefined
  const scoutLevel     = data.scout_level   !== undefined ? safeNum(data, 'scout_level')   : undefined
  const tribeName      = data.tribe_name  != null ? String(data.tribe_name)           : undefined
  const tribeLevel     = data.tribe_level != null ? safeNum(data, 'tribe_level')      : undefined

  const hasAtkWeapons   = Object.values(atkWeapons).some((v) => v > 0)
  const hasDefWeapons   = Object.values(defWeapons).some((v) => v > 0)
  const hasSpyWeapons   = Object.values(spyWeapons).some((v) => v > 0)
  const hasScoutWeapons = Object.values(scoutWeapons).some((v) => v > 0)
  const hasWeapons      = hasAtkWeapons || hasDefWeapons || hasSpyWeapons || hasScoutWeapons
  const hasTraining     = atkLevel !== undefined || defLevel !== undefined ||
                          spyLevel !== undefined || scoutLevel !== undefined

  const fieldStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', gap: 8,
    fontSize: 11, fontFamily: 'var(--font-body, sans-serif)',
  }
  const labelStyle: React.CSSProperties = { color: 'rgba(255,255,255,0.38)' }
  const valStyle:   React.CSSProperties = { color: 'rgba(255,255,255,0.85)', fontWeight: 600 }

  return (
    <div style={{
      borderInlineStart: '3px solid rgba(192,112,255,0.5)',
      borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
      background: 'linear-gradient(160deg, rgba(18,8,35,0.98), rgba(10,4,20,1))',
      padding: '12px 14px',
      overflowX: 'hidden',
    }}>
      {/* Header */}
      <div style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(192,112,255,0.7)', marginBottom: 12 }}>
        {'\uD83D\uDD0D'} דוח מודיעין &mdash; {armyName}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>

        {/* City / Tribe */}
        {(cityLevel !== undefined || tribeName !== undefined) && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            {cityLevel !== undefined && (
              <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '2px 8px', color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-body, sans-serif)' }}>
                עיר רמה {cityLevel}
              </span>
            )}
            {tribeName !== undefined && (
              <span style={{ fontSize: 10, background: 'rgba(192,112,255,0.08)', border: '1px solid rgba(192,112,255,0.25)', borderRadius: 5, padding: '2px 8px', color: 'rgba(192,112,255,0.85)', fontFamily: 'var(--font-body, sans-serif)' }}>
                🤝 {tribeName}{tribeLevel != null ? ` · רמה ${tribeLevel}` : ''}
              </span>
            )}
          </div>
        )}

        {/* Army */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,192,48,0.7)', marginBottom: 8 }}>כוחות צבאיים</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
            {([
              ['חיילים', soldiers], ['פרשים', cavalry], ['מרגלים', spies],
              ['סיירים', scouts],   ['עבדים', slaves],
              ...(freePop !== undefined ? [['אוכ׳ חופשייה', freePop]] : []),
            ] as [string, number][]).map(([label, val]) => (
              <div key={label} style={fieldStyle}>
                <span style={labelStyle}>{label}</span>
                <span style={valStyle}>{formatNumber(val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Resources */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,192,48,0.7)', marginBottom: 8 }}>משאבים</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px' }}>
            {([
              ['זהב', gold, '#F0C030'],
              ['ברזל', iron, '#9898C0'],
              ['עץ', wood, '#64B450'],
              ['מזון', food, '#F08C3C'],
            ] as [string, number, string][]).map(([label, val, color]) => (
              <div key={label} style={fieldStyle}>
                <span style={labelStyle}>{label}</span>
                <span style={{ ...valStyle, color }}>{formatNumber(val)}</span>
              </div>
            ))}
            {bankGold !== undefined && (
              <div style={{ ...fieldStyle, gridColumn: '1 / -1', marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={labelStyle}>
                  בנק{bankIntLevel !== undefined && bankIntLevel > 0 ? ` (ריבית רמה ${bankIntLevel})` : ''}
                </span>
                <span style={{ ...valStyle, color: '#F0C030' }}>{formatNumber(bankGold)} זהב</span>
              </div>
            )}
          </div>
        </div>

        {/* Power + Shields */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,192,48,0.7)', marginBottom: 8 }}>כוח ומגנים</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 8 }}>
            <div style={fieldStyle}><span style={labelStyle}>תקיפה</span><span style={valStyle}>{formatNumber(pwrAtk)}</span></div>
            <div style={fieldStyle}><span style={labelStyle}>הגנה</span><span style={valStyle}>{formatNumber(pwrDef)}</span></div>
            <div style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>כולל</span>
              <span style={{ color: '#F0C030', fontWeight: 700 }}>{formatNumber(pwrTotal)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
            {[
              { label: 'מגן חיילים', active: soldierShield, color: '#60B0FF' },
              { label: 'מגן משאבים', active: resourceShield, color: '#F0C030' },
            ].map(({ label, active, color }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontFamily: 'var(--font-body, sans-serif)' }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: active ? color : 'rgba(255,255,255,0.1)', border: `1px solid ${active ? color : 'rgba(255,255,255,0.2)'}`, boxShadow: active ? `0 0 6px ${color}` : 'none', flexShrink: 0 }} />
                <span style={{ color: active ? color : 'rgba(255,255,255,0.3)' }}>{label} {active ? 'פעיל' : 'לא פעיל'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Training */}
        {hasTraining && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,192,48,0.7)', marginBottom: 8 }}>רמות אימון</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 10, fontFamily: 'var(--font-body, sans-serif)' }}>
              {atkLevel   !== undefined && <div style={fieldStyle}><span style={labelStyle}>תקיפה</span><span style={valStyle}>רמה {atkLevel}</span></div>}
              {defLevel   !== undefined && <div style={fieldStyle}><span style={labelStyle}>הגנה</span><span style={valStyle}>רמה {defLevel}</span></div>}
              {spyLevel   !== undefined && <div style={fieldStyle}><span style={labelStyle}>ריגול</span><span style={valStyle}>רמה {spyLevel}</span></div>}
              {scoutLevel !== undefined && <div style={fieldStyle}><span style={labelStyle}>סיור</span><span style={valStyle}>רמה {scoutLevel}</span></div>}
            </div>
          </div>
        )}

        {/* Weapons */}
        {hasWeapons && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(240,192,48,0.7)', marginBottom: 8 }}>ציוד</div>
            {hasAtkWeapons && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9, color: 'rgba(255,85,85,0.6)', fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, display:'flex', alignItems:'center', gap:3 }}><img src="/icons/attack-power.png" style={{width:10,height:10,objectFit:'contain',flexShrink:0}} alt="" /> תקיפה</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {Object.entries(atkWeapons).filter(([, q]) => q > 0).map(([key, qty]) => (
                    <span key={key} style={{ fontSize: 10, color: '#FF8080', background: 'rgba(255,85,85,0.08)', border: '1px solid rgba(255,85,85,0.25)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-body, sans-serif)' }}>
                      {ATK_WEAPON_LABELS[key] ?? key} ×{qty}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {hasDefWeapons && (
              <div style={{ marginBottom: hasSpyWeapons || hasScoutWeapons ? 6 : 0 }}>
                <div style={{ fontSize: 9, color: 'rgba(240,192,48,0.6)', fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, display:'flex', alignItems:'center', gap:3 }}><img src="/icons/defense-power.png" style={{width:10,height:10,objectFit:'contain',flexShrink:0}} alt="" /> הגנה</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {Object.entries(defWeapons).filter(([, q]) => q > 0).map(([key, qty]) => (
                    <span key={key} style={{ fontSize: 10, color: '#F0C030', background: 'rgba(240,192,48,0.08)', border: '1px solid rgba(240,192,48,0.25)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-body, sans-serif)' }}>
                      {DEF_WEAPON_LABELS[key] ?? key} ×{qty}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {hasSpyWeapons && (
              <div style={{ marginBottom: hasScoutWeapons ? 6 : 0 }}>
                <div style={{ fontSize: 9, color: 'rgba(192,112,255,0.6)', fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, display:'flex', alignItems:'center', gap:3 }}><img src="/icons/spy-power.png" style={{width:10,height:10,objectFit:'contain',flexShrink:0}} alt="" /> ריגול</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {Object.entries(spyWeapons).filter(([, q]) => q > 0).map(([key, qty]) => (
                    <span key={key} style={{ fontSize: 10, color: '#C070FF', background: 'rgba(192,112,255,0.08)', border: '1px solid rgba(192,112,255,0.25)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-body, sans-serif)' }}>
                      {SPY_WEAPON_LABELS[key] ?? key} ×{qty}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {hasScoutWeapons && (
              <div>
                <div style={{ fontSize: 9, color: 'rgba(255,165,80,0.6)', fontFamily: 'var(--font-heading, sans-serif)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4, display:'flex', alignItems:'center', gap:3 }}><img src="/icons/renger-power.png" style={{width:10,height:10,objectFit:'contain',flexShrink:0}} alt="" /> סיור</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {Object.entries(scoutWeapons).filter(([, q]) => q > 0).map(([key, qty]) => (
                    <span key={key} style={{ fontSize: 10, color: '#FFA550', background: 'rgba(255,165,80,0.08)', border: '1px solid rgba(255,165,80,0.25)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-body, sans-serif)' }}>
                      {SCOUT_WEAPON_LABELS[key] ?? key} ×{qty}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

function PageBtn({ label, onClick, disabled, active }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || active}
      style={{
        minWidth: 40, height: 40,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6,
        border: active
          ? '1px solid rgba(240,192,48,0.5)'
          : '1px solid rgba(255,255,255,0.08)',
        background: active
          ? 'rgba(240,192,48,0.12)'
          : disabled ? 'transparent' : 'rgba(255,255,255,0.03)',
        color: active
          ? '#F0C030'
          : disabled ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.55)',
        fontSize: 12,
        fontFamily: 'var(--font-body, sans-serif)',
        fontWeight: active ? 700 : 400,
        cursor: (disabled || active) ? 'default' : 'pointer',
        transition: 'all 0.12s ease',
      }}
    >
      {label}
    </button>
  )
}

function SectionEmpty({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ padding: '52px 24px', textAlign: 'center' as const }}>
      <div style={{ fontSize: 38, marginBottom: 14, opacity: 0.22 }}>{icon}</div>
      <div style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 14, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: 'var(--font-body, sans-serif)', fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>{sub}</div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function HistoryClient({
  outgoingAttacks,
  incomingAttacks,
  spyHistory,
  outgoingCount,
  incomingCount,
  spyCount,
  currentPage,
  pageSize,
  initialTab,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(initialTab)
  const [expandedSpies, setExpandedSpies] = useState<Set<string>>(new Set())

  function getCount() {
    if (activeTab === 'outgoing') return outgoingCount
    if (activeTab === 'incoming') return incomingCount
    return spyCount
  }

  const totalPages = Math.max(1, Math.ceil(getCount() / pageSize))

  function navigate(tab: string, page: number) {
    router.push(`/history?tab=${tab}&page=${page}`)
  }

  function handleTabChange(tab: string) {
    setActiveTab(tab)
    navigate(tab, 1)
  }

  function handlePage(p: number) {
    navigate(activeTab, p)
  }

  function toggleSpyIntel(id: string) {
    setExpandedSpies((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
          Battle History
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          Review your past battles and spy missions
        </p>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={TABS.map((t) => ({
          ...t,
          label: `${t.label} (${t.key === 'outgoing' ? outgoingCount : t.key === 'incoming' ? incomingCount : spyCount})`,
        }))}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {/* ── My Attacks ─────────────────────────────────────────────────────── */}
      {activeTab === 'outgoing' && (
        <div style={{ background: 'linear-gradient(160deg, rgba(10,8,22,0.98), rgba(5,4,14,1))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14 }}>{'\u2694\uFE0F'}</span>
            <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,85,85,0.8)', fontWeight: 700 }}>
              תקיפות שלי
            </span>
            <span style={{ marginInlineStart: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-body, sans-serif)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '2px 8px' }}>
              {outgoingCount} סה&quot;כ
            </span>
          </div>
          {outgoingAttacks.length === 0 ? (
            <SectionEmpty icon={'\u2694\uFE0F'} title="אין תקיפות עדיין" sub="לא תקפת אף שחקן בעונה זו." />
          ) : (
            outgoingAttacks.map((row, i) => (
              <AttackRow
                key={row.id}
                row={row}
                perspective="outgoing"
                isLast={i === outgoingAttacks.length - 1}
              />
            ))
          )}
        </div>
      )}

      {/* ── Incoming Attacks ───────────────────────────────────────────────── */}
      {activeTab === 'incoming' && (
        <div style={{ background: 'linear-gradient(160deg, rgba(10,8,22,0.98), rgba(5,4,14,1))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14 }}>{'\uD83D\uDEE1\uFE0F'}</span>
            <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(240,192,48,0.8)', fontWeight: 700 }}>
              תקיפות נכנסות
            </span>
            <span style={{ marginInlineStart: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-body, sans-serif)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '2px 8px' }}>
              {incomingCount} סה&quot;כ
            </span>
          </div>
          {incomingAttacks.length === 0 ? (
            <SectionEmpty icon={'\uD83D\uDEE1\uFE0F'} title="אין תקיפות נכנסות" sub="אף שחקן לא תקף אותך בעונה זו." />
          ) : (
            incomingAttacks.map((row, i) => (
              <AttackRow
                key={row.id}
                row={row}
                perspective="incoming"
                isLast={i === incomingAttacks.length - 1}
              />
            ))
          )}
        </div>
      )}

      {/* ── Spy Missions ───────────────────────────────────────────────────── */}
      {activeTab === 'spy' && (
        <div style={{ background: 'linear-gradient(160deg, rgba(10,8,22,0.98), rgba(5,4,14,1))', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '11px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14 }}>{'\uD83C\uDF11'}</span>
            <span style={{ fontFamily: 'var(--font-heading, sans-serif)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(192,112,255,0.8)', fontWeight: 700 }}>
              משימות ריגול
            </span>
            <span style={{ marginInlineStart: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-body, sans-serif)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, padding: '2px 8px' }}>
              {spyCount} סה&quot;כ
            </span>
          </div>
          {spyHistory.length === 0 ? (
            <SectionEmpty icon={'\uD83C\uDF11'} title="אין משימות ריגול" sub="לא שלחת מרגלים בעונה זו." />
          ) : (
            spyHistory.map((row, i) => (
              <SpyMissionRow
                key={row.id}
                row={row}
                expanded={expandedSpies.has(row.id)}
                onToggle={() => toggleSpyIntel(row.id)}
                isLast={i === spyHistory.length - 1}
              />
            ))
          )}
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingTop: 8 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-body, sans-serif)' }}>
            עמוד {currentPage} מתוך {totalPages} &middot; {formatNumber(getCount())} סה&quot;כ
          </span>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <PageBtn label="&#8249;" onClick={() => handlePage(currentPage - 1)} disabled={currentPage <= 1} />
            {buildPageRange(currentPage, totalPages).map((p, i) =>
              p === null
                ? <span key={`ellipsis-${i}`} style={{ padding: '0 4px', color: 'rgba(255,255,255,0.2)', fontSize: 12, fontFamily: 'var(--font-body, sans-serif)' }}>&#8230;</span>
                : <PageBtn key={p} label={String(p)} onClick={() => handlePage(p)} active={p === currentPage} />
            )}
            <PageBtn label="&#8250;" onClick={() => handlePage(currentPage + 1)} disabled={currentPage >= totalPages} />
          </div>
        </div>
      )}

    </div>
  )
}
