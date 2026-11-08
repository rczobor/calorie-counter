import { Drawer } from '@base-ui/react/drawer'
import type { ReactNode, RefObject } from 'react'

import { cn } from '@/lib/utils'

/**
 * An always-open bottom sheet on phones that swipes down to close, and a
 * centred dialog from `md` up. Callers render `Drawer.Title`,
 * `Drawer.Description` and `Drawer.Close` inside it, and size the frame with
 * `className`. Like an iOS sheet it has large top corners and a grabber, and
 * in dark mode it sits one level up (`elevated`).
 *
 * Everything below the handle sits in `Drawer.Content`, so mouse drags select
 * text instead of dragging the dialog. Touch can swipe from anywhere, and Base
 * UI only starts a swipe once a scrolled body is back at its top.
 */
export function Sheet({
  onClose,
  pending = false,
  initialFocus,
  className,
  children,
}: {
  onClose: () => void
  /** Blocks every way of closing, so a save in flight is not abandoned. */
  pending?: boolean
  initialFocus?: RefObject<HTMLElement | null>
  className?: string
  children: ReactNode
}) {
  return (
    <Drawer.Root
      open
      onOpenChange={(open, details) => {
        if (open) return
        // Cancelling lets a released swipe settle back into place.
        if (pending) details.cancel()
        else onClose()
      }}
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 bg-black/35 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*400ms)] data-starting-style:opacity-0 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute motion-reduce:transition-none md:transition-none dark:bg-black/75" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
          <Drawer.Popup
            initialFocus={initialFocus}
            className={cn(
              'elevated relative flex w-full flex-col rounded-t-3xl bg-background shadow-[0_-8px_40px_-12px_oklch(0_0_0/0.3)] outline-none',
              // Follow the finger, then slide away on close.
              'translate-y-(--drawer-swipe-movement-y,0px) transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:translate-y-full data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*400ms)] data-starting-style:translate-y-full data-swiping:duration-0 data-swiping:select-none motion-reduce:transition-none',
              // Fill the gap below when a swipe overshoots upwards.
              "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-background after:content-['']",
              'md:overflow-hidden md:rounded-3xl md:transition-none md:after:hidden',
              className,
            )}
          >
            <div
              aria-hidden="true"
              className="flex shrink-0 cursor-grab justify-center pt-1.5 active:cursor-grabbing md:hidden"
            >
              <div className="h-[5px] w-9 rounded-full bg-muted-foreground/40" />
            </div>
            <Drawer.Content className="flex min-h-0 flex-1 flex-col">
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
