import {
  HistorySkeleton,
  PersonPickerPlaceholder,
} from '@/components/page/page-placeholder'
import { useHousehold } from '@/features/households/household-context'
import { PersonPicker } from '@/features/households/person-picker'
import { usePersonSelection } from '@/features/households/use-person-selection'
import { useDraftPersistenceIdentity } from '@/features/cooking/draft-persistence-identity'
import {
  createFileRoute,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'
import { usePaginatedQuery, useQuery } from '@/features/households/convex-hooks'
import { addDays, differenceInCalendarDays, isValid, parseISO } from 'date-fns'
import { ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { PageShell } from '@/components/page/page-shell'
import { Balance, Value } from '@/components/nutrition/value'
import { ConfigMissingState } from '@/components/page/page-states'
import { Button, buttonVariants } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import {
  SEGMENT_CLASS,
  SEGMENT_LIST_CLASS,
  SegmentedTrack,
} from '@/components/ui/segmented'
import { intlLocale, useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { isConvexConfigured } from '@/integrations/convex/config'
import {
  toErrorMessage,
  toLocalDateString,
  toTimestampFromDate,
} from '@/lib/nutrition'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { messages } from './history.messages'

export const Route = createFileRoute('/history')({
  ssr: false,
  component: HistoryPage,
  errorComponent: HistoryError,
})

function HistoryError({ error, reset }: ErrorComponentProps) {
  const t = useMessages(messages)
  const locale = useLocale()
  return (
    <PageShell title={t.title}>
      <p role="alert" className="mt-4 text-sm text-destructive">
        {t.loadFailed(toErrorMessage(error, locale))}
      </p>
      <Button className="mt-3" variant="outline" onClick={reset}>
        {t.retry}
      </Button>
    </PageShell>
  )
}

type DayRow = {
  date: string
  consumed: number
  goal: number
  remaining: number
  mealCount: number
}

type Person = FunctionReturnType<typeof api.people.list>['page'][number]
type Goal = FunctionReturnType<typeof api.history.goalsForRange>[number]

const HISTORY_PAGE_SIZE = 50
const PEOPLE_PAGE_SIZE = 50
const MAX_HISTORY_DAYS = 366
const RANGE_PRESETS = [7, 30]

function HistoryPage() {
  if (!isConvexConfigured) {
    return <ConfigMissingState />
  }

  return <HistoryPageContent />
}

function HistoryPageContent() {
  const t = useMessages(messages)
  const locale = useLocale()
  const { userId } = useDraftPersistenceIdentity()
  const { householdId } = useHousehold()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedPersonId, setSelectedPersonId] = usePersonSelection(userId)
  const [startDate, setStartDate] = useState(() =>
    toLocalDateString(addDays(new Date(), -6).getTime()),
  )
  const [today] = useState(() => toLocalDateString(Date.now()))
  const [endDate, setEndDate] = useState(today)
  const [customRangeOpen, setCustomRangeOpen] = useState(false)

  const inclusiveDayCount = getInclusiveDayCount(startDate, endDate)
  const isDateRangeOrdered = inclusiveDayCount > 0
  const isDateRangeValid =
    isDateRangeOrdered && inclusiveDayCount <= MAX_HISTORY_DAYS
  const {
    results: loadedPeople,
    status: peopleStatus,
    loadMore: loadMorePeople,
  } = usePaginatedQuery(
    api.people.list,
    { archived: false },
    { initialNumItems: PEOPLE_PAGE_SIZE },
  )

  const selectedPersonIsLoaded = loadedPeople.some(
    (person) => person._id === selectedPersonId,
  )
  const pointLoadedPerson = useQuery(
    api.people.get,
    selectedPersonId && !selectedPersonIsLoaded
      ? { personId: selectedPersonId }
      : 'skip',
  )
  const people = useMemo(
    () =>
      pointLoadedPerson &&
      !loadedPeople.some((person) => person._id === pointLoadedPerson._id)
        ? [...loadedPeople, pointLoadedPerson]
        : loadedPeople,
    [loadedPeople, pointLoadedPerson],
  )
  const defaultPersonAppliedRef = useRef(false)
  useEffect(() => {
    if (selectedPersonId) {
      defaultPersonAppliedRef.current = true
      return
    }
    const firstPerson = people[0]
    if (defaultPersonAppliedRef.current || !firstPerson) {
      return
    }
    defaultPersonAppliedRef.current = true
    setSelectedPersonId(firstPerson._id)
  }, [people, selectedPersonId, setSelectedPersonId])

  const effectiveSelectedPersonId: Id<'people'> | '' =
    selectedPersonId &&
    (selectedPersonIsLoaded ||
      (pointLoadedPerson !== undefined && pointLoadedPerson !== null))
      ? selectedPersonId
      : ''

  const selectedPerson = people.find(
    (person) => person._id === effectiveSelectedPersonId,
  )

  const historyArgs =
    isDateRangeValid && effectiveSelectedPersonId
      ? {
          personId: effectiveSelectedPersonId,
          startDate,
          endDate,
        }
      : 'skip'
  const {
    results: summaries,
    status: historyStatus,
    loadMore: loadMoreHistory,
  } = usePaginatedQuery(api.history.list, historyArgs, {
    initialNumItems: HISTORY_PAGE_SIZE,
  })
  const goals = useQuery(api.history.goalsForRange, historyArgs)
  const isHistoryComplete = historyStatus === 'Exhausted' && goals !== undefined
  useEffect(() => {
    if (historyStatus === 'CanLoadMore') loadMoreHistory(HISTORY_PAGE_SIZE)
  }, [historyStatus, loadMoreHistory])

  const rows = useMemo(() => {
    if (
      !isDateRangeValid ||
      !isHistoryComplete ||
      !effectiveSelectedPersonId ||
      !startDate ||
      !endDate
    ) {
      return []
    }

    const caloriesByDate = new Map<string, number>()
    const mealsByDate = new Map<string, number>()

    for (const summary of summaries) {
      caloriesByDate.set(summary.eatenOn, summary.consumedCalories)
      mealsByDate.set(summary.eatenOn, summary.mealCount)
    }

    const result: DayRow[] = []
    let current = parseISO(startDate)
    const end = parseISO(endDate)

    while (current <= end) {
      const dateKey = toLocalDateString(current.getTime())
      const consumed = caloriesByDate.get(dateKey) ?? 0
      const goal = selectedPerson
        ? getEffectiveGoalKcal(selectedPerson, goals ?? [], dateKey)
        : 0
      result.push({
        date: dateKey,
        consumed,
        goal,
        remaining: goal - consumed,
        mealCount: mealsByDate.get(dateKey) ?? 0,
      })
      current = addDays(current, 1)
    }

    result.reverse()
    return result
  }, [
    summaries,
    goals,
    effectiveSelectedPersonId,
    selectedPerson,
    startDate,
    endDate,
    isDateRangeValid,
    isHistoryComplete,
  ])

  const avgConsumed = useMemo(() => {
    const logged = rows.filter((row) => row.mealCount > 0)
    if (logged.length === 0) return 0
    return logged.reduce((sum, row) => sum + row.consumed, 0) / logged.length
  }, [rows])
  const selectedDay = rows.find((row) => row.date === selectedDate) ?? rows[0]
  const dayHref = (day: string) => {
    const search = new URLSearchParams({
      date: day,
      personId: effectiveSelectedPersonId,
    })
    if (householdId) search.set('householdId', householdId)
    return `/?${search}`
  }
  // A preset is selected while the range still ends today and spans its length.
  const matchingPreset = RANGE_PRESETS.find(
    (days) => endDate === today && inclusiveDayCount === days,
  )
  const showCustomRange = customRangeOpen || matchingPreset === undefined
  const setPresetDays = (days: number) => {
    setCustomRangeOpen(false)
    setEndDate(today)
    setStartDate(
      toLocalDateString(
        addDays(new Date(toTimestampFromDate(today)), -(days - 1)).getTime(),
      ),
    )
  }

  const isInitialLoading =
    peopleStatus === 'LoadingFirstPage' ||
    (Boolean(effectiveSelectedPersonId) &&
      isDateRangeValid &&
      (historyStatus === 'LoadingFirstPage' || goals === undefined))

  const loggedDays = rows.filter((row) => row.mealCount > 0).length

  return (
    <PageShell
      contentClassName="max-w-3xl"
      header={
        <>
          <h1 className="type-large-title text-foreground">{t.title}</h1>
          {peopleStatus === 'LoadingFirstPage' ? (
            <PersonPickerPlaceholder label={t.loadingPeople} />
          ) : people.length === 0 ? (
            <p className="type-subhead text-muted-foreground">
              {t.noActivePeople}
            </p>
          ) : (
            <PersonPicker
              options={people.map((person) => ({
                value: person._id,
                label: person.name,
              }))}
              value={effectiveSelectedPersonId || null}
              onValueChange={(value) =>
                setSelectedPersonId(value ?? ('' as Id<'people'>))
              }
            />
          )}
        </>
      }
    >
      <div className="mt-4 space-y-6">
        <div className="space-y-3">
          {peopleStatus === 'CanLoadMore' || peopleStatus === 'LoadingMore' ? (
            <Button
              size="sm"
              variant="ghost"
              className="float-right -mt-2"
              disabled={peopleStatus === 'LoadingMore'}
              aria-busy={peopleStatus === 'LoadingMore'}
              onClick={() => loadMorePeople(PEOPLE_PAGE_SIZE)}
            >
              {t.loadMorePeople}
            </Button>
          ) : null}
          {/* One segmented control of peer ranges; the dates show only for a custom range. */}
          <p id="history-range-label" className="sr-only">
            {t.range}
          </p>
          <SegmentedTrack>
            <div
              role="group"
              aria-labelledby="history-range-label"
              className={SEGMENT_LIST_CLASS}
            >
              {RANGE_PRESETS.map((days) => (
                <button
                  key={days}
                  type="button"
                  aria-pressed={!showCustomRange && matchingPreset === days}
                  className={SEGMENT_CLASS}
                  onClick={() => setPresetDays(days)}
                >
                  {t.days(days)}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={showCustomRange}
                className={SEGMENT_CLASS}
                onClick={() => setCustomRangeOpen(true)}
              >
                {t.customRange}
              </button>
            </div>
          </SegmentedTrack>
          {showCustomRange ? (
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                variant="chip"
                value={startDate}
                onChange={setStartDate}
                ariaLabel={t.startDate}
              />
              <span aria-hidden="true" className="text-muted-foreground">
                –
              </span>
              <DatePicker
                variant="chip"
                value={endDate}
                onChange={setEndDate}
                ariaLabel={t.endDate}
              />
            </div>
          ) : null}
        </div>

        {!isDateRangeValid ? (
          <div
            role="alert"
            className="inset-group bg-[color-mix(in_oklab,var(--destructive)_8%,var(--card))] px-4 py-3 type-subhead text-destructive"
          >
            {isDateRangeOrdered
              ? t.rangeTooLong(MAX_HISTORY_DAYS)
              : t.rangeReversed}
          </div>
        ) : isInitialLoading ||
          (Boolean(effectiveSelectedPersonId) && !isHistoryComplete) ? (
          <HistorySkeleton label={t.loadingRange} />
        ) : (
          <>
            <div className="inset-group">
              <div className="grid grid-cols-2">
                <div className="px-4 py-3">
                  <p className="type-footnote text-muted-foreground">
                    {t.dailyAverage}
                  </p>
                  <p className="mt-0.5">
                    {loggedDays > 0 ? (
                      <Value size="stat" value={Math.round(avgConsumed)} />
                    ) : (
                      <span className="type-title">–</span>
                    )}
                  </p>
                </div>
                <div className="border-l px-4 py-3">
                  <p className="type-footnote text-muted-foreground">
                    {t.daysWithMeals}
                  </p>
                  <p className="mt-0.5">
                    <Value
                      size="stat"
                      value={loggedDays}
                      unit={t.ofDays(rows.length)}
                    />
                  </p>
                </div>
              </div>
              {/* The caption sits inside the card it explains. A day with a
                  logged zero-calorie meal still counts. */}
              <p className="border-t px-4 py-2.5 type-footnote text-muted-foreground">
                {t.averageNote}
              </p>
            </div>

            {isHistoryComplete ? (
              <>
                <section
                  aria-labelledby="history-chart-title"
                  className="inset-group px-4 pt-3.5 pb-1"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h2 id="history-chart-title" className="type-headline">
                      {t.dailyCalories}
                    </h2>
                    <ChartLegend rows={rows} />
                  </div>
                  <HistoryChart
                    rows={rows}
                    selectedDate={selectedDay?.date}
                    onSelect={setSelectedDate}
                  />
                  {/* Names the selected day and opens it. Its figures are
                      already on the bar and in the Days row below. */}
                  {selectedDay ? (
                    <div className="-mx-4 mt-1 flex items-center justify-between gap-3 border-t px-4 py-2.5">
                      <p className="min-w-0 truncate type-headline">
                        {formatDate(selectedDay.date, locale)}
                      </p>
                      <a
                        href={dayHref(selectedDay.date)}
                        className={cn(
                          buttonVariants({ variant: 'outline', size: 'sm' }),
                          'pr-3',
                        )}
                      >
                        {t.viewDay}
                        <ChevronRight
                          aria-hidden="true"
                          className="text-muted-foreground"
                        />
                      </a>
                    </div>
                  ) : null}
                </section>

                <section aria-labelledby="history-days">
                  <h2 id="history-days" className="type-title">
                    {t.daysHeading}
                  </h2>
                  {rows.length === 0 ? (
                    <p className="mt-3 inset-group px-4 py-3 type-subhead text-muted-foreground">
                      {t.noData}
                    </p>
                  ) : (
                    <ul className="mt-3 inset-group inset-rows">
                      {rows.map((row) => (
                        <li key={row.date}>
                          <DayLink row={row} href={dayHref(row.date)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  )
}

/** A day's logged total against its goal in the value style: foreground
 * tabular figures and one muted unit, like Today's summary line. */
function DayTotals({ row }: { row: DayRow }) {
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

/** One day in the range: the date, what was logged against the goal, and
 * the balance in its state colour with a sign and arrow. Opens that day. */
function DayLink({ row, href }: { row: DayRow; href: string }) {
  const locale = useLocale()
  return (
    <a
      href={href}
      className="flex min-h-15 items-center gap-3 py-2.5 pr-3.5 pl-4 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-base">{formatDate(row.date, locale)}</span>
        <span className="mt-0.5 block type-footnote text-muted-foreground tabular-nums">
          <DayTotals row={row} />
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {row.mealCount > 0 && row.goal > 0 ? (
          <Balance remaining={row.remaining} className="type-subhead" />
        ) : null}
        <ChevronRight
          aria-hidden="true"
          className="size-4 text-muted-foreground"
        />
      </span>
    </a>
  )
}

/** The legend in the app's words. The goal line names its value, or the
 * range of values when the goal changed within the range. */
function ChartLegend({ rows }: { rows: DayRow[] }) {
  const t = useMessages(messages)
  const goals = rows.map((row) => Math.round(row.goal)).filter((g) => g > 0)
  const low = Math.min(...goals)
  const high = Math.max(...goals)
  return (
    <div className="flex items-center gap-3 type-footnote text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-kcal-left-bar" />
        {t.legendLeft}
      </span>
      <span className="inline-flex items-center gap-1.5">
        {/* The whole over mark, as the bars draw it: the tint up to the
            goal with the solid overage as a cap above. */}
        <span className="flex size-2.5 flex-col overflow-hidden rounded-[3px]">
          <span className="h-1 bg-kcal-over-bar" />
          <span className="flex-1 bg-kcal-over-base" />
        </span>
        {t.legendOver}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded-full bg-muted-foreground/70" />
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

// The plot's height (h-40) in px, to keep a figure clear of a goal mark.
const PLOT_PX = 160
// A figure's line (18px) and its gap, plus a little air.
const FIGURE_ZONE_PX = 28
// The figure's line box has about 3px below the digits, so this leaves a
// visible gap of about 8px between the digits and the bar or goal mark.
const FIGURE_GAP = '0.3125rem'

/** One bar per day, with that day's goal as a bar-width mark. Under goal the
 * bar is the left colour; over it, the bar is the berry tint up to the goal and
 * solid berry above, as on the day summary. A week shows each day's total
 * (on phones in a row above the plot, on wider screens 8px above each bar);
 * longer ranges keep the bars only. */
function HistoryChart({
  rows,
  selectedDate,
  onSelect,
}: {
  rows: DayRow[]
  selectedDate?: string
  onSelect: (date: string) => void
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const chronologicalRows = [...rows].reverse()
  const maxValue =
    Math.max(
      1,
      ...chronologicalRows.map((row) => Math.max(row.consumed, row.goal)),
    ) * 1.05
  const showValues = chronologicalRows.length <= 10
  const labelEvery = chronologicalRows.length <= 14 ? 1 : 5

  if (chronologicalRows.length === 0) {
    return (
      <p className="py-8 text-center type-subhead text-muted-foreground">
        {t.noChartData}
      </p>
    )
  }

  return (
    <div
      className={cn(
        'mt-3 flex items-stretch',
        // Bars, empty days and goal marks share one width. It scales with
        // the column on wider screens (about 44px in a 720px column).
        chronologicalRows.length > 14
          ? 'gap-px [--bar-w:70%]'
          : 'gap-1 [--bar-w:min(60%,1.75rem)] md:[--bar-w:min(46%,2.75rem)]',
      )}
    >
      {chronologicalRows.map((row, index) => {
        const selected = selectedDate === row.date
        const over = row.mealCount > 0 && row.goal > 0 && row.remaining < 0
        const showLabel =
          index % labelEvery === 0 || index === chronologicalRows.length - 1
        const barPercent =
          row.mealCount > 0
            ? Math.max(1.5, (row.consumed / maxValue) * 100)
            : null
        const goalPercent = row.goal > 0 ? (row.goal / maxValue) * 100 : null
        // On wider screens the figure sits 8px above its bar, or above the
        // goal mark when that sits just over the bar, so they never cross.
        const goalGapPx =
          goalPercent === null
            ? Infinity
            : ((goalPercent - (barPercent ?? 0)) / 100) * PLOT_PX
        const figureBottom =
          goalPercent !== null && goalGapPx >= 0 && goalGapPx < FIGURE_ZONE_PX
            ? `calc(${goalPercent}% + 1px + ${FIGURE_GAP})`
            : barPercent === null
              ? `calc(0.25rem + ${FIGURE_GAP})`
              : `calc(${barPercent}% + ${FIGURE_GAP})`
        return (
          <button
            type="button"
            key={row.date}
            aria-label={
              row.mealCount
                ? t.barLabel(
                    row.date,
                    Math.round(row.consumed),
                    Math.round(row.goal),
                  )
                : t.emptyBarLabel(row.date)
            }
            aria-pressed={selected}
            onClick={() => onSelect(row.date)}
            className={cn(
              'group flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl py-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-ring',
              // The selected day is outlined with a bold label, never a grey
              // block that could read as an empty bar.
              'not-aria-pressed:hover:bg-muted/50 aria-pressed:inset-ring aria-pressed:inset-ring-foreground/22',
            )}
            title={`${row.date}: ${Math.round(row.consumed)} / ${Math.round(row.goal)} kcal`}
          >
            <span
              className={cn(
                'relative h-40 w-full',
                // Room for the figures: their row on phones, the tallest
                // bar's figure on wider screens.
                showValues &&
                  (chronologicalRows.length <= 7 ? 'mt-6' : 'mt-[1.375rem]'),
              )}
            >
              {/* Values are readable figures; the selected day is bold, not tinted. */}
              {showValues ? (
                <span
                  className={cn(
                    'absolute inset-x-0 bottom-[calc(100%+0.375rem)] text-center font-medium text-foreground tabular-nums group-aria-pressed:font-bold md:bottom-(--figure-bottom)',
                    chronologicalRows.length <= 7
                      ? 'type-footnote'
                      : 'type-caption',
                  )}
                  style={{ '--figure-bottom': figureBottom } as CSSProperties}
                >
                  {row.mealCount > 0 ? Math.round(row.consumed) : '–'}
                </span>
              ) : null}
              {barPercent !== null ? (
                <span
                  className={cn(
                    'absolute bottom-0 left-1/2 flex w-(--bar-w) -translate-x-1/2 flex-col overflow-hidden rounded-t-[0.3125rem]',
                    over ? 'bg-kcal-over-base' : 'bg-kcal-left-bar',
                    chronologicalRows.length > 14 && 'rounded-t-[2px]',
                  )}
                  style={{ height: `${barPercent}%` }}
                >
                  {/* At least 4px, so a small overage never reads as at
                      goal; only the segment grows, the goal line stays put. */}
                  {over ? (
                    <span
                      className="min-h-1 shrink-0 bg-kcal-over-bar"
                      style={{
                        height: `${((row.consumed - row.goal) / row.consumed) * 100}%`,
                      }}
                    />
                  ) : null}
                </span>
              ) : (
                <span className="absolute bottom-0 left-1/2 h-1 w-(--bar-w) -translate-x-1/2 rounded-full bg-track" />
              )}
              {/* Muted and bar-width, so the selected day's outline stays
                  the chart's only strong stroke. */}
              {goalPercent !== null ? (
                <span
                  className="absolute left-1/2 h-0.5 w-[calc(var(--bar-w)+2px)] -translate-x-1/2 translate-y-1/2 rounded-full bg-muted-foreground/70"
                  style={{ bottom: `${goalPercent}%` }}
                />
              ) : null}
            </span>
            <span
              className={cn(
                'type-caption text-muted-foreground group-aria-pressed:font-semibold group-aria-pressed:text-foreground',
                !showLabel && 'invisible',
              )}
            >
              {parseISO(row.date).toLocaleDateString(
                intlLocale(locale),
                rows.length <= 7 ? { weekday: 'short' } : { day: 'numeric' },
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function getEffectiveGoalKcal(
  person: Person,
  goalHistory: Goal[],
  dateKey: string,
) {
  let effectiveGoal: Goal | undefined
  for (const entry of goalHistory) {
    if (entry.personId !== person._id || entry.effectiveDate > dateKey) {
      continue
    }
    if (
      effectiveGoal === undefined ||
      entry.effectiveDate > effectiveGoal.effectiveDate ||
      (entry.effectiveDate === effectiveGoal.effectiveDate &&
        entry._creationTime > effectiveGoal._creationTime)
    ) {
      effectiveGoal = entry
    }
  }

  return effectiveGoal?.goalKcal ?? person.currentDailyGoalKcal
}

function getInclusiveDayCount(startDate: string, endDate: string) {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  if (!isValid(start) || !isValid(end)) {
    return 0
  }
  return differenceInCalendarDays(end, start) + 1
}
