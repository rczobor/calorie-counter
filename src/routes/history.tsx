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
  DayTotals,
  HistoryChart,
  HistoryLegend,
  type DayRow,
} from '@/features/history/history-chart'
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

  const avgConsumed = useMemo(() => {
    const logged = rows.filter((row) => row.mealCount > 0)
    if (logged.length === 0) return 0
    return logged.reduce((sum, row) => sum + row.consumed, 0) / logged.length
  }, [rows])
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
            {/* An empty range has no average to show; its card says so. */}
            {isHistoryComplete && loggedDays === 0 ? null : (
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
              </div>
            )}

            {isHistoryComplete ? (
              <>
                {loggedDays === 0 ? (
                  // A chart of empty bars says nothing; the Days rows below
                  // stay, so a missed day can still be opened and logged.
                  <section className="inset-group px-4 py-3.5">
                    <EmptyState title={t.emptyRangeTitle}>
                      {t.emptyRange}
                    </EmptyState>
                  </section>
                ) : (
                  <section
                    aria-labelledby="history-chart-title"
                    className="inset-group px-4 pt-3.5 pb-1"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h2 id="history-chart-title" className="type-headline">
                        {t.dailyCalories}
                      </h2>
                      <HistoryLegend rows={rows} />
                    </div>
                    <HistoryChart rows={rows} dayHref={dayHref} />
                  </section>
                )}

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
