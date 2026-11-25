import { cn } from '@/lib/utils'

/**
 * Where the day summary bar's fill and goal tick fall, as percentages of the
 * bar. Up to the goal the bar is the goal and fills with what was logged.
 * Over it the bar is what was logged: the goal becomes a tick and the
 * overage fills the rest, so slightly over and far over look different.
 */
export function intakeBarGeometry(consumed: number, goal: number) {
  if (consumed > goal)
    return {
      over: true,
      tick: consumed > 0 ? (Math.max(0, goal) / consumed) * 100 : 0,
    } as const
  return {
    over: false,
    fill: goal > 0 ? Math.min(100, (Math.max(0, consumed) / goal) * 100) : 0,
  } as const
}

/**
 * The day's meals as stretches of the bar, oldest first: each one's share of
 * the bar, and how much of it lies up to the goal and past it, so the meal
 * that crossed the goal is split there. What the meals do not account for
 * (a page of them still to load) leads as one stretch of its own.
 */
export function intakeBarSegments(
  meals: number[],
  consumed: number,
  goal: number,
) {
  const logged = meals
    .map((kcal, meal): { kcal: number; meal?: number } => ({ kcal, meal }))
    .filter((part) => part.kcal > 0)
  const sum = logged.reduce((total, part) => total + part.kcal, 0)
  const rest = consumed - sum
  const parts = rest >= 1 ? [{ kcal: rest }, ...logged] : logged
  const total = Math.max(consumed, sum)
  const limit = Math.max(0, goal)
  // Up to the goal the bar is the goal; over it, what was logged.
  const scale = total > limit ? total : limit
  let start = 0
  return parts.map(({ kcal, meal }) => {
    const left = Math.max(0, Math.min(start + kcal, limit) - start)
    start += kcal
    // Fractional meals leave float residue in the running total, and any
    // overage draws at its 6px minimum, so ignore what rounds away in the
    // whole-kcal figures: a day under or at the goal shows no berry.
    const over = kcal - left
    // `meal` is the stretch's place in `meals`; the unaccounted one has none.
    return {
      width: (kcal / scale) * 100,
      left,
      over: over < 0.5 ? 0 : over,
      meal,
    }
  })
}

/**
 * The day summary's progress bar, and its slimmer form in the pinned day
 * line. With the day's meals it is split into them by 2px slits, so the bar
 * shows which meal was the big one and which crossed the goal; an open meal
 * keeps its colour while the others step back. Decorative: the figures
 * beside it say it.
 */
export function IntakeBar({
  consumed,
  goal,
  meals,
  openMeal,
  slim = false,
  className,
}: {
  consumed: number
  goal: number
  /** Each meal's kcal, oldest first. Without it the bar is one stretch. */
  meals?: number[]
  /** The index in `meals` of the meal that is open, if one is. */
  openMeal?: number
  slim?: boolean
  className?: string
}) {
  const bar = intakeBarGeometry(consumed, goal)
  const segments = intakeBarSegments(meals ?? [], consumed, goal)
  return (
    <div aria-hidden="true" className={cn('relative', className)}>
      <div
        className={cn(
          'flex overflow-hidden rounded-full bg-track',
          slim ? 'h-1.5' : 'h-2.5',
        )}
      >
        {segments.map((segment, index) => {
          const last = index === segments.length - 1
          return (
            <div
              key={index}
              className={cn(
                'flex h-full',
                slim ? 'min-w-1' : 'min-w-1.5',
                // The slit before the next meal, in the track's colour.
                !last && 'pr-0.5',
              )}
              style={{ width: `${segment.width}%` }}
            >
              {segment.left > 0 ? (
                <div
                  className={cn(
                    'intake-fill bg-kcal-left-bar',
                    // Under the goal the latest meal ends the fill with the
                    // bar's round cap.
                    last && !bar.over && 'rounded-r-full',
                    // The overage never steps back: the day's state stays.
                    openMeal !== undefined &&
                      segment.meal !== openMeal &&
                      'opacity-40',
                  )}
                  style={{ flex: segment.left }}
                />
              ) : null}
              {segment.over > 0 ? (
                // Up to the goal in the left colour, as under it, and only
                // the overage in berry, like History, so a little over looks
                // a little over. The overage is at least 6px wide, so +20 on
                // 2000 never reads as at goal: the base gives up those
                // pixels, while the goal tick stays at its true position
                // (inside the overage when it is that small).
                <div
                  data-overage
                  className="min-w-1.5 bg-kcal-over-bar"
                  style={{ flex: segment.over }}
                />
              ) : null}
            </div>
          )
        })}
      </div>
      {bar.over ? (
        <div
          data-goal-tick
          className={cn(
            'absolute w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground',
            slim ? '-inset-y-0.75' : '-inset-y-1',
          )}
          style={{ left: `${bar.tick}%` }}
        />
      ) : null}
    </div>
  )
}
