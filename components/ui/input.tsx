'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  suffix?: string
  error?: string
  hint?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, suffix, error, hint, type, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label
            htmlFor={inputId}
            className="text-game-sm font-body text-game-text-secondary font-medium"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            id={inputId}
            type={type}
            className={cn(
              'w-full rounded border bg-game-surface px-3 py-2',
              'text-game-text-white placeholder:text-game-text-muted',
              'font-body text-game-base',
              'border-game-border',
              'focus:outline-none focus:border-game-border-active focus:ring-1 focus:ring-game-border-active',
              'transition-colors duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-game-red-bright focus:border-game-red-bright focus:ring-game-red-bright',
              suffix && 'pe-16',
              className
            )}
            ref={ref}
            {...props}
          />
          {suffix && (
            <span className="absolute end-3 text-game-sm text-game-text-muted font-body pointer-events-none">
              {suffix}
            </span>
          )}
        </div>
        {error && (
          <p className="text-game-xs text-game-red-bright font-body">{error}</p>
        )}
        {hint && !error && (
          <p className="text-game-xs text-game-text-muted font-body">{hint}</p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export { Input }
