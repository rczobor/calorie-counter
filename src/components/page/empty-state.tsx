import type { ReactNode } from 'react'

/**
 * What an empty list or range holds and how it fills: a foreground title,
 * one muted sentence, an optional example, and optional actions (outlined,
 * then quiet ghost ones). Place it inside the cell it explains (RecordList's
 * empty slot or an inset group).
 */
export function EmptyState({
  title,
  children,
  example,
  action,
}: {
  title: string
  children: ReactNode
  example?: ReactNode
  action?: ReactNode
}) {
  return (
    <div>
      <p className="type-headline text-foreground">{title}</p>
      <p className="mt-1 type-subhead text-muted-foreground">{children}</p>
      {example ? <div className="mt-3">{example}</div> : null}
      {action ? (
        <div className="mt-3 flex flex-wrap gap-2">{action}</div>
      ) : null}
    </div>
  )
}
