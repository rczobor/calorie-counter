import { LoadingRows } from '@/components/page/loading-content'
import { createFileRoute, useBlocker } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { Select } from '@/components/ui/select'
import { PageShell } from '@/components/page/page-shell'
import { ConfigMissingState } from '@/components/page/page-states'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { EditorDialog } from '@/components/page/editor-dialog'
import { ActionsMenu } from '@/components/list/actions-menu'
import { Field } from '@/components/list/field'
import {
  ListToolbar,
  LoadMoreButton,
  type ArchivedToggle,
} from '@/components/list/list-toolbar'
import {
  ArchivedBadge,
  RecordList,
  RecordRow,
} from '@/components/list/record-list'
import { SheetFooter } from '@/components/list/sheet-footer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import { Value } from '@/components/nutrition/value'
import {
  useMutation,
  usePaginatedQuery,
  useQuery,
} from '@/features/households/convex-hooks'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { isConvexConfigured } from '@/integrations/convex/config'
import {
  createDraftFromCookedFood,
  type CookingDraft,
} from '@/features/cooking/draft-helpers'
import { CookedFoodEditor } from '@/features/cooking/cooked-food-editor'
import { useDraftPersistenceIdentity } from '@/features/cooking/draft-persistence-identity'
import {
  readCookingEdit,
  readLegacyCookingDrafts,
  removeLegacyCookingDraft,
  writeCookingEdit,
} from '@/features/cooking/use-persisted-cooking-drafts'
import {
  formatKcalPer100,
  getNutritionUnitLabel,
  toErrorMessage,
  toLocalDateString,
  toTimestampFromDate,
} from '@/lib/nutrition'

const PAGE_SIZE = 20
const SEARCH_MAX_LENGTH = 100
type CookedFood = FunctionReturnType<
  typeof api.cooking.listCookedFoods
>['page'][number]
type Session = NonNullable<FunctionReturnType<typeof api.cooking.getSession>>
type FoodDetail = NonNullable<
  FunctionReturnType<typeof api.cooking.getCookedFoodDetail>
>

export const Route = createFileRoute('/cooking')({
  ssr: false,
  component: CookingPage,
})

function CookingPage() {
  const { userId } = useDraftPersistenceIdentity()
  if (!isConvexConfigured) return <ConfigMissingState />
  return <CookingContent key={userId} userId={userId} />
}

