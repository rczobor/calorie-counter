import { Link } from '@tanstack/react-router'
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  Plus,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  usePaginatedQuery,
  useQuery,
  useMutation,
} from '@/features/households/convex-hooks'
import { usePersonSelection } from '@/features/households/use-person-selection'
import { useDraftPersistenceIdentity } from '@/features/cooking/draft-persistence-identity'
import { readMealDraft, writeMealDraft } from '@/features/meals/meal-draft'
import { InstallEntry } from '@/features/install/install-entry'
import { rememberLoggedMeal } from '@/features/install/install-provider'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { PageShell } from '@/components/page/page-shell'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { EditorDialog } from '@/components/page/editor-dialog'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadingRows, EditorSkeleton } from '@/components/page/loading-content'
import { DatePicker } from '@/components/ui/date-picker'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { cn } from '@/lib/utils'
import { toLocalDateString, toTimestampFromDate } from '@/lib/nutrition'

const MealEditor = lazy(async () => ({
  default: (await import('@/features/meals/meal-editor')).MealEditor,
}))
const PAGE_SIZE = 20
type Meal = FunctionReturnType<typeof api.meals.listForDay>['page'][number]
type EditorRequest = {
  mealId?: Id<'meals'>
  personId: Id<'people'> | ''
  date: string
  resume?: boolean
}

function readLinkedDate() {
  const value = new URLSearchParams(window.location.search).get('date')
  if (value) {
    try {
      toTimestampFromDate(value)
      return value
    } catch {
      /* Invalid links use today. */
    }
  }
  return toLocalDateString(Date.now())
}

