'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { GameTable } from '@/components/ui/game-table'
import { EmptyState } from '@/components/ui/game-table'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import { useFreeze } from '@/lib/hooks/useFreeze'
import type { SpyResult, SpyRevealedData } from '@/types/game'

interface Target {
  id:          string
  army_name:   string
  rank_city:   number | null
  scouts:      number
  is_vacation: boolean
}

interface Props {
  targets: Target[]
}

export function SpyClient({ targets }: Props) {
  const { player, army, training, refresh, applyPatch } = usePlayer()
  const isFrozen = useFreeze()

  const [search,        setSearch]       = useState('')
  const [spiesSent,     setSpiesSent]    = useState<Record<string, string>>({})
  const [confirmTarget, setConfirmTarget] = useState<Target | null>(null)
  const [spyResult,     setSpyResult]    = useState<SpyResult | null>(null)
  const [loading,       setLoading]      = useState(false)
  const [message,       setMessage]      = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const filtered = useMemo(
    () => targets.filter((t) => t.army_name.toLowerCase().includes(search.toLowerCase())),
    [targets, search],
  )

  const turnCost = BALANCE.spy.turnCost
  const playerTurns = player?.turns ?? 0
  const mySpies = army?.spies ?? 0

  function getSpiesSent(targetId: string): number {
    return Math.max(1, Math.min(mySpies, parseInt(spiesSent[targetId] || '1') || 1))
  }

  async function executeSpy() {
    if (!confirmTarget || !player || !army) return
    const sent = getSpiesSent(confirmTarget.id)
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/spy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: confirmTarget.id, spies_sent: sent }),
      })
      const data = await res.json()
      setConfirmTarget(null)
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Spy mission failed', type: 'error' })
      } else {
        setSpyResult(data.result)
        // Immediate context update — turns deducted + spies caught
        applyPatch({
          player: { ...player, turns: data.turns },
          ...(data.result.spies_caught > 0
            ? { army: { ...army, spies: Math.max(0, army.spies - data.result.spies_caught) } }
            : {}),
        })
        refresh()
      }
    } catch {
      setMessage({ text: 'שגיאת רשת', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
            ריגול
          </h1>
          <p className="text-game-text-secondary font-body mt-1">
            עיר {player?.city ?? '—'} — {filtered.length} מטרות זמינות
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg px-3 py-2 text-center">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">תורות</p>
            <p className="text-game-base text-game-gold font-semibold">
              {playerTurns} / {BALANCE.tick.maxTurns}
            </p>
          </div>
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg px-3 py-2 text-center">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">מרגלים</p>
            <p className="text-game-base text-game-gold font-semibold">{formatNumber(mySpies)}</p>
          </div>
          <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg px-3 py-2 text-center">
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">רמת ריגול</p>
            <p className="text-game-base text-game-gold font-semibold">{training?.spy_level ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`rounded border px-4 py-3 font-body text-game-sm ${
            message.type === 'success'
              ? 'bg-game-green/10 border-green-900 text-game-green-bright'
              : 'bg-game-red/10 border-red-900 text-game-red-bright'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* How spy works */}
      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-4 text-game-xs font-body text-game-text-muted space-y-1">
        <p className="font-heading text-game-sm text-game-gold uppercase tracking-wide mb-2">כיצד הריגול פועל</p>
        <p><span className="text-game-text-white">כוח המרגלים</span> שלך מושווה מול <span className="text-game-text-white">הגנת הסיירים</span> של המטרה.</p>
        <p>
          כוח מרגל = מרגלים × מכפיל אימון × מכפיל נשק × בונוס גזע
          <br />
          הגנת סייר = סיירים × מכפיל אימון × מכפיל נשק × בונוס גזע
        </p>
        <p>
          <span className="text-game-green-bright">הצלחה:</span> כוח מרגל &gt; הגנת סייר → חשוף צבא, משאבים וכוח של המטרה.
          <br />
          <span className="text-game-red-bright">כישלון:</span> חלק מהמרגלים נתפסים. כלום לא נחשף.
          כל משימה עולה <span className="text-game-text-white">{turnCost} תורות</span>.
        </p>
      </div>

      {/* Search */}
      <Input
        placeholder="חיפוש לפי שם צבא..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Targets table */}
      {filtered.length === 0 ? (
        <EmptyState title="לא נמצאו מטרות" description="אין אויבים התואמים לחיפוש שלך או שאינם זמינים לריגול." />
      ) : (
        <GameTable
          headers={['דירוג', 'שם צבא', 'סיירים שלהם', 'מרגלים לשלוח', 'עלות תורות', 'פעולה']}
          striped
          hoverable
          rows={filtered.map((target) => {
            const sent = getSpiesSent(target.id)
            const canSpy = playerTurns >= turnCost && mySpies >= BALANCE.spy.minSpies && !target.is_vacation

            return [
              <span key="rank" className="text-game-sm font-body tabular-nums">
                {target.rank_city ? `#${target.rank_city}` : '—'}
              </span>,
              <div key="army">
                <span className="font-heading text-game-sm uppercase text-game-text-white">{target.army_name}</span>
                {target.is_vacation && <Badge variant="blue" className="ms-2">חופשה</Badge>}
              </div>,
              <span key="scouts" className="text-game-sm font-body tabular-nums text-game-text-muted">
                {formatNumber(target.scouts)}
              </span>,
              <Input
                key="spies"
                type="number"
                value={spiesSent[target.id] ?? '1'}
                min={1}
                max={mySpies}
                onChange={(e) => setSpiesSent((prev) => ({ ...prev, [target.id]: e.target.value }))}
                className="w-20"
              />,
              <span key="cost" className="text-game-sm font-body text-game-text-secondary">
                {turnCost} תורות
              </span>,
              <Button key="spy" variant="primary" size="sm" disabled={isFrozen || !canSpy} onClick={() => setConfirmTarget(target)}>
                שלח מרגלים
              </Button>,
            ]
          })}
        />
      )}

      {/* Confirmation modal */}
      <Modal isOpen={!!confirmTarget} onClose={() => setConfirmTarget(null)} title="אישור משימת ריגול" size="sm">
        {confirmTarget && (
          <div className="space-y-4">
            <div className="space-y-2 text-game-sm font-body">
              <div className="flex justify-between">
                <span className="text-game-text-secondary">מטרה</span>
                <span className="text-game-text-white font-heading uppercase">{confirmTarget.army_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-game-text-secondary">מרגלים שנשלחו</span>
                <span className="text-game-text-white font-semibold">{getSpiesSent(confirmTarget.id)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-game-text-secondary">עלות תורות</span>
                <span className="text-game-text-white">{turnCost}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-game-text-secondary">התורות שלך</span>
                <span className="text-game-text-white">{playerTurns}</span>
              </div>
            </div>
            <p className="text-game-xs text-game-text-muted font-body">
              הצלחה חושפת את הצבא, המשאבים וערכי הכוח של האויב.
              כישלון עלול לעלות לך חלק מהמרגלים.
            </p>
            <div className="flex gap-3 pt-2">
              <Button variant="primary" loading={loading} disabled={isFrozen} onClick={executeSpy}>שלח</Button>
              <Button variant="ghost" disabled={loading} onClick={() => setConfirmTarget(null)}>ביטול</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Spy result modal */}
      <Modal isOpen={!!spyResult} onClose={() => setSpyResult(null)} title="דוח משימה" size="md">
        {spyResult && (
          <div className="space-y-4">
            <div className="text-center">
              <p className={`font-display text-game-2xl uppercase tracking-wide ${spyResult.success ? 'text-game-green-bright' : 'text-game-red-bright'}`}>
                {spyResult.success ? 'משימה הצליחה' : 'משימה נכשלה'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-game-sm font-body">
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">כוח המרגלים שלך</p>
                <p className="text-game-gold font-semibold text-game-lg">{formatNumber(spyResult.spy_power)}</p>
              </div>
              <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
                <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide mb-1">הגנת סיירי המגן</p>
                <p className="text-game-gold font-semibold text-game-lg">{formatNumber(spyResult.scout_defense)}</p>
              </div>
            </div>

            <div className={`rounded border px-3 py-2 font-body text-game-xs ${spyResult.success ? 'bg-game-green/10 border-green-900 text-game-green-bright' : 'bg-game-red/10 border-red-900 text-game-red-bright'}`}>
              {spyResult.success
                ? `כוח המרגלים שלך (${formatNumber(spyResult.spy_power)}) עלה על הגנת הסיירים (${formatNumber(spyResult.scout_defense)}). מודיעין נאסף בהצלחה.`
                : `המשימה נכשלה. הגנת סיירי המגן (${formatNumber(spyResult.scout_defense)}) עלתה על כוח המרגלים שלך (${formatNumber(spyResult.spy_power)}). אמן עוד מרגלים או שדרג את רמת הריגול.`
              }
            </div>

            <div className="space-y-2 text-game-sm font-body">
              <div className="flex justify-between">
                <span className="text-game-text-secondary">מרגלים שנשלחו</span>
                <span className="text-game-text-white">{formatNumber(spyResult.spies_sent)}</span>
              </div>
              {spyResult.spies_caught > 0 && (
                <div className="flex justify-between">
                  <span className="text-game-text-secondary">מרגלים שנתפסו</span>
                  <span className="text-game-red-bright font-semibold">{formatNumber(spyResult.spies_caught)}</span>
                </div>
              )}
            </div>

            {spyResult.success && spyResult.revealed && <RevealedIntel data={spyResult.revealed} />}

            <Button variant="ghost" onClick={() => setSpyResult(null)}>סגור</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── Revealed intel panel ──────────────────────────────────────────────────

const ATK_WEAPON_LABELS: Record<string, string> = {
  slingshot: 'Slingshot', boomerang: 'Boomerang', pirate_knife: 'P.Knife',
  axe: 'Axe', master_knife: 'M.Knife', knight_axe: 'K.Axe', iron_ball: 'Iron Ball',
}
const DEF_WEAPON_LABELS: Record<string, string> = {
  wood_shield: 'W.Shield', iron_shield: 'I.Shield', leather_armor: 'L.Armor',
  chain_armor: 'C.Armor', plate_armor: 'Plate', mithril_armor: 'Mithril', gods_armor: "God's",
}

function RevealedIntel({ data }: { data: SpyRevealedData }) {
  const t = useTranslations()
  const atkWeapons = data.attack_weapons ?? {}
  const defWeapons = data.defense_weapons ?? {}
  const hasAtkWeapons = Object.values(atkWeapons).some((v) => v > 0)
  const hasDefWeapons = Object.values(defWeapons).some((v) => v > 0)
  const hasWeapons = hasAtkWeapons || hasDefWeapons
  const hasTraining = data.spy_level !== undefined || data.scout_level !== undefined

  return (
    <div className="pt-3 space-y-3">
      <div className="divider-ornate mb-3" />
      <p className="text-game-xs text-game-gold font-heading uppercase tracking-wide">
        Intelligence Report — {data.army_name}
      </p>

      {/* Army */}
      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
        <p className="text-game-xs font-heading uppercase tracking-wide text-game-gold mb-2">{t('rankings.army')}</p>
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-game-xs font-body">
          <div className="flex justify-between"><span className="text-game-text-secondary">{t('army.soldiers')}</span><span className="text-game-text-white">{formatNumber(data.soldiers)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">{t('army.cavalry')}</span><span className="text-game-text-white">{formatNumber(data.cavalry)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">{t('army.spies')}</span><span className="text-game-text-white">{formatNumber(data.spies)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">{t('army.scouts')}</span><span className="text-game-text-white">{formatNumber(data.scouts)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">{t('army.slaves')}</span><span className="text-game-text-white">{formatNumber(data.slaves)}</span></div>
        </div>
      </div>

      {/* Resources */}
      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
        <p className="text-game-xs font-heading uppercase tracking-wide text-game-gold mb-2">{t('spy_intel.resources')}</p>
        <div className="flex flex-wrap gap-3">
          <ResourceBadge type="gold" amount={data.gold} showLabel />
          <ResourceBadge type="iron" amount={data.iron} showLabel />
          <ResourceBadge type="wood" amount={data.wood} showLabel />
          <ResourceBadge type="food" amount={data.food} showLabel />
          {data.bank_gold !== undefined && (
            <span className="text-game-xs font-body text-game-text-muted">
              {t('spy_intel.bank')} <span className="text-game-gold">{formatNumber(data.bank_gold)}</span> {t('spy_intel.gold')}
            </span>
          )}
        </div>
      </div>

      {/* Power */}
      <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
        <p className="text-game-xs font-heading uppercase tracking-wide text-game-gold mb-2">{t('spy_intel.power')}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-game-xs font-body">
          <div className="flex justify-between"><span className="text-game-text-secondary">{t('spy_intel.attack')}</span><span className="text-game-text-white">{formatNumber(data.power_attack)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">{t('spy_intel.defense')}</span><span className="text-game-text-white">{formatNumber(data.power_defense)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">{t('spy_intel.spy')}</span><span className="text-game-text-white">{formatNumber(data.power_spy)}</span></div>
          <div className="flex justify-between"><span className="text-game-text-secondary">{t('spy_intel.scout')}</span><span className="text-game-text-white">{formatNumber(data.power_scout)}</span></div>
          <div className="flex justify-between col-span-2 divider-gold pt-1 mt-1">
            <span className="text-game-text-secondary font-semibold">{t('spy_intel.total_power')}</span>
            <span className="text-game-gold-bright font-semibold">{formatNumber(data.power_total)}</span>
          </div>
        </div>
      </div>

      {/* Shields */}
      <div className="flex gap-4 text-game-xs font-body">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-full border ${data.soldier_shield ? 'bg-blue-400 border-blue-400' : 'bg-transparent border-game-border'}`} />
          <span className={data.soldier_shield ? 'text-blue-400' : 'text-game-text-muted'}>
            {t('spy_intel.soldier_shield')} {data.soldier_shield ? t('spy_intel.active') : t('spy_intel.inactive')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-full border ${data.resource_shield ? 'bg-game-gold-bright border-game-gold-bright' : 'bg-transparent border-game-border'}`} />
          <span className={data.resource_shield ? 'text-game-gold-bright' : 'text-game-text-muted'}>
            {t('spy_intel.resource_shield')} {data.resource_shield ? t('spy_intel.active') : t('spy_intel.inactive')}
          </span>
        </div>
      </div>

      {/* Weapons (new — only present on missions after 2026-03-06) */}
      {hasWeapons && (
        <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3">
          <p className="text-game-xs font-heading uppercase tracking-wide text-game-gold mb-2">{t('spy_intel.weapons')}</p>
          <div className="space-y-1.5 text-game-xs font-body">
            {hasAtkWeapons && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-game-text-muted w-14 shrink-0">{t('spy_intel.attack')}:</span>
                {Object.entries(atkWeapons).filter(([, q]) => q > 0).map(([key, qty]) => (
                  <span key={key} className="bg-game-red/10 border border-game-red/30 rounded px-1.5 py-0.5 text-game-red-bright">
                    {ATK_WEAPON_LABELS[key] ?? key} &times;{qty}
                  </span>
                ))}
              </div>
            )}
            {hasDefWeapons && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-game-text-muted w-14 shrink-0">{t('spy_intel.defense')}:</span>
                {Object.entries(defWeapons).filter(([, q]) => q > 0).map(([key, qty]) => (
                  <span key={key} className="bg-game-gold/10 border border-game-gold/30 rounded px-1.5 py-0.5 text-game-gold">
                    {DEF_WEAPON_LABELS[key] ?? key} &times;{qty}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Training levels (new — only present on missions after 2026-03-06) */}
      {hasTraining && (
        <div className="flex gap-4 text-game-xs font-body text-game-text-muted">
          {data.spy_level !== undefined && (
            <span>{t('spy_intel.spy')} Training: <span className="text-game-text-white">Lv {data.spy_level}</span></span>
          )}
          {data.scout_level !== undefined && (
            <span>{t('spy_intel.scout')} Training: <span className="text-game-text-white">Lv {data.scout_level}</span></span>
          )}
        </div>
      )}
    </div>
  )
}
