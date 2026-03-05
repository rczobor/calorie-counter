import * as React from "react"
import { FolderTree } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type FoodGroupsSectionProps = {
  children: React.ReactNode
}

export function FoodGroupsSection({ children }: FoodGroupsSectionProps) {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-amber-700" />
          Food Groups
        </CardTitle>
        <CardDescription>Used to classify ingredients and cooked foods.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}
