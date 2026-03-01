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
      'fixed inset-0 z-50',
      'bg-black/75 backdrop-blur-sm',
      'bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.8)_100%)]',
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
            'w-full p-6',
            'panel-ornate',
            'animate-fade-in',
            'sm:rounded-game-lg',
            sizeClasses[size],
            className
          )}
        >
          {title && (
            <div className="flex items-center justify-between mb-4 pb-3">
              <h2 className="font-heading text-game-xl text-game-gold-bright uppercase tracking-wide text-title-glow">
                {title}
              </h2>
              <DialogClose
                onClick={onClose}
                className="text-game-text-muted hover:text-game-gold transition-colors cursor-pointer p-1 rounded-game hover:bg-game-elevated"
              >
                <X className="size-5" />
              </DialogClose>
            </div>
          )}
          {title && <div className="divider-gold -mx-6 mb-4" />}
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

export { Dialog, DialogTrigger, DialogClose }
