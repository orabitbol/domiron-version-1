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
        'flex gap-1 border-b border-game-border overflow-x-auto',
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
              'flex items-center gap-2 px-4 py-2.5 text-game-sm font-heading uppercase tracking-wide',
              'border-b-2 -mb-px whitespace-nowrap transition-colors duration-150 cursor-pointer',
              isActive
                ? 'border-game-gold text-game-gold-bright'
                : 'border-transparent text-game-text-secondary hover:text-game-text hover:border-game-border-gold'
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
