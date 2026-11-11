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
import {
  ListToolbar,
  LoadMoreButton,
  ShowArchivedButton,
} from '@/components/list/list-toolbar'
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
  type NutritionUnit,
  formatKcal,
  nutritionUnitOptions,
} from '@/lib/nutrition'
import { useLocale, type Locale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { EmptyState } from '@/components/page/empty-state'
import { messages } from './catalog.messages'

const SEARCH_MAX_LENGTH = 100

const emptyMacroDraft = { proteinG: '', carbsG: '', fatG: '' }
const macroFieldKeys = ['proteinG', 'carbsG', 'fatG'] as const
const macroFieldLabel = {
  proteinG: 'protein',
  carbsG: 'carbs',
  fatG: 'fat',
} as const

const INGREDIENT_SORTS = ['name', 'kcal-desc', 'kcal-asc'] as const
type IngredientSort = (typeof INGREDIENT_SORTS)[number]

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
  'foods',
  'templates',
  'ingredients',
  'recipes',
  'groups',
] as const

type LibrarySection = (typeof LIBRARY_SECTIONS)[number]

export const Route = createFileRoute('/catalog')({
  ssr: false,
  // An unknown section falls back to the section list.
  validateSearch: (
    search: Record<string, unknown>,
  ): { section?: LibrarySection } => {
    const section = LIBRARY_SECTIONS.find((id) => id === search.section)
    return section ? { section } : {}
  },
  component: ManagePage,
})

function ManagePage() {
  const { section: sectionId } = Route.useSearch()
  const section = LIBRARY_SECTIONS.find((id) => id === sectionId)
  if (!isConvexConfigured) {
    return <ConfigMissingState />
  }
  if (!section) return <LibrarySections />

  // Keyed, so each section opens with fresh search, sheets and filters.
  return <ManagePageContent key={section} section={section} />
}

