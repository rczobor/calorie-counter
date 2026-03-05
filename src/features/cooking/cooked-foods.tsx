import * as React from "react"
import { ChefHat } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type CookedFoodsSectionProps = {
  children: React.ReactNode
}

export function CookedFoodsSection({ children }: CookedFoodsSectionProps) {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-rose-700" />
          Cooked Foods
        </CardTitle>
        <CardDescription>
          Lines can be reference-only (ignored calories) or counted by measured amount.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}
