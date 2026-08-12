import { createFileRoute } from '@tanstack/react-router'
import type { FunctionReturnType } from 'convex/server'
import { usePaginatedQuery, useQuery } from 'convex/react'
import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
} from 'date-fns'
import { History } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { PageShell } from '@/components/page/page-shell'
import {
  ConfigMissingState,
  LoadingSkeletonState,
} from '@/components/page/page-states'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumnDef } from '@/components/ui/data-table'
import { DatePicker } from '@/components/ui/date-picker'
import { Select } from '@/components/ui/select'
import { isConvexConfigured } from '@/integrations/convex/config'
import { toLocalDateString } from '@/lib/nutrition'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/history')({
  ssr: false,
  component: HistoryPage,
})

type DayRow = {
  date: string
  consumed: number
  goal: number
  remaining: number
}

type Person = FunctionReturnType<typeof api.people.list>['page'][number]
type Goal = FunctionReturnType<typeof api.history.goalsForRange>[number]

const HISTORY_PAGE_SIZE = 50
const PEOPLE_PAGE_SIZE = 50
const MAX_HISTORY_DAYS = 366

const columns: DataTableColumnDef<DayRow>[] = [
  {
    accessorKey: 'date',
    header: 'Date',
    cell: ({ row }) => {
      const dateStr = row.original.date
      const parsed = parseISO(dateStr)
      return format(parsed, 'EEE, MMM d, yyyy')
    },
  },
  {
    accessorKey: 'consumed',
    header: 'Consumed',
    cell: ({ row }) => `${Math.round(row.original.consumed)} kcal`,
  },
  {
    accessorKey: 'goal',
    header: 'Goal',
    cell: ({ row }) =>
      row.original.goal > 0 ? `${Math.round(row.original.goal)} kcal` : '--',
  },
  {
    accessorKey: 'remaining',
    header: 'Remaining',
    cell: ({ row }) => {
      const { remaining, goal } = row.original
      if (goal <= 0) return '--'
      return (
        <span
          className={cn(
            'font-medium',
            remaining >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400',
          )}
        >
          {Math.round(remaining)} kcal
        </span>
      )
    },
  },
]

function HistoryPage() {
  if (!isConvexConfigured) {
    return <ConfigMissingState />
  }

  return <HistoryPageContent />
}

