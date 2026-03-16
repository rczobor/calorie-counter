import { type ColumnDef } from '@tanstack/react-table'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useMemo, useState } from 'react'
import { Flame, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { PageShell } from '@/components/page/page-shell'
import {
  ConfigMissingState,
  LoadingSkeletonState,
} from '@/components/page/page-states'
import { StatusBadge } from '@/components/page/status-badge'
import { isConvexConfigured } from '@/integrations/convex/config'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { SearchablePicker } from '@/components/ui/searchable-picker'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Toggle } from '@/components/ui/toggle'
import { CustomIngredientSwitchRow } from '@/components/nutrition/ingredient-line-controls'
import { MealFormSection } from '@/features/meals/meal-form'
import { MealsMetrics } from '@/features/meals/metrics'
import { MealTableSection } from '@/features/meals/meal-table'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { useManagementData } from '@/hooks/use-management-data'
import {
  formatCookSessionLabel,
  formatKcalPer100,
  getMealDateKey,
  getKcalPer100,
  toLocalDateString,
} from '@/lib/nutrition'

type ExistingIngredientMealItemDraft = {
  sourceType: 'ingredient'
  ingredientId: Id<'ingredients'>
  consumedWeightGrams: number
}

type CustomIngredientMealItemDraft = {
  sourceType: 'custom'
  name: string
  kcalPer100: number
  ignoreCalories: boolean
  consumedWeightGrams: number
  saveToCatalog: boolean
}

type CookedFoodMealItemDraft = {
  sourceType: 'cookedFood'
  cookedFoodId: Id<'cookedFoods'>
  consumedWeightGrams: number
}

type DraftMealItem =
  | ExistingIngredientMealItemDraft
  | CustomIngredientMealItemDraft
  | CookedFoodMealItemDraft

type IngredientSelectionRow = {
  id: Id<'ingredients'>
  ingredient: Doc<'ingredients'>
  name: string
  kcalPer100: number
  ignoreCalories: boolean
}

