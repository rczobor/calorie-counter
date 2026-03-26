import { Flame, TrendingDown } from 'lucide-react'

type MealsMetricsProps = {
  consumedTodayKcal: string
  targetKcal: string
  remainingAfterDraftKcal: string
}

export function MealsMetrics({
  consumedTodayKcal,
  targetKcal,
  remainingAfterDraftKcal,
}: MealsMetricsProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 pb-3">
      <div className="flex items-center gap-2">
        <Flame className="h-3.5 w-3.5 text-primary" />
        <span className="text-sm text-muted-foreground">Consumed</span>
        <span className="text-sm font-semibold">
          {consumedTodayKcal} / {targetKcal}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Remaining</span>
        <span className="text-sm font-semibold">{remainingAfterDraftKcal}</span>
      </div>
    </div>
  )
}
