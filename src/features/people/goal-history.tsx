import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type GoalHistorySectionProps = {
  children: ReactNode
}

export function GoalHistorySection({ children }: GoalHistorySectionProps) {
  return (
    <Card className="mt-5 border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle>Goal Change History</CardTitle>
        <CardDescription>Effective-dated records per person.</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
