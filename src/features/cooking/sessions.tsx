import type { ReactNode } from 'react'

type SessionsSectionProps = {
  children: ReactNode
}

export function SessionsSection({ children }: SessionsSectionProps) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">Sessions</h2>
        <p className="text-xs text-muted-foreground">
          Group cooked foods by cooking date/session.
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
