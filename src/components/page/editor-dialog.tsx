import { Dialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'

/**
 * A bottom sheet on phones and a centred dialog from `md` up. On phones the
 * sheet has a fixed height, so its header stays put while the content changes.
 * The body scrolls on its own, so content can keep a `sticky bottom-0` footer
 * in reach. The body has no bottom padding: a sticky element stops at the
 * padding edge, which would let content show through below the footer.
 */
export function EditorDialog({
  title,
  description,
  onClose,
  children,
  pending = false,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  pending?: boolean
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed inset-x-0 bottom-0 z-50 flex h-[88dvh] max-h-[92dvh] flex-col rounded-t-2xl border-t bg-background shadow-xl outline-none md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:h-auto md:max-h-[calc(100dvh-2rem)] md:w-[calc(100%-2rem)] md:max-w-2xl md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:border">
          <div
            aria-hidden="true"
            className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30 md:hidden"
          />
          <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-2 pb-3 md:pt-5">
            <Dialog.Title className="text-lg font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              {description ??
                'Changes are saved only when you choose Save. Closing keeps your meal draft in this tab.'}
            </Dialog.Description>
            <Dialog.Close
              disabled={pending}
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label="Close editor"
                />
              }
            >
              <X />
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
            {children}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
