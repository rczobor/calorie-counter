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
import { StatusBadge } from '@/components/page/status-badge'
import { WhichOneIsYou } from '@/features/households/which-one-is-you'
import { youFirst } from '@/features/households/you-first'
import { PersonPicker } from '@/features/households/person-picker'
import { usePersonSelection } from '@/features/households/use-person-selection'
import { useDraftPersistenceIdentity } from '@/features/cooking/draft-persistence-identity'
import { readMealDraft, writeMealDraft } from '@/features/meals/meal-draft'
import { subscribeLogMeal } from '@/features/meals/log-meal-request'
import { WeightGlance } from '@/features/weight/weight-glance'
import { TodayHint } from '@/features/hints/hints'
import { rememberLoggedMeal } from '@/features/install/install-provider'
import { IntakeBar } from '@/features/meals/intake-bar'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { PageShell } from '@/components/page/page-shell'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { EditorDialog } from '@/components/page/editor-dialog'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import { Balance, Value } from '@/components/nutrition/value'
import { Button } from '@/components/ui/button'
import { LoadingRows, EditorSkeleton } from '@/components/page/loading-content'
import {
  IntakeSkeleton,
  MEAL_ROW_HEIGHT,
  PersonPickerPlaceholder,
  WeightRowPlaceholder,
} from '@/components/page/page-placeholder'
import { DatePicker } from '@/components/ui/date-picker'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { formatDate, linkedDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  formatKcal,
  toLocalDateString,
  toTimestampFromDate,
} from '@/lib/nutrition'
import { formatAmount } from '@/i18n/format'
import { useLocale, type Locale } from '@/i18n/locale'
import { messages } from './day-dashboard.messages'

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
function dayHeading(date: string, today: string, locale: Locale) {
  const t = messages[locale]
  const days = Math.round(
    (toTimestampFromDate(date) - toTimestampFromDate(today)) / 86_400_000,
  )
  if (days === 0) return t.today
  if (days === -1) return t.yesterday
  if (days === 1) return t.tomorrow
  // A bare weekday would read as this week, so other days name their date.
  return formatDate(date, locale)
}

// The logged and goal figures stand out from the words around them.
const figure = (kcal: number) => (
  <span className="font-semibold text-foreground">{kcal.toFixed(0)}</span>
)

// Invalid links use today.
function readLinkedDate() {
  return (
    linkedDate(new URLSearchParams(window.location.search).get('date')) ??
    toLocalDateString(Date.now())
  )
}

