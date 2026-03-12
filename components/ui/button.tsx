'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'font-heading uppercase tracking-wider',
    'rounded-game border transition-all duration-200',
    'cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-border-active focus-visible:ring-offset-1 focus-visible:ring-offset-game-bg',
    'active:scale-[0.97]',
    'min-h-[44px]',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-gradient-to-b from-game-gold-bright via-game-gold to-game-gold-dim',
          'text-game-bg font-bold border-game-gold-dim',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-2px_0_rgba(0,0,0,0.2),0_2px_8px_rgba(201,144,26,0.3)]',
          'hover:from-game-gold-bright hover:via-game-gold-bright hover:to-game-gold hover:shadow-gold-glow',
        ],
        danger: [
          'bg-gradient-to-b from-game-red-bright via-game-red to-game-red',
          'text-game-text-white font-semibold border-red-950',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-2px_0_rgba(0,0,0,0.25),0_2px_8px_rgba(180,30,30,0.3)]',
          'hover:from-red-500 hover:via-game-red-bright hover:to-game-red hover:shadow-red-glow',
        ],
        ghost: [
          'bg-game-elevated/60 border-game-border text-game-text',
          'shadow-[inset_0_1px_0_rgba(240,192,48,0.04),inset_0_-1px_0_rgba(0,0,0,0.2)]',
          'hover:bg-game-elevated hover:border-game-border-gold hover:text-game-text-white',
        ],
        success: [
          'bg-gradient-to-b from-game-green-bright via-game-green to-game-green',
          'text-game-text-white font-semibold border-green-950',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-2px_0_rgba(0,0,0,0.25),0_2px_8px_rgba(50,140,30,0.25)]',
          'hover:from-emerald-500 hover:via-game-green-bright hover:to-game-green hover:shadow-green-glow',
        ],
        magic: [
          'bg-gradient-to-b from-game-purple-bright via-game-purple to-game-purple',
          'text-game-text-white font-semibold border-purple-950',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-2px_0_rgba(0,0,0,0.25),0_2px_8px_rgba(120,50,180,0.3)]',
          'hover:from-violet-500 hover:via-game-purple-bright hover:to-game-purple hover:shadow-purple-glow',
        ],
        link: [
          'bg-transparent border-transparent text-game-gold',
          'hover:text-game-gold-bright underline-offset-4 hover:underline',
          'min-h-0 shadow-none',
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
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
