'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const TooltipRoot = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 max-w-xs rounded border border-game-border',
      'bg-game-overlay px-3 py-2',
      'text-game-xs text-game-text font-body',
      'shadow-lg animate-fade-in',
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}

function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}

export { Tooltip, TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent }
