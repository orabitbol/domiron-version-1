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
      'fixed inset-0 z-50 bg-black/70 backdrop-blur-sm',
      'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-in',
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
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full p-6 shadow-xl',
            'bg-game-surface border border-game-border-gold rounded-lg',
            'animate-fade-in',
            // Mobile: bottom sheet
            'sm:rounded-lg',
            sizeClasses[size],
            className
          )}
        >
          {title && (
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-game-border">
              <h2 className="font-heading text-game-xl text-game-text-white uppercase tracking-wide">
                {title}
              </h2>
              <DialogClose
                onClick={onClose}
                className="text-game-text-muted hover:text-game-text transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </DialogClose>
            </div>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

export { Dialog, DialogTrigger, DialogClose }
