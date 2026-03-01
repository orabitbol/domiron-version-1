'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[100]',
      'bg-black/75 backdrop-blur-sm',
      'bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.8)_100%)]',
      // open → fade-in; closed → fade-out (DIFFERENT animations so animationend fires on close)
      'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  className?: string
}

export function Modal({ isOpen, onClose, title, size = 'md', children, className }: ModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          // Opt out of the description requirement — callers supply context via children
          aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 z-[101] -translate-x-1/2 -translate-y-1/2',
            'w-full p-6',
            // Modal content: solid, visible panel above overlay (lighter than overlay so it pops)
            'bg-[#1A1510] border border-[rgba(201,144,26,0.5)]',
            'shadow-[0_0_0_1px_rgba(201,144,26,0.2),0_25px_50px_-12px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(240,192,48,0.12)]',
            // open → fade-in; closed → fade-out
            'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
            'sm:rounded-game-lg',
            sizeClasses[size],
            className
          )}
        >
          {/* DialogTitle is required by Radix for accessibility; always rendered */}
          {title ? (
            <div className="flex items-center justify-between mb-4 pb-3">
              <DialogPrimitive.Title className="font-heading text-game-xl text-game-gold-bright uppercase tracking-wide text-title-glow">
                {title}
              </DialogPrimitive.Title>
              <DialogClose
                onClick={onClose}
                className="text-game-text-muted hover:text-game-gold transition-colors cursor-pointer p-1 rounded-game hover:bg-game-elevated"
              >
                <X className="size-5" />
              </DialogClose>
            </div>
          ) : (
            // Visually hidden title so Radix/screen readers have a label even when no title prop
            <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>
          )}
          {title && <div className="divider-gold -mx-6 mb-4" />}
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

export { Dialog, DialogTrigger, DialogClose }