function CookingContent({ userId }: { userId: string | null }) {
  const [selectedFood, setSelectedFood] = useState<Pick<
    CookedFood,
    '_id' | 'name'
  > | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [view, setView] = useState<'foods' | 'sessions'>('foods')
  const [selectedSessionId, setSelectedSessionId] =
    useState<Id<'cookSessions'> | null>(() => {
      const id = new URLSearchParams(window.location.search).get('sessionId')
      return id && /^[a-z0-9]{20,64}$/i.test(id)
        ? (id as Id<'cookSessions'>)
        : null
    })
  const [draft, setDraft] = useState<CookingDraft | null>(null)
  const [recoverableEdit, setRecoverableEdit] = useState(() =>
    readCookingEdit(userId),
  )
  const [legacy, setLegacy] = useState(() => readLegacyCookingDrafts(userId))
  const [legacySource, setLegacySource] = useState<CookingDraft | null>(null)
  const [discardLegacy, setDiscardLegacy] = useState(false)
  const selectedSession = useQuery(
    api.cooking.getSession,
    selectedSessionId ? { sessionId: selectedSessionId } : 'skip',
  )

  useEffect(() => {
    const refreshRecovery = () => setLegacy(readLegacyCookingDrafts(userId))
    window.addEventListener('storage', refreshRecovery)
    return () => window.removeEventListener('storage', refreshRecovery)
  }, [userId])

  function closeEditor() {
    const progress = readCookingEdit(userId)
    const remaining = readLegacyCookingDrafts(userId)
    // Keep the committed ID if cleanup failed, so reopening an old create draft
    // edits its saved food instead of creating that food a second time.
    const savedRecovery =
      progress?.persistedCookedFoodId &&
      remaining.serialized &&
      (!remaining.drafts.length ||
        remaining.drafts.some(
          (item) =>
            item.draftId === progress.draftId && !item.persistedCookedFoodId,
        ))
    if (!savedRecovery) writeCookingEdit(userId, null)
    setRecoverableEdit(savedRecovery ? progress : null)
    setDraft(null)
    setSelectedFood(null)
    setLegacySource(null)
  }

  function beginFoodEdit(next: CookingDraft) {
    const unfinished = readCookingEdit(userId)
    if (unfinished && unfinished.draftId !== next.draftId) {
      setRecoverableEdit(unfinished)
      toast.warning(
        'Resume or discard your unfinished cooking edit before opening another editor.',
      )
      return
    }
    setDraft(next)
  }

  function saved() {
    if (legacySource && userId) {
      try {
        removeLegacyCookingDraft(userId, legacySource)
      } catch (error) {
        toast.warning(
          `The food was saved, but its old draft could not be removed: ${toErrorMessage(error)}`,
        )
      }
      setLegacy(readLegacyCookingDrafts(userId))
    }
    closeEditor()
  }

  function exportLegacy() {
    if (!legacy.serialized) return
    const url = URL.createObjectURL(
      new Blob([legacy.serialized], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'calorie-counter-cooking-drafts.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const archivedToggle = {
    checked: showArchived,
    onCheckedChange: setShowArchived,
  }

  return (
    <>
      <PageShell
        title="Cooking"
        breadcrumbs={
          <SettingsBreadcrumbs
            current="Cooking"
            onCurrentClick={
              selectedFood ? () => setSelectedFood(null) : undefined
            }
          />
        }
        headerClassName={selectedFood && !draft ? 'hidden lg:flex' : undefined}
        contentClassName="max-w-3xl"
      >
        {draft ? (
          <CookedFoodEditor
            key={draft.draftId}
            initialDraft={draft}
            onClose={closeEditor}
            onSaved={saved}
          />
        ) : (
          <>
            {recoverableEdit ? (
              <div
                role="status"
                className="mt-5 flex flex-wrap items-center justify-between gap-3 inset-group py-3 pr-3 pl-4"
              >
                <p className="type-subhead">
                  An unfinished cooking edit is available in this tab.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft(recoverableEdit)}
                >
                  Resume edit
                </Button>
              </div>
            ) : null}
            {legacy.serialized ? (
              <section
                aria-label="Recovered cooking drafts"
                className="mt-5 space-y-3 inset-group p-4"
              >
                <div>
                  <h2 className="type-headline">
                    Cooking drafts from the previous workspace
                  </h2>
                  <p className="mt-1 type-subhead text-muted-foreground">
                    Your unsaved work is preserved. Recover a draft, export a
                    copy, or discard it explicitly.
                  </p>
                </div>
                {legacy.drafts.map((item) => (
                  <div
                    key={item.draftId}
                    className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
                  >
                    <div>
                      <p className="text-base">
                        {item.name.trim() || 'Untitled cooking'}
                      </p>
                      <p className="type-footnote text-muted-foreground">
                        {item.ingredientLines.length} ingredient lines
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const savedProgress =
                          recoverableEdit?.draftId === item.draftId &&
                          recoverableEdit.persistedCookedFoodId
                            ? recoverableEdit
                            : null
                        const unfinished = readCookingEdit(userId)
                        if (unfinished && unfinished.draftId !== item.draftId) {
                          toast.warning(
                            'Resume or discard your unfinished cooking edit before recovering another draft.',
                          )
                          return
                        }
                        setLegacySource(savedProgress ? null : item)
                        beginFoodEdit(savedProgress ?? item)
                      }}
                    >
                      {recoverableEdit?.draftId === item.draftId &&
                      recoverableEdit.persistedCookedFoodId
                        ? 'Open recovered food'
                        : 'Recover draft'}
                    </Button>
                  </div>
                ))}
                {!legacy.drafts.length ? (
                  <p className="text-sm text-muted-foreground">
                    This saved workspace cannot be opened safely. Export its
                    original data before discarding it.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={exportLegacy}>
                    Export saved drafts
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDiscardLegacy(true)}
                  >
                    Discard old workspace
                  </Button>
                </div>
              </section>
            ) : null}
            {legacy.unavailable ? (
              <p role="status" className="mt-4 text-sm text-muted-foreground">
                Local draft recovery is unavailable in this browser. No stored
                work was removed.
              </p>
            ) : null}
            <Tabs
              value={view}
              onValueChange={(value) => {
                if (value === 'sessions') setSelectedFood(null)
                if (value === 'foods' || value === 'sessions') setView(value)
              }}
              className="mt-4 gap-4"
            >
              <TabsList
                aria-label="Cooking sections"
                className={cn(selectedFood && 'max-lg:hidden')}
              >
                <TabsTrigger value="foods">Cooked foods</TabsTrigger>
                <TabsTrigger value="sessions">Batches</TabsTrigger>
              </TabsList>
              <TabsContent value="sessions">
                <SessionList
                  showArchived={showArchived}
                  archivedToggle={archivedToggle}
                  onOpen={(id) => {
                    setSelectedSessionId(id)
                    setView('foods')
                  }}
                />
              </TabsContent>
              <TabsContent value="foods">
                {selectedSessionId ? (
                  selectedSession === undefined ? (
                    <LoadingRows label="Loading batch" rows={1} />
                  ) : selectedSession === null ? (
                    <div className="space-y-3">
                      <p role="alert">
                        This batch is unavailable in the selected household.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedSessionId(null)}
                      >
                        Show all cooked foods
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div
                        className={cn(
                          'mb-3 space-y-1',
                          selectedFood && 'hidden lg:block',
                        )}
                      >
                        <Button
                          variant="ghost"
                          className="-ml-3 h-11 px-3 md:h-9"
                          onClick={() => setSelectedSessionId(null)}
                        >
                          <ChevronLeft aria-hidden="true" />
                          All cooked foods
                        </Button>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="flex flex-wrap items-center gap-2 font-medium break-words text-foreground">
                              {selectedSession.label.trim() ||
                                formatDate(selectedSession.cookedAt)}
                              {selectedSession.archived ? (
                                <ArchivedBadge />
                              ) : null}
                            </h2>
                            <p className="text-sm text-muted-foreground">
                              {[
                                selectedSession.label.trim()
                                  ? formatDate(selectedSession.cookedAt)
                                  : '',
                                selectedSession.cookedByPersonName,
                              ]
                                .filter(Boolean)
                                .join(' · ') ||
                                'All cooked foods in this batch'}
                            </p>
                          </div>
                          <BatchActions
                            key={selectedSession._id}
                            session={selectedSession}
                            onDeleted={() => setSelectedSessionId(null)}
                          />
                        </div>
                      </div>
                      <CookedFoodList
                        key={selectedSessionId}
                        sessionId={selectedSessionId}
                        showArchived={showArchived || selectedSession.archived}
                        // An archived batch always lists its archived foods.
                        archivedToggle={
                          selectedSession.archived ? undefined : archivedToggle
                        }
                        selectedFood={selectedFood}
                        onSelect={setSelectedFood}
                        onClose={() => setSelectedFood(null)}
                        onEdit={beginFoodEdit}
                      />
                    </>
                  )
                ) : (
                  <CookedFoodList
                    key="all"
                    showArchived={showArchived}
                    archivedToggle={archivedToggle}
                    selectedFood={selectedFood}
                    onSelect={setSelectedFood}
                    onClose={() => setSelectedFood(null)}
                    onEdit={beginFoodEdit}
                  />
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </PageShell>
      <ConfirmDestructiveDialog
        open={discardLegacy}
        onOpenChange={setDiscardLegacy}
        title="Discard old cooking workspace?"
        description="Every unsaved draft in the previous workspace will be removed from this device. Export a copy first if you may need it."
        confirmLabel="Discard drafts"
        onConfirm={() => {
          try {
            if (userId)
              window.localStorage.removeItem(
                `calorie-counter:cooking-drafts:${userId}`,
              )
            setLegacy(readLegacyCookingDrafts(userId))
            setDiscardLegacy(false)
          } catch (error) {
            toast.error(toErrorMessage(error))
          }
        }}
      />
    </>
  )
}

function CookedFoodList({
  sessionId,
  showArchived,
  archivedToggle,
  onEdit,
  selectedFood,
  onSelect,
  onClose,
}: {
  sessionId?: Id<'cookSessions'>
  showArchived: boolean
  archivedToggle?: ArchivedToggle
  onEdit: (draft: CookingDraft) => void
  selectedFood: Pick<CookedFood, '_id' | 'name'> | null
  onSelect: (food: CookedFood) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const term = search.trim().slice(0, SEARCH_MAX_LENGTH)
  const active = usePaginatedQuery(
    api.cooking.listCookedFoods,
    !sessionId && !term ? { archived: false } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const archived = usePaginatedQuery(
    api.cooking.listCookedFoods,
    !sessionId && !term && showArchived ? { archived: true } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const scoped = usePaginatedQuery(
    api.cooking.listCookedFoodsForSession,
    sessionId && !term ? { cookSessionId: sessionId, archived: false } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const scopedArchived = usePaginatedQuery(
    api.cooking.listCookedFoodsForSession,
    sessionId && !term && showArchived
      ? { cookSessionId: sessionId, archived: true }
      : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const found = useQuery(
    api.cooking.searchCookedFoods,
    term && !sessionId ? { archived: false, search: term } : 'skip',
  )
  const foundArchived = useQuery(
    api.cooking.searchCookedFoods,
    term && !sessionId && showArchived
      ? { archived: true, search: term }
      : 'skip',
  )
  const foundScoped = useQuery(
    api.cooking.searchCookedFoodsBySession,
    term && sessionId
      ? { cookSessionId: sessionId, archived: false, search: term }
      : 'skip',
  )
  const foundScopedArchived = useQuery(
    api.cooking.searchCookedFoodsBySession,
    term && sessionId && showArchived
      ? { cookSessionId: sessionId, archived: true, search: term }
      : 'skip',
  )
  const page = sessionId ? scoped : active,
    archivePage = sessionId ? scopedArchived : archived
  const searchRows = sessionId ? foundScoped : found,
    archivedSearchRows = sessionId ? foundScopedArchived : foundArchived
  const foods = term
    ? [
        ...(searchRows ?? []),
        ...(showArchived ? (archivedSearchRows ?? []) : []),
      ]
    : [...page.results, ...(showArchived ? archivePage.results : [])]
  const loading = term
    ? searchRows === undefined ||
      (showArchived && archivedSearchRows === undefined)
    : page.status === 'LoadingFirstPage' ||
      (showArchived && archivePage.status === 'LoadingFirstPage')

  const detailRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const selectedId = selectedFood?._id
  useEffect(() => {
    if (selectedId) detailRef.current?.focus()
    // Closing details while typing must preserve focus in the search field.
    else if (document.activeElement === document.body)
      triggerRef.current?.focus()
  }, [selectedId])
  return (
    <section
      aria-label="Cooked foods"
      className={cn(
        selectedFood &&
          'lg:grid lg:grid-cols-[minmax(16rem,1fr)_minmax(0,1.4fr)] lg:gap-8',
      )}
    >
      <div
        className={cn('min-w-0 space-y-3', selectedFood && 'hidden lg:block')}
      >
        <ListToolbar
          search={{
            label: 'Search cooked foods',
            maxLength: SEARCH_MAX_LENGTH,
            value: search,
            onValueChange: (value) => {
              setSearch(value)
              onClose()
            },
          }}
          archived={archivedToggle}
        />
        <RecordList
          label="Cooked foods"
          loading={loading}
          empty="No cooked foods found."
        >
          {foods.map((food) => (
            <RecordRow
              key={food._id}
              title={food.name}
              // The rate's basis joins the subtitle, so names don't wrap
              // beside a long unit.
              detail={`${food.finishedWeightGrams.toFixed(0)} g cooked · per 100 g`}
              value={formatKcalPer100(food.kcalPer100)}
              archived={food.archived}
              expanded={selectedId === food._id}
              onOpen={(event) => {
                triggerRef.current = event.currentTarget
                onSelect(food)
              }}
            />
          ))}
        </RecordList>
        {term && foods.length >= 20 ? (
          <p className="text-xs text-muted-foreground">
            First 20 matches. Refine your search for more.
          </p>
        ) : null}
        {!term &&
        [page, ...(showArchived ? [archivePage] : [])].some(
          (p) => p.status === 'CanLoadMore' || p.status === 'LoadingMore',
        ) ? (
          <LoadMoreButton
            loading={[page, archivePage].some(
              (p) => p.status === 'LoadingMore',
            )}
            onClick={() => {
              if (page.status === 'CanLoadMore') page.loadMore(PAGE_SIZE)
              if (showArchived && archivePage.status === 'CanLoadMore')
                archivePage.loadMore(PAGE_SIZE)
            }}
          >
            Load more cooked foods
          </LoadMoreButton>
        ) : null}
      </div>
      {selectedFood ? (
        <section
          ref={detailRef}
          tabIndex={-1}
          aria-label={selectedFood.name}
          className="min-w-0 outline-none lg:border-l lg:pl-8"
        >
          <h1 className="type-title lg:hidden">{selectedFood.name}</h1>
          <h2 className="hidden type-title lg:block">{selectedFood.name}</h2>
          <CookedFoodDetail
            key={selectedFood._id}
            foodId={selectedFood._id}
            onEdit={onEdit}
            onClose={onClose}
          />
        </section>
      ) : null}
    </section>
  )
}

function CookedFoodDetail({
  foodId,
  onEdit,
  onClose,
}: {
  foodId: Id<'cookedFoods'>
  onEdit: (draft: CookingDraft) => void
  onClose: () => void
}) {
  const detail = useQuery(api.cooking.getCookedFoodDetail, {
    cookedFoodId: foodId,
  })
  const archive = useMutation(api.nutrition.setCookedFoodArchived)
  const remove = useMutation(api.nutrition.deleteCookedFood)
  const action = useConfirmableAction()
  const [recipe, setRecipe] = useState(false)
  if (detail === undefined)
    return <LoadingRows label="Loading composition" rows={2} className="mt-4" />
  if (detail === null)
    return (
      <p role="status" className="mt-4 text-sm">
        This cooked food is no longer available.
      </p>
    )
  const food = detail.cookedFood
  const sourceLines = detail.ingredients.filter(
    (line) =>
      line.notes ||
      line.nutritionProvenance ||
      (!line.ignoreCaloriesSnapshot &&
        (line.countedAmount !== line.referenceAmount ||
          line.ingredientKcalBasisUnitSnapshot !== line.referenceUnit)),
  )
  return (
    <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-footnote text-muted-foreground">
          {detail.cookSession ? formatDate(detail.cookSession.cookedAt) : null}
          {detail.cookSession?.cookedByPersonName
            ? ` · ${detail.cookSession.cookedByPersonName}`
            : null}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label="Edit cooked food"
            disabled={action.isRunning}
            onClick={() =>
              onEdit(createDraftFromCookedFood(food, detail.ingredients))
            }
          >
            Edit
          </Button>
          <ActionsMenu
            label="Cooked food actions"
            disabled={action.isRunning}
            actions={[
              {
                label: food.archived ? 'Restore' : 'Archive',
                onSelect: () =>
                  void action.runAction(
                    food.archived
                      ? 'Cooked food restored.'
                      : 'Cooked food archived.',
                    async () => {
                      await archive({
                        cookedFoodId: food._id,
                        expectedEditRevision: food.editRevision,
                        archived: !food.archived,
                      })
                      onClose()
                    },
                  ),
              },
              { label: 'Save as recipe', onSelect: () => setRecipe(!recipe) },
              {
                label: 'Delete permanently',
                destructive: true,
                onSelect: () =>
                  action.confirmAndRunAction(
                    'Delete this cooked food permanently? Foods used by historical records must be archived instead.',
                    'Cooked food deleted.',
                    async () => {
                      await remove({
                        cookedFoodId: food._id,
                        expectedEditRevision: food.editRevision,
                      })
                      onClose()
                    },
                  ),
              },
            ]}
          />
        </div>
      </div>
      {/* The batch's figures, like History's stats: value over its label. */}
      <dl className="grid grid-cols-3 divide-x inset-group">
        <div className="flex flex-col-reverse justify-end px-4 py-3">
          <dt className="type-footnote text-muted-foreground">Total</dt>
          <dd>
            <Value size="headline" value={food.totalCalories.toFixed(0)} />
          </dd>
        </div>
        <div className="flex flex-col-reverse justify-end px-4 py-3">
          <dt className="type-footnote text-muted-foreground">
            Finished weight
          </dt>
          <dd>
            <Value
              size="headline"
              value={food.finishedWeightGrams.toFixed(0)}
              unit="g"
            />
          </dd>
        </div>
        <div className="flex flex-col-reverse justify-end px-4 py-3">
          <dt className="type-footnote text-muted-foreground">kcal/100 g</dt>
          <dd>
            <Value
              size="headline"
              value={formatKcalPer100(food.kcalPer100)}
              unit={null}
            />
          </dd>
        </div>
      </dl>
      <div>
        <div className="grid grid-cols-[minmax(0,1fr)_4rem_3rem] gap-3 group-label">
          <h3>Ingredients</h3>
          <span className="text-right">Amount</span>
          <span className="text-right">kcal</span>
        </div>
        <div className="inset-group inset-rows">
          {detail.ingredients.map((line) => (
            <div key={line._id} className="px-4 py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_4rem_3rem] gap-3 text-base">
                <span>
                  {line.ingredientNameSnapshot}
                  {line.ignoreCaloriesSnapshot ? (
                    <span className="block type-footnote text-muted-foreground">
                      Calories ignored
                    </span>
                  ) : null}
                </span>
                <span className="text-right type-footnote text-muted-foreground tabular-nums">
                  {line.referenceAmount}{' '}
                  {line.referenceUnit === 'g'
                    ? 'g'
                    : getNutritionUnitLabel(line.referenceUnit)}
                </span>
                <span className="text-right font-semibold tabular-nums">
                  {line.ingredientCaloriesSnapshot.toFixed(0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <EstimateNotice provenance={food.nutritionProvenance} />
      {food.notes || detail.linkedRecipe || sourceLines.length > 0 ? (
        <details className="px-4 type-footnote text-muted-foreground">
          <summary className="cursor-pointer">
            Notes & sources
            {!food.nutritionProvenance &&
            sourceLines.some(
              (line) =>
                line.nutritionProvenance &&
                line.nutritionProvenance.kind !== 'provided',
            ) ? (
              <span className="ml-2 text-caution">Includes estimates</span>
            ) : null}
          </summary>
          {detail.linkedRecipe ? (
            <p className="mt-3">
              Recipe: {detail.linkedRecipe.name}
              {detail.linkedRecipe.versionNumber
                ? ` · version ${detail.linkedRecipe.versionNumber}`
                : ''}
            </p>
          ) : null}
          {food.notes ? (
            <p className="mt-3 whitespace-pre-wrap">{food.notes}</p>
          ) : null}
          {sourceLines.map((line) => (
            <div key={line._id} className="mt-3">
              <p className="font-medium text-foreground">
                {line.ingredientNameSnapshot}
              </p>
              {!line.ignoreCaloriesSnapshot &&
              (line.countedAmount !== line.referenceAmount ||
                line.ingredientKcalBasisUnitSnapshot !== line.referenceUnit) ? (
                <p>
                  Counted {line.countedAmount ?? 0}{' '}
                  {line.ingredientKcalBasisUnitSnapshot}
                </p>
              ) : null}
              {line.notes ? (
                <p className="whitespace-pre-wrap">{line.notes}</p>
              ) : null}
              <EstimateNotice provenance={line.nutritionProvenance} />
            </div>
          ))}
        </details>
      ) : null}
      {recipe ? (
        <RecipeFromCookedFood
          detail={detail}
          onClose={() => setRecipe(false)}
        />
      ) : null}
      <ConfirmDestructiveDialog
        open={action.isConfirmDialogOpen}
        onOpenChange={action.handleConfirmDialogOpenChange}
        description={action.pendingConfirmation?.message}
        onConfirm={action.confirmPendingAction}
        disabled={action.isRunning}
      />
    </div>
  )
}

function RecipeFromCookedFood({
  detail,
  onClose,
}: {
  detail: FoodDetail
  onClose: () => void
}) {
  const [name, setName] = useState(detail.cookedFood.name)
  const [instructions, setInstructions] = useState('')
  const create = useMutation(api.nutrition.createRecipe)
  const action = useConfirmableAction()
  return (
    <form
      className="space-y-3 rounded-lg border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void action.runAction(
          'Recipe created. The cooked batch remains unchanged.',
          async () => {
            await create({
              name,
              instructions: instructions || undefined,
              ingredientLines: detail.ingredients.map((line) => ({
                sourceType: 'custom',
                ingredientId: line.ingredientId,
                name: line.ingredientNameSnapshot,
                kcalPer100: line.ingredientKcalPer100Snapshot,
                kcalBasisUnit: line.ingredientKcalBasisUnitSnapshot,
                ignoreCalories: line.ignoreCaloriesSnapshot,
                referenceAmount: line.referenceAmount,
                referenceUnit: line.referenceUnit,
                saveToCatalog: false,
                notes: line.notes,
                nutritionProvenance: line.nutritionProvenance,
              })),
            })
            onClose()
          },
        )
      }}
    >
      <fieldset disabled={action.isRunning} className="space-y-3">
        <Label htmlFor={`recipe-name-${detail.cookedFood._id}`}>
          Recipe name
        </Label>
        <Input
          id={`recipe-name-${detail.cookedFood._id}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Textarea
          aria-label="Recipe instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Instructions (optional)"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Create recipe</Button>
        </div>
      </fieldset>
    </form>
  )
}

function SessionList({
  showArchived,
  archivedToggle,
  onOpen,
}: {
  showArchived: boolean
  archivedToggle: ArchivedToggle
  onOpen: (id: Id<'cookSessions'>) => void
}) {
  const [search, setSearch] = useState('')
  const term = search.trim().slice(0, SEARCH_MAX_LENGTH)
  const active = usePaginatedQuery(
    api.cooking.listSessions,
    term ? 'skip' : { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const archived = usePaginatedQuery(
    api.cooking.listSessions,
    !term && showArchived ? { archived: true } : 'skip',
    { initialNumItems: PAGE_SIZE },
  )
  const found = useQuery(
    api.cooking.searchSessions,
    term ? { archived: false, search: term } : 'skip',
  )
  const foundArchived = useQuery(
    api.cooking.searchSessions,
    term && showArchived ? { archived: true, search: term } : 'skip',
  )
  const rows = term
    ? [...(found ?? []), ...(showArchived ? (foundArchived ?? []) : [])]
    : [...active.results, ...(showArchived ? archived.results : [])]
  const loading = term
    ? found === undefined || (showArchived && foundArchived === undefined)
    : active.status === 'LoadingFirstPage'
  return (
    <section aria-label="Cooking batches" className="space-y-3">
      <ListToolbar
        search={{
          label: 'Search batches',
          maxLength: SEARCH_MAX_LENGTH,
          value: search,
          onValueChange: setSearch,
        }}
        archived={archivedToggle}
      />
      <RecordList label="Batches" loading={loading} empty="No batches found.">
        {rows.map((session) => {
          const date = formatDate(session.cookedAt)
          const label = session.label.trim()
          return (
            <RecordRow
              key={session._id}
              title={label || date}
              detail={[label ? date : '', session.cookedByPersonName]
                .filter(Boolean)
                .join(' · ')}
              archived={session.archived}
              onOpen={() => onOpen(session._id)}
            />
          )
        })}
      </RecordList>
      {!term &&
      [active, ...(showArchived ? [archived] : [])].some(
        (p) => p.status === 'CanLoadMore' || p.status === 'LoadingMore',
      ) ? (
        <LoadMoreButton
          loading={[active, archived].some((p) => p.status === 'LoadingMore')}
          onClick={() => {
            if (active.status === 'CanLoadMore') active.loadMore(PAGE_SIZE)
            if (showArchived && archived.status === 'CanLoadMore')
              archived.loadMore(PAGE_SIZE)
          }}
        >
          Load more batches
        </LoadMoreButton>
      ) : null}
      {term && rows.length >= 20 ? (
        <p className="text-xs text-muted-foreground">
          First 20 matches. Refine your search for more.
        </p>
      ) : null}
    </section>
  )
}

/** The open batch's actions: edit in a sheet, archive, or delete when empty. */
function BatchActions({
  session,
  onDeleted,
}: {
  session: Session
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const archive = useMutation(api.nutrition.setCookSessionArchived)
  const remove = useMutation(api.nutrition.deleteCookSession)
  const action = useConfirmableAction()
  return (
    <>
      <ActionsMenu
        label="Batch actions"
        disabled={action.isRunning}
        actions={[
          { label: 'Edit batch', onSelect: () => setEditing(true) },
          {
            label: session.archived ? 'Restore' : 'Archive',
            onSelect: () =>
              void action.runAction(
                session.archived ? 'Batch restored.' : 'Batch archived.',
                () =>
                  archive({
                    sessionId: session._id,
                    expectedEditRevision: session.editRevision,
                    archived: !session.archived,
                  }),
              ),
          },
          {
            label: 'Delete permanently',
            destructive: true,
            onSelect: () =>
              action.confirmAndRunAction(
                'Delete this batch permanently? Batches containing cooked foods must be archived instead.',
                'Batch deleted.',
                async () => {
                  await remove({
                    sessionId: session._id,
                    expectedEditRevision: session.editRevision,
                  })
                  onDeleted()
                },
              ),
          },
        ]}
      />
      {editing ? (
        <SessionEditor session={session} onClose={() => setEditing(false)} />
      ) : null}
      <ConfirmDestructiveDialog
        open={action.isConfirmDialogOpen}
        onOpenChange={action.handleConfirmDialogOpenChange}
        description={action.pendingConfirmation?.message}
        onConfirm={action.confirmPendingAction}
        disabled={action.isRunning}
      />
    </>
  )
}

function SessionEditor({
  session,
  onClose,
}: {
  session: Session
  onClose: () => void
}) {
  const [label, setLabel] = useState(session.label)
  const [date, setDate] = useState(() => toLocalDateString(session.cookedAt))
  const [personId, setPersonId] = useState<Id<'people'> | ''>(
    session.cookedByPersonId ?? '',
  )
  const [notes, setNotes] = useState(session.notes ?? '')
  const [discard, setDiscard] = useState(false)
  const people = usePaginatedQuery(
    api.people.list,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const update = useMutation(api.nutrition.updateCookSession)
  const action = useConfirmableAction()
  const dirty =
    label !== session.label ||
    date !== toLocalDateString(session.cookedAt) ||
    personId !== (session.cookedByPersonId ?? '') ||
    notes !== (session.notes ?? '')
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || action.isRunning,
    enableBeforeUnload: dirty || action.isRunning,
    withResolver: true,
  })
  function close() {
    if (dirty) setDiscard(true)
    else onClose()
  }
  return (
    <EditorDialog
      title="Edit batch"
      description="Changes are saved only when you choose Save batch."
      pending={action.isRunning}
      onClose={close}
    >
      <form
        className="flex flex-1 flex-col"
        aria-label="Batch editor"
        onSubmit={(event) => {
          event.preventDefault()
          void action.runAction('Batch updated.', async () => {
            await update({
              sessionId: session._id,
              expectedEditRevision: session.editRevision,
              label,
              cookedAt:
                date === toLocalDateString(session.cookedAt)
                  ? session.cookedAt
                  : toTimestampFromDate(date),
              cookedOn: date,
              cookedByPersonId: personId || undefined,
              notes,
            })
            onClose()
          })
        }}
      >
        <fieldset
          disabled={action.isRunning}
          className="min-w-0 space-y-4 pb-5"
        >
          <Field label="Batch label" htmlFor="batch-label">
            <Input
              id="batch-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field label="Date">
            <DatePicker
              ariaLabel="Batch date"
              value={date}
              onChange={setDate}
            />
          </Field>
          <Field label="Cooked by">
            <Select
              ariaLabel="Batch person"
              className="w-full"
              value={personId}
              onValueChange={(value) => setPersonId(value ?? '')}
              options={[
                { value: '', label: 'No person' },
                ...(session.cookedByPersonId &&
                !people.results.some((p) => p._id === session.cookedByPersonId)
                  ? [
                      {
                        value: session.cookedByPersonId,
                        label: session.cookedByPersonName ?? 'Original person',
                      },
                    ]
                  : []),
                ...people.results.map((p) => ({ value: p._id, label: p.name })),
              ]}
            />
            {people.status === 'CanLoadMore' ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => people.loadMore(PAGE_SIZE)}
              >
                Load more people
              </Button>
            ) : null}
          </Field>
          <Field label="Notes" htmlFor="batch-notes">
            <Textarea
              id="batch-notes"
              aria-label="Batch notes"
              placeholder="Optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </fieldset>
        <SheetFooter>
          <Button type="submit" size="lg" disabled={action.isRunning}>
            Save batch
          </Button>
        </SheetFooter>
      </form>
      <ConfirmDestructiveDialog
        open={discard}
        onOpenChange={setDiscard}
        title="Discard batch changes?"
        description="Your unsaved batch changes will be lost."
        confirmLabel="Discard changes"
        onConfirm={onClose}
      />
      <ConfirmDestructiveDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
        title="Leave unsaved batch changes?"
        description="Your changes to this batch have not been saved."
        confirmLabel="Leave page"
        disabled={action.isRunning}
        onConfirm={() => blocker.proceed?.()}
      />
    </EditorDialog>
  )
}
