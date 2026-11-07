import { Link } from '@tanstack/react-router'
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Pencil,
  Plus,
} from 'lucide-react'
import {
  lazy,
  Suspense,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
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
import { subscribeLogMeal } from '@/features/meals/log-meal-request'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

// The title names the day relative to today; the date picker below it shows the date once.
function dayHeading(date: string, today: string) {
  const days = Math.round(
    (toTimestampFromDate(date) - toTimestampFromDate(today)) / 86_400_000,
  )
  if (days === 0) return 'Today'
  if (days === -1) return 'Yesterday'
  if (days === 1) return 'Tomorrow'
  // A bare weekday would read as this week, so other days name their date.
  return new Date(toTimestampFromDate(date)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
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
  const [today, setToday] = useState(() => toLocalDateString(Date.now()))
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
  // An installed app can resume on a later day. Keep Today current, and move a
  // dashboard still showing the old day to the new one.
  useEffect(() => {
    function refreshToday() {
      const current = toLocalDateString(Date.now())
      if (current === today) return
      setToday(current)
      if (date === today) {
        setDate(current)
        setOpenMealId(null)
      }
    }
    document.addEventListener('visibilitychange', refreshToday)
    window.addEventListener('focus', refreshToday)
    return () => {
      document.removeEventListener('visibilitychange', refreshToday)
      window.removeEventListener('focus', refreshToday)
    }
  }, [date, today])
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
  // The shell's Log button opens the editor for the day and person in view. A
  // request from another tab arrives before people load, so fall back to the
  // saved selection rather than '' (which would pick the first person).
  const onLogRequest = useEffectEvent(() =>
    openEditor({ personId: selected?._id ?? selectedPersonId, date }),
  )
  useEffect(
    () => (archived ? undefined : subscribeLogMeal(onLogRequest)),
    [archived],
  )
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
        title="Archived meals"
        header={
          archived ? undefined : (
            <div className="w-full">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {dayHeading(date, today)}
              </h1>
              {/* The date pill and the day controls share one row and one height. */}
              <div className="mt-2 flex items-center justify-between gap-2">
                <DatePicker
                  value={date}
                  onChange={selectDay}
                  ariaLabel="Day"
                  label={
                    <>
                      {new Date(toTimestampFromDate(date)).toLocaleDateString(
                        undefined,
                        { month: 'short', day: 'numeric', year: 'numeric' },
                      )}
                      <ChevronDown
                        aria-hidden="true"
                        className="size-3.5 text-muted-foreground"
                      />
                    </>
                  }
                  className="h-10 gap-1.5 rounded-full px-3 text-sm"
                />
                <div className="flex shrink-0 items-center gap-1">
                  {date !== today ? (
                    <Button
                      variant="outline"
                      className="h-10 rounded-full px-4"
                      onClick={() => selectDay(toLocalDateString(Date.now()))}
                    >
                      Today
                    </Button>
                  ) : null}
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-10 rounded-full"
                    aria-label="Previous day"
                    onClick={() => shiftDay(-1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    className="size-10 rounded-full"
                    aria-label="Next day"
                    onClick={() => shiftDay(1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </div>
          )
        }
        contentClassName="max-w-3xl"
      >
        {archived ? (
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
          </div>
        ) : null}
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
            // Phones log from the bottom navigation instead.
            <Button
              variant="outline"
              className="hidden md:inline-flex"
              disabled={!selected}
              onClick={() =>
                openEditor({ personId: selected?._id ?? '', date })
              }
            >
              <Plus className="h-4 w-4" />
              Log meal
            </Button>
          ) : null}
        </div>
        {!archived &&
        selected &&
        !loadingPerson &&
        meals.status !== 'LoadingFirstPage' &&
        meals.results.length === 0 ? (
          // Phones have no inline Log meal, so an empty day offers the action in place.
          <Button
            variant="outline"
            className="mt-3 h-11 w-full md:hidden"
            onClick={() => openEditor({ personId: selected._id, date })}
          >
            <Plus />
            Log meal
          </Button>
        ) : null}
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
              : 'Log meal'
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
            {item.sourceType !== 'fixedCalories' ? (
              <p className="text-xs text-muted-foreground">
                {`${item.consumedWeightGrams} g · ${item.kcalPer100Snapshot} kcal / 100 ${item.kcalBasisUnitSnapshot}`}
              </p>
            ) : item.foodIdentity?.servingLabel ? (
              <p className="text-xs text-muted-foreground">
                {`${item.servingCount ?? 1} ${item.foodIdentity.servingLabel}`}
              </p>
            ) : null}
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
        className="mt-3 flex flex-wrap items-center justify-end gap-2"
      >
        {/* One right-aligned group: overflow, then Archive, then Edit meal. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="size-10 text-muted-foreground"
                aria-label="More meal actions"
              />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
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
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          className="h-10 text-muted-foreground"
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
          <Archive />
          {meal.archived ? 'Restore' : 'Archive'}
        </Button>
        <Button variant="secondary" className="h-10" onClick={onEdit}>
          <Pencil />
          Edit meal
        </Button>
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
