import { createFileRoute, Link, useBlocker } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { FunctionReturnType } from 'convex/server'
import { ChefHat } from 'lucide-react'
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
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
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
  formatCookSessionLabel,
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
  const [showArchived, setShowArchived] = useState(false)
  const [view, setView] = useState<'foods' | 'sessions'>('foods')
  const [sessionEditing, setSessionEditing] = useState(false)
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

  return (
    <>
      <PageShell
        title="Cooked batches"
        icon={<ChefHat className="h-4 w-4" />}
        subtitle="Inspect cooking, correct nutrition, and keep historical records intact."
        showArchived={showArchived}
        onShowArchivedChange={(value) => {
          if (!sessionEditing) setShowArchived(value)
        }}
      >
        <Link
          to="/settings"
          className="mt-4 inline-block text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to settings
        </Link>
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
                className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
              >
                <p className="text-sm">
                  An unfinished cooking edit is available in this tab.
                </p>
                <Button
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
                className="mt-5 space-y-3 rounded-lg border bg-card p-4"
              >
                <div>
                  <h2 className="font-medium">
                    Cooking drafts from the previous workspace
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
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
                      <p className="text-sm font-medium">
                        {item.name.trim() || 'Untitled cooking'}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
            <div className="my-5 flex flex-wrap gap-2">
              <Button
                variant={view === 'foods' ? 'secondary' : 'ghost'}
                disabled={sessionEditing}
                onClick={() => setView('foods')}
              >
                Cooked foods
              </Button>
              <Button
                variant={view === 'sessions' ? 'secondary' : 'ghost'}
                disabled={sessionEditing}
                onClick={() => setView('sessions')}
              >
                Batches
              </Button>
            </div>
            {view === 'sessions' ? (
              <SessionList
                showArchived={showArchived}
                onEditing={setSessionEditing}
                onOpen={(id) => {
                  setSelectedSessionId(id)
                  setView('foods')
                }}
              />
            ) : selectedSessionId ? (
              selectedSession === undefined ? (
                <p role="status">Loading batch…</p>
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
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-medium">
                        {formatCookSessionLabel(selectedSession)}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {selectedSession.archived
                          ? 'Archived batch'
                          : selectedSession.cookedByPersonName ||
                            'All cooked foods in this batch'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => setSelectedSessionId(null)}
                    >
                      All cooked foods
                    </Button>
                  </div>
                  <CookedFoodList
                    key={`${selectedSessionId}:${showArchived}`}
                    sessionId={selectedSessionId}
                    showArchived={showArchived || selectedSession.archived}
                    onEdit={beginFoodEdit}
                  />
                </>
              )
            ) : (
              <CookedFoodList
                key={`all:${showArchived}`}
                showArchived={showArchived}
                onEdit={beginFoodEdit}
              />
            )}
            <p className="mt-6 text-sm text-muted-foreground">
              Record new cooking through ChatGPT. Open a cooked food here to
              inspect its portions, composition, and nutrition.
            </p>
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
  onEdit,
}: {
  sessionId?: Id<'cookSessions'>
  showArchived: boolean
  onEdit: (draft: CookingDraft) => void
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
  return (
    <section aria-label="Cooked foods">
      <Input
        aria-label="Search cooked foods"
        className="mb-4 max-w-sm"
        placeholder="Search cooked foods"
        maxLength={SEARCH_MAX_LENGTH}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {loading ? (
        <p role="status">Loading cooked foods…</p>
      ) : !foods.length ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No cooked foods found.
        </p>
      ) : (
        <div className="divide-y border-y">
          {foods.map((food) => (
            <CookedFoodRow key={food._id} food={food} onEdit={onEdit} />
          ))}
        </div>
      )}
      {term ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Search shows up to 20 matches per active or archived view. Refine your
          search to find another food.
        </p>
      ) : (
        <div className="mt-4 flex gap-2">
          {[page, ...(showArchived ? [archivePage] : [])].some(
            (p) => p.status === 'CanLoadMore' || p.status === 'LoadingMore',
          ) ? (
            <Button
              variant="outline"
              disabled={[page, archivePage].some(
                (p) => p.status === 'LoadingMore',
              )}
              onClick={() => {
                if (page.status === 'CanLoadMore') page.loadMore(PAGE_SIZE)
                if (showArchived && archivePage.status === 'CanLoadMore')
                  archivePage.loadMore(PAGE_SIZE)
              }}
            >
              Load more cooked foods
            </Button>
          ) : null}
        </div>
      )}
    </section>
  )
}

