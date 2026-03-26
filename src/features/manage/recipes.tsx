import type { ReactNode } from 'react'
import { BookOpenText } from 'lucide-react'

type RecipesSectionProps = {
  children: ReactNode
}

export function RecipesSection({ children }: RecipesSectionProps) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <BookOpenText className="h-3.5 w-3.5 text-primary" />
          Recipes
        </h2>
        <p className="text-xs text-muted-foreground">
          Build recipe lines with existing or inline ingredients. Inline lines
          can be optionally saved to catalog.
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
