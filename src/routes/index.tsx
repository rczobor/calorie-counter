import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Flame, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { PageShell } from '@/components/page/page-shell'
import {
  ConfigMissingState,
  LoadingSkeletonState,
} from '@/components/page/page-states'
import { StatusBadge } from '@/components/page/status-badge'
import { isConvexConfigured } from '@/integrations/convex/config'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumnDef } from '@/components/ui/data-table'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchablePicker } from '@/components/ui/searchable-picker'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Toggle } from '@/components/ui/toggle'
import { CustomIngredientSwitchRow } from '@/components/nutrition/ingredient-line-controls'
import { MealFormSection } from '@/features/meals/meal-form'
import { MealsMetrics } from '@/features/meals/metrics'
import { MealTableSection } from '@/features/meals/meal-table'
import {
  type MealDashboardIngredient as Ingredient,
  type MealDashboardMeal as Meal,
  useMealDashboardDomainData,
} from '@/features/meals/use-meal-dashboard-domain-data'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import {
  formatCookSessionLabel,
  formatKcalPer100,
  toLocalDateString,
  type NutritionUnit,
} from '@/lib/nutrition'

type MealMutationItem = FunctionArgs<
  typeof api.nutrition.createMeal
>['items'][number]

type ExistingIngredientMealItemDraft = {
  sourceType: 'ingredient'
  existingMealItemId?: Id<'mealItems'>
  ingredientId: Id<'ingredients'>
  nameSnapshot: string
  kcalPer100Snapshot: number
  kcalBasisUnitSnapshot: NutritionUnit
  ignoreCaloriesSnapshot: boolean
  consumedWeightGrams: number
  caloriesPerWeightSnapshot: number
  notes?: string
}

type CustomIngredientMealItemDraft = {
  sourceType: 'customByWeight'
  existingMealItemId?: Id<'mealItems'>
  ingredientId?: Id<'ingredients'>
  name: string
  kcalPer100: number
  kcalBasisUnit: NutritionUnit
  ignoreCalories: boolean
  consumedWeightGrams: number
  saveToCatalog: boolean
  notes?: string
}

type FixedCaloriesMealItemDraft = {
  sourceType: 'fixedCalories'
  existingMealItemId?: Id<'mealItems'>
  name: string
  calories: number
  notes?: string
}

type CookedFoodMealItemDraft = {
  sourceType: 'cookedFood'
  existingMealItemId?: Id<'mealItems'>
  cookedFoodId: Id<'cookedFoods'>
  nameSnapshot: string
  kcalPer100Snapshot: number
  consumedWeightGrams: number
  caloriesPerWeightSnapshot: number
  notes?: string
}

type DraftMealItem =
  | ExistingIngredientMealItemDraft
  | CustomIngredientMealItemDraft
  | CookedFoodMealItemDraft
  | FixedCaloriesMealItemDraft

type IngredientSelectionRow = {
  id: Id<'ingredients'>
  ingredient: Ingredient
  name: string
  kcalPer100: number
  ignoreCalories: boolean
}

type MealTableRow = {
  id: Id<'meals'>
  meal: Meal
  mealName: string
  personName: string
  totalCalories: number
  itemCount: number
  itemSummary: string
  status: 'Active' | 'Archived'
}

function toMealMutationItems(items: DraftMealItem[]): MealMutationItem[] {
  return items.map((item) => {
    if (item.sourceType === 'ingredient') {
      return {
        sourceType: 'ingredient',
        existingMealItemId: item.existingMealItemId,
        ingredientId: item.ingredientId,
        consumedWeightGrams: item.consumedWeightGrams,
        notes: item.notes,
      }
    }
    if (item.sourceType === 'cookedFood') {
      return {
        sourceType: 'cookedFood',
        existingMealItemId: item.existingMealItemId,
        cookedFoodId: item.cookedFoodId,
        consumedWeightGrams: item.consumedWeightGrams,
        notes: item.notes,
      }
    }
    return item
  })
}

