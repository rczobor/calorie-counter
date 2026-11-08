import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery } from '@/features/households/convex-hooks'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { EditorDialog } from '@/components/page/editor-dialog'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { LoadingRows } from '@/components/page/loading-content'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { PageShell } from '@/components/page/page-shell'
import { ConfigMissingState } from '@/components/page/page-states'
import { Field, UnitInput } from '@/components/list/field'
import { ListToolbar, LoadMoreButton } from '@/components/list/list-toolbar'
import {
  RecordList,
  RecordRow,
  RowRemoveButton,
} from '@/components/list/record-list'
import { SearchField } from '@/components/list/search-field'
import { ArchiveActions, SheetFooter } from '@/components/list/sheet-footer'
import { isConvexConfigured } from '@/integrations/convex/config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  CustomIngredientSwitchRow,
  IngredientLineModeToggle,
} from '@/components/nutrition/ingredient-line-controls'
import { FoodGroupsSection } from '@/features/manage/food-groups'
import { IngredientsSection } from '@/features/manage/ingredients'
import { RecipesSection } from '@/features/manage/recipes'
import { SavedFoods } from '@/features/manage/saved-foods'
import { MealTemplates } from '@/features/manage/meal-templates'
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

const GROUP_SCOPE_LABEL = {
  ingredient: 'Ingredients',
  cookedFood: 'Cooked foods',
} as const

const INGREDIENT_SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'kcal-desc', label: 'Most kcal' },
  { value: 'kcal-asc', label: 'Fewest kcal' },
] as const
type IngredientSort = (typeof INGREDIENT_SORT_OPTIONS)[number]['value']

type ExistingRecipeIngredientDraft = {
  draftId: string
  sourceType: 'ingredient'
  existingRecipeVersionIngredientId?: Id<'recipeVersionIngredients'>
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
  existingRecipeVersionIngredientId?: Id<'recipeVersionIngredients'>
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

/**
 * Five sections don't fit one segmented row on a phone, so the library drills
 * down: a list of sections, each its own page at `?section=…`.
 */
const LIBRARY_SECTIONS = [
  {
    id: 'foods',
    title: 'Reusable foods',
    description: 'Foods saved from logged meals',
  },
  {
    id: 'templates',
    title: 'Meal templates',
    description: 'Saved meals to log again',
  },
  {
    id: 'ingredients',
    title: 'Ingredients',
    description: 'Foods with calories per 100 g or ml',
  },
  {
    id: 'recipes',
    title: 'Recipes',
    description: 'Dishes made from ingredients',
  },
  {
    id: 'groups',
    title: 'Groups',
    description: 'Categories for ingredients and cooked foods',
  },
] as const

type LibrarySection = (typeof LIBRARY_SECTIONS)[number]

export const Route = createFileRoute('/catalog')({
  ssr: false,
  // An unknown section falls back to the section list.
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: LibrarySection['id'] } => {
    const section = LIBRARY_SECTIONS.find(({ id }) => id === search.section)
    return section ? { section: section.id } : {}
  },
  component: ManagePage,
})

function ManagePage() {
  const { section: sectionId } = Route.useSearch()
  const section = LIBRARY_SECTIONS.find(({ id }) => id === sectionId)
  if (!isConvexConfigured) {
    return <ConfigMissingState />
  }
  if (!section) return <LibrarySections />

  // Keyed, so each section opens with fresh search, sheets and filters.
  return <ManagePageContent key={section.id} section={section} />
}

