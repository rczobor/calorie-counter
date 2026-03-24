import { type ColumnDef } from '@tanstack/react-table'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { History } from 'lucide-react'

import type { Doc, Id } from '../../convex/_generated/dataModel'
import { PageShell } from '@/components/page/page-shell'
import {
  ConfigMissingState,
  LoadingSkeletonState,
} from '@/components/page/page-states'
import { DataTable } from '@/components/ui/data-table'
import { DatePicker } from '@/components/ui/date-picker'
import { Toggle } from '@/components/ui/toggle'
import { isConvexConfigured } from '@/integrations/convex/config'
import { useManagementData } from '@/hooks/use-management-data'
import { getMealDateKey, toLocalDateString } from '@/lib/nutrition'
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

const columns: ColumnDef<DayRow>[] = [
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
            remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
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

  const { data, isLoading } = useManagementData()

  const people = useMemo(
    () => data.people.filter((person) => person.active),
    [data.people],
  )

  const effectiveSelectedPersonId = useMemo<Id<'people'> | ''>(() => {
    if (people.length === 0) return ''
    const hasSelected = people.some(
      (person) => person._id === selectedPersonId,
    )
    if (hasSelected) return selectedPersonId
    return people[0]._id
  }, [people, selectedPersonId])

  const selectedPerson = people.find(
    (person) => person._id === effectiveSelectedPersonId,
  )

  const mealItemsByMealId = useMemo(() => {
    const map = new Map<Id<'meals'>, Doc<'mealItems'>[]>()
    for (const item of data.mealItems) {
      const existing = map.get(item.mealId)
      if (existing) {
        existing.push(item)
      } else {
        map.set(item.mealId, [item])
      }
    }
    return map
  }, [data.mealItems])

  const rows = useMemo(() => {
    if (!effectiveSelectedPersonId || !startDate || !endDate) return []

    const caloriesByDate = new Map<string, number>()

    for (const meal of data.meals) {
      if (meal.archived) continue
      if (meal.personId !== effectiveSelectedPersonId) continue
      const dateKey = getMealDateKey(meal)
      if (dateKey < startDate || dateKey > endDate) continue

      const mealCalories = (mealItemsByMealId.get(meal._id) ?? []).reduce(
        (sum, item) => sum + item.caloriesSnapshot,
        0,
      )
      caloriesByDate.set(
        dateKey,
        (caloriesByDate.get(dateKey) ?? 0) + mealCalories,
      )
    }

    const goal = selectedPerson?.currentDailyGoalKcal ?? 0
    const result: DayRow[] = []
    let current = parseISO(startDate)
    const end = parseISO(endDate)

    while (current <= end) {
      const dateKey = toLocalDateString(current.getTime())
      const consumed = caloriesByDate.get(dateKey) ?? 0
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
    data.meals,
    mealItemsByMealId,
    effectiveSelectedPersonId,
    selectedPerson,
    startDate,
    endDate,
  ])

  const avgConsumed = useMemo(() => {
    if (rows.length === 0) return 0
    return rows.reduce((sum, row) => sum + row.consumed, 0) / rows.length
  }, [rows])

  if (isLoading) {
    return <LoadingSkeletonState title="History" icon={<History className="h-5 w-5" />} />
  }

  return (
    <PageShell title="History" icon={<History className="h-5 w-5" />}>
      <div className="mt-3 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Person
            </p>
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active people.</p>
            ) : (
              <div className="inline-flex rounded-xl border border-border/80 bg-muted/35 p-1">
                {people.map((person) => (
                  <Toggle
                    key={person._id}
                    variant="default"
                    size="lg"
                    pressed={effectiveSelectedPersonId === person._id}
                    onPressedChange={(pressed) => {
                      if (pressed) {
                        setSelectedPersonId(person._id)
                      }
                    }}
                    className="h-8 rounded-lg px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-xs"
                  >
                    {person.name}
                  </Toggle>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              From
            </p>
            <DatePicker value={startDate} onChange={setStartDate} />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              To
            </p>
            <DatePicker value={endDate} onChange={setEndDate} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div>
            <span className="text-xs text-muted-foreground">
              Daily Goal
            </span>
            <p className="text-sm font-medium">
              {selectedPerson
                ? `${selectedPerson.currentDailyGoalKcal.toFixed(0)} kcal`
                : '--'}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">
              Avg. Consumed / Day
            </span>
            <p className="text-sm font-medium">
              {rows.length > 0 ? `${Math.round(avgConsumed)} kcal` : '--'}
            </p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Days</span>
            <p className="text-sm font-medium">{rows.length}</p>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={rows}
          emptyText="No data for the selected range."
        />
      </div>
    </PageShell>
  )
}