export const Route = createFileRoute('/')({
  ssr: false,
  component: MealDashboardPage,
})

function MealDashboardPage() {
  if (!isConvexConfigured) {
    return <ConfigMissingState />
  }

  return <MealDashboardPageContent />
}

function MealDashboardPageContent() {
  const [showArchivedMeals, setShowArchivedMeals] = useState(false)

  const [selectedPersonId, setSelectedPersonId] = useState<Id<'people'> | ''>(
    '',
  )
  const [mealDate, setMealDate] = useState(() => toLocalDateString(Date.now()))
  const [mealName, setMealName] = useState('')
  const [editingMealId, setEditingMealId] = useState<Id<'meals'> | null>(null)

  const [itemMode, setItemMode] = useState<
    'quick' | 'catalog' | 'new' | 'cookedFood'
  >('quick')
  const [itemQuickName, setItemQuickName] = useState('')
  const [itemQuickCalories, setItemQuickCalories] = useState('')
  const [itemIngredientId, setItemIngredientId] = useState<
    Id<'ingredients'> | ''
  >('')
  const [selectedCookSessionId, setSelectedCookSessionId] = useState<
    Id<'cookSessions'> | ''
  >('')
  const [itemCookedFoodId, setItemCookedFoodId] = useState<
    Id<'cookedFoods'> | ''
  >('')
  const [itemCustomName, setItemCustomName] = useState('')
  const [itemCustomKcalPer100, setItemCustomKcalPer100] = useState('')
  const [itemCustomIgnoreCalories, setItemCustomIgnoreCalories] =
    useState(false)
  const [itemCustomSaveToCatalog, setItemCustomSaveToCatalog] = useState(true)
  const [itemWeight, setItemWeight] = useState('')
  const [editingDraftItemIndex, setEditingDraftItemIndex] = useState<
    number | null
  >(null)
  const [mealItems, setMealItems] = useState<DraftMealItem[]>([])
  const hydratedMealIdRef = useRef<Id<'meals'> | null>(null)
  const defaultPersonAppliedRef = useRef(false)
  const defaultCookSessionAppliedRef = useRef(false)
  const {
    pendingConfirmation,
    isConfirmDialogOpen,
    isRunning,
    runAction,
    confirmAndRunAction,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  } = useConfirmableAction()

  const {
    people,
    ingredients,
    cookSessions,
    cookedFoods,
    meals: mealsForSelection,
    effectiveSelectedPersonId,
    effectiveCookSessionId,
    daySummary,
    editingMealDetail,
    paging,
    isLoading,
  } = useMealDashboardDomainData({
    selectedPersonId,
    selectedCookSessionId,
    mealDate,
    showArchivedMeals,
    editingMealId,
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
  }, [people, selectedPersonId])

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
  const setMealArchived = useMutation(api.nutrition.setMealArchived)
  const deleteMeal = useMutation(api.nutrition.deleteMeal)
  const ingredientById = useMemo(
    () => new Map(ingredients.map((item) => [item._id, item])),
    [ingredients],
  )
  const cookedFoodById = useMemo(
    () => new Map(cookedFoods.map((item) => [item._id, item])),
    [cookedFoods],
  )
  const sessionOptions = useMemo(
    () =>
      cookSessions.map((session) => ({
        value: session._id,
        label: formatCookSessionLabel(session),
      })),
    [cookSessions],
  )
  const selectedPerson = people.find(
    (person) => person._id === effectiveSelectedPersonId,
  )
  const personById = useMemo(
    () => new Map(people.map((person) => [person._id, person.name])),
    [people],
  )

  const consumedToday = daySummary?.consumedCalories ?? 0

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

  const remainingToday = selectedPerson
    ? selectedPerson.currentDailyGoalKcal - consumedToday
    : 0
  const remainingAfterDraft = remainingToday - draftCalories
  const canQuickAdd =
    itemQuickName.trim().length > 0 &&
    Number.isFinite(Number(itemQuickCalories)) &&
    Number(itemQuickCalories) > 0
  const canSubmitMeal =
    Boolean(effectiveSelectedPersonId) && mealItems.length > 0

  const mealTableRows: MealTableRow[] = mealsForSelection.map((meal) => ({
    id: meal._id,
    meal,
    mealName: meal.name?.trim() || 'Meal',
    personName: personById.get(meal.personId) ?? 'Unknown',
    totalCalories: meal.totalCalories,
    itemCount: meal.itemCount,
    itemSummary: `${meal.itemCount} item${meal.itemCount === 1 ? '' : 's'}`,
    status: meal.archived ? 'Archived' : 'Active',
  }))

  const mealColumns: DataTableColumnDef<MealTableRow>[] = [
    {
      accessorKey: 'mealName',
      header: 'Meal',
      cell: ({ row }) => (
        <div className="max-w-56 whitespace-normal">
          <p className="font-medium text-foreground">{row.original.mealName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.original.personName}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'totalCalories',
      header: 'Calories',
      cell: ({ row }) => `${row.original.totalCalories.toFixed(0)} kcal`,
    },
    {
      accessorKey: 'itemCount',
      header: 'Items',
      cell: ({ row }) => (
        <div className="max-w-72 whitespace-normal text-xs text-muted-foreground">
          <p>{row.original.itemSummary}</p>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const meal = row.original.meal
        return (
          <div className="flex min-w-max items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => editMeal(meal._id)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={() =>
                void runAction(
                  meal.archived ? 'Meal restored.' : 'Meal archived.',
                  async () => {
                    await setMealArchived({
                      mealId: meal._id,
                      archived: !meal.archived,
                    })
                  },
                )
              }
            >
              {meal.archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={isRunning}
              aria-label={`Delete ${meal.name?.trim() || 'meal'}`}
              onClick={() =>
                confirmAndRunAction(
                  'Delete this meal permanently?',
                  'Meal deleted.',
                  async () => {
                    await deleteMeal({ mealId: meal._id })
                    if (editingMealId === meal._id) {
                      resetMealForm()
                    }
                  },
                )
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      },
    },
  ]

  const ingredientSelectionRows = useMemo<IngredientSelectionRow[]>(
    () =>
      ingredients.map((ingredient) => ({
        id: ingredient._id,
        ingredient,
        name: ingredient.name,
        kcalPer100: ingredient.kcalPer100,
        ignoreCalories: Boolean(
          (ingredient as { ignoreCalories?: boolean }).ignoreCalories,
        ),
      })),
    [ingredients],
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
    setMealName('')
    setEditingMealId(null)
    setMealItems([])
    hydratedMealIdRef.current = null
    resetDraftItemInputs()
  }

  const editMeal = (mealId: Id<'meals'>) => {
    if (editingMealId === mealId) {
      return
    }
    const meal = mealsForSelection.find((item) => item._id === mealId)
    if (!meal) {
      return
    }
    setSelectedPersonId(meal.personId)
    setMealDate(meal.eatenOn)
    setMealName(meal.name ?? '')
    setEditingMealId(meal._id)
    setMealItems([])
    hydratedMealIdRef.current = null
  }

  useEffect(() => {
    if (
      !editingMealId ||
      !editingMealDetail ||
      hydratedMealIdRef.current === editingMealId
    ) {
      return
    }
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
          }
        }
        return {
          sourceType: 'fixedCalories',
          existingMealItemId: row._id,
          name: row.nameSnapshot,
          calories: row.caloriesSnapshot,
          notes: row.notes,
        }
      }),
    )
    hydratedMealIdRef.current = editingMealId
  }, [editingMealDetail, editingMealId])

  if (isLoading) {
    return (
      <LoadingSkeletonState title="Meals" icon={<Flame className="h-4 w-4" />}>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-b border-border/40 pb-4">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-28" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1 h-3 w-40" />
            <div className="mt-3 space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          </div>

          <div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1 h-3 w-40" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </LoadingSkeletonState>
    )
  }

  return (
    <>
      <PageShell
        title="Meals"
        icon={<Flame className="h-4 w-4" />}
        maxWidth="7xl"
        showArchived={showArchivedMeals}
        onShowArchivedChange={setShowArchivedMeals}
        showArchivedLabel="Show archived meals"
      >
        <MealsMetrics
          targetKcal={selectedPerson?.currentDailyGoalKcal}
          consumedTodayKcal={consumedToday}
          remainingAfterDraftKcal={remainingAfterDraft}
          draftKcal={draftCalories}
        />

        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_1fr]">
          <MealFormSection
            title={editingMealId ? 'Edit Meal' : 'Create Meal'}
            description={
              editingMealId
                ? 'Modify items or details, then save.'
                : 'Add items below, then create the meal.'
            }
          >
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
                    {paging.people.canLoadMore ||
                    paging.people.isLoadingMore ? (
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
            <div className="mt-1 border-t border-border/40 pt-4">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Add items
              </p>
              <div className="mt-2">
                <div className="inline-flex rounded-xl border border-border/80 bg-muted/35 p-1">
                  {(
                    [
                      ['quick', 'Quick'],
                      ['catalog', 'Saved'],
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
                      searchPlaceholder="Search ingredients"
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
                        onChange={(event) => setItemWeight(event.target.value)}
                      />
                      <Button
                        variant="outline"
                        onClick={upsertDraftItem}
                        disabled={!itemIngredientId || Number(itemWeight) <= 0}
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
                      value={effectiveCookSessionId}
                      onValueChange={(value) => {
                        setSelectedCookSessionId(
                          (value as Id<'cookSessions'> | null) ?? '',
                        )
                        setItemCookedFoodId('')
                      }}
                      options={sessionOptions}
                      placeholder="Select cooking session"
                      aria-label="Cooking session"
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
                      ariaLabel="Cooked food search"
                      placeholder="Search cooked foods in selected session"
                      loading={paging.cookedFoods.isLoadingFirstPage}
                      resultLimit={cookedFoods.length}
                      options={cookedFoods.map((item) => ({
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
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        type="number"
                        aria-label="Consumed cooked food grams"
                        placeholder="Weight in grams"
                        value={itemWeight}
                        onChange={(event) => setItemWeight(event.target.value)}
                      />
                      <Button
                        variant="outline"
                        onClick={upsertDraftItem}
                        disabled={!itemCookedFoodId || Number(itemWeight) <= 0}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {editingDraftItemIndex === null ? 'Add' : 'Update'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
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

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!canSubmitMeal || isRunning}
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
              {editingMealId ? (
                <Button variant="outline" onClick={resetMealForm}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </MealFormSection>

          <MealTableSection
            title={`Meals for ${mealDate}`}
            description={selectedPerson?.name ?? 'All people'}
          >
            <DataTable
              columns={mealColumns}
              data={mealTableRows}
              searchColumnId="mealName"
              searchPlaceholder="Search meals"
              toolbarActions={
                paging.meals.canLoadMore || paging.meals.isLoadingMore ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={paging.meals.isLoadingMore}
                    onClick={paging.meals.loadMore}
                  >
                    {paging.meals.isLoadingMore
                      ? 'Loading more meals...'
                      : 'Load more meals'}
                  </Button>
                ) : null
              }
              emptyText={
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    No meals logged for this person and date.
                  </p>
                  <p className="text-sm">
                    Use quick add on the left to log the first item.
                  </p>
                </div>
              }
            />
          </MealTableSection>
        </div>
      </PageShell>
      <ConfirmDestructiveDialog
        open={isConfirmDialogOpen}
        onOpenChange={handleConfirmDialogOpenChange}
        onConfirm={confirmPendingAction}
        disabled={isRunning}
        description={pendingConfirmation?.message}
      />
    </>
  )
}
