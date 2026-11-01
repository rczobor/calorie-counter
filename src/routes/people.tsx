import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { UserRound } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import {
  useMutation,
  usePaginatedQuery,
  useQuery,
} from '@/features/households/convex-hooks'
import { PageShell } from '@/components/page/page-shell'
import {
  ConfigMissingState,
  LoadingSkeletonState,
} from '@/components/page/page-states'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { isConvexConfigured } from '@/integrations/convex/config'
import { toLocalDateString } from '@/lib/nutrition'

type Person = FunctionReturnType<typeof api.people.list>['page'][number]
const PAGE_SIZE = 20
export const Route = createFileRoute('/people')({
  ssr: false,
  component: PeoplePage,
})

function PeoplePage() {
  return isConvexConfigured ? <PeopleContent /> : <ConfigMissingState />
}

function PeopleContent() {
  const [showArchived, setShowArchived] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState<Id<'people'> | null>(
    null,
  )
  const [editing, setEditing] = useState<Person | null>()
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('2200')
  const [reason, setReason] = useState('')
  const active = usePaginatedQuery(
    api.people.list,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const archived = usePaginatedQuery(
    api.people.list,
    showArchived ? { archived: true } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const people = useMemo(
    () =>
      [...active.results, ...(showArchived ? archived.results : [])].sort(
        (a, b) => a.name.localeCompare(b.name),
      ),
    [active.results, archived.results, showArchived],
  )
  const selected = useQuery(
    api.people.get,
    selectedPersonId ? { personId: selectedPersonId } : 'skip',
  )
  const history = usePaginatedQuery(
    api.people.listGoalHistory,
    selectedPersonId && selected !== null
      ? { personId: selectedPersonId }
      : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const createPerson = useMutation(api.nutrition.createPerson)
  const updatePerson = useMutation(api.nutrition.updatePerson)
  const setArchived = useMutation(api.nutrition.setPersonArchived)
  const deletePerson = useMutation(api.nutrition.deletePerson)
  const {
    isRunning,
    runAction,
    confirmAndRunAction,
    pendingConfirmation,
    isConfirmDialogOpen,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  } = useConfirmableAction()
  const dirty =
    editing !== undefined &&
    (name !== (editing?.name ?? '') ||
      goal !== String(editing?.currentDailyGoalKcal ?? 2200) ||
      reason !== '')

  function beginEdit(person: Person | null) {
    const open = () => {
      setEditing(person)
      setName(person?.name ?? '')
      setGoal(String(person?.currentDailyGoalKcal ?? 2200))
      setReason('')
    }
    if (dirty)
      confirmAndRunAction(
        'Discard unsaved person changes?',
        'Editor opened.',
        async () => open(),
      )
    else open()
  }
  function closeEditor() {
    if (dirty)
      confirmAndRunAction(
        'Discard unsaved person changes?',
        'Changes discarded.',
        async () => setEditing(undefined),
      )
    else setEditing(undefined)
  }

  if (active.status === 'LoadingFirstPage')
    return (
      <LoadingSkeletonState
        title="People & goals"
        icon={<UserRound className="size-4" />}
      />
    )
  return (
    <>
      <PageShell
        title="People & goals"
        icon={<UserRound className="size-4" />}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
      >
        <div className="mx-auto mt-4 max-w-3xl space-y-5">
          <Link
            to="/settings"
            className="inline-block text-sm text-muted-foreground hover:text-foreground"
          >
            ‹ Settings
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Goal changes take effect today. Earlier goals remain in history.
            </p>
            <Button
              variant="outline"
              disabled={isRunning}
              onClick={() => beginEdit(null)}
            >
              Add person
            </Button>
          </div>
          {editing !== undefined ? (
            <section
              className="rounded-lg border border-border/60 bg-card p-4"
              aria-label={editing ? `Edit ${editing.name}` : 'New person'}
            >
              <h2 className="text-sm font-semibold">
                {editing ? 'Edit person' : 'Create person'}
              </h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void runAction(
                    editing ? 'Person updated.' : 'Person created.',
                    async () => {
                      const effectiveDate = toLocalDateString(Date.now())
                      if (editing)
                        await updatePerson({
                          personId: editing._id,
                          expectedEditRevision: editing.editRevision,
                          name,
                          goalKcal: Number(goal),
                          reason: reason.trim() || undefined,
                          effectiveDate,
                        })
                      else
                        await createPerson({
                          name,
                          currentDailyGoalKcal: Number(goal),
                          effectiveDate,
                        })
                      setEditing(undefined)
                    },
                  )
                }}
              >
                <fieldset
                  disabled={isRunning}
                  className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2"
                >
                  <div className="space-y-2">
                    <Label htmlFor="person-name">Name</Label>
                    <Input
                      id="person-name"
                      aria-label="Person name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="person-goal">Daily calorie goal</Label>
                    <Input
                      id="person-goal"
                      aria-label="Daily calorie goal"
                      type="number"
                      min="0.01"
                      step="any"
                      value={goal}
                      onChange={(event) => setGoal(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="goal-reason">
                      Goal change reason (optional)
                    </Label>
                    <Input
                      id="goal-reason"
                      aria-label="Goal change reason"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <Button
                      type="submit"
                      disabled={
                        !name.trim() ||
                        !Number.isFinite(Number(goal)) ||
                        Number(goal) <= 0
                      }
                    >
                      {editing ? 'Save changes' : 'Create person'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeEditor}
                    >
                      Cancel
                    </Button>
                  </div>
                </fieldset>
              </form>
            </section>
          ) : null}
          <div className="divide-y border-y border-border/60">
            {people.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                No people found.
              </p>
            ) : (
              people.map((person) => (
                <details
                  key={person._id}
                  className="py-4"
                  open={selectedPersonId === person._id && selected !== null}
                  onToggle={(event) => {
                    const open = event.currentTarget.open
                    setSelectedPersonId((current) =>
                      open
                        ? person._id
                        : current === person._id
                          ? null
                          : current,
                    )
                  }}
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {person.name}
                    {person.archived ? ' · Archived' : ''}
                    <span className="mt-1 block font-normal text-muted-foreground">
                      {person.currentDailyGoalKcal.toFixed(0)} kcal daily goal
                    </span>
                  </summary>
                  <div className="mt-4 space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isRunning}
                        onClick={() => beginEdit(person)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isRunning}
                        onClick={() =>
                          void runAction(
                            person.archived
                              ? 'Person restored.'
                              : 'Person archived.',
                            () =>
                              setArchived({
                                personId: person._id,
                                expectedEditRevision: person.editRevision,
                                archived: !person.archived,
                              }),
                          )
                        }
                      >
                        {person.archived ? 'Restore' : 'Archive'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isRunning}
                        onClick={() =>
                          confirmAndRunAction(
                            'Delete this person permanently?',
                            'Person deleted.',
                            async () => {
                              await deletePerson({
                                personId: person._id,
                                expectedEditRevision: person.editRevision,
                              })
                              if (editing?._id === person._id)
                                setEditing(undefined)
                              if (selectedPersonId === person._id)
                                setSelectedPersonId(null)
                            },
                          )
                        }
                      >
                        Delete person
                      </Button>
                    </div>
                    {selectedPersonId === person._id && selected !== null ? (
                      <section aria-label={`Goal history for ${person.name}`}>
                        <h3 className="text-xs font-medium text-muted-foreground">
                          Goal history
                        </h3>
                        {history.status === 'LoadingFirstPage' ? (
                          <p role="status" className="mt-2 text-sm">
                            Loading goal history…
                          </p>
                        ) : history.results.length === 0 ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            No goal history found.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {history.results.map((entry) => (
                              <li
                                key={entry._id}
                                className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm"
                              >
                                <span>
                                  {entry.effectiveDate}
                                  {entry.reason ? (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      {entry.reason}
                                    </span>
                                  ) : null}
                                </span>
                                <span>{entry.goalKcal.toFixed(0)} kcal</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {history.status === 'CanLoadMore' ||
                        history.status === 'LoadingMore' ? (
                          <Button
                            className="mt-3"
                            size="sm"
                            variant="outline"
                            disabled={history.status === 'LoadingMore'}
                            onClick={() => history.loadMore(PAGE_SIZE)}
                          >
                            {history.status === 'LoadingMore'
                              ? 'Loading history…'
                              : 'Load more goal history'}
                          </Button>
                        ) : null}
                      </section>
                    ) : null}
                  </div>
                </details>
              ))
            )}
          </div>
          {active.status === 'CanLoadMore' ||
          active.status === 'LoadingMore' ? (
            <Button
              variant="outline"
              disabled={active.status === 'LoadingMore'}
              onClick={() => active.loadMore(PAGE_SIZE)}
            >
              {active.status === 'LoadingMore'
                ? 'Loading people…'
                : 'Load more people'}
            </Button>
          ) : null}
          {showArchived &&
          (archived.status === 'CanLoadMore' ||
            archived.status === 'LoadingMore') ? (
            <Button
              variant="outline"
              disabled={archived.status === 'LoadingMore'}
              onClick={() => archived.loadMore(PAGE_SIZE)}
            >
              {archived.status === 'LoadingMore'
                ? 'Loading archived people…'
                : 'Load more archived people'}
            </Button>
          ) : null}
        </div>
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
