import { MoreHorizontal, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type MenuAction = {
  label: string
  onSelect: () => void
  /** Permanent deletion: destructive colour with a trash icon. */
  destructive?: boolean
  disabled?: boolean
}

/** The conventional "⋯" overflow, named for screen readers, with no visible label. */
export function ActionsMenu({
  label,
  actions,
  disabled,
}: {
  label: string
  actions: MenuAction[]
  disabled?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground md:size-9"
            aria-label={label}
            disabled={disabled}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            className="min-h-10 text-sm"
            variant={action.destructive ? 'destructive' : 'default'}
            disabled={action.disabled}
            onClick={action.onSelect}
          >
            {action.destructive ? <Trash2 aria-hidden="true" /> : null}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
