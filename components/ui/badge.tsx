import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-heading font-bold uppercase tracking-wide border',
  {
    variants: {
      variant: {
        gold:   'bg-game-gold/20 text-game-gold-bright border border-game-border-gold',
        red:    'bg-game-red/20 text-game-red-bright border border-red-900',
        green:  'bg-game-green/20 text-game-green-bright border border-green-900',
        purple: 'bg-game-purple/20 text-game-purple-bright border border-purple-900',
        blue:   'bg-game-blue/20 text-blue-400 border border-blue-900',
        default:'bg-game-elevated text-game-text border border-game-border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
