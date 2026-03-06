'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { GameTable } from '@/components/ui/game-table'
import { EmptyState } from '@/components/ui/game-table'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { Player, Tribe, TribeMember, TribeMemberRole } from '@/types/game'

// ── Types ────────────────────────────────────────────────────────────────────

interface MemberRow {
  member: {
    player_id: string
    role: TribeMemberRole
    reputation: number
    reputation_pct: number
    tax_exempt: boolean
  }
  player: {
    id: string
    username: string
    army_name: string
    rank_city: number | null
  } | null
}

interface JoinableTribe {
  id: string
  name: string
  anthem: string | null
  level: number
  max_members: number
  member_count: number
}

interface TaxStatus {
  server_now: string
  next_tax_at: string
  last_tax_collected_at: string | null
}

interface Props {
  player: Player
  membership: TribeMember | null
  tribe: Tribe | null
  members: MemberRow[]
  tribeSpells: Array<{ spell_key: string; expires_at: string }>
  joinableTribes: JoinableTribe[]
}

// ── Spell metadata ────────────────────────────────────────────────────────────

type SpellKey = 'war_cry' | 'tribe_shield' | 'production_blessing' | 'spy_veil' | 'battle_supply'

const SPELL_LABELS: Record<SpellKey, string> = {
  war_cry:             'War Cry',
  tribe_shield:        'Tribe Shield',
  production_blessing: 'Production Blessing',
  spy_veil:            'Spy Veil',
  battle_supply:       'Battle Supply',
}

const SPELL_DESC: Record<SpellKey, string> = {
  war_cry:             `Attacker ECP ×${BALANCE.tribe.spellEffects.war_cry.combatMultiplier}`,
  tribe_shield:        `Defender ECP ×${BALANCE.tribe.spellEffects.tribe_shield.defenseMultiplier}`,
  production_blessing: `Slave output ×${BALANCE.tribe.spellEffects.production_blessing.productionMultiplier}`,
  spy_veil:            `Scout defense ×${BALANCE.tribe.spellEffects.spy_veil.scoutDefenseMultiplier}`,
  battle_supply:       `Attack food cost −${(BALANCE.tribe.spellEffects.battle_supply.foodReduction * 100).toFixed(0)}%`,
}

