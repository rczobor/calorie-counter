import { createFileRoute } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Target, Trash2, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { PageShell } from '@/components/page/page-shell'
import {
  ConfigMissingState,
  LoadingSkeletonState,
} from '@/components/page/page-states'
import { StatusBadge } from '@/components/page/status-badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumnDef } from '@/components/ui/data-table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { GoalHistorySection } from '@/features/people/goal-history'
import { PeopleTableSection } from '@/features/people/people-table'
import { PersonFormSection } from '@/features/people/person-form'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { isConvexConfigured } from '@/integrations/convex/config'
import { toLocalDateString } from '@/lib/nutrition'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 20

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
  const [editingPersonRevision, setEditingPersonRevision] = useState<
    number | null
  >(null)
  const [goal, setGoal] = useState('2200')
  const [goalReason, setGoalReason] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<{
    id: Id<'people'>
    name: string
  } | null>(null)

  const {
    pendingConfirmation,
    isConfirmDialogOpen,
    isRunning,
    runAction,
    confirmAndRunAction,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  } = useConfirmableAction()

  const [today] = useState(() => toLocalDateString(Date.now()))

  const activePeople = usePaginatedQuery(
    api.people.listWithToday,
    { archived: false, today },
    { initialNumItems: PAGE_SIZE },
  )
  const archivedPeople = usePaginatedQuery(
    api.people.listWithToday,
    showArchived ? { archived: true, today } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const selectedPersonDetail = useQuery(
    api.people.get,
    selectedPerson ? { personId: selectedPerson.id } : 'skip',
  )
  const effectiveSelectedPerson =
    selectedPersonDetail === null ? null : selectedPerson
  const goalHistory = usePaginatedQuery(
    api.people.listGoalHistory,
    effectiveSelectedPerson ? { personId: effectiveSelectedPerson.id } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )

  const createPerson = useMutation(api.nutrition.createPerson)
  const updatePerson = useMutation(api.nutrition.updatePerson)
  const setPersonArchived = useMutation(api.nutrition.setPersonArchived)
  const deletePerson = useMutation(api.nutrition.deletePerson)

  const visiblePeople = useMemo(
    () =>
      [
        ...activePeople.results,
        ...(showArchived ? archivedPeople.results : []),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [activePeople.results, archivedPeople.results, showArchived],
  )
  const isLoading = activePeople.status === 'LoadingFirstPage'
  const isLoadingMorePeople =
    activePeople.status === 'LoadingMore' ||
    (showArchived &&
      (archivedPeople.status === 'LoadingFirstPage' ||
        archivedPeople.status === 'LoadingMore'))
  const canLoadMorePeople =
    activePeople.status === 'CanLoadMore' ||
    (showArchived && archivedPeople.status === 'CanLoadMore')

  const loadMorePeople = () => {
    if (activePeople.status === 'CanLoadMore') {
      activePeople.loadMore(PAGE_SIZE)
    }
    if (showArchived && archivedPeople.status === 'CanLoadMore') {
      archivedPeople.loadMore(PAGE_SIZE)
    }
  }

  const resetForm = () => {
    setEditingPersonId(null)
    setEditingPersonRevision(null)
    setName('')
    setGoal('2200')
    setGoalReason('')
  }
  const canSavePerson = name.trim().length > 0 && Number(goal) > 0

  const startEdit = (personId: Id<'people'>) => {
    const person = visiblePeople.find((item) => item._id === personId)
    if (!person) {
      return
    }

    setSelectedPerson({ id: person._id, name: person.name })
    setEditingPersonId(personId)
    setEditingPersonRevision(person.editRevision)
    setName(person.name)
    setGoal(person.currentDailyGoalKcal.toString())
    setGoalReason('')
  }

  const peopleTableRows = useMemo<PersonTableRow[]>(
    () =>
      visiblePeople.map((person) => {
        const consumedKcal = person.consumedCalories
        return {
          id: person._id,
          person,
          name: person.name,
          status: person.archived ? 'Archived' : 'Active',
          goalKcal: person.currentDailyGoalKcal,
          consumedKcal,
          remainingKcal: person.currentDailyGoalKcal - consumedKcal,
        }
      }),
    [visiblePeople],
  )

  const peopleColumns: DataTableColumnDef<PersonTableRow>[] = [
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
      cell: ({ row }) => {
        const percent =
          row.original.goalKcal > 0
            ? Math.min(
                100,
                Math.max(
                  0,
                  (row.original.consumedKcal / row.original.goalKcal) * 100,
                ),
              )
            : 0
        return (
          <div className="min-w-32 space-y-1.5">
            <span>{row.original.consumedKcal.toFixed(0)} kcal</span>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full',
                  row.original.remainingKcal < 0
                    ? 'bg-destructive'
                    : 'bg-primary',
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )
      },
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
              variant={
                effectiveSelectedPerson?.id === person._id
                  ? 'secondary'
                  : 'outline'
              }
              disabled={isRunning}
              onClick={() =>
                setSelectedPerson({ id: person._id, name: person.name })
              }
            >
              History
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={() => startEdit(person._id)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={() =>
                void runAction(
                  person.archived ? 'Person restored.' : 'Person archived.',
                  async () => {
                    await setPersonArchived({
                      personId: person._id,
                      expectedEditRevision: person.editRevision,
                      archived: !person.archived,
                    })
                  },
                )
              }
            >
              {person.archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isRunning}
              aria-label={`Delete ${person.name}`}
              onClick={() =>
                confirmAndRunAction(
                  'Delete this person permanently?',
                  'Person deleted.',
                  async () => {
                    await deletePerson({
                      personId: person._id,
                      expectedEditRevision: person.editRevision,
                    })
                    if (editingPersonId === person._id) {
                      resetForm()
                    }
                    if (selectedPerson?.id === person._id) {
                      setSelectedPerson(null)
                    }
                  },
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      },
    },
  ]

  const goalHistoryRows = useMemo<GoalHistoryTableRow[]>(
    () =>
      goalHistory.results.map((entry) => ({
        id: entry._id,
        personName: effectiveSelectedPerson?.name ?? 'Unknown',
        effectiveDate: entry.effectiveDate,
        goalKcal: entry.goalKcal,
        reason: entry.reason ?? '',
      })),
    [goalHistory.results, effectiveSelectedPerson?.name],
  )

  const goalHistoryColumns: DataTableColumnDef<GoalHistoryTableRow>[] = [
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
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1 h-3 w-44" />
            <div className="mt-3 space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>
          <div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-1 h-3 w-32" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton
                  key={`people-row-skeleton-${index}`}
                  className="h-10 w-full"
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 border-t border-border/40 pt-4">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="mt-1 h-3 w-52" />
          <div className="mt-3 space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton
                key={`history-row-skeleton-${index}`}
                className="h-9 w-full"
              />
            ))}
          </div>
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
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
          <PersonFormSection isEditing={Boolean(editingPersonId)}>
            <fieldset className="contents" disabled={isRunning}>
              <div className="space-y-2">
                <Label htmlFor="personName">Name</Label>
                <Input
                  id="personName"
                  aria-label="Person name"
                  placeholder="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dailyGoal">Daily calorie goal</Label>
                <Input
                  id="dailyGoal"
                  type="number"
                  aria-label="Daily calorie goal"
                  placeholder="Daily kcal goal"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goalReason">Goal change reason</Label>
                <Input
                  id="goalReason"
                  aria-label="Goal change reason"
                  placeholder="Optional"
                  value={goalReason}
                  onChange={(event) => setGoalReason(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!canSavePerson || isRunning}
                  onClick={() =>
                    void runAction(
                      editingPersonId ? 'Person updated.' : 'Person created.',
                      async () => {
                        const goalValue = Number(goal)
                        if (editingPersonId) {
                          await updatePerson({
                            personId: editingPersonId,
                            expectedEditRevision: editingPersonRevision ?? 0,
                            name,
                            goalKcal: goalValue,
                            reason: goalReason.trim() || undefined,
                            effectiveDate: today,
                          })
                          if (selectedPerson?.id === editingPersonId) {
                            setSelectedPerson({
                              id: editingPersonId,
                              name: name.trim(),
                            })
                          }
                        } else {
                          const personId = await createPerson({
                            name,
                            currentDailyGoalKcal: goalValue,
                            effectiveDate: today,
                          })
                          setSelectedPerson({ id: personId, name: name.trim() })
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
            </fieldset>
          </PersonFormSection>

          <PeopleTableSection today={today}>
            <DataTable
              columns={peopleColumns}
              data={peopleTableRows}
              searchColumnId="name"
              searchPlaceholder="Filter loaded people"
              emptyText="No people found."
              toolbarActions={
                canLoadMorePeople || isLoadingMorePeople ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isLoadingMorePeople}
                    onClick={loadMorePeople}
                  >
                    {isLoadingMorePeople
                      ? 'Loading people…'
                      : 'Load more people'}
                  </Button>
                ) : null
              }
            />
            {canLoadMorePeople ? (
              <p className="text-xs text-muted-foreground">
                Filtering includes loaded people only. Load more to include
                additional people.
              </p>
            ) : null}
          </PeopleTableSection>
        </div>

        <GoalHistorySection>
          {effectiveSelectedPerson ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Showing goal history for{' '}
                <span className="font-medium text-foreground">
                  {effectiveSelectedPerson.name}
                </span>
                .
              </p>
              <DataTable
                columns={goalHistoryColumns}
                data={goalHistoryRows}
                emptyText={
                  goalHistory.status === 'LoadingFirstPage'
                    ? 'Loading goal history…'
                    : 'No goal history found.'
                }
                toolbarActions={
                  goalHistory.status === 'CanLoadMore' ||
                  goalHistory.status === 'LoadingMore' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={goalHistory.status === 'LoadingMore'}
                      onClick={() => goalHistory.loadMore(PAGE_SIZE)}
                    >
                      {goalHistory.status === 'LoadingMore'
                        ? 'Loading history…'
                        : 'Load more goal history'}
                    </Button>
                  ) : null
                }
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Select History on a person to view their goal changes.
            </p>
          )}
        </GoalHistorySection>
      </PageShell>

      <ConfirmDestructiveDialog
        open={isConfirmDialogOpen}
        onOpenChange={handleConfirmDialogOpenChange}
        onConfirm={confirmPendingAction}
        disabled={isRunning}
        description={pendingConfirmation?.message}
      />
    </>
  )
}

type PersonTableRow = {
  id: Id<'people'>
  person: PersonListItem
  name: string
  status: 'Active' | 'Archived'
  goalKcal: number
  consumedKcal: number
  remainingKcal: number
}

type PersonListItem = FunctionReturnType<
  typeof api.people.listWithToday
>['page'][number]

type GoalHistoryTableRow = {
  id: Id<'personGoalHistory'>
  personName: string
  effectiveDate: string
  goalKcal: number
  reason: string
}
