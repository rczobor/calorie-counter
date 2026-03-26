import type { ReactNode } from 'react'
import { FolderTree } from 'lucide-react'

type FoodGroupsSectionProps = {
  children: ReactNode
}

export function FoodGroupsSection({ children }: FoodGroupsSectionProps) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FolderTree className="h-3.5 w-3.5 text-primary" />
          Food Groups
        </h2>
        <p className="text-xs text-muted-foreground">
          Used to classify ingredients and cooked foods.
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