function CookedFoodRow({
  food,
  onEdit,
}: {
  food: CookedFood
  onEdit: (draft: CookingDraft) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="py-4"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div>
          <p className="font-medium">
            {food.name}
            {food.archived ? (
              <span className="ml-2 text-xs text-muted-foreground">
                Archived
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {food.finishedWeightGrams.toFixed(0)} g finished ·{' '}
            {formatKcalPer100(food.kcalPer100)} kcal / 100 g
          </p>
        </div>
        <span aria-hidden="true" className="text-muted-foreground">
          {open ? '⌄' : '›'}
        </span>
      </summary>
      {open ? <CookedFoodDetail foodId={food._id} onEdit={onEdit} /> : null}
    </details>
  )
}

function CookedFoodDetail({
  foodId,
  onEdit,
}: {
  foodId: Id<'cookedFoods'>
  onEdit: (draft: CookingDraft) => void
}) {
  const detail = useQuery(api.cooking.getCookedFoodDetail, {
    cookedFoodId: foodId,
  })
  const archive = useMutation(api.nutrition.setCookedFoodArchived)
  const remove = useMutation(api.nutrition.deleteCookedFood)
  const action = useConfirmableAction()
  const [recipe, setRecipe] = useState(false)
  if (detail === undefined)
    return (
      <p role="status" className="mt-4 text-sm">
        Loading composition…
      </p>
    )
  if (detail === null)
    return (
      <p role="status" className="mt-4 text-sm">
        This cooked food is no longer available.
      </p>
    )
  const food = detail.cookedFood
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 rounded-lg border bg-card p-4">
        <div>
          <p className="text-xs text-muted-foreground">Total batch</p>
          <p className="mt-1 text-xl font-semibold">
            {food.totalCalories.toFixed(0)} kcal
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Finished weight</p>
          <p className="mt-1 text-xl font-semibold">
            {food.finishedWeightGrams.toFixed(0)} g
          </p>
        </div>
      </div>
      {detail.cookSession ? (
        <p className="text-sm text-muted-foreground">
          Cooked {formatCookSessionLabel(detail.cookSession)}
          {detail.cookSession.cookedByPersonName
            ? ` · ${detail.cookSession.cookedByPersonName}`
            : ''}
        </p>
      ) : null}
      {detail.linkedRecipe ? (
        <p className="text-sm text-muted-foreground">
          Recipe: {detail.linkedRecipe.name}
          {detail.linkedRecipe.versionNumber
            ? ` · version ${detail.linkedRecipe.versionNumber}`
            : ''}
        </p>
      ) : null}
      <EstimateNotice provenance={food.nutritionProvenance} />
      <div>
        <h3 className="mb-2 text-sm font-medium">Composition</h3>
        <div className="divide-y rounded-lg border bg-card">
          {detail.ingredients.map((line) => (
            <div key={line._id} className="p-3">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="text-sm">{line.ingredientNameSnapshot}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {line.referenceAmount}{' '}
                    {getNutritionUnitLabel(line.referenceUnit)} ·{' '}
                    {line.ignoreCaloriesSnapshot
                      ? 'Calories ignored'
                      : `Counted ${line.countedAmount ?? 0} ${line.ingredientKcalBasisUnitSnapshot}`}
                  </p>
                </div>
                <p className="text-sm">
                  {line.ingredientCaloriesSnapshot.toFixed(0)} kcal
                </p>
              </div>
              <EstimateNotice provenance={line.nutritionProvenance} />
              {line.notes ? (
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    Notes & source composition
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap">{line.notes}</p>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {food.notes ? (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {food.notes}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Previously logged meals keep their recorded nutrition when this batch
        changes.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={action.isRunning}
          onClick={() =>
            onEdit(createDraftFromCookedFood(food, detail.ingredients))
          }
        >
          Edit cooked food
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={action.isRunning}
          onClick={() =>
            void action.runAction(
              food.archived ? 'Cooked food restored.' : 'Cooked food archived.',
              () =>
                archive({
                  cookedFoodId: food._id,
                  expectedEditRevision: food.editRevision,
                  archived: !food.archived,
                }),
            )
          }
        >
          {food.archived ? 'Restore' : 'Archive'}
        </Button>
        <details className="relative">
          <summary className="cursor-pointer rounded-md px-3 py-1.5 text-sm text-muted-foreground">
            More
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRecipe(!recipe)}
            >
              Save as recipe
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={action.isRunning}
              onClick={() =>
                action.confirmAndRunAction(
                  'Delete this cooked food permanently? Foods used by historical records must be archived instead.',
                  'Cooked food deleted.',
                  () =>
                    remove({
                      cookedFoodId: food._id,
                      expectedEditRevision: food.editRevision,
                    }),
                )
              }
            >
              Delete permanently
            </Button>
          </div>
        </details>
      </div>
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
  onOpen,
  onEditing,
}: {
  showArchived: boolean
  onOpen: (id: Id<'cookSessions'>) => void
  onEditing: (editing: boolean) => void
}) {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Session | null>(null)
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
  const archive = useMutation(api.nutrition.setCookSessionArchived)
  const remove = useMutation(api.nutrition.deleteCookSession)
  const action = useConfirmableAction()
  const rows = term
    ? [...(found ?? []), ...(showArchived ? (foundArchived ?? []) : [])]
    : [...active.results, ...(showArchived ? archived.results : [])]
  const loading = term
    ? found === undefined || (showArchived && foundArchived === undefined)
    : active.status === 'LoadingFirstPage'
  return (
    <section aria-label="Cooking batches">
      <Input
        className="mb-4 max-w-sm"
        aria-label="Search batches"
        placeholder="Search batches"
        maxLength={SEARCH_MAX_LENGTH}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {editing ? (
        <SessionEditor
          key={editing._id}
          session={editing}
          onClose={() => {
            setEditing(null)
            onEditing(false)
          }}
        />
      ) : null}
      {loading ? (
        <p role="status">Loading batches…</p>
      ) : !rows.length ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No batches found.
        </p>
      ) : (
        <div className="divide-y border-y">
          {rows.map((session) => (
            <div
              key={session._id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div>
                <p className="font-medium">{formatCookSessionLabel(session)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {session.archived
                    ? 'Archived'
                    : session.cookedByPersonName || 'Cooking batch'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={action.isRunning || Boolean(editing)}
                  onClick={() => onOpen(session._id)}
                >
                  Open batch
                </Button>
                <details>
                  <summary className="cursor-pointer px-3 py-1.5 text-sm text-muted-foreground">
                    Manage
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={action.isRunning || Boolean(editing)}
                      onClick={() => {
                        setEditing(session)
                        onEditing(true)
                      }}
                    >
                      Edit batch
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={action.isRunning || Boolean(editing)}
                      onClick={() =>
                        void action.runAction(
                          session.archived
                            ? 'Batch restored.'
                            : 'Batch archived.',
                          () =>
                            archive({
                              sessionId: session._id,
                              expectedEditRevision: session.editRevision,
                              archived: !session.archived,
                            }),
                        )
                      }
                    >
                      {session.archived ? 'Restore' : 'Archive'}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={action.isRunning || Boolean(editing)}
                      onClick={() =>
                        action.confirmAndRunAction(
                          'Delete this batch permanently? Batches containing cooked foods must be archived instead.',
                          'Batch deleted.',
                          () =>
                            remove({
                              sessionId: session._id,
                              expectedEditRevision: session.editRevision,
                            }),
                        )
                      }
                    >
                      Delete permanently
                    </Button>
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>
      )}
      {!term &&
      [active, ...(showArchived ? [archived] : [])].some(
        (p) => p.status === 'CanLoadMore' || p.status === 'LoadingMore',
      ) ? (
        <Button
          className="mt-4"
          variant="outline"
          disabled={[active, archived].some((p) => p.status === 'LoadingMore')}
          onClick={() => {
            if (active.status === 'CanLoadMore') active.loadMore(PAGE_SIZE)
            if (showArchived && archived.status === 'CanLoadMore')
              archived.loadMore(PAGE_SIZE)
          }}
        >
          Load more batches
        </Button>
      ) : null}
      {term ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Search shows up to 20 matches per active or archived view.
        </p>
      ) : null}
      <ConfirmDestructiveDialog
        open={action.isConfirmDialogOpen}
        onOpenChange={action.handleConfirmDialogOpenChange}
        description={action.pendingConfirmation?.message}
        onConfirm={action.confirmPendingAction}
        disabled={action.isRunning}
      />
    </section>
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
    <form
      className="mb-5 space-y-4 rounded-lg border bg-card p-4"
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
            ...(date === toLocalDateString(session.cookedAt)
              ? {}
              : { cookedOn: date }),
            cookedByPersonId: personId || undefined,
            notes,
          })
          onClose()
        })
      }}
    >
      <h2 className="font-medium">Edit batch</h2>
      <fieldset disabled={action.isRunning} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="batch-label">Batch label</Label>
            <Input
              id="batch-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Date</Label>
            <DatePicker
              ariaLabel="Batch date"
              value={date}
              onChange={setDate}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Cooked by</Label>
          <Select
            ariaLabel="Batch person"
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
        </div>
        <Textarea
          aria-label="Batch notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit">Save batch</Button>
        </div>
      </fieldset>
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
    </form>
  )
}
