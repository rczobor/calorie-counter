import * as React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type PeopleTableSectionProps = {
  today: string
  children: React.ReactNode
}

export function PeopleTableSection({ today, children }: PeopleTableSectionProps) {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle>People</CardTitle>
        <CardDescription>Today: {today}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
