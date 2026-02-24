import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useMemo, useState } from 'react'
import { BookOpenText, ChefHat, FolderTree, Wheat } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import type { Doc, Id } from '../../convex/_generated/dataModel'
import { isConvexConfigured } from '@/integrations/convex/config'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { SearchablePicker } from '@/components/ui/searchable-picker'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Toggle } from '@/components/ui/toggle'

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

type RecipeIngredientDraft = {
  draftId: string
  ingredientId: Id<'ingredients'>
  plannedWeightGrams: number
}

type ExistingCookedFoodIngredientDraft = {
  draftId: string
  sourceType: 'ingredient'
  ingredientId: Id<'ingredients'>
  rawWeightGrams: number
}

type CustomCookedFoodIngredientDraft = {
  draftId: string
  sourceType: 'custom'
  name: string
  kcalPer100g: number
  rawWeightGrams: number
  saveToCatalog: boolean
}

type CookedFoodIngredientDraft =
  | ExistingCookedFoodIngredientDraft
  | CustomCookedFoodIngredientDraft

export const Route = createFileRoute('/manage')({
  ssr: false,
  component: ManagePage,
})

function ManagePage() {
  if (!isConvexConfigured) {
    return (
      <main className="min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">Convex configuration is missing.</p>
      </main>
    )
  }

  return <ManagePageContent />
}

