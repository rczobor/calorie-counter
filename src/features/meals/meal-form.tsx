import type { ReactNode } from 'react'

type MealFormSectionProps = {
  title: string
  description: string
  children: ReactNode
}

export function MealFormSection({
  title,
  description,
  children,
}: MealFormSectionProps) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
