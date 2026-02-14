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
import { Textarea } from '@/components/ui/textarea'

const EMPTY_MANAGEMENT_DATA = {
  people: [],
  personGoalHistory: [],
  foodGroups: [],
  ingredients: [],
  recipes: [],
  recipeVersions: [],
  recipeVersionIngredients: [],
  recipeVersionOutputs: [],
  cookSessions: [],
  cookedFoods: [],
  cookedFoodIngredients: [],
  meals: [],
  mealItems: [],
}

type RecipeIngredientDraft = {
  ingredientId: Id<'ingredients'>
  plannedWeightGrams: number
}

type RecipeOutputDraft = {
  name: string
  groupIds: Id<'foodGroups'>[]
  plannedFinishedWeightGrams?: number
}

type CookedFoodIngredientDraft = {
  ingredientId: Id<'ingredients'>
  rawWeightGrams: number
}

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
  const [recipeLineWeight, setRecipeLineWeight] = useState('')
  const [recipeIngredientLines, setRecipeIngredientLines] = useState<
    RecipeIngredientDraft[]
  >([])
  const [recipeOutputName, setRecipeOutputName] = useState('')
  const [recipeOutputGroupId, setRecipeOutputGroupId] = useState<Id<'foodGroups'> | ''>('')
  const [recipeOutputWeight, setRecipeOutputWeight] = useState('')
  const [recipeOutputLines, setRecipeOutputLines] = useState<RecipeOutputDraft[]>([])

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
  const [cookedFoodNotes, setCookedFoodNotes] = useState('')
  const [cookedFoodLineIngredientId, setCookedFoodLineIngredientId] = useState<
    Id<'ingredients'> | ''
  >('')
  const [cookedFoodLineWeight, setCookedFoodLineWeight] = useState('')
  const [cookedFoodIngredientLines, setCookedFoodIngredientLines] = useState<
    CookedFoodIngredientDraft[]
  >([])

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
  const recipeOutputsByVersionId = useMemo(() => {
    const map = new Map<Id<'recipeVersions'>, Doc<'recipeVersionOutputs'>[]>()
    for (const line of data.recipeVersionOutputs) {
      const bucket = map.get(line.recipeVersionId)
      if (bucket) {
        bucket.push(line)
      } else {
        map.set(line.recipeVersionId, [line])
      }
    }
    return map
  }, [data.recipeVersionOutputs])
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

  const ingredientById = new Map(ingredients.map((item) => [item._id, item]))

  async function runAction(successText: string, action: () => Promise<unknown>) {
    try {
      await action()
      toast.success(successText)
    } catch (error) {
      toast.error(toErrorMessage(error))
    }
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
    setRecipeLineWeight('')
    setRecipeIngredientLines([])
    setRecipeOutputName('')
    setRecipeOutputGroupId('')
    setRecipeOutputWeight('')
    setRecipeOutputLines([])
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
    setCookedFoodNotes('')
    setCookedFoodLineIngredientId('')
    setCookedFoodLineWeight('')
    setCookedFoodIngredientLines([])
  }

  const addRecipeIngredientLine = () => {
    const parsed = Number(recipeLineWeight)
    if (!recipeLineIngredientId || !Number.isFinite(parsed) || parsed <= 0) {
      return
    }
    setRecipeIngredientLines((current) => [
      ...current,
      { ingredientId: recipeLineIngredientId, plannedWeightGrams: parsed },
    ])
    setRecipeLineIngredientId('')
    setRecipeLineWeight('')
  }
  const addRecipeOutputLine = () => {
    if (!recipeOutputName.trim()) {
      return
    }
    const parsed = Number(recipeOutputWeight)
    setRecipeOutputLines((current) => [
      ...current,
      {
        name: recipeOutputName.trim(),
        groupIds: recipeOutputGroupId ? [recipeOutputGroupId] : [],
        plannedFinishedWeightGrams:
          Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
      },
    ])
    setRecipeOutputName('')
    setRecipeOutputGroupId('')
    setRecipeOutputWeight('')
  }
  const addCookedFoodIngredientLine = () => {
    const parsed = Number(cookedFoodLineWeight)
    if (!cookedFoodLineIngredientId || !Number.isFinite(parsed) || parsed <= 0) {
      return
    }
    setCookedFoodIngredientLines((current) => [
      ...current,
      { ingredientId: cookedFoodLineIngredientId, rawWeightGrams: parsed },
    ])
    setCookedFoodLineIngredientId('')
    setCookedFoodLineWeight('')
  }

  if (isLoading) {
    return (
      <main className="min-h-[calc(100vh-4rem)] px-4 py-8 sm:px-6">
        <p className="text-sm text-muted-foreground">Loading management data...</p>
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
                  placeholder="Group name"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                />
                <Select
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
                          void runAction('Group deleted.', async () => {
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
                  placeholder="Ingredient name"
                  value={ingredientName}
                  onChange={(event) => setIngredientName(event.target.value)}
                />
                <Input
                  placeholder="Brand"
                  value={ingredientBrand}
                  onChange={(event) => setIngredientBrand(event.target.value)}
                />
                <Input
                  type="number"
                  placeholder="kcal / 100g"
                  value={ingredientKcal}
                  onChange={(event) => setIngredientKcal(event.target.value)}
                />
                <Select
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
                  placeholder="grams per unit"
                  value={ingredientGramsPerUnit}
                  onChange={(event) => setIngredientGramsPerUnit(event.target.value)}
                />
                <Select
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
                          void runAction('Ingredient deleted.', async () => {
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
                  placeholder="Recipe name"
                  value={recipeName}
                  onChange={(event) => setRecipeName(event.target.value)}
                />
                <Input
                  placeholder="Description"
                  value={recipeDescription}
                  onChange={(event) => setRecipeDescription(event.target.value)}
                />
              </div>
              <Textarea
                placeholder="Instructions"
                value={recipeInstructions}
                onChange={(event) => setRecipeInstructions(event.target.value)}
              />
              <Input
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
                  placeholder="Search ingredient"
                  options={ingredients.map((item) => ({
                    value: item._id,
                    label: item.name,
                  }))}
                />
                <Input
                  type="number"
                  placeholder="grams"
                  value={recipeLineWeight}
                  onChange={(event) => setRecipeLineWeight(event.target.value)}
                />
                <Button variant="outline" onClick={addRecipeIngredientLine}>
                  Add ingredient
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <Input
                  placeholder="Output name"
                  value={recipeOutputName}
                  onChange={(event) => setRecipeOutputName(event.target.value)}
                />
                <Select
                  value={recipeOutputGroupId}
                  onValueChange={(value) =>
                    setRecipeOutputGroupId(value as Id<'foodGroups'> | '')
                  }
                  placeholder="Group"
                  options={[
                    { value: '', label: 'No group' },
                    ...groups.map((group) => ({ value: group._id, label: group.name })),
                  ]}
                />
                <Input
                  type="number"
                  placeholder="planned grams"
                  value={recipeOutputWeight}
                  onChange={(event) => setRecipeOutputWeight(event.target.value)}
                />
                <Button variant="outline" onClick={addRecipeOutputLine}>
                  Add output
                </Button>
              </div>

              <div className="rounded-md bg-muted/45 p-2 text-xs text-muted-foreground">
                <p>Ingredients: {recipeIngredientLines.length}</p>
                <p>Outputs: {recipeOutputLines.length}</p>
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
                          plannedIngredients: recipeIngredientLines,
                          plannedOutputs: recipeOutputLines,
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
                          const versionOutputs =
                            recipeOutputsByVersionId.get(currentVersion._id) ?? []
                          setEditingRecipeId(recipe._id)
                          setRecipeName(recipe.name)
                          setRecipeDescription(recipe.description ?? '')
                          setRecipeInstructions(currentVersion.instructions ?? '')
                          setRecipeNotes(currentVersion.notes ?? '')
                          setRecipeIngredientLines(
                            versionIngredients.map((line) => ({
                              ingredientId: line.ingredientId,
                              plannedWeightGrams: line.plannedWeightGrams,
                            })),
                          )
                          setRecipeOutputLines(
                            versionOutputs.map((line) => ({
                              name: line.name,
                              groupIds: line.groupIds,
                              plannedFinishedWeightGrams: line.plannedFinishedWeightGrams,
                            })),
                          )
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
                          void runAction('Recipe deleted.', async () => {
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
                    placeholder="Session label"
                    value={sessionLabel}
                    onChange={(event) => setSessionLabel(event.target.value)}
                  />
                  <DatePicker value={sessionDate} onChange={setSessionDate} />
                  <Select
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
                          } else {
                            await createCookSession({
                              label: sessionLabel.trim() || undefined,
                              cookedAt,
                              cookedByPersonId: sessionPersonId || undefined,
                              notes: sessionNotes.trim() || undefined,
                            })
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
                      <span>{session.label ?? toLocalDateString(session.cookedAt)}</span>
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
                            void runAction('Session deleted.', async () => {
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
                  <Select
                    value={cookedFoodSessionId}
                    onValueChange={(value) =>
                      setCookedFoodSessionId(value as Id<'cookSessions'> | '')
                    }
                    placeholder="Session"
                    options={cookSessions.map((session) => ({
                      value: session._id,
                      label: session.label ?? toLocalDateString(session.cookedAt),
                    }))}
                  />
                  <Input
                    placeholder="Cooked food name"
                    value={cookedFoodName}
                    onChange={(event) => setCookedFoodName(event.target.value)}
                  />
                  <SearchablePicker
                    value={cookedFoodRecipeVersionId}
                    onValueChange={(value) =>
                      setCookedFoodRecipeVersionId(value as Id<'recipeVersions'> | '')
                    }
                    placeholder="Search recipe"
                    options={recipeVersionOptions}
                  />
                  <Select
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
                    placeholder="Finished grams"
                    value={cookedFoodFinishedWeight}
                    onChange={(event) =>
                      setCookedFoodFinishedWeight(event.target.value)
                    }
                  />
                  <Input
                    placeholder="Notes"
                    value={cookedFoodNotes}
                    onChange={(event) => setCookedFoodNotes(event.target.value)}
                  />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                  <SearchablePicker
                    value={cookedFoodLineIngredientId}
                    onValueChange={(value) =>
                      setCookedFoodLineIngredientId(value as Id<'ingredients'> | '')
                    }
                    placeholder="Search ingredient"
                    options={ingredients.map((item) => ({
                      value: item._id,
                      label: item.name,
                    }))}
                  />
                  <Input
                    type="number"
                    placeholder="raw grams"
                    value={cookedFoodLineWeight}
                    onChange={(event) => setCookedFoodLineWeight(event.target.value)}
                  />
                  <Button variant="outline" onClick={addCookedFoodIngredientLine}>
                    Add ingredient
                  </Button>
                </div>
                <div className="mt-2 rounded-md bg-muted/45 p-2 text-xs text-muted-foreground">
                  {cookedFoodIngredientLines.map((line, index) => (
                    <p key={`cooked-line-${index}`}>
                      {ingredientById.get(line.ingredientId)?.name ?? 'Unknown'} -{' '}
                      {line.rawWeightGrams.toFixed(1)}g
                    </p>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      if (!cookedFoodSessionId) {
                        return
                      }
                      const recipeVersion = cookedFoodRecipeVersionId
                        ? recipeVersionById.get(cookedFoodRecipeVersionId)
                        : undefined
                      void runAction(
                        editingCookedFoodId
                          ? 'Cooked food updated.'
                          : 'Cooked food created.',
                        async () => {
                          const payload = {
                            cookSessionId: cookedFoodSessionId,
                            name: cookedFoodName,
                            recipeId: recipeVersion?.recipeId,
                            recipeVersionId: cookedFoodRecipeVersionId || undefined,
                            groupIds: cookedFoodGroupId ? [cookedFoodGroupId] : [],
                            finishedWeightGrams: Number(cookedFoodFinishedWeight),
                            notes: cookedFoodNotes.trim() || undefined,
                            ingredients: cookedFoodIngredientLines,
                          }
                          if (editingCookedFoodId) {
                            await updateCookedFood({
                              cookedFoodId: editingCookedFoodId,
                              ...payload,
                            })
                          } else {
                            await createCookedFood(payload)
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
                            setCookedFoodNotes(food.notes ?? '')
                            setCookedFoodIngredientLines(
                              ingredientLines.map((line) => ({
                                ingredientId: line.ingredientId,
                                rawWeightGrams: line.rawWeightGrams,
                              })),
                            )
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
                            void runAction('Cooked food deleted.', async () => {
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

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return 'Request failed.'
}
