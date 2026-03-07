import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type PersonFormSectionProps = {
  isEditing: boolean
  children: ReactNode
}

export function PersonFormSection({ isEditing, children }: PersonFormSectionProps) {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Person" : "Create Person"}</CardTitle>
        <CardDescription>Goal updates are tracked in history.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}
