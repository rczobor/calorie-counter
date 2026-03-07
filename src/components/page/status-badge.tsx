import { cn } from '@/lib/utils'

type StatusBadgeProps = {
  status: 'Active' | 'Archived'
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        status === 'Active'
          ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
          : 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
        className,
      )}
    >
      {status}
    </span>
  )
}
