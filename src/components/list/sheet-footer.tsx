import type { ReactNode } from 'react'

import { ActionsMenu } from '@/components/list/actions-menu'
import { Button } from '@/components/ui/button'
import { useMessages } from '@/i18n/messages'
import { messages } from './sheet-footer.messages'

/**
 * The sticky footer of an EditorDialog sheet: secondary actions (⋯, Archive)
 * and the primary save form one right-aligned group, as meal actions do.
 * Like the logging sheet's footer it is a translucent toolbar the content
 * scrolls under, and it adds the safe-area inset itself, since the sheet body
 * has no padding.
 */
export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex items-center justify-end gap-2 border-t border-border bg-background/85 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl [@media(prefers-reduced-transparency:reduce)]:bg-background">
      {children}
    </div>
  )
}

/**
 * Archive is a quiet, reversible action; permanent deletion sits behind "⋯"
 * and the caller's confirmation.
 */
export function ArchiveActions({
  name,
  archived,
  disabled,
  onArchive,
  onDelete,
}: {
  name: string
  archived: boolean
  disabled?: boolean
  onArchive: () => void
  onDelete?: () => void
}) {
  const t = useMessages(messages)
  return (
    <>
      {onDelete ? (
        <ActionsMenu
          label={t.moreActions(name)}
          disabled={disabled}
          actions={[
            {
              label: t.deletePermanently,
              destructive: true,
              onSelect: onDelete,
            },
          ]}
        />
      ) : null}
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={onArchive}
      >
        {archived ? t.restore : t.archive}
      </Button>
    </>
  )
}