const V1_SPELLS: SpellKey[] = ['war_cry', 'tribe_shield', 'production_blessing', 'spy_veil', 'battle_supply']

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<TribeMemberRole, React.ReactNode> = {
  leader: <Badge variant="gold">Leader</Badge>,
  deputy: <Badge variant="purple">Deputy</Badge>,
  member: <Badge variant="default">Member</Badge>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Overdue'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TribeClient({ player, membership, tribe, members, tribeSpells, joinableTribes }: Props) {
  const { refresh } = usePlayer()
  const router      = useRouter()

  // ── State ─────────────────────────────────────────────────────────────────
  const [loading,       setLoading]       = useState<string | null>(null)
  const [message,       setMessage]       = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [tribeName,     setTribeName]     = useState('')
  const [tribeAnthem,   setTribeAnthem]   = useState('')
  const [taxAmount,     setTaxAmount]     = useState('')
  const [manaAmount,    setManaAmount]    = useState('')
  const [localMembers,  setLocalMembers]  = useState(members)
  const [localTribeMana, setLocalTribeMana] = useState(tribe?.mana ?? 0)
  const [taxStatus,     setTaxStatus]     = useState<TaxStatus | null>(null)
  const [countdown,     setCountdown]     = useState('')
  const [disbandConfirm, setDisbandConfirm] = useState(false)

  const myRole    = membership?.role ?? null
  const isLeader  = myRole === 'leader'
  const isDeputy  = myRole === 'deputy'
  const canManage = isLeader || isDeputy

  const deputyCount = localMembers.filter(m => m.member.role === 'deputy').length

  // ── Tax status fetch + countdown ──────────────────────────────────────────

  const fetchTaxStatus = useCallback(async () => {
    if (!tribe) return
    try {
      const res  = await fetch('/api/tribe/tax-status')
      const json = await res.json()
      if (res.ok && json.data) setTaxStatus(json.data as TaxStatus)
    } catch {
      // Non-critical — countdown will just not display
    }
  }, [tribe])

  useEffect(() => {
    fetchTaxStatus()
  }, [fetchTaxStatus])

  useEffect(() => {
    if (!taxStatus) return
    const update = () => {
      const ms = new Date(taxStatus.next_tax_at).getTime() - Date.now()
      setCountdown(formatCountdown(ms))
    }
    update()
    const id = setInterval(update, 1_000)
    return () => clearInterval(id)
  }, [taxStatus])

  // ── Message helper ────────────────────────────────────────────────────────

  function showMsg(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    if (type === 'success') setTimeout(() => setMessage(null), 4_000)
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleCreateTribe() {
    if (!tribeName.trim()) return
    setLoading('create')
    setMessage(null)
    try {
      const res  = await fetch('/api/tribe/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tribeName, anthem: tribeAnthem }),
      })
      const data = await res.json()
      if (!res.ok) showMsg(data.error ?? 'Failed to create tribe', 'error')
      else router.refresh()
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  async function handleJoinTribe(tribeId: string) {
    setLoading(`join-${tribeId}`)
    setMessage(null)
    try {
      const res  = await fetch('/api/tribe/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tribe_id: tribeId }),
      })
      const data = await res.json()
      if (!res.ok) showMsg(data.error ?? 'Failed to join tribe', 'error')
      else router.refresh()
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  async function handleLeaveTribe() {
    setLoading('leave')
    setMessage(null)
    try {
      const res  = await fetch('/api/tribe/leave', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) showMsg(data.error ?? 'Failed to leave tribe', 'error')
      else router.refresh()
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  async function handleDisbandTribe() {
    setLoading('disband')
    setMessage(null)
    try {
      const res  = await fetch('/api/tribe/disband', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) showMsg(data.error ?? 'Failed to disband tribe', 'error')
      else router.refresh()
    } catch { showMsg('Network error', 'error') }
    finally {
      setLoading(null)
      setDisbandConfirm(false)
    }
  }

  async function handleActivateSpell(spellKey: SpellKey) {
    setLoading(`spell-${spellKey}`)
    setMessage(null)
    try {
      const res  = await fetch('/api/tribe/activate-spell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spell_key: spellKey }),
      })
      const data = await res.json()
      if (!res.ok) showMsg(data.error ?? 'Failed to activate spell', 'error')
      else {
        showMsg(`${SPELL_LABELS[spellKey]} activated!`, 'success')
        const cost = BALANCE.tribe.spells[spellKey]?.manaCost ?? 0
        setLocalTribeMana(prev => prev - cost)
        refresh()
      }
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  async function handleKickMember(memberId: string) {
    setLoading(`kick-${memberId}`)
    setMessage(null)
    try {
      const res  = await fetch('/api/tribe/kick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: memberId }),
      })
      const data = await res.json()
      if (!res.ok) showMsg(data.error ?? 'Failed to kick member', 'error')
      else {
        showMsg('Member removed from tribe', 'success')
        setLocalMembers(prev => prev.filter(m => m.member.player_id !== memberId))
        refresh()
      }
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  async function handleSetTax() {
    const amt = parseInt(taxAmount)
    if (isNaN(amt) || amt < 0) return
    setLoading('set-tax')
    setMessage(null)
    try {
      const res  = await fetch('/api/tribe/set-tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt }),
      })
      const data = await res.json()
      if (!res.ok) showMsg(data.error ?? 'Failed to set tax', 'error')
      else {
        showMsg('Daily tribute updated', 'success')
        setTaxAmount('')
        refresh()
      }
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  async function handleContributeMana() {
    const amt = parseInt(manaAmount)
    if (isNaN(amt) || amt <= 0) return
    setLoading('contribute-mana')
    setMessage(null)
    try {
      const res  = await fetch('/api/tribe/contribute-mana', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt }),
      })
      const data = await res.json()
      if (!res.ok) showMsg(data.error ?? 'Failed to contribute mana', 'error')
      else {
        showMsg(`Contributed ${amt} mana to tribe`, 'success')
        setManaAmount('')
        // Use RPC result directly — no router.refresh() needed
        if (data.data?.new_tribe_mana !== undefined) {
          setLocalTribeMana(data.data.new_tribe_mana as number)
        }
        refresh() // updates hero mana in sidebar
      }
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  async function handleSetRole(targetId: string, action: 'appoint' | 'remove') {
    setLoading(`role-${action}-${targetId}`)
    setMessage(null)
    try {
      const res  = await fetch('/api/tribe/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_player_id: targetId, action }),
      })
      const data = await res.json()
      if (!res.ok) showMsg(data.error ?? 'Role change failed', 'error')
      else {
        const label = action === 'appoint' ? 'Deputy appointed' : 'Deputy removed'
        showMsg(label, 'success')
        setLocalMembers(prev => prev.map(m =>
          m.member.player_id === targetId
            ? { ...m, member: { ...m.member, role: action === 'appoint' ? 'deputy' : 'member' } }
            : m,
        ))
        refresh()
      }
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  async function handleTransferLeadership(newLeaderId: string) {
    setLoading(`transfer-${newLeaderId}`)
    setMessage(null)
    try {
      const res  = await fetch('/api/tribe/transfer-leadership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_leader_id: newLeaderId }),
      })
      const data = await res.json()
      if (!res.ok) showMsg(data.error ?? 'Leadership transfer failed', 'error')
      else router.refresh() // leadership change rewrites page structure
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Page header */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static uppercase tracking-wide text-title-glow">
          {tribe ? tribe.name : 'Tribe'}
        </h1>
        <p className="text-game-text-secondary font-body mt-1 text-game-sm">
          {tribe
            ? `City ${tribe.city} · Level ${tribe.level} · ${myRole ? myRole.charAt(0).toUpperCase() + myRole.slice(1) : ''}`
            : 'Join or found a tribe in your city'}
        </p>
      </div>

      {/* Feedback message */}
      {message && (
        <div
          className={`rounded-game-lg border px-4 py-3 font-body text-game-sm ${
            message.type === 'success'
              ? 'bg-game-green/10 border-green-900 text-game-green-bright'
              : 'bg-game-red/10 border-red-900 text-game-red-bright'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* NO TRIBE STATE                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {!tribe && (
        <>
          {/* Found a Tribe */}
          <div className="card-game rounded-game-lg p-5 space-y-4">
            <div className="panel-header">
              <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
                Found a Tribe
              </h2>
            </div>
            <p className="text-game-sm text-game-text-muted font-body">
              Costs{' '}
              <span className="text-purple-400 font-semibold">
                {BALANCE.tribe.creationManaCost} personal mana
              </span>{' '}
              to establish.
            </p>
            <div className="space-y-3">
              <Input
                label="Tribe Name"
                placeholder="Enter tribe name (3–40 characters)"
                value={tribeName}
                onChange={(e) => setTribeName(e.target.value)}
                maxLength={40}
              />
              <Input
                label="Anthem (optional)"
                placeholder="Your tribe's motto or battle cry"
                value={tribeAnthem}
                onChange={(e) => setTribeAnthem(e.target.value)}
                maxLength={120}
              />
              <Button
                variant="primary"
                disabled={tribeName.trim().length < 3 || !!loading}
                loading={loading === 'create'}
                onClick={handleCreateTribe}
              >
                Create Tribe
              </Button>
            </div>
          </div>

          {/* Joinable tribes */}
          <div className="card-game rounded-game-lg p-5">
            <div className="panel-header mb-4">
              <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
                Tribes in City {player.city}
              </h2>
            </div>
            {joinableTribes.length === 0 ? (
              <EmptyState
                title="No Tribes Available"
                description="No tribes exist in your city yet. Be the first to found one."
              />
            ) : (
              <GameTable
                headers={['Name', 'Level', 'Members', 'Anthem', 'Action']}
                hoverable
                rows={joinableTribes.map((t) => [
                  <span key="name" className="font-heading text-game-sm uppercase text-game-text-white">{t.name}</span>,
                  <Badge key="level" variant="default">Lvl {t.level}</Badge>,
                  <span key="members" className="text-game-sm font-body tabular-nums">{t.member_count} / {t.max_members}</span>,
                  <span key="anthem" className="text-game-sm text-game-text-muted font-body italic">{t.anthem ?? '—'}</span>,
                  <Button
                    key="join"
                    variant="primary"
                    size="sm"
                    disabled={t.member_count >= t.max_members || !!loading}
                    loading={loading === `join-${t.id}`}
                    onClick={() => handleJoinTribe(t.id)}
                  >
                    Join
                  </Button>,
                ])}
              />
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* IN TRIBE STATE                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {tribe && membership && (
        <>
          {/* ── Tribe stats strip ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { label: 'Level',       value: String(tribe.level)                          },
              { label: 'Reputation',  value: formatNumber(tribe.reputation)                },
              { label: 'Tribe Mana',  value: formatNumber(localTribeMana), purple: true    },
              { label: 'Members',     value: `${localMembers.length} / ${tribe.max_members}` },
            ] as { label: string; value: string; purple?: boolean }[]).map(({ label, value, purple }) => (
              <div
                key={label}
                className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-3 text-center"
              >
                <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">{label}</p>
                <p className={`text-game-base font-body font-semibold mt-0.5 ${purple ? 'text-purple-400' : 'text-game-gold'}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Anthem */}
          {tribe.anthem && (
            <div className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg px-4 py-3">
              <p className="text-game-sm text-game-text-secondary font-body italic">&quot;{tribe.anthem}&quot;</p>
            </div>
          )}

          {/* ── Daily Tribute / Tax countdown ──────────────────────────────── */}
          <div className="card-game rounded-game-lg p-4">
            <div className="panel-header mb-3">
              <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
                Daily Tribute
              </h2>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Tax amount + exemption */}
              <div className="flex-1 space-y-1">
                <p className="text-game-sm font-body">
                  Amount:{' '}
                  <span className="text-game-gold font-semibold">
                    {formatNumber(tribe.tax_amount)} Gold
                  </span>
                </p>
                {myRole === 'leader' || myRole === 'deputy' ? (
                  <p className="text-game-xs font-body text-blue-400">
                    You are exempt — leader and deputies do not pay tribute.
                  </p>
                ) : membership.tax_exempt ? (
                  <p className="text-game-xs font-body text-blue-400">
                    You have a personal tax exemption.
                  </p>
                ) : (
                  <p className="text-game-xs font-body text-game-text-muted">
                    Collected automatically at {BALANCE.tribe.taxCollectionHour}:00 Israel time.
                    Gold goes directly to the tribe leader.
                  </p>
                )}
              </div>

              {/* Tax countdown */}
              <div className="shrink-0 bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg px-4 py-3 text-center min-w-[120px]">
                <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">
                  Next Collection
                </p>
                <p className="text-game-base font-body font-semibold text-amber-400 mt-0.5 tabular-nums">
                  {countdown || '—'}
                </p>
                {taxStatus?.last_tax_collected_at && (
                  <p className="text-game-xs text-game-text-muted font-body mt-0.5">
                    Last: {taxStatus.last_tax_collected_at}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Contribute Mana ────────────────────────────────────────────── */}
          <div className="card-game rounded-game-lg p-4 space-y-3">
            <div className="panel-header">
              <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
                Contribute Mana
              </h2>
            </div>
            <div className="space-y-1">
              <p className="text-game-xs text-game-text-muted font-body">
                Transfer personal mana from your hero to the tribe pool.
                <span className="text-amber-400 font-semibold"> Permanent — cannot be withdrawn.</span>
              </p>
              <p className="text-game-xs text-game-text-muted font-body">
                Tribe mana is used to cast tribe spells. Only the tribe leader and deputies can activate spells.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Amount"
                value={manaAmount}
                min={1}
                onChange={(e) => setManaAmount(e.target.value)}
                suffix="Mana"
                className="w-44"
              />
              <Button
                variant="magic"
                size="sm"
                loading={loading === 'contribute-mana'}
                disabled={!manaAmount || parseInt(manaAmount) <= 0 || !!loading}
                onClick={handleContributeMana}
              >
                Contribute
              </Button>
            </div>
          </div>

          {/* ── Active Spells ───────────────────────────────────────────────── */}
          {tribeSpells.length > 0 && (
            <div className="card-game rounded-game-lg p-4">
              <div className="panel-header mb-3">
                <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
                  Active Spells
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {tribeSpells.map((spell) => (
                  <div
                    key={spell.spell_key}
                    className="flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 rounded-game-lg px-3 py-1.5"
                  >
                    <span className="text-purple-300 font-heading text-game-xs uppercase tracking-wide">
                      {SPELL_LABELS[spell.spell_key as SpellKey] ?? spell.spell_key}
                    </span>
                    <span className="text-game-xs text-purple-400/70 font-body tabular-nums">
                      until {new Date(spell.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Members ─────────────────────────────────────────────────────── */}
          <div className="panel-ornate rounded-game-lg p-4">
            <div className="panel-header mb-4">
              <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
                Members
                <span className="ms-2 text-game-xs text-game-text-muted font-body normal-case tracking-normal">
                  {localMembers.length} / {tribe.max_members}
                </span>
              </h2>
            </div>

            <GameTable
              headers={[
                'Army',
                'Player',
                'Role',
                'Rep %',
                ...(canManage ? ['Actions'] : []),
              ]}
              striped
              hoverable
              rows={localMembers.map(({ member, player: mp }) => {
                const isSelf   = member.player_id === player.id
                const canKick  = canManage && !isSelf && member.role !== 'leader' &&
                  !(isDeputy && member.role === 'deputy')
                const canAppoint = isLeader && member.role === 'member' && deputyCount < 3 && !isSelf
                const canRemove  = isLeader && member.role === 'deputy' && !isSelf
                const canTransfer = isLeader && member.role === 'deputy' && !isSelf

                return [
                  <span key="army" className="font-heading text-game-sm uppercase text-game-text-white">
                    {mp?.army_name ?? 'Unknown'}
                  </span>,
                  <span key="player" className="text-game-sm font-body text-game-text-secondary">
                    {mp?.username ?? '—'}
                  </span>,
                  <span key="role">{ROLE_BADGE[member.role]}</span>,
                  <span key="pct" className="text-game-sm font-body tabular-nums">
                    {member.reputation_pct.toFixed(1)}%
                  </span>,
                  ...(canManage
                    ? [
                        <div key="actions" className="flex items-center gap-1.5 flex-wrap">
                          {canTransfer && (
                            <Button
                              variant="primary"
                              size="sm"
                              loading={loading === `transfer-${member.player_id}`}
                              disabled={!!loading}
                              onClick={() => handleTransferLeadership(member.player_id)}
                            >
                              Make Leader
                            </Button>
                          )}
                          {canRemove && !canTransfer && (
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={loading === `role-remove-${member.player_id}`}
                              disabled={!!loading}
                              onClick={() => handleSetRole(member.player_id, 'remove')}
                            >
                              Remove Deputy
                            </Button>
                          )}
                          {canAppoint && (
                            <Button
                              variant="ghost"
                              size="sm"
                              loading={loading === `role-appoint-${member.player_id}`}
                              disabled={!!loading}
                              onClick={() => handleSetRole(member.player_id, 'appoint')}
                            >
                              Appoint Deputy
                            </Button>
                          )}
                          {canKick && (
                            <Button
                              variant="danger"
                              size="sm"
                              loading={loading === `kick-${member.player_id}`}
                              disabled={!!loading}
                              onClick={() => handleKickMember(member.player_id)}
                            >
                              Kick
                            </Button>
                          )}
                          {!canKick && !canAppoint && !canRemove && (
                            <span className="text-game-xs text-game-text-muted">—</span>
                          )}
                        </div>,
                      ]
                    : []),
                ]
              })}
            />

            {/* Deputy cap note */}
            {isLeader && deputyCount >= 3 && (
              <p className="mt-2 text-game-xs text-amber-400/70 font-body">
                Deputy cap reached (3/3). Remove a deputy to appoint another.
              </p>
            )}
          </div>

          {/* ── Tribe Spells (leader / deputy only) ─────────────────────────── */}
          {canManage && (
            <div className="card-game rounded-game-lg p-4 space-y-4">
              <div className="panel-header">
                <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
                  Tribe Spells
                </h2>
                <p className="text-game-xs text-game-text-muted font-body mt-0.5">
                  Activated using tribe mana. Effects apply to all tribe members.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {V1_SPELLS.map((spellKey) => {
                  const cfg      = BALANCE.tribe.spells[spellKey]
                  if (!cfg) return null
                  const isActive = tribeSpells.some((s) => s.spell_key === spellKey)

                  return (
                    <div
                      key={spellKey}
                      className={`flex items-center justify-between rounded-game-lg border p-3 transition-colors ${
                        isActive
                          ? 'bg-purple-900/30 border-purple-700/50'
                          : 'bg-gradient-to-b from-game-elevated to-game-surface border-game-border'
                      }`}
                    >
                      <div>
                        <p className="font-heading text-game-xs uppercase tracking-wide text-game-text-white">
                          {SPELL_LABELS[spellKey]}
                        </p>
                        <p className="text-game-xs text-game-text-muted font-body mt-0.5">
                          {SPELL_DESC[spellKey]}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <ResourceBadge type="mana" amount={cfg.manaCost} />
                          {cfg.durationHours > 0 && (
                            <span className="text-game-xs text-game-text-muted font-body">
                              {cfg.durationHours}h
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant={isActive ? 'ghost' : 'magic'}
                        size="sm"
                        disabled={isActive || localTribeMana < cfg.manaCost || !!loading}
                        loading={loading === `spell-${spellKey}`}
                        onClick={() => handleActivateSpell(spellKey)}
                      >
                        {isActive ? 'Active' : 'Cast'}
                      </Button>
                    </div>
                  )
                })}
              </div>

              {localTribeMana < Math.min(...V1_SPELLS.map(k => BALANCE.tribe.spells[k]?.manaCost ?? Infinity)) && (
                <p className="text-game-xs text-amber-400/70 font-body">
                  Tribe mana is low. Members can contribute personal mana to refill the pool.
                </p>
              )}
            </div>
          )}

          {/* ── Leader Controls ─────────────────────────────────────────────── */}
          {isLeader && (
            <div className="panel-ornate rounded-game-lg p-4 space-y-5">
              <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold">
                Leader Controls
              </h2>

              {/* Set Daily Tribute */}
              <div className="space-y-2">
                <p className="text-game-sm font-heading uppercase tracking-wide text-game-text-secondary">
                  Set Daily Tribute
                </p>
                <p className="text-game-xs text-game-text-muted font-body">
                  City {tribe.city} limit: {formatNumber(BALANCE.tribe.taxLimits[`city${tribe.city}`] ?? 0)} Gold.
                  Collected at {BALANCE.tribe.taxCollectionHour}:00 Israel time. Gold comes to your personal account.
                </p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="Gold amount"
                    value={taxAmount}
                    min={0}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    suffix="Gold"
                    className="w-44"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    loading={loading === 'set-tax'}
                    disabled={!taxAmount || !!loading}
                    onClick={handleSetTax}
                  >
                    Update
                  </Button>
                </div>
              </div>

              <div className="divider-gold" />

              {/* Transfer Leadership */}
              <div className="space-y-2">
                <p className="text-game-sm font-heading uppercase tracking-wide text-game-text-secondary">
                  Transfer Leadership
                </p>
                {deputyCount === 0 ? (
                  <p className="text-game-xs text-amber-400/80 font-body">
                    Appoint at least one deputy before transferring leadership.
                    Use the Actions column in the Members table above.
                  </p>
                ) : (
                  <p className="text-game-xs text-game-text-muted font-body">
                    Use the &quot;Make Leader&quot; button next to a deputy in the Members table to transfer leadership.
                    You will become a deputy.
                  </p>
                )}
              </div>

              <div className="divider-gold" />

              {/* Disband Tribe */}
              <div className="space-y-2">
                <p className="text-game-sm font-heading uppercase tracking-wide text-game-text-secondary">
                  Disband Tribe
                </p>
                {localMembers.length > 1 ? (
                  <p className="text-game-xs text-game-text-muted font-body">
                    Cannot disband while members remain. Kick all members or transfer leadership first.
                  </p>
                ) : disbandConfirm ? (
                  <div className="flex items-center gap-3">
                    <span className="text-game-xs text-game-red-bright font-body">
                      Permanently disband this tribe?
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={loading === 'disband'}
                      onClick={handleDisbandTribe}
                    >
                      Yes, Disband
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!loading}
                      onClick={() => setDisbandConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!!loading}
                    onClick={() => setDisbandConfirm(true)}
                  >
                    Disband Tribe
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── Leave Tribe (member / deputy) ──────────────────────────────── */}
          {!isLeader && (
            <div className="card-game rounded-game-lg p-4">
              <div className="panel-header mb-3">
                <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
                  Leave Tribe
                </h2>
              </div>
              <p className="text-game-xs text-game-text-muted font-body mb-3">
                Leaving the tribe is immediate and permanent for this season. Any contributed mana remains with the tribe.
              </p>
              <Button
                variant="danger"
                size="sm"
                loading={loading === 'leave'}
                disabled={!!loading}
                onClick={handleLeaveTribe}
              >
                Leave Tribe
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
