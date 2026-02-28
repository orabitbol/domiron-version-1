'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base: font-heading, uppercase, tracking-wide, min touch target
  [
    'inline-flex items-center justify-center gap-2',
    'font-heading uppercase tracking-wider',
    'rounded border transition-colors duration-150',
    'cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-border-active',
    'min-h-[44px]',  // mobile touch target
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-gradient-to-br from-game-gold to-game-border-gold',
          'text-game-bg border-game-border-gold',
          'hover:from-game-gold-bright hover:to-game-gold hover:shadow-gold-glow',
        ],
        danger: [
          'bg-game-red border-red-900 text-game-text-white',
          'hover:bg-game-red-bright hover:shadow-red-glow',
        ],
        ghost: [
          'bg-transparent border-game-border text-game-text',
          'hover:bg-game-elevated hover:border-game-border-gold hover:text-game-text-white',
        ],
        success: [
          'bg-game-green border-green-900 text-game-text-white',
          'hover:bg-game-green-bright',
        ],
        magic: [
          'bg-game-purple border-purple-900 text-game-text-white',
          'hover:bg-game-purple-bright hover:shadow-purple-glow',
        ],
        link: [
          'bg-transparent border-transparent text-game-gold',
          'hover:text-game-gold-bright underline-offset-4 hover:underline',
          'min-h-0',
        ],
      },
      size: {
        sm:  'px-3 py-1.5 text-xs',
        md:  'px-4 py-2 text-sm',
        lg:  'px-6 py-3 text-base',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="animate-spin size-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
