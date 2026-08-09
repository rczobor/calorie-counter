import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, Trash2 } from 'lucide-react'

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
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  CustomIngredientSwitchRow,
  IngredientLineModeToggle,
} from '@/components/nutrition/ingredient-line-controls'
import { FoodGroupsSection } from '@/features/manage/food-groups'
import { IngredientsSection } from '@/features/manage/ingredients'
import { RecipesSection } from '@/features/manage/recipes'
import {
  type CatalogFoodGroup,
  type CatalogIngredient,
  type CatalogRecipe,
  useCatalogDomainData,
} from '@/features/manage/use-catalog-domain-data'
import { useConfirmableAction } from '@/hooks/use-confirmable-action'
import { createDraftId } from '@/lib/id'
import {
  NUTRITION_UNIT_OPTIONS,
  type NutritionUnit,
  formatKcalPer100,
} from '@/lib/nutrition'

const SEARCH_MAX_LENGTH = 100

type FoodGroupTableRow = {
  id: Id<'foodGroups'>
  group: CatalogFoodGroup
  name: string
  appliesTo: 'ingredient' | 'cookedFood'
  status: 'Active' | 'Archived'
}

type IngredientTableRow = {
  id: Id<'ingredients'>
  ingredient: CatalogIngredient
  name: string
  brand: string
  kcalPer100: number
  kcalBasisUnit: NutritionUnit
  ignoreCalories: boolean
  status: 'Active' | 'Archived'
}

type RecipeTableRow = {
  id: Id<'recipes'>
  recipe: CatalogRecipe
  name: string
  latestVersionNumber: number
  status: 'Active' | 'Archived'
}

type RecipeIngredientPickerRow = {
  id: Id<'ingredients'>
  name: string
  brand: string
  kcalPer100: number
  kcalBasisUnit: NutritionUnit
  ignoreCalories: boolean
}

type ExistingRecipeIngredientDraft = {
  draftId: string
  sourceType: 'ingredient'
  ingredientId: Id<'ingredients'>
  name: string
  kcalPer100: number
  kcalBasisUnit: NutritionUnit
  ignoreCalories: boolean
  referenceAmount: number
  referenceUnit: NutritionUnit
  notes?: string
}

type CustomRecipeIngredientDraft = {
  draftId: string
  sourceType: 'custom'
  ingredientId?: Id<'ingredients'>
  name: string
  kcalPer100: number
  kcalBasisUnit: NutritionUnit
  ignoreCalories: boolean
  referenceAmount: number
  referenceUnit: NutritionUnit
  saveToCatalog: boolean
  notes?: string
}

type RecipeIngredientDraft =
  ExistingRecipeIngredientDraft | CustomRecipeIngredientDraft

export const Route = createFileRoute('/catalog')({
  ssr: false,
  component: ManagePage,
})

function ManagePage() {
  if (!isConvexConfigured) {
    return <ConfigMissingState />
  }

  return <ManagePageContent />
}

