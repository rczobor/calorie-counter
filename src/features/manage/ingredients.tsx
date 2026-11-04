import type { ReactNode } from 'react'

type IngredientsSectionProps = {
  children: ReactNode
}

export function IngredientsSection({ children }: IngredientsSectionProps) {
  return (
    <section>
      <div className="sr-only">
        <h2>Ingredients</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
