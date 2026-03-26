import type { ReactNode } from 'react'

type MealTableSectionProps = {
  title: string
  description: string
  children: ReactNode
}

export function MealTableSection({
  title,
  description,
  children,
}: MealTableSectionProps) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}