function ManagePageContent() {
  const [showArchived, setShowArchived] = useState(false)

  const [editingGroupId, setEditingGroupId] = useState<Id<'foodGroups'> | null>(null)
  const [groupName, setGroupName] = useState('')
  const [groupScope, setGroupScope] = useState<'ingredient' | 'cookedFood' | 'both'>(
    'both',
  )

  const [editingIngredientId, setEditingIngredientId] = useState<Id<'ingredients'> | null>(
    null,
  )
  const [ingredientName, setIngredientName] = useState('')
  const [ingredientBrand, setIngredientBrand] = useState('')
  const [ingredientKcal, setIngredientKcal] = useState('')
  const [ingredientUnit, setIngredientUnit] = useState<'g' | 'ml' | 'piece'>('g')
  const [ingredientGramsPerUnit, setIngredientGramsPerUnit] = useState('')
  const [ingredientGroupId, setIngredientGroupId] = useState<Id<'foodGroups'> | ''>('')
  const [ingredientNotes, setIngredientNotes] = useState('')

  const [editingRecipeId, setEditingRecipeId] = useState<Id<'recipes'> | null>(null)
  const [recipeName, setRecipeName] = useState('')
  const [recipeDescription, setRecipeDescription] = useState('')
  const [recipeInstructions, setRecipeInstructions] = useState('')
  const [recipeNotes, setRecipeNotes] = useState('')
  const [recipeLineIngredientId, setRecipeLineIngredientId] = useState<
    Id<'ingredients'> | ''
  >('')
  const [recipeLineAmount, setRecipeLineAmount] = useState('')
  const [recipeIngredientLines, setRecipeIngredientLines] = useState<
    RecipeIngredientDraft[]
  >([])
  const [recipeIngredientAmountByDraftId, setRecipeIngredientAmountByDraftId] =
    useState<Record<string, string>>({})

  const [editingSessionId, setEditingSessionId] = useState<Id<'cookSessions'> | null>(null)
  const [sessionLabel, setSessionLabel] = useState('')
  const [sessionDate, setSessionDate] = useState(() => toLocalDateString(Date.now()))
  const [sessionPersonId, setSessionPersonId] = useState<Id<'people'> | ''>('')
  const [sessionNotes, setSessionNotes] = useState('')

  const [editingCookedFoodId, setEditingCookedFoodId] = useState<Id<'cookedFoods'> | null>(
    null,
  )
  const [cookedFoodSessionId, setCookedFoodSessionId] = useState<
    Id<'cookSessions'> | ''
  >('')
  const [cookedFoodName, setCookedFoodName] = useState('')
  const [cookedFoodGroupId, setCookedFoodGroupId] = useState<Id<'foodGroups'> | ''>('')
  const [cookedFoodFinishedWeight, setCookedFoodFinishedWeight] = useState('')
  const [cookedFoodRecipeVersionId, setCookedFoodRecipeVersionId] = useState<
    Id<'recipeVersions'> | ''
  >('')
  const [saveCookedFoodAsRecipe, setSaveCookedFoodAsRecipe] = useState(false)
  const [cookedFoodRecipeDraftName, setCookedFoodRecipeDraftName] = useState('')
  const [cookedFoodRecipeDraftDescription, setCookedFoodRecipeDraftDescription] =
    useState('')
  const [cookedFoodRecipeDraftInstructions, setCookedFoodRecipeDraftInstructions] =
    useState('')
  const [cookedFoodRecipeDraftNotes, setCookedFoodRecipeDraftNotes] = useState('')
  const [cookedFoodNotes, setCookedFoodNotes] = useState('')
  const [cookedFoodLineSourceType, setCookedFoodLineSourceType] = useState<
    'ingredient' | 'custom'
  >('ingredient')
  const [cookedFoodLineIngredientId, setCookedFoodLineIngredientId] = useState<
    Id<'ingredients'> | ''
  >('')
  const [cookedFoodLineCustomName, setCookedFoodLineCustomName] = useState('')
  const [cookedFoodLineCustomKcal, setCookedFoodLineCustomKcal] = useState('')
  const [cookedFoodLineCustomSaveToCatalog, setCookedFoodLineCustomSaveToCatalog] =
    useState(false)
  const [cookedFoodLineWeight, setCookedFoodLineWeight] = useState('')
  const [cookedFoodIngredientLines, setCookedFoodIngredientLines] = useState<
    CookedFoodIngredientDraft[]
  >([])
  const [cookedFoodIngredientWeightByDraftId, setCookedFoodIngredientWeightByDraftId] =
    useState<Record<string, string>>({})
  const [cookedFoodIngredientKcalByDraftId, setCookedFoodIngredientKcalByDraftId] =
    useState<Record<string, string>>({})

  const dataResult = useQuery(api.nutrition.getManagementData)
  const data = (dataResult ?? EMPTY_MANAGEMENT_DATA) as NonNullable<
    typeof dataResult
  >
  const isLoading = dataResult === undefined

  const createFoodGroup = useMutation(api.nutrition.createFoodGroup)
  const updateFoodGroup = useMutation(api.nutrition.updateFoodGroup)
  const setFoodGroupArchived = useMutation(api.nutrition.setFoodGroupArchived)
  const deleteFoodGroup = useMutation(api.nutrition.deleteFoodGroup)

  const createIngredient = useMutation(api.nutrition.createIngredient)
  const updateIngredient = useMutation(api.nutrition.updateIngredient)
  const setIngredientArchived = useMutation(api.nutrition.setIngredientArchived)
  const deleteIngredient = useMutation(api.nutrition.deleteIngredient)

  const createRecipe = useMutation(api.nutrition.createRecipe)
  const updateRecipeCurrentVersion = useMutation(
    api.nutrition.updateRecipeCurrentVersion,
  )
  const setRecipeArchived = useMutation(api.nutrition.setRecipeArchived)
  const deleteRecipe = useMutation(api.nutrition.deleteRecipe)

  const createCookSession = useMutation(api.nutrition.createCookSession)
  const updateCookSession = useMutation(api.nutrition.updateCookSession)
  const setCookSessionArchived = useMutation(api.nutrition.setCookSessionArchived)
  const deleteCookSession = useMutation(api.nutrition.deleteCookSession)

  const createCookedFood = useMutation(api.nutrition.createCookedFood)
  const updateCookedFood = useMutation(api.nutrition.updateCookedFood)
  const setCookedFoodArchived = useMutation(api.nutrition.setCookedFoodArchived)
  const deleteCookedFood = useMutation(api.nutrition.deleteCookedFood)

  const people = data.people.filter((person) => person.active)
  const groups = data.foodGroups.filter((group) => (showArchived ? true : !group.archived))
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

  const ingredientById = useMemo(
    () => new Map(ingredients.map((item) => [item._id, item])),
    [ingredients],
  )
  const ingredientByIdAll = useMemo(
    () => new Map(data.ingredients.map((item) => [item._id, item])),
    [data.ingredients],
  )
  const ingredientOptions = useMemo(
    () =>
      ingredients.map((item) => ({
        value: item._id,
        label: item.name,
        keywords: `${item.brand ?? ''} ${item.kcalPer100g.toFixed(1)} kcal`,
      })),
    [ingredients],
  )
  const ingredientOptionsAll = useMemo(
    () =>
      data.ingredients.map((item) => ({
        value: item._id,
        label: item.archived ? `${item.name} (archived)` : item.name,
        keywords: `${item.brand ?? ''} ${item.kcalPer100g.toFixed(1)} kcal`,
      })),
    [data.ingredients],
  )
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
    if (!window.confirm(message)) {
      return
    }
    void runAction(successText, action)
  }

  const resetGroupForm = () => {
    setEditingGroupId(null)
    setGroupName('')
    setGroupScope('both')
  }
  const resetIngredientForm = () => {
    setEditingIngredientId(null)
    setIngredientName('')
    setIngredientBrand('')
    setIngredientKcal('')
    setIngredientUnit('g')
    setIngredientGramsPerUnit('')
    setIngredientGroupId('')
    setIngredientNotes('')
  }
  const resetRecipeForm = () => {
    setEditingRecipeId(null)
    setRecipeName('')
    setRecipeDescription('')
    setRecipeInstructions('')
    setRecipeNotes('')
    setRecipeLineIngredientId('')
    setRecipeLineAmount('')
    setRecipeIngredientLines([])
    setRecipeIngredientAmountByDraftId({})
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
    setCookedFoodLineSourceType('ingredient')
    setCookedFoodLineIngredientId('')
    setCookedFoodLineCustomName('')
    setCookedFoodLineCustomKcal('')
    setCookedFoodLineCustomSaveToCatalog(false)
    setCookedFoodLineWeight('')
    setCookedFoodIngredientLines([])
    setCookedFoodIngredientWeightByDraftId({})
    setCookedFoodIngredientKcalByDraftId({})
  }

  const addRecipeIngredientLine = () => {
    const ingredient = recipeLineIngredientId
      ? ingredientById.get(recipeLineIngredientId)
      : undefined
    const parsed = Number(recipeLineAmount)
    if (!recipeLineIngredientId || !Number.isFinite(parsed) || parsed <= 0) {
      return
    }
    if (!canConvertRecipeAmountByIngredient(ingredient)) {
      toast.error('Set grams per unit on this ingredient before using non-gram units.')
      return
    }
    const plannedWeightGrams = toRecipeWeightGrams(ingredient, parsed)
    setRecipeIngredientLines((current) => [
      ...current,
      {
        draftId: createRecipeIngredientDraftId(),
        ingredientId: recipeLineIngredientId,
        plannedWeightGrams,
      },
    ])
    setRecipeLineIngredientId('')
    setRecipeLineAmount('')
  }
  const updateRecipeIngredientLine = (
    draftId: string,
    update: Partial<RecipeIngredientDraft>,
  ) => {
    setRecipeIngredientLines((current) =>
      current.map((line) => (line.draftId === draftId ? { ...line, ...update } : line)),
    )
  }
  const removeRecipeIngredientLine = (draftId: string) => {
    setRecipeIngredientLines((current) => current.filter((line) => line.draftId !== draftId))
    setRecipeIngredientAmountByDraftId((current) => {
      const next = { ...current }
      delete next[draftId]
      return next
    })
  }
  const addCookedFoodIngredientLine = () => {
    const parsed = Number(cookedFoodLineWeight)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return
    }
    if (cookedFoodLineSourceType === 'ingredient') {
      if (!cookedFoodLineIngredientId) {
        return
      }
      setCookedFoodIngredientLines((current) => [
        ...current,
        {
          draftId: createCookedFoodIngredientDraftId(),
          sourceType: 'ingredient',
          ingredientId: cookedFoodLineIngredientId,
          rawWeightGrams: parsed,
        },
      ])
      setCookedFoodLineIngredientId('')
      setCookedFoodLineWeight('')
      return
    }

    const parsedKcal = Number(cookedFoodLineCustomKcal)
    if (!cookedFoodLineCustomName.trim() || !Number.isFinite(parsedKcal) || parsedKcal <= 0) {
      return
    }
    setCookedFoodIngredientLines((current) => [
      ...current,
      {
        draftId: createCookedFoodIngredientDraftId(),
        sourceType: 'custom',
        name: cookedFoodLineCustomName.trim(),
        kcalPer100g: parsedKcal,
        rawWeightGrams: parsed,
        saveToCatalog: cookedFoodLineCustomSaveToCatalog,
      },
    ])
    setCookedFoodLineCustomName('')
    setCookedFoodLineCustomKcal('')
    setCookedFoodLineCustomSaveToCatalog(false)
    setCookedFoodLineWeight('')
  }
  const updateCookedFoodIngredientLine = (
    draftId: string,
    updater: (line: CookedFoodIngredientDraft) => CookedFoodIngredientDraft,
  ) => {
    setCookedFoodIngredientLines((current) =>
      current.map((line) => (line.draftId === draftId ? updater(line) : line)),
    )
  }
  const removeCookedFoodIngredientLine = (draftId: string) => {
    setCookedFoodIngredientLines((current) => current.filter((line) => line.draftId !== draftId))
    setCookedFoodIngredientWeightByDraftId((current) => {
      const next = { ...current }
      delete next[draftId]
      return next
    })
    setCookedFoodIngredientKcalByDraftId((current) => {
      const next = { ...current }
      delete next[draftId]
      return next
    })
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
      recipeLines.map((line) => ({
        draftId: createCookedFoodIngredientDraftId(),
        sourceType: 'ingredient',
        ingredientId: line.ingredientId,
        rawWeightGrams: line.plannedWeightGrams,
      })),
    )
    setCookedFoodIngredientWeightByDraftId({})
    setCookedFoodIngredientKcalByDraftId({})
  }

  const resolvedCookedFoodSessionId =
    cookedFoodSessionId || (editingCookedFoodId ? '' : (cookSessions[0]?._id ?? ''))

  const selectedRecipeLineIngredient = recipeLineIngredientId
    ? ingredientById.get(recipeLineIngredientId)
    : undefined
  const recipeLineAmountUnit = getRecipeAmountUnit(selectedRecipeLineIngredient)
  const recipeLineAmountUnitLabel = getRecipeAmountUnitLabel(recipeLineAmountUnit)
  const recipeLineSupportsSelectedUnit = canConvertRecipeAmountByIngredient(
    selectedRecipeLineIngredient,
  )

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_20%_10%,#fff7e4_0%,#f5f6f4_44%,#e8f0ea_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,#1d2535_0%,#111a26_44%,#0a1119_100%)]">
        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
          <div className="rounded-2xl border border-amber-200/80 bg-card/85 p-6 shadow-sm dark:border-amber-500/25">
            <Skeleton className="h-10 w-full max-w-[34rem]" />
            <Skeleton className="mt-3 h-4 w-full max-w-[32rem]" />
            <Skeleton className="mt-2 h-4 w-full max-w-[24rem]" />
            <Skeleton className="mt-4 h-8 w-36" />
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderTree className="h-4 w-4 text-amber-700" />
                  Food Groups
                </CardTitle>
                <CardDescription>Used to classify ingredients and cooked outputs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-24" />
                </div>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`group-skeleton-${index}`}
                    className="flex items-center justify-between gap-3 rounded-md bg-muted/45 px-3 py-2"
                  >
                    <Skeleton className="h-4 w-36" />
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-14" />
                      <Skeleton className="h-8 w-[4.5rem]" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wheat className="h-4 w-4 text-amber-700" />
                  Ingredients
                </CardTitle>
                <CardDescription>Edit mistakes quickly, archive old records, or delete unused ones.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={`ingredient-input-skeleton-${index}`} className="h-9 w-full" />
                  ))}
                </div>
                <Skeleton className="h-20 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-32" />
                  <Skeleton className="h-9 w-24" />
                </div>
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`ingredient-row-skeleton-${index}`}
                    className="flex items-center justify-between gap-3 rounded-md bg-muted/45 px-3 py-2"
                  >
                    <Skeleton className="h-4 w-40" />
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-14" />
                      <Skeleton className="h-8 w-[4.5rem]" />
                      <Skeleton className="h-8 w-14" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpenText className="h-4 w-4 text-sky-700" />
                  Recipes
                </CardTitle>
                <CardDescription>Edit current version directly for quick corrections.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </div>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-9 w-full" />
                <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-28" />
                </div>
                <Skeleton className="h-28 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-9 w-20" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ChefHat className="h-4 w-4 text-rose-700" />
                  Cooking Sessions and Cooked Foods
                </CardTitle>
                <CardDescription>Update measured weights when users correct mistakes.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border p-3">
                  <Skeleton className="h-4 w-20" />
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Skeleton className="h-9 w-[7.5rem]" />
                    <Skeleton className="h-9 w-20" />
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <Skeleton className="h-4 w-28" />
                  <div className="mt-2 space-y-3">
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_20%_10%,#fff7e4_0%,#f5f6f4_44%,#e8f0ea_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,#1d2535_0%,#111a26_44%,#0a1119_100%)]">
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-amber-200/80 bg-card/85 p-6 shadow-sm dark:border-amber-500/25">
          <h1 data-display="true" className="text-4xl text-foreground">
            Catalog and Cooking Management
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Infrequently edited data lives here: ingredients, recipes, sessions, cooked foods.
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

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-amber-700" />
                Food Groups
              </CardTitle>
              <CardDescription>Used to classify ingredients and cooked outputs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  aria-label='Group name'
                  placeholder="Group name"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                />
                <Select
                  ariaLabel='Group scope'
                  value={groupScope}
                  onValueChange={(value) =>
                    setGroupScope(value as 'ingredient' | 'cookedFood' | 'both')
                  }
                  options={[
                    { value: 'both', label: 'Both' },
                    { value: 'ingredient', label: 'Ingredient only' },
                    { value: 'cookedFood', label: 'Cooked food only' },
                  ]}
                />
                <Button
                  onClick={() =>
                    void runAction(
                      editingGroupId ? 'Group updated.' : 'Group created.',
                      async () => {
                        if (editingGroupId) {
                          await updateFoodGroup({
                            groupId: editingGroupId,
                            name: groupName,
                            appliesTo: groupScope,
                          })
                        } else {
                          await createFoodGroup({
                            name: groupName,
                            appliesTo: groupScope,
                          })
                        }
                        resetGroupForm()
                      },
                    )
                  }
                >
                  {editingGroupId ? 'Save' : 'Create'}
                </Button>
              </div>
              <div className="space-y-2">
                {groups.map((group) => (
                  <div
                    key={group._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/45 px-3 py-2 text-sm"
                  >
                    <span>
                      {group.name} ({group.appliesTo})
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingGroupId(group._id)
                          setGroupName(group.name)
                          setGroupScope(group.appliesTo)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void runAction(
                            group.archived ? 'Group restored.' : 'Group archived.',
                            async () => {
                              await setFoodGroupArchived({
                                groupId: group._id,
                                archived: !group.archived,
                              })
                            },
                          )
                        }
                      >
                        {group.archived ? 'Unarchive' : 'Archive'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          confirmAndRunAction('Delete this group permanently?', 'Group deleted.', async () => {
                            await deleteFoodGroup({ groupId: group._id })
                            if (editingGroupId === group._id) {
                              resetGroupForm()
                            }
                          })
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wheat className="h-4 w-4 text-amber-700" />
                Ingredients
              </CardTitle>
              <CardDescription>Edit mistakes quickly, archive old records, or delete unused ones.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  aria-label='Ingredient name'
                  placeholder="Ingredient name"
                  value={ingredientName}
                  onChange={(event) => setIngredientName(event.target.value)}
                />
                <Input
                  aria-label='Ingredient brand'
                  placeholder="Brand"
                  value={ingredientBrand}
                  onChange={(event) => setIngredientBrand(event.target.value)}
                />
                <Input
                  type="number"
                  aria-label='Ingredient calories per 100 grams'
                  placeholder="kcal / 100g"
                  value={ingredientKcal}
                  onChange={(event) => setIngredientKcal(event.target.value)}
                />
                <Select
                  ariaLabel='Ingredient default unit'
                  value={ingredientUnit}
                  onValueChange={(value) =>
                    setIngredientUnit(value as 'g' | 'ml' | 'piece')
                  }
                  options={[
                    { value: 'g', label: 'Gram' },
                    { value: 'ml', label: 'Milliliter' },
                    { value: 'piece', label: 'Piece' },
                  ]}
                />
                <Input
                  type="number"
                  aria-label='Ingredient grams per unit'
                  placeholder="grams per unit"
                  value={ingredientGramsPerUnit}
                  onChange={(event) => setIngredientGramsPerUnit(event.target.value)}
                />
                <Select
                  ariaLabel='Ingredient group'
                  value={ingredientGroupId}
                  onValueChange={(value) =>
                    setIngredientGroupId(value as Id<'foodGroups'> | '')
                  }
                  placeholder="Group (optional)"
                  options={[
                    { value: '', label: 'No group' },
                    ...groups.map((group) => ({ value: group._id, label: group.name })),
                  ]}
                />
              </div>
              <Textarea
                aria-label='Ingredient notes'
                placeholder="Notes"
                value={ingredientNotes}
                onChange={(event) => setIngredientNotes(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    void runAction(
                      editingIngredientId ? 'Ingredient updated.' : 'Ingredient created.',
                      async () => {
                        const payload = {
                          name: ingredientName,
                          brand: ingredientBrand.trim() || undefined,
                          kcalPer100g: Number(ingredientKcal),
                          defaultUnit: ingredientUnit,
                          gramsPerUnit:
                            ingredientGramsPerUnit.trim() === ''
                              ? undefined
                              : Number(ingredientGramsPerUnit),
                          groupIds: ingredientGroupId ? [ingredientGroupId] : [],
                          notes: ingredientNotes.trim() || undefined,
                        }
                        if (editingIngredientId) {
                          await updateIngredient({
                            ingredientId: editingIngredientId,
                            ...payload,
                          })
                        } else {
                          await createIngredient(payload)
                        }
                        resetIngredientForm()
                      },
                    )
                  }
                >
                  {editingIngredientId ? 'Save ingredient' : 'Add ingredient'}
                </Button>
                {editingIngredientId ? (
                  <Button variant="outline" onClick={resetIngredientForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>

              <div className="max-h-52 space-y-2 overflow-auto">
                {ingredients.map((ingredient) => (
                  <div
                    key={ingredient._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/45 px-3 py-2 text-sm"
                  >
                    <span>
                      {ingredient.name} ({ingredient.kcalPer100g.toFixed(1)} kcal)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingIngredientId(ingredient._id)
                          setIngredientName(ingredient.name)
                          setIngredientBrand(ingredient.brand ?? '')
                          setIngredientKcal(ingredient.kcalPer100g.toString())
                          setIngredientUnit(ingredient.defaultUnit)
                          setIngredientGramsPerUnit(
                            ingredient.gramsPerUnit?.toString() ?? '',
                          )
                          setIngredientGroupId(ingredient.groupIds[0] ?? '')
                          setIngredientNotes(ingredient.notes ?? '')
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void runAction(
                            ingredient.archived
                              ? 'Ingredient restored.'
                              : 'Ingredient archived.',
                            async () => {
                              await setIngredientArchived({
                                ingredientId: ingredient._id,
                                archived: !ingredient.archived,
                              })
                            },
                          )
                        }
                      >
                        {ingredient.archived ? 'Unarchive' : 'Archive'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          confirmAndRunAction('Delete this ingredient permanently?', 'Ingredient deleted.', async () => {
                            await deleteIngredient({ ingredientId: ingredient._id })
                            if (editingIngredientId === ingredient._id) {
                              resetIngredientForm()
                            }
                          })
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpenText className="h-4 w-4 text-sky-700" />
                Recipes
              </CardTitle>
              <CardDescription>Edit current version directly for quick corrections.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  aria-label='Recipe name'
                  placeholder="Recipe name"
                  value={recipeName}
                  onChange={(event) => setRecipeName(event.target.value)}
                />
                <Input
                  aria-label='Recipe description'
                  placeholder="Description"
                  value={recipeDescription}
                  onChange={(event) => setRecipeDescription(event.target.value)}
                />
              </div>
              <Textarea
                aria-label='Recipe instructions'
                placeholder="Instructions"
                value={recipeInstructions}
                onChange={(event) => setRecipeInstructions(event.target.value)}
              />
              <Input
                aria-label='Recipe version notes'
                placeholder="Version notes"
                value={recipeNotes}
                onChange={(event) => setRecipeNotes(event.target.value)}
              />

              <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                <SearchablePicker
                  value={recipeLineIngredientId}
                  onValueChange={(value) =>
                    setRecipeLineIngredientId(value as Id<'ingredients'> | '')
                  }
                  ariaLabel='Recipe ingredient search'
                  placeholder="Search ingredient"
                  options={ingredientOptions}
                />
                <Input
                  type="number"
                  aria-label='Recipe ingredient amount'
                  placeholder={recipeLineAmountUnitLabel}
                  value={recipeLineAmount}
                  onChange={(event) => setRecipeLineAmount(event.target.value)}
                />
                <Button variant="outline" onClick={addRecipeIngredientLine}>
                  Add ingredient
                </Button>
              </div>
              {selectedRecipeLineIngredient &&
              !recipeLineSupportsSelectedUnit &&
              selectedRecipeLineIngredient.defaultUnit !== 'g' ? (
                <p className="text-xs text-amber-700">
                  {selectedRecipeLineIngredient.name} uses{' '}
                  {getRecipeAmountUnitLabel(selectedRecipeLineIngredient.defaultUnit)}. Add
                  grams per unit on the ingredient first.
                </p>
              ) : null}

              <div className="rounded-md border border-border/60 bg-muted/35 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">Recipe ingredients</p>
                  <p className="text-xs text-muted-foreground">
                    {recipeIngredientLines.length} line
                    {recipeIngredientLines.length === 1 ? '' : 's'}
                  </p>
                </div>
                {recipeIngredientLines.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Add at least one ingredient line.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recipeIngredientLines.map((line) => {
                      const ingredient = ingredientById.get(line.ingredientId)
                      const unit = getRecipeAmountUnit(ingredient)
                      const unitLabel = getRecipeAmountUnitLabel(unit)
                      const defaultValue = formatRecipeAmountForInput(
                        toRecipeAmountValue(ingredient, line.plannedWeightGrams),
                      )
                      const displayedValue =
                        recipeIngredientAmountByDraftId[line.draftId] ?? defaultValue
                      return (
                        <div
                          key={line.draftId}
                          className="grid gap-2 rounded-md bg-background/80 p-2 sm:grid-cols-[1.35fr_1fr_auto]"
                        >
                          <SearchablePicker
                            value={line.ingredientId}
                            onValueChange={(value) => {
                              const nextIngredientId = value as Id<'ingredients'>
                              const nextIngredient = ingredientById.get(nextIngredientId)
                              if (!canConvertRecipeAmountByIngredient(nextIngredient)) {
                                toast.error(
                                  'Set grams per unit on this ingredient before using non-gram units.',
                                )
                                return
                              }
                              updateRecipeIngredientLine(line.draftId, {
                                ingredientId: nextIngredientId,
                              })
                              setRecipeIngredientAmountByDraftId((current) => {
                                const next = { ...current }
                                delete next[line.draftId]
                                return next
                              })
                            }}
                            ariaLabel='Recipe line ingredient search'
                            placeholder="Search ingredient"
                            options={ingredientOptions}
                            className="space-y-1"
                          />
                          <div className="space-y-1">
                            <Input
                              type="number"
                              aria-label='Recipe line amount'
                              value={displayedValue}
                              placeholder={unitLabel}
                              onChange={(event) => {
                                const nextValue = event.target.value
                                setRecipeIngredientAmountByDraftId((current) => ({
                                  ...current,
                                  [line.draftId]: nextValue,
                                }))
                                const parsed = Number(nextValue)
                                if (!Number.isFinite(parsed) || parsed <= 0) {
                                  return
                                }
                                updateRecipeIngredientLine(line.draftId, {
                                  plannedWeightGrams: toRecipeWeightGrams(
                                    ingredient,
                                    parsed,
                                  ),
                                })
                              }}
                              onBlur={() => {
                                setRecipeIngredientAmountByDraftId((current) => {
                                  const next = { ...current }
                                  delete next[line.draftId]
                                  return next
                                })
                              }}
                            />
                            <p className="text-[11px] text-muted-foreground">
                              {getRecipeIngredientStoredHint(ingredient, line.plannedWeightGrams)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeRecipeIngredientLine(line.draftId)}
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
                  onClick={() =>
                    void runAction(
                      editingRecipeId ? 'Recipe updated.' : 'Recipe created.',
                      async () => {
                        const payload = {
                          name: recipeName,
                          description: recipeDescription.trim() || undefined,
                          instructions: recipeInstructions.trim() || undefined,
                          notes: recipeNotes.trim() || undefined,
                          plannedIngredients: recipeIngredientLines.map((line) => ({
                            ingredientId: line.ingredientId,
                            plannedWeightGrams: line.plannedWeightGrams,
                          })),
                        }
                        if (editingRecipeId) {
                          await updateRecipeCurrentVersion({
                            recipeId: editingRecipeId,
                            ...payload,
                          })
                        } else {
                          await createRecipe(payload)
                        }
                        resetRecipeForm()
                      },
                    )
                  }
                >
                  {editingRecipeId ? 'Save recipe' : 'Create recipe'}
                </Button>
                {editingRecipeId ? (
                  <Button variant="outline" onClick={resetRecipeForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>

              <div className="max-h-52 space-y-2 overflow-auto">
                {recipes.map((recipe) => (
                  <div
                    key={recipe._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/45 px-3 py-2 text-sm"
                  >
                    <span>
                      {recipe.name} (v{recipe.latestVersionNumber})
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const currentVersion = recipeVersionByRecipeId.get(recipe._id)
                          if (!currentVersion) {
                            return
                          }
                          const versionIngredients =
                            recipeIngredientsByVersionId.get(currentVersion._id) ?? []
                          setEditingRecipeId(recipe._id)
                          setRecipeName(recipe.name)
                          setRecipeDescription(recipe.description ?? '')
                          setRecipeInstructions(currentVersion.instructions ?? '')
                          setRecipeNotes(currentVersion.notes ?? '')
                          setRecipeIngredientLines(
                            versionIngredients.map((line) => ({
                              draftId: createRecipeIngredientDraftId(),
                              ingredientId: line.ingredientId,
                              plannedWeightGrams: line.plannedWeightGrams,
                            })),
                          )
                          setRecipeIngredientAmountByDraftId({})
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void runAction(
                            recipe.archived ? 'Recipe restored.' : 'Recipe archived.',
                            async () => {
                              await setRecipeArchived({
                                recipeId: recipe._id,
                                archived: !recipe.archived,
                              })
                            },
                          )
                        }
                      >
                        {recipe.archived ? 'Unarchive' : 'Archive'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          confirmAndRunAction('Delete this recipe permanently?', 'Recipe deleted.', async () => {
                            await deleteRecipe({ recipeId: recipe._id })
                            if (editingRecipeId === recipe._id) {
                              resetRecipeForm()
                            }
                          })
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChefHat className="h-4 w-4 text-rose-700" />
                Cooking Sessions and Cooked Foods
              </CardTitle>
              <CardDescription>Update measured weights when users correct mistakes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">Session</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label='Session label'
                    placeholder="Session label"
                    value={sessionLabel}
                    onChange={(event) => setSessionLabel(event.target.value)}
                  />
                  <DatePicker
                    value={sessionDate}
                    onChange={setSessionDate}
                    ariaLabel='Session date'
                  />
                  <Select
                    ariaLabel='Session person'
                    value={sessionPersonId}
                    onValueChange={(value) =>
                      setSessionPersonId(value as Id<'people'> | '')
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
                    aria-label='Session notes'
                    placeholder="Session notes"
                    value={sessionNotes}
                    onChange={(event) => setSessionNotes(event.target.value)}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
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
                <div className="mt-3 max-h-36 space-y-2 overflow-auto">
                  {cookSessions.map((session) => (
                    <div
                      key={session._id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/45 px-3 py-2 text-sm"
                    >
                      <span>{formatCookSessionOptionLabel(session)}</span>
                      <div className="flex gap-2">
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
                              session.archived
                                ? 'Session restored.'
                                : 'Session archived.',
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
                          onClick={() =>
                            confirmAndRunAction('Delete this session permanently?', 'Session deleted.', async () => {
                              await deleteCookSession({ sessionId: session._id })
                              if (editingSessionId === session._id) {
                                resetSessionForm()
                              }
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">Cooked food</p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <SearchablePicker
                    ariaLabel='Cooked food session search'
                    value={resolvedCookedFoodSessionId}
                    onValueChange={(value) =>
                      setCookedFoodSessionId(value as Id<'cookSessions'> | '')
                    }
                    placeholder="Search session"
                    options={sessionOptions}
                  />
                  <Input
                    aria-label='Cooked food name'
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
                      ariaLabel='Cooked food recipe search'
                      placeholder="Search recipe"
                      options={recipeVersionOptions}
                    />
                  ) : (
                    <div className="rounded-md border border-emerald-400/35 bg-emerald-500/8 px-3 py-2 text-xs text-foreground">
                      New recipe will be created from these ingredient lines.
                    </div>
                  )}
                  <Select
                    ariaLabel='Cooked food group'
                    value={cookedFoodGroupId}
                    onValueChange={(value) =>
                      setCookedFoodGroupId(value as Id<'foodGroups'> | '')
                    }
                    placeholder="Group"
                    options={[
                      { value: '', label: 'No group' },
                      ...groups.map((group) => ({
                        value: group._id,
                        label: group.name,
                      })),
                    ]}
                  />
                  <Input
                    type="number"
                    aria-label='Finished cooked food weight'
                    placeholder="Finished grams"
                    value={cookedFoodFinishedWeight}
                    onChange={(event) =>
                      setCookedFoodFinishedWeight(event.target.value)
                    }
                  />
                  <Input
                    aria-label='Cooked food notes'
                    placeholder="Notes"
                    value={cookedFoodNotes}
                    onChange={(event) => setCookedFoodNotes(event.target.value)}
                  />
                </div>
                {!editingCookedFoodId ? (
                  <div className="mt-3 rounded-md bg-muted/35 p-3">
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
                          aria-label='Recipe name from cooked food'
                          placeholder={cookedFoodName.trim() || 'Recipe name'}
                          value={cookedFoodRecipeDraftName}
                          onChange={(event) =>
                            setCookedFoodRecipeDraftName(event.target.value)
                          }
                        />
                        <Input
                          aria-label='Recipe description from cooked food'
                          placeholder="Description (optional)"
                          value={cookedFoodRecipeDraftDescription}
                          onChange={(event) =>
                            setCookedFoodRecipeDraftDescription(event.target.value)
                          }
                        />
                        <Textarea
                          aria-label='Recipe instructions from cooked food'
                          placeholder="Instructions (optional)"
                          value={cookedFoodRecipeDraftInstructions}
                          onChange={(event) =>
                            setCookedFoodRecipeDraftInstructions(event.target.value)
                          }
                        />
                        <Input
                          aria-label='Recipe notes from cooked food'
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

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-foreground">Add ingredient line</p>
                  <div className="inline-flex gap-1 rounded-full bg-muted/60 p-1">
                    <Toggle
                      size="sm"
                      variant="default"
                      className="rounded-full px-3 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                      pressed={cookedFoodLineSourceType === 'ingredient'}
                      onPressedChange={(pressed) => {
                        if (pressed) {
                          setCookedFoodLineSourceType('ingredient')
                        }
                      }}
                    >
                      Existing
                    </Toggle>
                    <Toggle
                      size="sm"
                      variant="default"
                      className="rounded-full px-3 text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
                      pressed={cookedFoodLineSourceType === 'custom'}
                      onPressedChange={(pressed) => {
                        if (pressed) {
                          setCookedFoodLineSourceType('custom')
                        }
                      }}
                    >
                      New
                    </Toggle>
                  </div>
                </div>

                {cookedFoodLineSourceType === 'ingredient' ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                    <SearchablePicker
                      value={cookedFoodLineIngredientId}
                      onValueChange={(value) =>
                        setCookedFoodLineIngredientId(value as Id<'ingredients'> | '')
                      }
                      ariaLabel='Cooked food ingredient search'
                      placeholder="Search ingredient"
                      options={ingredientOptions}
                    />
                    <Input
                      type="number"
                      aria-label='Cooked food raw grams'
                      placeholder="raw grams"
                      value={cookedFoodLineWeight}
                      onChange={(event) => setCookedFoodLineWeight(event.target.value)}
                    />
                    <Button onClick={addCookedFoodIngredientLine}>
                      Add ingredient
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_0.8fr_0.8fr_auto_auto]">
                    <Input
                      aria-label='New cooked food ingredient name'
                      placeholder="Ingredient name"
                      value={cookedFoodLineCustomName}
                      onChange={(event) => setCookedFoodLineCustomName(event.target.value)}
                    />
                    <Input
                      type="number"
                      aria-label='New cooked food ingredient kcal per 100g'
                      placeholder="kcal / 100g"
                      value={cookedFoodLineCustomKcal}
                      onChange={(event) => setCookedFoodLineCustomKcal(event.target.value)}
                    />
                    <Input
                      type="number"
                      aria-label='New cooked food ingredient raw grams'
                      placeholder="raw grams"
                      value={cookedFoodLineWeight}
                      onChange={(event) => setCookedFoodLineWeight(event.target.value)}
                    />
                    <label className="flex items-center gap-2 rounded-md bg-muted/35 px-3 text-xs text-foreground">
                      Save for later
                      <Switch
                        size="sm"
                        checked={cookedFoodLineCustomSaveToCatalog}
                        onCheckedChange={(checked) =>
                          setCookedFoodLineCustomSaveToCatalog(Boolean(checked))
                        }
                      />
                    </label>
                    <Button onClick={addCookedFoodIngredientLine}>
                      Add ingredient
                    </Button>
                  </div>
                )}
                <div className="mt-2 rounded-md bg-muted/45 p-2 text-xs text-muted-foreground">
                  {cookedFoodIngredientLines.length === 0 ? (
                    <p>Add at least one ingredient line.</p>
                  ) : (
                    <div className="space-y-2">
                      {cookedFoodIngredientLines.map((line) => {
                        const displayedWeight =
                          cookedFoodIngredientWeightByDraftId[line.draftId] ??
                          formatRecipeAmountForInput(line.rawWeightGrams)
                        const displayedKcal =
                          line.sourceType === 'custom'
                            ? cookedFoodIngredientKcalByDraftId[line.draftId] ??
                              formatRecipeAmountForInput(line.kcalPer100g)
                            : ''
                        if (line.sourceType === 'ingredient') {
                          return (
                            <div
                              key={line.draftId}
                              className="grid gap-2 rounded-md bg-background/80 p-2 sm:grid-cols-[1.35fr_1fr_auto]"
                            >
                              <SearchablePicker
                                value={line.ingredientId}
                                onValueChange={(value) =>
                                  updateCookedFoodIngredientLine(line.draftId, (current) => {
                                    if (current.sourceType !== 'ingredient') {
                                      return current
                                    }
                                    return {
                                      ...current,
                                      ingredientId: value as Id<'ingredients'>,
                                    }
                                  })
                                }
                                ariaLabel='Cooked food line ingredient search'
                                placeholder="Search ingredient"
                                options={ingredientOptionsAll}
                              />
                              <Input
                                type="number"
                                aria-label='Cooked food line raw grams'
                                value={displayedWeight}
                                placeholder="raw grams"
                                onChange={(event) => {
                                  const nextValue = event.target.value
                                  setCookedFoodIngredientWeightByDraftId((current) => ({
                                    ...current,
                                    [line.draftId]: nextValue,
                                  }))
                                  const parsed = Number(nextValue)
                                  if (!Number.isFinite(parsed) || parsed <= 0) {
                                    return
                                  }
                                  updateCookedFoodIngredientLine(line.draftId, (current) => {
                                    if (current.sourceType !== 'ingredient') {
                                      return current
                                    }
                                    return {
                                      ...current,
                                      rawWeightGrams: parsed,
                                    }
                                  })
                                }}
                                onBlur={() => {
                                  setCookedFoodIngredientWeightByDraftId((current) => {
                                    const next = { ...current }
                                    delete next[line.draftId]
                                    return next
                                  })
                                }}
                              />
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
                        }
                        return (
                          <div
                            key={line.draftId}
                            className="grid gap-2 rounded-md bg-background/80 p-2 sm:grid-cols-[1fr_0.8fr_0.8fr_auto_auto]"
                          >
                            <Input
                              aria-label='Cooked food custom ingredient name'
                              value={line.name}
                              onChange={(event) =>
                                updateCookedFoodIngredientLine(line.draftId, (current) => {
                                  if (current.sourceType !== 'custom') {
                                    return current
                                  }
                                  return {
                                    ...current,
                                    name: event.target.value,
                                  }
                                })
                              }
                            />
                            <Input
                              type="number"
                              aria-label='Cooked food custom ingredient kcal per 100g'
                              value={displayedKcal}
                              placeholder="kcal / 100g"
                              onChange={(event) => {
                                const nextValue = event.target.value
                                setCookedFoodIngredientKcalByDraftId((current) => ({
                                  ...current,
                                  [line.draftId]: nextValue,
                                }))
                                const parsed = Number(nextValue)
                                if (!Number.isFinite(parsed) || parsed <= 0) {
                                  return
                                }
                                updateCookedFoodIngredientLine(line.draftId, (current) => {
                                  if (current.sourceType !== 'custom') {
                                    return current
                                  }
                                  return {
                                    ...current,
                                    kcalPer100g: parsed,
                                  }
                                })
                              }}
                              onBlur={() => {
                                setCookedFoodIngredientKcalByDraftId((current) => {
                                  const next = { ...current }
                                  delete next[line.draftId]
                                  return next
                                })
                              }}
                            />
                            <Input
                              type="number"
                              aria-label='Cooked food line raw grams'
                              value={displayedWeight}
                              placeholder="raw grams"
                              onChange={(event) => {
                                const nextValue = event.target.value
                                setCookedFoodIngredientWeightByDraftId((current) => ({
                                  ...current,
                                  [line.draftId]: nextValue,
                                }))
                                const parsed = Number(nextValue)
                                if (!Number.isFinite(parsed) || parsed <= 0) {
                                  return
                                }
                                updateCookedFoodIngredientLine(line.draftId, (current) => {
                                  if (current.sourceType !== 'custom') {
                                    return current
                                  }
                                  return {
                                    ...current,
                                    rawWeightGrams: parsed,
                                  }
                                })
                              }}
                              onBlur={() => {
                                setCookedFoodIngredientWeightByDraftId((current) => {
                                  const next = { ...current }
                                  delete next[line.draftId]
                                  return next
                                })
                              }}
                            />
                            <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 text-xs">
                              Save for later
                              <Switch
                                size="sm"
                                checked={line.saveToCatalog}
                                onCheckedChange={(checked) =>
                                  updateCookedFoodIngredientLine(line.draftId, (current) => {
                                    if (current.sourceType !== 'custom') {
                                      return current
                                    }
                                    return {
                                      ...current,
                                      saveToCatalog: Boolean(checked),
                                    }
                                  })
                                }
                              />
                            </label>
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
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
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
                        toast.error('Finished grams must be greater than 0.')
                        return
                      }
                      if (
                        !editingCookedFoodId &&
                        saveCookedFoodAsRecipe &&
                        !(
                          cookedFoodRecipeDraftName.trim() ||
                          cookedFoodName.trim()
                        )
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
                            name: cookedFoodName,
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
                                    rawWeightGrams: line.rawWeightGrams,
                                  }
                                : {
                                    sourceType: 'custom' as const,
                                    name: line.name,
                                    kcalPer100g: line.kcalPer100g,
                                    rawWeightGrams: line.rawWeightGrams,
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
                                      cookedFoodName.trim(),
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

                <div className="mt-3 max-h-44 space-y-2 overflow-auto">
                  {cookedFoods.map((food) => (
                    <div
                      key={food._id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/45 px-3 py-2 text-sm"
                    >
                      <span>
                        {food.name} ({food.kcalPer100g.toFixed(1)} kcal/100g)
                      </span>
                      <div className="flex gap-2">
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
                            setCookedFoodFinishedWeight(
                              food.finishedWeightGrams.toString(),
                            )
                            setCookedFoodRecipeVersionId(food.recipeVersionId ?? '')
                            setSaveCookedFoodAsRecipe(false)
                            setCookedFoodRecipeDraftName('')
                            setCookedFoodRecipeDraftDescription('')
                            setCookedFoodRecipeDraftInstructions('')
                            setCookedFoodRecipeDraftNotes('')
                            setCookedFoodNotes(food.notes ?? '')
                            setCookedFoodIngredientLines(
                              ingredientLines.map((line) => {
                                const ingredientNameFromLink = line.ingredientId
                                  ? ingredientByIdAll.get(line.ingredientId)?.name
                                  : undefined
                                if (line.ingredientId) {
                                  return {
                                    draftId: createCookedFoodIngredientDraftId(),
                                    sourceType: 'ingredient' as const,
                                    ingredientId: line.ingredientId,
                                    rawWeightGrams: line.rawWeightGrams,
                                  }
                                }
                                return {
                                  draftId: createCookedFoodIngredientDraftId(),
                                  sourceType: 'custom' as const,
                                  name:
                                    (line as { ingredientNameSnapshot?: string })
                                      .ingredientNameSnapshot ??
                                    ingredientNameFromLink ??
                                    'Custom ingredient',
                                  kcalPer100g: line.ingredientKcalPer100gSnapshot,
                                  rawWeightGrams: line.rawWeightGrams,
                                  saveToCatalog: false,
                                }
                              }),
                            )
                            setCookedFoodIngredientWeightByDraftId({})
                            setCookedFoodIngredientKcalByDraftId({})
                            setCookedFoodLineSourceType('ingredient')
                            setCookedFoodLineIngredientId('')
                            setCookedFoodLineCustomName('')
                            setCookedFoodLineCustomKcal('')
                            setCookedFoodLineCustomSaveToCatalog(false)
                            setCookedFoodLineWeight('')
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
                          onClick={() =>
                            confirmAndRunAction('Delete this cooked food permanently?', 'Cooked food deleted.', async () => {
                              await deleteCookedFood({ cookedFoodId: food._id })
                              if (editingCookedFoodId === food._id) {
                                resetCookedFoodForm()
                              }
                            })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}

function createRecipeIngredientDraftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createCookedFoodIngredientDraftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function canConvertRecipeAmountByIngredient(ingredient: Doc<'ingredients'> | undefined) {
  if (!ingredient) {
    return false
  }
  if (ingredient.defaultUnit === 'g') {
    return true
  }
  return Boolean(ingredient.gramsPerUnit && ingredient.gramsPerUnit > 0)
}

function getRecipeAmountUnit(ingredient: Doc<'ingredients'> | undefined) {
  if (!ingredient) {
    return 'g'
  }
  if (ingredient.defaultUnit === 'g') {
    return 'g'
  }
  return canConvertRecipeAmountByIngredient(ingredient) ? ingredient.defaultUnit : 'g'
}

function getRecipeAmountUnitLabel(unit: 'g' | 'ml' | 'piece') {
  if (unit === 'ml') {
    return 'ml'
  }
  if (unit === 'piece') {
    return 'pieces'
  }
  return 'grams'
}

function toRecipeWeightGrams(
  ingredient: Doc<'ingredients'> | undefined,
  amount: number,
) {
  if (!ingredient || ingredient.defaultUnit === 'g') {
    return amount
  }
  if (ingredient.gramsPerUnit && ingredient.gramsPerUnit > 0) {
    return amount * ingredient.gramsPerUnit
  }
  return amount
}

function toRecipeAmountValue(
  ingredient: Doc<'ingredients'> | undefined,
  weightGrams: number,
) {
  if (!ingredient || ingredient.defaultUnit === 'g') {
    return weightGrams
  }
  if (ingredient.gramsPerUnit && ingredient.gramsPerUnit > 0) {
    return weightGrams / ingredient.gramsPerUnit
  }
  return weightGrams
}

function formatRecipeAmountForInput(value: number) {
  if (!Number.isFinite(value)) {
    return ''
  }
  return Number(value.toFixed(3)).toString()
}

function getRecipeIngredientStoredHint(
  ingredient: Doc<'ingredients'> | undefined,
  weightGrams: number,
) {
  const storedText = `${weightGrams.toFixed(1)}g`
  if (!ingredient || ingredient.defaultUnit === 'g') {
    return `Stored: ${storedText}`
  }
  const amount = toRecipeAmountValue(ingredient, weightGrams)
  const unit = getRecipeAmountUnit(ingredient)
  const unitLabel = getRecipeAmountUnitLabel(unit)
  return `${formatRecipeAmountForInput(amount)} ${unitLabel} (stored as ${storedText})`
}

function toLocalDateString(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toTimestampFromDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) {
    return Date.now()
  }
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime()
}

function formatCookSessionOptionLabel(session: Doc<'cookSessions'>) {
  const cookedDate = toLocalDateString(session.cookedAt)
  if (!session.label?.trim()) {
    return cookedDate
  }
  return `${cookedDate} • ${session.label.trim()}`
}

function getCookSessionModifiedAt(session: Doc<'cookSessions'>) {
  return (
    (session as Doc<'cookSessions'> & { updatedAt?: number }).updatedAt ??
    session.createdAt
  )
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return 'Request failed.'
}
