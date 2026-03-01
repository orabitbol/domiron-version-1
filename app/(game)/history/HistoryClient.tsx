'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GameTable } from '@/components/ui/game-table'
import { EmptyState } from '@/components/ui/game-table'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import type { AttackOutcome } from '@/types/game'

interface AttackRow {
  id: string
  created_at: string
  outcome: AttackOutcome
  attacker_losses: number
  defender_losses: number
  slaves_taken: number
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
  target?: { army_name: string } | null
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

const OUTCOME_BADGE: Record<AttackOutcome, { label: string; variant: 'green' | 'gold' | 'red' }> = {
  win:     { label: 'Victory', variant: 'green' },
  partial: { label: 'Draw',    variant: 'gold' },
  loss:    { label: 'Defeat',  variant: 'red' },
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function totalStolen(row: AttackRow) {
  return row.gold_stolen + row.iron_stolen + row.wood_stolen + row.food_stolen
}

const TABS = [
  { key: 'outgoing', label: 'My Attacks' },
  { key: 'incoming', label: 'Incoming Attacks' },
  { key: 'spy',      label: 'Spy Missions' },
]

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

  return (
    <div className="space-y-6">
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
          label: `${t.label}${t.key === 'outgoing' ? ` (${outgoingCount})` : t.key === 'incoming' ? ` (${incomingCount})` : ` (${spyCount})`}`,
        }))}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {/* Outgoing Attacks */}
      {activeTab === 'outgoing' && (
        outgoingAttacks.length === 0 ? (
          <EmptyState
            title="No Attacks Yet"
            description="You haven't attacked anyone this season."
          />
        ) : (
          <GameTable
            headers={['Date', 'Target', 'Outcome', 'Turns', 'Your Losses', 'Enemy Losses', 'Plunder']}
            striped
            rows={outgoingAttacks.map((row) => {
              const outcome = OUTCOME_BADGE[row.outcome]
              const stolen = totalStolen(row)
              return [
                <span key="date" className="text-game-xs text-game-text-muted font-body whitespace-nowrap">
                  {formatDate(row.created_at)}
                </span>,
                <span key="target" className="font-heading text-game-sm uppercase text-game-text-white">
                  {row.defender?.army_name ?? 'Unknown'}
                </span>,
                <Badge key="outcome" variant={outcome.variant}>{outcome.label}</Badge>,
                <span key="turns" className="text-game-sm font-body">{row.turns_used}</span>,
                <span key="aLoss" className="text-game-red-bright font-body tabular-nums">
                  {formatNumber(row.attacker_losses)}
                </span>,
                <span key="dLoss" className="text-game-green-bright font-body tabular-nums">
                  {formatNumber(row.defender_losses)}
                </span>,
                stolen > 0 ? (
                  <div key="plunder" className="flex flex-wrap gap-1">
                    {row.gold_stolen > 0 && <ResourceBadge type="gold" amount={row.gold_stolen} compact />}
                    {row.iron_stolen > 0 && <ResourceBadge type="iron" amount={row.iron_stolen} compact />}
                    {row.wood_stolen > 0 && <ResourceBadge type="wood" amount={row.wood_stolen} compact />}
                    {row.food_stolen > 0 && <ResourceBadge type="food" amount={row.food_stolen} compact />}
                  </div>
                ) : (
                  <span key="none" className="text-game-text-muted text-game-xs">—</span>
                ),
              ]
            })}
          />
        )
      )}

      {/* Incoming Attacks */}
      {activeTab === 'incoming' && (
        incomingAttacks.length === 0 ? (
          <EmptyState
            title="No Incoming Attacks"
            description="No one has attacked you this season."
          />
        ) : (
          <GameTable
            headers={['Date', 'Attacker', 'Outcome', 'Turns', 'Your Losses', 'Attacker Losses', 'Stolen From You']}
            striped
            rows={incomingAttacks.map((row) => {
              const outcome = OUTCOME_BADGE[row.outcome]
              // For incoming, flip the perspective
              const myLosses = row.defender_losses
              const theirLosses = row.attacker_losses
              const stolen = totalStolen(row)
              // Reverse outcome badge for defender perspective
              const defOutcome: AttackOutcome =
                row.outcome === 'win'  ? 'loss'
                : row.outcome === 'loss' ? 'win'
                : 'partial'
              const defOutcomeBadge = OUTCOME_BADGE[defOutcome]

              return [
                <span key="date" className="text-game-xs text-game-text-muted font-body whitespace-nowrap">
                  {formatDate(row.created_at)}
                </span>,
                <span key="attacker" className="font-heading text-game-sm uppercase text-game-text-white">
                  {row.attacker?.army_name ?? 'Unknown'}
                </span>,
                <Badge key="outcome" variant={defOutcomeBadge.variant}>{defOutcomeBadge.label}</Badge>,
                <span key="turns" className="text-game-sm font-body">{row.turns_used}</span>,
                <span key="myLoss" className="text-game-red-bright font-body tabular-nums">
                  {formatNumber(myLosses)}
                </span>,
                <span key="theirLoss" className="text-game-green-bright font-body tabular-nums">
                  {formatNumber(theirLosses)}
                </span>,
                stolen > 0 ? (
                  <div key="stolen" className="flex flex-wrap gap-1">
                    {row.gold_stolen > 0 && <ResourceBadge type="gold" amount={row.gold_stolen} compact />}
                    {row.iron_stolen > 0 && <ResourceBadge type="iron" amount={row.iron_stolen} compact />}
                    {row.wood_stolen > 0 && <ResourceBadge type="wood" amount={row.wood_stolen} compact />}
                    {row.food_stolen > 0 && <ResourceBadge type="food" amount={row.food_stolen} compact />}
                  </div>
                ) : (
                  <span key="none" className="text-game-text-muted text-game-xs">—</span>
                ),
              ]
            })}
          />
        )
      )}

      {/* Spy History */}
      {activeTab === 'spy' && (
        spyHistory.length === 0 ? (
          <EmptyState
            title="No Spy Missions"
            description="You haven't sent any spies this season."
          />
        ) : (
          <GameTable
            headers={['Date', 'Target', 'Result', 'Spies Caught']}
            striped
            rows={spyHistory.map((row) => [
              <span key="date" className="text-game-xs text-game-text-muted font-body whitespace-nowrap">
                {formatDate(row.created_at)}
              </span>,
              <span key="target" className="font-heading text-game-sm uppercase text-game-text-white">
                {row.target?.army_name ?? 'Unknown'}
              </span>,
              row.success ? (
                <Badge key="result" variant="green">Success</Badge>
              ) : (
                <Badge key="result" variant="red">Failed</Badge>
              ),
              <span
                key="caught"
                className={`font-body tabular-nums ${row.spies_caught > 0 ? 'text-game-red-bright' : 'text-game-text-muted'}`}
              >
                {row.spies_caught > 0 ? formatNumber(row.spies_caught) : '0'}
              </span>,
            ])}
          />
        )
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pt-4 space-y-4">
          <div className="divider-ornate" />
          <div className="flex items-center justify-between">
            <p className="text-game-xs text-game-text-muted font-body">
              Page {currentPage} of {totalPages} · {formatNumber(getCount())} total
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => handlePage(currentPage - 1)}
              >
                Previous
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i
                return (
                  <Button
                    key={p}
                    variant={p === currentPage ? 'primary' : 'ghost'}
                    size="sm"
                    onClick={() => handlePage(p)}
                  >
                    {p}
                  </Button>
                )
              })}
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => handlePage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
