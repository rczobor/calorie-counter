import { Target } from 'lucide-react'

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type MealsMetricsProps = {
  targetKcal: string
  consumedTodayKcal: string
  remainingAfterDraftKcal: string
}

export function MealsMetrics({
  targetKcal,
  consumedTodayKcal,
  remainingAfterDraftKcal,
}: MealsMetricsProps) {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-3">
      <Card className="border-emerald-200/80 bg-card/90 dark:border-emerald-500/30">
        <CardHeader>
          <CardDescription>Target</CardDescription>
          <CardTitle>{targetKcal}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="border-border/70 bg-card/90">
        <CardHeader>
          <CardDescription>Consumed Today</CardDescription>
          <CardTitle>{consumedTodayKcal}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="border-amber-200/80 bg-card/90 dark:border-amber-500/30">
        <CardHeader>
          <CardDescription>Remaining After Draft</CardDescription>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-700" />
            {remainingAfterDraftKcal}
          </CardTitle>
        </CardHeader>
      </Card>
    </div>
  )
}