function ManagePageContent() {
  const [showArchived, setShowArchived] = useState(false)
  const [foodGroupSearch, setFoodGroupSearch] = useState('')
  const [ingredientSearch, setIngredientSearch] = useState('')
  const [recipeIngredientSearch, setRecipeIngredientSearch] = useState('')
  const [recipeSearch, setRecipeSearch] = useState('')
  const {
    pendingConfirmation,
    isConfirmDialogOpen,
    isRunning,
    runAction,
    confirmAndRunAction,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  } = useConfirmableAction()

  const [editingGroupId, setEditingGroupId] = useState<Id<'foodGroups'> | null>(
    null,
  )
  const [groupName, setGroupName] = useState('')
  const [groupScope, setGroupScope] = useState<'ingredient' | 'cookedFood'>(
    'ingredient',
  )

  const [editingIngredientId, setEditingIngredientId] =
    useState<Id<'ingredients'> | null>(null)
  const [ingredientName, setIngredientName] = useState('')
  const [ingredientBrand, setIngredientBrand] = useState('')
  const [ingredientKcal, setIngredientKcal] = useState('')
  const [ingredientKcalBasisUnit, setIngredientKcalBasisUnit] =
    useState<NutritionUnit>('g')
  const [ingredientIgnoreCalories, setIngredientIgnoreCalories] =
    useState(false)
  const [ingredientGroupId, setIngredientGroupId] = useState<
    Id<'foodGroups'> | ''
  >('')
  const [editingIngredientGroup, setEditingIngredientGroup] = useState<{
    id: Id<'foodGroups'>
    name: string
    archived: boolean
  } | null>(null)
  const [ingredientNotes, setIngredientNotes] = useState('')

  const [editingRecipeId, setEditingRecipeId] = useState<Id<'recipes'> | null>(
    null,
  )
  const [recipeName, setRecipeName] = useState('')
  const [recipeInstructions, setRecipeInstructions] = useState('')
  const [recipeLineMode, setRecipeLineMode] = useState<'ingredient' | 'custom'>(
    'ingredient',
  )
  const [recipeLineIngredientId, setRecipeLineIngredientId] = useState<
    Id<'ingredients'> | ''
  >('')
  const [recipeLineCustomName, setRecipeLineCustomName] = useState('')
  const [recipeLineCustomKcal, setRecipeLineCustomKcal] = useState('')
  const [recipeLineCustomBasisUnit, setRecipeLineCustomBasisUnit] =
    useState<NutritionUnit>('g')
  const [recipeLineCustomIgnoreCalories, setRecipeLineCustomIgnoreCalories] =
    useState(false)
  const [recipeLineCustomSaveToCatalog, setRecipeLineCustomSaveToCatalog] =
    useState(true)
  const [recipeLineAmount, setRecipeLineAmount] = useState('')
  const [recipeLineUnit, setRecipeLineUnit] = useState<NutritionUnit>('g')
  const [recipeIngredientLines, setRecipeIngredientLines] = useState<
    RecipeIngredientDraft[]
  >([])
  const [recipeLineAmountDraftById, setRecipeLineAmountDraftById] = useState<
    Record<string, string>
  >({})
  const [recipeLineKcalDraftById, setRecipeLineKcalDraftById] = useState<
    Record<string, string>
  >({})

  const catalogData = useCatalogDomainData({
    showArchived,
    foodGroupSearch,
    ingredientSearch,
    recipeIngredientSearch,
    recipeSearch,
  })

  const recipeDetail = useQuery(
    api.recipes.getCurrent,
    editingRecipeId ? { recipeId: editingRecipeId } : 'skip',
  )
  const [hydratedRecipeVersionId, setHydratedRecipeVersionId] =
    useState<Id<'recipeVersions'> | null>(null)
  const hydratedRecipeVersionRef = useRef<Id<'recipeVersions'> | null>(null)
  const isEditingRecipeHydrated =
    !editingRecipeId ||
    (recipeDetail?.recipe._id === editingRecipeId &&
      hydratedRecipeVersionId === recipeDetail.version._id)

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

  const {
    foodGroups: groups,
    ingredients,
    recipeIngredients: recipePickerIngredients,
    recipes,
  } = catalogData

  const ingredientById = useMemo(
    () =>
      new Map(
        [...ingredients, ...recipePickerIngredients].map((item) => [
          item._id,
          item,
        ]),
      ),
    [ingredients, recipePickerIngredients],
  )
  const selectedRecipeLineIngredient = recipeLineIngredientId
    ? ingredientById.get(recipeLineIngredientId)
    : undefined
  const ingredientGroupOptions = useMemo(() => {
    const options = catalogData.ingredientFoodGroups.map((group) => ({
      value: group._id,
      label: group.name,
    }))
    if (
      editingIngredientGroup &&
      !options.some((option) => option.value === editingIngredientGroup.id)
    ) {
      options.push({
        value: editingIngredientGroup.id,
        label: `${editingIngredientGroup.name}${
          editingIngredientGroup.archived ? ' (archived)' : ''
        }`,
      })
    }
    return options
  }, [catalogData.ingredientFoodGroups, editingIngredientGroup])

  const resetGroupForm = () => {
    setEditingGroupId(null)
    setGroupName('')
    setGroupScope('ingredient')
  }

  const resetIngredientForm = () => {
    setEditingIngredientId(null)
    setIngredientName('')
    setIngredientBrand('')
    setIngredientKcal('')
    setIngredientKcalBasisUnit('g')
    setIngredientIgnoreCalories(false)
    setIngredientGroupId('')
    setEditingIngredientGroup(null)
    setIngredientNotes('')
  }

  const resetRecipeForm = () => {
    setEditingRecipeId(null)
    hydratedRecipeVersionRef.current = null
    setHydratedRecipeVersionId(null)
    setRecipeName('')
    setRecipeInstructions('')
    setRecipeLineMode('ingredient')
    setRecipeLineIngredientId('')
    setRecipeLineCustomName('')
    setRecipeLineCustomKcal('')
    setRecipeLineCustomBasisUnit('g')
    setRecipeLineCustomIgnoreCalories(false)
    setRecipeLineCustomSaveToCatalog(true)
    setRecipeLineAmount('')
    setRecipeLineUnit('g')
    setRecipeIngredientLines([])
    setRecipeLineAmountDraftById({})
    setRecipeLineKcalDraftById({})
  }

  useEffect(() => {
    if (
      !editingRecipeId ||
      !recipeDetail ||
      recipeDetail.recipe._id !== editingRecipeId ||
      hydratedRecipeVersionRef.current === recipeDetail.version._id
    ) {
      return
    }

    setRecipeName(recipeDetail.recipe.name)
    setRecipeInstructions(recipeDetail.version.instructions ?? '')
    setRecipeLineAmountDraftById({})
    setRecipeLineKcalDraftById({})
    setRecipeIngredientLines(
      recipeDetail.ingredients.map((line) => {
        if (line.sourceType === 'custom') {
          return {
            draftId: createDraftId(),
            sourceType: 'custom' as const,
            ingredientId: line.ingredientId,
            name: line.ingredientNameSnapshot,
            kcalPer100: line.kcalPer100Snapshot,
            kcalBasisUnit: line.kcalBasisUnitSnapshot,
            ignoreCalories: line.ignoreCaloriesSnapshot,
            referenceAmount: line.referenceAmount,
            referenceUnit: line.referenceUnit,
            saveToCatalog: false,
            notes: line.notes,
          }
        }
        return {
          draftId: createDraftId(),
          sourceType: 'ingredient' as const,
          ingredientId: line.ingredientId,
          name: line.ingredientNameSnapshot,
          kcalPer100: line.kcalPer100Snapshot,
          kcalBasisUnit: line.kcalBasisUnitSnapshot,
          ignoreCalories: line.ignoreCaloriesSnapshot,
          referenceAmount: line.referenceAmount,
          referenceUnit: line.referenceUnit,
          notes: line.notes,
        }
      }),
    )
    hydratedRecipeVersionRef.current = recipeDetail.version._id
    setHydratedRecipeVersionId(recipeDetail.version._id)
  }, [editingRecipeId, recipeDetail])

  const foodGroupRows = useMemo<FoodGroupTableRow[]>(
    () =>
      groups.map((group) => ({
        id: group._id,
        group,
        name: group.name,
        appliesTo: (group as { appliesTo: 'ingredient' | 'cookedFood' })
          .appliesTo,
        status: group.archived ? 'Archived' : 'Active',
      })),
    [groups],
  )

  const foodGroupColumns: DataTableColumnDef<FoodGroupTableRow>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'appliesTo',
      header: 'Scope',
      cell: ({ row }) => row.original.appliesTo,
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
        const group = row.original.group
        return (
          <div className="flex min-w-max items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingGroupId(group._id)
                setGroupName(group.name)
                setGroupScope(
                  (group as { appliesTo: 'ingredient' | 'cookedFood' })
                    .appliesTo,
                )
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
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
              disabled={isRunning}
              aria-label={`Delete ${group.name}`}
              onClick={() =>
                confirmAndRunAction(
                  'Delete this group permanently?',
                  'Group deleted.',
                  async () => {
                    await deleteFoodGroup({ groupId: group._id })
                    if (editingGroupId === group._id) {
                      resetGroupForm()
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

  const ingredientRows = useMemo<IngredientTableRow[]>(
    () =>
      ingredients.map((ingredient) => ({
        id: ingredient._id,
        ingredient,
        name: ingredient.name,
        brand: ingredient.brand ?? '',
        kcalPer100: ingredient.kcalPer100,
        kcalBasisUnit: ingredient.kcalBasisUnit,
        ignoreCalories: ingredient.ignoreCalories,
        status: ingredient.archived ? 'Archived' : 'Active',
      })),
    [ingredients],
  )

  const ingredientColumns: DataTableColumnDef<IngredientTableRow>[] = [
    {
      accessorKey: 'name',
      header: 'Ingredient',
      cell: ({ row }) => (
        <div className="max-w-56 whitespace-normal">
          <p className="font-medium text-foreground">{row.original.name}</p>
          {row.original.brand ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.original.brand}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'kcalPer100',
      header: 'Energy basis',
      cell: ({ row }) =>
        `${formatKcalPer100(row.original.kcalPer100)} kcal / 100 ${row.original.kcalBasisUnit}`,
    },
    {
      accessorKey: 'ignoreCalories',
      header: 'Calories',
      cell: ({ row }) => (row.original.ignoreCalories ? 'Ignored' : 'Counted'),
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
        const ingredient = row.original.ingredient
        return (
          <div className="flex min-w-max items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditingIngredientId(ingredient._id)
                setIngredientName(ingredient.name)
                setIngredientBrand(ingredient.brand ?? '')
                setIngredientKcal(formatKcalPer100(ingredient.kcalPer100))
                setIngredientKcalBasisUnit(ingredient.kcalBasisUnit)
                setIngredientIgnoreCalories(ingredient.ignoreCalories)
                setIngredientGroupId(ingredient.groupId ?? '')
                setEditingIngredientGroup(
                  ingredient.groupId && ingredient.groupName
                    ? {
                        id: ingredient.groupId,
                        name: ingredient.groupName,
                        archived: ingredient.groupArchived ?? false,
                      }
                    : null,
                )
                setIngredientNotes(ingredient.notes ?? '')
              }}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
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
              disabled={isRunning}
              aria-label={`Delete ${ingredient.name}`}
              onClick={() =>
                confirmAndRunAction(
                  'Delete this ingredient permanently?',
                  'Ingredient deleted.',
                  async () => {
                    await deleteIngredient({ ingredientId: ingredient._id })
                    if (editingIngredientId === ingredient._id) {
                      resetIngredientForm()
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

  const recipeIngredientRows = useMemo<RecipeIngredientPickerRow[]>(
    () =>
      recipePickerIngredients.map((ingredient) => ({
        id: ingredient._id,
        name: ingredient.name,
        brand: ingredient.brand ?? '',
        kcalPer100: ingredient.kcalPer100,
        kcalBasisUnit: ingredient.kcalBasisUnit,
        ignoreCalories: ingredient.ignoreCalories,
      })),
    [recipePickerIngredients],
  )

  const recipeIngredientColumns: DataTableColumnDef<RecipeIngredientPickerRow>[] =
    [
      {
        id: 'name',
        accessorFn: (row) => `${row.name} ${row.brand}`.trim(),
        header: 'Ingredient',
        cell: ({ row }) => (
          <div className="max-w-56 whitespace-normal">
            <p className="font-medium text-foreground">{row.original.name}</p>
            {row.original.brand ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.original.brand}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'kcalPer100',
        header: 'Energy basis',
        cell: ({ row }) =>
          `${formatKcalPer100(row.original.kcalPer100)} kcal / 100 ${row.original.kcalBasisUnit}`,
      },
      {
        accessorKey: 'ignoreCalories',
        header: 'Calories',
        cell: ({ row }) =>
          row.original.ignoreCalories ? 'Ignored' : 'Counted',
      },
      {
        id: 'actions',
        header: () => <div className="text-right">Select</div>,
        cell: ({ row }) => {
          const isSelected = row.original.id === recipeLineIngredientId
          return (
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant={isSelected ? 'default' : 'outline'}
                onClick={() => setRecipeLineIngredientId(row.original.id)}
              >
                {isSelected ? 'Selected' : 'Use'}
              </Button>
            </div>
          )
        },
      },
    ]

  const recipeRows = useMemo<RecipeTableRow[]>(
    () =>
      recipes.map((recipe) => ({
        id: recipe._id,
        recipe,
        name: recipe.name,
        latestVersionNumber: recipe.latestVersionNumber,
        status: recipe.archived ? 'Archived' : 'Active',
      })),
    [recipes],
  )

  const recipeColumns: DataTableColumnDef<RecipeTableRow>[] = [
    {
      accessorKey: 'name',
      header: 'Recipe',
      cell: ({ row }) => (
        <div className="max-w-56 whitespace-normal">
          <p className="font-medium text-foreground">{row.original.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            v{row.original.latestVersionNumber}
          </p>
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
        const recipe = row.original.recipe
        return (
          <div className="flex min-w-max items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={editingRecipeId === recipe._id}
              onClick={() => {
                hydratedRecipeVersionRef.current = null
                setHydratedRecipeVersionId(null)
                setEditingRecipeId(recipe._id)
                setRecipeName(recipe.name)
                setRecipeInstructions('')
                setRecipeLineAmountDraftById({})
                setRecipeLineKcalDraftById({})
                setRecipeIngredientLines([])
              }}
            >
              {editingRecipeId === recipe._id
                ? recipeDetail === undefined
                  ? 'Loading...'
                  : 'Editing'
                : 'Edit'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isRunning}
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
              disabled={isRunning}
              aria-label={`Delete ${recipe.name}`}
              onClick={() =>
                confirmAndRunAction(
                  'Delete this recipe permanently?',
                  'Recipe deleted.',
                  async () => {
                    await deleteRecipe({ recipeId: recipe._id })
                    if (editingRecipeId === recipe._id) {
                      resetRecipeForm()
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

  const addRecipeIngredientLine = () => {
    const parsedAmount = Number(recipeLineAmount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return
    }

    if (recipeLineMode === 'ingredient') {
      if (!recipeLineIngredientId) {
        return
      }
      const selectedIngredient = ingredientById.get(recipeLineIngredientId)
      if (!selectedIngredient) {
        return
      }
      setRecipeIngredientLines((current) => [
        ...current,
        {
          draftId: createDraftId(),
          sourceType: 'ingredient',
          ingredientId: recipeLineIngredientId,
          name: selectedIngredient.name,
          kcalPer100: selectedIngredient.kcalPer100,
          kcalBasisUnit: selectedIngredient.kcalBasisUnit,
          ignoreCalories: selectedIngredient.ignoreCalories,
          referenceAmount: parsedAmount,
          referenceUnit: recipeLineUnit,
        },
      ])
      setRecipeLineIngredientId('')
      setRecipeLineAmount('')
      return
    }

    const parsedKcal = Number(recipeLineCustomKcal)
    if (!recipeLineCustomName.trim()) {
      return
    }
    if (
      !recipeLineCustomIgnoreCalories &&
      (!Number.isFinite(parsedKcal) || parsedKcal <= 0)
    ) {
      return
    }
    const kcalPer100 =
      recipeLineCustomIgnoreCalories &&
      (!Number.isFinite(parsedKcal) || parsedKcal < 0)
        ? 0
        : parsedKcal

    setRecipeIngredientLines((current) => [
      ...current,
      {
        draftId: createDraftId(),
        sourceType: 'custom',
        name: recipeLineCustomName.trim(),
        kcalPer100: kcalPer100,
        kcalBasisUnit: recipeLineCustomBasisUnit,
        ignoreCalories: recipeLineCustomIgnoreCalories,
        referenceAmount: parsedAmount,
        referenceUnit: recipeLineUnit,
        saveToCatalog: recipeLineCustomSaveToCatalog,
      },
    ])
    setRecipeLineCustomName('')
    setRecipeLineCustomKcal('')
    setRecipeLineCustomBasisUnit('g')
    setRecipeLineCustomIgnoreCalories(false)
    setRecipeLineCustomSaveToCatalog(true)
    setRecipeLineAmount('')
  }

  const removeRecipeIngredientLine = (draftId: string) => {
    setRecipeIngredientLines((current) =>
      current.filter((line) => line.draftId !== draftId),
    )
    setRecipeLineAmountDraftById((current) => {
      if (!(draftId in current)) {
        return current
      }
      const next = { ...current }
      delete next[draftId]
      return next
    })
    setRecipeLineKcalDraftById((current) => {
      if (!(draftId in current)) {
        return current
      }
      const next = { ...current }
      delete next[draftId]
      return next
    })
  }

  const updateRecipeIngredientLine = (
    draftId: string,
    updater: (line: RecipeIngredientDraft) => RecipeIngredientDraft,
  ) => {
    setRecipeIngredientLines((current) =>
      current.map((line) => (line.draftId === draftId ? updater(line) : line)),
    )
  }

  const updateCustomRecipeIngredientLine = (
    draftId: string,
    updater: (line: CustomRecipeIngredientDraft) => CustomRecipeIngredientDraft,
  ) => {
    updateRecipeIngredientLine(draftId, (line) =>
      line.sourceType === 'custom' ? updater(line) : line,
    )
  }

  const updateRecipeIngredientLineAmount = (
    draftId: string,
    nextAmount: number,
  ) => {
    updateRecipeIngredientLine(draftId, (line) => ({
      ...line,
      referenceAmount: nextAmount,
    }))
  }

  const updateRecipeIngredientLineUnit = (
    draftId: string,
    nextUnit: NutritionUnit,
  ) => {
    updateRecipeIngredientLine(draftId, (line) => ({
      ...line,
      referenceUnit: nextUnit,
    }))
  }

  const commitRecipeIngredientLineAmount = (draftId: string) => {
    const rawValue = recipeLineAmountDraftById[draftId]
    if (rawValue !== undefined) {
      const parsedAmount = Number(rawValue)
      if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
        updateRecipeIngredientLineAmount(draftId, parsedAmount)
      }
    }
    setRecipeLineAmountDraftById((current) => {
      if (!(draftId in current)) {
        return current
      }
      const next = { ...current }
      delete next[draftId]
      return next
    })
  }

  const commitRecipeIngredientLineKcal = (draftId: string) => {
    const rawValue = recipeLineKcalDraftById[draftId]
    if (rawValue !== undefined) {
      const parsedKcal = Number(rawValue)
      updateCustomRecipeIngredientLine(draftId, (line) => {
        if (line.ignoreCalories) {
          return {
            ...line,
            kcalPer100:
              Number.isFinite(parsedKcal) && parsedKcal >= 0 ? parsedKcal : 0,
          }
        }
        if (Number.isFinite(parsedKcal) && parsedKcal > 0) {
          return { ...line, kcalPer100: parsedKcal }
        }
        return line
      })
    }
    setRecipeLineKcalDraftById((current) => {
      if (!(draftId in current)) {
        return current
      }
      const next = { ...current }
      delete next[draftId]
      return next
    })
  }

  const recipeLineEditorColumns: DataTableColumnDef<RecipeIngredientDraft>[] = [
    {
      id: 'name',
      header: () => <div className="w-[220px]">Name</div>,
      cell: ({ row }) => {
        const line = row.original
        const label = line.name

        if (line.sourceType === 'custom') {
          return (
            <div className="w-[220px]">
              <Input
                aria-label={`${label || 'Custom ingredient'} name`}
                className="h-8 text-sm"
                placeholder="Ingredient"
                value={line.name}
                onChange={(event) =>
                  updateCustomRecipeIngredientLine(
                    line.draftId,
                    (customLine) => ({
                      ...customLine,
                      name: event.target.value,
                    }),
                  )
                }
              />
            </div>
          )
        }

        return (
          <div className="flex h-8 w-[220px] items-center truncate text-sm text-foreground">
            {label}
          </div>
        )
      },
    },
    {
      id: 'kcalPer100',
      header: () => <div className="w-[120px]">kcal/100</div>,
      cell: ({ row }) => {
        const line = row.original
        const label = line.name

        if (line.sourceType === 'custom') {
          return (
            <Input
              type="number"
              min={line.ignoreCalories ? '0' : '1'}
              step="1"
              aria-label={`${label || 'Custom ingredient'} kcal per 100`}
              placeholder="kcal/100"
              disabled={line.ignoreCalories}
              className="h-8 w-[120px]"
              value={
                recipeLineKcalDraftById[line.draftId] ??
                line.kcalPer100.toString()
              }
              onChange={(event) =>
                setRecipeLineKcalDraftById((current) => ({
                  ...current,
                  [line.draftId]: event.target.value,
                }))
              }
              onBlur={() => commitRecipeIngredientLineKcal(line.draftId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
            />
          )
        }

        return (
          <span className="block w-[120px] text-sm text-foreground">
            {line.ignoreCalories
              ? 'Ignored'
              : formatKcalPer100(line.kcalPer100)}
          </span>
        )
      },
    },
    {
      id: 'kcalBasisUnit',
      header: () => <div className="w-[130px]">kcal basis</div>,
      cell: ({ row }) => {
        const line = row.original
        if (line.sourceType === 'custom') {
          return (
            <Select
              ariaLabel={`${line.name || 'Custom ingredient'} kcal basis`}
              className="w-[130px]"
              value={line.kcalBasisUnit}
              onValueChange={(value) =>
                updateCustomRecipeIngredientLine(
                  line.draftId,
                  (customLine) => ({
                    ...customLine,
                    kcalBasisUnit: (value as NutritionUnit | null) ?? 'g',
                  }),
                )
              }
              options={NUTRITION_UNIT_OPTIONS}
            />
          )
        }
        return (
          <span className="block w-[130px] text-sm text-foreground">
            per 100 {line.kcalBasisUnit}
          </span>
        )
      },
    },
    {
      id: 'amount',
      header: () => <div className="w-[120px]">Amount</div>,
      cell: ({ row }) => {
        const line = row.original
        const label = line.name

        return (
          <Input
            type="number"
            min="0.01"
            step="0.01"
            aria-label={`${label} amount`}
            className="h-8 w-[120px]"
            value={
              recipeLineAmountDraftById[line.draftId] ??
              line.referenceAmount.toString()
            }
            onChange={(event) =>
              setRecipeLineAmountDraftById((current) => ({
                ...current,
                [line.draftId]: event.target.value,
              }))
            }
            onBlur={() => commitRecipeIngredientLineAmount(line.draftId)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
          />
        )
      },
    },
    {
      id: 'unit',
      header: () => <div className="w-[130px]">Unit</div>,
      cell: ({ row }) => {
        const line = row.original
        const label = line.name

        return (
          <Select
            ariaLabel={`${label} unit`}
            className="w-[130px]"
            value={line.referenceUnit}
            onValueChange={(value) =>
              updateRecipeIngredientLineUnit(
                line.draftId,
                (value as NutritionUnit | null) ?? 'g',
              )
            }
            options={NUTRITION_UNIT_OPTIONS}
          />
        )
      },
    },
    {
      id: 'ignore',
      header: () => <div className="w-[90px] text-center">Ignore</div>,
      cell: ({ row }) => {
        const line = row.original
        const label = line.name

        if (line.sourceType !== 'custom') {
          return (
            <span className="block w-[90px] text-center text-xs text-muted-foreground">
              -
            </span>
          )
        }

        return (
          <div className="flex w-[90px] justify-center">
            <Switch
              size="sm"
              aria-label={`${label || 'Custom ingredient'} ignore calories`}
              checked={line.ignoreCalories}
              onCheckedChange={(checked) =>
                updateCustomRecipeIngredientLine(
                  line.draftId,
                  (customLine) => ({
                    ...customLine,
                    ignoreCalories: Boolean(checked),
                  }),
                )
              }
            />
          </div>
        )
      },
    },
    {
      id: 'save',
      header: () => <div className="w-[90px] text-center">Save</div>,
      cell: ({ row }) => {
        const line = row.original
        const label = line.name

        if (line.sourceType !== 'custom') {
          return (
            <span className="block w-[90px] text-center text-xs text-muted-foreground">
              -
            </span>
          )
        }

        return (
          <div className="flex w-[90px] justify-center">
            <Switch
              size="sm"
              aria-label={`${label || 'Custom ingredient'} save to ingredient catalog`}
              checked={line.saveToCatalog}
              onCheckedChange={(checked) =>
                updateCustomRecipeIngredientLine(
                  line.draftId,
                  (customLine) => ({
                    ...customLine,
                    saveToCatalog: Boolean(checked),
                  }),
                )
              }
            />
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: () => <div className="w-[120px] text-right">Action</div>,
      cell: ({ row }) => (
        <div className="flex w-[120px] justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => removeRecipeIngredientLine(row.original.draftId)}
          >
            Remove
          </Button>
        </div>
      ),
    },
  ]

  if (catalogData.isLoading) {
    return (
      <LoadingSkeletonState
        title="Catalog"
        icon={<BookOpenText className="h-4 w-4" />}
      >
        <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1 h-3 w-48" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1 h-3 w-48" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
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
        title="Catalog"
        icon={<BookOpenText className="h-4 w-4" />}
        maxWidth="7xl"
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
      >
        <Tabs defaultValue="ingredients" className="mt-5">
          <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden sm:w-fit">
            <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
            <TabsTrigger value="recipes">Recipes</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
          </TabsList>

          <TabsContent value="ingredients" className="mt-4">
            <div className="grid grid-cols-1 gap-6">
              <IngredientsSection>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label="Ingredient name"
                    placeholder="Ingredient name"
                    value={ingredientName}
                    onChange={(event) => setIngredientName(event.target.value)}
                  />
                  <Input
                    aria-label="Ingredient brand"
                    placeholder="Brand"
                    value={ingredientBrand}
                    onChange={(event) => setIngredientBrand(event.target.value)}
                  />
                  <Input
                    type="number"
                    aria-label="Ingredient kcal per 100"
                    placeholder="kcal / 100 basis units"
                    value={ingredientKcal}
                    onChange={(event) => setIngredientKcal(event.target.value)}
                  />
                  <Select
                    ariaLabel="Ingredient kcal basis"
                    value={ingredientKcalBasisUnit}
                    onValueChange={(value) =>
                      setIngredientKcalBasisUnit(
                        (value as NutritionUnit | null) ?? 'g',
                      )
                    }
                    options={NUTRITION_UNIT_OPTIONS}
                  />
                  <Select
                    ariaLabel="Ingredient group"
                    value={ingredientGroupId}
                    onValueChange={(value) =>
                      setIngredientGroupId(
                        (value as Id<'foodGroups'> | '' | null) ?? '',
                      )
                    }
                    placeholder="Group (optional)"
                    options={[
                      { value: '', label: 'No group' },
                      ...ingredientGroupOptions,
                    ]}
                  />
                  <label className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm">
                    Ignore calories
                    <Switch
                      checked={ingredientIgnoreCalories}
                      onCheckedChange={(checked) =>
                        setIngredientIgnoreCalories(Boolean(checked))
                      }
                    />
                  </label>
                </div>
                <Textarea
                  aria-label="Ingredient notes"
                  placeholder="Notes"
                  value={ingredientNotes}
                  onChange={(event) => setIngredientNotes(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={isRunning}
                    onClick={() =>
                      void runAction(
                        editingIngredientId
                          ? 'Ingredient updated.'
                          : 'Ingredient created.',
                        async () => {
                          const payload = {
                            name: ingredientName,
                            brand: ingredientBrand.trim() || undefined,
                            kcalPer100: Number(ingredientKcal),
                            kcalBasisUnit: ingredientKcalBasisUnit,
                            ignoreCalories: ingredientIgnoreCalories,
                            groupId: ingredientGroupId || undefined,
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

                <Input
                  aria-label="Search ingredients"
                  className="w-full sm:max-w-xs"
                  maxLength={SEARCH_MAX_LENGTH}
                  placeholder="Search ingredients"
                  value={ingredientSearch}
                  onChange={(event) => setIngredientSearch(event.target.value)}
                />
                <DataTable
                  columns={ingredientColumns}
                  data={ingredientRows}
                  emptyText={
                    catalogData.search.ingredients.isLoading
                      ? 'Searching ingredients...'
                      : 'No ingredients found.'
                  }
                />
                {!catalogData.search.ingredients.active &&
                catalogData.paging.ingredients.canLoadMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={catalogData.paging.ingredients.isLoadingMore}
                    onClick={catalogData.paging.ingredients.loadMore}
                  >
                    {catalogData.paging.ingredients.isLoadingMore
                      ? 'Loading ingredients...'
                      : 'Load more ingredients'}
                  </Button>
                ) : null}
              </IngredientsSection>
            </div>
          </TabsContent>

          <TabsContent value="recipes" className="mt-4">
            <div className="grid grid-cols-1 gap-3">
              <RecipesSection>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    aria-label="Recipe name"
                    placeholder="Recipe name"
                    value={recipeName}
                    onChange={(event) => setRecipeName(event.target.value)}
                  />
                </div>
                <Textarea
                  aria-label="Recipe instructions"
                  placeholder="Instructions"
                  value={recipeInstructions}
                  onChange={(event) =>
                    setRecipeInstructions(event.target.value)
                  }
                />

                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium text-foreground">
                    Add ingredient line
                  </p>
                  <IngredientLineModeToggle
                    value={recipeLineMode}
                    onValueChange={setRecipeLineMode}
                  />
                </div>

                {recipeLineMode === 'ingredient' ? (
                  <div className="space-y-3">
                    <Input
                      aria-label="Search recipe ingredients"
                      className="w-full sm:max-w-xs"
                      maxLength={SEARCH_MAX_LENGTH}
                      placeholder="Search ingredients by name"
                      value={recipeIngredientSearch}
                      onChange={(event) =>
                        setRecipeIngredientSearch(event.target.value)
                      }
                    />
                    <DataTable
                      columns={recipeIngredientColumns}
                      data={recipeIngredientRows}
                      emptyText={
                        catalogData.search.recipeIngredients.isLoading
                          ? 'Searching ingredients...'
                          : 'No ingredients found.'
                      }
                    />
                    {!catalogData.search.recipeIngredients.active &&
                    catalogData.paging.recipeIngredients.canLoadMore ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          catalogData.paging.recipeIngredients.isLoadingMore
                        }
                        onClick={catalogData.paging.recipeIngredients.loadMore}
                      >
                        {catalogData.paging.recipeIngredients.isLoadingMore
                          ? 'Loading ingredients...'
                          : 'Load more recipe ingredients'}
                      </Button>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-[1.6fr_1fr_1fr_auto]">
                      <Input
                        aria-label="Selected recipe ingredient"
                        value={
                          recipeLineIngredientId
                            ? selectedRecipeLineIngredient
                              ? `${selectedRecipeLineIngredient.name} · ${formatKcalPer100(selectedRecipeLineIngredient.kcalPer100)} kcal / 100 ${selectedRecipeLineIngredient.kcalBasisUnit}`
                              : 'Unknown ingredient'
                            : ''
                        }
                        placeholder="Select ingredient from table"
                        readOnly
                      />
                      <Input
                        type="number"
                        aria-label="Recipe reference amount"
                        placeholder="Amount"
                        value={recipeLineAmount}
                        onChange={(event) =>
                          setRecipeLineAmount(event.target.value)
                        }
                      />
                      <Select
                        ariaLabel="Recipe reference unit"
                        value={recipeLineUnit}
                        onValueChange={(value) =>
                          setRecipeLineUnit(
                            (value as NutritionUnit | null) ?? 'g',
                          )
                        }
                        options={NUTRITION_UNIT_OPTIONS}
                      />
                      <Button
                        variant="outline"
                        onClick={addRecipeIngredientLine}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`grid gap-3 ${
                      recipeLineCustomIgnoreCalories
                        ? 'sm:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_auto]'
                        : 'sm:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.7fr_auto]'
                    }`}
                  >
                    <Input
                      aria-label="Recipe custom ingredient name"
                      placeholder="Ingredient"
                      value={recipeLineCustomName}
                      onChange={(event) =>
                        setRecipeLineCustomName(event.target.value)
                      }
                    />
                    {recipeLineCustomIgnoreCalories ? null : (
                      <Input
                        type="number"
                        aria-label="Recipe custom kcal per 100"
                        placeholder="kcal/100"
                        value={recipeLineCustomKcal}
                        onChange={(event) =>
                          setRecipeLineCustomKcal(event.target.value)
                        }
                      />
                    )}
                    <Select
                      ariaLabel="Recipe custom kcal basis"
                      value={recipeLineCustomBasisUnit}
                      onValueChange={(value) =>
                        setRecipeLineCustomBasisUnit(
                          (value as NutritionUnit | null) ?? 'g',
                        )
                      }
                      options={NUTRITION_UNIT_OPTIONS}
                    />
                    <Input
                      type="number"
                      aria-label="Recipe custom reference amount"
                      placeholder="Amount"
                      value={recipeLineAmount}
                      onChange={(event) =>
                        setRecipeLineAmount(event.target.value)
                      }
                    />
                    <Select
                      ariaLabel="Recipe custom reference unit"
                      value={recipeLineUnit}
                      onValueChange={(value) =>
                        setRecipeLineUnit(
                          (value as NutritionUnit | null) ?? 'g',
                        )
                      }
                      options={NUTRITION_UNIT_OPTIONS}
                    />
                    <Button variant="outline" onClick={addRecipeIngredientLine}>
                      Add
                    </Button>
                    <CustomIngredientSwitchRow
                      ignoreCalories={recipeLineCustomIgnoreCalories}
                      onIgnoreCaloriesChange={setRecipeLineCustomIgnoreCalories}
                      saveToCatalog={recipeLineCustomSaveToCatalog}
                      onSaveToCatalogChange={setRecipeLineCustomSaveToCatalog}
                    />
                  </div>
                )}

                <div className="rounded-md border border-border/60 bg-muted/35 p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-foreground">
                      Recipe ingredients
                    </p>
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
                    <DataTable
                      columns={recipeLineEditorColumns}
                      data={recipeIngredientLines}
                      emptyText="Add at least one ingredient line."
                      className="[&_[data-slot=table]]:min-w-[1110px] [&_[data-slot=table]]:table-auto"
                    />
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={isRunning || !isEditingRecipeHydrated}
                    onClick={() =>
                      void runAction(
                        editingRecipeId ? 'Recipe updated.' : 'Recipe created.',
                        async () => {
                          const ingredientLines = recipeIngredientLines.map(
                            (line) =>
                              line.sourceType === 'ingredient'
                                ? {
                                    sourceType: 'ingredient' as const,
                                    ingredientId: line.ingredientId,
                                    referenceAmount: line.referenceAmount,
                                    referenceUnit: line.referenceUnit,
                                    notes: line.notes,
                                  }
                                : {
                                    sourceType: 'custom' as const,
                                    ingredientId: line.ingredientId,
                                    name: line.name,
                                    kcalPer100: line.kcalPer100,
                                    kcalBasisUnit: line.kcalBasisUnit,
                                    ignoreCalories: line.ignoreCalories,
                                    referenceAmount: line.referenceAmount,
                                    referenceUnit: line.referenceUnit,
                                    saveToCatalog: line.saveToCatalog,
                                    notes: line.notes,
                                  },
                          )
                          if (editingRecipeId) {
                            await updateRecipeCurrentVersion({
                              recipeId: editingRecipeId,
                              name: recipeName,
                              instructions: recipeInstructions.trim() || null,
                              ingredientLines,
                            })
                          } else {
                            await createRecipe({
                              name: recipeName,
                              instructions:
                                recipeInstructions.trim() || undefined,
                              ingredientLines,
                            })
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

                <Input
                  aria-label="Search recipes"
                  className="w-full sm:max-w-xs"
                  maxLength={SEARCH_MAX_LENGTH}
                  placeholder="Search recipes"
                  value={recipeSearch}
                  onChange={(event) => setRecipeSearch(event.target.value)}
                />
                <DataTable
                  columns={recipeColumns}
                  data={recipeRows}
                  emptyText={
                    catalogData.search.recipes.isLoading
                      ? 'Searching recipes...'
                      : 'No recipes found.'
                  }
                />
                {!catalogData.search.recipes.active &&
                catalogData.paging.recipes.canLoadMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={catalogData.paging.recipes.isLoadingMore}
                    onClick={catalogData.paging.recipes.loadMore}
                  >
                    {catalogData.paging.recipes.isLoadingMore
                      ? 'Loading recipes...'
                      : 'Load more recipes'}
                  </Button>
                ) : null}
              </RecipesSection>
            </div>
          </TabsContent>

          <TabsContent value="groups" className="mt-4">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <FoodGroupsSection>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Input
                    aria-label="Group name"
                    placeholder="Group name"
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                  />
                  <Select
                    ariaLabel="Group scope"
                    value={groupScope}
                    onValueChange={(value) =>
                      setGroupScope(
                        (value as 'ingredient' | 'cookedFood' | null) ??
                          'ingredient',
                      )
                    }
                    options={[
                      { value: 'ingredient', label: 'Ingredient only' },
                      { value: 'cookedFood', label: 'Cooked food only' },
                    ]}
                  />
                  <Button
                    disabled={isRunning}
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
                    {editingGroupId ? 'Save group' : 'Create group'}
                  </Button>
                </div>
                <Input
                  aria-label="Search food groups"
                  className="w-full sm:max-w-xs"
                  maxLength={SEARCH_MAX_LENGTH}
                  placeholder="Search food groups"
                  value={foodGroupSearch}
                  onChange={(event) => setFoodGroupSearch(event.target.value)}
                />
                <DataTable
                  columns={foodGroupColumns}
                  data={foodGroupRows}
                  emptyText={
                    catalogData.search.foodGroups.isLoading ? (
                      'Searching food groups...'
                    ) : (
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          No food groups yet.
                        </p>
                        <p className="text-sm">
                          Groups are optional; add them when filtering becomes
                          useful.
                        </p>
                      </div>
                    )
                  }
                />
                {!catalogData.search.foodGroups.active &&
                catalogData.paging.foodGroups.canLoadMore ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={catalogData.paging.foodGroups.isLoadingMore}
                    onClick={catalogData.paging.foodGroups.loadMore}
                  >
                    {catalogData.paging.foodGroups.isLoadingMore
                      ? 'Loading food groups...'
                      : 'Load more food groups'}
                  </Button>
                ) : null}
              </FoodGroupsSection>
            </div>
          </TabsContent>
        </Tabs>
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