type MealTableRow = {
  id: Id<'meals'>
  meal: Doc<'meals'>
  mealName: string
  personName: string
  totalCalories: number
  itemCount: number
  itemSummary: string
  status: 'Active' | 'Archived'
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
  const {
    pendingConfirmation,
    isConfirmDialogOpen,
    runAction,
    confirmAndRunAction,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  } = useConfirmableAction()

  const { data, isLoading } = useManagementData()

  const createMeal = useMutation(api.nutrition.createMeal)
  const updateMeal = useMutation(api.nutrition.updateMeal)
  const setMealArchived = useMutation(api.nutrition.setMealArchived)
  const deleteMeal = useMutation(api.nutrition.deleteMeal)

  const people = useMemo(
    () => data.people.filter((person) => person.active),
    [data.people],
  )
  const effectiveSelectedPersonId = useMemo<Id<'people'> | ''>(() => {
    if (people.length === 0) {
      return ''
    }
    const hasSelectedPerson = people.some(
      (person) => person._id === selectedPersonId,
    )
    if (hasSelectedPerson) {
      return selectedPersonId
    }
    return people[0]._id
  }, [people, selectedPersonId])
  const ingredients = useMemo(
    () => data.ingredients.filter((item) => !item.archived),
    [data.ingredients],
  )
  const cookSessions = useMemo(
    () =>
      data.cookSessions
        .filter((session) => !session.archived)
        .sort((a, b) => {
          if (a.cookedAt === b.cookedAt) {
            return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
          }
          return b.cookedAt - a.cookedAt
        }),
    [data.cookSessions],
  )
  const effectiveCookSessionId = useMemo<Id<'cookSessions'> | ''>(() => {
    if (cookSessions.length === 0) {
      return ''
    }
    return cookSessions.some((session) => session._id === selectedCookSessionId)
      ? selectedCookSessionId
      : cookSessions[0]!._id
  }, [cookSessions, selectedCookSessionId])
  const cookedFoods = useMemo(
    () =>
      data.cookedFoods
        .filter((item) => !item.archived)
        .filter((item) =>
          effectiveCookSessionId
            ? item.cookSessionId === effectiveCookSessionId
            : true,
        )
        .sort((a, b) => b.createdAt - a.createdAt),
    [data.cookedFoods, effectiveCookSessionId],
  )
  const ingredientById = useMemo(
    () => new Map(ingredients.map((item) => [item._id, item])),
    [ingredients],
  )
  const cookedFoodById = useMemo(
    () => new Map(data.cookedFoods.map((item) => [item._id, item])),
    [data.cookedFoods],
  )
  const sessionOptions = useMemo(
    () =>
      cookSessions.map((session) => ({
        value: session._id,
        label: formatCookSessionLabel(session),
      })),
    [cookSessions],
  )
  const mealItemsByMealId = useMemo(() => {
    const map = new Map<Id<'meals'>, Doc<'mealItems'>[]>()
    for (const item of data.mealItems) {
      const existing = map.get(item.mealId)
      if (existing) {
        existing.push(item)
      } else {
        map.set(item.mealId, [item])
      }
    }
    return map
  }, [data.mealItems])

  const selectedPerson = people.find(
    (person) => person._id === effectiveSelectedPersonId,
  )
  const personById = useMemo(
    () => new Map(data.people.map((person) => [person._id, person.name])),
    [data.people],
  )

  const mealsForSelection = data.meals.filter((meal) => {
    if (
      effectiveSelectedPersonId &&
      meal.personId !== effectiveSelectedPersonId
    ) {
      return false
    }
    if (getMealDateKey(meal) !== mealDate) {
      return false
    }
    if (!showArchivedMeals && meal.archived) {
      return false
    }
    return true
  })

  const consumedToday = mealsForSelection
    .filter((meal) => !meal.archived)
    .reduce((sum, meal) => {
      const itemRows = mealItemsByMealId.get(meal._id) ?? []
      return (
        sum +
        itemRows.reduce((innerSum, row) => innerSum + row.caloriesSnapshot, 0)
      )
    }, 0)

  const getDraftItemCalories = (item: DraftMealItem) => {
    if (item.sourceType === 'ingredient') {
      const ingredient = ingredientById.get(item.ingredientId)
      if (!ingredient) {
        return 0
      }
      const ignored = Boolean(
        (ingredient as { ignoreCalories?: boolean }).ignoreCalories,
      )
      if (ignored) {
        return 0
      }
      return (item.consumedWeightGrams * getKcalPer100(ingredient)) / 100
    }
    if (item.sourceType === 'custom') {
      if (item.ignoreCalories) {
        return 0
      }
      return (item.consumedWeightGrams * item.kcalPer100) / 100
    }
    if (item.sourceType === 'cookedFood') {
      const cookedFood = cookedFoodById.get(item.cookedFoodId)
      if (!cookedFood) {
        return 0
      }
      return (item.consumedWeightGrams * getKcalPer100(cookedFood)) / 100
    }
    return 0
  }

  const draftCalories = mealItems.reduce(
    (sum, item) => sum + getDraftItemCalories(item),
    0,
  )

  const remainingToday = selectedPerson
    ? selectedPerson.currentDailyGoalKcal - consumedToday
    : 0
  const remainingAfterDraft = remainingToday - draftCalories

  const mealTableRows: MealTableRow[] = mealsForSelection.map((meal) => {
    const itemRows = mealItemsByMealId.get(meal._id) ?? []
    const totalCalories = itemRows.reduce(
      (sum, row) => sum + row.caloriesSnapshot,
      0,
    )
    const itemNames = itemRows.map((row) =>
      row.sourceType === 'ingredient'
        ? (ingredientById.get(row.ingredientId as Id<'ingredients'>)?.name ??
          (row as { nameSnapshot?: string }).nameSnapshot ??
          'Unknown ingredient')
        : row.sourceType === 'custom'
          ? ((row as { nameSnapshot?: string }).nameSnapshot ??
            'Custom ingredient')
          : (cookedFoodById.get(row.cookedFoodId as Id<'cookedFoods'>)?.name ??
            (row as { nameSnapshot?: string }).nameSnapshot ??
            'Unknown cooked food'),
    )

    return {
      id: meal._id,
      meal,
      mealName: meal.name?.trim() || 'Meal',
      personName: personById.get(meal.personId) ?? 'Unknown',
      totalCalories,
      itemCount: itemRows.length,
      itemSummary:
        itemNames.length > 0 ? itemNames.slice(0, 3).join(', ') : 'No items',
      status: meal.archived ? 'Archived' : 'Active',
    }
  })

  const mealColumns: ColumnDef<MealTableRow>[] = [
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
          <p className="text-sm text-foreground">{row.original.itemCount}</p>
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
        kcalPer100: getKcalPer100(ingredient),
        ignoreCalories: Boolean(
          (ingredient as { ignoreCalories?: boolean }).ignoreCalories,
        ),
      })),
    [ingredients],
  )

  const ingredientSelectionColumns: ColumnDef<IngredientSelectionRow>[] = [
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
    setItemMode('quick')
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
        current.map((item, index) =>
          index === editingDraftItemIndex ? nextDraft : item,
        ),
      )
    } else {
      setMealItems((current) => [...current, nextDraft])
    }
    resetDraftItemInputs()
  }

  const upsertDraftItem = () => {
    const parsedAmount = Number(itemWeight)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return
    }

    if (itemMode === 'catalog') {
      if (!itemIngredientId) {
        return
      }
      const ingredient = ingredientById.get(itemIngredientId)
      if (!ingredient) {
        toast.error('Selected ingredient is not available.')
        return
      }
      upsertDraft({
        sourceType: 'ingredient',
        ingredientId: itemIngredientId,
        consumedWeightGrams: parsedAmount,
      })
      return
    }

    if (itemMode === 'new') {
      if (!itemCustomName.trim()) {
        return
      }
      const parsedKcal = Number(itemCustomKcalPer100)
      if (
        !itemCustomIgnoreCalories &&
        (!Number.isFinite(parsedKcal) || parsedKcal <= 0)
      ) {
        return
      }
      const kcalPer100 =
        itemCustomIgnoreCalories &&
        (!Number.isFinite(parsedKcal) || parsedKcal < 0)
          ? 0
          : parsedKcal
      upsertDraft({
        sourceType: 'custom',
        name: itemCustomName.trim(),
        kcalPer100,
        ignoreCalories: itemCustomIgnoreCalories,
        consumedWeightGrams: parsedAmount,
        saveToCatalog: itemCustomSaveToCatalog,
      })
      return
    }

    if (!itemCookedFoodId) {
      return
    }
    upsertDraft({
      sourceType: 'cookedFood',
      cookedFoodId: itemCookedFoodId,
      consumedWeightGrams: parsedAmount,
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
    if (item.sourceType === 'custom') {
      const isQuickAdd =
        item.consumedWeightGrams === 100 && !item.saveToCatalog
      if (isQuickAdd) {
        setItemMode('quick')
        setItemQuickName(item.name)
        setItemQuickCalories(item.kcalPer100.toString())
      } else {
        setItemMode('new')
        setItemCustomName(item.name)
        setItemCustomKcalPer100(item.kcalPer100.toString())
        setItemCustomIgnoreCalories(item.ignoreCalories)
        setItemCustomSaveToCatalog(item.saveToCatalog)
        setItemWeight(item.consumedWeightGrams.toString())
      }
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
    resetDraftItemInputs()
  }

  const editMeal = (mealId: Id<'meals'>) => {
    const meal = data.meals.find((item) => item._id === mealId)
    if (!meal) {
      return
    }
    const itemRows = mealItemsByMealId.get(mealId) ?? []
    setSelectedPersonId(meal.personId)
    setMealDate(getMealDateKey(meal))
    setMealName(meal.name ?? '')
    setEditingMealId(meal._id)
    setMealItems(
      itemRows.map((row) => {
        if (row.sourceType === 'ingredient' && row.ingredientId) {
          return {
            sourceType: 'ingredient' as const,
            ingredientId: row.ingredientId,
            consumedWeightGrams: row.consumedWeightGrams,
          }
        }
        if (row.sourceType === 'cookedFood' && row.cookedFoodId) {
          return {
            sourceType: 'cookedFood' as const,
            cookedFoodId: row.cookedFoodId,
            consumedWeightGrams: row.consumedWeightGrams,
          }
        }
        return {
          sourceType: 'custom' as const,
          name:
            (row as { nameSnapshot?: string }).nameSnapshot ??
            'Custom ingredient',
          kcalPer100:
            (row as { kcalPer100Snapshot?: number }).kcalPer100Snapshot ?? 0,
          ignoreCalories: Boolean(
            (row as { ignoreCaloriesSnapshot?: boolean })
              .ignoreCaloriesSnapshot,
          ),
          consumedWeightGrams: row.consumedWeightGrams,
          saveToCatalog: false,
        }
      }),
    )
  }

  if (isLoading) {
    return (
      <LoadingSkeletonState
        title="Meals"
        icon={<Flame className="h-4 w-4" />}
      >
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card
              key={`metric-skeleton-${index}`}
              className="border-border/70 bg-card/90"
            >
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-2/3" />
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_1fr]">
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-20 rounded-full" />
                    <Skeleton className="h-9 w-20 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-9 w-full" />
              </div>
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <div className="rounded-lg border border-border p-3">
                <Skeleton className="h-4 w-24" />
                <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto]">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-24" />
                </div>
                <div className="mt-3 space-y-2 rounded-md bg-muted/45 p-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-9 w-24" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`meal-list-skeleton-${index}`}
                  className="rounded-lg border border-border bg-muted/45 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Skeleton className="h-4 w-40" />
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-14" />
                      <Skeleton className="h-8 w-18" />
                    </div>
                  </div>
                  <Skeleton className="mt-2 h-3 w-5/6" />
                  <Skeleton className="mt-1 h-3 w-2/3" />
                </div>
              ))}
            </CardContent>
          </Card>
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
          targetKcal={`${selectedPerson?.currentDailyGoalKcal.toFixed(0) ?? '--'} kcal`}
          consumedTodayKcal={`${consumedToday.toFixed(0)} kcal`}
          remainingAfterDraftKcal={`${remainingAfterDraft.toFixed(0)} kcal`}
        />

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_1fr]">
          <MealFormSection
            title={editingMealId ? 'Edit Meal' : 'Create Meal'}
            description={`Remaining today: ${
              selectedPerson ? `${remainingToday.toFixed(0)} kcal` : '--'
            }`}
          >
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Person
                </p>
                {people.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Add an active person in Manage before creating meals.
                  </p>
                ) : (
                  <div className="inline-flex rounded-xl border border-border/80 bg-muted/35 p-1">
                    {people.map((person) => (
                      <Toggle
                        key={person._id}
                        variant="default"
                        size="lg"
                        pressed={effectiveSelectedPersonId === person._id}
                        onPressedChange={(pressed) => {
                          if (pressed) {
                            setSelectedPersonId(person._id)
                          }
                        }}
                        className="h-8 rounded-lg px-3 text-sm data-[state=on]:bg-background data-[state=on]:shadow-xs"
                      >
                        {person.name}
                      </Toggle>
                    ))}
                  </div>
                )}
              </div>
              <DatePicker
                value={mealDate}
                onChange={setMealDate}
                ariaLabel="Meal date"
              />
            </div>

            <Input
              aria-label="Meal name"
              placeholder="Meal name (optional)"
              value={mealName}
              onChange={(event) => setMealName(event.target.value)}
            />
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground">Meal item</p>
              <div className="mt-2">
                <div className="inline-flex rounded-xl border border-border/80 bg-muted/35 p-1">
                  {(
                    [
                      ['quick', 'Quick'],
                      ['catalog', 'Catalog'],
                      ['new', 'New'],
                      ['cookedFood', 'Cooked food'],
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
              <div className="mt-3 space-y-3">
                {itemMode === 'quick' ? (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto]">
                    <Input
                      aria-label="Quick add name"
                      placeholder="Name (e.g. soda)"
                      value={itemQuickName}
                      onChange={(event) =>
                        setItemQuickName(event.target.value)
                      }
                    />
                    <Input
                      type="number"
                      aria-label="Quick add calories"
                      placeholder="Total kcal"
                      value={itemQuickCalories}
                      onChange={(event) =>
                        setItemQuickCalories(event.target.value)
                      }
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const name = itemQuickName.trim()
                        const calories = Number(itemQuickCalories)
                        if (!name || !Number.isFinite(calories) || calories <= 0) {
                          return
                        }
                        upsertDraft({
                          sourceType: 'custom',
                          name,
                          kcalPer100: calories,
                          ignoreCalories: false,
                          consumedWeightGrams: 100,
                          saveToCatalog: false,
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
                    />
                    {selectedIngredient ? (
                      <p className="text-xs text-muted-foreground">
                        Selected:{' '}
                        <span className="font-medium text-foreground">
                          {selectedIngredient.name}
                        </span>
                        {' · '}
                        {formatKcalPer100(
                          getKcalPer100(selectedIngredient),
                        )}{' '}
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
                        placeholder="grams"
                        value={itemWeight}
                        onChange={(event) =>
                          setItemWeight(event.target.value)
                        }
                      />
                      <Button variant="outline" onClick={upsertDraftItem}>
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
                      placeholder="Ingredient name"
                      value={itemCustomName}
                      onChange={(event) =>
                        setItemCustomName(event.target.value)
                      }
                    />
                    {itemCustomIgnoreCalories ? null : (
                      <Input
                        type="number"
                        aria-label="Custom ingredient kcal per 100"
                        placeholder="kcal / 100"
                        value={itemCustomKcalPer100}
                        onChange={(event) =>
                          setItemCustomKcalPer100(event.target.value)
                        }
                      />
                    )}
                    <Input
                      type="number"
                      aria-label="Custom ingredient grams"
                      placeholder="grams"
                      value={itemWeight}
                      onChange={(event) =>
                        setItemWeight(event.target.value)
                      }
                    />
                    <Button variant="outline" onClick={upsertDraftItem}>
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
                    <SearchablePicker
                      value={itemCookedFoodId}
                      onValueChange={(value) =>
                        setItemCookedFoodId(value as Id<'cookedFoods'> | '')
                      }
                      ariaLabel="Cooked food search"
                      placeholder="Search cooked foods in selected session"
                      options={cookedFoods.map((item) => ({
                        value: item._id,
                        label: item.name,
                        keywords: `${formatKcalPer100(getKcalPer100(item))} kcal`,
                      }))}
                    />
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <Input
                        type="number"
                        aria-label="Consumed cooked food grams"
                        placeholder="grams"
                        value={itemWeight}
                        onChange={(event) => setItemWeight(event.target.value)}
                      />
                      <Button variant="outline" onClick={upsertDraftItem}>
                        <Plus className="h-3.5 w-3.5" />
                        {editingDraftItemIndex === null ? 'Add' : 'Update'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
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
                {mealItems.length === 0 ? (
                  <p className="px-1 py-0.5 text-xs text-muted-foreground">
                    No draft items yet.
                  </p>
                ) : null}
                {mealItems.map((item, index) => {
                  const itemCalories = getDraftItemCalories(item)
                  const isQuickAdd =
                    item.sourceType === 'custom' &&
                    item.consumedWeightGrams === 100 &&
                    !item.saveToCatalog
                  const label =
                    item.sourceType === 'ingredient'
                      ? (ingredientById.get(item.ingredientId)?.name ??
                        'Ingredient')
                      : item.sourceType === 'custom'
                        ? item.name
                        : (cookedFoodById.get(item.cookedFoodId)?.name ??
                          'Cooked food')
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
                              ? 'Ingredient'
                              : item.sourceType === 'custom'
                                ? 'Custom ingredient'
                                : 'Cooked food'}
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
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (!effectiveSelectedPersonId || mealItems.length === 0) {
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
                          items: mealItems,
                        })
                      } else {
                        await createMeal({
                          personId: effectiveSelectedPersonId,
                          name: mealName.trim() || undefined,
                          eatenOn: mealDate,
                          items: mealItems,
                        })
                      }
                      resetMealForm()
                    },
                  )
                }}
              >
                {editingMealId ? 'Save meal changes' : 'Create meal'}
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
              emptyText="No meals for this selection."
            />
          </MealTableSection>
        </div>
      </PageShell>
      <ConfirmDestructiveDialog
        open={isConfirmDialogOpen}
        onOpenChange={handleConfirmDialogOpenChange}
        onConfirm={confirmPendingAction}
        description={pendingConfirmation?.message}
      />
    </>
  )
}
