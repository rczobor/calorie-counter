import type { ReactNode } from 'react'

type PersonFormSectionProps = {
  isEditing: boolean
  children: ReactNode
}

export function PersonFormSection({
  isEditing,
  children,
}: PersonFormSectionProps) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">
          {isEditing ? 'Edit Person' : 'Create Person'}
        </h2>
        <p className="text-xs text-muted-foreground">
          Goal updates are tracked in history.
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
