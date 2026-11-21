import {
  HistorySkeleton,
  PersonPickerPlaceholder,
} from '@/components/page/page-placeholder'
import { useHousehold } from '@/features/households/household-context'
import { PersonPicker } from '@/features/households/person-picker'
import { youFirst } from '@/features/households/you-first'
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

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { PageShell } from '@/components/page/page-shell'
import { Balance, Value } from '@/components/nutrition/value'
import { ConfigMissingState } from '@/components/page/page-states'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import {
  SEGMENT_CLASS,
  SEGMENT_LIST_CLASS,
  SegmentedTrack,
} from '@/components/ui/segmented'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { isConvexConfigured } from '@/integrations/convex/config'
import {
  toErrorMessage,
  toLocalDateString,
  toTimestampFromDate,
} from '@/lib/nutrition'
import { formatDate } from '@/lib/dates'
import { useMarkHintSeen } from '@/features/hints/hints'
import { EmptyState } from '@/components/page/empty-state'
import {
  HistoryChart,
  HistoryLegend,
  type DayRow,
} from '@/features/history/history-chart'
import { messages as chartMessages } from '@/features/history/history-chart.messages'
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

type Person = FunctionReturnType<typeof api.people.list>['page'][number]
type Goal = FunctionReturnType<typeof api.history.goalsForRange>[number]

const HISTORY_PAGE_SIZE = 50
const PEOPLE_PAGE_SIZE = 50
const MAX_HISTORY_DAYS = 366
const RANGE_PRESETS = [7, 30]
// Up to two weeks the list of days is the chart. Past that, rows alone lose
// the range's shape, so the bar chart stays above them.
const CHART_MIN_DAYS = 15
// The balance centres its arrow, figure and words. Beside other text on one
// line it shares that text's baseline, and only the arrow stays centred.
const INLINE_BALANCE_CLASS = 'items-baseline [&>svg]:self-center'

function HistoryPage() {
  if (!isConvexConfigured) {
    return <ConfigMissingState />
  }

  return <HistoryPageContent />
}

