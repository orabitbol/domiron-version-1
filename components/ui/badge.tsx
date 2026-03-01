import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5',
    'text-[0.65rem] font-heading font-bold uppercase tracking-wide',
    'border',
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  ],
  {
    variants: {
      variant: {
        gold: [
          'bg-gradient-to-b from-game-gold/25 to-game-gold/10',
          'text-game-gold-bright border-game-border-gold',
          'shadow-[inset_0_1px_0_rgba(240,192,48,0.1),0_0_6px_rgba(201,144,26,0.1)]',
        ],
        red: [
          'bg-gradient-to-b from-game-red/30 to-game-red/10',
          'text-game-red-bright border-red-900',
          'shadow-[inset_0_1px_0_rgba(212,43,43,0.08)]',
        ],
        green: [
          'bg-gradient-to-b from-game-green/30 to-game-green/10',
          'text-game-green-bright border-green-900',
          'shadow-[inset_0_1px_0_rgba(68,160,40,0.08)]',
        ],
        purple: [
          'bg-gradient-to-b from-game-purple/30 to-game-purple/10',
          'text-game-purple-bright border-purple-900',
          'shadow-[inset_0_1px_0_rgba(138,68,204,0.08)]',
        ],
        blue: [
          'bg-gradient-to-b from-game-blue/30 to-game-blue/10',
          'text-game-blue-bright border-blue-900',
          'shadow-[inset_0_1px_0_rgba(42,94,170,0.08)]',
        ],
        default: [
          'bg-game-elevated text-game-text border-game-border',
          'shadow-[inset_0_1px_0_rgba(240,192,48,0.03)]',
        ],
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
