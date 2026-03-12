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

export function BankClient() {
  const { bank, resources, refresh, applyPatch } = usePlayer()
  const isFrozen = useFreeze()
  const [depositAmt, setDepositAmt] = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const currentBank = bank ?? { balance: 0, interest_level: 0, deposits_today: 0 }
  const currentResources = resources ?? { gold: 0, iron: 0, wood: 0, food: 0 }

  const interestRate = (BALANCE.bank.INTEREST_RATE_BY_LEVEL[currentBank.interest_level] ?? 0) * 100
  const maxDeposit = Math.floor(currentResources.gold * BALANCE.bank.maxDepositPercent)
  const upgradeLevel = currentBank.interest_level + 1
  const upgradeCost = BALANCE.bank.upgradeBaseCost * upgradeLevel
  const canUpgrade = currentResources.gold >= upgradeCost
  const depositsRemaining = BALANCE.bank.depositsPerDay - currentBank.deposits_today

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
        if (data.bank)      applyPatch({ bank: data.bank })
        if (data.resources) applyPatch({ resources: data.resources })
        refresh()
      }
    } catch {
      setMessage({ text: 'שגיאת רשת', type: 'error' })
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
        if (data.bank)      applyPatch({ bank: data.bank })
        if (data.resources) applyPatch({ resources: data.resources })
        refresh()
      }
    } catch {
      setMessage({ text: 'שגיאת רשת', type: 'error' })
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
        setMessage({ text: data.error ?? 'שדרוג נכשל', type: 'error' })
      } else {
        setMessage({ text: 'ריבית שודרגה!', type: 'success' })
        if (data.bank)      applyPatch({ bank: data.bank })
        if (data.resources) applyPatch({ resources: data.resources })
        refresh()
      }
    } catch {
      setMessage({ text: 'שגיאת רשת', type: 'error' })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static uppercase tracking-wide text-title-glow">
          האוצר
        </h1>
        <p className="text-game-text-secondary font-body mt-1">
          הגן על הזהב שלך מגנבים והרוויח ריבית
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
            <p className="font-heading text-game-sm uppercase tracking-wider text-game-text-secondary">יתרת בנק</p>
            <p className="font-display text-game-3xl text-game-gold mt-1">{formatNumber(currentBank.balance)}</p>
            <ResourceBadge type="gold" amount={currentBank.balance} />
          </div>
          <Badge variant="green">
            {(BALANCE.bank.theftProtection * 100).toFixed(0)}% מוגן מגניבה
          </Badge>
        </div>

        <div className="divider-gold" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">ריבית</p>
            <p className="text-game-base text-game-gold font-body font-semibold">
              {interestRate.toFixed(2)}%/טיק
            </p>
            <p className="text-game-xs text-game-text-muted font-body">רמה {currentBank.interest_level}</p>
          </div>
          <div>
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">הפקדות היום</p>
            <p className="text-game-base text-game-text-white font-body font-semibold">
              {currentBank.deposits_today} / {BALANCE.bank.depositsPerDay}
            </p>
            <p className="text-game-xs text-game-text-muted font-body">{depositsRemaining} נותרו</p>
          </div>
          <div>
            <p className="text-game-xs text-game-text-muted font-heading uppercase tracking-wide">זהב ביד</p>
            <p className="text-game-base text-game-gold font-body font-semibold">
              {formatNumber(currentResources.gold)}
            </p>
          </div>
        </div>
      </div>

      {/* Deposit & Withdraw */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Deposit */}
        <div className="card-game rounded-game-lg p-4 space-y-3">
          <div className="panel-header">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">הפקד זהב</h2>
          </div>
          <p className="text-game-xs text-game-text-muted font-body">
            מקסימום הפקדה: {formatNumber(maxDeposit)} ({(BALANCE.bank.maxDepositPercent * 100).toFixed(0)}% מהזהב ביד).
            {depositsRemaining <= 0 && (
              <span className="text-game-red-bright"> לא נותרו הפקדות להיום.</span>
            )}
          </p>
          <Input
            type="number"
            label="כמות"
            placeholder="הכנס כמות"
            value={depositAmt}
            min={1}
            max={maxDeposit}
            onChange={(e) => setDepositAmt(e.target.value)}
            suffix="זהב"
          />
          <div className="flex gap-2">
            <Button variant="success" size="sm" onClick={() => setDepositAmt(String(maxDeposit))}>מקס</Button>
            <Button
              variant="primary"
              disabled={
                isFrozen || !depositAmt || parseInt(depositAmt) <= 0 ||
                parseInt(depositAmt) > maxDeposit || depositsRemaining <= 0 || !!loading
              }
              loading={loading === 'deposit'}
              onClick={handleDeposit}
            >
              הפקד
            </Button>
          </div>
        </div>

        {/* Withdraw */}
        <div className="card-game rounded-game-lg p-4 space-y-3">
          <div className="panel-header">
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-text-white">משוך זהב</h2>
          </div>
          <p className="text-game-xs text-game-text-muted font-body">
            זמין למשיכה: {formatNumber(currentBank.balance)} זהב
          </p>
          <Input
            type="number"
            label="כמות"
            placeholder="הכנס כמות"
            value={withdrawAmt}
            min={1}
            max={currentBank.balance}
            onChange={(e) => setWithdrawAmt(e.target.value)}
            suffix="זהב"
          />
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setWithdrawAmt(String(currentBank.balance))}>הכל</Button>
            <Button
              variant="ghost"
              disabled={
                isFrozen || !withdrawAmt || parseInt(withdrawAmt) <= 0 ||
                parseInt(withdrawAmt) > currentBank.balance || !!loading
              }
              loading={loading === 'withdraw'}
              onClick={handleWithdraw}
            >
              משוך
            </Button>
          </div>
        </div>
      </div>

      {/* Upgrade Interest */}
      <div className="card-game rounded-game-lg p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold">שדרג ריבית</h2>
            <p className="text-game-sm text-game-text-secondary font-body mt-1">
              ריבית הרמה הבאה: {((BALANCE.bank.INTEREST_RATE_BY_LEVEL[currentBank.interest_level + 1] ?? 0) * 100).toFixed(2)}%.
              כעת: רמה {currentBank.interest_level} ({interestRate.toFixed(2)}%/טיק)
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-game-xs text-game-text-muted font-body">עלות:</span>
              <ResourceBadge type="gold" amount={upgradeCost} />
            </div>
            <p className="text-game-xs text-game-text-muted font-body mt-1">
              ברשותך: {formatNumber(currentResources.gold)} זהב
            </p>
          </div>
          <Button
            variant="success"
            disabled={isFrozen || !canUpgrade || !!loading}
            loading={loading === 'upgrade'}
            onClick={handleUpgrade}
          >
            שדרג
          </Button>
        </div>
      </div>
    </div>
  )
}