function HistoryPageContent() {
  const t = useMessages(messages)
  const { userId } = useDraftPersistenceIdentity()
  const { householdId } = useHousehold()
  const [selectedPersonId, setSelectedPersonId] = usePersonSelection(userId)
  const [startDate, setStartDate] = useState(() =>
    toLocalDateString(addDays(new Date(), -6).getTime()),
  )
  const [today] = useState(() => toLocalDateString(Date.now()))
  const markHintSeen = useMarkHintSeen()
  // Opening History is what its hint asks for, so the hint never shows after.
  useEffect(() => markHintSeen('history'), [markHintSeen])
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
      youFirst(
        pointLoadedPerson &&
          !loadedPeople.some((person) => person._id === pointLoadedPerson._id)
          ? [...loadedPeople, pointLoadedPerson]
          : loadedPeople,
      ),
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

  // The range in one line: what a finished day with meals averaged, how that
  // sits against the goal, and how many of those days ended over. Today is
  // still filling up, so it would pull the average down until its last meal;
  // a custom range may also run into days that have not come yet.
  const verdict = useMemo(() => {
    const finished = rows.filter((row) => row.date < today)
    const logged = finished.filter((row) => row.mealCount > 0)
    const mean = (pick: (row: DayRow) => number) =>
      logged.reduce((sum, row) => sum + pick(row), 0) /
      Math.max(1, logged.length)
    return {
      days: logged.length,
      emptyDays: finished.length - logged.length,
      consumed: mean((row) => row.consumed),
      remaining: mean((row) => row.remaining),
      hasGoal: logged.some((row) => row.goal > 0),
      overDays: logged.filter(isOver).length,
    }
  }, [rows, today])
  // One scale for every row, so bars compare by length across days.
  const scale = Math.max(
    1,
    ...rows.map((row) => Math.max(row.consumed, row.goal)),
  )
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
                you: person.linkedAccount === 'you',
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
            {isHistoryComplete ? (
              <section
                aria-labelledby={verdict.days ? 'history-verdict' : undefined}
                className="space-y-3"
              >
                {loggedDays === 0 ? (
                  // Nothing to average and no bars to draw; the rows below
                  // stay, so a missed day can still be opened and logged.
                  <div className="inset-group px-4 py-3.5">
                    <EmptyState title={t.emptyRangeTitle}>
                      {t.emptyRange}
                    </EmptyState>
                  </div>
                ) : verdict.days === 0 ? null : (
                  <div>
                    <h2
                      id="history-verdict"
                      className="flex flex-wrap items-baseline gap-x-3"
                    >
                      <Value
                        size="stat"
                        value={Math.round(verdict.consumed)}
                        unit={t.kcalADay}
                      />
                      {verdict.hasGoal ? (
                        <Balance
                          remaining={verdict.remaining}
                          className={cn('type-headline', INLINE_BALANCE_CLASS)}
                        />
                      ) : null}
                    </h2>
                    {verdict.hasGoal ? (
                      <p className="mt-0.5 type-subhead text-muted-foreground tabular-nums">
                        {t.daysOver(
                          <span className="font-semibold text-foreground">
                            {verdict.overDays}
                          </span>,
                          verdict.days,
                          verdict.emptyDays,
                        )}
                      </p>
                    ) : null}
                  </div>
                )}
                {loggedDays > 0 && rows.length >= CHART_MIN_DAYS ? (
                  <section
                    aria-labelledby="history-chart-title"
                    className="inset-group px-4 pt-3.5 pb-1"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 id="history-chart-title" className="type-headline">
                        {t.dailyCalories}
                      </h3>
                      <HistoryLegend rows={rows} />
                    </div>
                    <HistoryChart rows={rows} today={today} dayHref={dayHref} />
                  </section>
                ) : null}
                {rows.length === 0 ? (
                  <p className="inset-group px-4 py-3 type-subhead text-muted-foreground">
                    {t.noData}
                  </p>
                ) : (
                  <ul
                    aria-label={t.daysHeading}
                    className="inset-group inset-rows"
                  >
                    {rows.map((row) => (
                      <li key={row.date}>
                        <DayLink
                          row={row}
                          href={dayHref(row.date)}
                          scale={scale}
                          isToday={row.date === today}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  )
}

/** Over as the balance shows it: a rounded overage of at least 1 kcal. */
const isOver = (row: DayRow) =>
  row.goal > 0 && Math.round(row.consumed - row.goal) > 0

/**
 * One day in the range, which is also its bar in the chart the list makes:
 * the day and its balance in its state colour with a sign and arrow, then the
 * bar and the day's total. Opens that day.
 */
function DayLink({
  row,
  href,
  scale,
  isToday,
}: {
  row: DayRow
  href: string
  scale: number
  isToday: boolean
}) {
  const t = useMessages(chartMessages)
  const locale = useLocale()
  const logged = row.mealCount > 0
  return (
    <a
      href={href}
      className="flex min-h-15 items-center gap-1.5 py-2.5 pr-3.5 pl-4 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          {/* A day still filling up never reads as a finished low day. */}
          <span className="text-base">
            {isToday ? t.today : formatDate(row.date, locale)}
          </span>
          {!logged ? (
            <span className="type-subhead text-muted-foreground">
              {t.noMealsLogged}
            </span>
          ) : row.goal > 0 ? (
            <Balance
              remaining={row.remaining}
              className={cn('type-subhead', INLINE_BALANCE_CLASS)}
            />
          ) : null}
        </span>
        <span className="mt-0.5 flex h-4.5 items-center gap-2">
          <DayBar row={row} scale={scale} />
          <span className="min-w-9 text-right type-footnote font-medium text-muted-foreground tabular-nums">
            {logged ? (
              <>
                {Math.round(row.consumed)}
                <span className="sr-only"> kcal</span>
              </>
            ) : null}
          </span>
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    </a>
  )
}

/**
 * A day's bar on the range's shared scale. The track is the day's goal, so
 * track ends line up down the list as the goal; the left colour fills it to
 * what was logged, and only what lies past the goal is berry, after the
 * goal's tick. A day without meals is an empty track. Decorative: the row's
 * text says it.
 */
function DayBar({ row, scale }: { row: DayRow; scale: number }) {
  const over = isOver(row)
  // Without a goal the bar is just what was logged.
  const track = row.goal > 0 ? row.goal : row.consumed
  const fill = row.goal > 0 ? Math.min(1, row.consumed / row.goal) : 1
  return (
    <span aria-hidden="true" className="flex h-2 min-w-0 flex-1">
      <span
        className={cn(
          'h-full overflow-hidden bg-track',
          over ? 'rounded-l-full' : 'rounded-full',
        )}
        style={{ width: `${(track / scale) * 100}%` }}
      >
        {row.mealCount > 0 ? (
          <span
            className={cn(
              // A logged day of a few kcal still shows a mark.
              'block h-full min-w-1 bg-kcal-left-bar',
              !over && 'rounded-full',
            )}
            style={{ width: `${fill * 100}%` }}
          />
        ) : null}
      </span>
      {over ? (
        <span
          data-overage
          // The goal tick of Today's bar, where teal meets berry. At least 4px
          // of berry, so a small overage never reads as at goal.
          className="relative h-full min-w-1 rounded-r-full bg-kcal-over-bar before:absolute before:-inset-y-0.75 before:left-0 before:w-0.5 before:-translate-x-1/2 before:rounded-full before:bg-muted-foreground"
          style={{ width: `${((row.consumed - row.goal) / scale) * 100}%` }}
        />
      ) : null}
    </span>
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
