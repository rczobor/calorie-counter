import type { ReactNode } from 'react'

/**
 * What an empty list or range holds and how it fills: a foreground title,
 * one muted sentence and an optional outlined action. Place it inside the
 * cell it explains (RecordList's empty slot or an inset group).
 */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div>
      <p className="type-headline text-foreground">{title}</p>
      <p className="mt-1 type-subhead text-muted-foreground">{children}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
