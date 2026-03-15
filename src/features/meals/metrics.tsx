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
    <div className="mt-3 flex flex-wrap items-center gap-6">
      <div>
        <span className="text-xs text-muted-foreground">Target</span>
        <p className="text-sm font-medium">{targetKcal}</p>
      </div>
      <div>
        <span className="text-xs text-muted-foreground">Consumed Today</span>
        <p className="text-sm font-medium">{consumedTodayKcal}</p>
      </div>
      <div>
        <span className="text-xs text-muted-foreground">
          Remaining After Draft
        </span>
        <p className="text-sm font-medium">{remainingAfterDraftKcal}</p>
      </div>
    </div>
  )
}