function HistoryPageContent() {
  const [selectedPersonId, setSelectedPersonId] = useState<Id<'people'> | ''>(
    '',
  )
  const [startDate, setStartDate] = useState(() =>
    toLocalDateString(addDays(new Date(), -6).getTime()),
  )
  const [endDate, setEndDate] = useState(() => toLocalDateString(Date.now()))

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
  }, [people, selectedPersonId])

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
  const isHistoryComplete = historyStatus === 'Exhausted'

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

    for (const summary of summaries) {
      caloriesByDate.set(summary.eatenOn, summary.consumedCalories)
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
    if (rows.length === 0) return 0
    return rows.reduce((sum, row) => sum + row.consumed, 0) / rows.length
  }, [rows])
  const setPresetDays = (days: number) => {
    setEndDate(toLocalDateString(Date.now()))
    setStartDate(toLocalDateString(addDays(new Date(), -(days - 1)).getTime()))
  }

  const isInitialLoading =
    peopleStatus === 'LoadingFirstPage' ||
    (Boolean(effectiveSelectedPersonId) &&
      isDateRangeValid &&
      (historyStatus === 'LoadingFirstPage' || goals === undefined))

  if (isInitialLoading) {
    return (
      <LoadingSkeletonState
        title="History"
        icon={<History className="h-5 w-5" />}
      />
    )
  }

  return (
    <PageShell title="History" icon={<History className="h-4 w-4" />}>
      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Person
            </p>
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active people.</p>
            ) : (
              <Select
                options={people.map((person) => ({
                  value: person._id,
                  label: person.name,
                }))}
                value={effectiveSelectedPersonId || null}
                onValueChange={(value) =>
                  setSelectedPersonId(value ?? ('' as Id<'people'>))
                }
                placeholder="Select person"
                ariaLabel="Select person"
              />
            )}
            {peopleStatus === 'CanLoadMore' ||
            peopleStatus === 'LoadingMore' ? (
              <Button
                className="mt-2"
                size="sm"
                variant="ghost"
                disabled={peopleStatus === 'LoadingMore'}
                onClick={() => loadMorePeople(PEOPLE_PAGE_SIZE)}
              >
                {peopleStatus === 'LoadingMore'
                  ? 'Loading people...'
                  : 'Load more people'}
              </Button>
            ) : null}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              From
            </p>
            <DatePicker
              value={startDate}
              onChange={setStartDate}
              ariaLabel="History start date"
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">To</p>
            <DatePicker
              value={endDate}
              onChange={setEndDate}
              ariaLabel="History end date"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setPresetDays(7)}>
              7 days
            </Button>
            <Button variant="outline" onClick={() => setPresetDays(30)}>
              30 days
            </Button>
          </div>
        </div>

        {!isDateRangeValid ? (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {isDateRangeOrdered
              ? `History ranges can include at most ${MAX_HISTORY_DAYS} days.`
              : 'The start date must be on or before the end date.'}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/40 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Current daily goal
                </span>
                <span className="text-sm font-semibold">
                  {selectedPerson
                    ? `${selectedPerson.currentDailyGoalKcal.toFixed(0)} kcal`
                    : '--'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Avg. Consumed / Day
                </span>
                <span className="text-sm font-semibold">
                  {rows.length > 0 ? `${Math.round(avgConsumed)} kcal` : '--'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Days</span>
                <span className="text-sm font-semibold">{rows.length}</span>
              </div>
            </div>

            {isHistoryComplete ? (
              <>
                <HistoryChart rows={rows} />

                <div>
                  <DataTable
                    columns={columns}
                    data={rows}
                    emptyText="No data for the selected range."
                  />
                </div>
              </>
            ) : null}

            {historyStatus === 'CanLoadMore' ||
            historyStatus === 'LoadingMore' ? (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3"
              >
                <p className="text-sm text-muted-foreground">
                  More saved days exist in this range. Load every page before
                  totals, averages, and zero-calorie days are shown.
                </p>
                <Button
                  variant="outline"
                  disabled={historyStatus === 'LoadingMore'}
                  onClick={() => loadMoreHistory(HISTORY_PAGE_SIZE)}
                >
                  {historyStatus === 'LoadingMore'
                    ? 'Loading history...'
                    : 'Load more history'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  )
}

function HistoryChart({ rows }: { rows: DayRow[] }) {
  const chronologicalRows = [...rows].reverse()
  const maxValue = Math.max(
    1,
    ...chronologicalRows.map((row) => Math.max(row.consumed, row.goal)),
  )

  if (chronologicalRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-sm text-muted-foreground">
        No chart data for the selected range.
      </div>
    )
  }

  return (
    <section className="rounded-lg border border-border/60 bg-card p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Trend</h2>
          <p className="text-xs text-muted-foreground">
            Daily consumed calories compared with goal.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Consumed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent-foreground" />
            Goal
          </span>
        </div>
      </div>
      <div className="flex h-52 items-end gap-2 overflow-x-auto pb-2">
        {chronologicalRows.map((row) => {
          const consumedHeight = Math.max(2, (row.consumed / maxValue) * 100)
          const goalHeight = Math.max(2, (row.goal / maxValue) * 100)
          return (
            <div
              key={row.date}
              className="flex min-w-10 flex-1 flex-col items-center gap-2"
              title={`${row.date}: ${Math.round(row.consumed)} / ${Math.round(row.goal)} kcal`}
            >
              <div className="flex h-40 w-full items-end justify-center gap-1 rounded-md bg-muted/35 px-1 py-2">
                <div
                  className="w-2 rounded-t bg-primary"
                  style={{ height: `${consumedHeight}%` }}
                />
                <div
                  className="w-2 rounded-t bg-accent-foreground/75"
                  style={{ height: `${goalHeight}%` }}
                />
              </div>
              <span className="text-[0.7rem] text-muted-foreground">
                {format(parseISO(row.date), 'MMM d')}
              </span>
            </div>
          )
        })}
      </div>
    </section>
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
        entry.createdAt > effectiveGoal.createdAt)
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
