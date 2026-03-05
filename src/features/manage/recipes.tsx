import * as React from "react"
import { BookOpenText } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type RecipesSectionProps = {
  children: React.ReactNode
}

export function RecipesSection({ children }: RecipesSectionProps) {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpenText className="h-4 w-4 text-sky-700" />
          Recipes
        </CardTitle>
        <CardDescription>
          Build recipe lines with existing or inline ingredients. Inline lines can be optionally saved to catalog.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}
