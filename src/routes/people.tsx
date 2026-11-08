import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { api } from '../../convex/_generated/api'
import {
  useMutation,
  usePaginatedQuery,
  useQuery,
} from '@/features/households/convex-hooks'
import { PageShell } from '@/components/page/page-shell'
import { ConfigMissingState } from '@/components/page/page-states'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { EditorDialog } from '@/components/page/editor-dialog'
import { Field, UnitInput } from '@/components/list/field'
import { ListToolbar, LoadMoreButton } from '@/components/list/list-toolbar'
import { RecordList, RecordRow } from '@/components/list/record-list'
import { ArchiveActions, SheetFooter } from '@/components/list/sheet-footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { isConvexConfigured } from '@/integrations/convex/config'
import { formatDate } from '@/lib/dates'
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
  // undefined: no sheet; null: a new person; a person: editing them.
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
    editing ? { personId: editing._id } : 'skip',
  )
  // A person removed elsewhere has no goal history to load.
  const history = usePaginatedQuery(
    api.people.listGoalHistory,
    editing && selected !== null ? { personId: editing._id } : 'skip',
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
  // Archive and Delete send the live revision, as the row buttons did.
  const live = editing && selected !== null ? (selected ?? editing) : undefined
  const dirty =
    editing !== undefined &&
    (name !== (editing?.name ?? '') ||
      goal !== String(editing?.currentDailyGoalKcal ?? 2200) ||
      reason !== '')

  function beginEdit(person: Person | null) {
    setEditing(person)
    setName(person?.name ?? '')
    setGoal(String(person?.currentDailyGoalKcal ?? 2200))
    setReason('')
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

  return (
    <PageShell
      contentClassName="max-w-3xl"
      title="People & goals"
      breadcrumbs={<SettingsBreadcrumbs current="People & goals" />}
    >
      <div className="mt-4 space-y-3">
        <ListToolbar
          create={{
            noun: 'person',
            disabled: isRunning,
            onClick: () => beginEdit(null),
          }}
          archived={{
            checked: showArchived,
            onCheckedChange: setShowArchived,
          }}
        />
        <RecordList
          label="People"
          loading={active.status === 'LoadingFirstPage'}
          empty="No people found."
        >
          {people.map((person) => (
            <RecordRow
              key={person._id}
              verb="Edit"
              title={person.name}
              value={person.currentDailyGoalKcal.toFixed(0)}
              unit="kcal / day"
              archived={person.archived}
              disabled={isRunning}
              onOpen={() => beginEdit(person)}
            />
          ))}
        </RecordList>
        {active.status === 'CanLoadMore' || active.status === 'LoadingMore' ? (
          <LoadMoreButton
            loading={active.status === 'LoadingMore'}
            onClick={() => active.loadMore(PAGE_SIZE)}
          >
            Load more people
          </LoadMoreButton>
        ) : null}
        {showArchived &&
        (archived.status === 'CanLoadMore' ||
          archived.status === 'LoadingMore') ? (
          <LoadMoreButton
            loading={archived.status === 'LoadingMore'}
            onClick={() => archived.loadMore(PAGE_SIZE)}
          >
            Load more archived people
          </LoadMoreButton>
        ) : null}
      </div>
      {editing !== undefined ? (
        <EditorDialog
          title={editing ? 'Edit person' : 'New person'}
          description="A goal change applies from today. Earlier goals stay in history."
          pending={isRunning}
          onClose={closeEditor}
        >
          <form
            className="flex flex-1 flex-col"
            aria-label={editing ? `Edit ${editing.name}` : 'New person'}
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
            <fieldset disabled={isRunning} className="min-w-0 space-y-4 pb-5">
              <Field label="Name" htmlFor="person-name">
                <Input
                  id="person-name"
                  aria-label="Person name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </Field>
              <Field
                label="Daily calorie goal"
                htmlFor="person-goal"
                hint="Applies from today. Earlier goals stay in history."
              >
                <UnitInput
                  id="person-goal"
                  unit="kcal"
                  aria-label="Daily calorie goal"
                  min="0.01"
                  step="any"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  required
                />
              </Field>
              {editing ? (
                <Field label="Reason for a goal change" htmlFor="goal-reason">
                  <Input
                    id="goal-reason"
                    aria-label="Goal change reason"
                    placeholder="Optional"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
              ) : null}
              {editing && selected !== null ? (
                <section aria-labelledby="goal-history-title" className="pt-1">
                  <h3 id="goal-history-title" className="group-label">
                    Goal history
                  </h3>
                  <RecordList
                    label="Goal history"
                    loading={history.status === 'LoadingFirstPage'}
                    empty="No goal history found."
                  >
                    {history.results.map((entry) => (
                      <RecordRow
                        key={entry._id}
                        title={formatDate(entry.effectiveDate)}
                        detail={entry.reason}
                        value={entry.goalKcal.toFixed(0)}
                        unit="kcal / day"
                      />
                    ))}
                  </RecordList>
                  {history.status === 'CanLoadMore' ||
                  history.status === 'LoadingMore' ? (
                    <LoadMoreButton
                      loading={history.status === 'LoadingMore'}
                      onClick={() => history.loadMore(PAGE_SIZE)}
                    >
                      Load more goal history
                    </LoadMoreButton>
                  ) : null}
                </section>
              ) : null}
            </fieldset>
            <SheetFooter>
              {live ? (
                <ArchiveActions
                  name={live.name}
                  archived={live.archived}
                  // Both close the sheet, so unsaved edits are saved or
                  // cancelled first rather than silently dropped.
                  disabled={isRunning || dirty}
                  onArchive={() =>
                    void runAction(
                      live.archived ? 'Person restored.' : 'Person archived.',
                      async () => {
                        await setArchived({
                          personId: live._id,
                          expectedEditRevision: live.editRevision,
                          archived: !live.archived,
                        })
                        setEditing(undefined)
                      },
                    )
                  }
                  onDelete={() =>
                    confirmAndRunAction(
                      'Delete this person permanently?',
                      'Person deleted.',
                      async () => {
                        await deletePerson({
                          personId: live._id,
                          expectedEditRevision: live.editRevision,
                        })
                        setEditing(undefined)
                      },
                    )
                  }
                />
              ) : null}
              <Button
                type="submit"
                size="lg"
                disabled={
                  isRunning ||
                  !name.trim() ||
                  !Number.isFinite(Number(goal)) ||
                  Number(goal) <= 0
                }
              >
                {editing ? 'Save changes' : 'Create person'}
              </Button>
            </SheetFooter>
          </form>
          <ConfirmDestructiveDialog
            open={isConfirmDialogOpen}
            onOpenChange={handleConfirmDialogOpenChange}
            onConfirm={confirmPendingAction}
            disabled={isRunning}
            description={pendingConfirmation?.message}
          />
        </EditorDialog>
      ) : null}
    </PageShell>
  )
}
