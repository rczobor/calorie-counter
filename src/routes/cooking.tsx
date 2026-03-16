import { type ColumnDef } from '@tanstack/react-table'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { Copy, Plus, Trash2, UserRound } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'

import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { PageShell } from '@/components/page/page-shell'
import {
  ConfigMissingState,
  LoadingSkeletonState,
} from '@/components/page/page-states'
import { StatusBadge } from '@/components/page/status-badge'
import {
  CustomIngredientSwitchRow,
  IngredientLineModeToggle,
} from '@/components/nutrition/ingredient-line-controls'
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
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { useManagementData } from '@/hooks/use-management-data'
import { isConvexConfigured } from '@/integrations/convex/config'
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
import { toast } from 'sonner'

type SessionTableRow = {
  id: Id<'cookSessions'>
  session: Doc<'cookSessions'>
  label: string
  cookedAt: string
  countsLabel: string
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

type CookingDraft = {
  draftId: string
  sessionId: Id<'cookSessions'>
  persistedCookedFoodId?: Id<'cookedFoods'>
  isDirty: boolean
  createdAt: number
  updatedAt: number
  name: string
  groupId: Id<'foodGroups'> | ''
  finishedWeight: string
  recipeVersionId: Id<'recipeVersions'> | ''
  saveAsRecipe: boolean
  recipeDraftName: string
  recipeDraftDescription: string
  recipeDraftInstructions: string
  recipeDraftNotes: string
  notes: string
  lineMode: 'ingredient' | 'custom'
  lineIngredientId: Id<'ingredients'> | ''
  lineCustomName: string
  lineCustomKcal: string
  lineCustomBasisUnit: NutritionUnit
  lineCustomIgnoreCalories: boolean
  lineCustomSaveToCatalog: boolean
  lineReferenceAmount: string
  lineReferenceUnit: NutritionUnit
  lineCountedAmount: string
  ingredientLines: CookedFoodIngredientDraft[]
}

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
  const [showAllCookedFoods, setShowAllCookedFoods] = useState(false)
  const [isSessionEditorVisible, setIsSessionEditorVisible] = useState(false)
  const [selectedCookSessionId, setSelectedCookSessionId] = useState<
    Id<'cookSessions'> | ''
  >('')
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<CookingDraft[]>([])
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

  const ingredientOptions = useMemo(
    () =>
      ingredients.map((item) => ({
        value: item._id,
        label: item.name,
        keywords: `${item.brand ?? ''} ${formatKcalPer100(getKcalPer100(item))} kcal`,
      })),
    [ingredients],
  )

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

  const effectiveSelectedCookSessionId =
    selectedCookSessionId &&
    cookSessions.some((session) => session._id === selectedCookSessionId)
      ? selectedCookSessionId
      : (cookSessions[0]?._id ?? '')

  const selectedCookSession = effectiveSelectedCookSessionId
    ? cookSessionById.get(effectiveSelectedCookSessionId)
    : undefined
  const selectedCookPersonName = selectedCookSession?.cookedByPersonId
    ? personById.get(selectedCookSession.cookedByPersonId)?.name
    : undefined

  const sessionDrafts = useMemo(
    () =>
      drafts
        .filter((draft) => draft.sessionId === effectiveSelectedCookSessionId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, effectiveSelectedCookSessionId],
  )

  const effectiveActiveDraftId =
    activeDraftId && sessionDrafts.some((draft) => draft.draftId === activeDraftId)
      ? activeDraftId
      : (sessionDrafts[0]?.draftId ?? null)

  const activeDraft = useMemo(
    () =>
      sessionDrafts.find((draft) => draft.draftId === effectiveActiveDraftId) ??
      null,
    [effectiveActiveDraftId, sessionDrafts],
  )

  const selectedCookedFoodLineIngredient = activeDraft?.lineIngredientId
    ? ingredientById.get(activeDraft.lineIngredientId)
    : undefined
  const selectedCookedFoodLineIngredientBasisUnit = getIngredientBasisUnit(
    selectedCookedFoodLineIngredient,
  )
  const shouldAutoFillIngredientReference = shouldAutoFillReferenceFields(
    selectedCookedFoodLineIngredientBasisUnit,
  )
  const shouldAutoFillCustomReference = shouldAutoFillReferenceFields(
    activeDraft?.lineCustomBasisUnit ?? 'g',
  )

  const draftCountsBySessionId = useMemo(() => {
    const map = new Map<Id<'cookSessions'>, number>()
    for (const draft of drafts) {
      map.set(draft.sessionId, (map.get(draft.sessionId) ?? 0) + 1)
    }
    return map
  }, [drafts])

  const cookedFoodCountsBySessionId = useMemo(() => {
    const map = new Map<Id<'cookSessions'>, number>()
    for (const cookedFood of cookedFoods) {
      map.set(
        cookedFood.cookSessionId,
        (map.get(cookedFood.cookSessionId) ?? 0) + 1,
      )
    }
    return map
  }, [cookedFoods])

  const sessionRows = useMemo<SessionTableRow[]>(
    () =>
      cookSessions.map((session) => ({
        id: session._id,
        session,
        label: session.label?.trim() || 'Unnamed session',
        cookedAt: toLocalDateString(session.cookedAt),
        countsLabel: `${draftCountsBySessionId.get(session._id) ?? 0} drafts · ${
          cookedFoodCountsBySessionId.get(session._id) ?? 0
        } saved`,
        status: session.archived ? 'Archived' : 'Active',
      })),
    [cookSessions, cookedFoodCountsBySessionId, draftCountsBySessionId],
  )

  const visibleCookedFoods = useMemo(
    () =>
      showAllCookedFoods || !effectiveSelectedCookSessionId
        ? cookedFoods
        : cookedFoods.filter(
            (food) => food.cookSessionId === effectiveSelectedCookSessionId,
          ),
    [cookedFoods, effectiveSelectedCookSessionId, showAllCookedFoods],
  )

  const cookedFoodRows = useMemo<CookedFoodTableRow[]>(
    () =>
      visibleCookedFoods.map((food) => ({
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
    [cookSessionById, visibleCookedFoods],
  )

  const resetSessionForm = () => {
    setEditingSessionId(null)
    setSessionLabel('')
    setSessionDate(toLocalDateString(Date.now()))
    setSessionPersonId('')
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
    scrollToTop()
  }

  const openEditSessionEditor = (session: Doc<'cookSessions'>) => {
    setEditingSessionId(session._id)
    setSessionLabel(session.label ?? '')
    setSessionDate(toLocalDateString(session.cookedAt))
    setSessionPersonId(session.cookedByPersonId ?? '')
    setIsSessionEditorVisible(true)
    scrollToTop()
  }

  const closeSessionEditor = () => {
    setIsSessionEditorVisible(false)
    resetSessionForm()
  }

  const updateDraft = (
    draftId: string,
    updater: (draft: CookingDraft) => CookingDraft,
    options?: { markDirty?: boolean },
  ) => {
    const { markDirty = true } = options ?? {}
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.draftId !== draftId) {
          return draft
        }
        const nextDraft = updater(draft)
        return {
          ...nextDraft,
          updatedAt: Date.now(),
          isDirty: markDirty ? true : nextDraft.isDirty,
        }
      }),
    )
  }

  const updateActiveDraft = (
    updater: (draft: CookingDraft) => CookingDraft,
    options?: { markDirty?: boolean },
  ) => {
    if (!activeDraft) {
      return
    }
    updateDraft(activeDraft.draftId, updater, options)
  }

  const selectDraft = (draftId: string, sessionId: Id<'cookSessions'>) => {
    setSelectedCookSessionId(sessionId)
    setActiveDraftId(draftId)
    scrollToTop()
  }

  const createDraftForSession = (
    sessionId: Id<'cookSessions'>,
    sourceDraft?: CookingDraft,
  ) => {
    const nextDraft = sourceDraft
      ? duplicateCookingDraft(sourceDraft)
      : createCookingDraft(sessionId)
    setDrafts((current) => [nextDraft, ...current])
    setSelectedCookSessionId(sessionId)
    setActiveDraftId(nextDraft.draftId)
    setShowAllCookedFoods(false)
    scrollToTop()
    return nextDraft
  }

  const removeDraft = (draftId: string) => {
    setDrafts((current) => current.filter((draft) => draft.draftId !== draftId))
    if (activeDraftId === draftId) {
      setActiveDraftId(null)
    }
  }

  const discardDraft = (draft: CookingDraft) => {
    const remove = () => {
      removeDraft(draft.draftId)
      return Promise.resolve()
    }
    if (!draft.persistedCookedFoodId && !draft.isDirty && !draftHasUserContent(draft)) {
      void remove()
      return
    }
    confirmAndRunAction(
      'Discard this in-progress cooking?',
      'Draft discarded.',
      remove,
    )
  }

  const openSavedFoodInDraft = (food: Doc<'cookedFoods'>) => {
    const existingDraft = drafts.find(
      (draft) => draft.persistedCookedFoodId === food._id,
    )
    if (existingDraft) {
      selectDraft(existingDraft.draftId, existingDraft.sessionId)
      return
    }
    const ingredientLines = cookedFoodIngredientsById.get(food._id) ?? []
    const nextDraft = createDraftFromCookedFood(
      food,
      ingredientLines,
      ingredientById,
    )
    setDrafts((current) => [nextDraft, ...current])
    setSelectedCookSessionId(food.cookSessionId)
    setActiveDraftId(nextDraft.draftId)
    setShowAllCookedFoods(false)
    scrollToTop()
  }

  const duplicateSavedFoodAsDraft = (food: Doc<'cookedFoods'>) => {
    const ingredientLines = cookedFoodIngredientsById.get(food._id) ?? []
    const sourceDraft = createDraftFromCookedFood(
      food,
      ingredientLines,
      ingredientById,
    )
    const duplicatedDraft = duplicateCookingDraft(sourceDraft)
    setDrafts((current) => [duplicatedDraft, ...current])
    setSelectedCookSessionId(food.cookSessionId)
    setActiveDraftId(duplicatedDraft.draftId)
    setShowAllCookedFoods(false)
    scrollToTop()
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
    if (!activeDraft) {
      return
    }

    const parsedCounted = Number(activeDraft.lineCountedAmount)
    const countedAmount =
      Number.isFinite(parsedCounted) && parsedCounted > 0
        ? parsedCounted
        : undefined

    if (activeDraft.lineMode === 'ingredient') {
      if (!activeDraft.lineIngredientId) {
        return
      }
      const basisUnit = getIngredientBasisUnit(
        ingredientById.get(activeDraft.lineIngredientId),
      )
      const shouldAutoFillReference = shouldAutoFillReferenceFields(basisUnit)
      const referenceUnit = shouldAutoFillReference
        ? basisUnit
        : activeDraft.lineReferenceUnit
      const ignored = isIngredientIgnored(activeDraft.lineIngredientId)
      let referenceAmount: number
      if (shouldAutoFillReference && !countedAmount) {
        toast.error('Amount is required for ingredients using grams or ml.')
        return
      }
      if (shouldAutoFillReference) {
        referenceAmount = countedAmount!
      } else {
        referenceAmount = Number(activeDraft.lineReferenceAmount)
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
      updateActiveDraft((draft) => ({
        ...draft,
        ingredientLines: [
          ...draft.ingredientLines,
          {
            draftId: createDraftId(),
            sourceType: 'ingredient',
            ingredientId: draft.lineIngredientId as Id<'ingredients'>,
            referenceAmount,
            referenceUnit,
            countedAmount,
          },
        ],
        lineIngredientId: '',
        lineReferenceAmount: '',
        lineReferenceUnit: 'g',
        lineCountedAmount: '',
      }))
      return
    }

    const parsedKcal = Number(activeDraft.lineCustomKcal)
    if (!activeDraft.lineCustomName.trim()) {
      return
    }
    if (
      !activeDraft.lineCustomIgnoreCalories &&
      (!Number.isFinite(parsedKcal) || parsedKcal <= 0)
    ) {
      return
    }
    const kcalPer100 =
      activeDraft.lineCustomIgnoreCalories &&
      (!Number.isFinite(parsedKcal) || parsedKcal < 0)
        ? 0
        : parsedKcal
    const referenceUnit = shouldAutoFillCustomReference
      ? activeDraft.lineCustomBasisUnit
      : activeDraft.lineReferenceUnit
    let referenceAmount: number
    if (shouldAutoFillCustomReference && !countedAmount) {
      toast.error('Amount is required for custom entries using grams or ml.')
      return
    }
    if (shouldAutoFillCustomReference) {
      referenceAmount = countedAmount!
    } else {
      referenceAmount = Number(activeDraft.lineReferenceAmount)
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
    if (!activeDraft.lineCustomIgnoreCalories && !countedAmount) {
      toast.error('Counted amount is required for calorie-counted ingredients.')
      return
    }

    updateActiveDraft((draft) => ({
      ...draft,
      ingredientLines: [
        ...draft.ingredientLines,
        {
          draftId: createDraftId(),
          sourceType: 'custom',
          name: draft.lineCustomName.trim(),
          kcalPer100,
          kcalBasisUnit: draft.lineCustomBasisUnit,
          ignoreCalories: draft.lineCustomIgnoreCalories,
          referenceAmount,
          referenceUnit,
          countedAmount,
          saveToCatalog: draft.lineCustomSaveToCatalog,
        },
      ],
      lineCustomName: '',
      lineCustomKcal: '',
      lineCustomBasisUnit: 'g',
      lineCustomIgnoreCalories: false,
      lineCustomSaveToCatalog: true,
      lineReferenceAmount: '',
      lineReferenceUnit: 'g',
      lineCountedAmount: '',
    }))
  }

  const removeCookedFoodIngredientLine = (ingredientDraftId: string) => {
    updateActiveDraft((draft) => ({
      ...draft,
      ingredientLines: draft.ingredientLines.filter(
        (line) => line.draftId !== ingredientDraftId,
      ),
    }))
  }

  const editCookedFoodIngredientLine = (ingredientDraftId: string) => {
    if (!activeDraft) {
      return
    }
    const line = activeDraft.ingredientLines.find(
      (item) => item.draftId === ingredientDraftId,
    )
    if (!line) {
      return
    }

    if (line.sourceType === 'ingredient') {
      const basisUnit = getIngredientBasisUnit(ingredientById.get(line.ingredientId))
      const autoFilled = shouldAutoFillReferenceFields(basisUnit)
      updateActiveDraft((draft) => ({
        ...draft,
        lineMode: 'ingredient',
        lineIngredientId: line.ingredientId,
        lineReferenceAmount: autoFilled ? '' : String(line.referenceAmount),
        lineReferenceUnit: autoFilled ? 'g' : line.referenceUnit,
        lineCountedAmount: autoFilled
          ? String(line.referenceAmount)
          : line.countedAmount
            ? String(line.countedAmount)
            : '',
        ingredientLines: draft.ingredientLines.filter(
          (item) => item.draftId !== ingredientDraftId,
        ),
      }))
      return
    }

    const autoFilled = shouldAutoFillReferenceFields(line.kcalBasisUnit)
    updateActiveDraft((draft) => ({
      ...draft,
      lineMode: 'custom',
      lineCustomName: line.name,
      lineCustomKcal: String(line.kcalPer100),
      lineCustomBasisUnit: line.kcalBasisUnit,
      lineCustomIgnoreCalories: line.ignoreCalories,
      lineCustomSaveToCatalog: line.saveToCatalog,
      lineReferenceAmount: autoFilled ? '' : String(line.referenceAmount),
      lineReferenceUnit: autoFilled ? 'g' : line.referenceUnit,
      lineCountedAmount: autoFilled
        ? String(line.referenceAmount)
        : line.countedAmount
          ? String(line.countedAmount)
          : '',
      ingredientLines: draft.ingredientLines.filter(
        (item) => item.draftId !== ingredientDraftId,
      ),
    }))
  }

  const applyRecipeVersionToActiveDraft = (
    recipeVersionId: Id<'recipeVersions'> | '',
  ) => {
    if (!activeDraft) {
      return
    }
    const recipeVersion = recipeVersionId
      ? recipeVersionById.get(recipeVersionId)
      : undefined
    const recipeLines = recipeVersionId
      ? recipeIngredientsByVersionId.get(recipeVersionId) ?? []
      : []

    updateActiveDraft((draft) => ({
      ...draft,
      recipeVersionId,
      saveAsRecipe: recipeVersionId ? false : draft.saveAsRecipe,
      name:
        recipeVersion && draft.name.trim() === '' ? recipeVersion.name : draft.name,
      ingredientLines:
        recipeVersionId === ''
          ? draft.ingredientLines
          : recipeLines.map((line) => {
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
                    (line as { kcalPer100Snapshot?: number }).kcalPer100Snapshot ??
                    0,
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
    }))
  }

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
          })
          setSelectedCookSessionId(editingSessionId)
        } else {
          const sessionId = await createCookSession({
            label: sessionLabel.trim() || undefined,
            cookedAt,
            cookedByPersonId: sessionPersonId || undefined,
          })
          createDraftForSession(sessionId)
        }
        closeSessionEditor()
      },
    )
  }

  const saveActiveDraft = (options?: { addAnother?: boolean }) => {
    if (!activeDraft) {
      toast.error('Create or open a cooking before saving.')
      return
    }

    const { addAnother = false } = options ?? {}
    const resolvedCookedFoodName =
      activeDraft.name.trim() || toLocalDateString(Date.now())

    if (activeDraft.ingredientLines.length === 0) {
      toast.error('Add at least one ingredient line.')
      return
    }

    const finishedWeight = Number(activeDraft.finishedWeight)
    if (!Number.isFinite(finishedWeight) || finishedWeight <= 0) {
      toast.error('Finished amount must be greater than 0.')
      return
    }

    for (const line of activeDraft.ingredientLines) {
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
      !activeDraft.persistedCookedFoodId &&
      activeDraft.saveAsRecipe &&
      !(activeDraft.recipeDraftName.trim() || resolvedCookedFoodName)
    ) {
      toast.error('Recipe name is required when saving as recipe.')
      return
    }

    const recipeVersion =
      !activeDraft.saveAsRecipe && activeDraft.recipeVersionId
        ? recipeVersionById.get(activeDraft.recipeVersionId)
        : undefined

    const payload = {
      cookSessionId: activeDraft.sessionId,
      name: resolvedCookedFoodName,
      recipeId: recipeVersion?.recipeId,
      recipeVersionId: activeDraft.recipeVersionId || undefined,
      groupIds: activeDraft.groupId ? [activeDraft.groupId] : [],
      finishedWeightGrams: finishedWeight,
      notes: activeDraft.notes.trim() || undefined,
      ingredients: activeDraft.ingredientLines.map((line) =>
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

    const draftToSave = activeDraft
    void runAction(
      draftToSave.persistedCookedFoodId
        ? 'Cooked food updated.'
        : 'Cooked food created.',
      async () => {
        if (draftToSave.persistedCookedFoodId) {
          await updateCookedFood({
            cookedFoodId: draftToSave.persistedCookedFoodId,
            ...payload,
          })
        } else {
          await createCookedFood({
            ...payload,
            saveAsRecipe: draftToSave.saveAsRecipe || undefined,
            recipeDraft: draftToSave.saveAsRecipe
              ? {
                  name:
                    draftToSave.recipeDraftName.trim() || resolvedCookedFoodName,
                  description:
                    draftToSave.recipeDraftDescription.trim() || undefined,
                  instructions:
                    draftToSave.recipeDraftInstructions.trim() || undefined,
                  notes: draftToSave.recipeDraftNotes.trim() || undefined,
                }
              : undefined,
          })
        }

        const nextDraft = addAnother
          ? createCookingDraft(draftToSave.sessionId)
          : null
        setDrafts((current) => {
          const remaining = current.filter(
            (draft) => draft.draftId !== draftToSave.draftId,
          )
          return nextDraft ? [nextDraft, ...remaining] : remaining
        })
        setSelectedCookSessionId(draftToSave.sessionId)
        setActiveDraftId(nextDraft?.draftId ?? null)
        setShowAllCookedFoods(false)
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
      accessorKey: 'countsLabel',
      header: 'Workspace',
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
              onClick={() => {
                setSelectedCookSessionId(session._id)
                setShowAllCookedFoods(false)
              }}
            >
              Open
            </Button>
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
                    setDrafts((current) =>
                      current.filter((draft) => draft.sessionId !== session._id),
                    )
                    if (editingSessionId === session._id) {
                      closeSessionEditor()
                    }
                    if (selectedCookSessionId === session._id) {
                      setSelectedCookSessionId('')
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
      header: 'Saved food',
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
              onClick={() => openSavedFoodInDraft(food)}
            >
              Open
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => duplicateSavedFoodAsDraft(food)}
            >
              Duplicate
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
                    setDrafts((current) =>
                      current.filter(
                        (draft) => draft.persistedCookedFoodId !== food._id,
                      ),
                    )
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
              <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
                <Skeleton className="h-96 w-full" />
                <Skeleton className="h-96 w-full" />
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

  const noSessions = cookSessions.length === 0
  const savedFoodsCardTitle = showAllCookedFoods
    ? 'Saved foods across all sessions'
    : selectedCookSession
      ? `Saved in ${formatCookSessionLabel(selectedCookSession)}`
      : 'Saved foods'

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
                  <CardTitle>Session workspace</CardTitle>
                  <CardDescription>
                    Pick a session, then manage several cookings side by side
                    without losing in-progress work.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={openNewSessionEditor}>
                    <Plus className="h-3.5 w-3.5" />
                    New session
                  </Button>
                  <Button
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
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Field label="Session">
                  <SearchablePicker
                    ariaLabel="Cook session search"
                    value={effectiveSelectedCookSessionId}
                    onValueChange={(value) => {
                      setSelectedCookSessionId(value as Id<'cookSessions'> | '')
                      setShowAllCookedFoods(false)
                    }}
                    placeholder="Search or switch session"
                    options={sessionOptions}
                  />
                </Field>
                <div className="xl:pt-[1.875rem]">
                  <Button
                    type="button"
                    disabled={!selectedCookSession}
                    onClick={() => {
                      if (effectiveSelectedCookSessionId) {
                        createDraftForSession(effectiveSelectedCookSessionId)
                      }
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New cooking
                  </Button>
                </div>
                <div className="xl:pt-[1.875rem]">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!activeDraft}
                    onClick={() => {
                      if (activeDraft) {
                        createDraftForSession(activeDraft.sessionId, activeDraft)
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicate current
                  </Button>
                </div>
              </div>

              {selectedCookSession ? (
                <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {formatCookSessionLabel(selectedCookSession)}
                  </span>
                  {' · '}
                  {toLocalDateString(selectedCookSession.cookedAt)}
                  {selectedCookPersonName ? ` · ${selectedCookPersonName}` : ''}
                  {selectedCookSession.archived ? ' · Archived' : ''}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                  Create your first session to start cooking. Sessions hold the
                  shared date/person context while each cooking stays separate.
                </div>
              )}

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

                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <Field label="Label">
                      <Input
                        aria-label="Session label"
                        placeholder="Breakfast prep"
                        value={sessionLabel}
                        onChange={(event) => setSessionLabel(event.target.value)}
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
            </CardContent>
          </Card>

          <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
            <Card className="border-border/70 bg-card/90">
              <CardHeader className="gap-2 border-b border-border/60">
                <CardTitle>In progress</CardTitle>
                <CardDescription>
                  Drafts stay attached to the selected session until you save or
                  discard them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-3">
                {noSessions ? (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                    Start by creating a session. Your first cooking draft opens
                    automatically right after.
                  </div>
                ) : sessionDrafts.length === 0 ? (
                  <div className="space-y-3 rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                    <p>No drafts in this session yet.</p>
                    <p>
                      Open a saved food to edit it here, or start a new cooking
                      draft for a fridge batch.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (effectiveSelectedCookSessionId) {
                          createDraftForSession(effectiveSelectedCookSessionId)
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Start first draft
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessionDrafts.map((draft) => (
                      <div
                        key={draft.draftId}
                        className={cn(
                          'flex items-start gap-2 rounded-md border p-3 transition-colors',
                          activeDraft?.draftId === draft.draftId
                            ? 'border-primary/60 bg-primary/5'
                            : 'border-border/70 bg-muted/10 hover:bg-muted/20',
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => selectDraft(draft.draftId, draft.sessionId)}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-foreground">
                              {getCookingDraftLabel(draft)}
                            </p>
                            <DraftBadge draft={draft} />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {draft.ingredientLines.length} lines
                            {draft.finishedWeight.trim()
                              ? ` · ${draft.finishedWeight}g finished`
                              : ' · No finished amount yet'}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Updated {formatRelativeDraftTime(draft.updatedAt)}
                          </p>
                        </button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Discard ${getCookingDraftLabel(draft)}`}
                          onClick={() => discardDraft(draft)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardHeader className="gap-2 border-b border-border/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>
                      {activeDraft
                        ? activeDraft.persistedCookedFoodId
                          ? 'Edit saved cooking'
                          : 'Draft editor'
                        : 'Draft editor'}
                    </CardTitle>
                    <CardDescription>
                      {selectedCookSession
                        ? `Working inside ${formatCookSessionLabel(selectedCookSession)}`
                        : 'Select a session to start editing.'}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      disabled={!activeDraft}
                      onClick={() => {
                        if (activeDraft) {
                          discardDraft(activeDraft)
                        }
                      }}
                    >
                      Discard draft
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!activeDraft}
                      onClick={() => saveActiveDraft({ addAnother: true })}
                    >
                      Save and add another
                    </Button>
                    <Button
                      disabled={!activeDraft}
                      onClick={() => saveActiveDraft()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-3">
                {!selectedCookSession ? (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-sm text-muted-foreground">
                    Choose a session first. Sessions keep the shared cooking
                    context while each draft stays independent.
                  </div>
                ) : !activeDraft ? (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-sm text-muted-foreground">
                    Open a saved food or create a new draft to start editing.
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {getCookingDraftLabel(activeDraft)}
                      </span>
                      {' · '}
                      {activeDraft.persistedCookedFoodId
                        ? 'Linked to a saved cooked food'
                        : 'Unsaved draft'}
                      {selectedCookPersonName ? ` · ${selectedCookPersonName}` : ''}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <Field label="Cooked food name">
                        <Input
                          aria-label="Cooked food name"
                          placeholder="Muesli jars"
                          value={activeDraft.name}
                          onChange={(event) =>
                            updateActiveDraft((draft) => ({
                              ...draft,
                              name: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Group">
                        <Select
                          ariaLabel="Cooked food group"
                          value={activeDraft.groupId}
                          onValueChange={(value) =>
                            updateActiveDraft((draft) => ({
                              ...draft,
                              groupId:
                                (value as Id<'foodGroups'> | '' | null) ?? '',
                            }))
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
                          value={activeDraft.finishedWeight}
                          onChange={(event) =>
                            updateActiveDraft((draft) => ({
                              ...draft,
                              finishedWeight: event.target.value,
                            }))
                          }
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
                          value={activeDraft.lineMode}
                          onValueChange={(value) =>
                            updateActiveDraft((draft) => ({
                              ...draft,
                              lineMode: value,
                            }))
                          }
                        />
                      </div>

                      {ingredients.length === 0 ? (
                        <div className="mt-4 rounded-md border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                          No ingredients yet. Use the custom tab to start
                          cooking, and keep “Save to ingredient catalog” on to
                          build your ingredient library as you go.
                        </div>
                      ) : null}

                      <div className="mt-4 space-y-4">
                        {activeDraft.lineMode === 'ingredient' ? (
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
                                value={activeDraft.lineIngredientId}
                                onValueChange={(value) => {
                                  const nextIngredientId = value as
                                    | Id<'ingredients'>
                                    | ''
                                  updateActiveDraft((draft) => ({
                                    ...draft,
                                    lineIngredientId: nextIngredientId,
                                    lineReferenceUnit: getIngredientBasisUnit(
                                      nextIngredientId
                                        ? ingredientById.get(nextIngredientId)
                                        : undefined,
                                    ),
                                  }))
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
                                  value={activeDraft.lineReferenceAmount}
                                  onChange={(event) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      lineReferenceAmount: event.target.value,
                                    }))
                                  }
                                />
                              </Field>
                            )}
                            {shouldAutoFillIngredientReference ? null : (
                              <Field label="Reference unit">
                                <Select
                                  ariaLabel="Reference unit"
                                  value={activeDraft.lineReferenceUnit}
                                  onValueChange={(value) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      lineReferenceUnit:
                                        (value as NutritionUnit | null) ?? 'g',
                                    }))
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
                                value={activeDraft.lineCountedAmount}
                                onChange={(event) =>
                                  updateActiveDraft((draft) => ({
                                    ...draft,
                                    lineCountedAmount: event.target.value,
                                  }))
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
                                activeDraft.lineCustomIgnoreCalories
                                  ? 'xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]'
                                  : 'xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]',
                              )}
                            >
                              <Field label="Ingredient">
                                <Input
                                  aria-label="Custom ingredient name"
                                  placeholder="Ingredient"
                                  value={activeDraft.lineCustomName}
                                  onChange={(event) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      lineCustomName: event.target.value,
                                    }))
                                  }
                                />
                              </Field>
                              {activeDraft.lineCustomIgnoreCalories ? null : (
                                <>
                                  <Field label="kcal per 100">
                                    <Input
                                      type="number"
                                      aria-label="Custom kcal per 100"
                                      placeholder="0"
                                      value={activeDraft.lineCustomKcal}
                                      onChange={(event) =>
                                        updateActiveDraft((draft) => ({
                                          ...draft,
                                          lineCustomKcal: event.target.value,
                                        }))
                                      }
                                    />
                                  </Field>
                                  <Field label="Basis unit">
                                    <Select
                                      ariaLabel="Custom kcal basis"
                                      value={activeDraft.lineCustomBasisUnit}
                                      onValueChange={(value) => {
                                        const nextUnit =
                                          (value as NutritionUnit | null) ?? 'g'
                                        updateActiveDraft((draft) => ({
                                          ...draft,
                                          lineCustomBasisUnit: nextUnit,
                                          lineReferenceUnit: nextUnit,
                                        }))
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
                                    value={activeDraft.lineReferenceAmount}
                                    onChange={(event) =>
                                      updateActiveDraft((draft) => ({
                                        ...draft,
                                        lineReferenceAmount: event.target.value,
                                      }))
                                    }
                                  />
                                </Field>
                              )}
                              {shouldAutoFillCustomReference ? null : (
                                <Field label="Reference unit">
                                  <Select
                                    ariaLabel="Custom reference unit"
                                    value={activeDraft.lineReferenceUnit}
                                    onValueChange={(value) =>
                                      updateActiveDraft((draft) => ({
                                        ...draft,
                                        lineReferenceUnit:
                                          (value as NutritionUnit | null) ?? 'g',
                                      }))
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
                                  value={activeDraft.lineCountedAmount}
                                  onChange={(event) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      lineCountedAmount: event.target.value,
                                    }))
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
                                Reference amount and unit will be saved
                                automatically from the amount and basis unit.
                              </p>
                            ) : null}
                            <CustomIngredientSwitchRow
                              ignoreCalories={activeDraft.lineCustomIgnoreCalories}
                              onIgnoreCaloriesChange={(value) =>
                                updateActiveDraft((draft) => ({
                                  ...draft,
                                  lineCustomIgnoreCalories: value,
                                }))
                              }
                              saveToCatalog={activeDraft.lineCustomSaveToCatalog}
                              onSaveToCatalogChange={(value) =>
                                updateActiveDraft((draft) => ({
                                  ...draft,
                                  lineCustomSaveToCatalog: value,
                                }))
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
                              Use an existing recipe as a starting point, or
                              save this result as one.
                            </p>
                          </div>
                          {!activeDraft.persistedCookedFoodId ? (
                            <label className="inline-flex items-center gap-2 text-sm text-foreground">
                              <Switch
                                checked={activeDraft.saveAsRecipe}
                                onCheckedChange={(checked) =>
                                  updateActiveDraft((draft) => {
                                    const nextChecked = Boolean(checked)
                                    return {
                                      ...draft,
                                      saveAsRecipe: nextChecked,
                                      recipeVersionId: nextChecked
                                        ? ''
                                        : draft.recipeVersionId,
                                      recipeDraftName:
                                        nextChecked &&
                                        !draft.recipeDraftName.trim() &&
                                        draft.name.trim()
                                          ? draft.name.trim()
                                          : draft.recipeDraftName,
                                    }
                                  })
                                }
                              />
                              Save as reusable recipe
                            </label>
                          ) : null}
                        </div>

                        {recipeVersionOptions.length === 0 &&
                        !activeDraft.saveAsRecipe ? (
                          <div className="mt-4 rounded-md border border-dashed border-border/70 bg-background/70 px-4 py-4 text-sm text-muted-foreground">
                            No recipes yet. Save one of these cookings as a
                            reusable recipe when you are happy with the result.
                          </div>
                        ) : null}

                        <div className="mt-4 space-y-4">
                          {activeDraft.persistedCookedFoodId ||
                          !activeDraft.saveAsRecipe ? (
                            <>
                              <Field label="Recipe source">
                                <SearchablePicker
                                  value={activeDraft.recipeVersionId}
                                  onValueChange={(value) =>
                                    applyRecipeVersionToActiveDraft(
                                      value as Id<'recipeVersions'> | '',
                                    )
                                  }
                                  ariaLabel="Cooked food recipe search"
                                  placeholder="Search recipe"
                                  options={recipeVersionOptions}
                                />
                              </Field>
                              {(() => {
                                const rv = activeDraft.recipeVersionId
                                  ? recipeVersionById.get(activeDraft.recipeVersionId)
                                  : undefined
                                const instructions = (rv as { instructions?: string } | undefined)?.instructions?.trim()
                                const rvNotes = (rv as { notes?: string } | undefined)?.notes?.trim()
                                if (!instructions && !rvNotes) {
                                  return null
                                }
                                return (
                                  <div className="rounded-md border border-border/60 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
                                    {instructions ? (
                                      <div>
                                        <p className="font-medium text-foreground">Instructions</p>
                                        <p className="mt-1 whitespace-pre-wrap">{instructions}</p>
                                      </div>
                                    ) : null}
                                    {rvNotes ? (
                                      <div className={instructions ? 'mt-3' : ''}>
                                        <p className="font-medium text-foreground">Notes</p>
                                        <p className="mt-1 whitespace-pre-wrap">{rvNotes}</p>
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })()}
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              A new recipe draft will be created from these
                              ingredient lines.
                            </p>
                          )}

                          {!activeDraft.persistedCookedFoodId &&
                          activeDraft.saveAsRecipe ? (
                            <div className="grid gap-4 lg:grid-cols-2">
                              <Field label="Recipe name">
                                <Input
                                  aria-label="Recipe name from cooked food"
                                  placeholder={
                                    activeDraft.name.trim() || 'Recipe name'
                                  }
                                  value={activeDraft.recipeDraftName}
                                  onChange={(event) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      recipeDraftName: event.target.value,
                                    }))
                                  }
                                />
                              </Field>
                              <Field label="Description">
                                <Input
                                  aria-label="Recipe description from cooked food"
                                  placeholder="Optional"
                                  value={activeDraft.recipeDraftDescription}
                                  onChange={(event) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      recipeDraftDescription:
                                        event.target.value,
                                    }))
                                  }
                                />
                              </Field>
                              <Field label="Instructions" className="lg:col-span-2">
                                <Textarea
                                  aria-label="Recipe instructions from cooked food"
                                  placeholder="Optional"
                                  value={activeDraft.recipeDraftInstructions}
                                  onChange={(event) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      recipeDraftInstructions:
                                        event.target.value,
                                    }))
                                  }
                                />
                              </Field>
                              <Field label="Notes" className="lg:col-span-2">
                                <Input
                                  aria-label="Recipe notes from cooked food"
                                  placeholder="Optional"
                                  value={activeDraft.recipeDraftNotes}
                                  onChange={(event) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      recipeDraftNotes: event.target.value,
                                    }))
                                  }
                                />
                              </Field>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="rounded-md border border-border/70 bg-muted/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-sm font-medium text-foreground">
                            Current lines ({activeDraft.ingredientLines.length})
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Review before saving.
                          </p>
                        </div>

                        {activeDraft.ingredientLines.length === 0 ? (
                          <div className="mt-4 rounded-md border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
                            Add at least one ingredient line.
                          </div>
                        ) : (
                          <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                            {activeDraft.ingredientLines.map((line) => {
                              const ignored =
                                line.sourceType === 'ingredient'
                                  ? isIngredientIgnored(line.ingredientId)
                                  : line.ignoreCalories
                              const lineName =
                                line.sourceType === 'ingredient'
                                  ? ingredientById.get(line.ingredientId)?.name ??
                                    'Unknown ingredient'
                                  : line.name
                              return (
                                <div
                                  key={line.draftId}
                                  className="rounded-md border border-border/70 bg-background/70 px-3 py-3"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate font-medium text-foreground">
                                        {lineName}
                                      </p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {line.referenceAmount}{' '}
                                        {getNutritionUnitLabel(line.referenceUnit)}
                                        {ignored
                                          ? ' · Calories ignored'
                                          : ` · Counted ${line.countedAmount ?? 0}`}
                                      </p>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          editCookedFoodIngredientLine(line.draftId)
                                        }
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() =>
                                          removeCookedFoodIngredientLine(
                                            line.draftId,
                                          )
                                        }
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.95fr)]">
            <Card className="border-border/70 bg-card/90">
              <CardHeader className="gap-2 border-b border-border/60">
                <CardTitle>{savedFoodsCardTitle}</CardTitle>
                <CardDescription>{cookedFoodRows.length} total</CardDescription>
              </CardHeader>
              <CardContent className="pt-3">
                <DataTable
                  columns={cookedFoodColumns}
                  data={cookedFoodRows}
                  searchColumnId="name"
                  searchPlaceholder="Search saved foods"
                  emptyText={
                    showAllCookedFoods
                      ? 'No cooked foods found.'
                      : 'No saved foods for this session yet.'
                  }
                  toolbarActions={
                    <>
                      <Button
                        size="sm"
                        variant={showAllCookedFoods ? 'outline' : 'secondary'}
                        onClick={() => setShowAllCookedFoods(false)}
                      >
                        Selected session
                      </Button>
                      <Button
                        size="sm"
                        variant={showAllCookedFoods ? 'secondary' : 'outline'}
                        onClick={() => setShowAllCookedFoods(true)}
                      >
                        All sessions
                      </Button>
                    </>
                  }
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

function createCookingDraft(
  sessionId: Id<'cookSessions'>,
  overrides: Partial<CookingDraft> = {},
): CookingDraft {
  const now = Date.now()
  return {
    draftId: createDraftId(),
    sessionId,
    persistedCookedFoodId: undefined,
    isDirty: false,
    createdAt: now,
    updatedAt: now,
    name: '',
    groupId: '',
    finishedWeight: '',
    recipeVersionId: '',
    saveAsRecipe: false,
    recipeDraftName: '',
    recipeDraftDescription: '',
    recipeDraftInstructions: '',
    recipeDraftNotes: '',
    notes: '',
    lineMode: 'ingredient',
    lineIngredientId: '',
    lineCustomName: '',
    lineCustomKcal: '',
    lineCustomBasisUnit: 'g',
    lineCustomIgnoreCalories: false,
    lineCustomSaveToCatalog: true,
    lineReferenceAmount: '',
    lineReferenceUnit: 'g',
    lineCountedAmount: '',
    ingredientLines: [],
    ...overrides,
  }
}

function createDraftFromCookedFood(
  food: Doc<'cookedFoods'>,
  ingredientLines: Doc<'cookedFoodIngredients'>[],
  ingredientById: Map<Id<'ingredients'>, Doc<'ingredients'>>,
) {
  return createCookingDraft(food.cookSessionId, {
    persistedCookedFoodId: food._id,
    isDirty: false,
    name: food.name,
    groupId: food.groupIds[0] ?? '',
    finishedWeight: food.finishedWeightGrams.toString(),
    recipeVersionId: food.recipeVersionId ?? '',
    notes: food.notes ?? '',
    ingredientLines: ingredientLines.map((line) => {
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
  })
}

function duplicateCookingDraft(sourceDraft: CookingDraft) {
  return createCookingDraft(sourceDraft.sessionId, {
    isDirty: true,
    name: sourceDraft.name,
    groupId: sourceDraft.groupId,
    finishedWeight: sourceDraft.finishedWeight,
    recipeVersionId: sourceDraft.recipeVersionId,
    saveAsRecipe: false,
    recipeDraftName: '',
    recipeDraftDescription: '',
    recipeDraftInstructions: '',
    recipeDraftNotes: '',
    notes: sourceDraft.notes,
    ingredientLines: sourceDraft.ingredientLines.map(cloneIngredientLine),
  })
}

function cloneIngredientLine(line: CookedFoodIngredientDraft) {
  return {
    ...line,
    draftId: createDraftId(),
  } satisfies CookedFoodIngredientDraft
}

function draftHasUserContent(draft: CookingDraft) {
  return Boolean(
    draft.name.trim() ||
      draft.groupId ||
      draft.finishedWeight.trim() ||
      draft.recipeVersionId ||
      draft.saveAsRecipe ||
      draft.recipeDraftName.trim() ||
      draft.recipeDraftDescription.trim() ||
      draft.recipeDraftInstructions.trim() ||
      draft.recipeDraftNotes.trim() ||
      draft.lineIngredientId ||
      draft.lineCustomName.trim() ||
      draft.lineCustomKcal.trim() ||
      draft.lineReferenceAmount.trim() ||
      draft.lineCountedAmount.trim() ||
      draft.ingredientLines.length > 0,
  )
}

function getCookingDraftLabel(draft: CookingDraft) {
  return draft.name.trim() || 'Untitled cooking'
}

function formatRelativeDraftTime(timestamp: number) {
  const deltaMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (deltaMinutes < 1) {
    return 'just now'
  }
  if (deltaMinutes === 1) {
    return '1 min ago'
  }
  if (deltaMinutes < 60) {
    return `${deltaMinutes} min ago`
  }
  const hours = Math.round(deltaMinutes / 60)
  if (hours === 1) {
    return '1 hour ago'
  }
  return `${hours} hours ago`
}

function DraftBadge({ draft }: { draft: CookingDraft }) {
  if (!draft.persistedCookedFoodId) {
    return (
      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[0.625rem] font-medium text-amber-700">
        Unsaved
      </span>
    )
  }

  if (draft.isDirty) {
    return (
      <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[0.625rem] font-medium text-sky-700">
        Edited
      </span>
    )
  }

  return (
    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[0.625rem] font-medium text-emerald-700">
      Linked
    </span>
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
    <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}
