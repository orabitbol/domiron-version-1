'use client'

import { useState } from 'react'
import { BALANCE } from '@/lib/game/balance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ResourceBadge } from '@/components/ui/resource-badge'
import { formatNumber } from '@/lib/utils'
import { usePlayer } from '@/lib/context/PlayerContext'
import { useFreeze } from '@/lib/hooks/useFreeze'
import type { Bank, Resources } from '@/types/game'

interface Props {
  bank: Bank
  resources: Resources
}

export function BankClient({ bank: initialBank, resources: initialResources }: Props) {
  const { refresh } = usePlayer()
  const isFrozen = useFreeze()
  const [bank, setBank] = useState(initialBank)
  const [resources, setResources] = useState(initialResources)
  const [depositAmt, setDepositAmt] = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  // BANK_INTEREST_RATE_PER_LEVEL is [TUNE: unassigned] — display 0 until set
  const ratePerLevel = BALANCE.bank.BANK_INTEREST_RATE_PER_LEVEL ?? 0
  const interestRate = bank.interest_level * ratePerLevel * 100
  const maxDeposit = Math.floor(resources.gold * BALANCE.bank.maxDepositPercent)
  const upgradeLevel = bank.interest_level + 1
  const upgradeCost = BALANCE.bank.upgradeBaseCost * upgradeLevel
  const canUpgrade = resources.gold >= upgradeCost
  const depositsRemaining = BALANCE.bank.depositsPerDay - bank.deposits_today

  async function handleDeposit() {
    const amt = parseInt(depositAmt)
    if (!amt || amt <= 0) return
    setLoading('deposit')
    setMessage(null)
    try {
      const res = await fetch('/api/bank/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Deposit failed', type: 'error' })
      } else {
        setMessage({ text: `Deposited ${formatNumber(amt)} Gold`, type: 'success' })
        setDepositAmt('')
        if (data.bank) setBank(data.bank)
        if (data.resources) setResources(data.resources)
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handleWithdraw() {
    const amt = parseInt(withdrawAmt)
    if (!amt || amt <= 0) return
    setLoading('withdraw')
    setMessage(null)
    try {
      const res = await fetch('/api/bank/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Withdrawal failed', type: 'error' })
      } else {
        setMessage({ text: `Withdrew ${formatNumber(amt)} Gold`, type: 'success' })
        setWithdrawAmt('')
        if (data.bank) setBank(data.bank)
        if (data.resources) setResources(data.resources)
        refresh()
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  async function handleUpgrade() {
    setLoading('upgrade')
    setMessage(null)
    try {
      const res = await fetch('/api/bank/upgrade', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Upgrade failed', type: 'error' })
      } else {
        setMessage({ text: 'Interest rate upgraded!', type: 'success' })
        if (data.bank) setBank(data.bank)
        if (data.resources) setResources(data.resources)
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
        <h1 className="font-display text-game-3xl gold-gradient-text-static uppercase tracking-wide text-title-glow">
          The Treasury
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          Protect your gold from raiders and earn interest
        </p>
      </div>

      {/* Message */}
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

      {/* Bank Overview */}
      <div className="panel-ornate rounded-game-lg p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-heading text-game-sm uppercase tracking-wider text-game-text-secondary">
              Bank Balance
            </p>
            <p className="font-display text-game-3xl text-game-gold mt-1">
              {formatNumber(bank.balance)}
            </p>
            <ResourceBadge type="gold" amount={bank.balance} />
          </div>
          <Badge variant="green">
            {(BALANCE.bank.theftProtection * 100).toFixed(0)}% Theft Proof
          </Badge>
        </div>

        <div className="divider-gold" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">Interest Rate</p>
            <p className="text-game-base text-game-gold font-body font-semibold">
              {interestRate.toFixed(3)}%/tick
            </p>
            <p className="text-game-xs text-game-text-muted font-body">Level {bank.interest_level}</p>
          </div>
          <div>
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">Deposits Today</p>
            <p className="text-game-base text-game-text-white font-body font-semibold">
              {bank.deposits_today} / {BALANCE.bank.depositsPerDay}
            </p>
            <p className="text-game-xs text-game-text-muted font-body">{depositsRemaining} remaining</p>
          </div>
          <div>
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">Gold on Hand</p>
            <p className="text-game-base text-game-gold font-body font-semibold">
              {formatNumber(resources.gold)}
            </p>
          </div>
        </div>
      </div>

      {/* Deposit & Withdraw */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Deposit */}
        <div className="card-game rounded-game-lg p-4 space-y-3">
          <div className="panel-header">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
              Deposit Gold
            </h2>
          </div>
          <p className="text-game-xs text-game-text-muted font-body">
            Max deposit: {formatNumber(maxDeposit)} ({(BALANCE.bank.maxDepositPercent * 100).toFixed(0)}% of gold on hand).
            {depositsRemaining <= 0 && (
              <span className="text-game-red-bright"> No deposits remaining today.</span>
            )}
          </p>
          <Input
            type="number"
            label="Amount"
            placeholder="Enter amount"
            value={depositAmt}
            min={1}
            max={maxDeposit}
            onChange={(e) => setDepositAmt(e.target.value)}
            suffix="Gold"
          />
          <div className="flex gap-2">
            <Button
              variant="success"
              size="sm"
              onClick={() => setDepositAmt(String(maxDeposit))}
            >
              Max
            </Button>
            <Button
              variant="primary"
              disabled={
                isFrozen ||
                !depositAmt ||
                parseInt(depositAmt) <= 0 ||
                parseInt(depositAmt) > maxDeposit ||
                depositsRemaining <= 0 ||
                !!loading
              }
              loading={loading === 'deposit'}
              onClick={handleDeposit}
            >
              Deposit
            </Button>
          </div>
        </div>

        {/* Withdraw */}
        <div className="card-game rounded-game-lg p-4 space-y-3">
          <div className="panel-header">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">
              Withdraw Gold
            </h2>
          </div>
          <p className="text-game-xs text-game-text-muted font-body">
            Available to withdraw: {formatNumber(bank.balance)} Gold
          </p>
          <Input
            type="number"
            label="Amount"
            placeholder="Enter amount"
            value={withdrawAmt}
            min={1}
            max={bank.balance}
            onChange={(e) => setWithdrawAmt(e.target.value)}
            suffix="Gold"
          />
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWithdrawAmt(String(bank.balance))}
            >
              All
            </Button>
            <Button
              variant="ghost"
              disabled={
                isFrozen ||
                !withdrawAmt ||
                parseInt(withdrawAmt) <= 0 ||
                parseInt(withdrawAmt) > bank.balance ||
                !!loading
              }
              loading={loading === 'withdraw'}
              onClick={handleWithdraw}
            >
              Withdraw
            </Button>
          </div>
        </div>
      </div>

      {/* Upgrade Interest */}
      <div className="card-game rounded-game-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold">
              Upgrade Interest Rate
            </h2>
            <p className="text-game-sm text-game-text-secondary font-body mt-1">
              Each level adds {(ratePerLevel * 100).toFixed(3)}% interest per tick.
              Current: Level {bank.interest_level} ({interestRate.toFixed(3)}%/tick)
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-game-xs text-game-text-muted font-body">Cost:</span>
              <ResourceBadge type="gold" amount={upgradeCost} />
            </div>
            <p className="text-game-xs text-game-text-muted font-body mt-1">
              You have: {formatNumber(resources.gold)} Gold
            </p>
          </div>
          <Button
            variant="success"
            disabled={isFrozen || !canUpgrade || !!loading}
            loading={loading === 'upgrade'}
            onClick={handleUpgrade}
          >
            Upgrade
          </Button>
        </div>
      </div>
    </div>
  )
}
