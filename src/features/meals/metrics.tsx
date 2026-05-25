import { Flame, TrendingDown } from 'lucide-react'

import { cn } from '@/lib/utils'

type MealsMetricsProps = {
  consumedTodayKcal: number
  targetKcal?: number
  remainingAfterDraftKcal: number
  draftKcal?: number
}

export function MealsMetrics({
  consumedTodayKcal,
  targetKcal,
  remainingAfterDraftKcal,
  draftKcal = 0,
}: MealsMetricsProps) {
  const hasGoal = typeof targetKcal === 'number' && targetKcal > 0
  const percent = hasGoal
    ? Math.min(100, Math.max(0, (consumedTodayKcal / targetKcal) * 100))
    : 0
  const afterDraftPercent = hasGoal
    ? Math.min(
        100,
        Math.max(0, ((consumedTodayKcal + draftKcal) / targetKcal) * 100),
      )
    : 0
  const isOverGoal = hasGoal && remainingAfterDraftKcal < 0

  return (
    <div className="mt-5 rounded-lg border border-border/60 bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">
              Today&apos;s budget
            </p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasGoal
              ? `${consumedTodayKcal.toFixed(0)} of ${targetKcal.toFixed(0)} kcal logged`
              : 'Select a person to see the daily budget.'}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p
            className={cn(
              'text-2xl font-semibold tracking-tight',
              isOverGoal ? 'text-destructive' : 'text-foreground',
            )}
          >
            {hasGoal
              ? `${Math.abs(remainingAfterDraftKcal).toFixed(0)} kcal`
              : '--'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isOverGoal ? 'over after draft' : 'remaining after draft'}
          </p>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            isOverGoal ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
        {draftKcal > 0 ? (
          <div
            className="relative -mt-3 h-3 rounded-full bg-accent/80 transition-all"
            style={{
              marginLeft: `${percent}%`,
              width: `${Math.max(0, afterDraftPercent - percent)}%`,
            }}
          />
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Flame className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">Consumed</span>
          <span className="font-semibold">
            {consumedTodayKcal.toFixed(0)} kcal
          </span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Draft</span>
          <span className="font-semibold">{draftKcal.toFixed(0)} kcal</span>
        </div>
      </div>
    </div>
  )
}
