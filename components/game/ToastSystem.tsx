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
  attack:  'border-game-red bg-game-surface shadow-red-glow',
  victory: 'border-game-green bg-game-surface',
  defeat:  'border-game-red-bright bg-game-surface',
  tick:    'border-game-border bg-game-surface',
  tribe:   'border-game-purple bg-game-surface',
  info:    'border-game-border-gold bg-game-surface',
  error:   'border-game-red-bright bg-game-surface',
  success: 'border-game-green bg-game-surface',
  magic:   'border-game-purple bg-game-surface shadow-purple-glow',
  warning: 'border-yellow-700 bg-game-surface',
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
      // Keep only the last MAX_TOASTS (dismiss oldest)
      return next.slice(-MAX_TOASTS)
    })
    const timer = setTimeout(() => removeToast(id), toast.duration)
    timers.current.set(id, timer)
  }, [removeToast])

  // Clean up timers on unmount
  useEffect(() => {
    const t = timers.current
    return () => { t.forEach(clearTimeout) }
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      {/* Toast container — top-right (same for both RTL and LTR per design-system.md) */}
      <div
        className="fixed top-4 end-4 z-[9999] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto',
              'flex items-start gap-3',
              'w-80 max-w-full rounded-lg border-2 px-4 py-3',
              'shadow-xl animate-slide-in-right',
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
              className="text-game-text-muted hover:text-game-text transition-colors cursor-pointer shrink-0"
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
