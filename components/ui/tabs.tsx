'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabItem {
  key: string
  label: string
  icon?: React.ReactNode
}

interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (key: string) => void
  className?: string
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        'flex gap-1.5 p-1 rounded-game-lg bg-game-bg/60 border border-game-border overflow-x-auto',
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-game-sm font-heading uppercase tracking-wide',
              'rounded-game whitespace-nowrap transition-all duration-200 cursor-pointer',
              'border',
              isActive
                ? [
                    'bg-gradient-to-b from-game-gold/20 to-game-gold/5',
                    'text-game-gold-bright border-game-border-gold',
                    'shadow-[inset_0_1px_0_rgba(240,192,48,0.1),0_0_8px_rgba(201,144,26,0.1)]',
                  ]
                : [
                    'bg-transparent border-transparent',
                    'text-game-text-secondary',
                    'hover:text-game-text hover:bg-game-elevated/50',
                  ]
            )}
          >
            {tab.icon && <span className="size-4">{tab.icon}</span>}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
