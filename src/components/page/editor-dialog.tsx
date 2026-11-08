import { Drawer } from '@base-ui/react/drawer'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Sheet } from '@/components/page/sheet'
import { Button } from '@/components/ui/button'

/**
 * The meal editor's sheet. On phones it has a fixed height, so its header stays
 * put while the content changes. The body scrolls on its own, so content can
 * keep a `sticky bottom-0` footer in reach. The body has no bottom padding: a
 * sticky element stops at the padding edge, which would let content show
 * through below the footer.
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
    <Sheet
      onClose={onClose}
      pending={pending}
      className="h-[88dvh] max-h-[92dvh] md:h-auto md:max-h-[calc(100dvh-2rem)] md:max-w-2xl"
    >
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 pt-2 pb-3 md:pt-5">
        <Drawer.Title className="text-lg font-semibold">{title}</Drawer.Title>
        <Drawer.Description className="sr-only">
          {description ??
            'Changes are saved only when you choose Save. Closing keeps your meal draft in this tab.'}
        </Drawer.Description>
        <Drawer.Close
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
        </Drawer.Close>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
        {children}
      </div>
    </Sheet>
  )
}
