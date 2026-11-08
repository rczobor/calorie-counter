import { differenceInCalendarDays, format, parseISO } from 'date-fns'

import { toTimestampFromDate } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import type { WeightEntry } from './record-weight-dialog'
import { dayLabel, formatKg } from './weight-format'

// Past this many points, dots would merge into a thick line.
const MAX_DOTS = 45
// Weekly weigh-ins still read as one line; a longer pause is drawn as a gap.
const GAP_DAYS = 7

/**
 * A line over the whole date range, so gaps between weigh-ins keep their real
 * length. A pause longer than a week is a faint dashed line, so it never looks
 * measured. The SVG stretches to any width; dots and labels are HTML so they
 * stay round and crisp.
 */
export function WeightChart({
  entries,
  endDate,
  today,
}: {
  entries: WeightEntry[]
  endDate: string
  today: string
}) {
  if (entries.length === 0)
    return (
      <p className="flex h-32 items-center md:h-40 justify-center rounded-lg bg-muted/40 px-4 text-center text-sm text-muted-foreground">
        No weights in this range.
      </p>
    )
  // The axis starts at the first weigh-in, the same anchor as "since <date>".
  const start = toTimestampFromDate(entries[0].measuredOn)
  const span = Math.max(1, toTimestampFromDate(endDate) - start)
  const weights = entries.map((entry) => entry.weightKg)
  // Whole-kilogram bounds just outside the data, so the line fills the plot.
  let low = Math.floor(Math.min(...weights) - 0.25)
  let high = Math.ceil(Math.max(...weights) + 0.25)
  if (high - low < 2) {
    low -= 1
    high += 1
  }
  const x = (date: string) => ((toTimestampFromDate(date) - start) / span) * 100
  const y = (kg: number) => ((high - kg) / (high - low)) * 100
  const first = entries[0]
  const last = entries[entries.length - 1]
  const point = (entry: WeightEntry) =>
    `${x(entry.measuredOn)},${y(entry.weightKg)}`
  const runs: WeightEntry[][] = []
  const gaps: Array<[WeightEntry, WeightEntry]> = []
  for (const entry of entries) {
    const run = runs.at(-1)
    const previous = run?.at(-1)
    if (
      run &&
      previous &&
      differenceInCalendarDays(
        parseISO(entry.measuredOn),
        parseISO(previous.measuredOn),
      ) <= GAP_DAYS
    )
      run.push(entry)
    else {
      if (previous) gaps.push([previous, entry])
      runs.push([entry])
    }
  }
  const on = (date: string) => format(parseISO(date), 'MMM d, yyyy')
  const label =
    entries.length === 1
      ? `Weight ${formatKg(last.weightKg)} kg on ${on(last.measuredOn)}`
      : `Weight from ${formatKg(first.weightKg)} kg on ${on(first.measuredOn)} to ${formatKg(last.weightKg)} kg on ${on(last.measuredOn)}, ${entries.length} weigh-ins`

  return (
    <figure
      role="img"
      aria-label={
        gaps.length > 0
          ? `${label}. Dashed where there were no weigh-ins for over a week.`
          : label
      }
      className="select-none"
    >
      <div className="relative h-32 py-2 pr-12 md:h-40">
        <div className="relative h-full">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 size-full overflow-visible"
          >
            {[low, (low + high) / 2, high].map((kg) => (
              <line
                key={kg}
                x1="0"
                x2="100"
                y1={y(kg)}
                y2={y(kg)}
                className="stroke-border/70"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {gaps.map(([from, to]) => (
              <polyline
                key={from._id}
                points={`${point(from)} ${point(to)}`}
                fill="none"
                className="stroke-muted-foreground/70"
                strokeWidth="1.5"
                strokeDasharray="5 5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {runs.map((run) => (
              <polyline
                key={run[0]._id}
                points={run.map(point).join(' ')}
                fill="none"
                className="stroke-foreground/80"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {entries.map((entry) =>
            entry === last || entries.length <= MAX_DOTS ? (
              <span
                key={entry._id}
                aria-hidden="true"
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground',
                  entry === last ? 'size-2.5' : 'size-1.5 bg-foreground/80',
                )}
                style={{
                  left: `${x(entry.measuredOn)}%`,
                  top: `${y(entry.weightKg)}%`,
                }}
              />
            ) : null,
          )}
        </div>
        {[high, (low + high) / 2, low].map((kg) => (
          <span
            key={kg}
            aria-hidden="true"
            className="absolute right-0 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
            // Same inset as the plot (py-2), so each label sits on its line.
            style={{ top: `calc(0.5rem + (100% - 1rem) * ${y(kg) / 100})` }}
          >
            {kg === high
              ? `${kg} kg`
              : Number.isInteger(kg)
                ? kg
                : kg.toFixed(1)}
          </span>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="mt-1 flex justify-between pr-12 text-xs text-muted-foreground"
      >
        <span>{format(parseISO(first.measuredOn), 'MMM d')}</span>
        {span >= 4 * 86_400_000 ? (
          <span>{format(start + span / 2, 'MMM d')}</span>
        ) : null}
        <span>{dayLabel(endDate, today)}</span>
      </div>
      {gaps.length > 0 ? (
        <figcaption
          aria-hidden="true"
          className="mt-2 text-xs text-muted-foreground"
        >
          Dashed: no weigh-ins for over a week.
        </figcaption>
      ) : null}
    </figure>
  )
}
