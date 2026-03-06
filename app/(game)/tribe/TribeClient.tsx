'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { GameTable, EmptyState } from '@/components/ui/game-table'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { Modal } from '@/components/ui/modal'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { Player, Tribe, TribeMember, TribeMemberRole } from '@/types/game'

// ── Types ─────────────────────────────────────────────────────────────────────

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
    power_total: number | null
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

interface ChatMessage {
  id: string
  tribe_id: string
  player_id: string
  message: string
  created_at: string
  username: string
}

interface Props {
  player: Player
  membership: TribeMember | null
  tribe: Tribe | null
  members: MemberRow[]
  tribeSpells: Array<{ spell_key: string; expires_at: string }>
  joinableTribes: JoinableTribe[]
  taxLogToday: Array<{ player_id: string; paid: boolean }>
}

// ── Spell metadata ─────────────────────────────────────────────────────────────

type SpellKey = 'war_cry' | 'tribe_shield' | 'production_blessing' | 'spy_veil' | 'battle_supply'

const SPELL_LABELS: Record<SpellKey, string> = {
  war_cry:             'War Cry',
  tribe_shield:        'Tribe Shield',
  production_blessing: 'Production Blessing',
  spy_veil:            'Spy Veil',
  battle_supply:       'Battle Supply',
}

const SPELL_EFFECT: Record<SpellKey, string> = {
  war_cry:             `Attacker ECP ×${BALANCE.tribe.spellEffects.war_cry.combatMultiplier}`,
  tribe_shield:        `Defender ECP ×${BALANCE.tribe.spellEffects.tribe_shield.defenseMultiplier}`,
  production_blessing: `Slave output ×${BALANCE.tribe.spellEffects.production_blessing.productionMultiplier}`,
  spy_veil:            `Scout defense ×${BALANCE.tribe.spellEffects.spy_veil.scoutDefenseMultiplier}`,
  battle_supply:       `Attack food cost −${(BALANCE.tribe.spellEffects.battle_supply.foodReduction * 100).toFixed(0)}%`,
}

const SPELL_ACCENT: Record<SpellKey, { borderL: string; text: string }> = {
  war_cry:             { borderL: 'border-l-red-600',     text: 'text-red-400'     },
  tribe_shield:        { borderL: 'border-l-blue-600',    text: 'text-blue-400'    },
  production_blessing: { borderL: 'border-l-emerald-600', text: 'text-emerald-400' },
  spy_veil:            { borderL: 'border-l-purple-600',  text: 'text-purple-400'  },
  battle_supply:       { borderL: 'border-l-amber-600',   text: 'text-amber-400'   },
}

const V1_SPELLS: SpellKey[] = [
  'war_cry', 'tribe_shield', 'production_blessing', 'spy_veil', 'battle_supply',
]

// ── Tab definitions ────────────────────────────────────────────────────────────

type TribeTab = 'overview' | 'members' | 'spells' | 'chat'

const TRIBE_TABS: Array<{ key: string; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'members',  label: 'Members'  },
  { key: 'spells',   label: 'Spells'   },
  { key: 'chat',     label: 'Chat'     },
]

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Soon'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1_000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatTimeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m left`
  return `${m}m left`
}

function formatChatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  )
}

function tribeInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

// ── Component ──────────────────────────────────────────────────────────────────

