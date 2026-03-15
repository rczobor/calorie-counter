import { type ColumnDef } from '@tanstack/react-table'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { type ReactNode, useMemo, useState } from 'react'
import { Plus, Trash2, UserRound } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  CustomIngredientSwitchRow,
  IngredientLineModeToggle,
} from '@/components/nutrition/ingredient-line-controls'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { useManagementData } from '@/hooks/use-management-data'
import {
  NUTRITION_UNIT_OPTIONS,
  type NutritionUnit,
  formatCookSessionLabel,
  formatKcalPer100,
  getCookSessionModifiedAt,
  getKcalPer100,
  getNutritionUnitLabel,
  toLocalDateString,
  toTimestampFromDate,
} from '@/lib/nutrition'
import { cn } from '@/lib/utils'

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

function getIngredientBasisUnit(ingredient?: {
  kcalBasisUnit?: NutritionUnit
}) {
  return ingredient?.kcalBasisUnit ?? 'g'
}

function shouldAutoFillReferenceFields(unit: NutritionUnit) {
  return unit === 'g' || unit === 'ml'
}

export const Route = createFileRoute('/cooking')({
  ssr: false,
  component: CookingPage,
})

function CookingPage() {
  if (!isConvexConfigured) {
    return <ConfigMissingState />
  }

  return <CookingPageContent />
}

