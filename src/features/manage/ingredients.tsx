import type { ReactNode } from "react"
import { Wheat } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type IngredientsSectionProps = {
  children: ReactNode
}

export function IngredientsSection({ children }: IngredientsSectionProps) {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wheat className="h-4 w-4 text-amber-700" />
          Ingredients
        </CardTitle>
        <CardDescription>
          Store kcal/100g and whether calories are ignored for this ingredient.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}
