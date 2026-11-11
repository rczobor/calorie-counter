import { LoadingRows, EditorSkeleton } from '@/components/page/loading-content'
import { usePersonSelection } from '@/features/households/use-person-selection'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import {
  useMutation,
  usePaginatedQuery,
  useQuery,
} from '@/features/households/convex-hooks'
import type { FunctionArgs, FunctionReturnType } from 'convex/server'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, SquarePen, Trash2, X, Zap } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { UnitInput } from '@/components/list/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PersonPicker } from '@/features/households/person-picker'
import { RowRemoveButton } from '@/components/list/record-list'
import { SearchField } from '@/components/list/search-field'
import { CustomIngredientSwitchRow } from '@/components/nutrition/ingredient-line-controls'
import {
  type MealDashboardIngredient as Ingredient,
  useMealDashboardDomainData,
} from '@/features/meals/use-meal-dashboard-domain-data'
import { useDraftPersistenceIdentity } from '@/features/cooking/draft-persistence-identity'
import {
  readMealDraft,
  writeMealDraft,
  type DraftMealItem,
  type MealDraft,
} from '@/features/meals/meal-draft'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { formatDate } from '@/lib/dates'
import { formatKcal, toLocalDateString } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import { Value } from '@/components/nutrition/value'
import { useLocale } from '@/i18n/locale'
import { messages } from './meal-editor.messages'

type MealMutationItem = FunctionArgs<
  typeof api.nutrition.createMeal
>['items'][number]
type CookedFood = FunctionReturnType<
  typeof api.cooking.listCookedFoods
>['page'][number]
type Template = FunctionReturnType<
  typeof api.savedFoods.listTemplates
>['page'][number]
type TemplateItem = Template['items'][number]
// Templates freeze nutrition in these two shapes; others need lookups the editor doesn't make.
type FrozenTemplateItem = Extract<
  TemplateItem,
  { sourceType: 'customByWeight' | 'fixedCalories' }
>
type SearchResult =
  | { kind: 'template'; template: Template; calories: number }
  | { kind: 'cooked'; food: CookedFood }
  | { kind: 'ingredient'; ingredient: Ingredient }

const RESULT_LIMIT = 8
const PAGE_SIZE = 50

function isFrozen(item: TemplateItem): item is FrozenTemplateItem {
  return (
    item.sourceType === 'customByWeight' || item.sourceType === 'fixedCalories'
  )
}

function frozenToDraft(item: FrozenTemplateItem): DraftMealItem {
  if (item.sourceType === 'fixedCalories') {
    return {
      sourceType: 'fixedCalories',
      name: item.name,
      calories: item.calories,
      macros: item.macros,
      notes: item.notes,
      nutritionProvenance: item.nutritionProvenance,
    }
  }
  return {
    sourceType: 'customByWeight',
    name: item.name,
    kcalPer100: item.kcalPer100,
    kcalBasisUnit: 'g',
    ignoreCalories: item.ignoreCalories,
    consumedWeightGrams: item.consumedWeightGrams,
    saveToCatalog: false,
    macros: item.macros,
    notes: item.notes,
    nutritionProvenance: item.nutritionProvenance,
  }
}

// Macros describe the calories they came with, so an edit keeps them only
// while those calories stay the same, as the server does.
function keptMacros(item: DraftMealItem, replacement: DraftMealItem) {
  if (
    item.sourceType === 'customByWeight' &&
    replacement.sourceType === 'customByWeight' &&
    item.kcalPer100 === replacement.kcalPer100 &&
    !replacement.ignoreCalories
  )
    return item.macros
  if (
    item.sourceType === 'fixedCalories' &&
    replacement.sourceType === 'fixedCalories' &&
    item.calories === replacement.calories
  )
    return item.macros
  return undefined
}

function frozenCalories(item: FrozenTemplateItem) {
  if (item.sourceType === 'fixedCalories') return item.calories
  return item.ignoreCalories
    ? 0
    : (item.consumedWeightGrams * item.kcalPer100) / 100
}

function toMealMutationItems(items: DraftMealItem[]): MealMutationItem[] {
  return items.map((item) => {
    if (item.sourceType === 'ingredient') {
      return {
        sourceType: 'ingredient',
        existingMealItemId: item.existingMealItemId,
        ingredientId: item.ingredientId,
        ...(item.existingMealItemId
          ? {}
          : {
              expectedSnapshot: {
                name: item.nameSnapshot,
                kcalPer100: item.kcalPer100Snapshot,
                kcalBasisUnit: item.kcalBasisUnitSnapshot,
                ignoreCalories: item.ignoreCaloriesSnapshot,
              },
            }),
        consumedWeightGrams: item.consumedWeightGrams,
        notes: item.notes,
      }
    }
    if (item.sourceType === 'cookedFood') {
      return {
        sourceType: 'cookedFood',
        existingMealItemId: item.existingMealItemId,
        cookedFoodId: item.cookedFoodId,
        ...(item.existingMealItemId
          ? {}
          : {
              expectedSnapshot: {
                name: item.nameSnapshot,
                kcalPer100: item.kcalPer100Snapshot,
                kcalBasisUnit: 'g' as const,
                ignoreCalories: false,
              },
            }),
        consumedWeightGrams: item.consumedWeightGrams,
        notes: item.notes,
      }
    }
    return item
  })
}

type MealEditorProps = {
  initialPersonId?: Id<'people'> | ''
  initialDate?: string
  mealId?: Id<'meals'>
  resumeDraft?: boolean
  onDone?: () => void
  onPendingChange?: (pending: boolean) => void
}

export function MealEditor(props: MealEditorProps) {
  const { isLoaded, userId } = useDraftPersistenceIdentity()
  return (
    <MealEditorContent
      key={isLoaded ? userId : 'loading'}
      userId={isLoaded ? userId : null}
      {...props}
    />
  )
}

