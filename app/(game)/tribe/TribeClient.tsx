'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { GameTable } from '@/components/ui/game-table'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { EmptyState } from '@/components/ui/game-table'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import type { Player, Tribe, TribeMember } from '@/types/game'

interface MemberRow {
  member: {
    player_id: string
    reputation: number
    reputation_pct: number
    tax_paid_today: boolean
    tax_exempt: boolean
  }
  player: {
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

interface Props {
  player: Player
  membership: TribeMember | null
  tribe: Tribe | null
  members: MemberRow[]
  tribeSpells: Array<{ spell_key: string; expires_at: string }>
  joinableTribes: JoinableTribe[]
}

type SpellKey = keyof typeof BALANCE.tribe.spells

const SPELL_LABELS: Record<SpellKey, string> = {
  combat_boost: 'Combat Boost',
  tribe_shield: 'Tribe Shield',
  production_blessing: 'Production Blessing',
  mass_spy: 'Mass Spy',
  war_cry: 'War Cry',
}

export function TribeClient({ player, membership, tribe, members, tribeSpells, joinableTribes }: Props) {
  const { refresh } = usePlayer()
  const [tribeName, setTribeName] = useState('')
  const [tribeAnthem, setTribeAnthem] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [taxAmount, setTaxAmount] = useState('')

  const isLeader = tribe && tribe.leader_id === player.id
  const isDeputy = tribe && tribe.deputy_id === player.id
  const canManage = isLeader || isDeputy
  const memberPaid = membership?.tax_paid_today ?? false

  async function handleCreateTribe() {
    if (!tribeName.trim()) return
    setLoading('create')
    setMessage(null)
    try {
      const res = await fetch('/api/tribe/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: tribeName, anthem: tribeAnthem }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Failed to create tribe', type: 'error' })
      } else {
        setMessage({ text: `Tribe "${tribeName}" created!`, type: 'success' })
        window.location.reload()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handleJoinTribe(tribeId: string) {
    setLoading(`join-${tribeId}`)
    setMessage(null)
    try {
      const res = await fetch('/api/tribe/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tribe_id: tribeId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Failed to join tribe', type: 'error' })
      } else {
        setMessage({ text: 'Joined tribe!', type: 'success' })
        window.location.reload()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handlePayTax() {
    setLoading('tax')
    setMessage(null)
    try {
      const res = await fetch('/api/tribe/pay-tax', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Failed to pay tax', type: 'error' })
      } else {
        setMessage({ text: 'Tax paid!', type: 'success' })
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handleActivateSpell(spellKey: SpellKey) {
    setLoading(`spell-${spellKey}`)
    setMessage(null)
    try {
      const res = await fetch('/api/tribe/spell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spell_key: spellKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Failed to activate spell', type: 'error' })
      } else {
        setMessage({ text: `${SPELL_LABELS[spellKey]} activated!`, type: 'success' })
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handleKickMember(memberId: string) {
    setLoading(`kick-${memberId}`)
    setMessage(null)
    try {
      const res = await fetch('/api/tribe/kick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: memberId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Failed to kick member', type: 'error' })
      } else {
        setMessage({ text: 'Member kicked', type: 'success' })
        window.location.reload()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handleSetTax() {
    const amt = parseInt(taxAmount)
    if (!amt || amt <= 0) return
    setLoading('set-tax')
    setMessage(null)
    try {
      const res = await fetch('/api/tribe/set-tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Failed to set tax', type: 'error' })
      } else {
        setMessage({ text: 'Tax updated!', type: 'success' })
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-game-3xl text-game-gold-bright uppercase tracking-wide">
          {tribe ? tribe.name : 'Tribe'}
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          {tribe ? `City ${tribe.city} · Level ${tribe.level}` : 'Join or create a tribe'}
        </p>
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

      {/* NO TRIBE: Create or Join */}
      {!tribe && (
        <>
          {/* Create tribe form */}
          <div className="bg-game-surface border border-game-border rounded-lg p-4 space-y-4">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
              Found a Tribe
            </h2>
            <p className="text-game-sm text-game-text-muted font-body">
              Establish your own tribe in City {player.city}.
            </p>
            <div className="space-y-3">
              <Input
                label="Tribe Name"
                placeholder="Enter tribe name"
                value={tribeName}
                onChange={(e) => setTribeName(e.target.value)}
                maxLength={40}
              />
              <Input
                label="Anthem (optional)"
                placeholder="Your tribe's motto"
                value={tribeAnthem}
                onChange={(e) => setTribeAnthem(e.target.value)}
                maxLength={120}
              />
              <Button
                variant="primary"
                disabled={!tribeName.trim() || !!loading}
                loading={loading === 'create'}
                onClick={handleCreateTribe}
              >
                Create Tribe
              </Button>
            </div>
          </div>

          {/* Joinable tribes */}
          <div className="bg-game-surface border border-game-border rounded-lg p-4">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white mb-3">
              Tribes in City {player.city}
            </h2>
            {joinableTribes.length === 0 ? (
              <EmptyState
                title="No Tribes Available"
                description="No tribes exist in your city yet. Create one!"
              />
            ) : (
              <GameTable
                headers={['Name', 'Level', 'Members', 'Anthem', 'Action']}
                hoverable
                rows={joinableTribes.map((t) => [
                  <span key="name" className="font-heading text-game-sm uppercase text-game-text-white">{t.name}</span>,
                  <Badge key="level" variant="default">Lvl {t.level}</Badge>,
                  <span key="members" className="text-game-sm font-body">{t.member_count} / {t.max_members}</span>,
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

      {/* IN TRIBE */}
      {tribe && membership && (
        <>
          {/* Tribe Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Level',      value: String(tribe.level) },
              { label: 'Reputation', value: formatNumber(tribe.reputation) },
              { label: 'Mana',       value: String(tribe.mana) },
              { label: 'Members',    value: `${members.length} / ${tribe.max_members}` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-game-surface border border-game-border rounded-lg p-3 text-center">
                <p className="text-game-xs text-game-text-secondary font-heading uppercase tracking-wide">{label}</p>
                <p className="text-game-base text-game-text-white font-body font-semibold mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {/* Anthem */}
          {tribe.anthem && (
            <div className="bg-game-surface border border-game-border rounded-lg p-3">
              <p className="text-game-sm text-game-text-secondary font-body italic">&quot;{tribe.anthem}&quot;</p>
            </div>
          )}

          {/* Tax section */}
          <div className="bg-game-surface border border-game-border rounded-lg p-4 space-y-3">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
              Tribute
            </h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-game-sm text-game-text-secondary font-body">
                  Daily Tax: <span className="text-res-gold font-semibold">{formatNumber(tribe.tax_amount)} Gold</span>
                </p>
                <p className="text-game-xs text-game-text-muted font-body mt-0.5">
                  Status: {memberPaid
                    ? <span className="text-game-green-bright">Paid today</span>
                    : membership.tax_exempt
                    ? <span className="text-blue-400">Exempt</span>
                    : <span className="text-game-red-bright">Unpaid</span>
                  }
                </p>
              </div>
              {!memberPaid && !membership.tax_exempt && tribe.tax_amount > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  loading={loading === 'tax'}
                  onClick={handlePayTax}
                >
                  Pay Tax
                </Button>
              )}
            </div>
          </div>

          {/* Active Spells */}
          {tribeSpells.length > 0 && (
            <div className="bg-game-surface border border-game-border rounded-lg p-4">
              <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white mb-3">
                Active Spells
              </h2>
              <div className="flex flex-wrap gap-2">
                {tribeSpells.map((spell) => (
                  <Badge key={spell.spell_key} variant="purple">
                    {SPELL_LABELS[spell.spell_key as SpellKey] ?? spell.spell_key}
                    <span className="ml-1 text-game-xs opacity-70">
                      until {new Date(spell.expires_at).toLocaleTimeString()}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Members Table */}
          <div className="bg-game-surface border border-game-border rounded-lg p-4">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white mb-3">
              Members
            </h2>
            <GameTable
              headers={['Army', 'Player', 'Reputation', 'Rep %', 'Tax Paid', ...(canManage ? ['Action'] : [])]}
              striped
              hoverable
              rows={members.map(({ member, player: mp }) => [
                <span key="army" className="font-heading text-game-sm uppercase text-game-text-white">
                  {mp?.army_name ?? 'Unknown'}
                </span>,
                <span key="player" className="text-game-sm font-body text-game-text-secondary">
                  {mp?.username ?? '—'}
                </span>,
                <span key="rep" className="tabular-nums text-game-sm font-body">
                  {formatNumber(member.reputation)}
                </span>,
                <span key="pct" className="text-game-sm font-body">
                  {member.reputation_pct.toFixed(1)}%
                </span>,
                <span key="tax">
                  {member.tax_paid_today
                    ? <Badge variant="green">Paid</Badge>
                    : member.tax_exempt
                    ? <Badge variant="blue">Exempt</Badge>
                    : <Badge variant="red">Unpaid</Badge>
                  }
                </span>,
                ...(canManage && member.player_id !== player.id
                  ? [
                      <Button
                        key="kick"
                        variant="danger"
                        size="sm"
                        loading={loading === `kick-${member.player_id}`}
                        onClick={() => handleKickMember(member.player_id)}
                      >
                        Kick
                      </Button>,
                    ]
                  : canManage
                  ? [<span key="self" className="text-game-xs text-game-text-muted">{isLeader ? 'Leader' : 'Deputy'}</span>]
                  : []
                ),
              ])}
            />
          </div>

          {/* Leader / Deputy Controls */}
          {canManage && (
            <div className="bg-game-surface border border-game-border-gold rounded-lg p-4 space-y-4">
              <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold-bright">
                {isLeader ? 'Leader Controls' : 'Deputy Controls'}
              </h2>

              {/* Set Tax */}
              {isLeader && (
                <div className="space-y-2">
                  <p className="text-game-sm text-game-text-secondary font-body">
                    Set daily tax amount (max based on city level)
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
                      Set Tax
                    </Button>
                  </div>
                </div>
              )}

              {/* Tribe Spells */}
              <div>
                <p className="text-game-sm text-game-text-secondary font-body mb-2">Activate tribe spells</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.entries(BALANCE.tribe.spells) as [SpellKey, { manaCost: number; durationHours: number }][]).map(
                    ([spellKey, cfg]) => {
                      const isActive = tribeSpells.some((s) => s.spell_key === spellKey)
                      return (
                        <div
                          key={spellKey}
                          className="flex items-center justify-between rounded-lg bg-game-elevated border border-game-border p-2"
                        >
                          <div>
                            <p className="font-heading text-game-xs uppercase tracking-wide text-game-text-white">
                              {SPELL_LABELS[spellKey]}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <ResourceBadge type="mana" amount={cfg.manaCost} />
                              {cfg.durationHours > 0 && (
                                <span className="text-game-xs text-game-text-muted font-body">
                                  {cfg.durationHours}h
                                </span>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="magic"
                            size="sm"
                            disabled={isActive || tribe.mana < cfg.manaCost || !!loading}
                            loading={loading === `spell-${spellKey}`}
                            onClick={() => handleActivateSpell(spellKey)}
                          >
                            {isActive ? 'Active' : 'Cast'}
                          </Button>
                        </div>
                      )
                    }
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
