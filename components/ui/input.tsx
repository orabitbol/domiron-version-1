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
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-game-sm font-heading text-game-text-secondary font-semibold uppercase tracking-wider"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            id={inputId}
            type={type}
            className={cn(
              'w-full rounded-game border px-3 py-2.5',
              'bg-game-bg/80',
              'text-game-text-white placeholder:text-game-text-muted',
              'font-body text-game-base',
              'border-game-border',
              'shadow-engrave',
              'focus:outline-none focus:border-game-gold focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6),0_0_8px_rgba(201,144,26,0.2)]',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-game-red-bright focus:border-game-red-bright focus:shadow-[inset_0_2px_4px_rgba(0,0,0,0.6),0_0_8px_rgba(212,43,43,0.2)]',
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
