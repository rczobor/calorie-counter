import { parseISO } from 'date-fns'
import { useId } from 'react'
import { Bar, BarChart, XAxis, YAxis, type BarShapeProps } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { intlLocale, useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { messages } from './history-chart.messages'

export type DayRow = {
  date: string
  consumed: number
  goal: number
  remaining: number
  mealCount: number
}

const config = {
  kcal: { color: 'var(--left-bar)' },
  over: { color: 'var(--over-bar)' },
} satisfies ChartConfig

// The top corners' radius, as on shadcn's bar charts.
const RADIUS = 5
// At least this much berry, so a small overage never reads as at goal.
const MIN_OVER_PX = 4
// A logged day of a few kcal still shows a bar, unlike a day without meals.
const MIN_BAR_PX = 3

/** A day's logged total against its goal in the value style: foreground
 * tabular figures and one muted unit, like Today's summary line. */
export function DayTotals({ row }: { row: DayRow }) {
  const t = useMessages(messages)
  if (!row.mealCount) return t.noMealsLogged
  return (
    <>
      <span className="font-semibold text-foreground">
        {Math.round(row.consumed)}
      </span>
      {row.goal > 0 ? (
        <>
          {' / '}
          <span className="font-semibold text-foreground">
            {Math.round(row.goal)}
          </span>
        </>
      ) : null}
      {' kcal'}
    </>
  )
}

/** The legend in the app's words. The bars are the day's calories, so only
 * the part past the goal needs a key; the goal names its value, or the range
 * of values when the goal changed within the range. */
export function HistoryLegend({ rows }: { rows: DayRow[] }) {
  const t = useMessages(messages)
  const goals = rows.map((row) => Math.round(row.goal)).filter((g) => g > 0)
  const low = Math.min(...goals)
  const high = Math.max(...goals)
  return (
    <div className="flex items-center gap-3 type-footnote text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-kcal-over-bar" />
        {t.legendOver}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 border-t-2 border-dotted border-muted-foreground" />
        {t.legendGoal}
        {goals.length ? (
          <span className="font-semibold text-foreground tabular-nums">
            {low === high ? low : `${low}–${high}`}
          </span>
        ) : null}
      </span>
    </div>
  )
}

/**
 * One day's column: the bar in the left colour with a berry cap past the goal,
 * a nub on the track for a day without meals, and the day's goal as a dotted
 * bar-width mark over the bar (dots mark a reference value, as on Weight). The goal is placed from the column, so it
 * shows on every day and can change within the range.
 */
export function DayBar({
  x,
  width,
  height,
  background,
  day,
  max,
  clipId,
}: Pick<BarShapeProps, 'x' | 'width' | 'height' | 'background'> & {
  day: DayRow
  max: number
  clipId: string
}) {
  if (!background || background.y === null) return null
  const bottom = background.y + background.height
  const logged = day.mealCount > 0
  const barHeight = logged ? Math.max(height, MIN_BAR_PX) : 0
  const top = bottom - barHeight
  const overPx =
    logged && day.goal > 0 && day.consumed > day.goal
      ? Math.max(
          MIN_OVER_PX,
          (barHeight * (day.consumed - day.goal)) / day.consumed,
        )
      : 0
  const goalY =
    day.goal > 0
      ? background.y + background.height * (1 - day.goal / max)
      : null
  const r = Math.min(RADIUS, width / 2, barHeight)
  const outline = `M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${bottom}Z`
  return (
    <g>
      {/* The whole column opens the day, so a short bar or a day without
          meals is as easy to tap as a tall one. */}
      <rect
        x={x}
        y={background.y}
        width={width}
        height={background.height}
        fill="transparent"
      />
      {logged && overPx ? (
        // Teal stops where the berry starts, so no teal fringe shows around
        // the cap, and a gap in the card colour keeps the goal's dots on the
        // seam reading as they do above an under-goal bar.
        <>
          <clipPath id={clipId}>
            <path d={outline} />
          </clipPath>
          <g clipPath={`url(#${clipId})`}>
            <rect
              x={x}
              y={top + overPx}
              width={width}
              height={Math.max(0, barHeight - overPx)}
              fill="var(--color-kcal)"
            />
            <rect
              data-overage
              x={x}
              y={top}
              width={width}
              height={overPx}
              fill="var(--color-over)"
            />
            <rect
              x={x}
              y={top + overPx - 1.5}
              width={width}
              height={3}
              fill="var(--card)"
            />
          </g>
        </>
      ) : logged ? (
        <path d={outline} fill="var(--color-kcal)" />
      ) : (
        <rect
          data-empty
          x={x}
          y={bottom - 4}
          width={width}
          height={4}
          rx={2}
          // Clearly a mark, not a gap: a day without meals.
          fill="var(--muted-foreground)"
          fillOpacity={0.35}
        />
      )}
      {goalY === null ? null : (
        <line
          data-goal
          x1={x - 1}
          x2={x + width + 1}
          y1={goalY}
          y2={goalY}
          stroke="var(--muted-foreground)"
          // 2px dots: a bar-width mark is short, and 1.5px faded in dark.
          strokeWidth={2}
          strokeDasharray="0 4"
          strokeLinecap="round"
        />
      )}
    </g>
  )
}

/**
 * One bar per day against its goal. A week or so shows each day's total in a
 * row above the plot, where it never meets a bar or goal mark; longer ranges
 * keep the bars and show a day's figures on hover. Tapping a bar opens its
 * day. Assistive technology hears a summary instead; the Days list below has
 * every day's figures as links.
 */
export function HistoryChart({
  rows,
  today,
  dayHref,
}: {
  rows: DayRow[]
  today: string
  dayHref: (date: string) => string
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const id = useId().replace(/:/g, '')
  // History shows the chart only once a day in the range has meals.
  const days = [...rows].reverse()
  const max =
    Math.max(1, ...days.map((day) => Math.max(day.consumed, day.goal))) * 1.05
  const showValues = days.length <= 10
  // Every day up to two weeks; past that about six labels, every 5th day on
  // 30 days.
  const labelEvery = days.length <= 14 ? 1 : Math.ceil(days.length / 6)
  const last = days.length - 1
  // Even steps back from the last day, so counting columns from a tick
  // always lands on the right date.
  const ticks = days
    .filter((_, index) => (last - index) % labelEvery === 0)
    .map((day) => day.date)
  const logged = days.filter((day) => day.mealCount > 0)
  const over = logged.filter((day) => day.goal > 0 && day.consumed > day.goal)

  return (
    <figure>
      <figcaption className="sr-only">
        {t.summary(days.length, logged.length, over.length)}
      </figcaption>
      <ChartContainer
        config={config}
        aria-hidden="true"
        className={cn(
          'mt-3 aspect-auto w-full [&_.recharts-bar-rectangle]:cursor-pointer',
          // Taller on wide screens, so a small overage stays visible.
          showValues ? 'h-52 md:h-64' : 'h-46 md:h-60',
        )}
      >
        <BarChart
          data={days}
          accessibilityLayer={false}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          // Applied on each side: bars are 60% of a day's width in a week, 70% in
          // longer ranges.
          barCategoryGap={days.length > 14 ? '15%' : '20%'}
        >
          <YAxis hide domain={[0, max]} />
          {showValues ? (
            <XAxis
              xAxisId="figures"
              orientation="top"
              dataKey="date"
              height={24}
              interval={0}
              tickLine={false}
              axisLine={false}
              tick={({ x, y, index }) => {
                const day = days[index]
                return (
                  <text
                    x={x}
                    y={y}
                    dy={-4}
                    textAnchor="middle"
                    className="tabular-nums"
                    style={{ fill: 'var(--foreground)', fontWeight: 500 }}
                  >
                    {day.mealCount > 0 ? Math.round(day.consumed) : '–'}
                  </text>
                )
              }}
            />
          ) : null}
          <XAxis
            dataKey="date"
            ticks={ticks}
            interval={0}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={({ x, y, payload }) => {
              const date = String(payload.value)
              const index = ticks.indexOf(date)
              // Past a week, a tick names its month where the month starts,
              // so a range across two months reads "Oct 14 … Nov 3".
              const newMonth =
                index === 0 ||
                date.slice(0, 7) !== ticks[index - 1]?.slice(0, 7)
              const label =
                date === today
                  ? t.today
                  : parseISO(date).toLocaleDateString(
                      intlLocale(locale),
                      days.length <= 7
                        ? { weekday: 'short' }
                        : newMonth
                          ? { month: 'short', day: 'numeric' }
                          : { day: 'numeric' },
                    )
              // Thin bars: the end labels hang inward, as on the Weight chart.
              const anchor =
                days.length > 7 && date === days[0].date
                  ? 'start'
                  : days.length > 7 && date === days[last].date
                    ? 'end'
                    : 'middle'
              return (
                <text
                  x={x}
                  y={y}
                  dy="0.71em"
                  textAnchor={anchor}
                  style={{ fill: 'var(--muted-foreground)' }}
                >
                  {label}
                </text>
              )
            }}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(date) =>
                  typeof date === 'string' ? formatDate(date, locale) : null
                }
                formatter={(_value, _name, item) => {
                  const day = days.find((row) => row === item.payload)
                  return day ? (
                    <span className="type-subhead text-muted-foreground tabular-nums">
                      <DayTotals row={day} />
                    </span>
                  ) : null
                }}
              />
            }
          />
          <Bar
            name="kcal"
            dataKey={(day: DayRow) => (day.mealCount > 0 ? day.consumed : 0)}
            maxBarSize={44}
            animationDuration={400}
            shape={(props: BarShapeProps) => (
              <DayBar
                {...props}
                day={days[props.index]}
                max={max}
                clipId={`${id}-${props.index}`}
              />
            )}
            onClick={(_, index) =>
              window.location.assign(dayHref(days[index].date))
            }
          />
        </BarChart>
      </ChartContainer>
    </figure>
  )
}