export function TribeClient({
  player,
  membership,
  tribe,
  members,
  tribeSpells,
  joinableTribes,
  taxLogToday,
}: Props) {
  const { refresh } = usePlayer()
  const router      = useRouter()

  // ── State ──────────────────────────────────────────────────────────────────
  const [activeTab,        setActiveTab]        = useState<TribeTab>('overview')
  const [loading,          setLoading]          = useState<string | null>(null)
  const [message,          setMessage]          = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [tribeName,        setTribeName]        = useState('')
  const [tribeAnthem,      setTribeAnthem]      = useState('')
  const [taxAmount,        setTaxAmount]        = useState('')
  const [manaAmount,       setManaAmount]       = useState('')
  const [localMembers,     setLocalMembers]     = useState(members)
  const [localTribeMana,   setLocalTribeMana]   = useState(tribe?.mana ?? 0)
  const [localTaxAmount,   setLocalTaxAmount]   = useState(tribe?.tax_amount ?? 0)
  const [localSpells,      setLocalSpells]      = useState(tribeSpells)
  const [taxStatus,        setTaxStatus]        = useState<TaxStatus | null>(null)
  const [countdown,        setCountdown]        = useState('')
  // Modals
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [showDisbandModal,  setShowDisbandModal]  = useState(false)
  const [showLeaveModal,    setShowLeaveModal]    = useState(false)
  const [transferTarget,    setTransferTarget]    = useState<string | null>(null)
  // Member actions dropdown + portal position
  const [openMenu,         setOpenMenu]         = useState<string | null>(null)
  const [menuPos,          setMenuPos]          = useState<{ top: number; right: number } | null>(null)
  // Chat
  const [chatMessages,     setChatMessages]     = useState<ChatMessage[]>([])
  const [chatInput,        setChatInput]        = useState('')
  const [chatFetched,      setChatFetched]      = useState(false)
  const [chatLoading,      setChatLoading]      = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const myRole     = membership?.role ?? null
  const isLeader   = myRole === 'leader'
  const isDeputy   = myRole === 'deputy'
  const canManage  = isLeader || isDeputy
  const deputyCount    = localMembers.filter((m) => m.member.role === 'deputy').length
  const deputies       = localMembers.filter((m) => m.member.role === 'deputy')
  const leaderUsername = localMembers.find((m) => m.member.role === 'leader')?.player?.username ?? '—'

  // ── Tax status fetch + countdown ───────────────────────────────────────────

  const fetchTaxStatus = useCallback(async () => {
    if (!tribe) return
    try {
      const res  = await fetch('/api/tribe/tax-status')
      const json = await res.json()
      if (res.ok && json.data) setTaxStatus(json.data as TaxStatus)
    } catch {
      // Non-critical
    }
  }, [tribe])

  useEffect(() => { fetchTaxStatus() }, [fetchTaxStatus])

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

  // ── Chat: lazy-fetch on first tab open ────────────────────────────────────

  const fetchChatMessages = useCallback(async () => {
    if (!tribe) return
    setChatLoading(true)
    try {
      const r    = await fetch('/api/tribe/chat')
      const json = await r.json()
      setChatMessages((json.data?.messages as ChatMessage[]) ?? [])
      setChatFetched(true)
    } catch {
      setChatFetched(true)
    } finally {
      setChatLoading(false)
    }
  }, [tribe])

  useEffect(() => {
    if (activeTab !== 'chat' || chatFetched) return
    fetchChatMessages()
  }, [activeTab, chatFetched, fetchChatMessages])

  // Scroll to bottom when messages change while chat is active
  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, activeTab])

  // ── Message helper ─────────────────────────────────────────────────────────

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
      if (!res.ok) { showMsg(data.error ?? 'Failed to leave tribe', 'error'); setShowLeaveModal(false) }
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
      if (!res.ok) { showMsg(data.error ?? 'Failed to disband tribe', 'error'); setShowDisbandModal(false) }
      else router.refresh()
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
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
        const cfg     = BALANCE.tribe.spells[spellKey]
        const cost    = cfg?.manaCost ?? 0
        const hours   = cfg?.durationHours ?? 1
        const expires = new Date(Date.now() + hours * 3_600_000).toISOString()
        setLocalTribeMana((prev) => prev - cost)
        setLocalSpells((prev) => [
          ...prev.filter((s) => s.spell_key !== spellKey),
          { spell_key: spellKey, expires_at: expires },
        ])
        refresh()
      }
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  function closeMenu() {
    setOpenMenu(null)
    setMenuPos(null)
  }

  async function handleKickMember(memberId: string) {
    closeMenu()
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
        setLocalMembers((prev) => prev.filter((m) => m.member.player_id !== memberId))
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
        setLocalTaxAmount(amt)
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
        if (data.data?.new_tribe_mana !== undefined) {
          setLocalTribeMana(data.data.new_tribe_mana as number)
        }
        refresh()
      }
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  async function handleSetRole(targetId: string, action: 'appoint' | 'remove') {
    closeMenu()
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
        showMsg(action === 'appoint' ? 'Deputy appointed' : 'Deputy removed', 'success')
        setLocalMembers((prev) =>
          prev.map((m) =>
            m.member.player_id === targetId
              ? { ...m, member: { ...m.member, role: action === 'appoint' ? 'deputy' : 'member' } }
              : m,
          ),
        )
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
      else {
        setShowTransferModal(false)
        setTransferTarget(null)
        router.refresh()
      }
    } catch { showMsg('Network error', 'error') }
    finally { setLoading(null) }
  }

  async function handleSendChat() {
    const msg = chatInput.trim()
    if (!msg || !tribe) return
    setLoading('send-chat')
    // Optimistically add the message immediately
    const optimisticId = `opt-${Date.now()}`
    const optimistic: ChatMessage = {
      id:         optimisticId,
      tribe_id:   tribe.id,
      player_id:  player.id,
      message:    msg,
      created_at: new Date().toISOString(),
      username:   player.username,
    }
    setChatMessages((prev) => [...prev, optimistic])
    setChatInput('')
    try {
      const res  = await fetch('/api/tribe/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Remove the optimistic message on failure
        setChatMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        setChatInput(msg) // restore input
        showMsg(data.error ?? 'Failed to send message', 'error')
      } else {
        // Replace the optimistic message with the real one from server
        const real = data.data?.message as ChatMessage
        setChatMessages((prev) =>
          prev.map((m) => (m.id === optimisticId ? { ...real, username: player.username } : m)),
        )
      }
    } catch {
      setChatMessages((prev) => prev.filter((m) => m.id !== optimisticId))
      setChatInput(msg)
      showMsg('Network error', 'error')
    }
    finally { setLoading(null) }
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const taxCollectionHour = BALANCE.tribe.taxCollectionHour

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

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
          className={`rounded-game-lg border px-4 py-2.5 font-body text-game-sm ${
            message.type === 'success'
              ? 'bg-game-green/10 border-green-900 text-game-green-bright'
              : 'bg-game-red/10 border-red-900 text-game-red-bright'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* NO TRIBE STATE                                                         */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {!tribe && (
        <>
          <div className="card-game rounded-game-lg p-5 space-y-4">
            <div className="panel-header">
              <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">Found a Tribe</h2>
            </div>
            <p className="text-game-sm text-game-text-muted font-body">
              Costs{' '}
              <span className="text-purple-400 font-semibold">{BALANCE.tribe.creationManaCost} personal mana</span>
              {' '}to establish.
            </p>
            <div className="space-y-3">
              <Input label="Tribe Name" placeholder="Enter tribe name (3–40 characters)" value={tribeName}
                onChange={(e) => setTribeName(e.target.value)} maxLength={40} />
              <Input label="Anthem (optional)" placeholder="Your tribe's motto or battle cry" value={tribeAnthem}
                onChange={(e) => setTribeAnthem(e.target.value)} maxLength={120} />
              <Button variant="primary" disabled={tribeName.trim().length < 3 || !!loading}
                loading={loading === 'create'} onClick={handleCreateTribe}>
                Create Tribe
              </Button>
            </div>
          </div>

          <div className="card-game rounded-game-lg p-5">
            <div className="panel-header mb-4">
              <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
                Tribes in City {player.city}
              </h2>
            </div>
            {joinableTribes.length === 0 ? (
              <EmptyState title="No Tribes Available" description="No tribes exist in your city yet. Be the first to found one." />
            ) : (
              <GameTable
                headers={['Name', 'Level', 'Members', 'Anthem', 'Action']}
                hoverable
                rows={joinableTribes.map((t) => [
                  <span key="name" className="font-heading text-game-sm uppercase text-game-text-white">{t.name}</span>,
                  <Badge key="level" variant="default">Lvl {t.level}</Badge>,
                  <span key="members" className="text-game-sm font-body tabular-nums">{t.member_count} / {t.max_members}</span>,
                  <span key="anthem" className="text-game-sm text-game-text-muted font-body italic">{t.anthem ?? '—'}</span>,
                  <Button key="join" variant="primary" size="sm"
                    disabled={t.member_count >= t.max_members || !!loading}
                    loading={loading === `join-${t.id}`}
                    onClick={() => handleJoinTribe(t.id)}>Join</Button>,
                ])}
              />
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* IN TRIBE STATE — TABBED                                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tribe && membership && (
        <>
          <Tabs tabs={TRIBE_TABS} activeTab={activeTab} onChange={(k) => setActiveTab(k as TribeTab)} />

          {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-4">

              {/* Identity card */}
              <div className="card-game rounded-game-lg p-4">
                <div className="flex items-center gap-4">
                  <div className="shrink-0 size-16 rounded-full bg-gradient-to-br from-game-gold/25 to-game-bg border-2 border-game-border-gold shadow-[0_0_18px_rgba(201,144,26,0.2)] flex items-center justify-center">
                    <span className="font-display text-xl font-bold text-game-gold">{tribeInitials(tribe.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-heading text-game-xl uppercase tracking-wider text-game-gold-bright leading-tight">
                      {tribe.name}
                    </h2>
                    {tribe.anthem && (
                      <p className="text-game-xs font-body italic text-game-text-secondary mt-0.5 truncate">
                        &quot;{tribe.anthem}&quot;
                      </p>
                    )}
                    <p className="text-game-xs text-game-text-muted font-body mt-1">
                      City {tribe.city}&nbsp;·&nbsp;Lv {tribe.level}&nbsp;·&nbsp;Led by{' '}
                      <span className="text-game-text-secondary">{leaderUsername}</span>
                    </p>
                  </div>
                </div>

                {/* Stats strip */}
                <div className="grid grid-cols-4 gap-2 mt-4">
                  {[
                    { label: 'Level',   value: String(tribe.level)                          },
                    { label: 'Rep',     value: formatNumber(tribe.reputation)                },
                    { label: 'Members', value: `${localMembers.length}/${tribe.max_members}` },
                    { label: 'Power',   value: formatNumber(tribe.power_total)               },
                  ].map(({ label, value }) => (
                    <div key={label}
                      className="bg-gradient-to-b from-game-elevated to-game-surface border border-game-border rounded-game-lg p-2.5 text-center">
                      <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">{label}</p>
                      <p className="text-game-sm font-body font-semibold mt-0.5 text-game-gold tabular-nums">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tribute panel — prominent */}
              <div className="relative rounded-game-lg border border-amber-700/50 bg-gradient-to-br from-amber-950/50 via-[#1A1208] to-game-surface overflow-hidden">
                {/* Decorative left accent */}
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-amber-500 via-amber-600 to-amber-800 rounded-l-game-lg" />
                <div className="px-5 py-4 ps-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-game-xs font-heading uppercase tracking-widest text-amber-500/80 mb-1">
                        Daily Tribute
                      </p>
                      <p className="text-3xl font-body font-bold text-amber-300 tabular-nums leading-none">
                        {formatNumber(localTaxAmount)}<span className="text-xl text-amber-400/70 ms-1">Gold</span>
                      </p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <span className="text-game-sm font-body tabular-nums text-amber-200">
                            {countdown ? `Next: ${countdown}` : '—'}
                          </span>
                        </div>
                        <span className="text-game-xs text-amber-600/70 font-body">
                          Daily at {taxCollectionHour}:00 Israel time
                        </span>
                      </div>
                      {taxStatus?.last_tax_collected_at && (
                        <p className="text-game-xs text-amber-700/70 font-body mt-1">
                          Last collected: {taxStatus.last_tax_collected_at}
                        </p>
                      )}
                    </div>

                    {/* Leader: set tribute inline */}
                    {isLeader && (
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <p className="text-game-xs text-amber-600/80 font-heading uppercase tracking-wide">
                          Set Tribute
                        </p>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            placeholder="Gold"
                            value={taxAmount}
                            min={0}
                            onChange={(e) => setTaxAmount(e.target.value)}
                            className="w-28"
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            loading={loading === 'set-tax'}
                            disabled={!taxAmount || !!loading}
                            onClick={handleSetTax}
                          >
                            Set
                          </Button>
                        </div>
                        <p className="text-game-xs text-amber-700/60 font-body">
                          City cap: {formatNumber(BALANCE.tribe.taxLimits[`city${tribe.city}`] ?? 0)}g
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Mana panel */}
              <div className="bg-gradient-to-b from-purple-950/40 to-game-surface border border-purple-800/40 rounded-game-lg p-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-game-xs font-heading uppercase tracking-wide text-purple-400 mb-0.5">Tribe Mana</p>
                    <p className="text-2xl font-body font-bold text-purple-300 tabular-nums">{formatNumber(localTribeMana)}</p>
                    <p className="text-game-xs text-game-text-muted font-body mt-0.5">
                      +{localMembers.length * BALANCE.tribe.manaPerMemberPerTick} per tick · {localMembers.length} members
                    </p>
                  </div>
                  <Button variant="link" size="sm" onClick={() => setActiveTab('spells')}>
                    Manage Spells →
                  </Button>
                </div>
              </div>

              {/* Active spells strip */}
              {localSpells.length > 0 && (
                <div className="card-game rounded-game-lg px-4 py-3">
                  <p className="text-game-xs font-heading uppercase tracking-wide text-purple-400 mb-2">Active Spells</p>
                  <div className="flex flex-wrap gap-2">
                    {localSpells.map((spell) => (
                      <div key={spell.spell_key}
                        className="flex items-center gap-2 bg-purple-900/30 border border-purple-700/40 rounded-game-lg px-3 py-1.5">
                        <span className="text-purple-300 font-heading text-game-xs uppercase tracking-wide">
                          {SPELL_LABELS[spell.spell_key as SpellKey] ?? spell.spell_key}
                        </span>
                        <span className="text-game-xs text-purple-400/70 font-body tabular-nums">
                          · {formatTimeLeft(spell.expires_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* My status + tribe actions */}
              <div className="card-game rounded-game-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span>
                    {myRole === 'leader' && <Badge variant="gold">Leader</Badge>}
                    {myRole === 'deputy' && <Badge variant="purple">Deputy</Badge>}
                    {myRole === 'member' && <Badge variant="default">Member</Badge>}
                  </span>
                  <span className="text-game-sm font-body text-game-text-secondary">
                    {myRole === 'leader' && 'You lead this tribe.'}
                    {myRole === 'deputy' && 'You are a deputy.'}
                    {myRole === 'member' && (
                      membership.tax_exempt
                        ? 'Personal tribute exemption.'
                        : `Pays ${formatNumber(localTaxAmount)} gold/day.`
                    )}
                  </span>
                  {(myRole === 'leader' || myRole === 'deputy') && (
                    <span className="text-game-xs text-amber-400/70 font-body">Tax exempt</span>
                  )}
                </div>

                <div className="divider-gold" />

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Non-leaders: Leave */}
                  {!isLeader && (
                    <Button variant="ghost" size="sm" onClick={() => setShowLeaveModal(true)}>
                      Leave Tribe
                    </Button>
                  )}

                  {/* Leader: Transfer leadership */}
                  {isLeader && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTransferTarget(null)
                        setShowTransferModal(true)
                      }}
                    >
                      Transfer Leadership
                    </Button>
                  )}

                  {/* Leader: Disband (only when alone) */}
                  {isLeader && localMembers.length <= 1 && (
                    <Button variant="danger" size="sm" onClick={() => setShowDisbandModal(true)}>
                      Disband Tribe
                    </Button>
                  )}

                  {isLeader && localMembers.length > 1 && (
                    <p className="text-game-xs text-game-text-muted font-body">
                      To disband, remove all members first or transfer leadership.
                    </p>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ── MEMBERS ───────────────────────────────────────────────────── */}
          {activeTab === 'members' && (
            <div className="space-y-4">

              {/* Tribute + schedule strip */}
              <div className="relative rounded-game-lg border border-amber-800/40 bg-gradient-to-r from-amber-950/40 via-[#1a1208]/60 to-game-surface overflow-hidden">
                <div className="absolute inset-y-0 start-0 w-[3px] bg-gradient-to-b from-amber-400 to-amber-700 rounded-s-game-lg" />
                <div className="flex items-center gap-4 ps-5 pe-4 py-3 flex-wrap">
                  <div className="flex items-baseline gap-2">
                    <span className="text-game-xs font-heading uppercase tracking-widest text-amber-500/80">Tribute</span>
                    <span className="font-body font-bold text-amber-300 tabular-nums text-game-base">
                      {formatNumber(localTaxAmount)} <span className="text-amber-400/70 text-game-xs font-normal">gold/day</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-game-xs font-body">
                    <span className="size-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    <span className="text-amber-300/80 tabular-nums">{countdown || '—'}</span>
                  </div>
                  <span className="text-game-xs text-amber-700/60 font-body ms-auto">
                    Daily at {taxCollectionHour}:00 Israel time
                  </span>
                </div>
              </div>

              {/* Roster panel — NO overflow-hidden so portal menus can escape cleanly */}
              <div className="panel-ornate rounded-game-lg">

                {/* Panel header — gets its own rounded top corners clip */}
                <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-b from-game-elevated/80 to-transparent border-b border-game-border-gold/40 rounded-t-game-lg overflow-hidden">
                  <div className="flex items-center gap-3">
                    <h2 className="font-heading text-game-base uppercase tracking-widest text-game-gold-bright">
                      Roster
                    </h2>
                    <span className="chip bg-game-border/60 text-game-text-muted border border-game-border/60">
                      {localMembers.length}/{tribe.max_members}
                    </span>
                  </div>
                  {isLeader && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setTransferTarget(null); setShowTransferModal(true) }}
                    >
                      Transfer Leadership
                    </Button>
                  )}
                </div>

                {/* Click-outside overlay — closes portal menu */}
                {openMenu && (
                  <div className="fixed inset-0 z-[998]" onClick={closeMenu} />
                )}

                {/* Member list */}
                <div>
                  {localMembers.map(({ member, player: mp }) => {
                    const isSelf     = member.player_id === player.id
                    const canKick    = canManage && !isSelf && member.role !== 'leader' &&
                      !(isDeputy && member.role === 'deputy')
                    const canAppoint = isLeader && member.role === 'member' && deputyCount < 3 && !isSelf
                    const canRemove  = isLeader && member.role === 'deputy' && !isSelf
                    const hasActions = canKick || canAppoint || canRemove
                    const isExempt   = member.role === 'leader' || member.role === 'deputy' || member.tax_exempt
                    const taxEntry   = taxLogToday.find((t) => t.player_id === member.player_id)

                    const accentBar =
                      member.role === 'leader' ? 'bg-gradient-to-b from-amber-400 to-amber-700' :
                      member.role === 'deputy' ? 'bg-gradient-to-b from-purple-400 to-purple-700' :
                                                 'bg-game-border/40'

                    const avatarRing =
                      member.role === 'leader' ? 'border-amber-500/60 shadow-[0_0_12px_rgba(201,144,26,0.3)]' :
                      member.role === 'deputy' ? 'border-purple-500/60 shadow-[0_0_12px_rgba(168,85,247,0.25)]' :
                                                 'border-game-border/50'

                    const avatarText =
                      member.role === 'leader' ? 'text-game-gold' :
                      member.role === 'deputy' ? 'text-purple-300' :
                                                 'text-game-text-secondary'

                    const initials = (mp?.army_name ?? mp?.username ?? '?')
                      .split(/\s+/).map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase()

                    return (
                      <div
                        key={member.player_id}
                        className="relative flex items-center gap-5 ps-9 pe-6 py-5 border-b border-game-border/25 last:border-0 hover:bg-game-gold/[0.03] transition-colors"
                      >
                        {/* Left role accent bar */}
                        <div className={`absolute inset-y-0 start-0 w-[3px] ${accentBar}`} />

                        {/* Avatar */}
                        <div className={`shrink-0 size-11 rounded-full border-2 ${avatarRing} bg-gradient-to-br from-game-bg/80 to-game-elevated flex items-center justify-center`}>
                          <span className={`font-heading text-game-xs font-bold ${avatarText}`}>{initials}</span>
                        </div>

                        {/* Identity */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white leading-tight truncate">
                              {mp?.army_name ?? 'Unknown Army'}
                            </p>
                            {isSelf && (
                              <span className="shrink-0 text-game-xs text-game-gold/50 font-body">(you)</span>
                            )}
                          </div>
                          <p className="text-game-xs text-game-text-muted font-body mt-0.5 truncate">
                            {mp?.username ?? '—'}
                            {mp?.power_total != null && (
                              <span className="ms-2 text-game-text-muted/60 tabular-nums">
                                · {formatNumber(mp.power_total)} pwr
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Role badge */}
                        <div className="shrink-0 min-w-[72px] flex justify-center">
                          {member.role === 'leader' && <Badge variant="gold">Leader</Badge>}
                          {member.role === 'deputy' && <Badge variant="purple">Deputy</Badge>}
                          {member.role === 'member' && <Badge variant="default">Member</Badge>}
                        </div>

                        {/* Tax status pill */}
                        <div className="shrink-0 min-w-[80px] flex justify-end">
                          {isExempt ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-game-xs font-body font-medium bg-blue-900/30 border border-blue-700/30 text-blue-300">
                              Exempt
                            </span>
                          ) : taxEntry === undefined ? (
                            <span className="text-game-xs text-game-text-muted/50 font-body">—</span>
                          ) : taxEntry.paid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-game-xs font-body font-semibold bg-emerald-900/30 border border-emerald-700/30 text-emerald-300">
                              ✓ Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-game-xs font-body font-semibold bg-red-900/30 border border-red-700/30 text-game-red-bright">
                              ✗ Unpaid
                            </span>
                          )}
                        </div>

                        {/* "Manage" action trigger — portal dropdown */}
                        {canManage && hasActions && (
                          <div className="shrink-0">
                            <button
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-game border border-game-border/60 bg-game-surface/40 text-game-xs font-heading uppercase tracking-wide text-game-text-muted hover:border-game-border-gold/60 hover:text-game-gold hover:bg-game-elevated/80 active:scale-95 transition-all cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (openMenu === member.player_id) {
                                  closeMenu()
                                  return
                                }
                                const rect = e.currentTarget.getBoundingClientRect()
                                const dropdownH = 200
                                const top = rect.bottom + 6 + dropdownH > window.innerHeight
                                  ? rect.top - dropdownH - 6
                                  : rect.bottom + 6
                                setMenuPos({ top, right: window.innerWidth - rect.right })
                                setOpenMenu(member.player_id)
                              }}
                            >
                              Manage
                              <span className="text-[9px] opacity-50 leading-none">▾</span>
                            </button>

                            {/* Portal: renders into document.body, escapes all overflow-hidden ancestors */}
                            {openMenu === member.player_id && menuPos && typeof document !== 'undefined' && createPortal(
                              <div
                                style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
                                className="w-56 bg-[#130e07] border border-game-border-gold/50 rounded-game-lg shadow-[0_16px_48px_rgba(0,0,0,0.85),0_0_0_1px_rgba(201,144,26,0.08)] overflow-hidden"
                              >
                                {/* Target identity header */}
                                <div className="px-4 py-3 border-b border-game-border/40 bg-gradient-to-b from-game-elevated/50 to-transparent">
                                  <p className="text-game-xs font-heading uppercase tracking-wide text-game-gold/80 truncate leading-tight">
                                    {mp?.army_name ?? '—'}
                                  </p>
                                  <p className="text-game-xs text-game-text-muted font-body mt-0.5">
                                    {mp?.username ?? '—'}
                                  </p>
                                </div>

                                {/* Role actions */}
                                {(canAppoint || canRemove) && (
                                  <div className="py-1.5">
                                    {canAppoint && (
                                      <button
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-game-sm font-body text-game-text-secondary hover:bg-purple-950/50 hover:text-purple-200 transition-colors cursor-pointer"
                                        onClick={() => handleSetRole(member.player_id, 'appoint')}
                                      >
                                        <span className="shrink-0 size-5 rounded-full bg-purple-900/60 border border-purple-700/50 flex items-center justify-center text-[10px] text-purple-300">↑</span>
                                        Appoint Deputy
                                      </button>
                                    )}
                                    {canRemove && (
                                      <button
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-game-sm font-body text-game-text-secondary hover:bg-game-elevated/60 hover:text-game-text-white transition-colors cursor-pointer"
                                        onClick={() => handleSetRole(member.player_id, 'remove')}
                                      >
                                        <span className="shrink-0 size-5 rounded-full bg-game-border/50 border border-game-border flex items-center justify-center text-[10px] text-game-text-muted">↓</span>
                                        Remove Deputy
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* Kick action — visually separated */}
                                {canKick && (
                                  <>
                                    {(canAppoint || canRemove) && (
                                      <div className="h-px bg-game-border/40 mx-3" />
                                    )}
                                    <div className="py-1.5">
                                      <button
                                        className="w-full flex items-center gap-3 px-4 py-2.5 text-game-sm font-body text-game-red-bright hover:bg-red-950/50 transition-colors cursor-pointer"
                                        onClick={() => handleKickMember(member.player_id)}
                                      >
                                        <span className="shrink-0 size-5 rounded-full bg-red-950/70 border border-red-800/50 flex items-center justify-center text-[10px] text-red-400">✕</span>
                                        Kick Member
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>,
                              document.body
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Footer — deputy cap warning */}
                {isLeader && deputyCount >= 3 && (
                  <div className="px-6 py-3 border-t border-game-border/25 rounded-b-game-lg overflow-hidden bg-amber-950/10">
                    <p className="text-game-xs text-amber-400/70 font-body">
                      Deputy cap reached (3/3). Remove a deputy before appointing another.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SPELLS ────────────────────────────────────────────────────── */}
          {activeTab === 'spells' && (
            <div className="space-y-3">

              {/* Mana pool + contribute */}
              <div className="bg-gradient-to-b from-purple-950/40 to-game-surface border border-purple-800/40 rounded-game-lg p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex-1">
                    <p className="text-game-xs font-heading uppercase tracking-wide text-purple-400">Tribe Mana Pool</p>
                    <p className="text-2xl font-body font-bold text-purple-300 tabular-nums mt-0.5">
                      {formatNumber(localTribeMana)}
                    </p>
                    <p className="text-game-xs text-game-text-muted font-body mt-0.5">
                      +{localMembers.length * BALANCE.tribe.manaPerMemberPerTick} per tick · regen from members
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input type="number" placeholder="Mana" value={manaAmount} min={1}
                      onChange={(e) => setManaAmount(e.target.value)} className="w-24" />
                    <Button variant="magic" size="sm"
                      loading={loading === 'contribute-mana'}
                      disabled={!manaAmount || parseInt(manaAmount) <= 0 || !!loading}
                      onClick={handleContributeMana}>
                      Contribute
                    </Button>
                  </div>
                </div>
                <p className="text-game-xs text-purple-400/50 font-body mt-2.5 pt-2.5 border-t border-purple-800/30">
                  Contributions are permanent. Only leaders and deputies can cast spells.
                </p>
              </div>

              {/* Compact spell rows */}
              <div className="card-game rounded-game-lg overflow-hidden divide-y divide-game-border/40">
                {V1_SPELLS.map((spellKey) => {
                  const cfg         = BALANCE.tribe.spells[spellKey]
                  if (!cfg) return null
                  const activeSpell = localSpells.find((s) => s.spell_key === spellKey)
                  const isActive    = !!activeSpell
                  const accent      = SPELL_ACCENT[spellKey]

                  return (
                    <div
                      key={spellKey}
                      className={`flex items-center gap-3 px-4 py-3 border-l-2 ${accent.borderL} ${
                        isActive ? 'bg-purple-900/10' : 'hover:bg-game-elevated/40'
                      } transition-colors`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-heading text-game-sm uppercase tracking-wide ${accent.text}`}>
                            {SPELL_LABELS[spellKey]}
                          </span>
                          {isActive && <Badge variant="purple">Active</Badge>}
                        </div>
                        <p className="text-game-xs text-game-text-muted font-body mt-0.5">
                          {SPELL_EFFECT[spellKey]}
                          {isActive && activeSpell && (
                            <span className="text-purple-400/80 ms-2 tabular-nums">
                              · {formatTimeLeft(activeSpell.expires_at)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="shrink-0 text-end">
                        <ResourceBadge type="mana" amount={cfg.manaCost} />
                        <p className="text-game-xs text-game-text-muted font-body mt-0.5">{cfg.durationHours}h</p>
                      </div>
                      {canManage && (
                        <Button
                          variant={isActive ? 'ghost' : 'magic'}
                          size="sm"
                          disabled={isActive || localTribeMana < cfg.manaCost || !!loading}
                          loading={loading === `spell-${spellKey}`}
                          onClick={() => handleActivateSpell(spellKey)}
                        >
                          {isActive ? 'Active' : 'Cast'}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>

              {!canManage && (
                <p className="text-game-xs text-game-text-muted font-body text-center py-1">
                  Only the tribe leader and deputies can activate spells.
                </p>
              )}
            </div>
          )}

          {/* ── CHAT ──────────────────────────────────────────────────────── */}
          {activeTab === 'chat' && (
            <div className="flex flex-col gap-0 card-game rounded-game-lg overflow-hidden" style={{ height: '520px' }}>

              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-game-border/60 bg-game-elevated/40 shrink-0">
                <span className="font-heading text-game-xs uppercase tracking-wide text-game-text-secondary">
                  Tribe Chat
                </span>
                <span className="text-game-xs text-game-text-muted font-body ms-1">
                  · {localMembers.length} members
                </span>
                <button
                  className="ms-auto flex items-center gap-1 px-2 py-1 rounded-game text-game-xs text-game-text-muted hover:text-game-text-white hover:bg-game-elevated transition-colors font-body disabled:opacity-40 cursor-pointer"
                  disabled={chatLoading}
                  onClick={() => { setChatFetched(false) }}
                  title="Refresh messages"
                >
                  ↻ Refresh
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
                {chatLoading ? (
                  <div className="h-full flex items-center justify-center text-game-sm text-game-text-muted font-body">
                    Loading messages…
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                    <p className="text-game-sm text-game-text-muted font-body">No messages yet.</p>
                    <p className="text-game-xs text-game-text-muted font-body">
                      Be the first to speak — your words echo through the halls of {tribe.name}.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => {
                    const isSelf = msg.player_id === player.id
                    return (
                      <div key={msg.id} className={`flex gap-2.5 ${isSelf ? 'flex-row-reverse' : ''}`}>
                        {/* Avatar initial */}
                        <div className="shrink-0 size-7 rounded-full flex items-center justify-center text-game-xs font-heading font-bold mt-0.5
                          bg-gradient-to-br from-game-gold/20 to-game-bg border border-game-border-gold/40 text-game-gold">
                          {msg.username[0]?.toUpperCase() ?? '?'}
                        </div>
                        <div className={`flex-1 max-w-[75%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col`}>
                          <div className="flex items-baseline gap-2 mb-0.5">
                            {!isSelf && (
                              <span className="text-game-xs font-heading text-game-text-secondary uppercase tracking-wide">
                                {msg.username}
                              </span>
                            )}
                            <span className="text-game-xs text-game-text-muted font-body tabular-nums">
                              {formatChatTime(msg.created_at)}
                            </span>
                          </div>
                          <div className={`rounded-game-lg px-3 py-2 text-game-sm font-body leading-relaxed break-words
                            ${isSelf
                              ? 'bg-game-gold/10 border border-game-border-gold/30 text-game-text-white rounded-tr-none'
                              : 'bg-game-elevated border border-game-border/40 text-game-text-secondary rounded-tl-none'
                            }`}>
                            {msg.id.startsWith('opt-') ? (
                              <span className="opacity-60">{msg.message}</span>
                            ) : (
                              msg.message
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Input */}
              <div className="shrink-0 border-t border-game-border/60 px-4 py-3 bg-game-surface flex items-center gap-2">
                <input
                  className="flex-1 bg-game-elevated border border-game-border rounded-game px-3 py-2 text-game-sm font-body text-game-text-white placeholder:text-game-text-muted focus:outline-none focus:border-game-border-active transition-colors"
                  placeholder="Type a message…"
                  value={chatInput}
                  maxLength={500}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat() } }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  loading={loading === 'send-chat'}
                  disabled={!chatInput.trim() || !!loading}
                  onClick={handleSendChat}
                >
                  Send
                </Button>
              </div>
            </div>
          )}

        </>
      )}

      {/* ── MODALS ──────────────────────────────────────────────────────────── */}

      {/* Transfer Leadership modal */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => { setShowTransferModal(false); setTransferTarget(null) }}
        title="Transfer Leadership"
        size="sm"
      >
        <p className="text-game-sm font-body text-game-text-secondary mb-4">
          Select a deputy to become the new tribe leader.
          You will become a deputy after the transfer.
        </p>

        {deputies.length === 0 ? (
          <div className="bg-amber-950/30 border border-amber-800/40 rounded-game-lg px-4 py-3 text-game-sm font-body text-amber-400/80">
            No deputies are currently appointed. Go to the Members tab to appoint a deputy before transferring leadership.
          </div>
        ) : (
          <div className="space-y-2">
            {deputies.map(({ member, player: dp }) => (
              <div key={member.player_id}
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-game-lg border transition-colors cursor-pointer
                  ${transferTarget === member.player_id
                    ? 'border-game-border-gold bg-game-gold/5'
                    : 'border-game-border hover:border-game-border-gold/50 hover:bg-game-elevated/40'
                  }`}
                onClick={() => setTransferTarget(member.player_id)}
              >
                <div>
                  <p className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                    {dp?.username ?? '—'}
                  </p>
                  <p className="text-game-xs text-game-text-muted font-body mt-0.5">{dp?.army_name ?? '—'}</p>
                </div>
                <div className="size-4 rounded-full border-2 border-game-border-gold/50 flex items-center justify-center">
                  {transferTarget === member.player_id && (
                    <div className="size-2 rounded-full bg-game-gold" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {transferTarget && (
          <div className="mt-4 pt-4 border-t border-game-border/40 flex items-center justify-between gap-3">
            <p className="text-game-xs text-amber-400/70 font-body">
              This action cannot be undone from this screen.
            </p>
            <div className="flex gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => setTransferTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={loading?.startsWith('transfer-')}
                disabled={!!loading}
                onClick={() => handleTransferLeadership(transferTarget)}
              >
                Confirm Transfer
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Leave Tribe modal */}
      <Modal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        title="Leave Tribe"
        size="sm"
      >
        <p className="text-game-sm font-body text-game-text-secondary">
          Are you sure you want to leave <span className="text-game-text-white font-semibold">{tribe?.name}</span>?
        </p>
        <p className="text-game-xs text-game-text-muted font-body mt-2">
          This is immediate and permanent for this season. Any mana you contributed stays with the tribe.
        </p>
        <div className="flex gap-3 mt-5 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowLeaveModal(false)}>Stay</Button>
          <Button variant="danger" size="sm" loading={loading === 'leave'} disabled={!!loading}
            onClick={handleLeaveTribe}>
            Leave Tribe
          </Button>
        </div>
      </Modal>

      {/* Disband Tribe modal */}
      <Modal
        isOpen={showDisbandModal}
        onClose={() => setShowDisbandModal(false)}
        title="Disband Tribe"
        size="sm"
      >
        <p className="text-game-sm font-body text-game-text-secondary">
          Permanently dissolve <span className="text-game-text-white font-semibold">{tribe?.name}</span>?
        </p>
        <p className="text-game-xs text-game-text-muted font-body mt-2">
          All members will be removed. Tribe mana, history, and reputation will be lost. This cannot be undone.
        </p>
        <div className="flex gap-3 mt-5 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowDisbandModal(false)}>Cancel</Button>
          <Button variant="danger" size="sm" loading={loading === 'disband'} disabled={!!loading}
            onClick={handleDisbandTribe}>
            Disband Forever
          </Button>
        </div>
      </Modal>

    </div>
  )
}
