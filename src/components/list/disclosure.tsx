import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** A quiet "more about this" note: muted summary with a chevron, closed by default. */
export function Disclosure({
  summary,
  children,
  className,
}: {
  summary: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <details
      className={cn(
        'group px-4 type-footnote text-muted-foreground',
        className,
      )}
    >
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1 hover:text-foreground [&::-webkit-details-marker]:hidden">
        {summary}
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="pb-1">{children}</div>
    </details>
  )
}
