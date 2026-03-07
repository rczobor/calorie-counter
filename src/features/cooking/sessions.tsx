import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type SessionsSectionProps = {
  children: ReactNode
}

export function SessionsSection({ children }: SessionsSectionProps) {
  return (
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>
          Group cooked foods by cooking date/session.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}
