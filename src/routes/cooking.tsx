import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ChefHat, Copy, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
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
import { DataTable, type DataTableColumnDef } from '@/components/ui/data-table'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchablePicker } from '@/components/ui/searchable-picker'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  createCookingDraft,
  createDraftId,
  createDraftFromCookedFood,
  draftHasUserContent,
  duplicateCookingDraft,
  formatRelativeDraftTime,
  getCookingDraftLabel,
  getIngredientBasisUnit,
  getRecipeCountedAmount,
  shouldAutoFillReferenceFields,
  type CookingDraft,
} from '@/features/cooking/draft-helpers'
import {
  type CookingCookedFood,
  type CookingFoodGroup,
  type CookingIngredient,
  type CookingRecipeDetail,
  type CookingSession,
  SEARCH_MAX_LENGTH,
  useCookingDomainData,
} from '@/features/cooking/use-cooking-domain-data'
import { usePersistedCookingDrafts } from '@/features/cooking/use-persisted-cooking-drafts'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { isConvexConfigured } from '@/integrations/convex/config'
import {
  NUTRITION_UNIT_OPTIONS,
  type NutritionUnit,
  formatCookSessionLabel,
  formatKcalPer100,
  getNutritionUnitLabel,
  toLocalDateString,
  toTimestampFromDate,
} from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const SEARCH_RESULT_LIMIT = 20

function getCurrentLocalDateString() {
  return toLocalDateString(Date.now())
}

function customLineSignature(input: { ingredientId?: Id<'ingredients'> | '' }) {
  return input.ingredientId || ''
}

function normalizedLineNotes(
  notes: string | undefined,
  preserveExistingValue: boolean,
) {
  if (preserveExistingValue) {
    return notes
  }
  const trimmed = notes?.trim() ?? ''
  return trimmed || undefined
}

function cookingLineIdentityMatches(
  savedLine: CookingDraft['ingredientLines'][number],
  currentLine: CookingDraft['ingredientLines'][number],
) {
  if (savedLine.sourceType !== currentLine.sourceType) {
    return false
  }
  if (savedLine.sourceType === 'ingredient') {
    return (
      currentLine.sourceType === 'ingredient' &&
      savedLine.ingredientId === currentLine.ingredientId
    )
  }
  return (
    currentLine.sourceType === 'custom' &&
    savedLine.ingredientId === currentLine.ingredientId
  )
}

function linkedRecipeCacheKey(
  recipeId: Id<'recipes'>,
  recipeVersionId?: Id<'recipeVersions'> | '',
) {
  return `${recipeId}:${recipeVersionId || 'current'}`
}

type SessionTableRow = {
  id: Id<'cookSessions'>
  session: CookingSession
  label: string
  cookedAt: string
  countsLabel: string
  status: 'Active' | 'Archived'
}

type CookedFoodTableRow = {
  id: Id<'cookedFoods'>
  food: CookingCookedFood
  name: string
  kcalPer100: number
  sessionLabel: string
  status: 'Active' | 'Archived'
}