export function DayDashboard({ archived = false }: { archived?: boolean }) {
  const { userId } = useDraftPersistenceIdentity()
  const [today] = useState(() => toLocalDateString(Date.now()))
  const [date, setDate] = useState(readLinkedDate)
  const [selectedPersonId, setSelectedPersonId] = usePersonSelection(
    userId,
    () => {
      const linked = new URLSearchParams(window.location.search).get('personId')
      return linked && /^[a-z0-9]{20,64}$/i.test(linked)
        ? (linked as Id<'people'>)
        : undefined
    },
  )
  const [showHousehold, setShowHousehold] = useState(false)
  const householdButton = useRef<HTMLButtonElement>(null)
  const [openMealId, setOpenMealId] = useState<Id<'meals'> | null>(null)
  const [editor, setEditor] = useState<EditorRequest | null>(null)
  const [editorPending, setEditorPending] = useState(false)
  const [draft, setDraft] = useState(() =>
    userId ? readMealDraft(userId) : null,
  )
  const [discardDraft, setDiscardDraft] = useState(false)
  const [draftConflict, setDraftConflict] = useState(false)
  const people = usePaginatedQuery(
    api.people.listForDay,
    { archived: false, eatenOn: date },
    { initialNumItems: PAGE_SIZE },
  )
  const pointPerson = useQuery(
    api.people.get,
    selectedPersonId && !people.results.some((p) => p._id === selectedPersonId)
      ? { personId: selectedPersonId }
      : 'skip',
  )
  useEffect(() => {
    if (!selectedPersonId && people.results[0])
      setSelectedPersonId(people.results[0]._id)
  }, [people.results, selectedPersonId, setSelectedPersonId])
  const loadedSelected = people.results.find((p) => p._id === selectedPersonId)
  const selected = loadedSelected ?? pointPerson
  const summary = useQuery(
    api.meals.getDayNutrition,
    selected && !loadedSelected
      ? { personId: selected._id, eatenOn: date }
      : 'skip',
  )
  const meals = usePaginatedQuery(
    api.meals.listForDay,
    selected ? { personId: selected._id, eatenOn: date, archived } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )

  function closeEditor() {
    setEditor(null)
    setEditorPending(false)
    setDraft(userId ? readMealDraft(userId) : null)
    setDraftConflict(false)
  }
  function openEditor(request: EditorRequest) {
    const current = userId ? readMealDraft(userId) : null
    setDraft(current)
    if (current && !request.resume) {
      setDraftConflict(true)
      return
    }
    setEditor(request)
  }
  function selectDay(next: string) {
    setDate(next)
    setOpenMealId(null)
  }
  function shiftDay(amount: number) {
    const next = new Date(toTimestampFromDate(date))
    next.setDate(next.getDate() + amount)
    selectDay(toLocalDateString(next.getTime()))
  }
  const visiblePeople = [...people.results]
  if (selected && !visiblePeople.some((p) => p._id === selected._id) && summary)
    visiblePeople.push({ ...selected, ...summary, _id: selected._id })

  const focused = visiblePeople.find((p) => p._id === selectedPersonId)
  const hasLoggedMeal = focused !== undefined && focused.mealCount > 0
  useEffect(() => {
    if (!archived && hasLoggedMeal) rememberLoggedMeal()
  }, [archived, hasLoggedMeal])
  const overGoal = focused !== undefined && focused.remainingCalories < 0
  const atGoal = focused?.remainingCalories === 0
  const loadingPerson =
    people.status === 'LoadingFirstPage' ||
    (Boolean(selectedPersonId) &&
      ((pointPerson === undefined && !loadedSelected) ||
        Boolean(selected && !loadedSelected && !summary)))

  return (
    <>
      <PageShell
        breadcrumbs={
          archived ? (
            <SettingsBreadcrumbs current="Archived meals" />
          ) : undefined
        }
        title={
          archived ? 'Archived meals' : date === today ? 'Today' : 'Day summary'
        }
        subtitle={
          archived
            ? undefined
            : new Date(toTimestampFromDate(date)).toLocaleDateString(
                undefined,
                { weekday: 'long', month: 'long', day: 'numeric' },
              )
        }
        icon={archived ? undefined : <Flame className="h-4 w-4" />}
        contentClassName="max-w-3xl"
      >
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Previous day"
              onClick={() => shiftDay(-1)}
            >
              <ChevronLeft />
            </Button>
            <DatePicker value={date} onChange={selectDay} ariaLabel="Day" />
            <Button
              size="icon"
              variant="ghost"
              aria-label="Next day"
              onClick={() => shiftDay(1)}
            >
              <ChevronRight />
            </Button>
            {date !== today ? (
              <Button
                variant="ghost"
                onClick={() => selectDay(toLocalDateString(Date.now()))}
              >
                Today
              </Button>
            ) : null}
          </div>
          {archived ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                ariaLabel="Person"
                placeholder={
                  loadingPerson ? 'Loading people' : 'Choose a person'
                }
                disabled={people.status === 'LoadingFirstPage'}
                options={visiblePeople.map((person) => ({
                  value: person._id,
                  label: person.name,
                }))}
                value={selected?._id ?? null}
                onValueChange={(value) => {
                  if (value) {
                    setSelectedPersonId(value)
                    setOpenMealId(null)
                  }
                }}
              />
              {people.status === 'CanLoadMore' ||
              people.status === 'LoadingMore' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={people.status === 'LoadingMore'}
                  onClick={() => people.loadMore(PAGE_SIZE)}
                >
                  Load more people
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {archived && !loadingPerson && !selected ? (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            {selectedPersonId
              ? 'This person is unavailable. Choose another person.'
              : 'No active people.'}
          </p>
        ) : null}
        {!archived ? (
          <section
            className="mt-5 rounded-xl border bg-card p-5 sm:p-6"
            aria-label={focused ? `${focused.name}’s intake` : 'Daily intake'}
            aria-busy={loadingPerson}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">
                {selected?.name ??
                  (loadingPerson ? (
                    <Skeleton className="h-5 w-28" />
                  ) : (
                    'Choose a person'
                  ))}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                ref={householdButton}
                aria-expanded={showHousehold}
                aria-controls="household-intake"
                onClick={() => setShowHousehold(!showHousehold)}
              >
                Household intake{' '}
                <ChevronDown
                  className={cn(
                    'size-4 transition-transform motion-reduce:transition-none',
                    showHousehold && 'rotate-180',
                  )}
                />
              </Button>
            </div>
            {focused ? (
              <>
                <p
                  className={cn(
                    'mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 tabular-nums',
                    overGoal
                      ? 'text-[#a0445a] dark:text-[#e4a5b4]'
                      : 'text-teal-700 dark:text-teal-300',
                  )}
                >
                  <span className="text-5xl font-semibold tracking-tight sm:text-6xl">
                    {overGoal ? '+' : ''}
                    {Math.abs(focused.remainingCalories).toFixed(0)}
                    {atGoal ? (
                      <span className="ml-2 text-base font-normal tracking-normal">
                        kcal
                      </span>
                    ) : null}
                  </span>{' '}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium',
                      overGoal
                        ? 'bg-[#a0445a]/10 dark:bg-[#e4a5b4]/10'
                        : 'bg-teal-600/10 dark:bg-teal-400/10',
                    )}
                  >
                    {overGoal ? (
                      <ArrowUpRight aria-hidden="true" className="size-4" />
                    ) : atGoal ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : (
                      <ArrowDownRight aria-hidden="true" className="size-4" />
                    )}
                    {atGoal
                      ? 'Goal reached'
                      : `kcal ${overGoal ? 'over' : 'left'}`}
                  </span>
                </p>
                <p className="mt-3 text-sm text-muted-foreground tabular-nums">
                  {focused.consumedCalories.toFixed(0)} /{' '}
                  {focused.goalKcal.toFixed(0)} kcal logged
                </p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      overGoal
                        ? 'bg-[#b96d81] dark:bg-[#bd7488]'
                        : 'bg-teal-600 dark:bg-teal-400',
                    )}
                    style={{
                      width: `${Math.min(100, focused.goalKcal > 0 ? (focused.consumedCalories / focused.goalKcal) * 100 : 0)}%`,
                    }}
                  />
                </div>
              </>
            ) : loadingPerson ? (
              <div
                role="status"
                aria-label="Loading daily intake"
                className="mt-4"
              >
                <Skeleton className="h-12 w-56 sm:h-15" />
                <Skeleton className="mt-3 h-5 w-44" />
                <Skeleton className="mt-5 h-2 w-full" />
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                {selectedPersonId ? (
                  'The selected person is unavailable. Choose another person in Household intake.'
                ) : (
                  <>
                    No active people.{' '}
                    <Link to="/people" className="underline">
                      Add a person and goal
                    </Link>{' '}
                    to start tracking.
                  </>
                )}
              </p>
            )}
          </section>
        ) : null}
        {!archived && showHousehold ? (
          <section
            id="household-intake"
            aria-label="Household intake"
            className="mt-3 rounded-xl border p-4"
          >
            <p className="mb-3 text-xs text-muted-foreground">
              Choose whose intake to focus on. Your choice stays on this device.
            </p>
            {people.status === 'LoadingFirstPage' ? (
              <LoadingRows label="Loading household intake" />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {visiblePeople.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    aria-pressed={p._id === selectedPersonId}
                    aria-label={`${p.name}: ${p.consumedCalories.toFixed(0)} of ${p.goalKcal.toFixed(0)} kcal logged, ${p.remainingCalories === 0 ? 'goal reached' : `${Math.abs(p.remainingCalories).toFixed(0)} kcal ${p.remainingCalories < 0 ? 'over' : 'left'}`}`}
                    onClick={() => {
                      setSelectedPersonId(p._id)
                      setOpenMealId(null)
                      setShowHousehold(false)
                      householdButton.current?.focus()
                    }}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring',
                      p._id === selectedPersonId && 'border-primary',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2 font-medium">
                      {p.name}
                      {p._id === selectedPersonId ? (
                        <Check aria-hidden="true" className="size-4 shrink-0" />
                      ) : null}
                    </span>
                    <span className="text-right text-xs text-muted-foreground tabular-nums">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 font-medium',
                          p.remainingCalories < 0
                            ? 'text-[#a0445a] dark:text-[#e4a5b4]'
                            : 'text-teal-700 dark:text-teal-300',
                        )}
                      >
                        {p.remainingCalories < 0 ? (
                          <ArrowUpRight
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        ) : p.remainingCalories === 0 ? (
                          <Check aria-hidden="true" className="size-3.5" />
                        ) : (
                          <ArrowDownRight
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        )}
                        {p.remainingCalories < 0 ? '+' : ''}
                        {Math.abs(p.remainingCalories).toFixed(0)} kcal{' '}
                        {p.remainingCalories < 0
                          ? 'over'
                          : p.remainingCalories === 0
                            ? '· Goal reached'
                            : 'left'}
                      </span>
                      <span className="mt-1 block">
                        {p.consumedCalories.toFixed(0)} /{' '}
                        {p.goalKcal.toFixed(0)} logged
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {people.status === 'CanLoadMore' ||
            people.status === 'LoadingMore' ? (
              <Button
                className="mt-3"
                variant="ghost"
                disabled={people.status === 'LoadingMore'}
                aria-busy={people.status === 'LoadingMore'}
                onClick={() => people.loadMore(PAGE_SIZE)}
              >
                Load more people
              </Button>
            ) : null}
          </section>
        ) : null}
        {!archived && draft && !editor ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
            <p className="text-sm" role="status">
              {draftConflict
                ? 'Continue or discard your existing draft before starting another meal.'
                : 'You have an unsaved meal draft in this tab.'}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  openEditor({
                    personId: draft.selectedPersonId,
                    date: draft.mealDate,
                    resume: true,
                  })
                }
              >
                Continue draft
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDiscardDraft(true)}
              >
                Discard
              </Button>
            </div>
          </div>
        ) : null}
        <InstallEntry
          variant="suggestion"
          eligible={
            !archived &&
            date === today &&
            !loadingPerson &&
            meals.status !== 'LoadingFirstPage' &&
            Boolean(selected) &&
            !editor &&
            !draft &&
            !discardDraft &&
            !openMealId
          }
        />
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            {selected
              ? `${selected.name}’s ${archived ? 'archived ' : ''}meals`
              : 'Meals'}
          </h2>
          {!archived ? (
            <Button
              variant="ghost"
              disabled={!selected}
              onClick={() =>
                openEditor({ personId: selected?._id ?? '', date })
              }
            >
              <Plus className="h-4 w-4" />
              Add meal
            </Button>
          ) : null}
        </div>
        <div
          className={cn(
            'mt-3 divide-y',
            (meals.results.length > 0 ||
              loadingPerson ||
              (selected && meals.status === 'LoadingFirstPage')) &&
              'min-h-24 border-y',
          )}
          aria-busy={
            loadingPerson ||
            Boolean(selected && meals.status === 'LoadingFirstPage')
          }
        >
          {meals.results.map((meal) => (
            <div key={meal._id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 py-5 text-left focus-visible:outline-2 focus-visible:outline-ring"
                aria-expanded={openMealId === meal._id}
                onClick={() =>
                  setOpenMealId(openMealId === meal._id ? null : meal._id)
                }
              >
                <span className="min-w-0">
                  <span className="block font-medium">
                    {meal.name?.trim() || 'Meal'}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {meal.itemCount} food{meal.itemCount === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-sm tabular-nums">
                    {meal.totalCalories.toFixed(0)}{' '}
                    <span className="text-xs text-muted-foreground">kcal</span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted-foreground',
                      openMealId === meal._id && 'rotate-180',
                    )}
                  />
                </span>
              </button>
              {openMealId === meal._id ? (
                <MealDetails
                  meal={meal}
                  onEdit={() =>
                    openEditor({
                      mealId: meal._id,
                      personId: meal.personId,
                      date: meal.eatenOn,
                    })
                  }
                />
              ) : null}
            </div>
          ))}
          {loadingPerson ||
          (selected && meals.status === 'LoadingFirstPage') ? (
            <LoadingRows
              label="Loading meals"
              rows={focused ? Math.min(3, Math.max(1, focused.mealCount)) : 1}
            />
          ) : null}
        </div>
        {meals.status === 'CanLoadMore' || meals.status === 'LoadingMore' ? (
          <Button
            className="mt-3"
            variant="outline"
            disabled={meals.status === 'LoadingMore'}
            aria-busy={meals.status === 'LoadingMore'}
            onClick={() => meals.loadMore(PAGE_SIZE)}
          >
            Load more meals
          </Button>
        ) : null}
      </PageShell>
      {editor ? (
        <EditorDialog
          title={
            editor.mealId || (draft?.editingMealId && editor.resume)
              ? 'Edit meal'
              : 'Add meal'
          }
          onClose={closeEditor}
          pending={editorPending}
        >
          <Suspense fallback={<EditorSkeleton />}>
            <MealEditor
              initialPersonId={editor.personId}
              initialDate={editor.date}
              mealId={editor.mealId}
              resumeDraft={editor.resume}
              onDone={closeEditor}
              onPendingChange={setEditorPending}
            />
          </Suspense>
        </EditorDialog>
      ) : null}
      <ConfirmDestructiveDialog
        open={discardDraft}
        onOpenChange={setDiscardDraft}
        title="Discard meal draft?"
        description="Your unsaved changes in this tab will be lost."
        confirmLabel="Discard draft"
        onConfirm={() => {
          if (userId) writeMealDraft(userId, null)
          setDraft(null)
          setDiscardDraft(false)
          setDraftConflict(false)
        }}
      />
    </>
  )
}

