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

/** The day summary's progress bar. Decorative: the figures above say it. */
export function IntakeBar({
  consumed,
  goal,
  className,
}: {
  consumed: number
  goal: number
  className?: string
}) {
  const bar = intakeBarGeometry(consumed, goal)
  return (
    <div aria-hidden="true" className={cn('relative', className)}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-track">
        {bar.over ? (
          <>
            {/* Up to the goal in a light berry that never matches the empty
                track, the overage in solid berry. The overage is at least
                6px wide, so +20 on 2000 never reads as at goal: the base
                gives up those pixels, while the goal tick stays at its true
                position (inside the overage when it is that small). */}
            <div
              className="bg-kcal-over-base"
              style={{ width: `${bar.tick}%` }}
            />
            <div data-overage className="min-w-1.5 flex-1 bg-kcal-over-bar" />
          </>
        ) : (
          <div
            className="rounded-full bg-kcal-left-bar"
            style={{ width: `${bar.fill}%` }}
          />
        )}
      </div>
      {bar.over ? (
        <div
          data-goal-tick
          className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground"
          style={{ left: `${bar.tick}%` }}
        />
      ) : null}
    </div>
  )
}
