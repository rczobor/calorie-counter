import type { ReactNode } from 'react'

type GoalHistorySectionProps = {
  children: ReactNode
}

export function GoalHistorySection({ children }: GoalHistorySectionProps) {
  return (
    <section className="mt-6 border-t border-border/40 pt-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          Goal Change History
        </h2>
        <p className="text-xs text-muted-foreground">
          Effective-dated records per person.
        </p>
      </div>
      {children}
    </section>
  )
}
