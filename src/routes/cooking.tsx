import { type ColumnDef } from '@tanstack/react-table'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { ChefHat, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { isConvexConfigured } from '@/integrations/convex/config'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { SearchablePicker } from '@/components/ui/searchable-picker'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Toggle } from '@/components/ui/toggle'
import {
  NUTRITION_UNIT_OPTIONS,
  type NutritionUnit,
  formatKcalPer100,
  getKcalPer100,
  getNutritionUnitLabel,
  toErrorMessage,
  toLocalDateString,
  toTimestampFromDate,
} from '@/lib/nutrition'

const EMPTY_MANAGEMENT_DATA = {
  people: [],
  personGoalHistory: [],
  foodGroups: [],
  ingredients: [],
  recipes: [],
  recipeVersions: [],
  recipeVersionIngredients: [],
  cookSessions: [],
  cookedFoods: [],
  cookedFoodIngredients: [],
  meals: [],
  mealItems: [],
}

type PendingConfirmation = {
  message: string
  successText: string
  action: () => Promise<unknown>
}

type SessionTableRow = {
  id: Id<'cookSessions'>
  session: Doc<'cookSessions'>
  label: string
  cookedAt: string
  status: 'Active' | 'Archived'
}

type CookedFoodTableRow = {
  id: Id<'cookedFoods'>
  food: Doc<'cookedFoods'>
  name: string
  kcalPer100: number
  sessionLabel: string
  status: 'Active' | 'Archived'
}

type ExistingCookedFoodIngredientDraft = {
  draftId: string
  sourceType: 'ingredient'
  ingredientId: Id<'ingredients'>
  referenceAmount: number
  referenceUnit: NutritionUnit
  countedAmount?: number
}

type CustomCookedFoodIngredientDraft = {
  draftId: string
  sourceType: 'custom'
  name: string
  kcalPer100: number
  kcalBasisUnit: NutritionUnit
  ignoreCalories: boolean
  referenceAmount: number
  referenceUnit: NutritionUnit
  countedAmount?: number
  saveToCatalog: boolean
}

type CookedFoodIngredientDraft =
  | ExistingCookedFoodIngredientDraft
  | CustomCookedFoodIngredientDraft

export const Route = createFileRoute('/cooking')({
  ssr: false,
  component: CookingPage,
})

function CookingPage() {
  if (!isConvexConfigured) {
    return (
      <main className="min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">Convex configuration is missing.</p>
      </main>
    )
  }

  return <CookingPageContent />
}