type IngredientSelectionRow = {
  id: Id<'ingredients'>
  ingredient: CookingIngredient
  name: string
  kcalPer100: number
  ignoreCalories: boolean
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
  const [sessionSearch, setSessionSearch] = useState('')
  const [ingredientSearch, setIngredientSearch] = useState('')
  const [recipeSearch, setRecipeSearch] = useState('')
  const [cookedFoodSearch, setCookedFoodSearch] = useState('')
  const [isSessionEditorVisible, setIsSessionEditorVisible] = useState(false)
  const [selectedCookSessionId, setSelectedCookSessionId] = useState<
    Id<'cookSessions'> | ''
  >('')
  const { activeDraftId, setActiveDraftId, drafts, setDrafts } =
    usePersistedCookingDrafts()
  const {
    pendingConfirmation,
    isConfirmDialogOpen,
    isRunning,
    runAction,
    confirmAndRunAction,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  } = useConfirmableAction()

  const [editingSessionId, setEditingSessionId] =
    useState<Id<'cookSessions'> | null>(null)
  const [sessionLabel, setSessionLabel] = useState('')
  const [sessionDate, setSessionDate] = useState(getCurrentLocalDateString)
  const [originalSessionCookedAt, setOriginalSessionCookedAt] = useState<
    number | null
  >(null)
  const [editingSessionRevision, setEditingSessionRevision] = useState<
    number | null
  >(null)
  const [sessionPersonId, setSessionPersonId] = useState<Id<'people'> | ''>('')
  const [cookedFoodDetailRequest, setCookedFoodDetailRequest] = useState<{
    id: Id<'cookedFoods'>
    mode: 'open' | 'duplicate'
  } | null>(null)
  const cookedFoodDetailRequestIdRef = useRef(0)
  const [loadingRecipeDraftIds, setLoadingRecipeDraftIds] = useState(
    () => new Set<string>(),
  )
  const recipeDetailRequestRef = useRef(new Map<string, number>())
  const draftRevisionRef = useRef(new Map<string, number>())
  const draftsRef = useRef(drafts)
  const [ingredientCache, setIngredientCache] = useState(
    () => new Map<Id<'ingredients'>, CookingIngredient>(),
  )
  const [recipeDetailCache, setRecipeDetailCache] = useState(
    () => new Map<Id<'recipeVersions'>, NonNullable<CookingRecipeDetail>>(),
  )
  const [foodGroupCache, setFoodGroupCache] = useState(
    () => new Map<Id<'foodGroups'>, CookingFoodGroup>(),
  )
  const [linkedRecipeOptionCache, setLinkedRecipeOptionCache] = useState(
    () => new Map<string, { label: string; archived: boolean }>(),
  )
  const cookingData = useCookingDomainData({
    showArchived,
    selectedCookSessionId,
    showAllCookedFoods,
    sessionSearch,
    ingredientSearch,
    recipeSearch,
    cookedFoodSearch,
  })
  const {
    people,
    foodGroups,
    ingredients,
    recipes,
    cookSessions,
    cookedFoods,
    selectedCookSession,
    effectiveSelectedCookSessionId,
    isLoading,
    paging,
    search,
  } = cookingData
  const invalidateCookedFoodDetailRequest = () => {
    cookedFoodDetailRequestIdRef.current += 1
    setCookedFoodDetailRequest(null)
  }
  const selectKnownCookSession = (sessionId: Id<'cookSessions'> | '') => {
    invalidateCookedFoodDetailRequest()
    setSelectedCookSessionId(sessionId)
  }

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

  const groups = foodGroups.filter(
    (group) => group.appliesTo === 'cookedFood' && !group.archived,
  )

  const personById = useMemo(
    () => new Map(people.map((person) => [person._id, person])),
    [people],
  )
  const loadedIngredientById = useMemo(() => {
    const map = new Map(ingredientCache)
    for (const ingredient of ingredients) {
      map.set(ingredient._id, ingredient)
    }
    return map
  }, [ingredientCache, ingredients])
  const cookSessionById = useMemo(() => {
    const map = new Map(cookSessions.map((session) => [session._id, session]))
    if (selectedCookSession) {
      map.set(selectedCookSession._id, selectedCookSession)
    }
    return map
  }, [cookSessions, selectedCookSession])

  const recipeOptions = useMemo(
    () =>
      recipes.map((recipe) => ({
        value: recipe._id,
        label: `${recipe.name} (v${recipe.latestVersionNumber})`,
      })),
    [recipes],
  )

  const sessionOptions = useMemo(() => {
    const pickerSessions =
      selectedCookSession &&
      !cookSessions.some((session) => session._id === selectedCookSession._id)
        ? [selectedCookSession, ...cookSessions]
        : cookSessions
    return pickerSessions.map((session) => ({
      value: session._id,
      label: formatCookSessionLabel(session),
      keywords: [
        session.label ?? '',
        toLocalDateString(session.cookedAt),
        toLocalDateString(session.updatedAt),
      ].join(' '),
    }))
  }, [cookSessions, selectedCookSession])

  const selectedCookPersonName = selectedCookSession?.cookedByPersonId
    ? (selectedCookSession.cookedByPersonName ??
      personById.get(selectedCookSession.cookedByPersonId)?.name)
    : undefined
  const editingSessionPersonName = editingSessionId
    ? cookSessionById.get(editingSessionId)?.cookedByPersonName
    : undefined
  const unlistedSessionPersonOption =
    sessionPersonId && !personById.has(sessionPersonId)
      ? {
          value: sessionPersonId,
          label: editingSessionPersonName ?? 'Archived person',
        }
      : null

  const sessionDrafts = useMemo(
    () =>
      drafts
        .filter((draft) => draft.sessionId === effectiveSelectedCookSessionId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [drafts, effectiveSelectedCookSessionId],
  )

  const effectiveActiveDraftId =
    activeDraftId &&
    sessionDrafts.some((draft) => draft.draftId === activeDraftId)
      ? activeDraftId
      : (sessionDrafts[0]?.draftId ?? null)

  const activeDraft = useMemo(
    () =>
      sessionDrafts.find((draft) => draft.draftId === effectiveActiveDraftId) ??
      null,
    [effectiveActiveDraftId, sessionDrafts],
  )
  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])
  const activeDraftIdRef = useRef<string | null>(effectiveActiveDraftId)
  useEffect(() => {
    activeDraftIdRef.current = effectiveActiveDraftId
  }, [effectiveActiveDraftId])
  const isEditingStableIngredientLine = Boolean(
    activeDraft?.lineExistingCookedFoodIngredientId &&
    activeDraft.lineExistingIngredientId === activeDraft.lineIngredientId,
  )
  const shouldPointLoadIngredient = Boolean(
    activeDraft?.lineIngredientId &&
    !isEditingStableIngredientLine &&
    !loadedIngredientById.has(activeDraft.lineIngredientId),
  )
  const pointLoadedIngredient = useQuery(
    api.catalog.getIngredient,
    shouldPointLoadIngredient && activeDraft?.lineIngredientId
      ? { ingredientId: activeDraft.lineIngredientId }
      : 'skip',
  )
  const shouldPointLoadGroup = Boolean(
    activeDraft?.groupId &&
    !foodGroupCache.has(activeDraft.groupId) &&
    !foodGroups.some((group) => group._id === activeDraft.groupId),
  )
  const pointLoadedGroup = useQuery(
    api.catalog.getFoodGroup,
    shouldPointLoadGroup && activeDraft?.groupId
      ? { groupId: activeDraft.groupId }
      : 'skip',
  )
  const isActiveRecipeLoading = Boolean(
    activeDraft && loadingRecipeDraftIds.has(activeDraft.draftId),
  )
  const selectedRecipeDetail = activeDraft?.recipeVersionId
    ? recipeDetailCache.get(activeDraft.recipeVersionId)
    : undefined
  const selectedRecipeId =
    activeDraft?.recipeId || selectedRecipeDetail?.recipe._id || ''
  const shouldPointLoadRecipe = Boolean(
    selectedRecipeId &&
    !recipes.some((recipe) => recipe._id === selectedRecipeId) &&
    !linkedRecipeOptionCache.has(
      linkedRecipeCacheKey(selectedRecipeId, activeDraft?.recipeVersionId),
    ),
  )
  const pointLoadedRecipe = useQuery(
    api.catalog.getRecipe,
    shouldPointLoadRecipe && selectedRecipeId
      ? { recipeId: selectedRecipeId }
      : 'skip',
  )
  const ingredientById = useMemo(() => {
    const map = new Map(loadedIngredientById)
    if (pointLoadedIngredient && !pointLoadedIngredient.archived) {
      map.set(pointLoadedIngredient._id, pointLoadedIngredient)
    }
    return map
  }, [loadedIngredientById, pointLoadedIngredient])
  const recipePickerOptions = useMemo(() => {
    const linkedOption = selectedRecipeId
      ? linkedRecipeOptionCache.get(
          linkedRecipeCacheKey(selectedRecipeId, activeDraft?.recipeVersionId),
        )
      : undefined
    const selectedOption =
      linkedOption && selectedRecipeId
        ? {
            value: selectedRecipeId,
            label: `${linkedOption.label}${linkedOption.archived ? ' (archived)' : ''}`,
          }
        : selectedRecipeDetail
          ? {
              value: selectedRecipeDetail.recipe._id,
              label: `${selectedRecipeDetail.recipe.name} (v${selectedRecipeDetail.version.versionNumber})`,
            }
          : pointLoadedRecipe
            ? {
                value: pointLoadedRecipe._id,
                label: `${pointLoadedRecipe.name} (v${pointLoadedRecipe.latestVersionNumber})${pointLoadedRecipe.archived ? ' (archived)' : ''}`,
              }
            : undefined
    if (!selectedOption) {
      return recipeOptions
    }
    return [
      selectedOption,
      ...recipeOptions.filter(
        (option) => option.value !== selectedOption.value,
      ),
    ]
  }, [
    linkedRecipeOptionCache,
    activeDraft?.recipeVersionId,
    recipeOptions,
    pointLoadedRecipe,
    selectedRecipeDetail,
    selectedRecipeId,
  ])
  const cookedFoodGroupOptions = useMemo(() => {
    const options = groups.map((group) => ({
      value: group._id,
      label: group.name,
    }))
    if (
      !activeDraft?.groupId ||
      options.some((option) => option.value === activeDraft.groupId)
    ) {
      return options
    }
    const currentGroup =
      foodGroupCache.get(activeDraft.groupId) ??
      foodGroups.find((group) => group._id === activeDraft.groupId) ??
      (pointLoadedGroup?._id === activeDraft.groupId
        ? pointLoadedGroup
        : undefined)
    return currentGroup
      ? [
          {
            value: currentGroup._id,
            label: `${currentGroup.name}${currentGroup.archived ? ' (archived)' : ''}`,
          },
          ...options,
        ]
      : options
  }, [activeDraft, foodGroupCache, foodGroups, groups, pointLoadedGroup])

  const selectedCookedFoodLineIngredient = activeDraft?.lineIngredientId
    ? ingredientById.get(activeDraft.lineIngredientId)
    : undefined
  const selectedCookedFoodLineIngredientBasisUnit =
    isEditingStableIngredientLine
      ? (activeDraft?.lineExistingIngredientKcalBasisUnitSnapshot ?? 'g')
      : getIngredientBasisUnit(selectedCookedFoodLineIngredient)
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
        } saved loaded`,
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
      visibleCookedFoods.map((food) => {
        const session = cookSessionById.get(food.cookSessionId)
        return {
          id: food._id,
          food,
          name: food.name,
          kcalPer100: food.kcalPer100,
          sessionLabel: session
            ? formatCookSessionLabel(session)
            : 'Batch not loaded',
          status: food.archived ? 'Archived' : 'Active',
        }
      }),
    [cookSessionById, visibleCookedFoods],
  )

  const resetSessionForm = () => {
    setEditingSessionId(null)
    setSessionLabel('')
    setSessionDate(getCurrentLocalDateString())
    setOriginalSessionCookedAt(null)
    setEditingSessionRevision(null)
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

  const openEditSessionEditor = (session: CookingSession) => {
    setEditingSessionId(session._id)
    setSessionLabel(session.label ?? '')
    setSessionDate(toLocalDateString(session.cookedAt))
    setOriginalSessionCookedAt(session.cookedAt)
    setEditingSessionRevision(session.editRevision)
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
    draftRevisionRef.current.set(
      draftId,
      (draftRevisionRef.current.get(draftId) ?? 0) + 1,
    )
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

  const draftMatchesSnapshot = (
    draft: CookingDraft | undefined,
    draftId: string,
    revision: number,
    snapshot: string,
  ) => {
    return Boolean(
      draft &&
      draft.draftId === draftId &&
      (draftRevisionRef.current.get(draftId) ?? 0) === revision &&
      JSON.stringify(draft) === snapshot,
    )
  }

  const ingredientSelectionRows = useMemo<IngredientSelectionRow[]>(
    () =>
      ingredients.map((ingredient) => ({
        id: ingredient._id,
        ingredient,
        name: ingredient.name,
        kcalPer100: ingredient.kcalPer100,
        ignoreCalories: Boolean(ingredient.ignoreCalories),
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
                activeDraft?.lineIngredientId === row.original.id
                  ? 'default'
                  : 'outline'
              }
              onClick={() => {
                const nextIngredientId = row.original.id
                setIngredientCache((current) => {
                  const next = new Map(current)
                  next.set(nextIngredientId, row.original.ingredient)
                  return next
                })
                updateActiveDraft((draft) => ({
                  ...draft,
                  lineIngredientId: nextIngredientId,
                  lineReferenceUnit:
                    draft.lineExistingCookedFoodIngredientId &&
                    draft.lineExistingIngredientId === nextIngredientId
                      ? (draft.lineExistingIngredientKcalBasisUnitSnapshot ??
                        getIngredientBasisUnit(
                          ingredientById.get(nextIngredientId),
                        ))
                      : getIngredientBasisUnit(
                          ingredientById.get(nextIngredientId),
                        ),
                }))
              }}
            >
              {activeDraft?.lineIngredientId === row.original.id
                ? 'Selected'
                : 'Select'}
            </Button>
          </div>
        ),
      },
    ]

  const selectedLineIngredient =
    activeDraft?.lineIngredientId && activeDraft.lineMode === 'ingredient'
      ? ingredientById.get(activeDraft.lineIngredientId)
      : undefined
  const selectedLineIngredientName = isEditingStableIngredientLine
    ? activeDraft?.lineExistingIngredientNameSnapshot
    : selectedLineIngredient?.name
  const selectedLineIngredientKcal = isEditingStableIngredientLine
    ? activeDraft?.lineExistingIngredientKcalPer100Snapshot
    : selectedLineIngredient?.kcalPer100
  const selectedLineIngredientBasis = isEditingStableIngredientLine
    ? activeDraft?.lineExistingIngredientKcalBasisUnitSnapshot
    : selectedLineIngredient?.kcalBasisUnit

  const selectDraft = (draftId: string, sessionId: Id<'cookSessions'>) => {
    invalidateCookedFoodDetailRequest()
    setSelectedCookSessionId(sessionId)
    setActiveDraftId(draftId)
    scrollToTop()
  }

  const createDraftForSession = (
    sessionId: Id<'cookSessions'>,
    sourceDraft?: CookingDraft,
  ) => {
    invalidateCookedFoodDetailRequest()
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
    if (
      !draft.persistedCookedFoodId &&
      !draft.isDirty &&
      !draftHasUserContent(draft)
    ) {
      void remove()
      return
    }
    confirmAndRunAction(
      'Discard this in-progress cooking?',
      'Draft discarded.',
      remove,
    )
  }

  const openSavedFoodInDraft = (food: CookingCookedFood) => {
    const existingDraft = drafts.find(
      (draft) => draft.persistedCookedFoodId === food._id,
    )
    if (existingDraft?.hasAuthoritativeIngredientIds) {
      selectDraft(existingDraft.draftId, existingDraft.sessionId)
      return
    }
    loadSavedFoodIntoDraft(food, 'open')
  }

  const duplicateSavedFoodAsDraft = (food: CookingCookedFood) => {
    loadSavedFoodIntoDraft(food, 'duplicate')
  }

  const loadSavedFoodIntoDraft = (
    food: CookingCookedFood,
    mode: 'open' | 'duplicate',
  ) => {
    const request = { id: food._id, mode }
    const requestId = cookedFoodDetailRequestIdRef.current + 1
    cookedFoodDetailRequestIdRef.current = requestId
    setCookedFoodDetailRequest(request)
    void cookingData
      .loadCookedFoodDetail(food._id)
      .then((detail) => {
        if (cookedFoodDetailRequestIdRef.current !== requestId) {
          return
        }
        if (detail === null) {
          toast.error('Cooked food could not be loaded.')
          return
        }
        if (mode === 'duplicate' && detail.cookSession?.archived) {
          toast.error('Archived batches cannot accept new cooked foods.')
          return
        }
        if (mode === 'open' && detail.cookSession?.archived) {
          setShowArchived(true)
        }
        const group = detail.group
        if (group) {
          setFoodGroupCache((current) => {
            const next = new Map(current)
            next.set(group._id, group)
            return next
          })
        }
        const linkedRecipe = detail.linkedRecipe
        if (linkedRecipe) {
          setLinkedRecipeOptionCache((current) => {
            const next = new Map(current)
            const versionLabel = linkedRecipe.versionNumber
              ? `${linkedRecipe.name} (v${linkedRecipe.versionNumber})`
              : linkedRecipe.name
            next.set(
              linkedRecipeCacheKey(
                linkedRecipe.recipeId,
                linkedRecipe.recipeVersionId,
              ),
              {
                label: versionLabel,
                archived: linkedRecipe.archived,
              },
            )
            return next
          })
        }
        const sourceDraft = createDraftFromCookedFood(
          detail.cookedFood,
          detail.ingredients,
        )
        const nextDraft =
          mode === 'duplicate'
            ? duplicateCookingDraft(sourceDraft)
            : sourceDraft
        setDrafts((current) => [
          nextDraft,
          ...current.filter(
            (draft) =>
              mode === 'duplicate' ||
              draft.persistedCookedFoodId !== detail.cookedFood._id,
          ),
        ])
        setSelectedCookSessionId(nextDraft.sessionId)
        setActiveDraftId(nextDraft.draftId)
        setShowAllCookedFoods(false)
        scrollToTop()
      })
      .catch(() => {
        if (cookedFoodDetailRequestIdRef.current === requestId) {
          toast.error('Cooked food could not be loaded.')
        }
      })
      .finally(() => {
        if (cookedFoodDetailRequestIdRef.current !== requestId) {
          return
        }
        setCookedFoodDetailRequest((current) =>
          current?.id === request.id && current.mode === request.mode
            ? null
            : current,
        )
      })
  }

  const isIngredientIgnored = (
    ingredientId: Id<'ingredients'>,
    snapshot = false,
  ) => {
    return ingredientById.get(ingredientId)?.ignoreCalories ?? snapshot
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
      const selectedIngredient = ingredientById.get(
        activeDraft.lineIngredientId,
      )
      const hasStableIngredientSnapshot = Boolean(
        activeDraft.lineExistingCookedFoodIngredientId &&
        activeDraft.lineExistingIngredientId === activeDraft.lineIngredientId,
      )
      if (!selectedIngredient && !hasStableIngredientSnapshot) {
        toast.error(
          pointLoadedIngredient === undefined
            ? 'Wait for the selected ingredient to finish loading.'
            : 'The selected ingredient is no longer available.',
        )
        return
      }
      const basisUnit = hasStableIngredientSnapshot
        ? (activeDraft.lineExistingIngredientKcalBasisUnitSnapshot ??
          getIngredientBasisUnit(selectedIngredient))
        : getIngredientBasisUnit(selectedIngredient)
      const shouldAutoFillReference = shouldAutoFillReferenceFields(basisUnit)
      const referenceUnit = shouldAutoFillReference
        ? basisUnit
        : activeDraft.lineReferenceUnit
      const ignored = hasStableIngredientSnapshot
        ? Boolean(activeDraft.lineExistingIngredientIgnoreCaloriesSnapshot)
        : isIngredientIgnored(activeDraft.lineIngredientId)
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
            existingCookedFoodIngredientId:
              draft.lineExistingIngredientId === draft.lineIngredientId
                ? draft.lineExistingCookedFoodIngredientId || undefined
                : undefined,
            sourceType: 'ingredient',
            ingredientId: draft.lineIngredientId as Id<'ingredients'>,
            ingredientNameSnapshot: hasStableIngredientSnapshot
              ? draft.lineExistingIngredientNameSnapshot
              : selectedIngredient?.name,
            kcalPer100Snapshot: hasStableIngredientSnapshot
              ? draft.lineExistingIngredientKcalPer100Snapshot
              : selectedIngredient?.kcalPer100,
            kcalBasisUnitSnapshot: hasStableIngredientSnapshot
              ? draft.lineExistingIngredientKcalBasisUnitSnapshot
              : selectedIngredient?.kcalBasisUnit,
            ignoreCaloriesSnapshot: hasStableIngredientSnapshot
              ? draft.lineExistingIngredientIgnoreCaloriesSnapshot
              : selectedIngredient?.ignoreCalories,
            referenceAmount,
            referenceUnit,
            countedAmount,
            notes: normalizedLineNotes(
              draft.lineNotes,
              hasStableIngredientSnapshot,
            ),
          },
        ],
        lineIngredientId: '',
        lineCustomIngredientId: '',
        lineReferenceAmount: '',
        lineReferenceUnit: 'g',
        lineCountedAmount: '',
        lineNotes: '',
        lineExistingCookedFoodIngredientId: '',
        lineExistingIngredientId: '',
        lineExistingIngredientNameSnapshot: undefined,
        lineExistingIngredientKcalPer100Snapshot: undefined,
        lineExistingIngredientKcalBasisUnitSnapshot: undefined,
        lineExistingIngredientIgnoreCaloriesSnapshot: undefined,
        lineExistingCustomSignature: '',
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
          existingCookedFoodIngredientId:
            draft.lineExistingCustomSignature ===
            customLineSignature({
              ingredientId: draft.lineCustomIngredientId,
            })
              ? draft.lineExistingCookedFoodIngredientId || undefined
              : undefined,
          sourceType: 'custom',
          ingredientId: draft.lineCustomIngredientId || undefined,
          name: draft.lineCustomName.trim(),
          kcalPer100,
          kcalBasisUnit: draft.lineCustomBasisUnit,
          ignoreCalories: draft.lineCustomIgnoreCalories,
          referenceAmount,
          referenceUnit,
          countedAmount,
          saveToCatalog: draft.lineCustomSaveToCatalog,
          notes: normalizedLineNotes(
            draft.lineNotes,
            Boolean(draft.lineExistingCookedFoodIngredientId),
          ),
        },
      ],
      lineCustomName: '',
      lineCustomIngredientId: '',
      lineCustomKcal: '',
      lineCustomBasisUnit: 'g',
      lineCustomIgnoreCalories: false,
      lineCustomSaveToCatalog: true,
      lineReferenceAmount: '',
      lineReferenceUnit: 'g',
      lineCountedAmount: '',
      lineNotes: '',
      lineExistingCookedFoodIngredientId: '',
      lineExistingIngredientId: '',
      lineExistingIngredientNameSnapshot: undefined,
      lineExistingIngredientKcalPer100Snapshot: undefined,
      lineExistingIngredientKcalBasisUnitSnapshot: undefined,
      lineExistingIngredientIgnoreCaloriesSnapshot: undefined,
      lineExistingCustomSignature: '',
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
      const basisUnit = line.existingCookedFoodIngredientId
        ? (line.kcalBasisUnitSnapshot ??
          getIngredientBasisUnit(ingredientById.get(line.ingredientId)))
        : getIngredientBasisUnit(
            ingredientById.get(line.ingredientId) ?? {
              kcalBasisUnit: line.kcalBasisUnitSnapshot ?? 'g',
            },
          )
      const autoFilled = shouldAutoFillReferenceFields(basisUnit)
      updateActiveDraft((draft) => ({
        ...draft,
        lineMode: 'ingredient',
        lineIngredientId: line.ingredientId,
        lineCustomIngredientId: '',
        lineReferenceAmount: autoFilled ? '' : String(line.referenceAmount),
        lineReferenceUnit: autoFilled ? 'g' : line.referenceUnit,
        lineCountedAmount: autoFilled
          ? String(line.referenceAmount)
          : line.countedAmount
            ? String(line.countedAmount)
            : '',
        lineNotes: line.notes ?? '',
        lineExistingCookedFoodIngredientId:
          line.existingCookedFoodIngredientId ?? '',
        lineExistingIngredientId: line.ingredientId,
        lineExistingIngredientNameSnapshot: line.ingredientNameSnapshot,
        lineExistingIngredientKcalPer100Snapshot: line.kcalPer100Snapshot,
        lineExistingIngredientKcalBasisUnitSnapshot: line.kcalBasisUnitSnapshot,
        lineExistingIngredientIgnoreCaloriesSnapshot:
          line.ignoreCaloriesSnapshot,
        lineExistingCustomSignature: '',
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
      lineCustomIngredientId: line.ingredientId ?? '',
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
      lineNotes: line.notes ?? '',
      lineExistingCookedFoodIngredientId:
        line.existingCookedFoodIngredientId ?? '',
      lineExistingIngredientId: '',
      lineExistingIngredientNameSnapshot: undefined,
      lineExistingIngredientKcalPer100Snapshot: undefined,
      lineExistingIngredientKcalBasisUnitSnapshot: undefined,
      lineExistingIngredientIgnoreCaloriesSnapshot: undefined,
      lineExistingCustomSignature: customLineSignature({
        ingredientId: line.ingredientId,
      }),
      ingredientLines: draft.ingredientLines.filter(
        (item) => item.draftId !== ingredientDraftId,
      ),
    }))
  }

  const applyRecipeToActiveDraft = (recipeId: Id<'recipes'> | '') => {
    if (!activeDraft) {
      return
    }
    const draftId = activeDraft.draftId
    const draftSnapshot = JSON.stringify(activeDraft)
    const draftRevision = draftRevisionRef.current.get(draftId) ?? 0
    const requestId = (recipeDetailRequestRef.current.get(draftId) ?? 0) + 1
    recipeDetailRequestRef.current.set(draftId, requestId)
    if (!recipeId) {
      setLoadingRecipeDraftIds((current) => {
        const next = new Set(current)
        next.delete(draftId)
        return next
      })
      updateActiveDraft((draft) => ({
        ...draft,
        recipeId: '',
        recipeVersionId: '',
      }))
      return
    }
    setLoadingRecipeDraftIds((current) => new Set(current).add(draftId))
    void cookingData
      .loadRecipeDetail(recipeId)
      .then((detail) => {
        if (recipeDetailRequestRef.current.get(draftId) !== requestId) {
          return
        }
        if (detail === null) {
          toast.error('Recipe could not be loaded.')
          return
        }
        if (
          !draftMatchesSnapshot(
            draftsRef.current.find((draft) => draft.draftId === draftId),
            draftId,
            draftRevision,
            draftSnapshot,
          )
        ) {
          toast.error(
            'Recipe was not applied because the draft changed while it was loading.',
          )
          return
        }
        const referencedIngredientById = new Map(
          detail.referencedIngredients.map((ingredient) => [
            ingredient._id,
            ingredient,
          ]),
        )
        const unavailableIngredientLine = detail.ingredients.find((line) => {
          if (line.sourceType !== 'ingredient') {
            return false
          }
          const ingredient = referencedIngredientById.get(line.ingredientId)
          return !ingredient || ingredient.archived
        })
        if (unavailableIngredientLine) {
          toast.error(
            `Restore or replace ${unavailableIngredientLine.ingredientNameSnapshot} before using this recipe.`,
          )
          return
        }
        const ingredientLines = detail.ingredients.map((line) => {
          const referenceAmount = line.referenceAmount
          const referenceUnit = line.referenceUnit
          if (line.sourceType === 'custom' || !line.ingredientId) {
            const linkedIngredient = line.ingredientId
              ? referencedIngredientById.get(line.ingredientId)
              : undefined
            const countedAmount = getRecipeCountedAmount(
              referenceAmount,
              referenceUnit,
              line.kcalBasisUnitSnapshot,
              line.ignoreCaloriesSnapshot,
            )
            return {
              draftId: createDraftId(),
              sourceType: 'custom' as const,
              ingredientId:
                linkedIngredient && !linkedIngredient.archived
                  ? linkedIngredient._id
                  : undefined,
              name: line.ingredientNameSnapshot,
              kcalPer100: line.kcalPer100Snapshot,
              kcalBasisUnit: line.kcalBasisUnitSnapshot,
              ignoreCalories: line.ignoreCaloriesSnapshot,
              referenceAmount,
              referenceUnit,
              countedAmount,
              saveToCatalog: false,
              notes: line.notes,
            }
          }

          const ingredient = referencedIngredientById.get(line.ingredientId)
          if (!ingredient || ingredient.archived) {
            throw new Error('Recipe ingredient availability changed.')
          }
          return {
            draftId: createDraftId(),
            sourceType: 'ingredient' as const,
            ingredientId: line.ingredientId,
            ingredientNameSnapshot: ingredient.name,
            kcalPer100Snapshot: ingredient.kcalPer100,
            kcalBasisUnitSnapshot: ingredient.kcalBasisUnit,
            ignoreCaloriesSnapshot: ingredient.ignoreCalories,
            referenceAmount,
            referenceUnit,
            countedAmount: getRecipeCountedAmount(
              referenceAmount,
              referenceUnit,
              ingredient.kcalBasisUnit,
              ingredient.ignoreCalories,
            ),
            notes: line.notes,
          }
        })
        setRecipeDetailCache((current) => {
          const next = new Map(current)
          next.set(detail.version._id, detail)
          return next
        })
        setDrafts((current) => {
          const currentDraft = current.find(
            (draft) => draft.draftId === draftId,
          )
          if (
            !draftMatchesSnapshot(
              currentDraft,
              draftId,
              draftRevision,
              draftSnapshot,
            )
          ) {
            return current
          }
          return current.map((draft) => {
            if (draft.draftId !== draftId) {
              return draft
            }
            return {
              ...draft,
              recipeId: detail.recipe._id,
              recipeVersionId: detail.version._id,
              saveAsRecipe: false,
              name: draft.name.trim() === '' ? detail.version.name : draft.name,
              ingredientLines,
              updatedAt: Date.now(),
              isDirty: true,
            }
          })
        })
      })
      .catch(() => {
        if (recipeDetailRequestRef.current.get(draftId) === requestId) {
          toast.error('Recipe could not be loaded.')
        }
      })
      .finally(() => {
        if (recipeDetailRequestRef.current.get(draftId) !== requestId) {
          return
        }
        setLoadingRecipeDraftIds((current) => {
          const next = new Set(current)
          next.delete(draftId)
          return next
        })
      })
  }

  const saveSession = () => {
    void runAction(
      editingSessionId ? 'Session updated.' : 'Session created.',
      async () => {
        const cookedAt =
          originalSessionCookedAt !== null &&
          toLocalDateString(originalSessionCookedAt) === sessionDate
            ? originalSessionCookedAt
            : toTimestampFromDate(sessionDate)
        if (editingSessionId) {
          await updateCookSession({
            sessionId: editingSessionId,
            expectedEditRevision: editingSessionRevision ?? 0,
            label: sessionLabel.trim() || undefined,
            cookedAt,
            cookedOn: sessionDate,
            cookedByPersonId: sessionPersonId || undefined,
          })
          selectKnownCookSession(editingSessionId)
        } else {
          const sessionId = await createCookSession({
            label: sessionLabel.trim() || undefined,
            cookedAt,
            cookedOn: sessionDate,
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
    if (isActiveRecipeLoading) {
      toast.error('Wait for the recipe to finish loading before saving.')
      return
    }
    if (
      activeDraft.persistedCookedFoodId &&
      !activeDraft.hasAuthoritativeIngredientIds
    ) {
      toast.error(
        'Reopen this saved food before updating it so its ingredient history can be verified.',
      )
      return
    }

    const { addAnother = false } = options ?? {}
    const resolvedCookedFoodName =
      activeDraft.name.trim() || getCurrentLocalDateString()
    const recipeDraftName = activeDraft.recipeDraftName.trim()

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
          ? line.existingCookedFoodIngredientId
            ? Boolean(line.ignoreCaloriesSnapshot)
            : isIngredientIgnored(
                line.ingredientId,
                line.ignoreCaloriesSnapshot,
              )
          : line.ignoreCalories
      if (!ignored && (!line.countedAmount || line.countedAmount <= 0)) {
        toast.error('All calorie-counted lines must include counted amount.')
        return
      }
    }

    if (
      !activeDraft.persistedCookedFoodId &&
      activeDraft.saveAsRecipe &&
      !recipeDraftName
    ) {
      toast.error('Recipe name is required when saving as recipe.')
      return
    }

    const payload = {
      cookSessionId: activeDraft.sessionId,
      name: resolvedCookedFoodName,
      recipeId: activeDraft.recipeId || undefined,
      recipeVersionId: activeDraft.recipeVersionId || undefined,
      groupId: activeDraft.groupId || undefined,
      finishedWeightGrams: finishedWeight,
      notes: activeDraft.notes.trim() || undefined,
      ingredients: activeDraft.ingredientLines.map((line) =>
        line.sourceType === 'ingredient'
          ? {
              sourceType: 'ingredient' as const,
              existingCookedFoodIngredientId:
                line.existingCookedFoodIngredientId,
              ingredientId: line.ingredientId,
              ...(line.existingCookedFoodIngredientId
                ? {}
                : {
                    expectedSnapshot: {
                      name: line.ingredientNameSnapshot ?? '',
                      kcalPer100: line.kcalPer100Snapshot ?? 0,
                      kcalBasisUnit: line.kcalBasisUnitSnapshot ?? 'g',
                      ignoreCalories: line.ignoreCaloriesSnapshot ?? false,
                    },
                  }),
              referenceAmount: line.referenceAmount,
              referenceUnit: line.referenceUnit,
              countedAmount: line.countedAmount,
              notes: normalizedLineNotes(
                line.notes,
                Boolean(line.existingCookedFoodIngredientId),
              ),
            }
          : {
              sourceType: 'custom' as const,
              existingCookedFoodIngredientId:
                line.existingCookedFoodIngredientId,
              ingredientId: line.ingredientId,
              name: line.name,
              kcalPer100: line.kcalPer100,
              kcalBasisUnit: line.kcalBasisUnit,
              ignoreCalories: line.ignoreCalories,
              referenceAmount: line.referenceAmount,
              referenceUnit: line.referenceUnit,
              countedAmount: line.countedAmount,
              saveToCatalog: line.saveToCatalog,
              notes: normalizedLineNotes(
                line.notes,
                Boolean(line.existingCookedFoodIngredientId),
              ),
            },
      ),
    }

    const draftToSave = activeDraft
    const savedDraftSnapshot = JSON.stringify(draftToSave)
    const draftRevision = draftRevisionRef.current.get(draftToSave.draftId) ?? 0
    void runAction(
      draftToSave.persistedCookedFoodId
        ? 'Cooked food updated.'
        : 'Cooked food created.',
      async () => {
        const saveResult = draftToSave.persistedCookedFoodId
          ? await updateCookedFood({
              cookedFoodId: draftToSave.persistedCookedFoodId,
              expectedEditRevision:
                draftToSave.expectedCookedFoodEditRevision ?? 0,
              expectedCookedFoodIngredientIds:
                draftToSave.expectedCookedFoodIngredientIds ?? [],
              ...payload,
            })
          : await createCookedFood({
              ...payload,
              saveAsRecipe: draftToSave.saveAsRecipe || undefined,
              recipeDraft: draftToSave.saveAsRecipe
                ? {
                    name: recipeDraftName,
                    instructions:
                      draftToSave.recipeDraftInstructions.trim() || undefined,
                  }
                : undefined,
            })
        const savedIngredientIdByDraftId = new Map<
          string,
          Id<'cookedFoodIngredients'>
        >()
        const savedIdsAreAuthoritative =
          saveResult.cookedFoodIngredientIds.length ===
          draftToSave.ingredientLines.length
        if (savedIdsAreAuthoritative) {
          draftToSave.ingredientLines.forEach((line, index) => {
            const savedId = saveResult.cookedFoodIngredientIds[index]
            if (savedId) {
              savedIngredientIdByDraftId.set(line.draftId, savedId)
            }
          })
        }
        const savedLineByDraftId = new Map(
          draftToSave.ingredientLines.map((line) => [line.draftId, line]),
        )
        let draftUnchanged = false
        let nextDraft: CookingDraft | null = null
        setDrafts((current) => {
          const currentDraft = current.find(
            (draft) => draft.draftId === draftToSave.draftId,
          )
          draftUnchanged = Boolean(
            currentDraft &&
            draftMatchesSnapshot(
              currentDraft,
              draftToSave.draftId,
              draftRevision,
              savedDraftSnapshot,
            ),
          )
          if (!draftUnchanged) {
            return current.map((draft) => {
              if (draft.draftId !== draftToSave.draftId) {
                return draft
              }
              const recipeSelectionUnchanged =
                draft.recipeId === draftToSave.recipeId &&
                draft.recipeVersionId === draftToSave.recipeVersionId
              const adoptSavedRecipeLink =
                recipeSelectionUnchanged ||
                (!draftToSave.persistedCookedFoodId && draftToSave.saveAsRecipe)
              return {
                ...draft,
                persistedCookedFoodId: saveResult.cookedFoodId,
                hasAuthoritativeIngredientIds: savedIdsAreAuthoritative,
                expectedCookedFoodIngredientIds:
                  saveResult.cookedFoodIngredientIds,
                expectedCookedFoodEditRevision: saveResult.editRevision,
                recipeId: adoptSavedRecipeLink
                  ? (saveResult.recipeId ?? '')
                  : draft.recipeId,
                recipeVersionId: adoptSavedRecipeLink
                  ? (saveResult.recipeVersionId ?? '')
                  : draft.recipeVersionId,
                ingredientLines: draft.ingredientLines.map((line) => {
                  const savedLine = savedLineByDraftId.get(line.draftId)
                  const existingCookedFoodIngredientId =
                    savedIngredientIdByDraftId.get(line.draftId)
                  if (!savedLine) {
                    return line
                  }
                  return existingCookedFoodIngredientId &&
                    cookingLineIdentityMatches(savedLine, line)
                    ? { ...line, existingCookedFoodIngredientId }
                    : { ...line, existingCookedFoodIngredientId: undefined }
                }),
              }
            })
          }
          nextDraft = addAnother
            ? createCookingDraft(draftToSave.sessionId)
            : null
          const remaining = current.filter(
            (draft) => draft.draftId !== draftToSave.draftId,
          )
          return nextDraft ? [nextDraft, ...remaining] : remaining
        })
        const savedDraftStillActive =
          activeDraftIdRef.current === draftToSave.draftId
        if (draftUnchanged && savedDraftStillActive) {
          selectKnownCookSession(draftToSave.sessionId)
          setShowAllCookedFoods(false)
        }
        if (draftUnchanged) {
          setActiveDraftId((current) =>
            current === draftToSave.draftId
              ? (nextDraft?.draftId ?? null)
              : current,
          )
        }
      },
    )
  }

  const sessionColumns: DataTableColumnDef<SessionTableRow>[] = [
    {
      accessorKey: 'label',
      header: 'Batch',
    },
    {
      accessorKey: 'cookedAt',
      header: 'Date',
    },
    {
      accessorKey: 'countsLabel',
      header: 'Foods',
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
              disabled={isRunning}
              onClick={() => {
                selectKnownCookSession(session._id)
                setShowAllCookedFoods(false)
              }}
            >
              Open
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={() => openEditSessionEditor(session)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={() =>
                void runAction(
                  session.archived ? 'Session restored.' : 'Session archived.',
                  async () => {
                    await setCookSessionArchived({
                      sessionId: session._id,
                      expectedEditRevision: session.editRevision,
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
              disabled={isRunning}
              aria-label={`Delete ${session.label?.trim() || 'session'}`}
              onClick={() =>
                confirmAndRunAction(
                  'Delete this session permanently?',
                  'Session deleted.',
                  async () => {
                    await deleteCookSession({
                      sessionId: session._id,
                      expectedEditRevision: session.editRevision,
                    })
                    setDrafts((current) =>
                      current.filter(
                        (draft) => draft.sessionId !== session._id,
                      ),
                    )
                    if (editingSessionId === session._id) {
                      closeSessionEditor()
                    }
                    if (selectedCookSessionId === session._id) {
                      selectKnownCookSession('')
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

  const cookedFoodColumns: DataTableColumnDef<CookedFoodTableRow>[] = [
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
              disabled={isRunning || cookedFoodDetailRequest?.id === food._id}
              onClick={() => openSavedFoodInDraft(food)}
            >
              {cookedFoodDetailRequest?.id === food._id &&
              cookedFoodDetailRequest.mode === 'open'
                ? 'Loading…'
                : 'Open'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning || cookedFoodDetailRequest?.id === food._id}
              onClick={() => duplicateSavedFoodAsDraft(food)}
            >
              {cookedFoodDetailRequest?.id === food._id &&
              cookedFoodDetailRequest.mode === 'duplicate'
                ? 'Loading…'
                : 'Duplicate'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={() =>
                void runAction(
                  food.archived
                    ? 'Cooked food restored.'
                    : 'Cooked food archived.',
                  async () => {
                    await setCookedFoodArchived({
                      cookedFoodId: food._id,
                      expectedEditRevision: food.editRevision,
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
              disabled={isRunning}
              aria-label={`Delete ${food.name}`}
              onClick={() =>
                confirmAndRunAction(
                  'Delete this cooked food permanently?',
                  'Cooked food deleted.',
                  async () => {
                    invalidateCookedFoodDetailRequest()
                    await deleteCookedFood({
                      cookedFoodId: food._id,
                      expectedEditRevision: food.editRevision,
                    })
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
        icon={<ChefHat className="h-4 w-4" />}
      >
        <div className="mt-4 space-y-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-72" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-32" />
              </div>
            </div>
            <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-32" />
              <Skeleton className="h-10 w-32" />
            </div>
            <div className="mt-3 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <Skeleton className="h-96 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          </div>
          <div className="grid gap-6">
            <div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1 h-3 w-48" />
              <div className="mt-3 space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            </div>
            <div>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-1 h-3 w-40" />
              <div className="mt-3 space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
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
        icon={<ChefHat className="h-4 w-4" />}
        maxWidth="7xl"
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
      >
        <div className="mt-4 space-y-3">
          <fieldset className="contents" disabled={isRunning}>
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Cooking batches
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Choose a batch date, then start or reopen foods you are
                    preparing.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={openNewSessionEditor}>
                    <Plus className="h-3.5 w-3.5" />
                    New batch
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
                    Edit batch
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <div className="space-y-2">
                    <SearchablePicker
                      ariaLabel="Cook session search"
                      value={effectiveSelectedCookSessionId}
                      onValueChange={(value) => {
                        selectKnownCookSession(value as Id<'cookSessions'> | '')
                        setShowAllCookedFoods(false)
                      }}
                      placeholder="Search or switch batch"
                      options={sessionOptions}
                      searchValue={sessionSearch}
                      onSearchValueChange={(value) =>
                        setSessionSearch(value.slice(0, SEARCH_MAX_LENGTH))
                      }
                      loading={search.sessions.isLoading}
                      resultLimit={SEARCH_RESULT_LIMIT}
                    />
                    {search.sessions.active ? (
                      <p className="text-xs text-muted-foreground">
                        Search shows up to {SEARCH_RESULT_LIMIT} matching
                        batches.
                      </p>
                    ) : paging.sessions.canLoadMore ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={paging.sessions.isLoadingMore}
                        onClick={paging.sessions.loadMore}
                      >
                        {paging.sessions.isLoadingMore
                          ? 'Loading batches…'
                          : 'Load more batches'}
                      </Button>
                    ) : null}
                  </div>
                  <div>
                    <Button
                      type="button"
                      disabled={
                        !selectedCookSession || selectedCookSession.archived
                      }
                      onClick={() => {
                        if (
                          selectedCookSession &&
                          !selectedCookSession.archived
                        ) {
                          createDraftForSession(selectedCookSession._id)
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Start cooking
                    </Button>
                  </div>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !activeDraft || Boolean(selectedCookSession?.archived)
                      }
                      onClick={() => {
                        if (activeDraft) {
                          createDraftForSession(
                            activeDraft.sessionId,
                            activeDraft,
                          )
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
                      {selectedCookSession.label?.trim() ||
                        toLocalDateString(selectedCookSession.cookedAt)}
                    </span>
                    {selectedCookPersonName
                      ? ` · ${selectedCookPersonName}`
                      : ''}
                    {selectedCookSession.archived ? ' · Archived' : ''}
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                    Create your first batch to start cooking. Batches group
                    foods by date and person.
                  </div>
                )}

                {isSessionEditorVisible ? (
                  <div className="rounded-md border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {editingSessionId ? 'Edit batch' : 'New batch'}
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
                      <Input
                        aria-label="Session label"
                        placeholder="Breakfast prep"
                        value={sessionLabel}
                        onChange={(event) =>
                          setSessionLabel(event.target.value)
                        }
                      />
                      <DatePicker
                        value={sessionDate}
                        onChange={setSessionDate}
                        ariaLabel="Session date"
                        className="w-full justify-start"
                      />
                      <div className="space-y-1">
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
                            ...(unlistedSessionPersonOption
                              ? [unlistedSessionPersonOption]
                              : []),
                            ...people.map((person) => ({
                              value: person._id,
                              label: person.name,
                            })),
                          ]}
                        />
                        {paging.people.canLoadMore ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={paging.people.isLoadingMore}
                            onClick={paging.people.loadMore}
                          >
                            {paging.people.isLoadingMore
                              ? 'Loading people…'
                              : 'Load more people'}
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button disabled={isRunning} onClick={saveSession}>
                        {editingSessionId ? 'Save batch' : 'Create batch'}
                      </Button>
                      <Button variant="outline" onClick={closeSessionEditor}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </fieldset>

          <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <section>
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Current foods
                </h2>
                <p className="text-xs text-muted-foreground">
                  Unsaved foods stay here until you save or discard them.
                </p>
              </div>
              <div className="space-y-3">
                {noSessions ? (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                    Start by creating a batch. Your first food opens
                    automatically right after.
                  </div>
                ) : sessionDrafts.length === 0 ? (
                  <div className="space-y-3 rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
                    <p>No foods in progress for this batch.</p>
                    <p>
                      Open a saved food to edit it here, or start cooking a new
                      food for this batch.
                    </p>
                    <Button
                      variant="outline"
                      disabled={Boolean(selectedCookSession?.archived)}
                      onClick={() => {
                        if (
                          selectedCookSession &&
                          !selectedCookSession.archived
                        ) {
                          createDraftForSession(selectedCookSession._id)
                        }
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Start cooking
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
                          onClick={() =>
                            selectDraft(draft.draftId, draft.sessionId)
                          }
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
                          disabled={isRunning}
                          aria-label={`Discard ${getCookingDraftLabel(draft)}`}
                          onClick={() => discardDraft(draft)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {activeDraft
                      ? activeDraft.persistedCookedFoodId
                        ? 'Edit saved food'
                        : 'Food editor'
                      : 'Food editor'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedCookSession
                      ? `Working in ${formatCookSessionLabel(selectedCookSession)}`
                      : 'Select a batch to start editing.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    disabled={!activeDraft || isRunning}
                    onClick={() => {
                      if (activeDraft) {
                        discardDraft(activeDraft)
                      }
                    }}
                  >
                    Discard
                  </Button>
                  <Button
                    variant="outline"
                    disabled={
                      !activeDraft || isRunning || isActiveRecipeLoading
                    }
                    onClick={() => saveActiveDraft({ addAnother: true })}
                  >
                    Save and add another
                  </Button>
                  <Button
                    disabled={
                      !activeDraft || isRunning || isActiveRecipeLoading
                    }
                    onClick={() => saveActiveDraft()}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div className="mt-3 space-y-3">
                {!selectedCookSession ? (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-sm text-muted-foreground">
                    Choose a batch first. Batches keep the shared date/person
                    context while each food stays independent.
                  </div>
                ) : !activeDraft ? (
                  <div className="rounded-md border border-dashed border-border/70 bg-muted/10 px-4 py-8 text-sm text-muted-foreground">
                    Open a saved food or start cooking to begin editing.
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {getCookingDraftLabel(activeDraft)}
                      </span>
                      {' · '}
                      {activeDraft.persistedCookedFoodId
                        ? 'Saved food'
                        : 'Unsaved food'}
                      {selectedCookPersonName
                        ? ` · ${selectedCookPersonName}`
                        : ''}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <div>
                        <Label htmlFor="cookedFoodName">Name</Label>
                        <Input
                          id="cookedFoodName"
                          placeholder="Muesli jars"
                          value={activeDraft.name}
                          onChange={(event) =>
                            updateActiveDraft((draft) => ({
                              ...draft,
                              name: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Group</Label>
                        <div className="space-y-1">
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
                              ...cookedFoodGroupOptions,
                            ]}
                          />
                          {paging.foodGroups.canLoadMore ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={paging.foodGroups.isLoadingMore}
                              onClick={paging.foodGroups.loadMore}
                            >
                              {paging.foodGroups.isLoadingMore
                                ? 'Loading groups…'
                                : 'Load more groups'}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="finishedWeight">Finished weight</Label>
                        <Input
                          id="finishedWeight"
                          type="number"
                          placeholder="0"
                          value={activeDraft.finishedWeight}
                          onChange={(event) =>
                            updateActiveDraft((draft) => ({
                              ...draft,
                              finishedWeight: event.target.value,
                            }))
                          }
                        />
                      </div>
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
                              lineCustomIngredientId:
                                value === 'custom'
                                  ? draft.lineCustomIngredientId
                                  : '',
                              lineExistingCookedFoodIngredientId:
                                value === draft.lineMode
                                  ? draft.lineExistingCookedFoodIngredientId
                                  : '',
                              lineExistingIngredientId:
                                value === draft.lineMode
                                  ? draft.lineExistingIngredientId
                                  : '',
                              lineExistingIngredientNameSnapshot:
                                value === draft.lineMode
                                  ? draft.lineExistingIngredientNameSnapshot
                                  : undefined,
                              lineExistingIngredientKcalPer100Snapshot:
                                value === draft.lineMode
                                  ? draft.lineExistingIngredientKcalPer100Snapshot
                                  : undefined,
                              lineExistingIngredientKcalBasisUnitSnapshot:
                                value === draft.lineMode
                                  ? draft.lineExistingIngredientKcalBasisUnitSnapshot
                                  : undefined,
                              lineExistingIngredientIgnoreCaloriesSnapshot:
                                value === draft.lineMode
                                  ? draft.lineExistingIngredientIgnoreCaloriesSnapshot
                                  : undefined,
                              lineExistingCustomSignature:
                                value === draft.lineMode
                                  ? draft.lineExistingCustomSignature
                                  : '',
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
                        <div>
                          <Label htmlFor="ingredientLineNotes">
                            Line notes
                          </Label>
                          <Input
                            id="ingredientLineNotes"
                            maxLength={2000}
                            placeholder="Optional preparation note"
                            value={activeDraft.lineNotes ?? ''}
                            onChange={(event) =>
                              updateActiveDraft((draft) => ({
                                ...draft,
                                lineNotes: event.target.value,
                              }))
                            }
                          />
                        </div>
                        {activeDraft.lineMode === 'ingredient' ? (
                          <>
                            <DataTable
                              columns={ingredientSelectionColumns}
                              data={ingredientSelectionRows}
                              emptyText="No ingredients found."
                              toolbarActions={
                                <>
                                  <Input
                                    aria-label="Table search ingredients"
                                    className="w-full sm:w-64"
                                    maxLength={SEARCH_MAX_LENGTH}
                                    placeholder="Search ingredients"
                                    value={ingredientSearch}
                                    onChange={(event) =>
                                      setIngredientSearch(
                                        event.target.value.slice(
                                          0,
                                          SEARCH_MAX_LENGTH,
                                        ),
                                      )
                                    }
                                  />
                                  {!search.ingredients.active &&
                                  paging.ingredients.canLoadMore ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        paging.ingredients.isLoadingMore
                                      }
                                      onClick={paging.ingredients.loadMore}
                                    >
                                      {paging.ingredients.isLoadingMore
                                        ? 'Loading…'
                                        : 'Load more'}
                                    </Button>
                                  ) : null}
                                </>
                              }
                            />
                            {search.ingredients.active ? (
                              <p className="text-xs text-muted-foreground">
                                Search shows up to {SEARCH_RESULT_LIMIT}{' '}
                                matching ingredients.
                              </p>
                            ) : !paging.ingredients.isComplete ? (
                              <p className="text-xs text-muted-foreground">
                                Ingredient choices are paged; load more to
                                expand the table.
                              </p>
                            ) : null}
                            {selectedLineIngredientName ? (
                              <p className="text-xs text-muted-foreground">
                                Selected:{' '}
                                <span className="font-medium text-foreground">
                                  {selectedLineIngredientName}
                                </span>
                                {' · '}
                                {formatKcalPer100(
                                  selectedLineIngredientKcal ?? 0,
                                )}{' '}
                                kcal / 100 {selectedLineIngredientBasis ?? 'g'}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Select an ingredient from the table.
                              </p>
                            )}
                            <div
                              className={cn(
                                'grid gap-4',
                                shouldAutoFillIngredientReference
                                  ? 'grid-cols-[minmax(0,1fr)_auto]'
                                  : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]',
                              )}
                            >
                              {shouldAutoFillIngredientReference ? null : (
                                <div>
                                  <Label htmlFor="lineReferenceAmount">
                                    Ref. amount
                                  </Label>
                                  <Input
                                    id="lineReferenceAmount"
                                    type="number"
                                    placeholder="0"
                                    value={activeDraft.lineReferenceAmount}
                                    onChange={(event) =>
                                      updateActiveDraft((draft) => ({
                                        ...draft,
                                        lineReferenceAmount: event.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              )}
                              {shouldAutoFillIngredientReference ? null : (
                                <div>
                                  <Label>Ref. unit</Label>
                                  <Select
                                    ariaLabel="Reference unit"
                                    value={activeDraft.lineReferenceUnit}
                                    onValueChange={(value) =>
                                      updateActiveDraft((draft) => ({
                                        ...draft,
                                        lineReferenceUnit:
                                          (value as NutritionUnit | null) ??
                                          'g',
                                      }))
                                    }
                                    className="w-full"
                                    options={NUTRITION_UNIT_OPTIONS}
                                  />
                                </div>
                              )}
                              <div>
                                <Label htmlFor="lineCountedAmount">
                                  {shouldAutoFillIngredientReference
                                    ? 'Amount'
                                    : 'Counted'}
                                </Label>
                                <Input
                                  id="lineCountedAmount"
                                  type="number"
                                  placeholder="0"
                                  value={activeDraft.lineCountedAmount}
                                  onChange={(event) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      lineCountedAmount: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <div className="self-end">
                                <Button
                                  variant="outline"
                                  disabled={Boolean(
                                    activeDraft.lineIngredientId &&
                                    !isEditingStableIngredientLine &&
                                    !selectedCookedFoodLineIngredient,
                                  )}
                                  onClick={addCookedFoodIngredientLine}
                                >
                                  Add line
                                </Button>
                              </div>
                            </div>
                          </>
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
                              <div>
                                <Label htmlFor="customIngredientName">
                                  Ingredient
                                </Label>
                                <Input
                                  id="customIngredientName"
                                  placeholder="Ingredient"
                                  value={activeDraft.lineCustomName}
                                  onChange={(event) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      lineCustomName: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              {activeDraft.lineCustomIgnoreCalories ? null : (
                                <>
                                  <div>
                                    <Label htmlFor="lineCustomKcal">
                                      kcal / 100
                                    </Label>
                                    <Input
                                      id="lineCustomKcal"
                                      type="number"
                                      placeholder="0"
                                      value={activeDraft.lineCustomKcal}
                                      onChange={(event) =>
                                        updateActiveDraft((draft) => ({
                                          ...draft,
                                          lineCustomKcal: event.target.value,
                                        }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label>Basis unit</Label>
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
                                  </div>
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
                                <div>
                                  <Label htmlFor="customReferenceAmount">
                                    Ref. amount
                                  </Label>
                                  <Input
                                    id="customReferenceAmount"
                                    type="number"
                                    placeholder="0"
                                    value={activeDraft.lineReferenceAmount}
                                    onChange={(event) =>
                                      updateActiveDraft((draft) => ({
                                        ...draft,
                                        lineReferenceAmount: event.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              )}
                              {shouldAutoFillCustomReference ? null : (
                                <div>
                                  <Label>Ref. unit</Label>
                                  <Select
                                    ariaLabel="Custom reference unit"
                                    value={activeDraft.lineReferenceUnit}
                                    onValueChange={(value) =>
                                      updateActiveDraft((draft) => ({
                                        ...draft,
                                        lineReferenceUnit:
                                          (value as NutritionUnit | null) ??
                                          'g',
                                      }))
                                    }
                                    className="w-full"
                                    options={NUTRITION_UNIT_OPTIONS}
                                  />
                                </div>
                              )}
                              <div>
                                <Label htmlFor="customCountedAmount">
                                  {shouldAutoFillCustomReference
                                    ? 'Amount'
                                    : 'Counted'}
                                </Label>
                                <Input
                                  id="customCountedAmount"
                                  type="number"
                                  placeholder="0"
                                  value={activeDraft.lineCountedAmount}
                                  onChange={(event) =>
                                    updateActiveDraft((draft) => ({
                                      ...draft,
                                      lineCountedAmount: event.target.value,
                                    }))
                                  }
                                />
                              </div>
                              <div className="self-end">
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
                              ignoreCalories={
                                activeDraft.lineCustomIgnoreCalories
                              }
                              onIgnoreCaloriesChange={(value) =>
                                updateActiveDraft((draft) => ({
                                  ...draft,
                                  lineCustomIgnoreCalories: value,
                                }))
                              }
                              saveToCatalog={
                                activeDraft.lineCustomSaveToCatalog
                              }
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
                                      recipeId: nextChecked
                                        ? ''
                                        : draft.recipeId,
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

                        {recipePickerOptions.length === 0 &&
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
                              <SearchablePicker
                                value={selectedRecipeId}
                                onValueChange={(value) =>
                                  applyRecipeToActiveDraft(
                                    value as Id<'recipes'> | '',
                                  )
                                }
                                ariaLabel="Cooked food recipe search"
                                placeholder="Search recipe"
                                options={recipePickerOptions}
                                searchValue={recipeSearch}
                                onSearchValueChange={(value) =>
                                  setRecipeSearch(
                                    value.slice(0, SEARCH_MAX_LENGTH),
                                  )
                                }
                                loading={
                                  search.recipes.isLoading ||
                                  isActiveRecipeLoading
                                }
                                resultLimit={SEARCH_RESULT_LIMIT}
                              />
                              {search.recipes.active ? (
                                <p className="text-xs text-muted-foreground">
                                  Search shows up to {SEARCH_RESULT_LIMIT}{' '}
                                  matching recipes.
                                </p>
                              ) : paging.recipes.canLoadMore ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={paging.recipes.isLoadingMore}
                                  onClick={paging.recipes.loadMore}
                                >
                                  {paging.recipes.isLoadingMore
                                    ? 'Loading recipes…'
                                    : 'Load more recipes'}
                                </Button>
                              ) : null}
                              {selectedRecipeDetail?.version.instructions?.trim() ? (
                                <div className="rounded-md border border-border/60 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
                                  <p className="font-medium text-foreground">
                                    Instructions
                                  </p>
                                  <p className="mt-1 whitespace-pre-wrap">
                                    {selectedRecipeDetail.version.instructions.trim()}
                                  </p>
                                </div>
                              ) : null}
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
                              <Input
                                aria-label="Recipe name from cooked food"
                                placeholder="Recipe name"
                                value={activeDraft.recipeDraftName}
                                onChange={(event) =>
                                  updateActiveDraft((draft) => ({
                                    ...draft,
                                    recipeDraftName: event.target.value,
                                  }))
                                }
                              />
                              <Textarea
                                aria-label="Recipe instructions from cooked food"
                                placeholder="Optional"
                                value={activeDraft.recipeDraftInstructions}
                                onChange={(event) =>
                                  updateActiveDraft((draft) => ({
                                    ...draft,
                                    recipeDraftInstructions: event.target.value,
                                  }))
                                }
                              />
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
                                  ? line.existingCookedFoodIngredientId
                                    ? Boolean(line.ignoreCaloriesSnapshot)
                                    : isIngredientIgnored(
                                        line.ingredientId,
                                        line.ignoreCaloriesSnapshot,
                                      )
                                  : line.ignoreCalories
                              const lineName =
                                line.sourceType === 'ingredient'
                                  ? ((line.existingCookedFoodIngredientId
                                      ? line.ingredientNameSnapshot
                                      : ingredientById.get(line.ingredientId)
                                          ?.name) ??
                                    line.ingredientNameSnapshot ??
                                    'Unavailable ingredient')
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
                                        {getNutritionUnitLabel(
                                          line.referenceUnit,
                                        )}
                                        {ignored
                                          ? ' · Calories ignored'
                                          : line.countedAmount ===
                                              line.referenceAmount
                                            ? ' · Counted'
                                            : ` · Counted ${line.countedAmount ?? 0}`}
                                      </p>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          editCookedFoodIngredientLine(
                                            line.draftId,
                                          )
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
              </div>
            </section>
          </div>

          <div className="grid gap-6">
            <section className="min-w-0">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-foreground">
                  {savedFoodsCardTitle}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {cookedFoodRows.length}{' '}
                  {search.cookedFoods.active
                    ? 'search matches loaded'
                    : 'loaded'}
                  {!search.cookedFoods.active && !paging.cookedFoods.isComplete
                    ? ' · more available'
                    : ''}
                </p>
              </div>
              <DataTable
                columns={cookedFoodColumns}
                data={cookedFoodRows}
                emptyText={
                  showAllCookedFoods
                    ? 'No cooked foods found.'
                    : 'No saved foods for this batch yet.'
                }
                toolbarActions={
                  <>
                    <Input
                      aria-label="Table search saved foods"
                      className="w-full sm:w-64"
                      maxLength={SEARCH_MAX_LENGTH}
                      placeholder="Search saved foods"
                      value={cookedFoodSearch}
                      onChange={(event) =>
                        setCookedFoodSearch(
                          event.target.value.slice(0, SEARCH_MAX_LENGTH),
                        )
                      }
                    />
                    <Button
                      size="sm"
                      variant={showAllCookedFoods ? 'outline' : 'secondary'}
                      onClick={() => setShowAllCookedFoods(false)}
                    >
                      Selected batch
                    </Button>
                    <Button
                      size="sm"
                      variant={showAllCookedFoods ? 'secondary' : 'outline'}
                      onClick={() => setShowAllCookedFoods(true)}
                    >
                      All sessions
                    </Button>
                    {!search.cookedFoods.active &&
                    paging.cookedFoods.canLoadMore ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={paging.cookedFoods.isLoadingMore}
                        onClick={paging.cookedFoods.loadMore}
                      >
                        {paging.cookedFoods.isLoadingMore
                          ? 'Loading…'
                          : 'Load more'}
                      </Button>
                    ) : null}
                  </>
                }
              />
              {search.cookedFoods.active ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Search shows up to {SEARCH_RESULT_LIMIT} matching saved foods.
                </p>
              ) : null}
            </section>

            <section className="min-w-0">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Batches
                </h2>
                <p className="text-xs text-muted-foreground">
                  {sessionRows.length}{' '}
                  {search.sessions.active ? 'search matches loaded' : 'loaded'}
                  {!search.sessions.active && !paging.sessions.isComplete
                    ? ' · more available'
                    : ''}
                </p>
              </div>
              <DataTable
                columns={sessionColumns}
                data={sessionRows}
                emptyText="No batches found."
                toolbarActions={
                  <>
                    <Input
                      aria-label="Table search batches"
                      className="w-full sm:w-64"
                      maxLength={SEARCH_MAX_LENGTH}
                      placeholder="Search batches"
                      value={sessionSearch}
                      onChange={(event) =>
                        setSessionSearch(
                          event.target.value.slice(0, SEARCH_MAX_LENGTH),
                        )
                      }
                    />
                    {!search.sessions.active && paging.sessions.canLoadMore ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={paging.sessions.isLoadingMore}
                        onClick={paging.sessions.loadMore}
                      >
                        {paging.sessions.isLoadingMore
                          ? 'Loading…'
                          : 'Load more'}
                      </Button>
                    ) : null}
                  </>
                }
              />
            </section>
          </div>
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