function LibrarySections() {
  const t = useMessages(messages)
  return (
    <PageShell
      title={t.title}
      breadcrumbs={<SettingsBreadcrumbs current={t.title} />}
      contentClassName="max-w-3xl"
    >
      <ul aria-label={t.sectionsLabel} className="mt-6 inset-group inset-rows">
        {LIBRARY_SECTIONS.map((section) => (
          <li key={section}>
            {/* Named by the section alone; the description is its hint. */}
            <Link
              to="/catalog"
              search={{ section }}
              aria-labelledby={`library-${section}`}
              aria-describedby={`library-${section}-description`}
              className={LIST_ROW_CLASS}
            >
              <span className="min-w-0 flex-1">
                <span id={`library-${section}`} className="block">
                  {t.sections[section].title}
                </span>
                <span
                  id={`library-${section}-description`}
                  className="mt-0.5 block type-footnote text-muted-foreground"
                >
                  {t.sections[section].description}
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
function ingredientEnergy(
  ingredient: { kcalPer100: number; kcalBasisUnit: NutritionUnit },
  locale: Locale,
) {
  return {
    value: formatKcal(ingredient.kcalPer100),
    basis: messages[locale].per100(ingredient.kcalBasisUnit),
  }
}

function ManagePageContent({ section }: { section: LibrarySection }) {
  const t = useMessages(messages)
  const locale = useLocale()
  const unitOptions = nutritionUnitOptions(locale)
  const activeTab = section
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
  const [ingredientMacros, setIngredientMacros] = useState(emptyMacroDraft)
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
        label: editingIngredientGroup.archived
          ? t.archivedGroupOption(editingIngredientGroup.name)
          : editingIngredientGroup.name,
      })
    }
    return options
  }, [catalogData.ingredientFoodGroups, editingIngredientGroup, t])

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
    setIngredientMacros(emptyMacroDraft)
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
    setIngredientMacros(
      ingredient.macros
        ? {
            proteinG: String(ingredient.macros.proteinG),
            carbsG: String(ingredient.macros.carbsG),
            fatG: String(ingredient.macros.fatG),
          }
        : emptyMacroDraft,
    )
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
      editingGroupId ? t.groupUpdated : t.groupCreated,
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
      editingIngredientId ? t.ingredientUpdated : t.ingredientCreated,
      async () => {
        const macroFields = Object.values(ingredientMacros).filter((value) =>
          value.trim(),
        ).length
        if (!ingredientIgnoreCalories && macroFields > 0 && macroFields < 3)
          throw new Error(t.macrosIncomplete)
        const payload = {
          name: ingredientName,
          brand: ingredientBrand.trim() || undefined,
          kcalPer100: Number(ingredientKcal),
          kcalBasisUnit: ingredientKcalBasisUnit,
          ignoreCalories: ingredientIgnoreCalories,
          // Ignored calories carry no macros, and empty fields clear them.
          macros:
            ingredientIgnoreCalories || macroFields === 0
              ? null
              : {
                  proteinG: Number(ingredientMacros.proteinG),
                  carbsG: Number(ingredientMacros.carbsG),
                  fatG: Number(ingredientMacros.fatG),
                },
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
      editingRecipeId ? t.recipeUpdated : t.recipeCreated,
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
  // A library with no ingredients yet: nothing to search or sort.
  const noIngredientsYet =
    !ingredientSearch.trim() &&
    !showArchived &&
    !catalogData.isLoading &&
    !catalogData.search.ingredients.isLoading &&
    sortedIngredients.length === 0

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
      title={t.sections[section].title}
      breadcrumbs={
        <SettingsBreadcrumbs
          current={t.sections[section].title}
          parent={{ label: t.title, link: <Link to="/catalog" /> }}
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
                label: t.searchIngredients,
                maxLength: SEARCH_MAX_LENGTH,
                value: ingredientSearch,
                onValueChange: setIngredientSearch,
              }}
              sort={{
                label: t.sortIngredients,
                value: ingredientSort,
                options: INGREDIENT_SORTS.map((value) => ({
                  value,
                  label: t.ingredientSorts[value],
                })),
                onValueChange: setIngredientSort,
              }}
              create={{
                noun: t.nouns.ingredient,
                disabled: isRunning,
                onClick: openNewIngredient,
              }}
              archived={archivedToggle}
              empty={noIngredientsYet}
            />
            <RecordList
              label={t.ingredients}
              loading={
                catalogData.isLoading ||
                catalogData.search.ingredients.isLoading
              }
              empty={
                noIngredientsYet ? (
                  <EmptyState
                    title={t.ingredientsEmptyTitle}
                    action={
                      <ShowArchivedButton
                        onClick={() => archivedToggle.onCheckedChange(true)}
                      />
                    }
                  >
                    {t.ingredientsEmpty}
                  </EmptyState>
                ) : (
                  t.noIngredients
                )
              }
            >
              {sortedIngredients.map((ingredient) => {
                const energy = ingredientEnergy(ingredient, locale)
                return (
                  <RecordRow
                    key={ingredient._id}
                    verb={t.edit}
                    title={ingredient.name}
                    // An excluded ingredient says so first, beside its kcal.
                    detail={[
                      ingredient.ignoreCalories ? t.notCounted : '',
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
                {t.loadMoreIngredients}
              </LoadMoreButton>
            ) : null}
          </IngredientsSection>
        ) : null}

        {activeTab === 'recipes' ? (
          <RecipesSection>
            <ListToolbar
              search={{
                label: t.searchRecipes,
                maxLength: SEARCH_MAX_LENGTH,
                value: recipeSearch,
                onValueChange: setRecipeSearch,
              }}
              create={{
                noun: t.nouns.recipe,
                disabled: isRunning,
                onClick: openNewRecipe,
              }}
              archived={archivedToggle}
            />
            <RecordList
              label={t.recipes}
              loading={
                catalogData.isLoading || catalogData.search.recipes.isLoading
              }
              empty={t.noRecipes}
            >
              {recipes.map((recipe) => (
                <RecordRow
                  key={recipe._id}
                  verb={t.edit}
                  title={recipe.name}
                  detail={t.version(recipe.latestVersionNumber)}
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
                {t.loadMoreRecipes}
              </LoadMoreButton>
            ) : null}
          </RecipesSection>
        ) : null}

        {activeTab === 'groups' ? (
          <FoodGroupsSection>
            <ListToolbar
              search={{
                label: t.searchFoodGroups,
                maxLength: SEARCH_MAX_LENGTH,
                value: foodGroupSearch,
                onValueChange: setFoodGroupSearch,
              }}
              create={{
                noun: t.nouns.group,
                disabled: isRunning,
                onClick: openNewGroup,
              }}
              archived={archivedToggle}
            />
            <RecordList
              label={t.foodGroups}
              loading={
                catalogData.isLoading || catalogData.search.foodGroups.isLoading
              }
              empty={
                <>
                  <p className="font-medium text-foreground">
                    {t.noFoodGroups}
                  </p>
                  <p>{t.groupsOptional}</p>
                </>
              }
            >
              {groups.map((group) => (
                <RecordRow
                  key={group._id}
                  verb={t.edit}
                  title={group.name}
                  detail={t.groupScopes[group.appliesTo]}
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
                {t.loadMoreFoodGroups}
              </LoadMoreButton>
            ) : null}
          </FoodGroupsSection>
        ) : null}
      </div>

      {ingredientEditorOpen ? (
        <EditorDialog
          title={editingIngredientId ? t.editIngredient : t.newIngredient}
          description={t.saveHint}
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
              <Field label={t.name} htmlFor="ingredient-name">
                <Input
                  id="ingredient-name"
                  aria-label={t.ingredientName}
                  value={ingredientName}
                  onChange={(event) => setIngredientName(event.target.value)}
                />
              </Field>
              <Field label={t.brand} htmlFor="ingredient-brand">
                <Input
                  id="ingredient-brand"
                  aria-label={t.ingredientBrand}
                  placeholder={t.optional}
                  value={ingredientBrand}
                  onChange={(event) => setIngredientBrand(event.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.calories} htmlFor="ingredient-kcal">
                  <UnitInput
                    id="ingredient-kcal"
                    unit="kcal"
                    aria-label={t.ingredientKcal}
                    value={ingredientKcal}
                    onChange={(event) => setIngredientKcal(event.target.value)}
                  />
                </Field>
                <Field label={t.per100Label}>
                  <Select
                    ariaLabel={t.ingredientKcalBasis}
                    className="w-full"
                    value={ingredientKcalBasisUnit}
                    onValueChange={(value) =>
                      setIngredientKcalBasisUnit(
                        (value as NutritionUnit | null) ?? 'g',
                      )
                    }
                    options={unitOptions}
                  />
                </Field>
              </div>
              {/* Stays in place while calories are ignored, so the switch
                  below never jumps; ignored calories save no macros. */}
              <fieldset
                className="min-w-0 pt-4"
                disabled={isRunning || ingredientIgnoreCalories}
              >
                {/* Sits on its fields: less space below than above. */}
                <legend className="group-label pb-0.5">
                  {t.macrosLegend(ingredientKcalBasisUnit)}
                </legend>
                <div className="grid grid-cols-3 gap-3">
                  {macroFieldKeys.map((key) => (
                    <Field
                      key={key}
                      label={t[macroFieldLabel[key]]}
                      htmlFor={`ingredient-${key}`}
                    >
                      <UnitInput
                        id={`ingredient-${key}`}
                        unit="g"
                        min="0"
                        step="0.1"
                        value={ingredientMacros[key]}
                        onChange={(event) =>
                          setIngredientMacros((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  ))}
                </div>
                <p className="mt-1.5 px-4 type-footnote text-muted-foreground">
                  {ingredientIgnoreCalories ? t.macrosIgnored : t.macrosHint}
                </p>
              </fieldset>
              <Field label={t.group}>
                <Select
                  ariaLabel={t.ingredientGroup}
                  className="w-full"
                  value={ingredientGroupId}
                  onValueChange={(value) =>
                    setIngredientGroupId(
                      (value as Id<'foodGroups'> | '' | null) ?? '',
                    )
                  }
                  placeholder={t.groupOptional}
                  options={[
                    { value: '', label: t.noGroup },
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
                    {t.loadMoreIngredientGroups}
                  </Button>
                ) : null}
              </Field>
              {/* A switch is a settings-style cell: label and switch on the content edges. */}
              <label className="flex min-h-12 items-center justify-between gap-3 inset-group px-4 py-2 text-base">
                {t.ignoreCalories}
                <Switch
                  checked={ingredientIgnoreCalories}
                  onCheckedChange={(checked) =>
                    setIngredientIgnoreCalories(Boolean(checked))
                  }
                />
              </label>
              <Field label={t.notes} htmlFor="ingredient-notes">
                <Textarea
                  id="ingredient-notes"
                  aria-label={t.ingredientNotes}
                  placeholder={t.optional}
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
                        ? t.ingredientRestored
                        : t.ingredientArchived,
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
                      t.confirmDeleteIngredient,
                      t.ingredientDeleted,
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
                {editingIngredientId ? t.saveIngredient : t.createIngredient}
              </Button>
            </SheetFooter>
          </form>
          {confirmDialog}
        </EditorDialog>
      ) : null}

      {recipeEditorOpen ? (
        <EditorDialog
          title={editingRecipeId ? t.editRecipe : t.newRecipe}
          description={t.recipeHint}
          pending={isRunning}
          onClose={resetRecipeForm}
        >
          <div className="flex flex-1 flex-col">
            {editingRecipeId && !isEditingRecipeHydrated ? (
              <LoadingRows label={t.loadingRecipe} rows={2} />
            ) : null}
            {editingRecipeId && recipeVersionConflict ? (
              <p className="mb-3 text-sm text-destructive" role="alert">
                {t.recipeConflict}
              </p>
            ) : null}
            <fieldset
              className="min-w-0 space-y-5 pb-5"
              disabled={isRunning || !isEditingRecipeHydrated}
            >
              <Field label={t.name} htmlFor="recipe-name">
                <Input
                  id="recipe-name"
                  aria-label={t.recipeName}
                  value={recipeName}
                  onChange={(event) => setRecipeName(event.target.value)}
                />
              </Field>
              <Field label={t.instructions} htmlFor="recipe-instructions">
                <Textarea
                  id="recipe-instructions"
                  aria-label={t.recipeInstructions}
                  placeholder={t.optional}
                  value={recipeInstructions}
                  onChange={(event) =>
                    setRecipeInstructions(event.target.value)
                  }
                />
              </Field>

              <section aria-labelledby="recipe-lines-title">
                <div className="flex items-baseline justify-between gap-3 group-label">
                  <h3 id="recipe-lines-title">{t.ingredients}</h3>
                  <p className="tabular-nums">
                    {t.lineCount(recipeIngredientLines.length)}
                  </p>
                </div>
                {recipeIngredientLines.length === 0 ? (
                  <p className="inset-group px-4 py-3.5 type-subhead text-muted-foreground">
                    {t.addAtLeastOneLine}
                  </p>
                ) : (
                  <ul
                    aria-label={t.recipeLines}
                    className="inset-group inset-rows"
                  >
                    {recipeIngredientLines.map((line) => {
                      const label = line.name
                      const customLabel = label || t.customIngredient
                      return (
                        <li key={line.draftId} className="space-y-2 px-4 py-3">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              {line.sourceType === 'custom' ? (
                                <Input
                                  aria-label={t.lineName(customLabel)}
                                  placeholder={t.ingredient}
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
                                      ? t.caloriesNotCounted
                                      : t.kcalPer100(
                                          formatKcal(line.kcalPer100),
                                          line.kcalBasisUnit,
                                        )}
                                  </p>
                                </>
                              )}
                            </div>
                            {/* Centred on the name's line, its glyph on the content edge. */}
                            <RowRemoveButton
                              className="-my-2.5 -mr-3.5 shrink-0"
                              label={t.remove(customLabel)}
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
                                aria-label={t.lineKcal(customLabel)}
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
                                ariaLabel={t.lineKcalBasis(customLabel)}
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
                                options={unitOptions}
                              />
                            </div>
                          ) : null}
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              min="0.01"
                              step="0.01"
                              aria-label={t.lineAmount(label)}
                              placeholder={t.amount}
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
                              ariaLabel={t.lineUnit(label)}
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
                              options={unitOptions}
                            />
                          </div>
                          {line.sourceType === 'custom' ? (
                            <div className="flex flex-wrap gap-x-5 gap-y-1 type-subhead">
                              <label className="inline-flex min-h-9 items-center gap-2">
                                {t.ignoreCalories}
                                <Switch
                                  size="sm"
                                  aria-label={t.lineIgnoreCalories(customLabel)}
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
                                {t.saveToIngredients}
                                <Switch
                                  size="sm"
                                  aria-label={t.lineSaveToCatalog(customLabel)}
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
                    {t.addIngredientLine}
                  </h3>
                  <IngredientLineModeToggle
                    value={recipeLineMode}
                    onValueChange={setRecipeLineMode}
                  />
                </div>

                {recipeLineMode === 'ingredient' ? (
                  <>
                    <SearchField
                      label={t.searchRecipeIngredients}
                      placeholder={t.searchIngredients}
                      maxLength={SEARCH_MAX_LENGTH}
                      value={recipeIngredientSearch}
                      onValueChange={setRecipeIngredientSearch}
                    />
                    <RecordList
                      label={t.ingredientsToAdd}
                      empty={
                        catalogData.search.recipeIngredients.isLoading
                          ? t.searchingIngredients
                          : t.noIngredients
                      }
                    >
                      {recipePickerIngredients.map((ingredient) => {
                        const energy = ingredientEnergy(ingredient, locale)
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
                        {t.loadMoreRecipeIngredients}
                      </LoadMoreButton>
                    ) : null}
                    <Field
                      label={t.selected}
                      htmlFor="recipe-selected-ingredient"
                    >
                      <Input
                        id="recipe-selected-ingredient"
                        aria-label={t.selectedRecipeIngredient}
                        value={
                          recipeLineIngredientId
                            ? selectedRecipeLineIngredient
                              ? `${selectedRecipeLineIngredient.name} · ${t.kcalPer100(formatKcal(selectedRecipeLineIngredient.kcalPer100), selectedRecipeLineIngredient.kcalBasisUnit)}`
                              : t.unknownIngredient
                            : ''
                        }
                        placeholder={t.pickIngredient}
                        readOnly
                      />
                    </Field>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                      <Field label={t.amount} htmlFor="recipe-line-amount">
                        <Input
                          id="recipe-line-amount"
                          type="number"
                          inputMode="decimal"
                          aria-label={t.recipeReferenceAmount}
                          value={recipeLineAmount}
                          onChange={(event) =>
                            setRecipeLineAmount(event.target.value)
                          }
                        />
                      </Field>
                      <Field label={t.unit}>
                        <Select
                          ariaLabel={t.recipeReferenceUnit}
                          className="w-full"
                          value={recipeLineUnit}
                          onValueChange={(value) =>
                            setRecipeLineUnit(
                              (value as NutritionUnit | null) ?? 'g',
                            )
                          }
                          options={unitOptions}
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
                        {t.add}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Field label={t.name} htmlFor="recipe-custom-name">
                      <Input
                        id="recipe-custom-name"
                        aria-label={t.customIngredientName}
                        placeholder={t.ingredient}
                        value={recipeLineCustomName}
                        onChange={(event) =>
                          setRecipeLineCustomName(event.target.value)
                        }
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-2">
                      {recipeLineCustomIgnoreCalories ? null : (
                        <Field label={t.calories} htmlFor="recipe-custom-kcal">
                          <UnitInput
                            id="recipe-custom-kcal"
                            unit="kcal"
                            aria-label={t.customKcal}
                            value={recipeLineCustomKcal}
                            onChange={(event) =>
                              setRecipeLineCustomKcal(event.target.value)
                            }
                          />
                        </Field>
                      )}
                      <Field label={t.per100Label}>
                        <Select
                          ariaLabel={t.customKcalBasis}
                          className="w-full"
                          value={recipeLineCustomBasisUnit}
                          onValueChange={(value) =>
                            setRecipeLineCustomBasisUnit(
                              (value as NutritionUnit | null) ?? 'g',
                            )
                          }
                          options={unitOptions}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
                      <Field label={t.amount} htmlFor="recipe-custom-amount">
                        <Input
                          id="recipe-custom-amount"
                          type="number"
                          inputMode="decimal"
                          aria-label={t.customReferenceAmount}
                          value={recipeLineAmount}
                          onChange={(event) =>
                            setRecipeLineAmount(event.target.value)
                          }
                        />
                      </Field>
                      <Field label={t.unit}>
                        <Select
                          ariaLabel={t.customReferenceUnit}
                          className="w-full"
                          value={recipeLineUnit}
                          onValueChange={(value) =>
                            setRecipeLineUnit(
                              (value as NutritionUnit | null) ?? 'g',
                            )
                          }
                          options={unitOptions}
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addRecipeIngredientLine}
                      >
                        {t.add}
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
                        ? t.recipeRestored
                        : t.recipeArchived,
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
                      t.confirmDeleteRecipe,
                      t.recipeDeleted,
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
                {editingRecipeId ? t.saveRecipe : t.createRecipe}
              </Button>
            </SheetFooter>
          </div>
          {confirmDialog}
        </EditorDialog>
      ) : null}

      {groupEditorOpen ? (
        <EditorDialog
          title={editingGroupId ? t.editGroup : t.newGroup}
          description={t.saveHint}
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
              <Field label={t.name} htmlFor="group-name">
                <Input
                  id="group-name"
                  aria-label={t.groupName}
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                />
              </Field>
              <Field label={t.usedFor}>
                <Select
                  ariaLabel={t.groupScope}
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
                      label: t.groupScopes.ingredient,
                    },
                    {
                      value: 'cookedFood',
                      label: t.groupScopes.cookedFood,
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
                      editingGroup.archived ? t.groupRestored : t.groupArchived,
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
                      t.confirmDeleteGroup,
                      t.groupDeleted,
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
                {editingGroupId ? t.saveGroup : t.createGroup}
              </Button>
            </SheetFooter>
          </form>
          {confirmDialog}
        </EditorDialog>
      ) : null}
    </PageShell>
  )
}
