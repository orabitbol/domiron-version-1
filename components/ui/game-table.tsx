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
    <div className={cn('w-full overflow-x-auto rounded-lg border border-game-border', className)}>
      <table className="w-full text-game-sm font-body">
        <thead>
          <tr className="border-b border-game-border bg-game-elevated">
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-3 text-start font-heading text-game-xs uppercase tracking-wider text-game-text-secondary"
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
                className="px-4 py-8 text-center text-game-text-muted"
              >
                No data available
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={cn(
                  'border-b border-game-border last:border-0',
                  striped && rowIdx % 2 === 1 && 'bg-game-elevated/40',
                  hoverable && 'hover:bg-game-elevated transition-colors duration-100'
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

// Skeleton loading state for tables
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full rounded-lg border border-game-border overflow-hidden">
      <div className="bg-game-elevated px-4 py-3 border-b border-game-border">
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
            'flex gap-8 px-4 py-3 border-b border-game-border last:border-0',
            i % 2 === 1 && 'bg-game-elevated/40'
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

// Empty state component (from design-system.md)
interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      {icon && (
        <div className="text-game-text-muted size-12 flex items-center justify-center">
          {icon}
        </div>
      )}
      <h3 className="font-heading text-game-lg text-game-text uppercase tracking-wide">
        {title}
      </h3>
      {description && (
        <p className="text-game-sm text-game-text-secondary font-body max-w-xs">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
