import * as React from 'react'
import { cn } from '@/lib/utils'

interface GameTableProps {
  headers: string[]
  rows: React.ReactNode[][]
  striped?: boolean
  hoverable?: boolean
  loading?: boolean
  className?: string
}

export function GameTable({ headers, rows, striped, hoverable, loading, className }: GameTableProps) {
  if (loading) {
    return <TableSkeleton rows={5} cols={headers.length} />
  }

  return (
    <div className={cn(
      'w-full overflow-x-auto rounded-game-lg border border-game-border',
      'shadow-[0_2px_12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(240,192,48,0.04)]',
      className
    )}>
      <table className="w-full text-game-sm font-body">
        <thead>
          <tr className="border-b border-game-border-gold/50 bg-gradient-to-b from-game-elevated to-game-surface">
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 text-start font-heading text-game-xs uppercase tracking-widest text-game-gold"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={headers.length}
                className="px-4 py-10 text-center text-game-text-muted font-heading uppercase tracking-wide"
              >
                No data available
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={cn(
                  'border-b border-game-border/60 last:border-0 transition-all duration-150',
                  striped && rowIdx % 2 === 1 && 'bg-game-elevated/30',
                  hoverable && 'hover:bg-game-gold/5 hover:shadow-[inset_2px_0_0_rgba(201,144,26,0.4)]'
                )}
              >
                {row.map((cell, colIdx) => (
                  <td key={colIdx} className="px-4 py-3 text-game-text">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full rounded-game-lg border border-game-border overflow-hidden">
      <div className="bg-gradient-to-b from-game-elevated to-game-surface px-4 py-3 border-b border-game-border-gold/50">
        <div className="flex gap-8">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-3 w-16 rounded shimmer" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'flex gap-8 px-4 py-3 border-b border-game-border/60 last:border-0',
            i % 2 === 1 && 'bg-game-elevated/30'
          )}
        >
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-3 rounded shimmer" style={{ width: `${60 + j * 10}px` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      {icon && (
        <div className="text-game-text-muted size-14 flex items-center justify-center opacity-60">
          {icon}
        </div>
      )}
      <h3 className="font-heading text-game-lg text-game-text uppercase tracking-wide text-title-glow">
        {title}
      </h3>
      {description && (
        <p className="text-game-sm text-game-text-secondary font-body max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
