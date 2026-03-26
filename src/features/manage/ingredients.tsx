import type { ReactNode } from 'react'
import { Wheat } from 'lucide-react'

type IngredientsSectionProps = {
  children: ReactNode
}

export function IngredientsSection({ children }: IngredientsSectionProps) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wheat className="h-3.5 w-3.5 text-primary" />
          Ingredients
        </h2>
        <p className="text-xs text-muted-foreground">
          Store kcal/100g and whether calories are ignored for this ingredient.
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
