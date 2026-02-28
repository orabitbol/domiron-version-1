'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function ConnectionStatus() {
  const [online, setOnline] = useState(true)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleOnline  = () => { setOnline(true);  setTimeout(() => setVisible(false), 2000) }
    const handleOffline = () => { setOnline(false); setVisible(true) }

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    // Show briefly if already offline on mount
    if (!navigator.onLine) handleOffline()

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={cn(
        'fixed top-[68px] inset-x-0 z-50 flex justify-center pointer-events-none',
        'animate-fade-in'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-body font-semibold shadow-lg',
          online
            ? 'bg-game-green/20 border border-game-green-bright/40 text-game-green-bright'
            : 'bg-game-red/20 border border-game-red-bright/40 text-game-red-bright'
        )}
      >
        <span
          className={cn(
            'size-2 rounded-full',
            online ? 'bg-game-green-bright animate-pulse' : 'bg-game-red-bright'
          )}
        />
        {online ? 'חיבור חזר' : 'אין חיבור לרשת'}
      </div>
    </div>
  )
}