function LibrarySections() {
  return (
    <PageShell
      title="Food library"
      breadcrumbs={<SettingsBreadcrumbs current="Food library" />}
      contentClassName="max-w-3xl"
    >
      <ul
        aria-label="Food library sections"
        className="mt-6 inset-group inset-rows"
      >
        {LIBRARY_SECTIONS.map((section) => (
          <li key={section.id}>
            {/* Named by the section alone; the description is its hint. */}
            <Link
              to="/catalog"
              search={{ section: section.id }}
              aria-labelledby={`library-${section.id}`}
              aria-describedby={`library-${section.id}-description`}
              className={LIST_ROW_CLASS}
            >
              <span className="min-w-0 flex-1">
                <span id={`library-${section.id}`} className="block">
                  {section.title}
                </span>
                <span
                  id={`library-${section.id}-description`}
                  className="mt-0.5 block type-footnote text-muted-foreground"
                >
                  {section.description}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  )
}

/** An ingredient's rate as a list row says it: the figure leads in plain
 * kcal, and its basis ("per 100 g") joins the subtitle, so a name never
 * wraps beside a long unit. */
function ingredientEnergy(ingredient: {
  kcalPer100: number
  kcalBasisUnit: NutritionUnit
}) {
  return {
    value: formatKcalPer100(ingredient.kcalPer100),
    basis: `per 100 ${ingredient.kcalBasisUnit}`,
  }
}

function ManagePageContent({ section }: { section: LibrarySection }) {
  const activeTab = section.id
  const [ingredientEditorOpen, setIngredientEditorOpen] = useState(false)
  const [recipeEditorOpen, setRecipeEditorOpen] = useState(false)
  const [groupEditorOpen, setGroupEditorOpen] = useState(false)
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
  const [editingGroupRevision, setEditingGroupRevision] = useState<
    number | null
  >(null)
  const [groupScope, setGroupScope] = useState<'ingredient' | 'cookedFood'>(
    'ingredient',
  )

  const [editingIngredientId, setEditingIngredientId] =
    useState<Id<'ingredients'> | null>(null)
  const [editingIngredientRevision, setEditingIngredientRevision] = useState<
    number | null
  >(null)
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
  const [recipeIngredientCache, setRecipeIngredientCache] = useState(
    () => new Map<Id<'ingredients'>, CatalogIngredient>(),
  )
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
    activeTab,
    editorOpen:
      activeTab === 'ingredients' ? ingredientEditorOpen : recipeEditorOpen,
  })

  const recipeDetail = useQuery(
    api.recipes.getCurrent,
    editingRecipeId ? { recipeId: editingRecipeId } : 'skip',
  )
  const [hydratedRecipeVersionId, setHydratedRecipeVersionId] =
    useState<Id<'recipeVersions'> | null>(null)
  const hydratedRecipeEditRevisionRef = useRef<number | null>(null)
  const [recipeVersionConflict, setRecipeVersionConflict] = useState(false)
  const hydratedRecipeVersionRef = useRef<Id<'recipeVersions'> | null>(null)
  const isEditingRecipeHydrated =
    !editingRecipeId ||
    (recipeDetail?.recipe._id === editingRecipeId &&
      hydratedRecipeVersionId !== null)

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
        [
          ...ingredients,
          ...recipePickerIngredients,
          ...recipeIngredientCache.values(),
        ].map((item) => [item._id, item]),
      ),
    [ingredients, recipeIngredientCache, recipePickerIngredients],
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
    setGroupEditorOpen(false)
    setEditingGroupId(null)
    setEditingGroupRevision(null)
    setGroupName('')
    setGroupScope('ingredient')
  }

  const resetIngredientForm = () => {
    setIngredientEditorOpen(false)
    setEditingIngredientId(null)
    setEditingIngredientRevision(null)
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
    setRecipeEditorOpen(false)
    setEditingRecipeId(null)
    hydratedRecipeVersionRef.current = null
    hydratedRecipeEditRevisionRef.current = null
    setHydratedRecipeVersionId(null)
    setRecipeVersionConflict(false)
    setRecipeName('')
    setRecipeInstructions('')
    setRecipeLineMode('ingredient')
    setRecipeLineIngredientId('')
    setRecipeIngredientCache(new Map())
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
      hydratedRecipeVersionRef.current !== null
    ) {
      if (
        editingRecipeId &&
        recipeDetail?.recipe._id === editingRecipeId &&
        hydratedRecipeVersionRef.current !== null &&
        (hydratedRecipeVersionRef.current !== recipeDetail.version._id ||
          hydratedRecipeEditRevisionRef.current !==
            recipeDetail.recipe.editRevision)
      ) {
        setRecipeVersionConflict(true)
      }
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
            existingRecipeVersionIngredientId: line._id,
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
          existingRecipeVersionIngredientId: line._id,
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
    hydratedRecipeEditRevisionRef.current = recipeDetail.recipe.editRevision
    setHydratedRecipeVersionId(recipeDetail.version._id)
    setRecipeVersionConflict(false)
  }, [editingRecipeId, recipeDetail])

  const [ingredientSort, setIngredientSort] = useState<IngredientSort>('name')
  const sortedIngredients = useMemo(() => {
    if (ingredientSort === 'name') return ingredients
    const direction = ingredientSort === 'kcal-desc' ? -1 : 1
    return [...ingredients].sort(
      (a, b) =>
        direction * (a.kcalPer100 - b.kcalPer100) ||
        a.name.localeCompare(b.name),
    )
  }, [ingredients, ingredientSort])

  // Footer actions use the live record, so Archive and Delete send its
  // current revision, as the row buttons did.
  const editingGroup = groups.find((group) => group._id === editingGroupId)
  const editingIngredient = ingredients.find(
    (ingredient) => ingredient._id === editingIngredientId,
  )
  const editingRecipe = recipes.find((recipe) => recipe._id === editingRecipeId)

  const openGroup = (group: CatalogFoodGroup) => {
    setGroupEditorOpen(true)
    setEditingGroupId(group._id)
    setEditingGroupRevision(group.editRevision)
    setGroupName(group.name)
    setGroupScope(group.appliesTo)
  }

  const openNewGroup = () => {
    resetGroupForm()
    setGroupEditorOpen(true)
  }

  const openIngredient = (ingredient: CatalogIngredient) => {
    setIngredientEditorOpen(true)
    setEditingIngredientId(ingredient._id)
    setEditingIngredientRevision(ingredient.editRevision)
    setIngredientName(ingredient.name)
    setIngredientBrand(ingredient.brand ?? '')
    setIngredientKcal(String(ingredient.kcalPer100))
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
  }

  const openNewIngredient = () => {
    resetIngredientForm()
    setIngredientEditorOpen(true)
  }

  const openRecipe = (recipe: CatalogRecipe) => {
    hydratedRecipeVersionRef.current = null
    hydratedRecipeEditRevisionRef.current = null
    setHydratedRecipeVersionId(null)
    setRecipeEditorOpen(true)
    setEditingRecipeId(recipe._id)
    setRecipeName(recipe.name)
    setRecipeInstructions('')
    setRecipeLineAmountDraftById({})
    setRecipeLineKcalDraftById({})
    setRecipeIngredientLines([])
  }

  const openNewRecipe = () => {
    resetRecipeForm()
    setRecipeEditorOpen(true)
  }

  const saveGroup = () =>
    void runAction(
      editingGroupId ? 'Group updated.' : 'Group created.',
      async () => {
        if (editingGroupId) {
          await updateFoodGroup({
            groupId: editingGroupId,
            expectedEditRevision: editingGroupRevision ?? 0,
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

  const saveIngredient = () =>
    void runAction(
      editingIngredientId ? 'Ingredient updated.' : 'Ingredient created.',
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
            expectedEditRevision: editingIngredientRevision ?? 0,
            ...payload,
          })
        } else {
          await createIngredient(payload)
        }
        resetIngredientForm()
      },
    )

  const saveRecipe = () =>
    void runAction(
      editingRecipeId ? 'Recipe updated.' : 'Recipe created.',
      async () => {
        const ingredientLines = recipeIngredientLines.map((line) =>
          line.sourceType === 'ingredient'
            ? {
                sourceType: 'ingredient' as const,
                ...(line.existingRecipeVersionIngredientId
                  ? {
                      existingRecipeVersionIngredientId:
                        line.existingRecipeVersionIngredientId,
                    }
                  : {
                      expectedSnapshot: {
                        name: line.name,
                        kcalPer100: line.kcalPer100,
                        kcalBasisUnit: line.kcalBasisUnit,
                        ignoreCalories: line.ignoreCalories,
                      },
                    }),
                ingredientId: line.ingredientId,
                referenceAmount: line.referenceAmount,
                referenceUnit: line.referenceUnit,
                notes: line.notes,
              }
            : {
                sourceType: 'custom' as const,
                ...(line.existingRecipeVersionIngredientId
                  ? {
                      existingRecipeVersionIngredientId:
                        line.existingRecipeVersionIngredientId,
                    }
                  : {}),
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
          if (!hydratedRecipeVersionId) {
            return
          }
          await updateRecipeCurrentVersion({
            recipeId: editingRecipeId,
            expectedEditRevision: hydratedRecipeEditRevisionRef.current ?? 0,
            expectedRecipeVersionId: hydratedRecipeVersionId,
            name: recipeName,
            instructions: recipeInstructions.trim() || null,
            ingredientLines,
          })
        } else {
          await createRecipe({
            name: recipeName,
            instructions: recipeInstructions.trim() || undefined,
            ingredientLines,
          })
        }
        resetRecipeForm()
      },
    )

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

  const commitRecipeIngredientLineAmount = (draftId: string) => {
    const rawValue = recipeLineAmountDraftById[draftId]
    if (rawValue !== undefined) {
      const parsedAmount = Number(rawValue)
      if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
        updateRecipeIngredientLine(draftId, (line) => ({
          ...line,
          referenceAmount: parsedAmount,
        }))
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

  const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    }
  }

  const archivedToggle = {
    checked: showArchived,
    onCheckedChange: setShowArchived,
  }

  // One dialog instance, rendered inside whichever sheet is open so it stacks
  // above that sheet's focus trap.
  const confirmDialog = (
    <ConfirmDestructiveDialog
      open={isConfirmDialogOpen}
      onOpenChange={handleConfirmDialogOpenChange}
      onConfirm={confirmPendingAction}
      disabled={isRunning}
      description={pendingConfirmation?.message}
    />
  )

  return (
    <PageShell
      title={section.title}
      breadcrumbs={
        <SettingsBreadcrumbs
          current={section.title}
          parent={{ label: 'Food library', link: <Link to="/catalog" /> }}
        />
      }
      contentClassName="max-w-3xl"
    >
      <div className="mt-4">
        {activeTab === 'foods' ? (
          <SavedFoods
            showArchived={showArchived}
            onShowArchivedChange={setShowArchived}
          />
        ) : null}

        {activeTab === 'templates' ? <MealTemplates /> : null}

        {activeTab === 'ingredients' ? (
          <IngredientsSection>
            <ListToolbar
              search={{
                label: 'Search ingredients',
                maxLength: SEARCH_MAX_LENGTH,
                value: ingredientSearch,
                onValueChange: setIngredientSearch,
              }}
              sort={{
                label: 'Sort ingredients',
                value: ingredientSort,
                options: [...INGREDIENT_SORT_OPTIONS],
                onValueChange: setIngredientSort,
              }}
              create={{
                noun: 'ingredient',
                disabled: isRunning,
                onClick: openNewIngredient,
              }}
              archived={archivedToggle}
            />
            <RecordList
              label="Ingredients"
              loading={
                catalogData.isLoading ||
                catalogData.search.ingredients.isLoading
              }
              empty="No ingredients found."
            >
              {sortedIngredients.map((ingredient) => {
                const energy = ingredientEnergy(ingredient)
                return (
                  <RecordRow
                    key={ingredient._id}
                    verb="Edit"
                    title={ingredient.name}
                    // An excluded ingredient says so first, beside its kcal.
                    detail={[
                      ingredient.ignoreCalories ? 'Not counted' : '',
                      ingredient.brand,
                      ingredient.groupName,
                      energy.basis,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    value={energy.value}
                    archived={ingredient.archived}
                    disabled={isRunning}
                    onOpen={() => openIngredient(ingredient)}
                  />
                )
              })}
            </RecordList>
            {!catalogData.search.ingredients.active &&
            catalogData.paging.ingredients.canLoadMore ? (
              <LoadMoreButton
                loading={catalogData.paging.ingredients.isLoadingMore}
                onClick={catalogData.paging.ingredients.loadMore}
              >
                Load more ingredients
              </LoadMoreButton>
            ) : null}
          </IngredientsSection>
        ) : null}

        {activeTab === 'recipes' ? (
          <RecipesSection>
            <ListToolbar
              search={{
                label: 'Search recipes',
                maxLength: SEARCH_MAX_LENGTH,
                value: recipeSearch,
                onValueChange: setRecipeSearch,
              }}
              create={{
                noun: 'recipe',
                disabled: isRunning,
                onClick: openNewRecipe,
              }}
              archived={archivedToggle}
            />
            <RecordList
              label="Recipes"
              loading={
                catalogData.isLoading || catalogData.search.recipes.isLoading
              }
              empty="No recipes found."
            >
              {recipes.map((recipe) => (
                <RecordRow
                  key={recipe._id}
                  verb="Edit"
                  title={recipe.name}
                  detail={`Version ${recipe.latestVersionNumber}`}
                  archived={recipe.archived}
                  disabled={isRunning}
                  onOpen={() => openRecipe(recipe)}
                />
              ))}
            </RecordList>
            {!catalogData.search.recipes.active &&
            catalogData.paging.recipes.canLoadMore ? (
              <LoadMoreButton
                loading={catalogData.paging.recipes.isLoadingMore}
                onClick={catalogData.paging.recipes.loadMore}
              >
                Load more recipes
              </LoadMoreButton>
            ) : null}
          </RecipesSection>
        ) : null}

        {activeTab === 'groups' ? (
          <FoodGroupsSection>
            <ListToolbar
              search={{
                label: 'Search food groups',
                maxLength: SEARCH_MAX_LENGTH,
                value: foodGroupSearch,
                onValueChange: setFoodGroupSearch,
              }}
              create={{
                noun: 'group',
                disabled: isRunning,
                onClick: openNewGroup,
              }}
              archived={archivedToggle}
            />
            <RecordList
              label="Food groups"
              loading={
                catalogData.isLoading || catalogData.search.foodGroups.isLoading
              }
              empty={
                <>
                  <p className="font-medium text-foreground">
                    No food groups yet.
                  </p>
                  <p>Groups are optional. Add them when filtering helps.</p>
                </>
              }
            >
              {groups.map((group) => (
                <RecordRow
                  key={group._id}
                  verb="Edit"
                  title={group.name}
                  detail={GROUP_SCOPE_LABEL[group.appliesTo]}
                  archived={group.archived}
                  disabled={isRunning}
                  onOpen={() => openGroup(group)}
                />
              ))}
            </RecordList>
            {!catalogData.search.foodGroups.active &&
            catalogData.paging.foodGroups.canLoadMore ? (
              <LoadMoreButton
                loading={catalogData.paging.foodGroups.isLoadingMore}
                onClick={catalogData.paging.foodGroups.loadMore}
              >
                Load more food groups
              </LoadMoreButton>
            ) : null}
          </FoodGroupsSection>
        ) : null}
      </div>

      {ingredientEditorOpen ? (
        <EditorDialog
          title={editingIngredientId ? 'Edit ingredient' : 'New ingredient'}
          description="Changes are saved only when you choose Save."
          pending={isRunning}
          onClose={resetIngredientForm}
        >
          <form
            className="flex flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              saveIngredient()
            }}
          >
            <fieldset className="min-w-0 space-y-4 pb-5" disabled={isRunning}>
              <Field label="Name" htmlFor="ingredient-name">
                <Input
                  id="ingredient-name"
                  aria-label="Ingredient name"
                  value={ingredientName}
                  onChange={(event) => setIngredientName(event.target.value)}
                />
              </Field>
              <Field label="Brand" htmlFor="ingredient-brand">
                <Input
                  id="ingredient-brand"
                  aria-label="Ingredient brand"
                  placeholder="Optional"
                  value={ingredientBrand}
                  onChange={(event) => setIngredientBrand(event.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Calories" htmlFor="ingredient-kcal">
                  <UnitInput
                    id="ingredient-kcal"
                    unit="kcal"
                    aria-label="Ingredient kcal per 100"
                    value={ingredientKcal}
                    onChange={(event) => setIngredientKcal(event.target.value)}
                  />
                </Field>
                <Field label="Per 100">
                  <Select
                    ariaLabel="Ingredient kcal basis"
                    className="w-full"
                    value={ingredientKcalBasisUnit}
                    onValueChange={(value) =>
                      setIngredientKcalBasisUnit(
                        (value as NutritionUnit | null) ?? 'g',
                      )
                    }
                    options={NUTRITION_UNIT_OPTIONS}
                  />
                </Field>
              </div>
              <Field label="Group">
                <Select
                  ariaLabel="Ingredient group"
                  className="w-full"
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
                {catalogData.paging.foodGroups.canLoadMore ||
                catalogData.paging.foodGroups.isLoadingMore ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={catalogData.paging.foodGroups.isLoadingMore}
                    aria-busy={catalogData.paging.foodGroups.isLoadingMore}
                    onClick={catalogData.paging.foodGroups.loadMore}
                  >
                    Load more ingredient groups
                  </Button>
                ) : null}
              </Field>
              {/* A switch is a settings-style cell: label and switch on the content edges. */}
              <label className="flex min-h-12 items-center justify-between gap-3 inset-group px-4 py-2 text-base">
                Ignore calories
                <Switch
                  checked={ingredientIgnoreCalories}
                  onCheckedChange={(checked) =>
                    setIngredientIgnoreCalories(Boolean(checked))
                  }
                />
              </label>
              <Field label="Notes" htmlFor="ingredient-notes">
                <Textarea
                  id="ingredient-notes"
                  aria-label="Ingredient notes"
                  placeholder="Optional"
                  value={ingredientNotes}
                  onChange={(event) => setIngredientNotes(event.target.value)}
                />
              </Field>
            </fieldset>
            <SheetFooter>
              {editingIngredient ? (
                <ArchiveActions
                  name={editingIngredient.name}
                  archived={editingIngredient.archived}
                  disabled={isRunning}
                  onArchive={() =>
                    void runAction(
                      editingIngredient.archived
                        ? 'Ingredient restored.'
                        : 'Ingredient archived.',
                      async () => {
                        await setIngredientArchived({
                          ingredientId: editingIngredient._id,
                          expectedEditRevision: editingIngredient.editRevision,
                          archived: !editingIngredient.archived,
                        })
                        resetIngredientForm()
                      },
                    )
                  }
                  onDelete={() =>
                    confirmAndRunAction(
                      'Delete this ingredient permanently?',
                      'Ingredient deleted.',
                      async () => {
                        await deleteIngredient({
                          ingredientId: editingIngredient._id,
                          expectedEditRevision: editingIngredient.editRevision,
                        })
                        resetIngredientForm()
                      },
                    )
                  }
                />
              ) : null}
              <Button type="submit" size="lg" disabled={isRunning}>
                {editingIngredientId ? 'Save ingredient' : 'Create ingredient'}
              </Button>
            </SheetFooter>
          </form>
          {confirmDialog}
        </EditorDialog>
      ) : null}

      {recipeEditorOpen ? (
        <EditorDialog
          title={editingRecipeId ? 'Edit recipe' : 'New recipe'}
          description="Saving an edited recipe records a new version. Earlier versions stay with past meals."
          pending={isRunning}
          onClose={resetRecipeForm}
        >
          <div className="flex flex-1 flex-col">
            {editingRecipeId && !isEditingRecipeHydrated ? (
              <LoadingRows label="Loading recipe details" rows={2} />
            ) : null}
            {editingRecipeId && recipeVersionConflict ? (
              <p className="mb-3 text-sm text-destructive" role="alert">
                This recipe changed elsewhere. Close and reopen it before saving
                your edits.
              </p>
            ) : null}
            <fieldset
              className="min-w-0 space-y-5 pb-5"
              disabled={isRunning || !isEditingRecipeHydrated}
            >
              <Field label="Name" htmlFor="recipe-name">
                <Input
                  id="recipe-name"
                  aria-label="Recipe name"
                  value={recipeName}
                  onChange={(event) => setRecipeName(event.target.value)}
                />
              </Field>
              <Field label="Instructions" htmlFor="recipe-instructions">
                <Textarea
                  id="recipe-instructions"
                  aria-label="Recipe instructions"
                  placeholder="Optional"
                  value={recipeInstructions}
                  onChange={(event) =>
                    setRecipeInstructions(event.target.value)
                  }
                />
              </Field>

              <section aria-labelledby="recipe-lines-title">
                <div className="flex items-baseline justify-between gap-3 group-label">
                  <h3 id="recipe-lines-title">Ingredients</h3>
                  <p className="tabular-nums">
                    {recipeIngredientLines.length} line
                    {recipeIngredientLines.length === 1 ? '' : 's'}
                  </p>
                </div>
                {recipeIngredientLines.length === 0 ? (
                  <p className="inset-group px-4 py-3.5 type-subhead text-muted-foreground">
                    Add at least one ingredient line.
                  </p>
                ) : (
                  <ul
                    aria-label="Recipe ingredient lines"
                    className="inset-group inset-rows"
                  >
                    {recipeIngredientLines.map((line) => {
                      const label = line.name
                      const customLabel = label || 'Custom ingredient'
                      return (
                        <li key={line.draftId} className="space-y-2 px-4 py-3">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              {line.sourceType === 'custom' ? (
                                <Input
                                  aria-label={`${customLabel} name`}
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
                              ) : (
                                <>
                                  <p className="text-base break-words text-foreground">
                                    {label}
                                  </p>
                                  <p className="type-footnote text-muted-foreground tabular-nums">
                                    {line.ignoreCalories
                                      ? 'Calories not counted'
                                      : `${formatKcalPer100(line.kcalPer100)} kcal/100 ${line.kcalBasisUnit}`}
                                  </p>
                                </>
                              )}
                            </div>
                            {/* Centred on the name's line, its glyph on the content edge. */}
                            <RowRemoveButton
                              className="-my-2.5 -mr-3.5 shrink-0"
                              label={`Remove ${customLabel}`}
                              onClick={() =>
                                removeRecipeIngredientLine(line.draftId)
                              }
                            >
                              <X />
                            </RowRemoveButton>
                          </div>
                          {line.sourceType === 'custom' ? (
                            <div className="grid grid-cols-2 gap-2">
                              <UnitInput
                                unit="kcal"
                                min={line.ignoreCalories ? '0' : '1'}
                                step="1"
                                aria-label={`${customLabel} kcal per 100`}
                                disabled={line.ignoreCalories}
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
                                onBlur={() =>
                                  commitRecipeIngredientLineKcal(line.draftId)
                                }
                                onKeyDown={blurOnEnter}
                              />
                              <Select
                                ariaLabel={`${customLabel} kcal basis`}
                                className="w-full"
                                value={line.kcalBasisUnit}
                                onValueChange={(value) =>
                                  updateCustomRecipeIngredientLine(
                                    line.draftId,
                                    (customLine) => ({
                                      ...customLine,
                                      kcalBasisUnit:
                                        (value as NutritionUnit | null) ?? 'g',
                                    }),
                                  )
                                }
                                options={NUTRITION_UNIT_OPTIONS}
                              />
                            </div>
                          ) : null}
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min="0.01"
                              step="0.01"
                              aria-label={`${label} amount`}
                              placeholder="Amount"
                              className="tabular-nums"
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
                              onBlur={() =>
                                commitRecipeIngredientLineAmount(line.draftId)
                              }
                              onKeyDown={blurOnEnter}
                            />
                            <Select
                              ariaLabel={`${label} unit`}
                              className="w-full"
                              value={line.referenceUnit}
                              onValueChange={(value) =>
                                updateRecipeIngredientLine(
                                  line.draftId,
                                  (current) => ({
                                    ...current,
                                    referenceUnit:
                                      (value as NutritionUnit | null) ?? 'g',
                                  }),
                                )
                              }
                              options={NUTRITION_UNIT_OPTIONS}
                            />
                          </div>
                          {line.sourceType === 'custom' ? (
                            <div className="flex flex-wrap gap-x-5 gap-y-1 type-subhead">
                              <label className="inline-flex min-h-9 items-center gap-2">
                                Ignore calories
                                <Switch
                                  size="sm"
                                  aria-label={`${customLabel} ignore calories`}
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
                              </label>
                              <label className="inline-flex min-h-9 items-center gap-2">
                                Save to ingredients
                                <Switch
                                  size="sm"
                                  aria-label={`${customLabel} save to ingredient catalog`}
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
                              </label>
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              <section
                aria-labelledby="recipe-add-line-title"
                className="space-y-3 inset-group p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="recipe-add-line-title" className="type-headline">
                    Add ingredient line
                  </h3>
                  <IngredientLineModeToggle
                    value={recipeLineMode}
                    onValueChange={setRecipeLineMode}
                  />
                </div>

                {recipeLineMode === 'ingredient' ? (
                  <>
                    <SearchField
                      label="Search recipe ingredients"
                      placeholder="Search ingredients"
                      maxLength={SEARCH_MAX_LENGTH}
                      value={recipeIngredientSearch}
                      onValueChange={setRecipeIngredientSearch}
                    />
                    <RecordList
                      label="Ingredients to add"
                      empty={
                        catalogData.search.recipeIngredients.isLoading
                          ? 'Searching ingredients…'
                          : 'No ingredients found.'
                      }
                    >
                      {recipePickerIngredients.map((ingredient) => {
                        const energy = ingredientEnergy(ingredient)
                        return (
                          <RecordRow
                            key={ingredient._id}
                            title={ingredient.name}
                            detail={[ingredient.brand, energy.basis]
                              .filter(Boolean)
                              .join(' · ')}
                            value={energy.value}
                            selected={ingredient._id === recipeLineIngredientId}
                            onOpen={() => {
                              setRecipeIngredientCache((current) => {
                                const next = new Map(current)
                                next.set(ingredient._id, ingredient)
                                return next
                              })
                              setRecipeLineIngredientId(ingredient._id)
                            }}
                          />
                        )
                      })}
                    </RecordList>
                    {!catalogData.search.recipeIngredients.active &&
                    catalogData.paging.recipeIngredients.canLoadMore ? (
                      <LoadMoreButton
                        loading={
                          catalogData.paging.recipeIngredients.isLoadingMore
                        }
                        onClick={catalogData.paging.recipeIngredients.loadMore}
                      >
                        Load more recipe ingredients
                      </LoadMoreButton>
                    ) : null}
                    <Field
                      label="Selected"
                      htmlFor="recipe-selected-ingredient"
                    >
                      <Input
                        id="recipe-selected-ingredient"
                        aria-label="Selected recipe ingredient"
                        value={
                          recipeLineIngredientId
                            ? selectedRecipeLineIngredient
                              ? `${selectedRecipeLineIngredient.name} · ${formatKcalPer100(selectedRecipeLineIngredient.kcalPer100)} kcal/100 ${selectedRecipeLineIngredient.kcalBasisUnit}`
                              : 'Unknown ingredient'
                            : ''
                        }
                        placeholder="Pick an ingredient above"
                        readOnly
                      />
                    </Field>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                      <Field label="Amount" htmlFor="recipe-line-amount">
                        <Input
                          id="recipe-line-amount"
                          type="number"
                          inputMode="decimal"
                          aria-label="Recipe reference amount"
                          value={recipeLineAmount}
                          onChange={(event) =>
                            setRecipeLineAmount(event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Unit">
                        <Select
                          ariaLabel="Recipe reference unit"
                          className="w-full"
                          value={recipeLineUnit}
                          onValueChange={(value) =>
                            setRecipeLineUnit(
                              (value as NutritionUnit | null) ?? 'g',
                            )
                          }
                          options={NUTRITION_UNIT_OPTIONS}
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          isRunning ||
                          (Boolean(recipeLineIngredientId) &&
                            !selectedRecipeLineIngredient)
                        }
                        onClick={addRecipeIngredientLine}
                      >
                        Add
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Field label="Name" htmlFor="recipe-custom-name">
                      <Input
                        id="recipe-custom-name"
                        aria-label="Recipe custom ingredient name"
                        placeholder="Ingredient"
                        value={recipeLineCustomName}
                        onChange={(event) =>
                          setRecipeLineCustomName(event.target.value)
                        }
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      {recipeLineCustomIgnoreCalories ? null : (
                        <Field label="Calories" htmlFor="recipe-custom-kcal">
                          <UnitInput
                            id="recipe-custom-kcal"
                            unit="kcal"
                            aria-label="Recipe custom kcal per 100"
                            value={recipeLineCustomKcal}
                            onChange={(event) =>
                              setRecipeLineCustomKcal(event.target.value)
                            }
                          />
                        </Field>
                      )}
                      <Field label="Per 100">
                        <Select
                          ariaLabel="Recipe custom kcal basis"
                          className="w-full"
                          value={recipeLineCustomBasisUnit}
                          onValueChange={(value) =>
                            setRecipeLineCustomBasisUnit(
                              (value as NutritionUnit | null) ?? 'g',
                            )
                          }
                          options={NUTRITION_UNIT_OPTIONS}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                      <Field label="Amount" htmlFor="recipe-custom-amount">
                        <Input
                          id="recipe-custom-amount"
                          type="number"
                          inputMode="decimal"
                          aria-label="Recipe custom reference amount"
                          value={recipeLineAmount}
                          onChange={(event) =>
                            setRecipeLineAmount(event.target.value)
                          }
                        />
                      </Field>
                      <Field label="Unit">
                        <Select
                          ariaLabel="Recipe custom reference unit"
                          className="w-full"
                          value={recipeLineUnit}
                          onValueChange={(value) =>
                            setRecipeLineUnit(
                              (value as NutritionUnit | null) ?? 'g',
                            )
                          }
                          options={NUTRITION_UNIT_OPTIONS}
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addRecipeIngredientLine}
                      >
                        Add
                      </Button>
                    </div>
                    <CustomIngredientSwitchRow
                      ignoreCalories={recipeLineCustomIgnoreCalories}
                      onIgnoreCaloriesChange={setRecipeLineCustomIgnoreCalories}
                      saveToCatalog={recipeLineCustomSaveToCatalog}
                      onSaveToCatalogChange={setRecipeLineCustomSaveToCatalog}
                    />
                  </>
                )}
              </section>
            </fieldset>
            <SheetFooter>
              {editingRecipe ? (
                <ArchiveActions
                  name={editingRecipe.name}
                  archived={editingRecipe.archived}
                  disabled={isRunning}
                  onArchive={() =>
                    void runAction(
                      editingRecipe.archived
                        ? 'Recipe restored.'
                        : 'Recipe archived.',
                      async () => {
                        await setRecipeArchived({
                          recipeId: editingRecipe._id,
                          expectedEditRevision: editingRecipe.editRevision,
                          archived: !editingRecipe.archived,
                        })
                        resetRecipeForm()
                      },
                    )
                  }
                  onDelete={() =>
                    confirmAndRunAction(
                      'Delete this recipe permanently?',
                      'Recipe deleted.',
                      async () => {
                        await deleteRecipe({
                          recipeId: editingRecipe._id,
                          expectedEditRevision: editingRecipe.editRevision,
                        })
                        resetRecipeForm()
                      },
                    )
                  }
                />
              ) : null}
              <Button
                type="button"
                size="lg"
                disabled={
                  isRunning || !isEditingRecipeHydrated || recipeVersionConflict
                }
                onClick={saveRecipe}
              >
                {editingRecipeId ? 'Save recipe' : 'Create recipe'}
              </Button>
            </SheetFooter>
          </div>
          {confirmDialog}
        </EditorDialog>
      ) : null}

      {groupEditorOpen ? (
        <EditorDialog
          title={editingGroupId ? 'Edit group' : 'New group'}
          description="Changes are saved only when you choose Save."
          pending={isRunning}
          onClose={resetGroupForm}
        >
          <form
            className="flex flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              saveGroup()
            }}
          >
            <fieldset className="min-w-0 space-y-4 pb-5" disabled={isRunning}>
              <Field label="Name" htmlFor="group-name">
                <Input
                  id="group-name"
                  aria-label="Group name"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                />
              </Field>
              <Field label="Used for">
                <Select
                  ariaLabel="Group scope"
                  className="w-full"
                  value={groupScope}
                  onValueChange={(value) =>
                    setGroupScope(
                      (value as 'ingredient' | 'cookedFood' | null) ??
                        'ingredient',
                    )
                  }
                  options={[
                    {
                      value: 'ingredient',
                      label: GROUP_SCOPE_LABEL.ingredient,
                    },
                    {
                      value: 'cookedFood',
                      label: GROUP_SCOPE_LABEL.cookedFood,
                    },
                  ]}
                />
              </Field>
            </fieldset>
            <SheetFooter>
              {editingGroup ? (
                <ArchiveActions
                  name={editingGroup.name}
                  archived={editingGroup.archived}
                  disabled={isRunning}
                  onArchive={() =>
                    void runAction(
                      editingGroup.archived
                        ? 'Group restored.'
                        : 'Group archived.',
                      async () => {
                        await setFoodGroupArchived({
                          groupId: editingGroup._id,
                          expectedEditRevision: editingGroup.editRevision,
                          archived: !editingGroup.archived,
                        })
                        resetGroupForm()
                      },
                    )
                  }
                  onDelete={() =>
                    confirmAndRunAction(
                      'Delete this group permanently?',
                      'Group deleted.',
                      async () => {
                        await deleteFoodGroup({
                          groupId: editingGroup._id,
                          expectedEditRevision: editingGroup.editRevision,
                        })
                        resetGroupForm()
                      },
                    )
                  }
                />
              ) : null}
              <Button type="submit" size="lg" disabled={isRunning}>
                {editingGroupId ? 'Save group' : 'Create group'}
              </Button>
            </SheetFooter>
          </form>
          {confirmDialog}
        </EditorDialog>
      ) : null}
    </PageShell>
  )
}
