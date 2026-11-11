import { createFileRoute } from '@tanstack/react-router'
import { Calculator, Lock } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { toast } from 'sonner'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import {
  useMutation,
  usePaginatedQuery,
  useQuery,
} from '@/features/households/convex-hooks'
import { PageShell } from '@/components/page/page-shell'
import { ConfigMissingState } from '@/components/page/page-states'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { StatusBadge } from '@/components/page/status-badge'
import { EditorDialog } from '@/components/page/editor-dialog'
import { Field, UnitInput } from '@/components/list/field'
import { Value } from '@/components/nutrition/value'
import { ListToolbar, LoadMoreButton } from '@/components/list/list-toolbar'
import { RecordList, RecordRow } from '@/components/list/record-list'
import { ArchiveActions, SheetFooter } from '@/components/list/sheet-footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { describePlan } from '@/features/energy/energy-format'
import { WhichOneIsYou } from '@/features/households/which-one-is-you'
import { youFirst } from '@/features/households/you-first'
import {
  GoalCalculator,
  type CalculatorChoice,
} from '@/features/energy/goal-calculator'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { formatAmount } from '@/i18n/format'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { isConvexConfigured } from '@/integrations/convex/config'
import { formatDate } from '@/lib/dates'
import { toErrorMessage, toLocalDateString } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import { messages } from './people.messages'

type Person = FunctionReturnType<typeof api.people.list>['page'][number]

const macroGoalFields = [
  { key: 'proteinGPerKg', unit: 'perKg' },
  { key: 'carbsG', unit: 'g' },
  { key: 'fatG', unit: 'g' },
] as const
const macroGoalLabel = {
  proteinGPerKg: 'proteinGoal',
  carbsG: 'carbsGoal',
  fatG: 'fatGoal',
} as const
type MacroGoalDraft = Record<(typeof macroGoalFields)[number]['key'], string>
const emptyMacroGoals: MacroGoalDraft = {
  proteinGPerKg: '',
  carbsG: '',
  fatG: '',
}

function macroGoalDraft(goals: Person['macroGoals']): MacroGoalDraft {
  return {
    proteinGPerKg: goals?.proteinGPerKg?.toString() ?? '',
    carbsG: goals?.carbsG?.toString() ?? '',
    fatG: goals?.fatG?.toString() ?? '',
  }
}