function MealDetails({ meal, onEdit }: { meal: Meal; onEdit: () => void }) {
  const detail = useQuery(api.meals.getDetail, { mealId: meal._id })
  const archive = useMutation(api.nutrition.setMealArchived)
  const remove = useMutation(api.nutrition.deleteMeal)
  const {
    isRunning,
    runAction,
    confirmAndRunAction,
    isConfirmDialogOpen,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
    pendingConfirmation,
  } = useConfirmableAction()
  if (detail === undefined)
    return (
      <LoadingRows
        label="Loading meal details"
        rows={Math.min(3, Math.max(1, meal.itemCount))}
        className="pb-5"
      />
    )
  if (!detail)
    return (
      <p className="pb-5 text-sm text-muted-foreground">
        This meal is no longer available.
      </p>
    )
  return (
    <div className="pb-5">
      <div className="divide-y overflow-hidden rounded-lg bg-card">
        {detail.items.map((item) => (
          <div
            key={item._id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 p-3"
          >
            <p className="text-sm font-medium">{item.nameSnapshot}</p>
            <p className="text-sm tabular-nums">
              {item.caloriesSnapshot.toFixed(0)} kcal
            </p>
            <p className="text-xs text-muted-foreground">
              {item.sourceType === 'fixedCalories'
                ? 'Fixed calorie entry'
                : `${item.consumedWeightGrams} g · ${item.kcalPer100Snapshot} kcal / 100 ${item.kcalBasisUnitSnapshot}`}
            </p>
            <div className="col-span-full">
              <EstimateNotice provenance={item.nutritionProvenance} />
              {item.notes ? (
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  {item.notes}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {detail.meal.notes ? (
        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {detail.meal.notes}
        </p>
      ) : null}
      <fieldset
        disabled={isRunning}
        className="mt-3 flex flex-wrap justify-end gap-2"
      >
        <Button size="sm" variant="outline" onClick={onEdit}>
          Edit meal
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void runAction(
              meal.archived ? 'Meal restored.' : 'Meal archived.',
              () =>
                archive({
                  mealId: meal._id,
                  expectedEditRevision: detail.meal.editRevision,
                  archived: !meal.archived,
                }),
            )
          }
        >
          {meal.archived ? 'Restore' : 'Archive'}
        </Button>
        <details>
          <summary className="cursor-pointer rounded-md px-3 py-2 text-xs text-muted-foreground">
            More
          </summary>
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
              confirmAndRunAction(
                'Delete this meal permanently?',
                'Meal deleted.',
                () =>
                  remove({
                    mealId: meal._id,
                    expectedEditRevision: detail.meal.editRevision,
                  }),
              )
            }
          >
            Delete permanently
          </Button>
        </details>
      </fieldset>
      <ConfirmDestructiveDialog
        open={isConfirmDialogOpen}
        onOpenChange={handleConfirmDialogOpenChange}
        onConfirm={confirmPendingAction}
        description={pendingConfirmation?.message}
        disabled={isRunning}
      />
    </div>
  )
}