function MealEditorContent({
  userId,
  initialPersonId,
  initialDate,
  mealId,
  resumeDraft = false,
  onDone = () => {},
  onPendingChange,
}: MealEditorProps & { userId: string | null }) {
  const locale = useLocale()
  const t = messages[locale]
  const [restoredDraft] = useState(() =>
    userId && resumeDraft ? readMealDraft(userId) : null,
  )
  const [showRestoredNotice, setShowRestoredNotice] = useState(
    Boolean(restoredDraft),
  )
  const persistenceFailedRef = useRef(false)
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false)

  const [selectedPersonId, setSelectedPersonId] = usePersonSelection(
    userId,
    () => {
      if (restoredDraft) return restoredDraft.selectedPersonId
      return initialPersonId
    },
  )

  const [mealDate, setMealDate] = useState(() => {
    if (restoredDraft) return restoredDraft.mealDate
    return initialDate ?? toLocalDateString(Date.now())
  })
  const [mealName, setMealName] = useState(restoredDraft?.mealName ?? '')
  const [editingMealId, setEditingMealId] = useState<Id<'meals'> | null>(
    restoredDraft?.editingMealId ?? mealId ?? null,
  )

  const [itemMode, setItemMode] = useState<
    'quick' | 'catalog' | 'new' | 'cookedFood'
  >(restoredDraft?.itemMode ?? 'quick')
  const [itemQuickName, setItemQuickName] = useState(
    restoredDraft?.itemQuickName ?? '',
  )
  const [itemQuickCalories, setItemQuickCalories] = useState(
    restoredDraft?.itemQuickCalories ?? '',
  )
  const [itemIngredientId, setItemIngredientId] = useState<
    Id<'ingredients'> | ''
  >(restoredDraft?.itemIngredientId ?? '')
  const [selectedCookSessionId, setSelectedCookSessionId] = useState<
    Id<'cookSessions'> | ''
  >(restoredDraft?.selectedCookSessionId ?? '')
  const [itemCookedFoodId, setItemCookedFoodId] = useState<
    Id<'cookedFoods'> | ''
  >(restoredDraft?.itemCookedFoodId ?? '')
  const [itemCustomName, setItemCustomName] = useState(
    restoredDraft?.itemCustomName ?? '',
  )
  const [itemCustomKcalPer100, setItemCustomKcalPer100] = useState(
    restoredDraft?.itemCustomKcalPer100 ?? '',
  )
  const [itemCustomIgnoreCalories, setItemCustomIgnoreCalories] = useState(
    restoredDraft?.itemCustomIgnoreCalories ?? false,
  )
  const [itemCustomSaveToCatalog, setItemCustomSaveToCatalog] = useState(
    restoredDraft?.itemCustomSaveToCatalog ?? true,
  )
  const [itemWeight, setItemWeight] = useState(restoredDraft?.itemWeight ?? '')
  const [editingDraftItemIndex, setEditingDraftItemIndex] = useState<
    number | null
  >(restoredDraft?.editingDraftItemIndex ?? null)
  const [mealItems, setMealItems] = useState<DraftMealItem[]>(
    restoredDraft?.mealItems ?? [],
  )
  // Search is the default way to add food. Quick calories and new foods open
  // their own panels; a restored draft reopens the panel it was filling in.
  const [query, setQuery] = useState('')
  // The search whose full match list is shown; any other search shows the first few.
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null)
  const [entry, setEntry] = useState<'search' | 'quick' | 'new'>(() => {
    if (
      restoredDraft?.itemMode === 'new' &&
      (restoredDraft.itemCustomName || restoredDraft.itemCustomKcalPer100)
    )
      return 'new'
    if (
      restoredDraft?.itemMode === 'quick' &&
      (restoredDraft.itemQuickName || restoredDraft.itemQuickCalories)
    )
      return 'quick'
    return 'search'
  })
  // Recovered edits keep their original snapshots and revision, even if the server meal is newer.
  const hydratedMealIdRef = useRef<Id<'meals'> | null>(
    restoredDraft?.editingMealId ?? null,
  )
  const [expectedMealEditRevision, setExpectedMealEditRevision] = useState(
    restoredDraft?.expectedMealEditRevision ?? 0,
  )
  const [expectedMealItemIds, setExpectedMealItemIds] = useState<
    Id<'mealItems'>[]
  >(restoredDraft?.expectedMealItemIds ?? [])
  const [hydratedMealId, setHydratedMealId] = useState<Id<'meals'> | null>(
    restoredDraft?.editingMealId ?? null,
  )
  const defaultPersonAppliedRef = useRef(false)
  const { isRunning, runAction } = useConfirmableAction()

  useEffect(() => {
    onPendingChange?.(isRunning)
  }, [isRunning, onPendingChange])

  const {
    people,
    ingredients,
    effectiveSelectedPersonId,
    editingMealDetail,
    paging,
  } = useMealDashboardDomainData({
    selectedPersonId,
    selectedCookSessionId,
    mealDate,
    showArchivedMeals: false,
    editingMealId,
    loadIngredients: true,
    // Search covers every batch below, so per-session lists aren't needed.
    loadCooking: false,
    loadMeals: false,
  })
  const cookedFoodsQuery = usePaginatedQuery(
    api.cooking.listCookedFoods,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const templatesQuery = usePaginatedQuery(
    api.savedFoods.listTemplates,
    {},
    { initialNumItems: PAGE_SIZE },
  )
  // A batch is dated by its cooking session, not by when it was entered.
  // Sessions page with the foods; until a batch's session loads it shows no
  // date rather than a wrong one.
  const cookSessionsQuery = usePaginatedQuery(
    api.cooking.listSessions,
    { archived: false },
    { initialNumItems: PAGE_SIZE },
  )
  const cookedAtBySession = new Map(
    cookSessionsQuery.results.map((session) => [session._id, session.cookedAt]),
  )
  const batchDate = (sessionId: Id<'cookSessions'>) => {
    const cookedAt = cookedAtBySession.get(sessionId)
    return cookedAt === undefined ? undefined : formatDate(cookedAt, locale)
  }

  useEffect(() => {
    if (selectedPersonId) {
      defaultPersonAppliedRef.current = true
      return
    }
    const firstPerson = people[0]
    if (defaultPersonAppliedRef.current || !firstPerson) {
      return
    }
    defaultPersonAppliedRef.current = true
    setSelectedPersonId(firstPerson._id)
  }, [people, selectedPersonId, setSelectedPersonId])

  const createMeal = useMutation(api.nutrition.createMeal)
  const updateMeal = useMutation(api.nutrition.updateMeal)
  const pointLoadedIngredient = useQuery(
    api.catalog.getIngredient,
    itemIngredientId &&
      !ingredients.some((ingredient) => ingredient._id === itemIngredientId)
      ? { ingredientId: itemIngredientId }
      : 'skip',
  )
  const pointLoadedCookedFoodDetail = useQuery(
    api.cooking.getCookedFoodDetail,
    itemCookedFoodId &&
      !cookedFoodsQuery.results.some(
        (cookedFood) => cookedFood._id === itemCookedFoodId,
      )
      ? { cookedFoodId: itemCookedFoodId }
      : 'skip',
  )
  const editingDraftItem =
    editingDraftItemIndex === null
      ? undefined
      : mealItems[editingDraftItemIndex]
  const stableHistoricalIngredientItem =
    editingDraftItem?.sourceType === 'ingredient' &&
    editingDraftItem.existingMealItemId &&
    editingDraftItem.ingredientId === itemIngredientId
      ? editingDraftItem
      : undefined
  const stableHistoricalCookedFoodItem =
    editingDraftItem?.sourceType === 'cookedFood' &&
    editingDraftItem.existingMealItemId &&
    editingDraftItem.cookedFoodId === itemCookedFoodId
      ? editingDraftItem
      : undefined
  const selectableIngredients = useMemo(
    () =>
      pointLoadedIngredient &&
      ((!pointLoadedIngredient.archived &&
        pointLoadedIngredient.kcalBasisUnit === 'g') ||
        Boolean(stableHistoricalIngredientItem)) &&
      !ingredients.some(
        (ingredient) => ingredient._id === pointLoadedIngredient._id,
      )
        ? [...ingredients, pointLoadedIngredient]
        : ingredients,
    [ingredients, pointLoadedIngredient, stableHistoricalIngredientItem],
  )
  const selectableCookedFoods = useMemo(() => {
    const restoredCookedFood = pointLoadedCookedFoodDetail?.cookedFood
    return restoredCookedFood &&
      (!restoredCookedFood.archived ||
        Boolean(stableHistoricalCookedFoodItem)) &&
      !cookedFoodsQuery.results.some(
        (cookedFood) => cookedFood._id === restoredCookedFood._id,
      )
      ? [restoredCookedFood, ...cookedFoodsQuery.results]
      : cookedFoodsQuery.results
  }, [
    cookedFoodsQuery.results,
    pointLoadedCookedFoodDetail,
    stableHistoricalCookedFoodItem,
  ])
  const ingredientById = useMemo(
    () => new Map(selectableIngredients.map((item) => [item._id, item])),
    [selectableIngredients],
  )
  const cookedFoodById = useMemo(
    () => new Map(selectableCookedFoods.map((item) => [item._id, item])),
    [selectableCookedFoods],
  )
  const usableTemplates = useMemo(
    () =>
      templatesQuery.results.flatMap((template) => {
        const items = template.items.filter(isFrozen)
        return items.length > 0 && items.length === template.items.length
          ? [
              {
                template,
                items,
                calories: items.reduce(
                  (sum, item) => sum + frozenCalories(item),
                  0,
                ),
              },
            ]
          : []
      }),
    [templatesQuery.results],
  )
  const getDraftItemCalories = (item: DraftMealItem) => {
    if (item.sourceType === 'ingredient') {
      if (item.ignoreCaloriesSnapshot) {
        return 0
      }
      return item.consumedWeightGrams * item.caloriesPerWeightSnapshot
    }
    if (item.sourceType === 'customByWeight') {
      if (item.ignoreCalories) {
        return 0
      }
      return (item.consumedWeightGrams * item.kcalPer100) / 100
    }
    if (item.sourceType === 'cookedFood') {
      return item.consumedWeightGrams * item.caloriesPerWeightSnapshot
    }
    return item.calories
  }

  const draftCalories = mealItems.reduce(
    (sum, item) => sum + getDraftItemCalories(item),
    0,
  )

  const canQuickAdd =
    itemQuickName.trim().length > 0 &&
    Number.isFinite(Number(itemQuickCalories)) &&
    Number(itemQuickCalories) > 0
  const canSubmitMeal =
    Boolean(effectiveSelectedPersonId) && mealItems.length > 0
  const isEditingMealHydrated =
    !editingMealId ||
    (editingMealDetail?.meal._id === editingMealId &&
      hydratedMealId === editingMealId)

  const selectedIngredient =
    itemIngredientId && itemMode === 'catalog'
      ? ingredientById.get(itemIngredientId)
      : undefined
  const selectedCookedFood =
    itemCookedFoodId && itemMode === 'cookedFood'
      ? cookedFoodById.get(itemCookedFoodId)
      : undefined

  const needle = query.trim().toLocaleLowerCase()
  const matches = (...texts: Array<string | undefined>) =>
    texts.some((text) => text?.toLocaleLowerCase().includes(needle))
  const matchingResults: SearchResult[] = needle
    ? [
        ...usableTemplates
          .filter(({ template }) => matches(template.name))
          .map(({ template, calories }) => ({
            kind: 'template' as const,
            template,
            calories,
          })),
        ...selectableCookedFoods
          .filter((food) => !food.archived && matches(food.name))
          .map((food) => ({ kind: 'cooked' as const, food })),
        ...selectableIngredients
          .filter(
            (ingredient) =>
              !ingredient.archived &&
              matches(ingredient.name, ingredient.brand),
          )
          .map((ingredient) => ({ kind: 'ingredient' as const, ingredient })),
      ]
    : []
  // Short by default, but every loaded match stays reachable: batches can share
  // a name across cooking sessions.
  const results =
    expandedQuery === needle
      ? matchingResults
      : matchingResults.slice(0, RESULT_LIMIT)

  // The food currently being weighed, from a search pick or an item being
  // edited. An edited food keeps its recorded nutrition, which Update saves.
  const editingIngredient =
    editingDraftItem?.sourceType === 'ingredient' &&
    editingDraftItem.ingredientId === itemIngredientId
      ? editingDraftItem
      : undefined
  const editingCookedFood =
    editingDraftItem?.sourceType === 'cookedFood' &&
    editingDraftItem.cookedFoodId === itemCookedFoodId
      ? editingDraftItem
      : undefined
  const activeFood =
    itemMode === 'catalog' && itemIngredientId
      ? editingIngredient
        ? {
            kind: 'ingredient' as const,
            name: editingIngredient.nameSnapshot,
            kcalPer100: editingIngredient.kcalPer100Snapshot,
            caloriesPerGram: editingIngredient.caloriesPerWeightSnapshot,
          }
        : selectedIngredient
          ? {
              kind: 'ingredient' as const,
              name: selectedIngredient.name,
              kcalPer100: selectedIngredient.kcalPer100,
              caloriesPerGram: selectedIngredient.ignoreCalories
                ? 0
                : selectedIngredient.kcalPer100 / 100,
            }
          : null
      : itemMode === 'cookedFood' && itemCookedFoodId
        ? editingCookedFood
          ? {
              kind: 'cooked' as const,
              name: editingCookedFood.nameSnapshot,
              kcalPer100: editingCookedFood.kcalPer100Snapshot,
              caloriesPerGram: editingCookedFood.caloriesPerWeightSnapshot,
            }
          : selectedCookedFood
            ? {
                kind: 'cooked' as const,
                name: selectedCookedFood.name,
                kcalPer100: selectedCookedFood.kcalPer100,
                caloriesPerGram: selectedCookedFood.kcalPer100 / 100,
              }
            : null
        : null
  const pickingFood =
    (itemMode === 'catalog' && Boolean(itemIngredientId)) ||
    (itemMode === 'cookedFood' && Boolean(itemCookedFoodId))
  // A food outside the loaded lists is fetched on its own; once that answers,
  // a missing `activeFood` means it was archived or changed elsewhere.
  const activeFoodUnavailable =
    pickingFood &&
    !activeFood &&
    (itemMode === 'catalog'
      ? pointLoadedIngredient !== undefined
      : pointLoadedCookedFoodDetail !== undefined)
  const panel = pickingFood
    ? 'food'
    : entry === 'quick'
      ? 'quick'
      : entry === 'new'
        ? 'new'
        : 'search'

  const resetDraftItemInputs = () => {
    setItemIngredientId('')
    setItemCookedFoodId('')
    setItemCustomName('')
    setItemCustomKcalPer100('')
    setItemCustomIgnoreCalories(false)
    setItemCustomSaveToCatalog(true)
    setItemWeight('')
    setItemQuickName('')
    setItemQuickCalories('')
    setEditingDraftItemIndex(null)
    setItemMode('quick')
    setEntry('search')
    setQuery('')
  }

  const upsertDraft = (nextDraft: DraftMealItem) => {
    if (editingDraftItemIndex !== null) {
      setMealItems((current) =>
        current.map((item, index) => {
          if (index !== editingDraftItemIndex) {
            return item
          }
          let replacement: DraftMealItem = {
            ...nextDraft,
            notes: item.notes,
          }
          if (
            item.sourceType === 'customByWeight' &&
            replacement.sourceType === 'customByWeight'
          ) {
            replacement = {
              ...replacement,
              ingredientId: item.ingredientId,
              kcalBasisUnit: item.kcalBasisUnit,
            }
          }
          const sameReference =
            (item.sourceType === 'ingredient' &&
              replacement.sourceType === 'ingredient' &&
              item.ingredientId === replacement.ingredientId) ||
            (item.sourceType === 'cookedFood' &&
              replacement.sourceType === 'cookedFood' &&
              item.cookedFoodId === replacement.cookedFoodId) ||
            (item.sourceType === 'customByWeight' &&
              replacement.sourceType === 'customByWeight') ||
            (item.sourceType === 'fixedCalories' &&
              replacement.sourceType === 'fixedCalories')
          if (!sameReference) return replacement
          // A correction keeps the food's source, as the server does for saved
          // items; a food added from a template has no saved item to fall back on.
          const macros = keptMacros(item, replacement)
          return {
            ...replacement,
            ...(macros ? { macros } : {}),
            nutritionProvenance: item.nutritionProvenance,
            ...(item.existingMealItemId
              ? { existingMealItemId: item.existingMealItemId }
              : {}),
          }
        }),
      )
    } else {
      setMealItems((current) => [...current, nextDraft])
    }
    resetDraftItemInputs()
  }

  const upsertDraftItem = () => {
    const parsedAmount = Number(itemWeight)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error(t.amountRequired)
      return
    }

    if (itemMode === 'catalog') {
      if (!itemIngredientId) {
        toast.error(t.selectIngredientFirst)
        return
      }
      const ingredient = ingredientById.get(itemIngredientId)
      const editingItem =
        editingDraftItemIndex === null
          ? undefined
          : mealItems[editingDraftItemIndex]
      const existingSnapshot =
        editingItem?.sourceType === 'ingredient' &&
        editingItem.ingredientId === itemIngredientId
          ? editingItem
          : undefined
      if (!ingredient && !existingSnapshot) {
        toast.error(t.ingredientUnavailable)
        return
      }
      upsertDraft({
        sourceType: 'ingredient',
        ingredientId: itemIngredientId,
        nameSnapshot: existingSnapshot?.nameSnapshot ?? ingredient!.name,
        kcalPer100Snapshot:
          existingSnapshot?.kcalPer100Snapshot ?? ingredient!.kcalPer100,
        kcalBasisUnitSnapshot:
          existingSnapshot?.kcalBasisUnitSnapshot ?? ingredient!.kcalBasisUnit,
        ignoreCaloriesSnapshot:
          existingSnapshot?.ignoreCaloriesSnapshot ??
          ingredient!.ignoreCalories,
        consumedWeightGrams: parsedAmount,
        caloriesPerWeightSnapshot:
          existingSnapshot?.caloriesPerWeightSnapshot ??
          (ingredient!.ignoreCalories ? 0 : ingredient!.kcalPer100 / 100),
      })
      return
    }

    if (itemMode === 'new') {
      if (!itemCustomName.trim()) {
        toast.error(t.newIngredientNameRequired)
        return
      }
      const parsedKcal = Number(itemCustomKcalPer100)
      if (
        !itemCustomIgnoreCalories &&
        (!Number.isFinite(parsedKcal) || parsedKcal <= 0)
      ) {
        toast.error(t.kcalPer100Required)
        return
      }
      const kcalPer100 =
        itemCustomIgnoreCalories &&
        (!Number.isFinite(parsedKcal) || parsedKcal < 0)
          ? 0
          : parsedKcal
      upsertDraft({
        sourceType: 'customByWeight',
        name: itemCustomName.trim(),
        kcalPer100,
        kcalBasisUnit: 'g',
        ignoreCalories: itemCustomIgnoreCalories,
        consumedWeightGrams: parsedAmount,
        saveToCatalog: itemCustomSaveToCatalog,
      })
      return
    }

    if (!itemCookedFoodId) {
      toast.error(t.selectCookedFoodFirst)
      return
    }
    const cookedFood = cookedFoodById.get(itemCookedFoodId)
    const editingItem =
      editingDraftItemIndex === null
        ? undefined
        : mealItems[editingDraftItemIndex]
    const existingSnapshot =
      editingItem?.sourceType === 'cookedFood' &&
      editingItem.cookedFoodId === itemCookedFoodId
        ? editingItem
        : undefined
    if (!cookedFood && !existingSnapshot) {
      toast.error(t.cookedFoodUnavailable)
      return
    }
    upsertDraft({
      sourceType: 'cookedFood',
      cookedFoodId: itemCookedFoodId,
      nameSnapshot: existingSnapshot?.nameSnapshot ?? cookedFood!.name,
      kcalPer100Snapshot:
        existingSnapshot?.kcalPer100Snapshot ?? cookedFood!.kcalPer100,
      consumedWeightGrams: parsedAmount,
      caloriesPerWeightSnapshot:
        existingSnapshot?.caloriesPerWeightSnapshot ??
        cookedFood!.kcalPer100 / 100,
    })
  }

  const addQuickItem = () => {
    const name = itemQuickName.trim()
    const calories = Number(itemQuickCalories)
    if (!name || !Number.isFinite(calories) || calories <= 0) {
      toast.error(t.quickItemRequired)
      return
    }
    upsertDraft({ sourceType: 'fixedCalories', name, calories })
  }

  const pickResult = (result: SearchResult) => {
    setQuery('')
    if (result.kind === 'template') {
      const items = result.template.items.filter(isFrozen)
      setMealItems((current) => [...current, ...items.map(frozenToDraft)])
      if (!mealName.trim()) setMealName(result.template.name)
      return
    }
    if (result.kind === 'cooked') {
      setItemMode('cookedFood')
      setSelectedCookSessionId(result.food.cookSessionId)
      setItemCookedFoodId(result.food._id)
      setItemIngredientId('')
      return
    }
    setItemMode('catalog')
    setItemIngredientId(result.ingredient._id)
    setItemCookedFoodId('')
  }

  const openQuick = (name = '') => {
    setItemIngredientId('')
    setItemCookedFoodId('')
    setItemMode('quick')
    if (name) setItemQuickName(name)
    setEntry('quick')
    setQuery('')
  }

  const openNew = (name = '') => {
    setItemIngredientId('')
    setItemCookedFoodId('')
    setItemMode('new')
    if (name) setItemCustomName(name)
    setEntry('new')
    setQuery('')
  }

  const editDraftItem = (index: number) => {
    const item = mealItems[index]
    if (!item) {
      return
    }
    setEditingDraftItemIndex(index)
    setQuery('')
    if (item.sourceType === 'ingredient') {
      setItemMode('catalog')
      setItemIngredientId(item.ingredientId)
      setItemCookedFoodId('')
      setItemWeight(item.consumedWeightGrams.toString())
      return
    }
    if (item.sourceType === 'customByWeight') {
      setItemMode('new')
      setEntry('new')
      setItemCustomName(item.name)
      setItemCustomKcalPer100(item.kcalPer100.toString())
      setItemCustomIgnoreCalories(item.ignoreCalories)
      setItemCustomSaveToCatalog(item.saveToCatalog)
      setItemWeight(item.consumedWeightGrams.toString())
      setItemIngredientId('')
      setItemCookedFoodId('')
      return
    }
    if (item.sourceType === 'fixedCalories') {
      setItemMode('quick')
      setEntry('quick')
      setItemQuickName(item.name)
      setItemQuickCalories(item.calories.toString())
      setItemIngredientId('')
      setItemCookedFoodId('')
      return
    }
    setItemMode('cookedFood')
    setItemCookedFoodId(item.cookedFoodId)
    setItemIngredientId('')
    const cookedFood = cookedFoodById.get(item.cookedFoodId)
    if (cookedFood) {
      setSelectedCookSessionId(cookedFood.cookSessionId)
    }
    setItemWeight(item.consumedWeightGrams.toString())
  }

  const removeDraftItem = (index: number) => {
    setMealItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    )

    if (editingDraftItemIndex === null) {
      return
    }
    if (editingDraftItemIndex === index) {
      resetDraftItemInputs()
      return
    }
    if (editingDraftItemIndex > index) {
      setEditingDraftItemIndex(editingDraftItemIndex - 1)
    }
  }

  const resetMealForm = () => {
    setShowRestoredNotice(false)
    setMealName('')
    setEditingMealId(null)
    setMealItems([])
    hydratedMealIdRef.current = null
    setExpectedMealEditRevision(0)
    setExpectedMealItemIds([])
    setHydratedMealId(null)
    resetDraftItemInputs()
  }

  useEffect(() => {
    if (
      !editingMealId ||
      !editingMealDetail ||
      editingMealDetail.meal._id !== editingMealId ||
      hydratedMealIdRef.current === editingMealId
    ) {
      return
    }
    setMealName(editingMealDetail.meal.name ?? '')
    setMealItems(
      editingMealDetail.items.map((row): DraftMealItem => {
        if (row.sourceType === 'ingredient') {
          return {
            sourceType: 'ingredient',
            existingMealItemId: row._id,
            ingredientId: row.ingredientId,
            nameSnapshot: row.nameSnapshot,
            kcalPer100Snapshot: row.kcalPer100Snapshot,
            kcalBasisUnitSnapshot: row.kcalBasisUnitSnapshot,
            ignoreCaloriesSnapshot: row.ignoreCaloriesSnapshot,
            consumedWeightGrams: row.consumedWeightGrams,
            caloriesPerWeightSnapshot:
              row.consumedWeightGrams > 0
                ? row.caloriesSnapshot / row.consumedWeightGrams
                : 0,
            notes: row.notes,
            nutritionProvenance: row.nutritionProvenance,
          }
        }
        if (row.sourceType === 'customByWeight') {
          return {
            sourceType: 'customByWeight',
            existingMealItemId: row._id,
            ingredientId: row.ingredientId,
            name: row.nameSnapshot,
            kcalPer100: row.kcalPer100Snapshot,
            kcalBasisUnit: row.kcalBasisUnitSnapshot,
            ignoreCalories: row.ignoreCaloriesSnapshot,
            consumedWeightGrams: row.consumedWeightGrams,
            saveToCatalog: false,
            notes: row.notes,
            nutritionProvenance: row.nutritionProvenance,
          }
        }
        if (row.sourceType === 'cookedFood') {
          return {
            sourceType: 'cookedFood',
            existingMealItemId: row._id,
            cookedFoodId: row.cookedFoodId,
            nameSnapshot: row.nameSnapshot,
            kcalPer100Snapshot: row.kcalPer100Snapshot,
            consumedWeightGrams: row.consumedWeightGrams,
            caloriesPerWeightSnapshot:
              row.consumedWeightGrams > 0
                ? row.caloriesSnapshot / row.consumedWeightGrams
                : 0,
            notes: row.notes,
            nutritionProvenance: row.nutritionProvenance,
          }
        }
        return {
          sourceType: 'fixedCalories',
          existingMealItemId: row._id,
          name: row.nameSnapshot,
          calories: row.caloriesSnapshot,
          notes: row.notes,
          nutritionProvenance: row.nutritionProvenance,
        }
      }),
    )
    setExpectedMealItemIds(editingMealDetail.items.map((row) => row._id))
    setExpectedMealEditRevision(editingMealDetail.meal.editRevision)
    hydratedMealIdRef.current = editingMealId
    setHydratedMealId(editingMealId)
  }, [editingMealDetail, editingMealId])

  const draft = {
    selectedPersonId,
    mealDate,
    mealName,
    editingMealId,
    mealItems,
    expectedMealEditRevision,
    expectedMealItemIds,
    itemMode,
    itemQuickName,
    itemQuickCalories,
    itemIngredientId,
    selectedCookSessionId,
    itemCookedFoodId,
    itemCustomName,
    itemCustomKcalPer100,
    itemCustomIgnoreCalories,
    itemCustomSaveToCatalog,
    itemWeight,
    editingDraftItemIndex,
  } satisfies MealDraft
  const hasDraft = Boolean(
    editingMealId ||
    mealName ||
    mealItems.length ||
    itemQuickName ||
    itemQuickCalories ||
    itemIngredientId ||
    itemCookedFoodId ||
    itemCustomName ||
    itemCustomKcalPer100 ||
    itemWeight ||
    itemCustomIgnoreCalories ||
    !itemCustomSaveToCatalog,
  )
  const serializedDraft = hasDraft
    ? JSON.stringify({ version: 1, draft })
    : null
  const canPersistDraft = !editingMealId || hydratedMealId === editingMealId

  useEffect(() => {
    if (userId && canPersistDraft) {
      const saved = writeMealDraft(userId, serializedDraft)
      if (!saved && !persistenceFailedRef.current) {
        toast.warning(t.draftRecoveryUnavailable)
      }
      persistenceFailedRef.current = !saved
    }
  }, [userId, serializedDraft, canPersistDraft, t.draftRecoveryUnavailable])

  if (paging.people.isLoadingFirstPage) return <EditorSkeleton />

  const saveMeal = () => {
    if (!effectiveSelectedPersonId || mealItems.length === 0) {
      toast.error(t.itemsRequired)
      return
    }
    void runAction(editingMealId ? t.mealUpdated : t.mealCreated, async () => {
      if (editingMealId) {
        await updateMeal({
          mealId: editingMealId,
          expectedEditRevision: expectedMealEditRevision,
          expectedMealItemIds,
          personId: effectiveSelectedPersonId,
          name: mealName.trim() || undefined,
          eatenOn: mealDate,
          items: toMealMutationItems(mealItems),
        })
      } else {
        await createMeal({
          personId: effectiveSelectedPersonId,
          name: mealName.trim() || undefined,
          eatenOn: mealDate,
          items: toMealMutationItems(mealItems),
        })
      }
      resetMealForm()
      if (userId) writeMealDraft(userId, null)
      onDone()
    })
  }

  const editingLabel =
    editingDraftItemIndex !== null ? (
      <p className="type-footnote font-medium text-muted-foreground">
        {t.editingItem(editingDraftItemIndex + 1)}
      </p>
    ) : null
  // Text, not a second ×, so it can't be mistaken for closing the whole sheet.
  const closePanel = (
    <Button
      variant="ghost"
      size="sm"
      className="-mt-1.5 -mr-2.5 shrink-0"
      onClick={resetDraftItemInputs}
    >
      {t.cancel}
    </Button>
  )
  const resultRow = (
    key: string,
    title: string,
    detail: string,
    onSelect: () => void,
    Icon = Plus,
  ) => (
    <li key={key}>
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-14 w-full items-center justify-between gap-3 py-2.5 pr-3.5 pl-4 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0">
          <span className="block truncate type-callout font-medium">
            {title}
          </span>
          <span className="mt-0.5 block truncate type-footnote text-muted-foreground tabular-nums">
            {detail}
          </span>
        </span>
        <Icon aria-hidden="true" className="size-5 shrink-0 text-foreground" />
      </button>
    </li>
  )
  const describe = (result: SearchResult) =>
    result.kind === 'template'
      ? resultRow(
          `t-${result.template._id}`,
          result.template.name,
          [
            t.mealTemplate,
            t.foodCount(result.template.items.length),
            `${result.calories.toFixed(0)} kcal`,
          ].join(' · '),
          () => pickResult(result),
        )
      : result.kind === 'cooked'
        ? resultRow(
            `c-${result.food._id}`,
            result.food.name,
            [
              t.cookedBatch,
              batchDate(result.food.cookSessionId),
              `${formatKcal(result.food.kcalPer100)} kcal/100 g`,
            ]
              .filter(Boolean)
              .join(' · '),
            () => pickResult(result),
          )
        : resultRow(
            `i-${result.ingredient._id}`,
            result.ingredient.name,
            [
              t.ingredient,
              result.ingredient.brand,
              `${formatKcal(result.ingredient.kcalPer100)} kcal/100 g`,
            ]
              .filter(Boolean)
              .join(' · '),
            () => pickResult(result),
          )
  const suggestions: SearchResult[] = [
    ...usableTemplates.slice(0, 3).map(({ template, calories }) => ({
      kind: 'template' as const,
      template,
      calories,
    })),
    ...selectableCookedFoods
      .filter((food) => !food.archived)
      .slice(0, 3)
      .map((food) => ({ kind: 'cooked' as const, food })),
  ]

  return (
    <>
      {/* Fills a fixed-height sheet so the footer stays put as the panels change. */}
      <div className="flex flex-1 flex-col gap-5">
        {editingMealId && editingMealDetail === null ? (
          <p role="alert" className="type-subhead text-destructive">
            {t.mealUnavailable}
          </p>
        ) : null}
        {showRestoredNotice ? (
          <p className="type-subhead text-muted-foreground" role="status">
            {t.draftRestored}
          </p>
        ) : null}
        <fieldset
          className="flex min-w-0 flex-1 flex-col gap-5"
          disabled={isRunning}
        >
          {editingMealId && mealName.trim() ? (
            // The meal being corrected, named up top; its field sits below the foods.
            <button
              type="button"
              className="-mt-1 -mb-2 flex max-w-full min-w-0 items-start gap-1.5 self-start text-left type-subhead font-medium text-foreground"
              onClick={() => document.getElementById('mealName')?.focus()}
            >
              <span className="line-clamp-2">{mealName}</span>
              <Pencil
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="sr-only">{t.rename}</span>
            </button>
          ) : null}
          {people.length === 0 ? (
            <p className="type-subhead text-muted-foreground">{t.noPeople}</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <PersonPicker
                options={people.map((person) => ({
                  value: person._id,
                  label: person.name,
                  you: person.linkedAccount === 'you',
                }))}
                value={effectiveSelectedPersonId || null}
                onValueChange={(value) =>
                  setSelectedPersonId(value ?? ('' as Id<'people'>))
                }
              />
              <DatePicker
                variant="chip"
                value={mealDate}
                onChange={setMealDate}
                ariaLabel={t.mealDate}
                label={formatDate(mealDate, locale)}
              />
              {paging.people.canLoadMore || paging.people.isLoadingMore ? (
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={paging.people.isLoadingMore}
                  aria-busy={paging.people.isLoadingMore}
                  onClick={paging.people.loadMore}
                >
                  {t.loadMorePeople}
                </Button>
              ) : null}
              {selectedPersonId &&
              !effectiveSelectedPersonId &&
              !paging.people.isLoadingFirstPage ? (
                <p
                  role="status"
                  className="w-full type-subhead text-muted-foreground"
                >
                  {t.personUnavailable}
                </p>
              ) : null}
            </div>
          )}
          {editingMealId && !isEditingMealHydrated ? (
            <LoadingRows label={t.loadingMealItems} rows={1} />
          ) : null}
          <fieldset
            className="min-w-0 space-y-5"
            disabled={!isEditingMealHydrated}
          >
            {panel === 'food' ? (
              <div className="inset-group p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 pt-1">
                    {editingLabel}
                    <p className="type-headline">
                      {activeFood?.name ??
                        (activeFoodUnavailable
                          ? t.foodUnavailable
                          : t.loadingFood)}
                    </p>
                    {activeFood ? (
                      <p className="mt-0.5 type-footnote text-muted-foreground tabular-nums">
                        {activeFood.kind === 'cooked'
                          ? t.cookedBatch
                          : t.ingredient}{' '}
                        · {formatKcal(activeFood.kcalPer100)} kcal/100 g
                      </p>
                    ) : null}
                  </div>
                  {closePanel}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {/* Stops growing with the field on wide screens, so the
                      result stays beside it. */}
                  <div className="min-w-0 flex-1 md:w-60 md:flex-none">
                    <UnitInput
                      unit="g"
                      type="number"
                      inputMode="decimal"
                      autoFocus
                      aria-label={
                        activeFood?.kind === 'cooked'
                          ? t.cookedFoodGrams
                          : t.ingredientGrams
                      }
                      placeholder={t.amount}
                      value={itemWeight}
                      onChange={(event) => setItemWeight(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') upsertDraftItem()
                      }}
                    />
                  </div>
                  <span
                    className="w-20 shrink-0 text-right text-base font-semibold text-foreground tabular-nums"
                    aria-live="polite"
                  >
                    {activeFood && Number(itemWeight) > 0
                      ? `${(Number(itemWeight) * activeFood.caloriesPerGram).toFixed(0)} kcal`
                      : null}
                  </span>
                  <Button
                    className="px-4"
                    onClick={upsertDraftItem}
                    disabled={!activeFood || !(Number(itemWeight) > 0)}
                  >
                    <Plus />
                    {editingDraftItemIndex === null ? t.add : t.update}
                  </Button>
                </div>
              </div>
            ) : panel === 'quick' ? (
              <div className="inset-group p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 pt-1">
                    {editingLabel}
                    <p className="type-headline">{t.quickCalories}</p>
                    <p className="mt-0.5 type-footnote text-muted-foreground">
                      {t.quickCaloriesHint}
                    </p>
                  </div>
                  {closePanel}
                </div>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
                  <div className="space-y-1.5">
                    <Label htmlFor="quickName">{t.food}</Label>
                    <Input
                      id="quickName"
                      aria-label={t.quickAddName}
                      placeholder={t.quickAddNamePlaceholder}
                      autoFocus={!itemQuickName}
                      value={itemQuickName}
                      onChange={(event) => setItemQuickName(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quickCalories">{t.calories}</Label>
                    <UnitInput
                      unit="kcal"
                      id="quickCalories"
                      type="number"
                      inputMode="numeric"
                      aria-label={t.quickAddCalories}
                      autoFocus={Boolean(itemQuickName)}
                      value={itemQuickCalories}
                      onChange={(event) =>
                        setItemQuickCalories(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && canQuickAdd) addQuickItem()
                      }}
                    />
                  </div>
                  <Button
                    className="col-span-full sm:col-span-1 sm:self-end"
                    disabled={!canQuickAdd}
                    onClick={addQuickItem}
                  >
                    <Plus />
                    {editingDraftItemIndex === null ? t.add : t.update}
                  </Button>
                </div>
              </div>
            ) : panel === 'new' ? (
              <div className="inset-group p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 pt-1">
                    {editingLabel}
                    <p className="type-headline">{t.newFood}</p>
                    <p className="mt-0.5 type-footnote text-muted-foreground">
                      {t.newFoodHint}
                    </p>
                  </div>
                  {closePanel}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <Input
                    aria-label={t.customName}
                    placeholder={t.customNamePlaceholder}
                    autoFocus={!itemCustomName}
                    className="col-span-2 sm:col-span-1"
                    value={itemCustomName}
                    onChange={(event) => setItemCustomName(event.target.value)}
                  />
                  {itemCustomIgnoreCalories ? null : (
                    <Input
                      type="number"
                      inputMode="decimal"
                      aria-label={t.customKcalPer100}
                      placeholder="kcal/100 g"
                      autoFocus={Boolean(itemCustomName)}
                      value={itemCustomKcalPer100}
                      onChange={(event) =>
                        setItemCustomKcalPer100(event.target.value)
                      }
                    />
                  )}
                  <Input
                    type="number"
                    inputMode="decimal"
                    aria-label={t.customGrams}
                    placeholder={t.gramsPlaceholder}
                    value={itemWeight}
                    onChange={(event) => setItemWeight(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') upsertDraftItem()
                    }}
                  />
                  <Button
                    className="col-span-2 sm:col-span-1"
                    onClick={upsertDraftItem}
                    disabled={
                      !itemCustomName.trim() ||
                      Number(itemWeight) <= 0 ||
                      (!itemCustomIgnoreCalories &&
                        Number(itemCustomKcalPer100) <= 0)
                    }
                  >
                    <Plus />
                    {editingDraftItemIndex === null ? t.add : t.update}
                  </Button>
                  <CustomIngredientSwitchRow
                    ignoreCalories={itemCustomIgnoreCalories}
                    onIgnoreCaloriesChange={setItemCustomIgnoreCalories}
                    saveToCatalog={itemCustomSaveToCatalog}
                    onSaveToCatalogChange={setItemCustomSaveToCatalog}
                  />
                </div>
              </div>
            ) : (
              <div>
                <SearchField
                  label={t.searchFoods}
                  placeholder={t.searchPlaceholder}
                  autoFocus={!editingMealId}
                  value={query}
                  onValueChange={(value) => {
                    setQuery(value)
                    setExpandedQuery(null)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || !needle) return
                    event.preventDefault()
                    if (results[0]) pickResult(results[0])
                    else openQuick(query.trim())
                  }}
                />
                {needle ? (
                  <>
                    {results.length > 0 ? (
                      <>
                        {/* A quiet group label, like "Or add it yourself"
                            below; the list keeps its own name. */}
                        <p className="mt-5 group-label">{t.matches}</p>
                        <ul
                          aria-label={t.searchResults}
                          className="inset-group inset-rows"
                        >
                          {results.map(describe)}
                        </ul>
                      </>
                    ) : null}
                    {matchingResults.length > results.length ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 ml-0.5 self-start"
                        onClick={() => setExpandedQuery(needle)}
                      >
                        {t.showAllMatches(matchingResults.length)}
                      </Button>
                    ) : null}
                    <p id="add-yourself-label" className="mt-5 group-label">
                      {results.length > 0 ? t.orAddYourself : t.noMatches}
                    </p>
                    <ul
                      aria-labelledby="add-yourself-label"
                      className="inset-group inset-rows"
                    >
                      {resultRow(
                        'quick',
                        t.quickAddQuery(query.trim()),
                        t.enterCalories,
                        () => openQuick(query.trim()),
                        Zap,
                      )}
                      {/* A compose glyph, so creating a food never reads
                          like adding one of the matches above. */}
                      {resultRow(
                        'new',
                        t.newFoodQuery(query.trim()),
                        t.enterKcalPer100,
                        () => openNew(query.trim()),
                        SquarePen,
                      )}
                    </ul>
                  </>
                ) : (
                  <>
                    {/* Full size to start a meal; once it has foods, a compact
                        row, so the foods being corrected lead. */}
                    <div
                      className={cn(
                        'mt-3 gap-2',
                        mealItems.length === 0 ? 'grid grid-cols-2' : 'flex',
                      )}
                    >
                      <Button
                        variant="outline"
                        size={mealItems.length === 0 ? 'default' : 'sm'}
                        className="justify-start pl-3.5"
                        onClick={() => openQuick()}
                      >
                        <Zap />
                        {t.quickCalories}
                      </Button>
                      <Button
                        variant="outline"
                        size={mealItems.length === 0 ? 'default' : 'sm'}
                        className="justify-start pl-3.5"
                        onClick={() => openNew()}
                      >
                        <SquarePen />
                        {t.newFood}
                      </Button>
                    </div>
                    {/* Suggestions help start a meal; once it has foods, they'd push those below the fold. */}
                    {suggestions.length > 0 && mealItems.length === 0 ? (
                      <>
                        <p className="mt-5 group-label">{t.suggestions}</p>
                        <ul className="inset-group inset-rows">
                          {suggestions.map(describe)}
                        </ul>
                      </>
                    ) : null}
                  </>
                )}
                {paging.ingredients.canLoadMore ||
                cookedFoodsQuery.status === 'CanLoadMore' ||
                templatesQuery.status === 'CanLoadMore' ||
                cookSessionsQuery.status === 'CanLoadMore' ? (
                  <p className="mt-2 px-4 type-footnote text-muted-foreground">
                    {t.searchCoversLoaded}{' '}
                    <button
                      type="button"
                      className="font-medium text-foreground underline underline-offset-4"
                      onClick={() => {
                        if (paging.ingredients.canLoadMore)
                          paging.ingredients.loadMore()
                        if (cookedFoodsQuery.status === 'CanLoadMore')
                          cookedFoodsQuery.loadMore(PAGE_SIZE)
                        if (templatesQuery.status === 'CanLoadMore')
                          templatesQuery.loadMore(PAGE_SIZE)
                        if (cookSessionsQuery.status === 'CanLoadMore')
                          cookSessionsQuery.loadMore(PAGE_SIZE)
                      }}
                    >
                      {t.loadMore}
                    </button>
                  </p>
                ) : null}
              </div>
            )}

            {mealItems.length > 0 ? (
              <section aria-label={t.foodsInMeal}>
                <p className="flex justify-between gap-3 group-label">
                  <span>{t.inThisMeal(mealItems.length)}</span>
                  <span className="font-normal">{t.tapToEdit}</span>
                </p>
                <ul className="inset-group inset-rows">
                  {mealItems.map((item, index) => {
                    const itemCalories = getDraftItemCalories(item)
                    const label =
                      item.sourceType === 'ingredient' ||
                      item.sourceType === 'cookedFood'
                        ? item.nameSnapshot
                        : item.name
                    const grams =
                      item.sourceType === 'fixedCalories'
                        ? null
                        : `${item.consumedWeightGrams.toFixed(0)} g`
                    const kcal = `${itemCalories.toFixed(0)} kcal`
                    return (
                      <li
                        key={`draft-item-${index}`}
                        className={cn(
                          'flex items-start gap-1 pr-0.5',
                          editingDraftItemIndex === index && 'bg-accent',
                        )}
                      >
                        {/* Tapping a food edits it; removal stays a separate, quieter action. */}
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            aria-label={t.editItem(
                              label,
                              grams ? `${grams} · ${kcal}` : kcal,
                            )}
                            onClick={() => editDraftItem(index)}
                            className="flex min-h-14 w-full items-center gap-3 py-2.5 pr-2 pl-4 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate type-callout">
                                {label}
                              </span>
                              {grams ? (
                                <span className="mt-0.5 block type-footnote text-muted-foreground tabular-nums">
                                  {grams}
                                </span>
                              ) : null}
                            </span>
                            <Value
                              size="nested"
                              value={itemCalories.toFixed(0)}
                              className="shrink-0 text-right"
                            />
                          </button>
                          {item.nutritionProvenance ? (
                            <div className="px-4 pb-2.5">
                              <EstimateNotice
                                provenance={item.nutritionProvenance}
                              />
                            </div>
                          ) : null}
                        </div>
                        {/* Centred on the row's first 56px, beside the kcal. */}
                        <RowRemoveButton
                          className="mt-1.5"
                          label={t.removeItem(label)}
                          onClick={() => removeDraftItem(index)}
                        >
                          <Trash2 />
                        </RowRemoveButton>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ) : null}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="mealName" className="block">
              {t.mealName}{' '}
              <span className="font-normal text-muted-foreground">
                {t.optional}
              </span>
            </Label>
            <Input
              id="mealName"
              aria-label={t.mealName}
              placeholder={t.mealNamePlaceholder}
              // Loading the edited meal sets its name; typing first would be lost.
              disabled={!isEditingMealHydrated}
              value={mealName}
              onChange={(event) => setMealName(event.target.value)}
            />
          </div>
          {editingMealId || mealName || mealItems.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-0.5 self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setIsDiscardDialogOpen(true)}
            >
              {editingMealId ? <X /> : <Trash2 />}
              {editingMealId ? t.cancelEdit : t.discardDraft}
            </Button>
          ) : null}

          {/* A translucent toolbar: content scrolls under it, blurred. */}
          <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex items-center justify-between gap-3 border-t bg-background/85 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-xl [@media(prefers-reduced-transparency:reduce)]:bg-background">
            <div className="tabular-nums">
              <p className="type-footnote text-muted-foreground">
                {t.mealTotal}
              </p>
              <p>
                <Value size="stat" value={draftCalories.toFixed(0)} />
              </p>
            </div>
            <Button
              size="lg"
              disabled={!canSubmitMeal || isRunning || !isEditingMealHydrated}
              onClick={saveMeal}
            >
              {mealItems.length > 0
                ? t.saveMealWithCount(mealItems.length)
                : t.saveMeal}
            </Button>
          </div>
        </fieldset>
      </div>
      <ConfirmDestructiveDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onConfirm={() => {
          resetMealForm()
          if (userId) writeMealDraft(userId, null)
          setIsDiscardDialogOpen(false)
          onDone()
        }}
        title={t.discardDraftTitle}
        description={t.discardDraftDescription}
        confirmLabel={t.discardDraft}
        disabled={isRunning}
      />
    </>
  )
}
