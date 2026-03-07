/**
 * ResourceQuad — compact display of a 4-resource cost (gold + iron + wood + food).
 *
 * When all 4 values are equal (the standard Domiron shop model), renders a
 * compact "🪙⚙️🪵🌾 N ea." pill to avoid repeating the same number four times.
 * When values differ, renders four separate colored badges.
 *
 * Config: all costs live in BALANCE.weapons[category][weapon].cost — this
 * component is purely a display primitive and carries no game logic.
 */
import * as React from 'react'
import { formatNumber } from '@/lib/utils'

export interface ResourceCost {
  gold: number
  iron: number
  wood: number
  food: number
}

interface ResourceQuadProps {
  /** The cost object: { gold, iron, wood, food } */
  cost: ResourceCost
  /** Multiply every value by amount (default 1) */
  amount?: number
  /** Extra class names for the wrapper span */
  className?: string
}

const RES = [
  { key: 'gold', icon: '🪙', color: 'rgba(240,200,52,0.92)'  },
  { key: 'iron', icon: '⚙️', color: 'rgba(140,190,255,0.92)' },
  { key: 'wood', icon: '🪵', color: 'rgba(155,210,110,0.92)' },
  { key: 'food', icon: '🌾', color: 'rgba(240,185,80,0.88)'  },
] as const

export function ResourceQuad({ cost, amount = 1, className }: ResourceQuadProps) {
  const allEqual =
    cost.gold === cost.iron &&
    cost.iron === cost.wood &&
    cost.wood === cost.food

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '2px 8px',
    borderRadius: '999px',
    background: 'rgba(20,14,6,0.72)',
    border: '1px solid rgba(120,90,40,0.38)',
    fontSize: '0.67rem',
    fontFamily: 'Source Sans 3, sans-serif',
    fontWeight: 700,
    letterSpacing: '0.01em',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.2)',
  }

  if (allEqual) {
    return (
      <span style={baseStyle} className={className}>
        {/* All 4 icons grouped, then value × "ea." */}
        <span style={{ lineHeight: 1, letterSpacing: '-0.04em', fontSize: '0.62rem' }}>
          🪙⚙️🪵🌾
        </span>
        <span className="tabular-nums" style={{ color: 'rgba(220,188,112,0.95)' }}>
          {formatNumber(cost.gold * amount)}
        </span>
        <span style={{ color: 'rgba(120,88,42,0.78)', fontSize: '0.58rem', letterSpacing: '0.06em' }}>
          ea.
        </span>
      </span>
    )
  }

  // Heterogeneous: show 4 separate colored values
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
      }}
      className={className}
    >
      {RES.map(({ key, icon, color }) => {
        const value = cost[key as keyof ResourceCost] * amount
        return (
          <span
            key={key}
            style={{
              ...baseStyle,
              gap: '3px',
              padding: '2px 6px',
              color,
            }}
          >
            <span style={{ fontSize: '0.58rem', lineHeight: 1 }}>{icon}</span>
            <span className="tabular-nums">{formatNumber(value)}</span>
          </span>
        )
      })}
    </span>
  )
}
