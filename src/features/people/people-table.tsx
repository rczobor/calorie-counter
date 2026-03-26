import type { ReactNode } from 'react'

type PeopleTableSectionProps = {
  today: string
  children: ReactNode
}

export function PeopleTableSection({
  today,
  children,
}: PeopleTableSectionProps) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">People</h2>
        <p className="text-xs text-muted-foreground">Today: {today}</p>
      </div>
      {children}
    </section>
  )
}
