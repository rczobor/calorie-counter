import type { ReactNode } from 'react'
import { ChefHat } from 'lucide-react'

type CookedFoodsSectionProps = {
  children: ReactNode
}

export function CookedFoodsSection({ children }: CookedFoodsSectionProps) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ChefHat className="h-3.5 w-3.5 text-primary" />
          Cooked Foods
        </h2>
        <p className="text-xs text-muted-foreground">
          Lines can be reference-only (ignored calories) or counted by measured
          amount.
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