// Empty fields are no goal; no goals at all clears them.
function parseMacroGoals(draft: MacroGoalDraft) {
  const value = (text: string) => (text.trim() ? Number(text) : undefined)
  const goals = {
    proteinGPerKg: value(draft.proteinGPerKg),
    carbsG: value(draft.carbsG),
    fatG: value(draft.fatG),
  }
  return Object.values(goals).some((goal) => goal !== undefined) ? goals : null
}
const PAGE_SIZE = 20
export const Route = createFileRoute('/people')({
  ssr: false,
  // `edit` opens that person's editor, as Today's macro goals link does.
  validateSearch: (search: Record<string, unknown>): { edit?: string } =>
    typeof search.edit === 'string' ? { edit: search.edit } : {},
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
  const [macroGoals, setMacroGoals] = useState(emptyMacroGoals)
  // The weigh-in a protein goal follows is today's, as of opening the page.
  const [today] = useState(() => toLocalDateString(Date.now()))
  const [reason, setReason] = useState('')
  // The switch's unsaved choice; null follows the saved link, which can
  // change on another device while the editor is open.
  const [isMeChoice, setIsMeChoice] = useState<boolean | null>(null)
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
      youFirst(
        [...active.results, ...(showArchived ? archived.results : [])].sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
      ),
    [active.results, archived.results, showArchived],
  )
  const selected = useQuery(
    api.people.get,
    editing ? { personId: editing._id } : 'skip',
  )
  const { edit } = Route.useSearch()
  const navigate = Route.useNavigate()
  // Opens the linked person once their row loads, then drops the link so a
  // reload or Back doesn't reopen it.
  const [openedLink, setOpenedLink] = useState<string>()
  const linkedPerson =
    edit && edit !== openedLink
      ? people.find((person) => person._id === edit)
      : undefined
  if (linkedPerson) {
    setOpenedLink(linkedPerson._id)
    beginEdit(linkedPerson)
  }
  // A link to someone not among the loaded people (archived, or past the
  // first page) is dropped once the list has loaded.
  const linkUnusable =
    edit !== undefined &&
    active.status !== 'LoadingFirstPage' &&
    !people.some((person) => person._id === edit)
  useEffect(() => {
    if ((openedLink && edit === openedLink) || linkUnusable)
      void navigate({ search: {}, replace: true })
  }, [edit, linkUnusable, navigate, openedLink])
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
  const setLinkedToMe = useMutation(api.nutrition.setPersonLinkedToMe)
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
  const savedIsMe = live?.linkedAccount === 'you'
  // Another member's person can't be you, even if the switch was on.
  const isMe =
    live?.linkedAccount === 'other' ? false : (isMeChoice ?? savedIsMe)
  const linkPending = isMe !== savedIsMe
  const goalChanged = goal !== String(editing?.currentDailyGoalKcal ?? 2200)
  const macroGoalsChanged =
    JSON.stringify(macroGoals) !==
    JSON.stringify(macroGoalDraft(editing?.macroGoals))
  // A reason belongs to a goal change: hidden and never sent without one.
  const goalReason = goalChanged ? reason.trim() || undefined : undefined
  const profileDirty =
    name !== (editing?.name ?? '') ||
    goalChanged ||
    macroGoalsChanged ||
    plan !== null
  const dirty = editing !== undefined && (profileDirty || linkPending)
  // Another member's person: the household sees the goal, only they change it.
  const goalLocked = live?.linkedAccount === 'other'
  // What a protein goal per kg comes to today, from the latest weigh-in.
  const currentWeight = useQuery(
    api.weight.latestOnOrBefore,
    editing && !goalLocked ? { personId: editing._id, date: today } : 'skip',
  )
  const proteinPerKgGoal = Number(macroGoals.proteinGPerKg)
  const proteinGrams =
    currentWeight && macroGoals.proteinGPerKg.trim() && proteinPerKgGoal > 0
      ? proteinPerKgGoal * currentWeight.weightKg
      : undefined
  const linkGroup = useRef<HTMLElement>(null)
  // A pending link change grows the caption and footer past the sticky action
  // bar on a phone; once it renders, scroll the sheet to show the group.
  useEffect(() => {
    if (!linkPending) return
    let scroller = linkGroup.current?.parentElement
    while (
      scroller &&
      !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)
    )
      scroller = scroller.parentElement
    scroller?.scrollTo({ top: scroller.scrollHeight })
  }, [linkPending])

  // Linking this person moves the member's link from the one they are now,
  // even when that person is archived or not loaded, so Undo can move it back.
  const linkedToMe = useQuery(api.people.linkedToMe, {})
  const linkedElsewhere =
    linkedToMe && linkedToMe !== editing?._id
      ? {
          _id: linkedToMe,
          name:
            people.find((person) => person._id === linkedToMe)?.name ??
            t.anotherPerson,
        }
      : undefined

  // The switch saves with the form, so a pending change says what Save does.
  function linkNote() {
    const saved = savedIsMe
    if (isMe && !saved)
      return linkedElsewhere
        ? t.linkMovesOnSave(linkedElsewhere.name, name.trim() || t.thisPerson)
        : t.linkOnSave
    if (!isMe && saved) return t.unlinkOnSave
    if (isMe) return t.linkOn
    // An offer stays short; the pending caption names a move before Save.
    return editing ? t.linkOff : t.newLinkOff
  }

  // A link change ends in a toast with Undo, so a mistaken tap costs a tap.
  function withUndo(undo: () => Promise<unknown>) {
    return {
      action: {
        label: t.undo,
        onClick: () => {
          undo().catch((error: unknown) =>
            toast.error(toErrorMessage(error, locale)),
          )
        },
      },
    }
  }

  function save() {
    const displayName = name.trim()
    const previous = linkedElsewhere
    let personId: Id<'people'> | undefined = editing?._id
    const success = !linkPending
      ? editing
        ? t.updated
        : t.created
      : !isMe
        ? t.unlinkedToast(displayName)
        : previous
          ? t.linkMovedToast(previous.name, displayName)
          : editing
            ? t.linkedToast(displayName)
            : t.createdLinkedToast(displayName)
    const undo = async () => {
      if (!personId) return
      if (!isMe) await setLinkedToMe({ personId, linked: true })
      else if (previous)
        await setLinkedToMe({ personId: previous._id, linked: true })
      else await setLinkedToMe({ personId, linked: false })
    }
    void runAction(
      success,
      async () => {
        const effectiveDate = toLocalDateString(Date.now())
        // One write per save, with the link inside it, so a failure keeps
        // nothing and Save can simply be pressed again.
        const linkChange = linkPending ? isMe : undefined
        if (!editing)
          personId = await createPerson({
            name,
            currentDailyGoalKcal: Number(goal),
            effectiveDate,
            // The calculator's reason starts a new person's goal history.
            reason: reason.trim() || undefined,
            ...plan,
            macroGoals: parseMacroGoals(macroGoals) ?? undefined,
            linkedToMe: linkChange,
          })
        else if (profileDirty)
          await updatePerson({
            personId: editing._id,
            expectedEditRevision: editing.editRevision,
            name,
            // Another member's goal isn't ours to send, even unchanged.
            ...(!goalLocked && {
              goalKcal: Number(goal),
              reason: goalReason,
              ...plan,
              ...(macroGoalsChanged && {
                macroGoals: parseMacroGoals(macroGoals),
              }),
            }),
            effectiveDate,
            linkedToMe: linkChange,
          })
        // A link-only change leaves the profile and its edit revision alone.
        else if (linkChange !== undefined)
          await setLinkedToMe({ personId: editing._id, linked: linkChange })
        setEditing(undefined)
      },
      linkPending ? withUndo(undo) : undefined,
    )
  }

  function beginEdit(person: Person | null) {
    setEditing(person)
    setName(person?.name ?? '')
    setGoal(String(person?.currentDailyGoalKcal ?? 2200))
    setMacroGoals(macroGoalDraft(person?.macroGoals))
    setReason('')
    setPlan(null)
    setIsMeChoice(null)
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
        <WhichOneIsYou people={active.results} className="pb-3" />
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
              badge={
                person.linkedAccount === 'you' ? (
                  <StatusBadge status="You" className="shrink-0" />
                ) : undefined
              }
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
              save()
            }}
          >
            <fieldset disabled={isRunning} className="min-w-0 space-y-4 pb-6">
              <Field label={t.name} htmlFor="person-name">
                <Input
                  id="person-name"
                  aria-label={t.personName}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </Field>
              {goalLocked ? (
                // Read-only, not a disabled field, so the goal reads as set;
                // a group like the read-only ones below it.
                <section aria-labelledby="person-goal-title">
                  <h3 id="person-goal-title" className="group-label">
                    {t.dailyGoal}
                  </h3>
                  <p className="flex min-h-11 items-center justify-between gap-3 inset-group px-4">
                    <Value
                      value={live?.currentDailyGoalKcal ?? goal}
                      unit={t.kcalPerDay}
                    />
                    <Lock
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </p>
                  <p className="px-4 pt-1.5 type-footnote text-muted-foreground">
                    {t.goalLocked(live?.name ?? name)}
                  </p>
                </section>
              ) : (
                <Field
                  label={t.dailyGoal}
                  htmlFor="person-goal"
                  hint={
                    plan
                      ? t.savedWithGoal(describePlan(plan.goalPlan, locale))
                      : editing
                        ? t.goalHint
                        : t.goalHintNew
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
              )}
              {goalLocked ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCalculatingOn(toLocalDateString(Date.now()))
                  }
                >
                  <Calculator />
                  {t.helpMeChoose}
                </Button>
              )}
              {editing && !goalLocked && goalChanged ? (
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
              {goalLocked ? null : (
                <fieldset className="mt-1 min-w-0">
                  <legend className="group-label pb-1">{t.macroGoals}</legend>
                  <div className="grid grid-cols-3 gap-3">
                    {macroGoalFields.map(({ key, unit }) => (
                      <Field
                        key={key}
                        label={t[macroGoalLabel[key]]}
                        htmlFor={`person-${key}`}
                      >
                        <UnitInput
                          id={`person-${key}`}
                          unit={unit === 'perKg' ? t.perKgUnit : unit}
                          min="0"
                          step="any"
                          value={macroGoals[key]}
                          onChange={(event) =>
                            setMacroGoals((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <p className="mt-1.5 px-4 type-footnote text-muted-foreground tabular-nums">
                    {proteinGrams === undefined
                      ? t.macroGoalsHint
                      : t.proteinGoalGrams(
                          Math.round(proteinGrams).toString(),
                          formatAmount(currentWeight?.weightKg ?? 0, locale),
                        )}
                  </p>
                </fieldset>
              )}
              <section
                ref={linkGroup}
                aria-labelledby="person-account-title"
                className="pt-1"
              >
                <h3 id="person-account-title" className="group-label">
                  {t.linkedAccount}
                </h3>
                {live?.linkedAccount === 'other' ? (
                  // Read-only, like the locked goal: nothing here to change.
                  <p className="flex min-h-12 items-center justify-between gap-3 inset-group px-4 py-2.5 text-base">
                    {t.linkedToOther(live.name)}
                    <Lock
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  </p>
                ) : (
                  /* A switch is a settings-style cell: label and switch on the content edges. */
                  <div className="flex min-h-12 items-center justify-between gap-3 inset-group px-4 py-2.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <label
                          htmlFor="person-is-me"
                          className="text-base text-foreground"
                        >
                          {t.thisIsMe}
                        </label>
                        {/* A switch that is on but not saved must not pass for a saved link. */}
                        {linkPending ? (
                          <StatusBadge status="Unsaved" className="shrink-0" />
                        ) : null}
                      </div>
                      <p
                        id="person-is-me-note"
                        className={cn(
                          'mt-0.5 type-footnote text-pretty',
                          linkPending
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        {linkNote()}
                      </p>
                    </div>
                    <Switch
                      id="person-is-me"
                      aria-describedby="person-is-me-note"
                      checked={isMe}
                      // A span, so the fieldset's disabled doesn't reach it.
                      disabled={isRunning}
                      onCheckedChange={(checked) => {
                        // Back at the saved value, follow it again.
                        setIsMeChoice(checked === savedIsMe ? null : checked)
                      }}
                    />
                  </div>
                )}
                {/* Says what Save will leave; a pending unlink's caption warns. */}
                {linkPending && !isMe ? null : (
                  <p className="px-4 pt-1.5 type-footnote text-pretty text-muted-foreground">
                    {live?.linkedAccount === 'other'
                      ? t.weightPrivateTo(live.name)
                      : linkPending
                        ? t.weightPrivateAfterSave(name.trim() || t.thisPerson)
                        : savedIsMe
                          ? t.weightPrivate
                          : t.weightPrivacyOffer}
                  </p>
                )}
              </section>
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
