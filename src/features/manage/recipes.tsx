import type { ReactNode } from 'react'

type RecipesSectionProps = {
  children: ReactNode
}

export function RecipesSection({ children }: RecipesSectionProps) {
  return (
    <section>
      <div className="sr-only">
        <h2>Recipes</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
