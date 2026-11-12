import { differenceInCalendarDays, parseISO } from 'date-fns'
import { useCallback, useEffect, useId, useState } from 'react'
import {
  Area,
  ComposedChart,
  Line,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
  useActiveTooltipDataPoints,
} from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import { intlLocale, useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { toTimestampFromDate } from '@/lib/nutrition'
import { trendWeightsByDay } from '../../../convex/lib/energy'
import type { WeightEntry } from './record-weight-dialog'
import { messages } from './weight-chart.messages'
import { dayLabel, formatKg, formatMonthDay } from './weight-format'

// Weekly weigh-ins still read as one line; a longer pause is drawn as a gap.
const GAP_DAYS = 7

const config = {
  weight: { color: 'var(--chart-3)' },
} satisfies ChartConfig

/** Weigh-ins a line joins, and the pauses longer than a week between them. */
export function splitRuns(entries: WeightEntry[]) {
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
  return { runs, gaps }
}

/**
 * Each weigh-in's trend weight by date. Where too few weigh-ins sit in the
 * window behind a day (the first ones, or the first after a pause of weeks),
 * the trend is the weigh-in itself, so the line, its fill and the pause's
 * dashes always meet.
 */
export function trendByDay(history: WeightEntry[]) {
  const trends = trendWeightsByDay(
    history.map((entry) => ({ date: entry.measuredOn, kg: entry.weightKg })),
  )
  return new Map(
    history.map((entry, index) => [
      entry.measuredOn,
      trends[index] ?? entry.weightKg,
    ]),
  )
}

type Point = {
  t: number
  kg: number | null
  trend: number | null
  date: string | null
}

/** The weigh-in under a pointer or finger on the chart. */
export type ScrubbedWeight = { kg: number; date: string }

/**
 * Reports the weigh-in under the pointer while one is on the chart. A pause's
 * gap row has no weight, so it reports none.
 */
function ScrubReporter({
  live,
  onScrub,
}: {
  live: boolean
  onScrub: (weight: ScrubbedWeight | null) => void
}) {
  const point = useActiveTooltipDataPoints<Point>()?.[0]
  const kg = live ? (point?.kg ?? null) : null
  const date = live ? (point?.date ?? null) : null
  useEffect(() => {
    onScrub(kg !== null && date !== null ? { kg, date } : null)
  }, [kg, date, onScrub])
  // A chart that goes away mid-scrub (a new range or person) leaves no day
  // behind.
  useEffect(() => () => onScrub(null), [onScrub])
  return null
}

/**
 * The weight trend as a line over the whole date range, with each weigh-in a
 * faint dot, so day-to-day swings don't hide the direction. The trend is the
 * check-in's own fit (`trendWeightsByDay`), read from `history`, which reaches
 * back before the range so the line is settled where the chart begins. Gaps
 * keep their real length: a pause longer than a week is a faint dashed line,
 * so it never looks measured. Weight change is neutral, so the line is a calm
 * data colour, never a good or bad one. Scrubbing marks the weigh-in under the
 * pointer or finger and reports it, so the page can show it in place of the
 * latest weight; it clears when the pointer leaves or the finger lifts.
 */
export function WeightChart({
  entries,
  history = entries,
  endDate,
  today,
  onScrub,
}: {
  entries: WeightEntry[]
  /** The range's weigh-ins and those in the trend window before it. */
  history?: WeightEntry[]
  endDate: string
  today: string
  onScrub?: (weight: ScrubbedWeight | null) => void
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const fillId = `weight-fill-${useId().replace(/:/g, '')}`
  // Recharts clears a hovered point when the mouse leaves, but keeps a
  // touched one after the finger lifts, so lifting it mutes the scrub until
  // the next touch.
  const [live, setLive] = useState(true)
  const [scrubbed, setScrubbed] = useState<ScrubbedWeight | null>(null)
  const report = useCallback(
    (weight: ScrubbedWeight | null) => {
      setScrubbed(weight)
      onScrub?.(weight)
    },
    [onScrub],
  )
  if (entries.length === 0)
    return (
      <p className="flex h-44 items-center justify-center text-center type-subhead text-muted-foreground md:h-52">
        {t.empty}
      </p>
    )
  // The axis starts at the first weigh-in, the same anchor as "since <date>".
  const start = toTimestampFromDate(entries[0].measuredOn)
  const end = Math.max(start + 86_400_000, toTimestampFromDate(endDate))
  const trendOn = trendByDay(history)
  const trendOf = (entry: WeightEntry) =>
    trendOn.get(entry.measuredOn) ?? entry.weightKg
  const weights = entries.flatMap((entry) => [entry.weightKg, trendOf(entry)])
  // Whole-kilogram bounds just outside the data, so the line fills the plot.
  let low = Math.floor(Math.min(...weights) - 0.25)
  let high = Math.ceil(Math.max(...weights) + 0.25)
  if (high - low < 2) {
    low -= 1
    high += 1
  }
  const first = entries[0]
  const last = entries[entries.length - 1]
  const { runs, gaps } = splitRuns(entries)
  const at = (entry: WeightEntry) => toTimestampFromDate(entry.measuredOn)
  // A gap row with no weight breaks the line; the dashes bridge the pause.
  const data: Point[] = runs.flatMap((run, index) => [
    ...(index > 0
      ? [
          {
            t: (at(runs[index - 1].at(-1)!) + at(run[0])) / 2,
            kg: null,
            trend: null,
            date: null,
          },
        ]
      : []),
    ...run.map((entry) => ({
      t: at(entry),
      kg: entry.weightKg,
      trend: trendOf(entry),
      date: entry.measuredOn,
    })),
  ])
  const on = (date: string) =>
    parseISO(date).toLocaleDateString(intlLocale(locale), {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  const label =
    entries.length === 1
      ? t.single(formatKg(last.weightKg, locale), on(last.measuredOn))
      : t.range(
          formatKg(first.weightKg, locale),
          on(first.measuredOn),
          formatKg(last.weightKg, locale),
          on(last.measuredOn),
          entries.length,
        )
  const xTicks =
    end - start >= 4 * 86_400_000
      ? [start, (start + end) / 2, end]
      : [start, end]

  return (
    <figure className="select-none">
      <figcaption className="sr-only">
        {gaps.length > 0 ? t.withGaps(label) : label}
      </figcaption>
      <ChartContainer
        config={config}
        className="aspect-auto h-44 w-full md:h-52"
        aria-hidden="true"
        // From a finger's first move, so a tap never shows the last touch's
        // point; a mouse or pen (not a tap's emulated mouse events) turns it
        // back on.
        onTouchMove={() => setLive(true)}
        onTouchEnd={() => setLive(false)}
        onTouchCancel={() => setLive(false)}
        onPointerMove={(event) => {
          if (event.pointerType !== 'touch') setLive(true)
        }}
      >
        <ComposedChart
          // Hidden from assistive technology, which reads the summary
          // instead, so the chart takes no keyboard focus either.
          accessibilityLayer={false}
          data={data}
          margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-weight)"
                className="[stop-opacity:0.34] dark:[stop-opacity:0.42]"
              />
              <stop
                offset="100%"
                stopColor="var(--color-weight)"
                className="[stop-opacity:0.16] dark:[stop-opacity:0.12]"
              />
            </linearGradient>
          </defs>
          {/* The full border colour, so the lines still show in dark. */}
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[start, end]}
            ticks={xTicks}
            // A little air between the latest point and the axis figures.
            padding={{ right: 8 }}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            interval={0}
            tick={({ x, y, payload }) => {
              const value = Number(payload.value)
              return (
                <text
                  x={x}
                  y={y}
                  dy={8}
                  textAnchor={
                    value === start ? 'start' : value === end ? 'end' : 'middle'
                  }
                  style={{ fill: 'var(--muted-foreground)' }}
                >
                  {value === end
                    ? dayLabel(endDate, today, locale)
                    : formatMonthDay(value, locale)}
                </text>
              )
            }}
          />
          <YAxis
            orientation="right"
            domain={[low, high]}
            ticks={[low, (low + high) / 2, high]}
            tickLine={false}
            axisLine={false}
            width={52}
            interval={0}
            tick={({ x, y, payload }) => {
              const kg = Number(payload.value)
              // Readable foreground figures; the unit only on the top line.
              return (
                <text
                  x={x}
                  y={y}
                  dx={8}
                  dy={4}
                  style={{ fill: 'var(--foreground)', fontWeight: 500 }}
                  className="tabular-nums"
                >
                  {Number.isInteger(kg) ? kg : formatKg(kg, locale)}
                  {kg === high ? (
                    <tspan
                      style={{
                        fill: 'var(--muted-foreground)',
                        fontWeight: 400,
                      }}
                    >
                      {' kg'}
                    </tspan>
                  ) : null}
                </text>
              )
            }}
          />
          {/* Tracks the pointer; the page shows the value, not a tooltip. */}
          <ChartTooltip cursor={false} content={() => null} />
          <ScrubReporter live={live} onScrub={report} />
          {gaps.map(([from, to]) => (
            <ReferenceLine
              key={from._id}
              segment={[
                { x: at(from), y: trendOf(from) },
                { x: at(to), y: trendOf(to) },
              ]}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.7}
              strokeWidth={1.5}
              strokeDasharray="5 5"
              strokeLinecap="round"
            />
          ))}
          {/* The fill runs under pauses too, so they never read as holes;
              only the line breaks there, and the dashes bridge it. */}
          <Area
            dataKey="trend"
            type="linear"
            stroke="none"
            fill={`url(#${fillId})`}
            connectNulls
            tooltipType="none"
            activeDot={false}
            animationDuration={400}
          />
          {/* The weigh-ins themselves: faint, with the latest marked. */}
          <Line
            dataKey="kg"
            stroke="none"
            isAnimationActive={false}
            activeDot={false}
            dot={({ cx, cy, index }) =>
              data[index]?.kg == null ? (
                <g key={index} />
              ) : index === data.length - 1 ? (
                <circle
                  key="latest"
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill="var(--color-weight)"
                  // While another day is marked, only that day stands out.
                  opacity={scrubbed ? 0.35 : 1}
                />
              ) : (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={1.75}
                  fill="var(--color-weight)"
                  className="opacity-45 dark:opacity-70"
                />
              )
            }
          />
          <Line
            dataKey="trend"
            type="linear"
            stroke="var(--color-weight)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            connectNulls={false}
            tooltipType="none"
            animationDuration={400}
            activeDot={false}
            dot={false}
          />
          {scrubbed ? (
            <>
              {/* From the axis up to the day's weigh-in, so it never meets the
                  trend at a different value. */}
              <ReferenceLine
                segment={[
                  { x: toTimestampFromDate(scrubbed.date), y: low },
                  { x: toTimestampFromDate(scrubbed.date), y: scrubbed.kg },
                ]}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <ReferenceDot
                x={toTimestampFromDate(scrubbed.date)}
                y={scrubbed.kg}
                r={5}
                fill="var(--color-weight)"
                stroke="var(--card)"
                strokeWidth={2}
              />
            </>
          ) : null}
        </ComposedChart>
      </ChartContainer>
      {gaps.length > 0 ? (
        <p
          aria-hidden="true"
          className="mt-1.5 flex items-center gap-1.5 type-footnote text-muted-foreground"
        >
          <span className="w-3 border-t-[1.5px] border-dashed border-muted-foreground/70" />
          {t.gapCaption}
        </p>
      ) : null}
    </figure>
  )
}
