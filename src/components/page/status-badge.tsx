import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './status-badge.messages'

type StatusBadgeProps = {
  status: 'Active' | 'Archived'
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const t = useMessages(messages)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 type-caption font-medium',
        status === 'Active'
          ? 'border-transparent bg-muted text-foreground'
          : 'border-dashed border-input text-muted-foreground',
        className,
      )}
    >
      {t[status]}
    </span>
  )
}
