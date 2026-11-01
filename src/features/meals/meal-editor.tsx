import { usePersonSelection } from '@/features/households/use-person-selection'
import { EstimateNotice } from '@/components/nutrition/estimate-notice'
import { useMutation, useQuery } from '@/features/households/convex-hooks'
import type { FunctionArgs } from 'convex/server'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumnDef } from '@/components/ui/data-table'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchablePicker } from '@/components/ui/searchable-picker'
import { Select } from '@/components/ui/select'
import { Toggle } from '@/components/ui/toggle'
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
import {
  formatCookSessionLabel,
  formatKcalPer100,
  toLocalDateString,
} from '@/lib/nutrition'

type MealMutationItem = FunctionArgs<
  typeof api.nutrition.createMeal
>['items'][number]

type IngredientSelectionRow = {
  id: Id<'ingredients'>
  ingredient: Ingredient
  name: string
  kcalPer100: number
  ignoreCalories: boolean
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
  const defaultCookSessionAppliedRef = useRef(false)
  const { isRunning, runAction } = useConfirmableAction()

  useEffect(() => {
    onPendingChange?.(isRunning)
  }, [isRunning, onPendingChange])

  const {
    people,
    ingredients,
    cookSessions,
    cookedFoods,
    effectiveSelectedPersonId,
    effectiveCookSessionId,
    editingMealDetail,
    paging,
    isLoading,
  } = useMealDashboardDomainData({
    selectedPersonId,
    selectedCookSessionId,
    mealDate,
    showArchivedMeals: false,
    editingMealId,
    loadIngredients: itemMode === 'catalog' || Boolean(itemIngredientId),
    loadCooking: itemMode === 'cookedFood' || Boolean(itemCookedFoodId),
    loadMeals: false,
  })

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

  useEffect(() => {
    if (selectedCookSessionId) {
      defaultCookSessionAppliedRef.current = true
      return
    }
    const firstSession = cookSessions[0]
    if (defaultCookSessionAppliedRef.current || !firstSession) {
      return
    }
    defaultCookSessionAppliedRef.current = true
    setSelectedCookSessionId(firstSession._id)
  }, [cookSessions, selectedCookSessionId])

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
      !cookedFoods.some((cookedFood) => cookedFood._id === itemCookedFoodId)
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
      !cookedFoods.some(
        (cookedFood) => cookedFood._id === restoredCookedFood._id,
      )
      ? [restoredCookedFood, ...cookedFoods]
      : cookedFoods
  }, [cookedFoods, pointLoadedCookedFoodDetail, stableHistoricalCookedFoodItem])
  const ingredientById = useMemo(
    () => new Map(selectableIngredients.map((item) => [item._id, item])),
    [selectableIngredients],
  )
  const cookedFoodById = useMemo(
    () => new Map(selectableCookedFoods.map((item) => [item._id, item])),
    [selectableCookedFoods],
  )
  const restoredCookSession = pointLoadedCookedFoodDetail?.cookSession
  const selectableCookSessions = useMemo(
    () =>
      restoredCookSession &&
      !cookSessions.some((session) => session._id === restoredCookSession._id)
        ? [restoredCookSession, ...cookSessions]
        : cookSessions,
    [cookSessions, restoredCookSession],
  )
  const restoredCookSessionId =
    itemMode === 'cookedFood' &&
    itemCookedFoodId &&
    pointLoadedCookedFoodDetail?.cookedFood._id === itemCookedFoodId
      ? pointLoadedCookedFoodDetail.cookedFood.cookSessionId
      : ''
  const displayedCookSessionId = restoredCookSessionId || effectiveCookSessionId
  const sessionOptions = useMemo(
    () =>
      selectableCookSessions.map((session) => ({
        value: session._id,
        label: formatCookSessionLabel(session),
      })),
    [selectableCookSessions],
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

  const ingredientSelectionRows = useMemo<IngredientSelectionRow[]>(
    () =>
      selectableIngredients.map((ingredient) => ({
        id: ingredient._id,
        ingredient,
        name: ingredient.name,
        kcalPer100: ingredient.kcalPer100,
        ignoreCalories: Boolean(ingredient.ignoreCalories),
      })),
    [selectableIngredients],
  )

  const ingredientSelectionColumns: DataTableColumnDef<IngredientSelectionRow>[] =
    [
      {
        accessorKey: 'name',
        header: 'Ingredient',
        cell: ({ row }) => (
          <div className="max-w-56 whitespace-normal">
            <p className="font-medium text-foreground">{row.original.name}</p>
            {row.original.ingredient.brand ? (
              <p className="text-xs text-muted-foreground">
                {row.original.ingredient.brand}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'kcalPer100',
        header: 'kcal/100',
        cell: ({ row }) => formatKcalPer100(row.original.kcalPer100),
      },
      {
        accessorKey: 'ignoreCalories',
        header: 'Calories',
        cell: ({ row }) =>
          row.original.ignoreCalories ? (
            <span className="text-xs text-muted-foreground">Ignored</span>
          ) : (
            <span className="text-xs text-muted-foreground">Counted</span>
          ),
      },
      {
        id: 'pick',
        header: () => <div className="text-right">Pick</div>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant={
                itemIngredientId === row.original.id ? 'default' : 'outline'
              }
              onClick={() => {
                setItemMode('catalog')
                setItemIngredientId(row.original.id)
              }}
            >
              {itemIngredientId === row.original.id ? 'Selected' : 'Select'}
            </Button>
          </div>
        ),
      },
    ]

  const selectedIngredient =
    itemIngredientId && itemMode === 'catalog'
      ? ingredientById.get(itemIngredientId)
      : undefined
  const selectedCookedFood =
    itemCookedFoodId && itemMode === 'cookedFood'
      ? cookedFoodById.get(itemCookedFoodId)
      : undefined

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
          return sameReference && item.existingMealItemId
            ? {
                ...replacement,
                existingMealItemId: item.existingMealItemId,
              }
            : replacement
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
      toast.error('Enter an amount greater than 0.')
      return
    }

    if (itemMode === 'catalog') {
      if (!itemIngredientId) {
        toast.error('Select an ingredient first.')
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
        toast.error('Selected ingredient is not available.')
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
        toast.error('Name is required for a new ingredient.')
        return
      }
      const parsedKcal = Number(itemCustomKcalPer100)
      if (
        !itemCustomIgnoreCalories &&
        (!Number.isFinite(parsedKcal) || parsedKcal <= 0)
      ) {
        toast.error('Calories per 100g must be greater than 0.')
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
      toast.error('Select a cooked food first.')
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
      toast.error('Selected cooked food is not available.')
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

  const editDraftItem = (index: number) => {
    const item = mealItems[index]
    if (!item) {
      return
    }
    setEditingDraftItemIndex(index)
    if (item.sourceType === 'ingredient') {
      setItemMode('catalog')
      setItemIngredientId(item.ingredientId)
      setItemCookedFoodId('')
      setItemWeight(item.consumedWeightGrams.toString())
      return
    }
    if (item.sourceType === 'customByWeight') {
      setItemMode('new')
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
        toast.warning(
          'Draft recovery is unavailable. Keep this tab open until you save your meal.',
        )
      }
      persistenceFailedRef.current = !saved
    }
  }, [userId, serializedDraft, canPersistDraft])

  if (isLoading)
    return (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        Loading meal editor…
      </p>
    )

  return (
    <>
      <div className="space-y-4">
        {editingMealId && editingMealDetail === null ? (
          <p role="alert" className="text-sm text-destructive">
            This meal is no longer available. Your draft is preserved; close the
            editor to keep it in this tab.
          </p>
        ) : null}
        {showRestoredNotice ? (
          <p className="text-sm text-muted-foreground" role="status">
            Draft restored in this tab.
          </p>
        ) : null}
        <fieldset className="min-w-0 space-y-4" disabled={isRunning}>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label className="uppercase tracking-[0.08em] text-muted-foreground">
                Person
              </Label>
              {people.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add an active person in Manage before creating meals.
                </p>
              ) : (
                <div className="space-y-2">
                  <Select
                    options={people.map((person) => ({
                      value: person._id,
                      label: person.name,
                    }))}
                    value={effectiveSelectedPersonId || null}
                    onValueChange={(value) =>
                      setSelectedPersonId(value ?? ('' as Id<'people'>))
                    }
                    placeholder="Select person"
                    ariaLabel="Select person"
                  />
                  {selectedPersonId &&
                  !effectiveSelectedPersonId &&
                  !isLoading ? (
                    <p role="status" className="text-sm text-muted-foreground">
                      The selected person is unavailable. Choose an active
                      person to log a meal.
                    </p>
                  ) : null}
                  {paging.people.canLoadMore || paging.people.isLoadingMore ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={paging.people.isLoadingMore}
                      onClick={paging.people.loadMore}
                    >
                      {paging.people.isLoadingMore
                        ? 'Loading more people...'
                        : 'Load more people'}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="uppercase tracking-[0.08em] text-muted-foreground">
                Date
              </Label>
              <DatePicker
                value={mealDate}
                onChange={setMealDate}
                ariaLabel="Meal date"
                className="w-full justify-start"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mealName">Meal name</Label>
            <Input
              id="mealName"
              aria-label="Meal name"
              placeholder="Breakfast, lunch, snack"
              value={mealName}
              onChange={(event) => setMealName(event.target.value)}
            />
          </div>
          {editingMealId && !isEditingMealHydrated ? (
            <p className="text-sm text-muted-foreground" role="status">
              Loading meal items...
            </p>
          ) : null}
          <fieldset className="min-w-0" disabled={!isEditingMealHydrated}>
            <div className="mt-1 border-t border-border/40 pt-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Foods
              </p>
              <details
                open={mealItems.length === 0 || editingDraftItemIndex !== null}
              >
                <summary className="cursor-pointer py-2 text-sm font-medium">
                  Add or replace food
                </summary>
                <div className="mt-2">
                  <div className="inline-flex rounded-xl border border-border/80 bg-muted/35 p-1">
                    {(
                      [
                        ['quick', 'Quick'],
                        ['catalog', 'Ingredient'],
                        ['new', 'New'],
                        ['cookedFood', 'Cooked'],
                      ] as const
                    ).map(([mode, label]) => (
                      <Toggle
                        key={mode}
                        variant="default"
                        size="lg"
                        pressed={itemMode === mode}
                        onPressedChange={(pressed) => {
                          if (!pressed) {
                            return
                          }
                          resetDraftItemInputs()
                          setItemMode(mode)
                          if (mode === 'cookedFood') {
                            setItemCookedFoodId('')
                          }
                        }}
                        className="h-8 rounded-lg px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-xs"
                      >
                        {label}
                      </Toggle>
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {itemMode === 'quick'
                    ? 'Know the total calories? Just type a name and the number.'
                    : itemMode === 'catalog'
                      ? "Pick an ingredient you've saved before, then enter the weight."
                      : itemMode === 'new'
                        ? 'Add something not in your catalog yet. You can save it for next time.'
                        : 'Log food from a cooking session.'}
                </p>
                <div className="mt-3 space-y-3">
                  {itemMode === 'quick' ? (
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto]">
                      <div className="space-y-2">
                        <Label htmlFor="quickName">Food</Label>
                        <Input
                          id="quickName"
                          aria-label="Quick add name"
                          placeholder="What did you eat?"
                          value={itemQuickName}
                          onChange={(event) =>
                            setItemQuickName(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="quickCalories">Calories</Label>
                        <Input
                          id="quickCalories"
                          type="number"
                          aria-label="Quick add calories"
                          placeholder="150"
                          value={itemQuickCalories}
                          onChange={(event) =>
                            setItemQuickCalories(event.target.value)
                          }
                        />
                      </div>
                      <Button
                        variant="outline"
                        className="self-end"
                        disabled={!canQuickAdd}
                        onClick={() => {
                          const name = itemQuickName.trim()
                          const calories = Number(itemQuickCalories)
                          if (
                            !name ||
                            !Number.isFinite(calories) ||
                            calories <= 0
                          ) {
                            toast.error(
                              'Enter a food name and calories greater than 0.',
                            )
                            return
                          }
                          upsertDraft({
                            sourceType: 'fixedCalories',
                            name,
                            calories,
                          })
                          setItemQuickName('')
                          setItemQuickCalories('')
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {editingDraftItemIndex === null ? 'Add' : 'Update'}
                      </Button>
                    </div>
                  ) : itemMode === 'catalog' ? (
                    <>
                      <DataTable
                        columns={ingredientSelectionColumns}
                        data={ingredientSelectionRows}
                        searchColumnId="name"
                        searchPlaceholder="Filter loaded ingredients"
                        emptyText="No ingredients found."
                        toolbarActions={
                          paging.ingredients.canLoadMore ||
                          paging.ingredients.isLoadingMore ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={paging.ingredients.isLoadingMore}
                              onClick={paging.ingredients.loadMore}
                            >
                              {paging.ingredients.isLoadingMore
                                ? 'Loading more ingredients...'
                                : 'Load more ingredients'}
                            </Button>
                          ) : null
                        }
                      />
                      {paging.ingredients.canLoadMore ? (
                        <p className="text-xs text-muted-foreground">
                          Filtering includes loaded ingredients only. Load more
                          to include additional ingredients.
                        </p>
                      ) : null}
                      {selectedIngredient ? (
                        <p className="text-xs text-muted-foreground">
                          Selected:{' '}
                          <span className="font-medium text-foreground">
                            {selectedIngredient.name}
                          </span>
                          {' · '}
                          {formatKcalPer100(selectedIngredient.kcalPer100)}{' '}
                          kcal/100g
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Select an ingredient from the table.
                        </p>
                      )}
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <Input
                          type="number"
                          aria-label="Ingredient grams"
                          placeholder="Weight in grams"
                          value={itemWeight}
                          onChange={(event) =>
                            setItemWeight(event.target.value)
                          }
                        />
                        <Button
                          variant="outline"
                          onClick={upsertDraftItem}
                          disabled={
                            (!selectedIngredient &&
                              !stableHistoricalIngredientItem) ||
                            Number(itemWeight) <= 0
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {editingDraftItemIndex === null ? 'Add' : 'Update'}
                        </Button>
                      </div>
                    </>
                  ) : itemMode === 'new' ? (
                    <div
                      className={`grid gap-3 ${
                        itemCustomIgnoreCalories
                          ? 'sm:grid-cols-[1.2fr_0.9fr_auto]'
                          : 'sm:grid-cols-[1.2fr_0.9fr_0.9fr_auto]'
                      }`}
                    >
                      <Input
                        aria-label="Custom ingredient name"
                        placeholder="Name (e.g. granola)"
                        value={itemCustomName}
                        onChange={(event) =>
                          setItemCustomName(event.target.value)
                        }
                      />
                      {itemCustomIgnoreCalories ? null : (
                        <Input
                          type="number"
                          aria-label="Custom ingredient kcal per 100"
                          placeholder="Calories per 100g"
                          value={itemCustomKcalPer100}
                          onChange={(event) =>
                            setItemCustomKcalPer100(event.target.value)
                          }
                        />
                      )}
                      <Input
                        type="number"
                        aria-label="Custom ingredient grams"
                        placeholder="Weight in grams"
                        value={itemWeight}
                        onChange={(event) => setItemWeight(event.target.value)}
                      />
                      <Button
                        variant="outline"
                        onClick={upsertDraftItem}
                        disabled={
                          !itemCustomName.trim() ||
                          Number(itemWeight) <= 0 ||
                          (!itemCustomIgnoreCalories &&
                            Number(itemCustomKcalPer100) <= 0)
                        }
                      >
                        {editingDraftItemIndex === null ? 'Add' : 'Update'}
                      </Button>
                      <CustomIngredientSwitchRow
                        ignoreCalories={itemCustomIgnoreCalories}
                        onIgnoreCaloriesChange={setItemCustomIgnoreCalories}
                        saveToCatalog={itemCustomSaveToCatalog}
                        onSaveToCatalogChange={setItemCustomSaveToCatalog}
                      />
                    </div>
                  ) : (
                    <>
                      <Select
                        value={displayedCookSessionId}
                        onValueChange={(value) => {
                          setSelectedCookSessionId(
                            (value as Id<'cookSessions'> | null) ?? '',
                          )
                          setItemCookedFoodId('')
                        }}
                        options={sessionOptions}
                        placeholder="Select cooking session"
                        ariaLabel="Cooking session"
                      />
                      <p className="text-xs text-muted-foreground">
                        Cooked foods are filtered by session (latest first).
                      </p>
                      {paging.cookSessions.canLoadMore ||
                      paging.cookSessions.isLoadingMore ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={paging.cookSessions.isLoadingMore}
                          onClick={paging.cookSessions.loadMore}
                        >
                          {paging.cookSessions.isLoadingMore
                            ? 'Loading more cooking sessions...'
                            : 'Load more cooking sessions'}
                        </Button>
                      ) : null}
                      <SearchablePicker
                        value={itemCookedFoodId}
                        onValueChange={(value) =>
                          setItemCookedFoodId(value as Id<'cookedFoods'> | '')
                        }
                        ariaLabel="Cooked food filter"
                        placeholder="Filter loaded cooked foods in selected session"
                        loading={
                          paging.cookedFoods.isLoadingFirstPage ||
                          (itemCookedFoodId !== '' &&
                            !cookedFoodById.has(itemCookedFoodId) &&
                            pointLoadedCookedFoodDetail === undefined)
                        }
                        resultLimit={selectableCookedFoods.length}
                        options={selectableCookedFoods.map((item) => ({
                          value: item._id,
                          label: item.name,
                          keywords: `${formatKcalPer100(item.kcalPer100)} kcal`,
                        }))}
                      />
                      {paging.cookedFoods.canLoadMore ||
                      paging.cookedFoods.isLoadingMore ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={paging.cookedFoods.isLoadingMore}
                          onClick={paging.cookedFoods.loadMore}
                        >
                          {paging.cookedFoods.isLoadingMore
                            ? 'Loading more cooked foods...'
                            : 'Load more cooked foods'}
                        </Button>
                      ) : null}
                      {paging.cookedFoods.canLoadMore ? (
                        <p className="text-xs text-muted-foreground">
                          Filtering includes loaded cooked foods only. Load more
                          to include additional cooked foods.
                        </p>
                      ) : null}
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <Input
                          type="number"
                          aria-label="Consumed cooked food grams"
                          placeholder="Weight in grams"
                          value={itemWeight}
                          onChange={(event) =>
                            setItemWeight(event.target.value)
                          }
                        />
                        <Button
                          variant="outline"
                          onClick={upsertDraftItem}
                          disabled={
                            (!selectedCookedFood &&
                              !stableHistoricalCookedFoodItem) ||
                            Number(itemWeight) <= 0
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {editingDraftItemIndex === null ? 'Add' : 'Update'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </details>
              {mealItems.length > 0 || editingDraftItemIndex !== null ? (
                <div className="mt-3 space-y-2 rounded-md bg-muted/45 p-2 text-xs text-muted-foreground">
                  {editingDraftItemIndex !== null ? (
                    <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-400/35 bg-emerald-500/8 px-2 py-1 text-foreground dark:border-emerald-400/25 dark:bg-emerald-400/10">
                      <p className="text-xs font-medium">
                        Editing item #{editingDraftItemIndex + 1}
                      </p>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={resetDraftItemInputs}
                      >
                        <X className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                    </div>
                  ) : null}
                  {mealItems.map((item, index) => {
                    const itemCalories = getDraftItemCalories(item)
                    const isQuickAdd = item.sourceType === 'fixedCalories'
                    const label =
                      item.sourceType === 'ingredient'
                        ? item.nameSnapshot
                        : item.sourceType === 'customByWeight' ||
                            item.sourceType === 'fixedCalories'
                          ? item.name
                          : item.nameSnapshot
                    return (
                      <div
                        key={`draft-item-${index}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border/65 bg-background/45 px-2 py-1.5"
                      >
                        <p className="min-w-0 pr-2 text-xs text-foreground">
                          <span className="font-medium">
                            {isQuickAdd
                              ? 'Quick'
                              : item.sourceType === 'ingredient'
                                ? 'From saved'
                                : item.sourceType === 'customByWeight'
                                  ? 'New ingredient'
                                  : 'Home-cooked'}
                          </span>
                          : {label}
                          {isQuickAdd
                            ? ` (+${itemCalories.toFixed(0)} kcal)`
                            : ` - ${item.consumedWeightGrams.toFixed(0)} g (+${itemCalories.toFixed(0)} kcal)`}
                        </p>
                        <EstimateNotice provenance={item.nutritionProvenance} />
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => editDraftItem(index)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => removeDraftItem(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </fieldset>

          <p className="text-sm font-medium">
            Meal total: {draftCalories.toFixed(0)} kcal
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canSubmitMeal || isRunning || !isEditingMealHydrated}
              onClick={() => {
                if (!effectiveSelectedPersonId || mealItems.length === 0) {
                  toast.error('Add at least one item before saving a meal.')
                  return
                }
                void runAction(
                  editingMealId ? 'Meal updated.' : 'Meal created.',
                  async () => {
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
                  },
                )
              }}
            >
              {editingMealId
                ? 'Save meal changes'
                : mealItems.length > 0
                  ? `Create meal (${mealItems.length} item${mealItems.length === 1 ? '' : 's'})`
                  : 'Create meal'}
            </Button>
            {hasDraft ? (
              <Button
                variant="outline"
                onClick={() => setIsDiscardDialogOpen(true)}
              >
                {editingMealId ? 'Cancel edit' : 'Discard draft'}
              </Button>
            ) : null}
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
        title="Discard meal draft?"
        description="Your unsaved meal changes in this tab will be lost."
        confirmLabel="Discard draft"
        disabled={isRunning}
      />
    </>
  )
}
