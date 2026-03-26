import { Flame, Target, TrendingDown } from 'lucide-react'

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
    <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/40 pb-4">
      <div className="flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Target</span>
        <span className="text-sm font-semibold">{targetKcal}</span>
      </div>
      <div className="flex items-center gap-2">
        <Flame className="h-3.5 w-3.5 text-primary" />
        <span className="text-sm text-muted-foreground">Consumed</span>
        <span className="text-sm font-semibold">{consumedTodayKcal}</span>
      </div>
      <div className="flex items-center gap-2">
        <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Remaining</span>
        <span className="text-sm font-semibold">{remainingAfterDraftKcal}</span>
      </div>
    </div>
  )
}
