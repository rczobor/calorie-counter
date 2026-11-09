import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './status-badge.messages'

type StatusBadgeProps = {
  status: 'Active' | 'Archived' | 'You' | 'Unsaved'
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const t = useMessages(messages)
  return (
    <span
      className={cn(
        // The footnote tier, one step above captions, so a badge beside a
        // 17px name stays readable; py-px keeps rows at their height.
        'inline-flex items-center rounded-full border px-2.5 py-px type-footnote font-medium',
        status === 'Active'
          ? 'border-transparent bg-muted text-foreground'
          : status === 'Archived'
            ? 'border-dashed border-input text-muted-foreground'
            : // Outlined like the prefilled chips: grey fills read as disabled.
              'border-input text-foreground',
        className,
      )}
    >
      {t[status]}
    </span>
  )
}