function CookingPageContent() {
  const [showArchived, setShowArchived] = useState(false)
  const [isSessionEditorVisible, setIsSessionEditorVisible] = useState(false)
  const {
    pendingConfirmation,
    isConfirmDialogOpen,
    runAction,
    confirmAndRunAction,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  } = useConfirmableAction()

  const [editingSessionId, setEditingSessionId] =
    useState<Id<'cookSessions'> | null>(null)
  const [sessionLabel, setSessionLabel] = useState('')
  const [sessionDate, setSessionDate] = useState(() =>
    toLocalDateString(Date.now()),
  )
  const [sessionPersonId, setSessionPersonId] = useState<Id<'people'> | ''>('')
  const [sessionNotes, setSessionNotes] = useState('')

  const [editingCookedFoodId, setEditingCookedFoodId] =
    useState<Id<'cookedFoods'> | null>(null)
  const [cookedFoodSessionId, setCookedFoodSessionId] = useState<
    Id<'cookSessions'> | ''
  >('')
  const [cookedFoodName, setCookedFoodName] = useState('')
  const [cookedFoodGroupId, setCookedFoodGroupId] = useState<
    Id<'foodGroups'> | ''
  >('')
  const [cookedFoodFinishedWeight, setCookedFoodFinishedWeight] = useState('')
  const [cookedFoodRecipeVersionId, setCookedFoodRecipeVersionId] = useState<
    Id<'recipeVersions'> | ''
  >('')
  const [saveCookedFoodAsRecipe, setSaveCookedFoodAsRecipe] = useState(false)
  const [cookedFoodRecipeDraftName, setCookedFoodRecipeDraftName] = useState('')
  const [
    cookedFoodRecipeDraftDescription,
    setCookedFoodRecipeDraftDescription,
  ] = useState('')
  const [
    cookedFoodRecipeDraftInstructions,
    setCookedFoodRecipeDraftInstructions,
  ] = useState('')
  const [cookedFoodRecipeDraftNotes, setCookedFoodRecipeDraftNotes] =
    useState('')
  const [cookedFoodNotes, setCookedFoodNotes] = useState('')

  const [cookedFoodLineMode, setCookedFoodLineMode] = useState<
    'ingredient' | 'custom'
  >('ingredient')
  const [cookedFoodLineIngredientId, setCookedFoodLineIngredientId] = useState<
    Id<'ingredients'> | ''
  >('')
  const [cookedFoodLineCustomName, setCookedFoodLineCustomName] = useState('')
  const [cookedFoodLineCustomKcal, setCookedFoodLineCustomKcal] = useState('')
  const [cookedFoodLineCustomBasisUnit, setCookedFoodLineCustomBasisUnit] =
    useState<NutritionUnit>('g')
  const [
    cookedFoodLineCustomIgnoreCalories,
    setCookedFoodLineCustomIgnoreCalories,
  ] = useState(false)
  const [
    cookedFoodLineCustomSaveToCatalog,
    setCookedFoodLineCustomSaveToCatalog,
  ] = useState(true)
  const [cookedFoodLineReferenceAmount, setCookedFoodLineReferenceAmount] =
    useState('')
  const [cookedFoodLineReferenceUnit, setCookedFoodLineReferenceUnit] =
    useState<NutritionUnit>('g')
  const [cookedFoodLineCountedAmount, setCookedFoodLineCountedAmount] =
    useState('')

  const [cookedFoodIngredientLines, setCookedFoodIngredientLines] = useState<
    CookedFoodIngredientDraft[]
  >([])

  const { data, isLoading } = useManagementData()

  const createCookSession = useMutation(api.nutrition.createCookSession)
  const updateCookSession = useMutation(api.nutrition.updateCookSession)
  const setCookSessionArchived = useMutation(
    api.nutrition.setCookSessionArchived,
  )
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
  const recipes = data.recipes.filter((item) =>
    showArchived ? true : !item.archived,
  )
  const cookSessions = data.cookSessions.filter((item) =>
    showArchived ? true : !item.archived,
  )
  const cookedFoods = data.cookedFoods.filter((item) =>
    showArchived ? true : !item.archived,
  )

  const personById = useMemo(
    () => new Map(data.people.map((person) => [person._id, person])),
    [data.people],
  )
  const ingredientById = useMemo(
    () => new Map(data.ingredients.map((item) => [item._id, item])),
    [data.ingredients],
  )
  const selectedCookedFoodLineIngredient = cookedFoodLineIngredientId
    ? ingredientById.get(cookedFoodLineIngredientId)
    : undefined
  const selectedCookedFoodLineIngredientBasisUnit = getIngredientBasisUnit(
    selectedCookedFoodLineIngredient,
  )
  const shouldAutoFillIngredientReference = shouldAutoFillReferenceFields(
    selectedCookedFoodLineIngredientBasisUnit,
  )
  const shouldAutoFillCustomReference = shouldAutoFillReferenceFields(
    cookedFoodLineCustomBasisUnit,
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
    const map = new Map<
      Id<'recipeVersions'>,
      Doc<'recipeVersionIngredients'>[]
    >()
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
        label: formatCookSessionLabel(session),
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
          formatCookSessionLabel(
            cookSessionById.get(food.cookSessionId) ??
              ({
                cookedAt: food.createdAt,
                label: undefined,
                createdAt: food.createdAt,
              } as Doc<'cookSessions'>),
          ),
        status: food.archived ? 'Archived' : 'Active',
      })),
    [cookSessionById, cookedFoods],
  )

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
    setCookedFoodLineCustomSaveToCatalog(true)
    setCookedFoodLineReferenceAmount('')
    setCookedFoodLineReferenceUnit('g')
    setCookedFoodLineCountedAmount('')
    setCookedFoodIngredientLines([])
  }

  const scrollToTop = () => {
    if (typeof window === 'undefined') {
      return
    }

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openNewSessionEditor = () => {
    resetSessionForm()
    setIsSessionEditorVisible(true)
  }

  const openEditSessionEditor = (session: Doc<'cookSessions'>) => {
    setEditingSessionId(session._id)
    setSessionLabel(session.label ?? '')
    setSessionDate(toLocalDateString(session.cookedAt))
    setSessionPersonId(session.cookedByPersonId ?? '')
    setSessionNotes(session.notes ?? '')
    setIsSessionEditorVisible(true)
    scrollToTop()
  }

  const closeSessionEditor = () => {
    setIsSessionEditorVisible(false)
    resetSessionForm()
  }

  const isIngredientIgnored = (ingredientId: Id<'ingredients'>) => {
    return Boolean(
      (
        ingredientById.get(ingredientId) as
          | { ignoreCalories?: boolean }
          | undefined
      )?.ignoreCalories,
    )
  }

  const addCookedFoodIngredientLine = () => {
    const parsedCounted = Number(cookedFoodLineCountedAmount)
    const countedAmount =
      Number.isFinite(parsedCounted) && parsedCounted > 0
        ? parsedCounted
        : undefined

    if (cookedFoodLineMode === 'ingredient') {
      if (!cookedFoodLineIngredientId) {
        return
      }
      const basisUnit = getIngredientBasisUnit(
        ingredientById.get(cookedFoodLineIngredientId),
      )
      const shouldAutoFillReference = shouldAutoFillReferenceFields(basisUnit)
      const referenceUnit = shouldAutoFillReference
        ? basisUnit
        : cookedFoodLineReferenceUnit
      const ignored = isIngredientIgnored(cookedFoodLineIngredientId)
      let referenceAmount: number
      if (shouldAutoFillReference && !countedAmount) {
        toast.error('Amount is required for ingredients using grams or ml.')
        return
      }
      if (shouldAutoFillReference) {
        referenceAmount = countedAmount!
      } else {
        referenceAmount = Number(cookedFoodLineReferenceAmount)
      }
      if (
        !shouldAutoFillReference &&
        (!Number.isFinite(referenceAmount) || referenceAmount <= 0)
      ) {
        toast.error(
          'Reference amount is required for ingredients using spoon, pinch, or piece units.',
        )
        return
      }
      if (!ignored && !countedAmount) {
        toast.error(
          'Counted amount is required for calorie-counted ingredients.',
        )
        return
      }
      setCookedFoodIngredientLines((current) => [
        ...current,
        {
          draftId: createDraftId(),
          sourceType: 'ingredient',
          ingredientId: cookedFoodLineIngredientId,
          referenceAmount,
          referenceUnit,
          countedAmount,
        },
      ])
      setCookedFoodLineIngredientId('')
      setCookedFoodLineReferenceAmount('')
      setCookedFoodLineReferenceUnit('g')
      setCookedFoodLineCountedAmount('')
      return
    }

    const parsedKcal = Number(cookedFoodLineCustomKcal)
    if (!cookedFoodLineCustomName.trim()) {
      return
    }
    if (
      !cookedFoodLineCustomIgnoreCalories &&
      (!Number.isFinite(parsedKcal) || parsedKcal <= 0)
    ) {
      return
    }
    const kcalPer100 =
      cookedFoodLineCustomIgnoreCalories &&
      (!Number.isFinite(parsedKcal) || parsedKcal < 0)
        ? 0
        : parsedKcal
    const referenceUnit = shouldAutoFillCustomReference
      ? cookedFoodLineCustomBasisUnit
      : cookedFoodLineReferenceUnit
    let referenceAmount: number
    if (shouldAutoFillCustomReference && !countedAmount) {
      toast.error('Amount is required for custom entries using grams or ml.')
      return
    }
    if (shouldAutoFillCustomReference) {
      referenceAmount = countedAmount!
    } else {
      referenceAmount = Number(cookedFoodLineReferenceAmount)
    }
    if (
      !shouldAutoFillCustomReference &&
      (!Number.isFinite(referenceAmount) || referenceAmount <= 0)
    ) {
      toast.error(
        'Reference amount is required for custom entries using spoon, pinch, or piece units.',
      )
      return
    }
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
        referenceUnit,
        countedAmount,
        saveToCatalog: cookedFoodLineCustomSaveToCatalog,
      },
    ])
    setCookedFoodLineCustomName('')
    setCookedFoodLineCustomKcal('')
    setCookedFoodLineCustomBasisUnit('g')
    setCookedFoodLineCustomIgnoreCalories(false)
    setCookedFoodLineCustomSaveToCatalog(true)
    setCookedFoodLineReferenceAmount('')
    setCookedFoodLineReferenceUnit('g')
    setCookedFoodLineCountedAmount('')
  }

  const removeCookedFoodIngredientLine = (draftId: string) => {
    setCookedFoodIngredientLines((current) =>
      current.filter((line) => line.draftId !== draftId),
    )
  }

  const editCookedFoodIngredientLine = (draftId: string) => {
    const line = cookedFoodIngredientLines.find((l) => l.draftId === draftId)
    if (!line) return

    if (line.sourceType === 'ingredient') {
      setCookedFoodLineMode('ingredient')
      setCookedFoodLineIngredientId(line.ingredientId)
      const basisUnit = getIngredientBasisUnit(
        ingredientById.get(line.ingredientId),
      )
      const autoFilled = shouldAutoFillReferenceFields(basisUnit)
      if (autoFilled) {
        setCookedFoodLineCountedAmount(String(line.referenceAmount))
      } else {
        setCookedFoodLineReferenceAmount(String(line.referenceAmount))
        setCookedFoodLineReferenceUnit(line.referenceUnit)
        setCookedFoodLineCountedAmount(
          line.countedAmount ? String(line.countedAmount) : '',
        )
      }
    } else {
      setCookedFoodLineMode('custom')
      setCookedFoodLineCustomName(line.name)
      setCookedFoodLineCustomKcal(String(line.kcalPer100))
      setCookedFoodLineCustomBasisUnit(line.kcalBasisUnit)
      setCookedFoodLineCustomIgnoreCalories(line.ignoreCalories)
      setCookedFoodLineCustomSaveToCatalog(line.saveToCatalog)
      const autoFilled = shouldAutoFillReferenceFields(line.kcalBasisUnit)
      if (autoFilled) {
        setCookedFoodLineCountedAmount(String(line.referenceAmount))
      } else {
        setCookedFoodLineReferenceAmount(String(line.referenceAmount))
        setCookedFoodLineReferenceUnit(line.referenceUnit)
        setCookedFoodLineCountedAmount(
          line.countedAmount ? String(line.countedAmount) : '',
        )
      }
    }

    removeCookedFoodIngredientLine(draftId)
  }

  const applyRecipeVersionToCookedFood = (
    recipeVersionId: Id<'recipeVersions'> | '',
  ) => {
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
            (line as { ignoreCaloriesSnapshot?: boolean })
              .ignoreCaloriesSnapshot,
          )
          const countedAmount =
            !ignoreCalories && referenceUnit === 'g'
              ? referenceAmount
              : undefined
          return {
            draftId: createDraftId(),
            sourceType: 'custom' as const,
            name:
              (line as { ingredientNameSnapshot?: string })
                .ingredientNameSnapshot ?? 'Custom ingredient',
            kcalPer100:
              (line as { kcalPer100Snapshot?: number }).kcalPer100Snapshot ?? 0,
            kcalBasisUnit:
              (line as { kcalBasisUnitSnapshot?: NutritionUnit })
                .kcalBasisUnitSnapshot ?? 'g',
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
    cookedFoodSessionId ||
    (editingCookedFoodId ? '' : (cookSessions[0]?._id ?? ''))
  const selectedCookSession = resolvedCookedFoodSessionId
    ? cookSessionById.get(resolvedCookedFoodSessionId)
    : undefined
  const selectedCookPersonName = selectedCookSession?.cookedByPersonId
    ? personById.get(selectedCookSession.cookedByPersonId)?.name
    : undefined

  const saveSession = () => {
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
        closeSessionEditor()
      },
    )
  }

  const saveCookedFood = () => {
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
      editingCookedFoodId ? 'Cooked food updated.' : 'Cooked food created.',
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
                    cookedFoodRecipeDraftName.trim() || resolvedCookedFoodName,
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
  }

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
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
              onClick={() => openEditSessionEditor(session)}
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
                confirmAndRunAction(
                  'Delete this session permanently?',
                  'Session deleted.',
                  async () => {
                    await deleteCookSession({ sessionId: session._id })
                    if (editingSessionId === session._id) {
                      closeSessionEditor()
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

  const cookedFoodColumns: ColumnDef<CookedFoodTableRow>[] = [
    {
      accessorKey: 'name',
      header: 'Cooked food',
      cell: ({ row }) => (
        <div className="max-w-56 whitespace-normal">
          <p className="font-medium text-foreground">{row.original.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.original.sessionLabel}
          </p>
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
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
                const ingredientLines =
                  cookedFoodIngredientsById.get(food._id) ?? []
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
                      (line as { countedAmount?: number }).countedAmount ??
                      line.rawWeightGrams
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
                        (line as { ingredientNameSnapshot?: string })
                          .ingredientNameSnapshot ??
                        (line.ingredientId
                          ? ingredientById.get(line.ingredientId)?.name
                          : undefined) ??
                        'Custom ingredient',
                      kcalPer100:
                        (line as { ingredientKcalPer100Snapshot?: number })
                          .ingredientKcalPer100Snapshot ?? 0,
                      kcalBasisUnit:
                        (
                          line as {
                            ingredientKcalBasisUnitSnapshot?: NutritionUnit
                          }
                        ).ingredientKcalBasisUnitSnapshot ?? 'g',
                      ignoreCalories: Boolean(
                        (line as { ignoreCaloriesSnapshot?: boolean })
                          .ignoreCaloriesSnapshot,
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
                setCookedFoodLineCustomSaveToCatalog(true)
                setCookedFoodLineReferenceAmount('')
                setCookedFoodLineReferenceUnit('g')
                setCookedFoodLineCountedAmount('')
                scrollToTop()
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void runAction(
                  food.archived
                    ? 'Cooked food restored.'
                    : 'Cooked food archived.',
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
                confirmAndRunAction(
                  'Delete this cooked food permanently?',
                  'Cooked food deleted.',
                  async () => {
                    await deleteCookedFood({ cookedFoodId: food._id })
                    if (editingCookedFoodId === food._id) {
                      resetCookedFoodForm()
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

  if (isLoading) {
    return (
      <LoadingSkeletonState
        title="Cooking"
        icon={<UserRound className="h-4 w-4" />}
      >
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-border bg-card/90 p-5">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-36" />
                  <Skeleton className="h-4 w-72" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-24" />
                  <Skeleton className="h-9 w-32" />
                </div>
              </div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-32" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
              <Skeleton className="h-52 w-full" />
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                <Skeleton className="h-56 w-full" />
                <Skeleton className="h-56 w-full" />
              </div>
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.95fr)]">
            <div className="space-y-2 rounded-lg border border-border bg-card/90 p-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-card/90 p-4">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        </div>
      </LoadingSkeletonState>
    )
  }

  return (
    <>
      <PageShell
        title="Cooking"
        icon={<UserRound className="h-4 w-4" />}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
      >
        <div className="mt-3 space-y-3">
          <Card className="border-border/70 bg-card/90">
            <CardHeader className="gap-2 border-b border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>Cooked foods</CardTitle>
                  <CardDescription>
                    Sessions, ingredients, and recipe details stay in one
                    workspace.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={resetCookedFoodForm}>
                    {editingCookedFoodId ? 'Cancel edit' : 'Reset form'}
                  </Button>
                  <Button onClick={saveCookedFood}>
                    {editingCookedFoodId
                      ? 'Save cooked food'
                      : 'Create cooked food'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Field label="Session">
                  <SearchablePicker
                    ariaLabel="Cooked food session search"
                    value={resolvedCookedFoodSessionId}
                    onValueChange={(value) =>
                      setCookedFoodSessionId(value as Id<'cookSessions'> | '')
                    }
                    placeholder="Search or switch session"
                    options={sessionOptions}
                  />
                </Field>
                <div className="xl:pt-[1.875rem]">
                  <Button
                    type="button"
                    size="sm"
                    onClick={openNewSessionEditor}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New session
                  </Button>
                </div>
                <div className="xl:pt-[1.875rem]">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!selectedCookSession}
                    onClick={() => {
                      if (selectedCookSession) {
                        openEditSessionEditor(selectedCookSession)
                      }
                    }}
                  >
                    Edit selected
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                {selectedCookSession ? (
                  <>
                    {formatCookSessionLabel(selectedCookSession)}
                    {' · '}
                    {toLocalDateString(selectedCookSession.cookedAt)}
                    {selectedCookPersonName
                      ? ` · ${selectedCookPersonName}`
                      : ''}
                    {selectedCookSession.archived ? ' · Archived' : ''}
                    {selectedCookSession.notes?.trim()
                      ? ` · ${selectedCookSession.notes}`
                      : ''}
                  </>
                ) : (
                  'Choose the session for this batch before saving the cooked food.'
                )}
              </p>

              {isSessionEditorVisible ? (
                <div className="rounded-md border border-border/70 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {editingSessionId ? 'Edit session' : 'New session'}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={closeSessionEditor}
                    >
                      Close
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Field label="Label">
                      <Input
                        aria-label="Session label"
                        placeholder="Breakfast"
                        value={sessionLabel}
                        onChange={(event) =>
                          setSessionLabel(event.target.value)
                        }
                      />
                    </Field>
                    <Field label="Date">
                      <DatePicker
                        value={sessionDate}
                        onChange={setSessionDate}
                        ariaLabel="Session date"
                        className="w-full justify-start"
                      />
                    </Field>
                    <Field label="Cooked by">
                      <Select
                        ariaLabel="Session person"
                        value={sessionPersonId}
                        onValueChange={(value) =>
                          setSessionPersonId(
                            (value as Id<'people'> | '' | null) ?? '',
                          )
                        }
                        placeholder="No person"
                        className="w-full"
                        options={[
                          { value: '', label: 'No person' },
                          ...people.map((person) => ({
                            value: person._id,
                            label: person.name,
                          })),
                        ]}
                      />
                    </Field>
                    <Field label="Notes">
                      <Input
                        aria-label="Session notes"
                        placeholder="Optional"
                        value={sessionNotes}
                        onChange={(event) =>
                          setSessionNotes(event.target.value)
                        }
                      />
                    </Field>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={saveSession}>
                      {editingSessionId ? 'Save session' : 'Create session'}
                    </Button>
                    <Button variant="outline" onClick={closeSessionEditor}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Field label="Cooked food name">
                  <Input
                    aria-label="Cooked food name"
                    placeholder="Musli"
                    value={cookedFoodName}
                    onChange={(event) => setCookedFoodName(event.target.value)}
                  />
                </Field>
                <Field label="Group">
                  <Select
                    ariaLabel="Cooked food group"
                    value={cookedFoodGroupId}
                    onValueChange={(value) =>
                      setCookedFoodGroupId(
                        (value as Id<'foodGroups'> | '' | null) ?? '',
                      )
                    }
                    placeholder="No group"
                    className="w-full"
                    options={[
                      { value: '', label: 'No group' },
                      ...groups.map((group) => ({
                        value: group._id,
                        label: group.name,
                      })),
                    ]}
                  />
                </Field>
                <Field label="Finished amount">
                  <Input
                    type="number"
                    aria-label="Finished cooked food amount"
                    placeholder="0"
                    value={cookedFoodFinishedWeight}
                    onChange={(event) =>
                      setCookedFoodFinishedWeight(event.target.value)
                    }
                  />
                </Field>
                <Field label="Notes">
                  <Input
                    aria-label="Cooked food notes"
                    placeholder="Optional"
                    value={cookedFoodNotes}
                    onChange={(event) => setCookedFoodNotes(event.target.value)}
                  />
                </Field>
              </div>

              <div className="rounded-md border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Ingredient lines
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Add existing ingredients or custom entries.
                    </p>
                  </div>
                  <IngredientLineModeToggle
                    value={cookedFoodLineMode}
                    onValueChange={setCookedFoodLineMode}
                  />
                </div>

                <div className="mt-4 space-y-4">
                  {cookedFoodLineMode === 'ingredient' ? (
                    <div
                      className={cn(
                        'grid gap-4',
                        shouldAutoFillIngredientReference
                          ? 'xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.95fr)_auto]'
                          : 'xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]',
                      )}
                    >
                      <Field label="Ingredient">
                        <SearchablePicker
                          value={cookedFoodLineIngredientId}
                          onValueChange={(value) => {
                            const nextIngredientId = value as
                              | Id<'ingredients'>
                              | ''
                            setCookedFoodLineIngredientId(nextIngredientId)
                            setCookedFoodLineReferenceUnit(
                              getIngredientBasisUnit(
                                nextIngredientId
                                  ? ingredientById.get(nextIngredientId)
                                  : undefined,
                              ),
                            )
                          }}
                          ariaLabel="Cooked food ingredient search"
                          placeholder="Search ingredient"
                          options={ingredientOptions}
                        />
                      </Field>
                      {shouldAutoFillIngredientReference ? null : (
                        <Field label="Reference amount">
                          <Input
                            type="number"
                            aria-label="Reference amount"
                            placeholder="0"
                            value={cookedFoodLineReferenceAmount}
                            onChange={(event) =>
                              setCookedFoodLineReferenceAmount(
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                      )}
                      {shouldAutoFillIngredientReference ? null : (
                        <Field label="Reference unit">
                          <Select
                            ariaLabel="Reference unit"
                            value={cookedFoodLineReferenceUnit}
                            onValueChange={(value) =>
                              setCookedFoodLineReferenceUnit(
                                (value as NutritionUnit | null) ?? 'g',
                              )
                            }
                            className="w-full"
                            options={NUTRITION_UNIT_OPTIONS}
                          />
                        </Field>
                      )}
                      <Field
                        label={
                          shouldAutoFillIngredientReference
                            ? 'Amount'
                            : 'Counted amount'
                        }
                      >
                        <Input
                          type="number"
                          aria-label={
                            shouldAutoFillIngredientReference
                              ? 'Ingredient amount'
                              : 'Counted amount'
                          }
                          placeholder="0"
                          value={cookedFoodLineCountedAmount}
                          onChange={(event) =>
                            setCookedFoodLineCountedAmount(event.target.value)
                          }
                        />
                      </Field>
                      <div className="xl:pt-[1.875rem]">
                        <Button
                          variant="outline"
                          onClick={addCookedFoodIngredientLine}
                        >
                          Add line
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className={cn(
                          'grid gap-4',
                          cookedFoodLineCustomIgnoreCalories
                            ? 'xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]'
                            : 'xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]',
                        )}
                      >
                        <Field label="Ingredient">
                          <Input
                            aria-label="Custom ingredient name"
                            placeholder="Ingredient"
                            value={cookedFoodLineCustomName}
                            onChange={(event) =>
                              setCookedFoodLineCustomName(event.target.value)
                            }
                          />
                        </Field>
                        {cookedFoodLineCustomIgnoreCalories ? null : (
                          <>
                            <Field label="kcal per 100">
                              <Input
                                type="number"
                                aria-label="Custom kcal per 100"
                                placeholder="0"
                                value={cookedFoodLineCustomKcal}
                                onChange={(event) =>
                                  setCookedFoodLineCustomKcal(
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                            <Field label="Basis unit">
                              <Select
                                ariaLabel="Custom kcal basis"
                                value={cookedFoodLineCustomBasisUnit}
                                onValueChange={(value) => {
                                  const nextUnit =
                                    (value as NutritionUnit | null) ?? 'g'
                                  setCookedFoodLineCustomBasisUnit(nextUnit)
                                  setCookedFoodLineReferenceUnit(nextUnit)
                                }}
                                className="w-full"
                                options={NUTRITION_UNIT_OPTIONS}
                              />
                            </Field>
                          </>
                        )}
                      </div>
                      <div
                        className={cn(
                          'grid gap-4',
                          shouldAutoFillCustomReference
                            ? 'xl:grid-cols-[minmax(0,1fr)_auto]'
                            : 'xl:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto]',
                        )}
                      >
                        {shouldAutoFillCustomReference ? null : (
                          <Field label="Reference amount">
                            <Input
                              type="number"
                              aria-label="Custom reference amount"
                              placeholder="0"
                              value={cookedFoodLineReferenceAmount}
                              onChange={(event) =>
                                setCookedFoodLineReferenceAmount(
                                  event.target.value,
                                )
                              }
                            />
                          </Field>
                        )}
                        {shouldAutoFillCustomReference ? null : (
                          <Field label="Reference unit">
                            <Select
                              ariaLabel="Custom reference unit"
                              value={cookedFoodLineReferenceUnit}
                              onValueChange={(value) =>
                                setCookedFoodLineReferenceUnit(
                                  (value as NutritionUnit | null) ?? 'g',
                                )
                              }
                              className="w-full"
                              options={NUTRITION_UNIT_OPTIONS}
                            />
                          </Field>
                        )}
                        <Field
                          label={
                            shouldAutoFillCustomReference
                              ? 'Amount'
                              : 'Counted amount'
                          }
                        >
                          <Input
                            type="number"
                            aria-label={
                              shouldAutoFillCustomReference
                                ? 'Custom ingredient amount'
                                : 'Custom counted amount'
                            }
                            placeholder="0"
                            value={cookedFoodLineCountedAmount}
                            onChange={(event) =>
                              setCookedFoodLineCountedAmount(event.target.value)
                            }
                          />
                        </Field>
                        <div className="xl:pt-[1.875rem]">
                          <Button
                            variant="outline"
                            onClick={addCookedFoodIngredientLine}
                          >
                            Add line
                          </Button>
                        </div>
                      </div>
                      {shouldAutoFillCustomReference ? (
                        <p className="text-sm text-muted-foreground">
                          Reference amount and unit will be saved automatically
                          from the amount and basis unit.
                        </p>
                      ) : null}
                      <CustomIngredientSwitchRow
                        ignoreCalories={cookedFoodLineCustomIgnoreCalories}
                        onIgnoreCaloriesChange={
                          setCookedFoodLineCustomIgnoreCalories
                        }
                        saveToCatalog={cookedFoodLineCustomSaveToCatalog}
                        onSaveToCatalogChange={
                          setCookedFoodLineCustomSaveToCatalog
                        }
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                <div className="rounded-md border border-border/70 bg-muted/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Recipe
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Use an existing recipe as a starting point, or save this
                        result as one.
                      </p>
                    </div>
                    {!editingCookedFoodId ? (
                      <label className="inline-flex items-center gap-2 text-sm text-foreground">
                        <Switch
                          checked={saveCookedFoodAsRecipe}
                          onCheckedChange={(checked) => {
                            const nextChecked = Boolean(checked)
                            setSaveCookedFoodAsRecipe(nextChecked)
                            if (nextChecked) {
                              setCookedFoodRecipeVersionId('')
                              if (
                                !cookedFoodRecipeDraftName.trim() &&
                                cookedFoodName.trim()
                              ) {
                                setCookedFoodRecipeDraftName(
                                  cookedFoodName.trim(),
                                )
                              }
                            }
                          }}
                        />
                        Save as reusable recipe
                      </label>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-4">
                    {editingCookedFoodId || !saveCookedFoodAsRecipe ? (
                      <Field label="Recipe source">
                        <SearchablePicker
                          value={cookedFoodRecipeVersionId}
                          onValueChange={(value) =>
                            applyRecipeVersionToCookedFood(
                              value as Id<'recipeVersions'> | '',
                            )
                          }
                          ariaLabel="Cooked food recipe search"
                          placeholder="Search recipe"
                          options={recipeVersionOptions}
                        />
                      </Field>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        A new recipe draft will be created from these ingredient
                        lines.
                      </p>
                    )}

                    {!editingCookedFoodId && saveCookedFoodAsRecipe ? (
                      <div className="grid gap-4 lg:grid-cols-2">
                        <Field label="Recipe name">
                          <Input
                            aria-label="Recipe name from cooked food"
                            placeholder={cookedFoodName.trim() || 'Recipe name'}
                            value={cookedFoodRecipeDraftName}
                            onChange={(event) =>
                              setCookedFoodRecipeDraftName(event.target.value)
                            }
                          />
                        </Field>
                        <Field label="Description">
                          <Input
                            aria-label="Recipe description from cooked food"
                            placeholder="Optional"
                            value={cookedFoodRecipeDraftDescription}
                            onChange={(event) =>
                              setCookedFoodRecipeDraftDescription(
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                        <Field label="Instructions" className="lg:col-span-2">
                          <Textarea
                            aria-label="Recipe instructions from cooked food"
                            placeholder="Optional"
                            value={cookedFoodRecipeDraftInstructions}
                            onChange={(event) =>
                              setCookedFoodRecipeDraftInstructions(
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                        <Field label="Notes" className="lg:col-span-2">
                          <Input
                            aria-label="Recipe notes from cooked food"
                            placeholder="Optional"
                            value={cookedFoodRecipeDraftNotes}
                            onChange={(event) =>
                              setCookedFoodRecipeDraftNotes(event.target.value)
                            }
                          />
                        </Field>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-md border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        Current lines ({cookedFoodIngredientLines.length})
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Review before saving.
                      </p>
                    </div>

                    {cookedFoodIngredientLines.length === 0 ? (
                      <div className="mt-4 rounded-md border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
                        Add at least one ingredient line.
                      </div>
                    ) : (
                      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                        {cookedFoodIngredientLines.map((line) => {
                          const ignored =
                            line.sourceType === 'ingredient'
                              ? isIngredientIgnored(line.ingredientId)
                              : line.ignoreCalories
                          const label =
                            line.sourceType === 'ingredient'
                              ? (ingredientById.get(line.ingredientId)?.name ??
                                'Ingredient')
                              : line.name
                          return (
                            <div
                              key={line.draftId}
                              className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/80 px-3 py-2"
                            >
                              <p className="text-sm text-foreground">
                                <span className="font-medium">{label}</span>
                                {' · '}
                                {line.referenceAmount.toFixed(0)}{' '}
                                {getNutritionUnitLabel(line.referenceUnit)}
                                {ignored ? (
                                  <>{' · '}Ignored calories</>
                                ) : line.referenceUnit !== 'g' &&
                                  line.countedAmount ? (
                                  <>
                                    {' · '}Counted: {line.countedAmount.toFixed(0)} g
                                  </>
                                ) : null}
                                {line.sourceType === 'custom' &&
                                !line.ignoreCalories ? (
                                  <>
                                    {' · '}kcal/100{' '}
                                    {formatKcalPer100(line.kcalPer100)} (
                                    {getNutritionUnitLabel(line.kcalBasisUnit)})
                                  </>
                                ) : null}
                              </p>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    editCookedFoodIngredientLine(line.draftId)
                                  }
                                >
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    removeCookedFoodIngredientLine(line.draftId)
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {editingCookedFoodId
                            ? 'Update cooked food'
                            : 'Ready to save'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {cookedFoodIngredientLines.length} ingredient lines
                          {selectedCookSession
                            ? ` · ${formatCookSessionLabel(selectedCookSession)}`
                            : ' · No session selected'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {editingCookedFoodId ? (
                          <Button
                            variant="outline"
                            onClick={resetCookedFoodForm}
                          >
                            Cancel
                          </Button>
                        ) : null}
                        <Button onClick={saveCookedFood}>
                          {editingCookedFoodId
                            ? 'Save cooked food'
                            : 'Create cooked food'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.95fr)]">
            <Card className="border-border/70 bg-card/90">
              <CardHeader className="gap-2 border-b border-border/60">
                <CardTitle>Cooked foods</CardTitle>
                <CardDescription>{cookedFoodRows.length} total</CardDescription>
              </CardHeader>
              <CardContent className="pt-3">
                <DataTable
                  columns={cookedFoodColumns}
                  data={cookedFoodRows}
                  searchColumnId="name"
                  searchPlaceholder="Search cooked foods"
                  emptyText="No cooked foods found."
                />
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardHeader className="gap-2 border-b border-border/60">
                <CardTitle>Sessions</CardTitle>
                <CardDescription>{sessionRows.length} total</CardDescription>
              </CardHeader>
              <CardContent className="pt-3">
                <DataTable
                  columns={sessionColumns}
                  data={sessionRows}
                  searchColumnId="label"
                  searchPlaceholder="Search sessions"
                  emptyText="No sessions found."
                />
              </CardContent>
            </Card>
          </div>
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

function createDraftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

type FieldProps = {
  label: string
  children: ReactNode
  className?: string
}

function Field({ label, children, className }: FieldProps) {
  return (
    <div className={cn('block min-w-0', className)}>
      <span className="mb-2 block text-sm font-medium text-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}
