import { createFileRoute, Link, useRouterState } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  Plus,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import {
  usePaginatedQuery,
  useQuery,
  useMutation,
} from '@/features/households/convex-hooks'
import { usePersonSelection } from '@/features/households/use-person-selection'
import { useDraftPersistenceIdentity } from '@/features/cooking/draft-persistence-identity'
import { readMealDraft, writeMealDraft } from '@/features/meals/meal-draft'
import { PageShell } from '@/components/page/page-shell'
import {
  ConfigMissingState,
  LoadingSkeletonState,
} from '@/components/page/page-states'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { EditorDialog } from '@/components/page/editor-dialog'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { isConvexConfigured } from '@/integrations/convex/config'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { cn } from '@/lib/utils'
import {
  toLocalDateString,
  toTimestampFromDate,
  toErrorMessage,
} from '@/lib/nutrition'

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

export const Route = createFileRoute('/')({
  ssr: false,
  component: MealDashboardPage,
  errorComponent: ({ error, reset }) => (
    <PageShell title="Daily intake">
      <p role="alert" className="mt-4 text-sm text-destructive">
        Daily intake could not be loaded: {toErrorMessage(error)}
      </p>
      <Button className="mt-3" variant="outline" onClick={reset}>
        Retry
      </Button>
    </PageShell>
  ),
})

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

function MealDashboardPage() {
  const search = useRouterState({ select: (state) => state.location.searchStr })
  if (!isConvexConfigured) return <ConfigMissingState />
  return <DayDashboard key={search} />
}

function DayDashboard() {
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
  const [showArchived, setShowArchived] = useState(false)
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
    selected
      ? { personId: selected._id, eatenOn: date, archived: showArchived }
      : 'skip',
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

  if (people.status === 'LoadingFirstPage')
    return <LoadingSkeletonState title="Today" />

  return (
    <>
      <PageShell
        title={date === today ? 'Today' : 'Day summary'}
        subtitle={new Date(toTimestampFromDate(date)).toLocaleDateString(
          undefined,
          { weekday: 'long', month: 'long', day: 'numeric' },
        )}
        icon={<Flame className="h-4 w-4" />}
        maxWidth="6xl"
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
          <Link
            to="/history"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            View history
          </Link>
        </div>
        {visiblePeople.length ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
            {visiblePeople.map((p) => (
              <button
                key={p._id}
                type="button"
                aria-pressed={p._id === selectedPersonId}
                aria-label={`${p.name}: ${p.consumedCalories.toFixed(0)} of ${p.goalKcal.toFixed(0)} kcal logged, ${Math.abs(p.remainingCalories).toFixed(0)} kcal ${p.remainingCalories < 0 ? 'over' : 'left'}`}
                onClick={() => {
                  setSelectedPersonId(p._id)
                  setOpenMealId(null)
                }}
                className={cn(
                  'min-w-0 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring',
                  p._id === selectedPersonId && 'border-primary',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.mealCount} meals
                  </span>
                </div>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
                  {Math.abs(p.remainingCalories).toFixed(0)}{' '}
                  <span className="block text-xs font-normal tracking-normal text-muted-foreground sm:inline">
                    kcal {p.remainingCalories < 0 ? 'over' : 'left'}
                  </span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                  {p.consumedCalories.toFixed(0)} / {p.goalKcal.toFixed(0)} kcal
                  logged
                </p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.min(100, (p.consumedCalories / p.goalKcal) * 100)}%`,
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            No active people.{' '}
            <Link to="/people" className="underline">
              Add a person and goal
            </Link>{' '}
            to start tracking.
          </p>
        )}
        {people.status === 'CanLoadMore' || people.status === 'LoadingMore' ? (
          <Button
            className="mt-3"
            variant="ghost"
            disabled={people.status === 'LoadingMore'}
            onClick={() => people.loadMore(PAGE_SIZE)}
          >
            Load more people
          </Button>
        ) : null}
        {selectedPersonId && !selected && pointPerson === null ? (
          <p role="status" className="mt-4 text-sm text-muted-foreground">
            The selected person is unavailable. Choose another person above.
          </p>
        ) : null}
        {draft && !editor ? (
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
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            {selected
              ? `${selected.name}’s ${showArchived ? 'archived ' : ''}meals`
              : 'Meals'}
          </h2>
          <Button
            variant="ghost"
            disabled={!selected}
            onClick={() => openEditor({ personId: selected?._id ?? '', date })}
          >
            <Plus className="h-4 w-4" />
            Add meal
          </Button>
        </div>
        <div className="mt-3 divide-y border-y">
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
          {selected && meals.status === 'LoadingFirstPage' ? (
            <p className="py-6 text-sm text-muted-foreground" role="status">
              Loading meals…
            </p>
          ) : null}
          {selected && meals.status === 'Exhausted' && !meals.results.length ? (
            <p className="py-8 text-sm text-muted-foreground">
              No {showArchived ? 'archived ' : ''}meals logged for this person
              and day.
            </p>
          ) : null}
        </div>
        {meals.status === 'CanLoadMore' || meals.status === 'LoadingMore' ? (
          <Button
            className="mt-3"
            variant="outline"
            disabled={meals.status === 'LoadingMore'}
            onClick={() => meals.loadMore(PAGE_SIZE)}
          >
            Load more meals
          </Button>
        ) : null}
        <div className="mt-4 flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
          <p>Open a meal to see portions and nutrition sources.</p>
          <button
            type="button"
            className="underline underline-offset-4"
            onClick={() => {
              setShowArchived(!showArchived)
              setOpenMealId(null)
            }}
          >
            {showArchived ? 'Active meals' : 'Archived meals'}
          </button>
        </div>
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
          <Suspense fallback={<p role="status">Loading editor…</p>}>
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
      <p className="pb-5 text-sm text-muted-foreground" role="status">
        Loading meal details…
      </p>
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
