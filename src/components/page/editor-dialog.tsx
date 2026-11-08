import { Drawer } from '@base-ui/react/drawer'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Sheet } from '@/components/page/sheet'
import { Button } from '@/components/ui/button'
import { useMessages } from '@/i18n/messages'
import { messages } from './editor-dialog.messages'

/**
 * The editors' sheet (see `Sheet`). On phones it has a fixed height, so its
 * header stays put while the content changes. The body scrolls on its own, so
 * content can keep a `sticky bottom-0` footer in reach. The body has no bottom
 * padding: a sticky element stops at the padding edge, which would let content
 * show through below the footer. The title is left-aligned in the page title
 * family, so a sheet reads as a page of the same app, with a quiet ghost close
 * beside it.
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
  const t = useMessages(messages)
  return (
    <Sheet
      onClose={onClose}
      pending={pending}
      className="h-[88dvh] max-h-[92dvh] md:h-auto md:max-h-[calc(100dvh-2rem)] md:max-w-2xl"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 pt-1 pr-2 pb-2 pl-4 md:pt-3">
        <Drawer.Title className="min-w-0 truncate type-title">
          {title}
        </Drawer.Title>
        <Drawer.Description className="sr-only">
          {description ?? t.description}
        </Drawer.Description>
        <Drawer.Close
          disabled={pending}
          render={
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              aria-label={t.close}
            />
          }
        >
          <X />
        </Drawer.Close>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
        {children}
      </div>
    </Sheet>
  )
}
