import { Skeleton } from '@/components/ui/skeleton'
import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './loading-content.messages'

export function LoadingRows({
  label,
  rows = 3,
  className,
}: {
  label: string
  rows?: number
  className?: string
}) {
  return (
    <div role="status" aria-label={label} className={cn('divide-y', className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex h-16 items-center justify-between gap-4"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  )
}

export function EditorSkeleton() {
  const t = useMessages(messages)
  return (
    <div
      role="status"
      aria-label={t.loadingEditor}
      className="min-h-96 space-y-6 py-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} aria-hidden="true" className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
      <LoadingRows label={t.loadingFoods} rows={2} />
    </div>
  )
}
