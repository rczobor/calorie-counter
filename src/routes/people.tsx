import { type ColumnDef } from '@tanstack/react-table'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { Target, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'

import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { PageShell } from '@/components/page/page-shell'
import {
  ConfigMissingState,
  LoadingSkeletonState,
} from '@/components/page/page-states'
import { StatusBadge } from '@/components/page/status-badge'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { GoalHistorySection } from '@/features/people/goal-history'
import { PeopleTableSection } from '@/features/people/people-table'
import { PersonFormSection } from '@/features/people/person-form'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { useManagementData } from '@/hooks/use-management-data'
import { isConvexConfigured } from '@/integrations/convex/config'
import { getMealDateKey, toLocalDateString } from '@/lib/nutrition'

export const Route = createFileRoute('/people')({
  ssr: false,
  component: PeoplePage,
})

function PeoplePage() {
  if (!isConvexConfigured) {
    return <ConfigMissingState />
  }

  return <PeoplePageContent />
}

function PeoplePageContent() {
  const [editingPersonId, setEditingPersonId] = useState<Id<'people'> | null>(
    null,
  )
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('2200')
  const [goalReason, setGoalReason] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const {
    pendingConfirmation,
    isConfirmDialogOpen,
    runAction,
    confirmAndRunAction,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  } = useConfirmableAction()

  const { data, isLoading } = useManagementData()

  const createPerson = useMutation(api.nutrition.createPerson)
  const updatePerson = useMutation(api.nutrition.updatePerson)
  const updatePersonGoal = useMutation(api.nutrition.updatePersonGoal)
  const setPersonArchived = useMutation(api.nutrition.setPersonArchived)
  const deletePerson = useMutation(api.nutrition.deletePerson)

  const [today] = useState(() => toLocalDateString(Date.now()))

  const mealItemsByMealId = useMemo(() => {
    const map = new Map<Id<'meals'>, Doc<'mealItems'>[]>()
    for (const item of data.mealItems) {
      const bucket = map.get(item.mealId)
      if (bucket) {
        bucket.push(item)
      } else {
        map.set(item.mealId, [item])
      }
    }
    return map
  }, [data.mealItems])

  const dailyConsumedByPersonId = useMemo(() => {
    const map = new Map<Id<'people'>, number>()
    for (const meal of data.meals) {
      if (Boolean(meal.archived) || getMealDateKey(meal) !== today) {
        continue
      }
      const mealCalories = (mealItemsByMealId.get(meal._id) ?? []).reduce(
        (sum, item) => sum + item.caloriesSnapshot,
        0,
      )
      map.set(meal.personId, (map.get(meal.personId) ?? 0) + mealCalories)
    }
    return map
  }, [data.meals, mealItemsByMealId, today])

  const visiblePeople = data.people.filter((person) =>
    showArchived ? true : person.active,
  )

  const resetForm = () => {
    setEditingPersonId(null)
    setName('')
    setGoal('2200')
    setGoalReason('')
  }

  const startEdit = (personId: Id<'people'>) => {
    const person = data.people.find((item) => item._id === personId)
    if (!person) {
      return
    }

    setEditingPersonId(personId)
    setName(person.name)
    setGoal(person.currentDailyGoalKcal.toFixed(0))
    setGoalReason('')
  }

  const peopleTableRows = useMemo<PersonTableRow[]>(
    () =>
      visiblePeople.map((person) => {
        const consumedKcal = dailyConsumedByPersonId.get(person._id) ?? 0
        return {
          id: person._id,
          person,
          name: person.name,
          status: person.active ? 'Active' : 'Archived',
          goalKcal: person.currentDailyGoalKcal,
          consumedKcal,
          remainingKcal: person.currentDailyGoalKcal - consumedKcal,
        }
      }),
    [dailyConsumedByPersonId, visiblePeople],
  )

  const peopleColumns: ColumnDef<PersonTableRow>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.name}</span>
      ),
    },
    {
      accessorKey: 'goalKcal',
      header: 'Goal',
      cell: ({ row }) => `${row.original.goalKcal.toFixed(0)} kcal`,
    },
    {
      accessorKey: 'consumedKcal',
      header: 'Consumed',
      cell: ({ row }) => `${row.original.consumedKcal.toFixed(0)} kcal`,
    },
    {
      accessorKey: 'remainingKcal',
      header: 'Left Today',
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1">
          <Target className="h-3 w-3" />
          <span
            className={
              row.original.remainingKcal < 0
                ? 'text-destructive'
                : 'text-foreground'
            }
          >
            {row.original.remainingKcal.toFixed(0)} kcal
          </span>
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const person = row.original.person

        return (
          <div className="flex min-w-max items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => startEdit(person._id)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void runAction(
                  person.active ? 'Person archived.' : 'Person restored.',
                  async () => {
                    await setPersonArchived({
                      personId: person._id,
                      archived: person.active,
                    })
                  },
                )
              }
            >
              {person.active ? 'Archive' : 'Unarchive'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              aria-label={`Delete ${person.name}`}
              onClick={() =>
                confirmAndRunAction(
                  'Delete this person permanently?',
                  'Person deleted.',
                  async () => {
                    await deletePerson({ personId: person._id })
                    if (editingPersonId === person._id) {
                      resetForm()
                    }
                  },
                )
              }
            >
              Delete
            </Button>
          </div>
        )
      },
    },
  ]

  const personNameById = useMemo(
    () => new Map(data.people.map((person) => [person._id, person.name])),
    [data.people],
  )

  const goalHistoryRows = useMemo<GoalHistoryTableRow[]>(
    () =>
      data.personGoalHistory.map((entry) => ({
        id: entry._id,
        personName: personNameById.get(entry.personId) ?? 'Unknown',
        effectiveDate: entry.effectiveDate,
        goalKcal: entry.goalKcal,
        reason: entry.reason ?? '',
      })),
    [data.personGoalHistory, personNameById],
  )

  const goalHistoryColumns: ColumnDef<GoalHistoryTableRow>[] = [
    {
      accessorKey: 'personName',
      header: 'Person',
    },
    {
      accessorKey: 'effectiveDate',
      header: 'Effective Date',
    },
    {
      accessorKey: 'goalKcal',
      header: 'Goal',
      cell: ({ row }) => `${row.original.goalKcal.toFixed(0)} kcal`,
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ row }) => (
        <span className="max-w-80 whitespace-normal text-muted-foreground">
          {row.original.reason || '—'}
        </span>
      ),
    },
  ]

  if (isLoading) {
    return (
      <LoadingSkeletonState
        title="People"
        icon={<UserRound className="h-4 w-4" />}
        maxWidth="7xl"
      >
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3 rounded-lg border border-border bg-card/90 p-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <div className="space-y-2 rounded-lg border border-border bg-card/90 p-4">
            <Skeleton className="h-6 w-20" />
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton
                key={`people-row-skeleton-${index}`}
                className="h-10 w-full"
              />
            ))}
          </div>
        </div>
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-card/90 p-4">
          <Skeleton className="h-6 w-44" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton
              key={`history-row-skeleton-${index}`}
              className="h-9 w-full"
            />
          ))}
        </div>
      </LoadingSkeletonState>
    )
  }

  return (
    <>
      <PageShell
        title="People"
        icon={<UserRound className="h-4 w-4" />}
        maxWidth="7xl"
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
      >
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.2fr]">
          <PersonFormSection isEditing={Boolean(editingPersonId)}>
            <Input
              aria-label="Person name"
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              type="number"
              aria-label="Daily calorie goal"
              placeholder="Daily kcal goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
            <Input
              aria-label="Goal change reason"
              placeholder="Reason for goal change (optional)"
              value={goalReason}
              onChange={(event) => setGoalReason(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  void runAction(
                    editingPersonId ? 'Person updated.' : 'Person created.',
                    async () => {
                      const goalValue = Number(goal)
                      if (editingPersonId) {
                        await updatePerson({
                          personId: editingPersonId,
                          name,
                        })
                        await updatePersonGoal({
                          personId: editingPersonId,
                          goalKcal: goalValue,
                          reason: goalReason.trim() || undefined,
                          effectiveDate: today,
                        })
                      } else {
                        await createPerson({
                          name,
                          currentDailyGoalKcal: goalValue,
                          effectiveDate: today,
                        })
                      }
                      resetForm()
                    },
                  )
                }
              >
                {editingPersonId ? 'Save Changes' : 'Create Person'}
              </Button>
              {editingPersonId ? (
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </PersonFormSection>

          <PeopleTableSection today={today}>
            <DataTable
              columns={peopleColumns}
              data={peopleTableRows}
              searchColumnId="name"
              searchPlaceholder="Search people"
              emptyText="No people found."
            />
          </PeopleTableSection>
        </div>

        <GoalHistorySection>
          <DataTable
            columns={goalHistoryColumns}
            data={goalHistoryRows}
            searchColumnId="personName"
            searchPlaceholder="Search goal history"
            emptyText="No goal history found."
          />
        </GoalHistorySection>
      </PageShell>

      <ConfirmDestructiveDialog
        open={isConfirmDialogOpen}
        onOpenChange={handleConfirmDialogOpenChange}
        onConfirm={confirmPendingAction}
        description={pendingConfirmation?.message}
      />
    </>
  )
}

type PersonTableRow = {
  id: Id<'people'>
  person: Doc<'people'>
  name: string
  status: 'Active' | 'Archived'
  goalKcal: number
  consumedKcal: number
  remainingKcal: number
}

type GoalHistoryTableRow = {
  id: Id<'personGoalHistory'>
  personName: string
  effectiveDate: string
  goalKcal: number
  reason: string
}