function CookingPageContent() {
  const [showArchived, setShowArchived] = useState(false)
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)

  const [editingSessionId, setEditingSessionId] = useState<Id<'cookSessions'> | null>(null)
  const [sessionLabel, setSessionLabel] = useState('')
  const [sessionDate, setSessionDate] = useState(() => toLocalDateString(Date.now()))
  const [sessionPersonId, setSessionPersonId] = useState<Id<'people'> | ''>('')
  const [sessionNotes, setSessionNotes] = useState('')

  const [editingCookedFoodId, setEditingCookedFoodId] = useState<Id<'cookedFoods'> | null>(
    null,
  )
  const [cookedFoodSessionId, setCookedFoodSessionId] = useState<Id<'cookSessions'> | ''>('')
  const [cookedFoodName, setCookedFoodName] = useState('')
  const [cookedFoodGroupId, setCookedFoodGroupId] = useState<Id<'foodGroups'> | ''>('')
  const [cookedFoodFinishedWeight, setCookedFoodFinishedWeight] = useState('')
  const [cookedFoodRecipeVersionId, setCookedFoodRecipeVersionId] = useState<
    Id<'recipeVersions'> | ''
  >('')
  const [saveCookedFoodAsRecipe, setSaveCookedFoodAsRecipe] = useState(false)
  const [cookedFoodRecipeDraftName, setCookedFoodRecipeDraftName] = useState('')
  const [cookedFoodRecipeDraftDescription, setCookedFoodRecipeDraftDescription] = useState('')
  const [cookedFoodRecipeDraftInstructions, setCookedFoodRecipeDraftInstructions] = useState('')
  const [cookedFoodRecipeDraftNotes, setCookedFoodRecipeDraftNotes] = useState('')
  const [cookedFoodNotes, setCookedFoodNotes] = useState('')

  const [cookedFoodLineMode, setCookedFoodLineMode] = useState<'ingredient' | 'custom'>(
    'ingredient',
  )
  const [cookedFoodLineIngredientId, setCookedFoodLineIngredientId] = useState<
    Id<'ingredients'> | ''
  >('')
  const [cookedFoodLineCustomName, setCookedFoodLineCustomName] = useState('')
  const [cookedFoodLineCustomKcal, setCookedFoodLineCustomKcal] = useState('')
  const [cookedFoodLineCustomBasisUnit, setCookedFoodLineCustomBasisUnit] =
    useState<NutritionUnit>('g')
  const [cookedFoodLineCustomIgnoreCalories, setCookedFoodLineCustomIgnoreCalories] =
    useState(false)
  const [cookedFoodLineCustomSaveToCatalog, setCookedFoodLineCustomSaveToCatalog] =
    useState(false)
  const [cookedFoodLineReferenceAmount, setCookedFoodLineReferenceAmount] = useState('')
  const [cookedFoodLineReferenceUnit, setCookedFoodLineReferenceUnit] =
    useState<NutritionUnit>('g')
  const [cookedFoodLineCountedAmount, setCookedFoodLineCountedAmount] = useState('')

  const [cookedFoodIngredientLines, setCookedFoodIngredientLines] = useState<
    CookedFoodIngredientDraft[]
  >([])

  const dataResult = useQuery(api.nutrition.getManagementData)
  const data = (dataResult ?? EMPTY_MANAGEMENT_DATA) as NonNullable<typeof dataResult>
  const isLoading = dataResult === undefined

  const createCookSession = useMutation(api.nutrition.createCookSession)
  const updateCookSession = useMutation(api.nutrition.updateCookSession)
  const setCookSessionArchived = useMutation(api.nutrition.setCookSessionArchived)
  const deleteCookSession = useMutation(api.nutrition.deleteCookSession)

  const createCookedFood = useMutation(api.nutrition.createCookedFood)
  const updateCookedFood = useMutation(api.nutrition.updateCookedFood)
  const setCookedFoodArchived = useMutation(api.nutrition.setCookedFoodArchived)
  const deleteCookedFood = useMutation(api.nutrition.deleteCookedFood)

  const people = data.people.filter((person) => person.active)
  const groups = data.foodGroups
    .filter((group) => (showArchived ? true : !group.archived))
    .filter((group) => group.appliesTo === 'cookedFood')
  const ingredients = data.ingredients.filter((item) =>
    showArchived ? true : !item.archived,
  )
  const recipes = data.recipes.filter((item) => (showArchived ? true : !item.archived))
  const cookSessions = data.cookSessions.filter((item) =>
    showArchived ? true : !item.archived,
  )
  const cookedFoods = data.cookedFoods.filter((item) =>
    showArchived ? true : !item.archived,
  )

  const ingredientById = useMemo(
    () => new Map(data.ingredients.map((item) => [item._id, item])),
    [data.ingredients],
  )
  const ingredientOptions = useMemo(
    () =>
      ingredients.map((item) => ({
        value: item._id,
        label: item.name,
        keywords: `${item.brand ?? ''} ${formatKcalPer100(getKcalPer100(item))} kcal`,
      })),
    [ingredients],
  )
  const cookSessionById = useMemo(
    () => new Map(data.cookSessions.map((session) => [session._id, session])),
    [data.cookSessions],
  )

  const recipeVersionByRecipeId = useMemo(() => {
    const map = new Map<Id<'recipes'>, Doc<'recipeVersions'>>()
    for (const version of data.recipeVersions) {
      if (version.isCurrent && !map.has(version.recipeId)) {
        map.set(version.recipeId, version)
      }
    }
    return map
  }, [data.recipeVersions])

  const recipeVersionById = useMemo(
    () => new Map(data.recipeVersions.map((version) => [version._id, version])),
    [data.recipeVersions],
  )

  const recipeVersionOptions = useMemo(
    () =>
      recipes.flatMap((recipe) => {
        const version = recipeVersionByRecipeId.get(recipe._id)
        if (!version) {
          return []
        }
        return [
          {
            value: version._id as string,
            label: `${recipe.name} (v${version.versionNumber})`,
          },
        ]
      }),
    [recipes, recipeVersionByRecipeId],
  )

  const recipeIngredientsByVersionId = useMemo(() => {
    const map = new Map<Id<'recipeVersions'>, Doc<'recipeVersionIngredients'>[]>()
    for (const line of data.recipeVersionIngredients) {
      const bucket = map.get(line.recipeVersionId)
      if (bucket) {
        bucket.push(line)
      } else {
        map.set(line.recipeVersionId, [line])
      }
    }
    return map
  }, [data.recipeVersionIngredients])

  const cookedFoodIngredientsById = useMemo(() => {
    const map = new Map<Id<'cookedFoods'>, Doc<'cookedFoodIngredients'>[]>()
    for (const line of data.cookedFoodIngredients) {
      const bucket = map.get(line.cookedFoodId)
      if (bucket) {
        bucket.push(line)
      } else {
        map.set(line.cookedFoodId, [line])
      }
    }
    return map
  }, [data.cookedFoodIngredients])

  const sessionOptions = useMemo(
    () =>
      cookSessions.map((session) => ({
        value: session._id,
        label: formatCookSessionOptionLabel(session),
        keywords: [
          session.label ?? '',
          toLocalDateString(session.cookedAt),
          toLocalDateString(getCookSessionModifiedAt(session)),
        ].join(' '),
      })),
    [cookSessions],
  )

  const sessionRows = useMemo<SessionTableRow[]>(
    () =>
      cookSessions.map((session) => ({
        id: session._id,
        session,
        label: session.label?.trim() || 'Unnamed session',
        cookedAt: toLocalDateString(session.cookedAt),
        status: session.archived ? 'Archived' : 'Active',
      })),
    [cookSessions],
  )

  const cookedFoodRows = useMemo<CookedFoodTableRow[]>(
    () =>
      cookedFoods.map((food) => ({
        id: food._id,
        food,
        name: food.name,
        kcalPer100: getKcalPer100(food),
        sessionLabel:
          cookSessionById.get(food.cookSessionId)?.label?.trim() ||
          formatCookSessionOptionLabel(cookSessionById.get(food.cookSessionId) ?? {
            cookedAt: food.createdAt,
            label: undefined,
            createdAt: food.createdAt,
          } as Doc<'cookSessions'>),
        status: food.archived ? 'Archived' : 'Active',
      })),
    [cookSessionById, cookedFoods],
  )

  async function runAction(successText: string, action: () => Promise<unknown>) {
    try {
      await action()
      toast.success(successText)
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
  }

  const confirmAndRunAction = (
    message: string,
    successText: string,
    action: () => Promise<unknown>,
  ) => {
    setPendingConfirmation({
      message,
      successText,
      action,
    })
    setIsConfirmDialogOpen(true)
  }

  const handleConfirmDialogOpenChange = (open: boolean) => {
    setIsConfirmDialogOpen(open)
    if (!open) {
      setPendingConfirmation(null)
    }
  }

  const confirmPendingAction = () => {
    if (!pendingConfirmation) {
      return
    }
    const { successText, action } = pendingConfirmation
    setIsConfirmDialogOpen(false)
    setPendingConfirmation(null)
    void runAction(successText, action)
  }

  const resetSessionForm = () => {
    setEditingSessionId(null)
    setSessionLabel('')
    setSessionDate(toLocalDateString(Date.now()))
    setSessionPersonId('')
    setSessionNotes('')
  }

  const resetCookedFoodForm = () => {
    setEditingCookedFoodId(null)
    setCookedFoodSessionId('')
    setCookedFoodName('')
    setCookedFoodGroupId('')
    setCookedFoodFinishedWeight('')
    setCookedFoodRecipeVersionId('')
    setSaveCookedFoodAsRecipe(false)
    setCookedFoodRecipeDraftName('')
    setCookedFoodRecipeDraftDescription('')
    setCookedFoodRecipeDraftInstructions('')
    setCookedFoodRecipeDraftNotes('')
    setCookedFoodNotes('')
    setCookedFoodLineMode('ingredient')
    setCookedFoodLineIngredientId('')
    setCookedFoodLineCustomName('')
    setCookedFoodLineCustomKcal('')
    setCookedFoodLineCustomBasisUnit('g')
    setCookedFoodLineCustomIgnoreCalories(false)
    setCookedFoodLineCustomSaveToCatalog(false)
    setCookedFoodLineReferenceAmount('')
    setCookedFoodLineReferenceUnit('g')
    setCookedFoodLineCountedAmount('')
    setCookedFoodIngredientLines([])
  }

  const isIngredientIgnored = (ingredientId: Id<'ingredients'>) => {
    return Boolean(
      (ingredientById.get(ingredientId) as { ignoreCalories?: boolean } | undefined)
        ?.ignoreCalories,
    )
  }

  const addCookedFoodIngredientLine = () => {
    const referenceAmount = Number(cookedFoodLineReferenceAmount)
    if (!Number.isFinite(referenceAmount) || referenceAmount <= 0) {
      return
    }
    const parsedCounted = Number(cookedFoodLineCountedAmount)
    const countedAmount =
      Number.isFinite(parsedCounted) && parsedCounted > 0 ? parsedCounted : undefined

    if (cookedFoodLineMode === 'ingredient') {
      if (!cookedFoodLineIngredientId) {
        return
      }
      const ignored = isIngredientIgnored(cookedFoodLineIngredientId)
      if (!ignored && !countedAmount) {
        toast.error('Counted amount is required for calorie-counted ingredients.')
        return
      }
      setCookedFoodIngredientLines((current) => [
        ...current,
        {
          draftId: createDraftId(),
          sourceType: 'ingredient',
          ingredientId: cookedFoodLineIngredientId,
          referenceAmount,
          referenceUnit: cookedFoodLineReferenceUnit,
          countedAmount,
        },
      ])
      setCookedFoodLineIngredientId('')
      setCookedFoodLineReferenceAmount('')
      setCookedFoodLineCountedAmount('')
      return
    }

    const parsedKcal = Number(cookedFoodLineCustomKcal)
    if (!cookedFoodLineCustomName.trim()) {
      return
    }
    if (!cookedFoodLineCustomIgnoreCalories && (!Number.isFinite(parsedKcal) || parsedKcal <= 0)) {
      return
    }
    const kcalPer100 =
      cookedFoodLineCustomIgnoreCalories && (!Number.isFinite(parsedKcal) || parsedKcal < 0)
        ? 0
        : parsedKcal
    if (!cookedFoodLineCustomIgnoreCalories && !countedAmount) {
      toast.error('Counted amount is required for calorie-counted ingredients.')
      return
    }

    setCookedFoodIngredientLines((current) => [
      ...current,
      {
        draftId: createDraftId(),
        sourceType: 'custom',
        name: cookedFoodLineCustomName.trim(),
        kcalPer100: kcalPer100,
        kcalBasisUnit: cookedFoodLineCustomBasisUnit,
        ignoreCalories: cookedFoodLineCustomIgnoreCalories,
        referenceAmount,
        referenceUnit: cookedFoodLineReferenceUnit,
        countedAmount,
        saveToCatalog: cookedFoodLineCustomSaveToCatalog,
      },
    ])
    setCookedFoodLineCustomName('')
    setCookedFoodLineCustomKcal('')
    setCookedFoodLineCustomBasisUnit('g')
    setCookedFoodLineCustomIgnoreCalories(false)
    setCookedFoodLineCustomSaveToCatalog(false)
    setCookedFoodLineReferenceAmount('')
    setCookedFoodLineCountedAmount('')
  }

  const removeCookedFoodIngredientLine = (draftId: string) => {
    setCookedFoodIngredientLines((current) => current.filter((line) => line.draftId !== draftId))
  }

  const applyRecipeVersionToCookedFood = (recipeVersionId: Id<'recipeVersions'> | '') => {
    setCookedFoodRecipeVersionId(recipeVersionId)
    if (recipeVersionId) {
      setSaveCookedFoodAsRecipe(false)
    }
    if (!recipeVersionId) {
      return
    }
    const recipeVersion = recipeVersionById.get(recipeVersionId)
    if (recipeVersion && cookedFoodName.trim() === '') {
      setCookedFoodName(recipeVersion.name)
    }
    const recipeLines = recipeIngredientsByVersionId.get(recipeVersionId) ?? []
    setCookedFoodIngredientLines(
      recipeLines.map((line) => {
        const sourceType = line.sourceType
        const referenceAmount = line.referenceAmount
        const referenceUnit = line.referenceUnit
        if (sourceType === 'custom' || !line.ingredientId) {
          const ignoreCalories = Boolean(
            (line as { ignoreCaloriesSnapshot?: boolean }).ignoreCaloriesSnapshot,
          )
          const countedAmount = !ignoreCalories && referenceUnit === 'g' ? referenceAmount : undefined
          return {
            draftId: createDraftId(),
            sourceType: 'custom' as const,
            name:
              (line as { ingredientNameSnapshot?: string }).ingredientNameSnapshot ??
              'Custom ingredient',
            kcalPer100: (line as { kcalPer100Snapshot?: number }).kcalPer100Snapshot ?? 0,
            kcalBasisUnit:
              (line as { kcalBasisUnitSnapshot?: NutritionUnit }).kcalBasisUnitSnapshot ?? 'g',
            ignoreCalories,
            referenceAmount,
            referenceUnit,
            countedAmount,
            saveToCatalog: false,
          }
        }

        return {
          draftId: createDraftId(),
          sourceType: 'ingredient' as const,
          ingredientId: line.ingredientId,
          referenceAmount,
          referenceUnit,
          countedAmount: isIngredientIgnored(line.ingredientId)
            ? undefined
            : referenceUnit === 'g'
              ? referenceAmount
              : undefined,
        }
      }),
    )
  }

  const resolvedCookedFoodSessionId =
    cookedFoodSessionId || (editingCookedFoodId ? '' : (cookSessions[0]?._id ?? ''))

  const sessionColumns: ColumnDef<SessionTableRow>[] = [
    {
      accessorKey: 'label',
      header: 'Session',
    },
    {
      accessorKey: 'cookedAt',
      header: 'Date',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.status}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const session = row.original.session
        return (
          <div className="flex min-w-max items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingSessionId(session._id)
                setSessionLabel(session.label ?? '')
                setSessionDate(toLocalDateString(session.cookedAt))
                setSessionPersonId(session.cookedByPersonId ?? '')
                setSessionNotes(session.notes ?? '')
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void runAction(
                  session.archived ? 'Session restored.' : 'Session archived.',
                  async () => {
                    await setCookSessionArchived({
                      sessionId: session._id,
                      archived: !session.archived,
                    })
                  },
                )
              }
            >
              {session.archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              aria-label={`Delete ${session.label?.trim() || 'session'}`}
              onClick={() =>
                confirmAndRunAction('Delete this session permanently?', 'Session deleted.', async () => {
                  await deleteCookSession({ sessionId: session._id })
                  if (editingSessionId === session._id) {
                    resetSessionForm()
                  }
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      },
    },
  ]

  const cookedFoodColumns: ColumnDef<CookedFoodTableRow>[] = [
    {
      accessorKey: 'name',
      header: 'Cooked food',
      cell: ({ row }) => (
        <div className="max-w-56 whitespace-normal">
          <p className="font-medium text-foreground">{row.original.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.original.sessionLabel}</p>
        </div>
      ),
    },
    {
      accessorKey: 'kcalPer100',
      header: 'kcal/100',
      cell: ({ row }) => formatKcalPer100(row.original.kcalPer100),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{row.original.status}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const food = row.original.food
        return (
          <div className="flex min-w-max items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const ingredientLines = cookedFoodIngredientsById.get(food._id) ?? []
                setEditingCookedFoodId(food._id)
                setCookedFoodSessionId(food.cookSessionId)
                setCookedFoodName(food.name)
                setCookedFoodGroupId(food.groupIds[0] ?? '')
                setCookedFoodFinishedWeight(food.finishedWeightGrams.toString())
                setCookedFoodRecipeVersionId(food.recipeVersionId ?? '')
                setSaveCookedFoodAsRecipe(false)
                setCookedFoodRecipeDraftName('')
                setCookedFoodRecipeDraftDescription('')
                setCookedFoodRecipeDraftInstructions('')
                setCookedFoodRecipeDraftNotes('')
                setCookedFoodNotes(food.notes ?? '')
                setCookedFoodIngredientLines(
                  ingredientLines.map((line) => {
                    const sourceType = line.sourceType
                    const referenceAmount = line.referenceAmount
                    const referenceUnit = line.referenceUnit
                    const countedAmount =
                      (line as { countedAmount?: number }).countedAmount ?? line.rawWeightGrams
                    if (sourceType === 'ingredient' && line.ingredientId) {
                      return {
                        draftId: createDraftId(),
                        sourceType: 'ingredient' as const,
                        ingredientId: line.ingredientId,
                        referenceAmount,
                        referenceUnit,
                        countedAmount,
                      }
                    }
                    return {
                      draftId: createDraftId(),
                      sourceType: 'custom' as const,
                      name:
                        (line as { ingredientNameSnapshot?: string }).ingredientNameSnapshot ??
                        (line.ingredientId
                          ? ingredientById.get(line.ingredientId)?.name
                          : undefined) ??
                        'Custom ingredient',
                      kcalPer100:
                        (line as { ingredientKcalPer100Snapshot?: number })
                          .ingredientKcalPer100Snapshot ?? 0,
                      kcalBasisUnit:
                        (line as { ingredientKcalBasisUnitSnapshot?: NutritionUnit })
                          .ingredientKcalBasisUnitSnapshot ?? 'g',
                      ignoreCalories: Boolean(
                        (line as { ignoreCaloriesSnapshot?: boolean }).ignoreCaloriesSnapshot,
                      ),
                      referenceAmount,
                      referenceUnit,
                      countedAmount,
                      saveToCatalog: false,
                    }
                  }),
                )
                setCookedFoodLineMode('ingredient')
                setCookedFoodLineIngredientId('')
                setCookedFoodLineCustomName('')
                setCookedFoodLineCustomKcal('')
                setCookedFoodLineCustomBasisUnit('g')
                setCookedFoodLineCustomIgnoreCalories(false)
                setCookedFoodLineCustomSaveToCatalog(false)
                setCookedFoodLineReferenceAmount('')
                setCookedFoodLineReferenceUnit('g')
                setCookedFoodLineCountedAmount('')
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void runAction(
                  food.archived ? 'Cooked food restored.' : 'Cooked food archived.',
                  async () => {
                    await setCookedFoodArchived({
                      cookedFoodId: food._id,
                      archived: !food.archived,
                    })
                  },
                )
              }
            >
              {food.archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              aria-label={`Delete ${food.name}`}
              onClick={() =>
                confirmAndRunAction('Delete this cooked food permanently?', 'Cooked food deleted.', async () => {
                  await deleteCookedFood({ cookedFoodId: food._id })
                  if (editingCookedFoodId === food._id) {
                    resetCookedFoodForm()
                  }
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )
      },
    },
  ]

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">Loading cooking data…</p>
      </main>
    )
  }

  return (
    <>
      <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_20%_10%,#fff7e4_0%,#f5f6f4_44%,#e8f0ea_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,#1d2535_0%,#111a26_44%,#0a1119_100%)]">
        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-amber-200/80 bg-card/85 p-6 shadow-sm dark:border-amber-500/25">
            <h1 data-display="true" className="text-4xl text-foreground">
              Cooking
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage cooking sessions and cooked foods with reference and counted ingredient lines.
            </p>
            <label className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              Show archived records
            </label>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle>Sessions</CardTitle>
                <CardDescription>Group cooked foods by cooking date/session.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label="Session label"
                    placeholder="Session label"
                    value={sessionLabel}
                    onChange={(event) => setSessionLabel(event.target.value)}
                  />
                  <DatePicker
                    value={sessionDate}
                    onChange={setSessionDate}
                    ariaLabel="Session date"
                  />
                  <Select
                    ariaLabel="Session person"
                    value={sessionPersonId}
                    onValueChange={(value) =>
                      setSessionPersonId((value as Id<'people'> | '' | null) ?? '')
                    }
                    placeholder="Cooked by"
                    options={[
                      { value: '', label: 'No person' },
                      ...people.map((person) => ({
                        value: person._id,
                        label: person.name,
                      })),
                    ]}
                  />
                  <Input
                    aria-label="Session notes"
                    placeholder="Session notes"
                    value={sessionNotes}
                    onChange={(event) => setSessionNotes(event.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      void runAction(
                        editingSessionId ? 'Session updated.' : 'Session created.',
                        async () => {
                          const cookedAt = toTimestampFromDate(sessionDate)
                          if (editingSessionId) {
                            await updateCookSession({
                              sessionId: editingSessionId,
                              label: sessionLabel.trim() || undefined,
                              cookedAt,
                              cookedByPersonId: sessionPersonId || undefined,
                              notes: sessionNotes.trim() || undefined,
                            })
                            setCookedFoodSessionId(editingSessionId)
                          } else {
                            const sessionId = await createCookSession({
                              label: sessionLabel.trim() || undefined,
                              cookedAt,
                              cookedByPersonId: sessionPersonId || undefined,
                              notes: sessionNotes.trim() || undefined,
                            })
                            setCookedFoodSessionId(sessionId)
                          }
                          resetSessionForm()
                        },
                      )
                    }
                  >
                    {editingSessionId ? 'Save session' : 'Create session'}
                  </Button>
                  {editingSessionId ? (
                    <Button variant="outline" onClick={resetSessionForm}>
                      Cancel
                    </Button>
                  ) : null}
                </div>
                <DataTable
                  columns={sessionColumns}
                  data={sessionRows}
                  searchColumnId="label"
                  searchPlaceholder="Search sessions by label"
                  emptyText="No sessions found."
                />
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ChefHat className="h-4 w-4 text-rose-700" />
                  Cooked Foods
                </CardTitle>
                <CardDescription>
                  Lines can be reference-only (ignored calories) or counted by measured amount.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SearchablePicker
                    ariaLabel="Cooked food session search"
                    value={resolvedCookedFoodSessionId}
                    onValueChange={(value) =>
                      setCookedFoodSessionId(value as Id<'cookSessions'> | '')
                    }
                    placeholder="Search session"
                    options={sessionOptions}
                  />
                  <Input
                    aria-label="Cooked food name"
                    placeholder="Cooked food name"
                    value={cookedFoodName}
                    onChange={(event) => setCookedFoodName(event.target.value)}
                  />
                  {editingCookedFoodId || !saveCookedFoodAsRecipe ? (
                    <SearchablePicker
                      value={cookedFoodRecipeVersionId}
                      onValueChange={(value) =>
                        applyRecipeVersionToCookedFood(value as Id<'recipeVersions'> | '')
                      }
                      ariaLabel="Cooked food recipe search"
                      placeholder="Search recipe"
                      options={recipeVersionOptions}
                    />
                  ) : (
                    <div className="rounded-md border border-emerald-400/35 bg-emerald-500/8 px-3 py-2 text-xs text-foreground">
                      New recipe will be created from these ingredient lines.
                    </div>
                  )}
                  <Select
                    ariaLabel="Cooked food group"
                    value={cookedFoodGroupId}
                    onValueChange={(value) =>
                      setCookedFoodGroupId((value as Id<'foodGroups'> | '' | null) ?? '')
                    }
                    placeholder="Group"
                    options={[
                      { value: '', label: 'No group' },
                      ...groups.map((group) => ({ value: group._id, label: group.name })),
                    ]}
                  />
                  <Input
                    type="number"
                    aria-label="Finished cooked food amount"
                    placeholder="Finished amount"
                    value={cookedFoodFinishedWeight}
                    onChange={(event) => setCookedFoodFinishedWeight(event.target.value)}
                  />
                  <Input
                    aria-label="Cooked food notes"
                    placeholder="Notes"
                    value={cookedFoodNotes}
                    onChange={(event) => setCookedFoodNotes(event.target.value)}
                  />
                </div>

                {!editingCookedFoodId ? (
                  <div className="rounded-md bg-muted/35 p-3">
                    <label className="flex items-center justify-between gap-3 text-sm font-medium text-foreground">
                      Save this cooked food as a reusable recipe
                      <Switch
                        checked={saveCookedFoodAsRecipe}
                        onCheckedChange={(checked) => {
                          const nextChecked = Boolean(checked)
                          setSaveCookedFoodAsRecipe(nextChecked)
                          if (nextChecked) {
                            setCookedFoodRecipeVersionId('')
                            if (!cookedFoodRecipeDraftName.trim() && cookedFoodName.trim()) {
                              setCookedFoodRecipeDraftName(cookedFoodName.trim())
                            }
                          }
                        }}
                      />
                    </label>
                    {saveCookedFoodAsRecipe ? (
                      <div className="mt-3 space-y-3">
                        <Input
                          aria-label="Recipe name from cooked food"
                          placeholder={cookedFoodName.trim() || 'Recipe name'}
                          value={cookedFoodRecipeDraftName}
                          onChange={(event) =>
                            setCookedFoodRecipeDraftName(event.target.value)
                          }
                        />
                        <Input
                          aria-label="Recipe description from cooked food"
                          placeholder="Description (optional)"
                          value={cookedFoodRecipeDraftDescription}
                          onChange={(event) =>
                            setCookedFoodRecipeDraftDescription(event.target.value)
                          }
                        />
                        <Textarea
                          aria-label="Recipe instructions from cooked food"
                          placeholder="Instructions (optional)"
                          value={cookedFoodRecipeDraftInstructions}
                          onChange={(event) =>
                            setCookedFoodRecipeDraftInstructions(event.target.value)
                          }
                        />
                        <Input
                          aria-label="Recipe notes from cooked food"
                          placeholder="Notes (optional)"
                          value={cookedFoodRecipeDraftNotes}
                          onChange={(event) =>
                            setCookedFoodRecipeDraftNotes(event.target.value)
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-foreground">Add ingredient line</p>
                  <div className="inline-flex gap-1 rounded-full bg-muted/60 p-1">
                    <Toggle
                      size="sm"
                      variant="default"
                      className="rounded-full px-3 text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
                      pressed={cookedFoodLineMode === 'ingredient'}
                      onPressedChange={(pressed) => {
                        if (pressed) {
                          setCookedFoodLineMode('ingredient')
                        }
                      }}
                    >
                      Existing
                    </Toggle>
                    <Toggle
                      size="sm"
                      variant="default"
                      className="rounded-full px-3 text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm"
                      pressed={cookedFoodLineMode === 'custom'}
                      onPressedChange={(pressed) => {
                        if (pressed) {
                          setCookedFoodLineMode('custom')
                        }
                      }}
                    >
                      New
                    </Toggle>
                  </div>
                </div>

                {cookedFoodLineMode === 'ingredient' ? (
                  <div className="grid gap-3 sm:grid-cols-[1.3fr_0.8fr_0.8fr_0.8fr_auto]">
                    <SearchablePicker
                      value={cookedFoodLineIngredientId}
                      onValueChange={(value) =>
                        setCookedFoodLineIngredientId(value as Id<'ingredients'> | '')
                      }
                      ariaLabel="Cooked food ingredient search"
                      placeholder="Search ingredient"
                      options={ingredientOptions}
                    />
                    <Input
                      type="number"
                      aria-label="Reference amount"
                      placeholder="Reference amount"
                      value={cookedFoodLineReferenceAmount}
                      onChange={(event) =>
                        setCookedFoodLineReferenceAmount(event.target.value)
                      }
                    />
                    <Select
                      ariaLabel="Reference unit"
                      value={cookedFoodLineReferenceUnit}
                      onValueChange={(value) =>
                        setCookedFoodLineReferenceUnit((value as NutritionUnit | null) ?? 'g')
                      }
                      options={NUTRITION_UNIT_OPTIONS}
                    />
                    <Input
                      type="number"
                      aria-label="Counted amount"
                      placeholder="Counted amount"
                      value={cookedFoodLineCountedAmount}
                      onChange={(event) =>
                        setCookedFoodLineCountedAmount(event.target.value)
                      }
                    />
                    <Button onClick={addCookedFoodIngredientLine}>Add</Button>
                  </div>
                ) : (
                  <div
                    className={`grid gap-3 ${
                      cookedFoodLineCustomIgnoreCalories
                        ? 'sm:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_auto]'
                        : 'sm:grid-cols-[1.2fr_0.6fr_0.6fr_0.8fr_0.8fr_0.8fr_auto]'
                    }`}
                  >
                    <Input
                      aria-label="Custom ingredient name"
                      placeholder="Ingredient"
                      value={cookedFoodLineCustomName}
                      onChange={(event) =>
                        setCookedFoodLineCustomName(event.target.value)
                      }
                    />
                    {cookedFoodLineCustomIgnoreCalories ? null : (
                      <>
                        <Input
                          type="number"
                          aria-label="Custom kcal per 100"
                          placeholder="kcal/100"
                          value={cookedFoodLineCustomKcal}
                          onChange={(event) => setCookedFoodLineCustomKcal(event.target.value)}
                        />
                        <Select
                          ariaLabel="Custom kcal basis"
                          value={cookedFoodLineCustomBasisUnit}
                          onValueChange={(value) =>
                            setCookedFoodLineCustomBasisUnit((value as NutritionUnit | null) ?? 'g')
                          }
                          options={NUTRITION_UNIT_OPTIONS}
                        />
                      </>
                    )}
                    <Input
                      type="number"
                      aria-label="Custom reference amount"
                      placeholder="Reference amount"
                      value={cookedFoodLineReferenceAmount}
                      onChange={(event) =>
                        setCookedFoodLineReferenceAmount(event.target.value)
                      }
                    />
                    <Select
                      ariaLabel="Custom reference unit"
                      value={cookedFoodLineReferenceUnit}
                      onValueChange={(value) =>
                        setCookedFoodLineReferenceUnit((value as NutritionUnit | null) ?? 'g')
                      }
                      options={NUTRITION_UNIT_OPTIONS}
                    />
                    <Input
                      type="number"
                      aria-label="Custom counted amount"
                      placeholder="Counted amount"
                      value={cookedFoodLineCountedAmount}
                      onChange={(event) =>
                        setCookedFoodLineCountedAmount(event.target.value)
                      }
                    />
                    <Button onClick={addCookedFoodIngredientLine}>Add</Button>
                    <label className="col-span-full flex items-center gap-3 text-xs text-muted-foreground">
                      Ignore calories
                      <Switch
                        size="sm"
                        checked={cookedFoodLineCustomIgnoreCalories}
                        onCheckedChange={(checked) =>
                          setCookedFoodLineCustomIgnoreCalories(Boolean(checked))
                        }
                      />
                      Save to ingredient catalog
                      <Switch
                        size="sm"
                        checked={cookedFoodLineCustomSaveToCatalog}
                        onCheckedChange={(checked) =>
                          setCookedFoodLineCustomSaveToCatalog(Boolean(checked))
                        }
                      />
                    </label>
                  </div>
                )}

                <div className="rounded-md bg-muted/45 p-2 text-xs text-muted-foreground">
                  {cookedFoodIngredientLines.length === 0 ? (
                    <p>Add at least one ingredient line.</p>
                  ) : (
                    <div className="space-y-2">
                      {cookedFoodIngredientLines.map((line) => {
                        const ignored =
                          line.sourceType === 'ingredient'
                            ? isIngredientIgnored(line.ingredientId)
                            : line.ignoreCalories
                        const label =
                          line.sourceType === 'ingredient'
                            ? ingredientById.get(line.ingredientId)?.name ?? 'Ingredient'
                            : line.name
                        return (
                          <div
                            key={line.draftId}
                            className="flex items-center justify-between gap-2 rounded-md bg-background/80 p-2"
                          >
                            <p className="text-xs text-foreground">
                              <span className="font-medium">{label}</span> - {' '}
                              {line.referenceAmount.toFixed(2)} {getNutritionUnitLabel(line.referenceUnit)}
                              {' · '}
                              {ignored ? 'Ignored calories' : `Counted: ${line.countedAmount?.toFixed(2) ?? 0}`}
                              {line.sourceType === 'custom' && !line.ignoreCalories ? (
                                <>
                                  {' · '}kcal/100 {formatKcalPer100(line.kcalPer100)} ({getNutritionUnitLabel(line.kcalBasisUnit)})
                                </>
                              ) : null}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeCookedFoodIngredientLine(line.draftId)}
                            >
                              Remove
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      const resolvedCookedFoodName =
                        cookedFoodName.trim() || toLocalDateString(Date.now())
                      if (!resolvedCookedFoodSessionId) {
                        toast.error('Select a session before saving cooked food.')
                        return
                      }
                      if (cookedFoodIngredientLines.length === 0) {
                        toast.error('Add at least one ingredient line.')
                        return
                      }
                      const finishedWeight = Number(cookedFoodFinishedWeight)
                      if (!Number.isFinite(finishedWeight) || finishedWeight <= 0) {
                        toast.error('Finished amount must be greater than 0.')
                        return
                      }

                      for (const line of cookedFoodIngredientLines) {
                        const ignored =
                          line.sourceType === 'ingredient'
                            ? isIngredientIgnored(line.ingredientId)
                            : line.ignoreCalories
                        if (!ignored && (!line.countedAmount || line.countedAmount <= 0)) {
                          toast.error('All calorie-counted lines must include counted amount.')
                          return
                        }
                      }

                      if (
                        !editingCookedFoodId &&
                        saveCookedFoodAsRecipe &&
                        !(cookedFoodRecipeDraftName.trim() || resolvedCookedFoodName)
                      ) {
                        toast.error('Recipe name is required when saving as recipe.')
                        return
                      }

                      const recipeVersion =
                        !saveCookedFoodAsRecipe && cookedFoodRecipeVersionId
                          ? recipeVersionById.get(cookedFoodRecipeVersionId)
                          : undefined

                      void runAction(
                        editingCookedFoodId
                          ? 'Cooked food updated.'
                          : 'Cooked food created.',
                        async () => {
                          const payload = {
                            cookSessionId: resolvedCookedFoodSessionId,
                            name: resolvedCookedFoodName,
                            recipeId: recipeVersion?.recipeId,
                            recipeVersionId: cookedFoodRecipeVersionId || undefined,
                            groupIds: cookedFoodGroupId ? [cookedFoodGroupId] : [],
                            finishedWeightGrams: finishedWeight,
                            notes: cookedFoodNotes.trim() || undefined,
                            ingredients: cookedFoodIngredientLines.map((line) =>
                              line.sourceType === 'ingredient'
                                ? {
                                    sourceType: 'ingredient' as const,
                                    ingredientId: line.ingredientId,
                                    referenceAmount: line.referenceAmount,
                                    referenceUnit: line.referenceUnit,
                                    countedAmount: line.countedAmount,
                                  }
                                : {
                                    sourceType: 'custom' as const,
                                    name: line.name,
                                    kcalPer100: line.kcalPer100,
                                    kcalBasisUnit: line.kcalBasisUnit,
                                    ignoreCalories: line.ignoreCalories,
                                    referenceAmount: line.referenceAmount,
                                    referenceUnit: line.referenceUnit,
                                    countedAmount: line.countedAmount,
                                    saveToCatalog: line.saveToCatalog,
                                  },
                            ),
                          }

                          if (editingCookedFoodId) {
                            await updateCookedFood({
                              cookedFoodId: editingCookedFoodId,
                              ...payload,
                            })
                          } else {
                            await createCookedFood({
                              ...payload,
                              saveAsRecipe: saveCookedFoodAsRecipe || undefined,
                              recipeDraft: saveCookedFoodAsRecipe
                                ? {
                                    name:
                                      cookedFoodRecipeDraftName.trim() ||
                                      resolvedCookedFoodName,
                                    description:
                                      cookedFoodRecipeDraftDescription.trim() || undefined,
                                    instructions:
                                      cookedFoodRecipeDraftInstructions.trim() || undefined,
                                    notes: cookedFoodRecipeDraftNotes.trim() || undefined,
                                  }
                                : undefined,
                            })
                          }

                          resetCookedFoodForm()
                        },
                      )
                    }}
                  >
                    {editingCookedFoodId ? 'Save cooked food' : 'Create cooked food'}
                  </Button>
                  {editingCookedFoodId ? (
                    <Button variant="outline" onClick={resetCookedFoodForm}>
                      Cancel
                    </Button>
                  ) : null}
                </div>

                <DataTable
                  columns={cookedFoodColumns}
                  data={cookedFoodRows}
                  searchColumnId="name"
                  searchPlaceholder="Search cooked foods by name"
                  emptyText="No cooked foods found."
                />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <AlertDialog
        open={isConfirmDialogOpen}
        onOpenChange={handleConfirmDialogOpenChange}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm deletion</AlertDialogTitle>
            <AlertDialogDescription>{pendingConfirmation?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="gap-2"
              variant="destructive"
              onClick={confirmPendingAction}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function createDraftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function formatCookSessionOptionLabel(session: Doc<'cookSessions'>) {
  const cookedDate = toLocalDateString(session.cookedAt)
  if (!session.label?.trim()) {
    return cookedDate
  }
  return `${cookedDate} • ${session.label.trim()}`
}

function getCookSessionModifiedAt(session: Doc<'cookSessions'>) {
  return (session as Doc<'cookSessions'> & { updatedAt?: number }).updatedAt ?? session.createdAt
}