export function DayDashboard({ archived = false }: { archived?: boolean }) {
  const locale = useLocale()
  const t = messages[locale]
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
    // A device without a saved choice opens on the member's own person.
    const first = youFirst(people.results)[0]
    if (!selectedPersonId && first) setSelectedPersonId(first._id)
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
  const loadedPeople = [...people.results]
  if (selected && !loadedPeople.some((p) => p._id === selected._id) && summary)
    loadedPeople.push({ ...selected, ...summary, _id: selected._id })
  const visiblePeople = youFirst(loadedPeople)

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
            <SettingsBreadcrumbs current={t.archivedMeals} />
          ) : undefined
        }
        title={t.archivedMeals}
        header={
          archived ? undefined : (
            <div className="w-full">
              {/* The title row holds the person picker, as History's does. */}
              <div className="flex items-center justify-between gap-3">
                <h1 className="min-w-0 type-large-title text-foreground">
                  {dayHeading(date, today, locale)}
                </h1>
                {people.status === 'LoadingFirstPage' ? (
                  <PersonPickerPlaceholder label={t.loadingPeople} />
                ) : visiblePeople.length > 0 ? (
                  <PersonPicker
                    ref={householdButton}
                    name={selected?.name}
                    you={selected?.linkedAccount === 'you'}
                    placeholder={t.choosePerson}
                    expanded={showHousehold}
                    controls="household-intake"
                    onToggle={() => setShowHousehold(!showHousehold)}
                  />
                ) : null}
              </div>
              {/* The date pill and the day controls share one row and one
                  height: the pill on the left, Today and the arrows on the
                  right. Text capsules padded 12px and 6px gaps fit the
                  widest pill ("Wed, May 20, 2026") beside Today at 390px; a
                  narrower phone wraps the controls under the pill instead of
                  scrolling sideways. */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5">
                <DatePicker
                  variant="chip"
                  value={date}
                  onChange={selectDay}
                  ariaLabel={t.day}
                  label={formatDate(date, locale, { year: 'always' })}
                />
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {/* Today appears before the arrows, so they never move. */}
                  {date !== today ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="px-3"
                      onClick={() => selectDay(toLocalDateString(Date.now()))}
                    >
                      {t.today}
                    </Button>
                  ) : null}
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={t.previousDay}
                    onClick={() => shiftDay(-1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={t.nextDay}
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
            <div className="flex items-center gap-2">
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t.previousDay}
                onClick={() => shiftDay(-1)}
              >
                <ChevronLeft />
              </Button>
              <DatePicker
                variant="chip"
                value={date}
                onChange={selectDay}
                ariaLabel={t.day}
              />
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t.nextDay}
                onClick={() => shiftDay(1)}
              >
                <ChevronRight />
              </Button>
              {date !== today ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="px-3"
                  onClick={() => selectDay(toLocalDateString(Date.now()))}
                >
                  {t.today}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PersonPicker
                placeholder={loadingPerson ? t.loadingPeople : t.choosePerson}
                disabled={people.status === 'LoadingFirstPage'}
                options={visiblePeople.map((person) => ({
                  value: person._id,
                  label: person.name,
                  you: person.linkedAccount === 'you',
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
                  {t.loadMorePeople}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {archived && !loadingPerson && !selected ? (
          <p role="status" className="mt-4 type-subhead text-muted-foreground">
            {selectedPersonId ? t.personUnavailable : t.noActivePeople}
          </p>
        ) : null}
        {!archived && showHousehold ? (
          <section
            id="household-intake"
            aria-label={t.householdIntake}
            className="mt-5"
          >
            {people.status === 'LoadingFirstPage' ? (
              <LoadingRows
                label={t.loadingHouseholdIntake}
                className="inset-group px-4"
              />
            ) : (
              // A picker list: the checkmark and tinted row mark whose intake
              // is in focus, apart from the nutrition colours.
              <div className="inset-group inset-rows [--row-inset:3rem]">
                {visiblePeople.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    aria-pressed={p._id === selectedPersonId}
                    aria-label={t.personSummary(
                      p.linkedAccount === 'you' ? t.nameYou(p.name) : p.name,
                      p.consumedCalories.toFixed(0),
                      p.goalKcal.toFixed(0),
                      p.remainingCalories === 0
                        ? t.summaryGoalReached
                        : p.remainingCalories < 0
                          ? t.kcalOver(Math.abs(p.remainingCalories).toFixed(0))
                          : t.kcalLeft(
                              Math.abs(p.remainingCalories).toFixed(0),
                            ),
                    )}
                    onClick={() => {
                      setSelectedPersonId(p._id)
                      setOpenMealId(null)
                      setShowHousehold(false)
                      householdButton.current?.focus()
                    }}
                    className={cn(
                      'flex min-h-15 w-full items-center gap-3 py-2.5 pr-4 pl-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                      p._id === selectedPersonId &&
                        'bg-accent shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--foreground)_45%,transparent)]',
                    )}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center text-foreground">
                      {p._id === selectedPersonId ? (
                        <Check
                          aria-hidden="true"
                          className="size-5"
                          strokeWidth={2.5}
                        />
                      ) : null}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate text-base">{p.name}</span>
                      {p.linkedAccount === 'you' ? (
                        <StatusBadge status="You" className="shrink-0" />
                      ) : null}
                    </span>
                    <span className="text-right type-footnote text-muted-foreground tabular-nums">
                      <Balance
                        remaining={p.remainingCalories}
                        className="type-subhead"
                      />
                      <span className="mt-0.5 block">
                        {t.loggedOfGoal(
                          figure(p.consumedCalories),
                          figure(p.goalKcal),
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="px-4 pt-1.5 type-footnote text-muted-foreground">
              {t.householdHint}
            </p>
            {people.status === 'CanLoadMore' ||
            people.status === 'LoadingMore' ? (
              <Button
                className="mt-2"
                variant="ghost"
                size="sm"
                disabled={people.status === 'LoadingMore'}
                aria-busy={people.status === 'LoadingMore'}
                onClick={() => people.loadMore(PAGE_SIZE)}
              >
                {t.loadMorePeople}
              </Button>
            ) : null}
            <WhichOneIsYou people={people.results} className="mt-5" />
          </section>
        ) : null}
        {!archived ? (
          <section
            className="mt-5 inset-group px-4 pt-4 pb-4"
            aria-label={focused ? t.personIntake(focused.name) : t.dailyIntake}
            aria-busy={loadingPerson}
          >
            {focused ? (
              // The balance, the bar, then the logged line, at every width.
              <>
                <p
                  className={cn(
                    'flex flex-wrap items-center gap-x-3 gap-y-2 tabular-nums',
                    overGoal ? 'text-kcal-over' : 'text-kcal-left',
                  )}
                >
                  <span className="type-display">
                    {overGoal ? '+' : ''}
                    {Math.abs(focused.remainingCalories).toFixed(0)}
                    {atGoal ? (
                      <span className="ml-1.5 type-title font-semibold tracking-normal">
                        kcal
                      </span>
                    ) : null}
                  </span>{' '}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full py-1 pr-3 pl-2.5 type-subhead font-semibold',
                      overGoal
                        ? 'bg-kcal-over-surface'
                        : 'bg-kcal-left-surface',
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
                      ? t.goalReached
                      : overGoal
                        ? t.balanceOver
                        : t.balanceLeft}
                  </span>
                </p>
                <IntakeBar
                  consumed={focused.consumedCalories}
                  goal={focused.goalKcal}
                  className="mt-4"
                />
                <p className="mt-2.5 type-subhead text-muted-foreground tabular-nums">
                  {t.loggedOfGoal(
                    figure(focused.consumedCalories),
                    figure(focused.goalKcal),
                  )}
                </p>
              </>
            ) : loadingPerson ? (
              <div role="status" aria-label={t.loadingDailyIntake}>
                <IntakeSkeleton />
              </div>
            ) : (
              <p className="type-subhead text-muted-foreground">
                {selectedPersonId
                  ? t.selectedPersonUnavailable
                  : t.startTracking((text) => (
                      <Link
                        to="/people"
                        className="font-medium text-foreground underline underline-offset-4"
                      >
                        {text}
                      </Link>
                    ))}
              </p>
            )}
          </section>
        ) : null}
        {!archived && selected && !loadingPerson ? (
          <div className="mt-3">
            <WeightGlance
              personId={selected._id}
              personName={selected.name}
              date={date}
              today={today}
              isPrivate={selected.linkedAccount === 'other'}
            />
          </div>
        ) : !archived && loadingPerson ? (
          <WeightRowPlaceholder />
        ) : null}
        {!archived && draft && !editor ? (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 inset-group py-3 pr-3 pl-4">
            <p className="type-subhead" role="status">
              {draftConflict ? t.draftConflict : t.unsavedDraft}
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
                {t.continueDraft}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDiscardDraft(true)}
              >
                {t.discard}
              </Button>
            </div>
          </div>
        ) : null}
        <TodayHint
          today={today}
          visible={
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
          <h2 className="type-title">
            {selected
              ? archived
                ? selected.linkedAccount === 'you'
                  ? t.yourArchivedMeals
                  : t.personArchivedMeals(selected.name)
                : selected.linkedAccount === 'you'
                  ? t.yourMeals
                  : t.personMeals(selected.name)
              : t.meals}
          </h2>
          {!archived ? (
            // Phones log from the bottom navigation instead.
            <Button
              size="sm"
              className="hidden md:inline-flex"
              disabled={!selected}
              onClick={() =>
                openEditor({ personId: selected?._id ?? '', date })
              }
            >
              <Plus aria-hidden="true" />
              {t.logMeal}
            </Button>
          ) : null}
        </div>
        {!archived &&
        selected &&
        !loadingPerson &&
        meals.status !== 'LoadingFirstPage' &&
        meals.results.length === 0 ? (
          // Phones have no inline Log meal, so an empty day offers the action in
          // place: an "add" row in the tint, as in an iOS list.
          <div className="mt-3 inset-group md:hidden">
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left text-base font-medium text-primary transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              onClick={() => openEditor({ personId: selected._id, date })}
            >
              <Plus aria-hidden="true" className="size-5" strokeWidth={2.25} />
              {t.logMeal}
            </button>
          </div>
        ) : null}
        {archived &&
        selected &&
        !loadingPerson &&
        meals.status !== 'LoadingFirstPage' &&
        meals.results.length === 0 ? (
          <p className="mt-3 inset-group px-4 py-3.5 type-subhead text-muted-foreground">
            {t.noArchivedMeals}
          </p>
        ) : null}
        <div
          className={cn(
            'mt-3',
            (meals.results.length > 0 ||
              loadingPerson ||
              (selected && meals.status === 'LoadingFirstPage')) &&
              'inset-group inset-rows',
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
                className="flex min-h-15 w-full items-center gap-3 py-3 pr-3.5 pl-4 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                aria-expanded={openMealId === meal._id}
                onClick={() =>
                  setOpenMealId(openMealId === meal._id ? null : meal._id)
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-base">
                    {meal.name?.trim() || t.meal}
                  </span>
                  <span className="mt-0.5 block type-footnote text-muted-foreground">
                    {t.foodCount(meal.itemCount)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <Value value={meal.totalCalories.toFixed(0)} />
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      'size-4 text-muted-foreground transition-transform motion-reduce:transition-none',
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
              label={t.loadingMeals}
              rows={focused ? Math.min(3, Math.max(1, focused.mealCount)) : 3}
              inset
              rowClassName={MEAL_ROW_HEIGHT}
            />
          ) : null}
        </div>
        {meals.status === 'CanLoadMore' || meals.status === 'LoadingMore' ? (
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            disabled={meals.status === 'LoadingMore'}
            aria-busy={meals.status === 'LoadingMore'}
            onClick={() => meals.loadMore(PAGE_SIZE)}
          >
            {t.loadMoreMeals}
          </Button>
        ) : null}
      </PageShell>
      {editor ? (
        <EditorDialog
          title={
            editor.mealId || (draft?.editingMealId && editor.resume)
              ? t.editMeal
              : t.logMeal
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
        title={t.discardDraftTitle}
        description={t.discardDraftDescription}
        confirmLabel={t.discardDraft}
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

// An opened meal's foods: a recessed well inset within the meal's cell, from
// the meal name's left edge to its chevron's right edge.
const foodGroupClass = 'mr-3.5 ml-4 rounded-xl bg-recessed [--row-inset:1rem]'

function MealDetails({ meal, onEdit }: { meal: Meal; onEdit: () => void }) {
  const locale = useLocale()
  const t = messages[locale]
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
        label={t.loadingMealDetails}
        rows={Math.min(3, Math.max(1, meal.itemCount))}
        className={cn(foodGroupClass, 'pr-5.5 pl-4')}
      />
    )
  if (!detail)
    return (
      <p className="px-4 pb-4 type-subhead text-muted-foreground">
        {t.mealUnavailable}
      </p>
    )
  // The foods nest under the meal in a quiet recessed group, then the
  // meal's actions. The kcal column and the action group end where the meal
  // row's kcal does (its chevron column, 14 + 16 + 6px, from the cell edge).
  return (
    <div className="pb-0.5">
      <div className={cn(foodGroupClass, 'inset-rows')}>
        {detail.items.map((item) => (
          <div
            key={item._id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 py-2.5 pr-5.5 pl-4"
          >
            <p className="type-subhead">{item.nameSnapshot}</p>
            <p className="text-right">
              <Value size="child" value={item.caloriesSnapshot.toFixed(0)} />
            </p>
            {item.sourceType !== 'fixedCalories' ? (
              <p className="type-footnote text-muted-foreground tabular-nums">
                {`${formatAmount(item.consumedWeightGrams, locale)} g · ${formatKcal(item.kcalPer100Snapshot)} kcal/100 ${item.kcalBasisUnitSnapshot}`}
              </p>
            ) : item.foodIdentity?.servingLabel ? (
              <p className="type-footnote text-muted-foreground tabular-nums">
                {`${formatAmount(item.servingCount ?? 1, locale)} ${item.foodIdentity.servingLabel}`}
              </p>
            ) : null}
            <div className="col-span-full empty:hidden">
              <EstimateNotice provenance={item.nutritionProvenance} />
              {item.notes ? (
                <p className="mt-1 whitespace-pre-wrap type-footnote text-muted-foreground">
                  {item.notes}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {detail.meal.notes ? (
        <p className="py-2.5 pr-4 pl-8 type-subhead whitespace-pre-wrap text-muted-foreground">
          {detail.meal.notes}
        </p>
      ) : null}
      <fieldset
        disabled={isRunning}
        className="flex flex-wrap items-center justify-end gap-2 py-2.5 pr-9 pl-8"
      >
        {/* One tight right-aligned group: overflow, then Archive, then Edit
            meal, ending on the foods' kcal column. The ghost actions trim
            their side padding (the overflow overlaps the gap), so the visible
            gaps match the 8px one before Edit meal instead of spreading the
            group across the row. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                className="-mr-2 text-muted-foreground"
                aria-label={t.moreMealActions}
              />
            }
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                confirmAndRunAction(t.deleteConfirm, t.mealDeleted, () =>
                  remove({
                    mealId: meal._id,
                    expectedEditRevision: detail.meal.editRevision,
                  }),
                )
              }
            >
              {t.deletePermanently}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="sm"
          className="px-2.5 text-muted-foreground"
          onClick={() =>
            void runAction(
              meal.archived ? t.mealRestored : t.mealArchived,
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
          {meal.archived ? t.restore : t.archive}
        </Button>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil />
          {t.editMeal}
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
