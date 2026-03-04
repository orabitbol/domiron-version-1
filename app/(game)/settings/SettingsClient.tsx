'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { Settings, User, Gamepad2, AlertTriangle, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BALANCE } from '@/lib/game/balance'

interface Props {
  player: {
    id: string
    username: string
    email: string
    role: string
    race: string
    city: number
    turns: number
    max_turns: number
    power_total: number
    vip_until: string | null
  }
}

type Tab = 'profile' | 'game' | 'account'

const RACE_HE: Record<string, string> = { orc: 'אורק', human: 'אנושי', elf: 'אלף', dwarf: 'גמד' }
const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'profile', label: 'פרופיל', icon: User },
  { key: 'game',    label: 'משחק',   icon: Gamepad2 },
  { key: 'account', label: 'חשבון',  icon: AlertTriangle },
]

export function SettingsClient({ player }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [sounds, setSounds] = useState(true)
  const [notifications, setNotifications] = useState(true)
  const [animations, setAnimations] = useState(true)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-game-lg bg-game-gold/10 border border-game-gold/30 animate-[spin_12s_linear_infinite]">
          <Settings className="size-5 text-game-gold-bright" />
        </div>
        <div>
          <h1 className="font-display text-game-2xl gold-gradient-text-static text-title-glow uppercase tracking-wide">⚙️ הגדרות</h1>
          <p className="text-game-sm text-game-text-secondary font-body">ניהול פרופיל, הגדרות משחק וחשבון</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              'flex items-center justify-center gap-2 py-2.5 px-3 rounded-game-lg',
              'font-heading text-game-xs uppercase tracking-wider transition-all duration-150',
              activeTab === key
                ? 'bg-game-gold/15 border border-game-gold/40 text-game-gold-bright shadow-gold-glow-sm'
                : 'card-game text-game-text-secondary hover:text-game-text'
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div className={cn(
          'rounded-game-lg px-4 py-3 text-game-sm font-body border',
          message.type === 'success'
            ? 'bg-game-green/10 border-game-green-bright/30 text-game-green-bright'
            : 'bg-game-red/10 border-game-red-bright/30 text-game-red-bright'
        )}>
          {message.text}
        </div>
      )}

      {/* Profile tab */}
      {activeTab === 'profile' && (
        <div className="space-y-4">
          <div className="panel-ornate overflow-hidden">
            <div className="px-5 py-3 panel-header">
              <h2 className="font-heading text-game-sm uppercase tracking-wider text-game-gold">פרטי פרופיל</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <Input
                  label="שם תצוגה"
                  defaultValue={player.username}
                  placeholder="השם שלך בעולם"
                  disabled
                />
                <p className="text-game-xs text-game-text-muted font-body mt-1">
                  לשינוי שם פנה לתמיכה (לפחות 3 תווים)
                </p>
              </div>
              <div className="divider-ornate" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'מזהה', value: player.id.slice(0, 8) + '…' },
                  { label: 'כוח',  value: player.power_total },
                  { label: 'גזע',  value: RACE_HE[player.race] ?? player.race },
                  { label: 'עיר',  value: player.city },
                  { label: 'תורות', value: `${player.turns}/${BALANCE.tick.maxTurns}` },
                  { label: 'VIP', value: player.vip_until && new Date(player.vip_until) > new Date() ? '✅' : '❌' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-game-xs text-game-text-muted font-body">{label}</p>
                    <p className="text-game-sm text-game-text-white font-semibold font-heading">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Game settings tab */}
      {activeTab === 'game' && (
        <div className="panel-ornate overflow-hidden">
          <div className="px-5 py-3 panel-header">
            <h2 className="font-heading text-game-sm uppercase tracking-wider text-game-gold">הגדרות משחק</h2>
          </div>
          <div className="p-5 space-y-4">
            {[
              { label: 'אפקטי קול', desc: 'הפעל/כבה צלילים במשחק', value: sounds, setter: setSounds, color: 'bg-game-purple-bright' },
              { label: 'התראות', desc: 'קבל התראות על תקיפות וטיקים', value: notifications, setter: setNotifications, color: 'bg-game-blue-bright' },
              { label: 'אנימציות', desc: 'הפעל/כבה אנימציות (שיפור ביצועים)', value: animations, setter: setAnimations, color: 'bg-game-orange-bright' },
            ].map(({ label, desc, value, setter, color }) => (
              <div key={label} className="flex items-center justify-between py-3 divider-gold last:border-0">
                <div>
                  <p className="font-heading text-game-sm text-game-text-white">{label}</p>
                  <p className="text-game-xs text-game-text-muted font-body mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => setter(!value)}
                  className={cn(
                    'relative w-12 h-6 rounded-full transition-all duration-200',
                    value ? color : 'bg-game-elevated border border-game-border'
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200',
                      value ? 'end-0.5' : 'start-0.5'
                    )}
                  />
                </button>
              </div>
            ))}
            <p className="text-game-xs text-game-text-muted font-body">
              💡 כיבוי אנימציות עשוי לשפר את הביצועים במכשירים ישנים
            </p>
          </div>
        </div>
      )}

      {/* Account tab */}
      {activeTab === 'account' && (
        <div className="space-y-4">
          <div className="panel-ornate overflow-hidden">
            <div className="px-5 py-3 panel-header">
              <h2 className="font-heading text-game-sm uppercase tracking-wider text-game-gold">פרטי חשבון</h2>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'מזהה משתמש', value: player.id.slice(0, 12) + '…' },
                  { label: 'שם משתמש',   value: player.username },
                  { label: 'אימייל',      value: player.email },
                  { label: 'כוח כולל',   value: player.power_total },
                  { label: 'תורות',      value: `${player.turns}/${BALANCE.tick.maxTurns}` },
                  { label: 'תפקיד',      value: player.role },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-game-xs text-game-text-muted font-body">{label}</p>
                    <p className="text-game-sm text-game-text-white font-semibold break-all">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-game-xl bg-gradient-to-b from-game-red/15 to-game-red/5 border border-game-red/30 space-y-3">
            <p className="font-heading text-game-sm text-game-red-bright uppercase tracking-wider">⚠️ אזור מסוכן</p>
            <Button
              variant="primary"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="bg-game-red hover:bg-game-red-bright border-game-red-bright/30 w-full justify-center"
            >
              <LogOut className="size-4" />
              יציאה מהמשחק
            </Button>
            <p className="text-game-xs text-game-text-muted font-body">
              ⚠️ יציאה לא תמחק את ההתקדמות שלך. תוכל לחזור בכל עת.
            </p>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="card-gold p-4">
        <p className="font-heading text-game-xs uppercase tracking-wider text-game-gold mb-2">💡 טיפים</p>
        <ul className="space-y-1 text-game-xs text-game-text-secondary font-body list-inside list-disc">
          <li>שמור את פרטי הכניסה שלך במקום בטוח</li>
          <li>אפשר התראות לקבלת עדכונים על תקיפות</li>
          <li>כיבוי אנימציות משפר ביצועים בנייד</li>
          <li>לבעיות בחשבון פנה לתמיכה בדיסקורד</li>
        </ul>
      </div>

    </div>
  )
}
