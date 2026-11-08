import { createFileRoute } from '@tanstack/react-router'
import { Calculator } from 'lucide-react'
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
import { describePlan } from '@/features/energy/energy-format'
import {
  GoalCalculator,
  type CalculatorChoice,
} from '@/features/energy/goal-calculator'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { isConvexConfigured } from '@/integrations/convex/config'
import { formatDate } from '@/lib/dates'
import { toLocalDateString } from '@/lib/nutrition'
import { messages } from './people.messages'

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
  const t = useMessages(messages)
  const locale = useLocale()
  const [showArchived, setShowArchived] = useState(false)
  // undefined: no sheet; null: a new person; a person: editing them.
  const [editing, setEditing] = useState<Person | null>()
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('2200')
  const [reason, setReason] = useState('')
  // The local date the calculator opened on, while it is open.
  const [calculatingOn, setCalculatingOn] = useState<string | null>(null)
  // A calculator result waits in the form and saves with the goal.
  const [plan, setPlan] = useState<Pick<
    CalculatorChoice,
    'energyProfile' | 'goalPlan'
  > | null>(null)
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
  const latestWeight = useQuery(
    api.weight.latestOnOrBefore,
    calculatingOn && editing
      ? { personId: editing._id, date: calculatingOn }
      : 'skip',
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
      reason !== '' ||
      plan !== null)

  function beginEdit(person: Person | null) {
    setEditing(person)
    setName(person?.name ?? '')
    setGoal(String(person?.currentDailyGoalKcal ?? 2200))
    setReason('')
    setPlan(null)
  }
  function closeEditor() {
    if (dirty)
      confirmAndRunAction(t.discardChanges, t.changesDiscarded, async () =>
        setEditing(undefined),
      )
    else setEditing(undefined)
  }

  return (
    <PageShell
      contentClassName="max-w-3xl"
      title={t.title}
      breadcrumbs={<SettingsBreadcrumbs current={t.title} />}
    >
      <div className="mt-4 space-y-3">
        <ListToolbar
          create={{
            noun: t.personNoun,
            disabled: isRunning,
            onClick: () => beginEdit(null),
          }}
          archived={{
            checked: showArchived,
            onCheckedChange: setShowArchived,
          }}
        />
        <RecordList
          label={t.people}
          loading={active.status === 'LoadingFirstPage'}
          empty={t.noPeople}
        >
          {people.map((person) => (
            <RecordRow
              key={person._id}
              verb={t.edit}
              title={person.name}
              detail={
                person.goalPlan
                  ? describePlan(person.goalPlan, locale)
                  : undefined
              }
              value={person.currentDailyGoalKcal.toFixed(0)}
              unit={t.kcalPerDay}
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
            {t.loadMorePeople}
          </LoadMoreButton>
        ) : null}
        {showArchived &&
        (archived.status === 'CanLoadMore' ||
          archived.status === 'LoadingMore') ? (
          <LoadMoreButton
            loading={archived.status === 'LoadingMore'}
            onClick={() => archived.loadMore(PAGE_SIZE)}
          >
            {t.loadMoreArchived}
          </LoadMoreButton>
        ) : null}
      </div>
      {editing !== undefined ? (
        <EditorDialog
          title={editing ? t.editTitle : t.newPerson}
          description={t.description}
          pending={isRunning}
          onClose={closeEditor}
        >
          <form
            className="flex flex-1 flex-col"
            aria-label={editing ? t.editPerson(editing.name) : t.newPerson}
            onSubmit={(event) => {
              event.preventDefault()
              void runAction(editing ? t.updated : t.created, async () => {
                const effectiveDate = toLocalDateString(Date.now())
                if (editing)
                  await updatePerson({
                    personId: editing._id,
                    expectedEditRevision: editing.editRevision,
                    name,
                    goalKcal: Number(goal),
                    reason: reason.trim() || undefined,
                    effectiveDate,
                    ...plan,
                  })
                else
                  await createPerson({
                    name,
                    currentDailyGoalKcal: Number(goal),
                    effectiveDate,
                    reason: reason.trim() || undefined,
                    ...plan,
                  })
                setEditing(undefined)
              })
            }}
          >
            <fieldset disabled={isRunning} className="min-w-0 space-y-4 pb-5">
              <Field label={t.name} htmlFor="person-name">
                <Input
                  id="person-name"
                  aria-label={t.personName}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </Field>
              <Field
                label={t.dailyGoal}
                htmlFor="person-goal"
                hint={
                  plan
                    ? t.savedWithGoal(describePlan(plan.goalPlan, locale))
                    : t.goalHint
                }
              >
                <UnitInput
                  id="person-goal"
                  unit="kcal"
                  aria-label={t.dailyGoal}
                  min="0.01"
                  step="any"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  required
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCalculatingOn(toLocalDateString(Date.now()))}
              >
                <Calculator />
                {t.helpMeChoose}
              </Button>
              {editing ? (
                <Field label={t.reasonLabel} htmlFor="goal-reason">
                  <Input
                    id="goal-reason"
                    aria-label={t.reason}
                    placeholder={t.optional}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </Field>
              ) : null}
              {editing && selected !== null ? (
                <section aria-labelledby="goal-history-title" className="pt-1">
                  <h3 id="goal-history-title" className="group-label">
                    {t.goalHistory}
                  </h3>
                  <RecordList
                    label={t.goalHistory}
                    loading={history.status === 'LoadingFirstPage'}
                    empty={t.noGoalHistory}
                  >
                    {history.results.map((entry) => (
                      <RecordRow
                        key={entry._id}
                        title={formatDate(entry.effectiveDate, locale)}
                        detail={entry.reason}
                        value={entry.goalKcal.toFixed(0)}
                        unit={t.kcalPerDay}
                      />
                    ))}
                  </RecordList>
                  {history.status === 'CanLoadMore' ||
                  history.status === 'LoadingMore' ? (
                    <LoadMoreButton
                      loading={history.status === 'LoadingMore'}
                      onClick={() => history.loadMore(PAGE_SIZE)}
                    >
                      {t.loadMoreGoalHistory}
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
                      live.archived ? t.restored : t.archivedDone,
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
                      t.deleteConfirm,
                      t.deleted,
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
                {editing ? t.saveChanges : t.create}
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
      {calculatingOn &&
      editing !== undefined &&
      // A new person has no weigh-ins, so nothing to wait for.
      (editing === null || latestWeight !== undefined) ? (
        <GoalCalculator
          personName={name}
          profile={plan?.energyProfile ?? editing?.energyProfile}
          plan={plan?.goalPlan ?? editing?.goalPlan}
          latestWeight={
            editing && latestWeight
              ? { kg: latestWeight.weightKg, date: latestWeight.measuredOn }
              : null
          }
          currentGoalKcal={editing?.currentDailyGoalKcal}
          today={calculatingOn}
          onClose={() => setCalculatingOn(null)}
          onUse={(choice) => {
            setGoal(String(choice.goalKcal))
            setReason(choice.reason)
            setPlan({
              energyProfile: choice.energyProfile,
              goalPlan: choice.goalPlan,
            })
            setCalculatingOn(null)
          }}
        />
      ) : null}
    </PageShell>
  )
}
