'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ToastType } from '@/types/game'

interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration: number
  navigateTo?: string
  onClick?: () => void
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, 'id'>) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

const MAX_TOASTS = 3

const TOAST_STYLES: Record<ToastType, string> = {
  attack:  'border-l-game-red-bright bg-gradient-to-r from-game-red/15 to-game-surface shadow-red-glow',
  victory: 'border-l-game-green-bright bg-gradient-to-r from-game-green/15 to-game-surface shadow-green-glow',
  defeat:  'border-l-game-red-bright bg-gradient-to-r from-game-red/10 to-game-surface',
  tick:    'border-l-game-gold bg-gradient-to-r from-game-gold/8 to-game-surface',
  tribe:   'border-l-game-purple-bright bg-gradient-to-r from-game-purple/15 to-game-surface shadow-purple-glow',
  info:    'border-l-game-gold bg-gradient-to-r from-game-gold/8 to-game-surface',
  error:   'border-l-game-red-bright bg-gradient-to-r from-game-red/15 to-game-surface',
  success: 'border-l-game-green-bright bg-gradient-to-r from-game-green/10 to-game-surface',
  magic:   'border-l-game-purple-bright bg-gradient-to-r from-game-purple/15 to-game-surface shadow-purple-glow',
  warning: 'border-l-yellow-500 bg-gradient-to-r from-yellow-900/15 to-game-surface',
}

const TOAST_ICONS: Record<ToastType, string> = {
  attack:  '⚔️',
  victory: '🏆',
  defeat:  '💀',
  tick:    '⏱',
  tribe:   '🛡️',
  info:    'ℹ️',
  error:   '❌',
  success: '✅',
  magic:   '✨',
  warning: '⚠️',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts(prev => {
      const next = [...prev, { ...toast, id }]
      return next.slice(-MAX_TOASTS)
    })
    const timer = setTimeout(() => removeToast(id), toast.duration)
    timers.current.set(id, timer)
  }, [removeToast])

  useEffect(() => {
    const t = timers.current
    return () => { t.forEach(clearTimeout) }
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div
        className="fixed top-4 end-4 z-[9999] flex flex-col gap-2.5 pointer-events-none"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto',
              'flex items-start gap-3',
              'w-80 max-w-full rounded-game-lg px-4 py-3',
              'border border-game-border/60 border-l-[3px]',
              'shadow-panel-ornate animate-slide-in-right',
              TOAST_STYLES[toast.type]
            )}
            onClick={toast.onClick}
            role="alert"
          >
            <span className="text-xl leading-none shrink-0 mt-0.5">
              {TOAST_ICONS[toast.type]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-heading text-game-sm text-game-text-white uppercase tracking-wide">
                {toast.title}
              </p>
              {toast.message && (
                <p className="text-game-xs text-game-text-secondary font-body mt-0.5">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeToast(toast.id) }}
              className="text-game-text-muted hover:text-game-gold transition-colors cursor-pointer shrink-0 p-0.5 rounded hover:bg-game-elevated/60"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
