import {
  mutation,
  type DatabaseWriter,
  type MutationCtx,
} from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { v } from 'convex/values'
import { groupScopeValidator, nutritionUnitValidator } from './validators'
import {
  assertOwnedOrThrow,
  type AuthenticatedOwner,
  isOwnedBy,
  ownerFields,
  requireAuthenticatedUser,
} from './lib/auth'
import {
  assertArrayLimit,
  assertNonEmpty,
  assertNonNegative,
  assertPositive,
  assertSafeTimestamp,
  MAX_CHILD_ROWS,
  MAX_DESCRIPTION_LENGTH,
  MAX_INSTRUCTIONS_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  normalizeKcalPer100,
  normalizeNullableText,
  normalizeOptionalText,
  normalizeRequiredDate,
  normalizeRequiredText,
  type NutritionUnit,
} from './lib/validation'

const optionalNullableStringValidator = v.optional(
  v.union(v.string(), v.null()),
)
const MAX_INGREDIENT_LINES = MAX_CHILD_ROWS

const expectedNutritionSnapshotValidator = v.object({
  name: v.string(),
  kcalPer100: v.number(),
  kcalBasisUnit: nutritionUnitValidator,
  ignoreCalories: v.boolean(),
})

const cookedFoodWriteResultValidator = v.object({
  cookedFoodId: v.id('cookedFoods'),
  editRevision: v.number(),
  cookedFoodIngredientIds: v.array(v.id('cookedFoodIngredients')),
  recipeId: v.optional(v.id('recipes')),
  recipeVersionId: v.optional(v.id('recipeVersions')),
})

type ExpectedNutritionSnapshot = {
  name: string
  kcalPer100: number
  kcalBasisUnit: NutritionUnit
  ignoreCalories: boolean
}

function assertFiniteDerived(value: number, fieldName: string) {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} exceeds the supported numeric range.`)
  }
  return value
}

function assertSafeDerivedInteger(value: number, fieldName: string) {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} exceeds the supported integer range.`)
  }
  return value
}

function normalizeOptionalPositive(
  value: number | undefined,
  fieldName: string,
) {
  if (value === undefined) {
    return undefined
  }
  assertPositive(value, fieldName)
  return value
}

function assertExpectedIdSet(
  expectedIds: readonly string[],
  actualIds: readonly string[],
  itemName: string,
) {
  const expected = new Set(expectedIds)
  const actual = new Set(actualIds)
  if (
    expected.size !== expectedIds.length ||
    expected.size !== actual.size ||
    [...expected].some((id) => !actual.has(id))
  ) {
    throw new Error(
      `${itemName} changed since editing began. Refresh and try again.`,
    )
  }
}

function getEditRevision(record: { editRevision?: number }, itemName: string) {
  const revision = record.editRevision ?? 0
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error(`${itemName} has an invalid edit revision.`)
  }
  return revision
}

function assertExpectedEditRevision(
  record: { editRevision?: number },
  expectedRevision: number,
  itemName: string,
) {
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision !== getEditRevision(record, itemName)
  ) {
    throw new Error(
      `${itemName} changed since editing began. Refresh and try again.`,
    )
  }
}

function nextEditRevision(record: { editRevision?: number }, itemName: string) {
  return assertSafeDerivedInteger(
    getEditRevision(record, itemName) + 1,
    `${itemName} edit revision`,
  )
}

function assertExpectedNutritionSnapshot(
  expected: ExpectedNutritionSnapshot | undefined,
  actual: ExpectedNutritionSnapshot,
  itemName: string,
) {
  if (
    !expected ||
    expected.name !== actual.name ||
    expected.kcalPer100 !== actual.kcalPer100 ||
    expected.kcalBasisUnit !== actual.kcalBasisUnit ||
    expected.ignoreCalories !== actual.ignoreCalories
  ) {
    throw new Error(
      `${itemName} changed since it was added. Refresh it and try again.`,
    )
  }
}

function normalizeInputNotes(
  value: string | null | undefined,
  existing?: string,
) {
  if (value === undefined || value === existing) {
    return existing
  }
  return normalizeNullableText(value, 'Item notes', MAX_NOTES_LENGTH)
}

const recipeIngredientValidator = v.union(
  v.object({
    sourceType: v.literal('ingredient'),
    existingRecipeVersionIngredientId: v.optional(
      v.id('recipeVersionIngredients'),
    ),
    ingredientId: v.id('ingredients'),
    expectedSnapshot: v.optional(expectedNutritionSnapshotValidator),
    referenceAmount: v.number(),
    referenceUnit: nutritionUnitValidator,
    notes: optionalNullableStringValidator,
  }),
  v.object({
    sourceType: v.literal('custom'),
    existingRecipeVersionIngredientId: v.optional(
      v.id('recipeVersionIngredients'),
    ),
    ingredientId: v.optional(v.id('ingredients')),
    name: v.string(),
    kcalPer100: v.number(),
    kcalBasisUnit: v.optional(nutritionUnitValidator),
    ignoreCalories: v.boolean(),
    referenceAmount: v.number(),
    referenceUnit: nutritionUnitValidator,
    saveToCatalog: v.optional(v.boolean()),
    notes: optionalNullableStringValidator,
  }),
)

const cookedFoodIngredientValidator = v.union(
  v.object({
    sourceType: v.literal('ingredient'),
    existingCookedFoodIngredientId: v.optional(v.id('cookedFoodIngredients')),
    ingredientId: v.id('ingredients'),
    expectedSnapshot: v.optional(expectedNutritionSnapshotValidator),
    referenceAmount: v.number(),
    referenceUnit: nutritionUnitValidator,
    countedAmount: v.optional(v.number()),
    notes: optionalNullableStringValidator,
  }),
  v.object({
    sourceType: v.literal('custom'),
    existingCookedFoodIngredientId: v.optional(v.id('cookedFoodIngredients')),
    ingredientId: v.optional(v.id('ingredients')),
    name: v.string(),
    kcalPer100: v.number(),
    kcalBasisUnit: v.optional(nutritionUnitValidator),
    ignoreCalories: v.boolean(),
    referenceAmount: v.number(),
    referenceUnit: nutritionUnitValidator,
    countedAmount: v.optional(v.number()),
    saveToCatalog: v.optional(v.boolean()),
    notes: optionalNullableStringValidator,
  }),
)

const cookedFoodRecipeDraftValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  instructions: v.optional(v.string()),
  notes: v.optional(v.string()),
})

const mealItemInputValidator = v.union(
  v.object({
    sourceType: v.literal('ingredient'),
    existingMealItemId: v.optional(v.id('mealItems')),
    ingredientId: v.id('ingredients'),
    expectedSnapshot: v.optional(expectedNutritionSnapshotValidator),
    consumedWeightGrams: v.number(),
    notes: optionalNullableStringValidator,
  }),
  v.object({
    sourceType: v.literal('customByWeight'),
    existingMealItemId: v.optional(v.id('mealItems')),
    ingredientId: v.optional(v.id('ingredients')),
    name: v.string(),
    kcalPer100: v.number(),
    kcalBasisUnit: v.optional(v.literal('g')),
    ignoreCalories: v.boolean(),
    consumedWeightGrams: v.number(),
    saveToCatalog: v.optional(v.boolean()),
    notes: optionalNullableStringValidator,
  }),
  v.object({
    sourceType: v.literal('cookedFood'),
    existingMealItemId: v.optional(v.id('mealItems')),
    cookedFoodId: v.id('cookedFoods'),
    expectedSnapshot: v.optional(expectedNutritionSnapshotValidator),
    consumedWeightGrams: v.number(),
    notes: optionalNullableStringValidator,
  }),
  v.object({
    sourceType: v.literal('fixedCalories'),
    existingMealItemId: v.optional(v.id('mealItems')),
    name: v.string(),
    calories: v.number(),
    notes: optionalNullableStringValidator,
  }),
)

type RecipeIngredientSnapshotBase = {
  ingredientNameSnapshot: string
  kcalPer100Snapshot: number
  kcalBasisUnitSnapshot: NutritionUnit
  ignoreCaloriesSnapshot: boolean
  referenceAmount: number
  referenceUnit: NutritionUnit
  notes?: string
}

type RecipeIngredientSnapshot =
  | (RecipeIngredientSnapshotBase & {
      sourceType: 'ingredient'
      ingredientId: Id<'ingredients'>
    })
  | (RecipeIngredientSnapshotBase & {
      sourceType: 'custom'
      ingredientId?: Id<'ingredients'>
    })

type CookedIngredientSnapshotBase = {
  existingCookedFoodIngredientId?: Id<'cookedFoodIngredients'>
  ingredientNameSnapshot: string
  referenceAmount: number
  referenceUnit: NutritionUnit
  countedAmount?: number
  ingredientKcalPer100Snapshot: number
  ingredientKcalBasisUnitSnapshot: NutritionUnit
  ignoreCaloriesSnapshot: boolean
  ingredientCaloriesSnapshot: number
  notes?: string
}

type CookedIngredientSnapshot =
  | (CookedIngredientSnapshotBase & {
      sourceType: 'ingredient'
      ingredientId: Id<'ingredients'>
    })
  | (CookedIngredientSnapshotBase & {
      sourceType: 'custom'
      ingredientId?: Id<'ingredients'>
    })

type WeightedMealItemSnapshot = {
  nameSnapshot: string
  consumedWeightGrams: number
  kcalPer100Snapshot: number
  kcalBasisUnitSnapshot: NutritionUnit
  ignoreCaloriesSnapshot: boolean
  caloriesSnapshot: number
  notes?: string
}

type MealItemSnapshot =
  | (WeightedMealItemSnapshot & {
      sourceType: 'ingredient'
      ingredientId: Id<'ingredients'>
    })
  | (Omit<WeightedMealItemSnapshot, 'kcalBasisUnitSnapshot'> & {
      sourceType: 'customByWeight'
      ingredientId?: Id<'ingredients'>
      kcalBasisUnitSnapshot: 'g'
    })
  | (WeightedMealItemSnapshot & {
      sourceType: 'cookedFood'
      cookedFoodId: Id<'cookedFoods'>
    })
  | {
      sourceType: 'fixedCalories'
      nameSnapshot: string
      caloriesSnapshot: number
      notes?: string
    }

function getIngredientKcalPer100(ingredient: { kcalPer100: number }) {
  return normalizeKcalPer100(ingredient.kcalPer100, {
    allowZero: true,
    fieldName: 'Ingredient kcal/100',
  })
}

async function assertGroupForScope(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  groupId: Id<'foodGroups'> | undefined,
  appliesTo: 'ingredient' | 'cookedFood',
  allowArchivedGroupId?: Id<'foodGroups'>,
) {
  if (!groupId) {
    return
  }
  const group = await db.get(groupId)
  if (
    !isOwnedBy(group, owner) ||
    group.appliesTo !== appliesTo ||
    (group.archived && group._id !== allowArchivedGroupId)
  ) {
    throw new Error(
      `One or more groups are missing or do not apply to ${appliesTo === 'ingredient' ? 'ingredients' : 'cooked foods'}.`,
    )
  }
}

async function assertOwnedIngredientLink(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  ingredientId: Id<'ingredients'> | undefined,
  options?: {
    allowArchivedIngredientId?: Id<'ingredients'>
    allowArchivedIngredientCounts?: Map<Id<'ingredients'>, number>
  },
) {
  if (!ingredientId) {
    return undefined
  }
  const ingredient = await db.get(ingredientId)
  if (!isOwnedBy(ingredient, owner)) {
    throw new Error('Linked ingredient not found.')
  }
  if (ingredient.archived) {
    if (ingredient._id === options?.allowArchivedIngredientId) {
      return ingredient._id
    }
    const remaining =
      options?.allowArchivedIngredientCounts?.get(ingredient._id) ?? 0
    if (remaining < 1) {
      throw new Error('Linked ingredient not found.')
    }
    options?.allowArchivedIngredientCounts?.set(ingredient._id, remaining - 1)
  }
  return ingredient._id
}

function scaleHistoricalCalories(
  snapshot: { consumedWeightGrams: number; caloriesSnapshot: number },
  consumedWeightGrams: number,
) {
  return assertFiniteDerived(
    snapshot.consumedWeightGrams > 0
      ? (snapshot.caloriesSnapshot * consumedWeightGrams) /
          snapshot.consumedWeightGrams
      : snapshot.caloriesSnapshot,
    'Meal item calories',
  )
}

async function resolveRecipeLink(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  recipeId?: Id<'recipes'>,
  recipeVersionId?: Id<'recipeVersions'>,
  allowArchivedRecipeId?: Id<'recipes'>,
  allowArchivedRecipeVersionId?: Id<'recipeVersions'>,
) {
  const recipe = recipeId
    ? assertOwnedOrThrow(await db.get(recipeId), owner, 'Recipe not found.')
    : undefined
  const recipeVersion = recipeVersionId
    ? assertOwnedOrThrow(
        await db.get(recipeVersionId),
        owner,
        'Recipe version not found.',
      )
    : undefined
  if (recipe && recipeVersion && recipeVersion.recipeId !== recipe._id) {
    throw new Error('Recipe version does not belong to the selected recipe.')
  }
  const resolvedRecipeId = recipe?._id ?? recipeVersion?.recipeId
  const resolvedRecipe =
    recipe ??
    (resolvedRecipeId
      ? assertOwnedOrThrow(
          await db.get(resolvedRecipeId),
          owner,
          'Recipe not found.',
        )
      : undefined)
  if (
    resolvedRecipe?.archived &&
    (resolvedRecipe._id !== allowArchivedRecipeId ||
      recipeVersion?._id !== allowArchivedRecipeVersionId)
  ) {
    throw new Error('Recipe not found.')
  }
  return {
    recipeId: resolvedRecipeId,
    recipeVersionId: recipeVersion?._id,
  }
}

async function saveCustomIngredientToCatalog(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  createdIngredientByKey: Map<string, Promise<Id<'ingredients'>>>,
  now: number,
  customIngredient: {
    name: string
    kcalPer100: number
    kcalBasisUnit: NutritionUnit
    ignoreCalories: boolean
  },
) {
  const normalizedKcalPer100 = normalizeKcalPer100(
    customIngredient.kcalPer100,
    {
      allowZero: customIngredient.ignoreCalories,
      fieldName: 'Custom ingredient kcal/100',
    },
  )
  const dedupeKey = [
    customIngredient.name.toLowerCase(),
    String(normalizedKcalPer100),
    customIngredient.kcalBasisUnit,
    customIngredient.ignoreCalories ? 'ignore' : 'count',
  ].join('::')

  const cachedIngredientId = createdIngredientByKey.get(dedupeKey)
  if (cachedIngredientId) {
    return await cachedIngredientId
  }

  const ingredientId = db.insert('ingredients', {
    ...ownerFields(owner),
    name: customIngredient.name,
    brand: undefined,
    kcalPer100: normalizedKcalPer100,
    kcalBasisUnit: customIngredient.kcalBasisUnit,
    ignoreCalories: customIngredient.ignoreCalories,
    editRevision: 0,
    groupId: undefined,
    notes: undefined,
    archived: false,
    createdAt: now,
  })
  createdIngredientByKey.set(dedupeKey, ingredientId)
  return await ingredientId
}

async function buildCookedFoodNutrition(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  ingredients: Array<
    | {
        sourceType: 'ingredient'
        existingCookedFoodIngredientId?: Id<'cookedFoodIngredients'>
        ingredientId: Id<'ingredients'>
        expectedSnapshot?: ExpectedNutritionSnapshot
        referenceAmount: number
        referenceUnit: NutritionUnit
        countedAmount?: number
        notes?: string | null
      }
    | {
        sourceType: 'custom'
        existingCookedFoodIngredientId?: Id<'cookedFoodIngredients'>
        ingredientId?: Id<'ingredients'>
        name: string
        kcalPer100: number
        kcalBasisUnit?: NutritionUnit
        ignoreCalories: boolean
        referenceAmount: number
        referenceUnit: NutritionUnit
        countedAmount?: number
        saveToCatalog?: boolean
        notes?: string | null
      }
  >,
  finishedWeightGrams: number,
  options?: {
    persistAllCustomIngredients?: boolean
    existingIngredientsById?: ReadonlyMap<
      Id<'cookedFoodIngredients'>,
      Doc<'cookedFoodIngredients'>
    >
  },
) {
  assertPositive(finishedWeightGrams, 'Finished weight')
  if (ingredients.length === 0) {
    throw new Error('At least one ingredient is required.')
  }
  assertArrayLimit(ingredients, MAX_INGREDIENT_LINES, 'Ingredients')
  const requestedExistingIds = ingredients.flatMap((ingredient) =>
    ingredient.existingCookedFoodIngredientId
      ? [ingredient.existingCookedFoodIngredientId]
      : [],
  )
  if (new Set(requestedExistingIds).size !== requestedExistingIds.length) {
    throw new Error('Cooked ingredient references must be unique.')
  }
  for (const existingIngredientId of requestedExistingIds) {
    if (!options?.existingIngredientsById?.has(existingIngredientId)) {
      throw new Error('Existing cooked ingredient not found.')
    }
  }

  const now = Date.now()
  const createdIngredientByKey = new Map<string, Promise<Id<'ingredients'>>>()
  const persistAllCustomIngredients =
    options?.persistAllCustomIngredients ?? false
  let totalRawWeightGrams = 0
  let totalCalories = 0
  const ingredientSnapshots: CookedIngredientSnapshot[] = []
  for (const line of ingredients) {
    assertPositive(line.referenceAmount, 'Ingredient amount')
    if (line.sourceType === 'ingredient') {
      const existing = line.existingCookedFoodIngredientId
        ? options?.existingIngredientsById?.get(
            line.existingCookedFoodIngredientId,
          )
        : undefined
      if (existing) {
        if (
          existing.sourceType !== 'ingredient' ||
          existing.ingredientId !== line.ingredientId
        ) {
          throw new Error(
            'Existing cooked ingredient does not match ingredient.',
          )
        }
        const countedAmount = normalizeOptionalPositive(
          line.countedAmount,
          'Counted amount',
        )
        if (!existing.ignoreCaloriesSnapshot) {
          assertPositive(countedAmount ?? NaN, 'Counted amount')
        }
        if (countedAmount !== undefined) {
          if (existing.ingredientKcalBasisUnitSnapshot === 'g') {
            totalRawWeightGrams = assertFiniteDerived(
              totalRawWeightGrams + countedAmount,
              'Cooked food raw weight',
            )
          }
        }
        const ingredientCalories = assertFiniteDerived(
          existing.ignoreCaloriesSnapshot || countedAmount === undefined
            ? 0
            : existing.countedAmount && existing.countedAmount > 0
              ? (existing.ingredientCaloriesSnapshot * countedAmount) /
                existing.countedAmount
              : (countedAmount * existing.ingredientKcalPer100Snapshot) / 100,
          'Cooked ingredient calories',
        )
        totalCalories = assertFiniteDerived(
          totalCalories + ingredientCalories,
          'Cooked food total calories',
        )
        ingredientSnapshots.push({
          existingCookedFoodIngredientId: existing._id,
          sourceType: 'ingredient',
          ingredientId: existing.ingredientId,
          ingredientNameSnapshot: existing.ingredientNameSnapshot,
          referenceAmount: line.referenceAmount,
          referenceUnit: line.referenceUnit,
          countedAmount,
          ingredientKcalPer100Snapshot: existing.ingredientKcalPer100Snapshot,
          ingredientKcalBasisUnitSnapshot:
            existing.ingredientKcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot: existing.ignoreCaloriesSnapshot,
          ingredientCaloriesSnapshot: ingredientCalories,
          notes: normalizeInputNotes(line.notes, existing.notes),
        })
        continue
      }
      const ingredient = await db.get(line.ingredientId)
      if (!isOwnedBy(ingredient, owner) || ingredient.archived) {
        throw new Error('One or more ingredients are missing.')
      }
      assertExpectedNutritionSnapshot(
        line.expectedSnapshot,
        {
          name: ingredient.name,
          kcalPer100: ingredient.kcalPer100,
          kcalBasisUnit: ingredient.kcalBasisUnit,
          ignoreCalories: ingredient.ignoreCalories,
        },
        'Ingredient',
      )
      const ignoreCalories = ingredient.ignoreCalories
      const ingredientKcalPer100 = getIngredientKcalPer100(ingredient)
      if (!ignoreCalories) {
        assertPositive(ingredientKcalPer100, 'Ingredient kcal/100')
        assertPositive(line.countedAmount ?? NaN, 'Counted amount')
      }
      const countedAmount = normalizeOptionalPositive(
        line.countedAmount,
        'Counted amount',
      )
      if (countedAmount !== undefined) {
        if (ingredient.kcalBasisUnit === 'g') {
          totalRawWeightGrams = assertFiniteDerived(
            totalRawWeightGrams + countedAmount,
            'Cooked food raw weight',
          )
        }
      }
      const ingredientCalories = assertFiniteDerived(
        ignoreCalories || countedAmount === undefined
          ? 0
          : (countedAmount * ingredientKcalPer100) / 100,
        'Cooked ingredient calories',
      )
      totalCalories = assertFiniteDerived(
        totalCalories + ingredientCalories,
        'Cooked food total calories',
      )
      ingredientSnapshots.push({
        sourceType: 'ingredient',
        ingredientId: ingredient._id,
        ingredientNameSnapshot: ingredient.name,
        referenceAmount: line.referenceAmount,
        referenceUnit: line.referenceUnit,
        countedAmount,
        ingredientKcalPer100Snapshot: ingredientKcalPer100,
        ingredientKcalBasisUnitSnapshot: ingredient.kcalBasisUnit,
        ignoreCaloriesSnapshot: ignoreCalories,
        ingredientCaloriesSnapshot: ingredientCalories,
        notes: normalizeInputNotes(line.notes),
      })
      continue
    }

    const existing = line.existingCookedFoodIngredientId
      ? options?.existingIngredientsById?.get(
          line.existingCookedFoodIngredientId,
        )
      : undefined
    if (existing) {
      if (
        existing.sourceType !== 'custom' ||
        (line.ingredientId !== undefined &&
          line.ingredientId !== existing.ingredientId)
      ) {
        throw new Error('Existing cooked ingredient does not match custom.')
      }
      assertNonEmpty(line.name, 'Custom ingredient name')
      const ingredientName = line.name.trim()
      const ignoreCalories = Boolean(line.ignoreCalories)
      const normalizedKcalPer100 = normalizeKcalPer100(line.kcalPer100, {
        allowZero: ignoreCalories,
        fieldName: 'Custom ingredient kcal/100',
      })
      const kcalBasisUnit = line.kcalBasisUnit ?? 'g'
      const countedAmount = normalizeOptionalPositive(
        line.countedAmount,
        'Counted amount',
      )
      if (!ignoreCalories) {
        assertPositive(countedAmount ?? NaN, 'Counted amount')
      }
      if (countedAmount !== undefined) {
        if (kcalBasisUnit === 'g') {
          totalRawWeightGrams = assertFiniteDerived(
            totalRawWeightGrams + countedAmount,
            'Cooked food raw weight',
          )
        }
      }
      let ingredientId = existing.ingredientId
      if (
        !ingredientId &&
        (persistAllCustomIngredients || Boolean(line.saveToCatalog))
      ) {
        ingredientId = await saveCustomIngredientToCatalog(
          db,
          owner,
          createdIngredientByKey,
          now,
          {
            name: ingredientName,
            kcalPer100: normalizedKcalPer100,
            kcalBasisUnit,
            ignoreCalories,
          },
        )
      }
      const ingredientCalories = assertFiniteDerived(
        ignoreCalories || countedAmount === undefined
          ? 0
          : (countedAmount * normalizedKcalPer100) / 100,
        'Cooked ingredient calories',
      )
      totalCalories = assertFiniteDerived(
        totalCalories + ingredientCalories,
        'Cooked food total calories',
      )
      ingredientSnapshots.push({
        existingCookedFoodIngredientId: existing._id,
        sourceType: 'custom',
        ingredientId,
        ingredientNameSnapshot: ingredientName,
        referenceAmount: line.referenceAmount,
        referenceUnit: line.referenceUnit,
        countedAmount,
        ingredientKcalPer100Snapshot: normalizedKcalPer100,
        ingredientKcalBasisUnitSnapshot: kcalBasisUnit,
        ignoreCaloriesSnapshot: ignoreCalories,
        ingredientCaloriesSnapshot: ingredientCalories,
        notes: normalizeInputNotes(line.notes, existing.notes),
      })
      continue
    }

    assertNonEmpty(line.name, 'Custom ingredient name')
    const normalizedKcalPer100 = normalizeKcalPer100(line.kcalPer100, {
      allowZero: line.ignoreCalories,
      fieldName: 'Custom ingredient kcal/100',
    })
    const ingredientName = line.name.trim()
    const kcalBasisUnit = line.kcalBasisUnit ?? 'g'
    const ignoreCalories = Boolean(line.ignoreCalories)
    if (!ignoreCalories) {
      assertPositive(line.countedAmount ?? NaN, 'Counted amount')
    }
    const countedAmount = normalizeOptionalPositive(
      line.countedAmount,
      'Counted amount',
    )
    if (countedAmount !== undefined) {
      if (kcalBasisUnit === 'g') {
        totalRawWeightGrams = assertFiniteDerived(
          totalRawWeightGrams + countedAmount,
          'Cooked food raw weight',
        )
      }
    }
    const shouldSaveToCatalog =
      persistAllCustomIngredients || Boolean(line.saveToCatalog)
    let savedIngredientId = await assertOwnedIngredientLink(
      db,
      owner,
      line.ingredientId,
    )
    if (!savedIngredientId && shouldSaveToCatalog) {
      savedIngredientId = await saveCustomIngredientToCatalog(
        db,
        owner,
        createdIngredientByKey,
        now,
        {
          name: ingredientName,
          kcalPer100: normalizedKcalPer100,
          kcalBasisUnit,
          ignoreCalories,
        },
      )
    }

    const ingredientCalories = assertFiniteDerived(
      ignoreCalories || countedAmount === undefined
        ? 0
        : (countedAmount * normalizedKcalPer100) / 100,
      'Cooked ingredient calories',
    )
    totalCalories = assertFiniteDerived(
      totalCalories + ingredientCalories,
      'Cooked food total calories',
    )
    ingredientSnapshots.push({
      sourceType: 'custom',
      ingredientId: savedIngredientId,
      ingredientNameSnapshot: ingredientName,
      referenceAmount: line.referenceAmount,
      referenceUnit: line.referenceUnit,
      countedAmount,
      ingredientKcalPer100Snapshot: normalizedKcalPer100,
      ingredientKcalBasisUnitSnapshot: kcalBasisUnit,
      ignoreCaloriesSnapshot: ignoreCalories,
      ingredientCaloriesSnapshot: ingredientCalories,
      notes: normalizeInputNotes(line.notes),
    })
  }

  return {
    totalRawWeightGrams,
    totalCalories,
    kcalPer100: normalizeKcalPer100(
      assertFiniteDerived(
        (totalCalories / finishedWeightGrams) * 100,
        'Cooked food kcal/100',
      ),
      { allowZero: true, fieldName: 'Cooked food kcal/100' },
    ),
    ingredientSnapshots,
  }
}

async function resolveRecipeIngredientLines(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  ingredientLines: Array<
    | {
        sourceType: 'ingredient'
        existingRecipeVersionIngredientId?: Id<'recipeVersionIngredients'>
        ingredientId: Id<'ingredients'>
        expectedSnapshot?: ExpectedNutritionSnapshot
        referenceAmount: number
        referenceUnit: NutritionUnit
        notes?: string | null
      }
    | {
        sourceType: 'custom'
        existingRecipeVersionIngredientId?: Id<'recipeVersionIngredients'>
        ingredientId?: Id<'ingredients'>
        name: string
        kcalPer100: number
        kcalBasisUnit?: NutritionUnit
        ignoreCalories: boolean
        referenceAmount: number
        referenceUnit: NutritionUnit
        saveToCatalog?: boolean
        notes?: string | null
      }
  >,
  options?: {
    persistAllCustomIngredients?: boolean
    existingLinesById?: Map<
      Id<'recipeVersionIngredients'>,
      Doc<'recipeVersionIngredients'>
    >
    allowArchivedIngredientCounts?: Map<Id<'ingredients'>, number>
    allowArchivedCustomIngredientCounts?: Map<Id<'ingredients'>, number>
  },
) {
  if (ingredientLines.length === 0) {
    throw new Error('Recipe needs at least one ingredient.')
  }
  assertArrayLimit(ingredientLines, MAX_INGREDIENT_LINES, 'Recipe ingredients')
  const requestedExistingIds = ingredientLines.flatMap((line) =>
    line.existingRecipeVersionIngredientId
      ? [line.existingRecipeVersionIngredientId]
      : [],
  )
  if (new Set(requestedExistingIds).size !== requestedExistingIds.length) {
    throw new Error('Recipe ingredient references must be unique.')
  }
  for (const existingLineId of requestedExistingIds) {
    if (!options?.existingLinesById?.has(existingLineId)) {
      throw new Error('Existing recipe ingredient not found.')
    }
  }
  const now = Date.now()
  const persistAllCustomIngredients =
    options?.persistAllCustomIngredients ?? false
  const createdIngredientByKey = new Map<string, Promise<Id<'ingredients'>>>()
  const resolvedLines: RecipeIngredientSnapshot[] = []
  for (const line of ingredientLines) {
    assertPositive(line.referenceAmount, 'Ingredient amount')
    if (line.sourceType === 'ingredient') {
      const existing = line.existingRecipeVersionIngredientId
        ? options?.existingLinesById?.get(
            line.existingRecipeVersionIngredientId,
          )
        : undefined
      if (existing) {
        if (
          existing.sourceType !== 'ingredient' ||
          existing.ingredientId !== line.ingredientId
        ) {
          throw new Error(
            'Existing recipe ingredient does not match ingredient.',
          )
        }
        const remaining =
          options?.allowArchivedIngredientCounts?.get(existing.ingredientId) ??
          0
        if (remaining > 0) {
          options?.allowArchivedIngredientCounts?.set(
            existing.ingredientId,
            remaining - 1,
          )
        }
        resolvedLines.push({
          sourceType: 'ingredient',
          ingredientId: existing.ingredientId,
          ingredientNameSnapshot: existing.ingredientNameSnapshot,
          kcalPer100Snapshot: existing.kcalPer100Snapshot,
          kcalBasisUnitSnapshot: existing.kcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot: existing.ignoreCaloriesSnapshot,
          referenceAmount: line.referenceAmount,
          referenceUnit: line.referenceUnit,
          notes: normalizeInputNotes(line.notes, existing.notes),
        })
        continue
      }
      const ingredient = await db.get(line.ingredientId)
      if (!isOwnedBy(ingredient, owner)) {
        throw new Error('One or more ingredients are missing.')
      }
      if (ingredient.archived) {
        const remaining =
          options?.allowArchivedIngredientCounts?.get(ingredient._id) ?? 0
        if (remaining < 1) {
          throw new Error('One or more ingredients are missing.')
        }
        options?.allowArchivedIngredientCounts?.set(
          ingredient._id,
          remaining - 1,
        )
      }
      assertExpectedNutritionSnapshot(
        line.expectedSnapshot,
        {
          name: ingredient.name,
          kcalPer100: ingredient.kcalPer100,
          kcalBasisUnit: ingredient.kcalBasisUnit,
          ignoreCalories: ingredient.ignoreCalories,
        },
        'Ingredient',
      )
      const ignoreCaloriesSnapshot = ingredient.ignoreCalories
      const kcalPer100Snapshot = getIngredientKcalPer100(ingredient)
      if (!ignoreCaloriesSnapshot) {
        assertPositive(kcalPer100Snapshot, 'Ingredient kcal/100')
      }
      resolvedLines.push({
        sourceType: 'ingredient',
        ingredientId: ingredient._id,
        ingredientNameSnapshot: ingredient.name,
        kcalPer100Snapshot,
        kcalBasisUnitSnapshot: ingredient.kcalBasisUnit,
        ignoreCaloriesSnapshot,
        referenceAmount: line.referenceAmount,
        referenceUnit: line.referenceUnit,
        notes: normalizeInputNotes(line.notes),
      })
      continue
    }

    const existing = line.existingRecipeVersionIngredientId
      ? options?.existingLinesById?.get(line.existingRecipeVersionIngredientId)
      : undefined
    if (existing) {
      if (
        existing.sourceType !== 'custom' ||
        existing.ingredientId !== line.ingredientId
      ) {
        throw new Error('Existing recipe ingredient does not match custom.')
      }
      if (existing.ingredientId) {
        const remaining =
          options?.allowArchivedCustomIngredientCounts?.get(
            existing.ingredientId,
          ) ?? 0
        if (remaining > 0) {
          options?.allowArchivedCustomIngredientCounts?.set(
            existing.ingredientId,
            remaining - 1,
          )
        }
      }
    }
    assertNonEmpty(line.name, 'Custom ingredient name')
    const normalizedKcalPer100 = normalizeKcalPer100(line.kcalPer100, {
      allowZero: line.ignoreCalories,
      fieldName: 'Custom ingredient kcal/100',
    })
    const ingredientName = line.name.trim()
    const kcalBasisUnit = line.kcalBasisUnit ?? 'g'
    const ignoreCalories = Boolean(line.ignoreCalories)
    const shouldSaveToCatalog =
      persistAllCustomIngredients || Boolean(line.saveToCatalog)
    let ingredientId = existing?.ingredientId
    if (!existing) {
      ingredientId = await assertOwnedIngredientLink(
        db,
        owner,
        line.ingredientId,
        {
          allowArchivedIngredientCounts:
            options?.allowArchivedCustomIngredientCounts,
        },
      )
    }
    if (!ingredientId && shouldSaveToCatalog) {
      ingredientId = await saveCustomIngredientToCatalog(
        db,
        owner,
        createdIngredientByKey,
        now,
        {
          name: ingredientName,
          kcalPer100: normalizedKcalPer100,
          kcalBasisUnit,
          ignoreCalories,
        },
      )
    }

    resolvedLines.push({
      sourceType: 'custom',
      ingredientId,
      ingredientNameSnapshot: ingredientName,
      kcalPer100Snapshot: normalizedKcalPer100,
      kcalBasisUnitSnapshot: kcalBasisUnit,
      ignoreCaloriesSnapshot: ignoreCalories,
      referenceAmount: line.referenceAmount,
      referenceUnit: line.referenceUnit,
      notes: normalizeInputNotes(line.notes, existing?.notes),
    })
  }

  return resolvedLines
}

async function insertRecipeIngredientSnapshots(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  recipeVersionId: Id<'recipeVersions'>,
  lines: RecipeIngredientSnapshot[],
) {
  await Promise.all(
    lines.map((line) => {
      const common = {
        ...ownerFields(owner),
        recipeVersionId,
        ingredientNameSnapshot: line.ingredientNameSnapshot,
        kcalPer100Snapshot: line.kcalPer100Snapshot,
        kcalBasisUnitSnapshot: line.kcalBasisUnitSnapshot,
        ignoreCaloriesSnapshot: line.ignoreCaloriesSnapshot,
        referenceAmount: line.referenceAmount,
        referenceUnit: line.referenceUnit,
        notes: line.notes,
      }
      return line.sourceType === 'ingredient'
        ? db.insert('recipeVersionIngredients', {
            ...common,
            sourceType: 'ingredient',
            ingredientId: line.ingredientId,
          })
        : db.insert('recipeVersionIngredients', {
            ...common,
            sourceType: 'custom',
            ingredientId: line.ingredientId,
          })
    }),
  )
}

async function insertCookedIngredientSnapshots(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  cookedFoodId: Id<'cookedFoods'>,
  snapshots: CookedIngredientSnapshot[],
) {
  return await Promise.all(
    snapshots.map((snapshot) => {
      const common = {
        ...ownerFields(owner),
        cookedFoodId,
        ingredientNameSnapshot: snapshot.ingredientNameSnapshot,
        referenceAmount: snapshot.referenceAmount,
        referenceUnit: snapshot.referenceUnit,
        countedAmount: snapshot.countedAmount,
        ingredientKcalPer100Snapshot: snapshot.ingredientKcalPer100Snapshot,
        ingredientKcalBasisUnitSnapshot:
          snapshot.ingredientKcalBasisUnitSnapshot,
        ignoreCaloriesSnapshot: snapshot.ignoreCaloriesSnapshot,
        ingredientCaloriesSnapshot: snapshot.ingredientCaloriesSnapshot,
        notes: snapshot.notes,
      }
      return snapshot.sourceType === 'ingredient'
        ? db.insert('cookedFoodIngredients', {
            ...common,
            sourceType: 'ingredient',
            ingredientId: snapshot.ingredientId,
          })
        : db.insert('cookedFoodIngredients', {
            ...common,
            sourceType: 'custom',
            ingredientId: snapshot.ingredientId,
          })
    }),
  )
}

async function reconcileCookedIngredientSnapshots(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  cookedFoodId: Id<'cookedFoods'>,
  existingRows: Doc<'cookedFoodIngredients'>[],
  snapshots: CookedIngredientSnapshot[],
) {
  const retainedIds = new Set(
    snapshots.flatMap((snapshot) =>
      snapshot.existingCookedFoodIngredientId
        ? [snapshot.existingCookedFoodIngredientId]
        : [],
    ),
  )
  await Promise.all(
    existingRows
      .filter((row) => !retainedIds.has(row._id))
      .map((row) => db.delete(row._id)),
  )
  return await Promise.all(
    snapshots.map(async (snapshot) => {
      const common = {
        cookedFoodId,
        ingredientNameSnapshot: snapshot.ingredientNameSnapshot,
        referenceAmount: snapshot.referenceAmount,
        referenceUnit: snapshot.referenceUnit,
        countedAmount: snapshot.countedAmount,
        ingredientKcalPer100Snapshot: snapshot.ingredientKcalPer100Snapshot,
        ingredientKcalBasisUnitSnapshot:
          snapshot.ingredientKcalBasisUnitSnapshot,
        ignoreCaloriesSnapshot: snapshot.ignoreCaloriesSnapshot,
        ingredientCaloriesSnapshot: snapshot.ingredientCaloriesSnapshot,
        notes: snapshot.notes,
      }
      if (snapshot.existingCookedFoodIngredientId) {
        await db.patch(
          snapshot.existingCookedFoodIngredientId,
          snapshot.sourceType === 'ingredient'
            ? {
                ...common,
                sourceType: 'ingredient',
                ingredientId: snapshot.ingredientId,
              }
            : {
                ...common,
                sourceType: 'custom',
                ingredientId: snapshot.ingredientId,
              },
        )
        return snapshot.existingCookedFoodIngredientId
      }
      return await (snapshot.sourceType === 'ingredient'
        ? db.insert('cookedFoodIngredients', {
            ...ownerFields(owner),
            ...common,
            sourceType: 'ingredient',
            ingredientId: snapshot.ingredientId,
          })
        : db.insert('cookedFoodIngredients', {
            ...ownerFields(owner),
            ...common,
            sourceType: 'custom',
            ingredientId: snapshot.ingredientId,
          }))
    }),
  )
}

async function buildMealItemSnapshots(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  items: Array<
    | {
        sourceType: 'ingredient'
        existingMealItemId?: Id<'mealItems'>
        ingredientId: Id<'ingredients'>
        expectedSnapshot?: ExpectedNutritionSnapshot
        consumedWeightGrams: number
        notes?: string | null
      }
    | {
        sourceType: 'customByWeight'
        existingMealItemId?: Id<'mealItems'>
        ingredientId?: Id<'ingredients'>
        name: string
        kcalPer100: number
        kcalBasisUnit?: 'g'
        ignoreCalories: boolean
        consumedWeightGrams: number
        saveToCatalog?: boolean
        notes?: string | null
      }
    | {
        sourceType: 'cookedFood'
        existingMealItemId?: Id<'mealItems'>
        cookedFoodId: Id<'cookedFoods'>
        expectedSnapshot?: ExpectedNutritionSnapshot
        consumedWeightGrams: number
        notes?: string | null
      }
    | {
        sourceType: 'fixedCalories'
        existingMealItemId?: Id<'mealItems'>
        name: string
        calories: number
        notes?: string | null
      }
  >,
  options?: {
    existingItemsById?: ReadonlyMap<Id<'mealItems'>, Doc<'mealItems'>>
  },
): Promise<MealItemSnapshot[]> {
  if (items.length === 0) {
    throw new Error('At least one meal item is required.')
  }
  assertArrayLimit(items, MAX_INGREDIENT_LINES, 'Meal items')
  const requestedExistingIds = items.flatMap((item) =>
    item.existingMealItemId ? [item.existingMealItemId] : [],
  )
  if (new Set(requestedExistingIds).size !== requestedExistingIds.length) {
    throw new Error('Meal item references must be unique.')
  }
  for (const existingMealItemId of requestedExistingIds) {
    if (!options?.existingItemsById?.has(existingMealItemId)) {
      throw new Error('Existing meal item not found.')
    }
  }
  const createdIngredientByKey = new Map<string, Promise<Id<'ingredients'>>>()
  const now = Date.now()

  return await Promise.all(
    items.map(async (item) => {
      if (item.sourceType === 'ingredient') {
        const existing = item.existingMealItemId
          ? options?.existingItemsById?.get(item.existingMealItemId)
          : undefined
        assertPositive(item.consumedWeightGrams, 'Consumed weight')
        if (existing) {
          if (
            existing.sourceType !== 'ingredient' ||
            existing.ingredientId !== item.ingredientId
          ) {
            throw new Error('Existing meal item does not match ingredient.')
          }
          const calories = existing.ignoreCaloriesSnapshot
            ? 0
            : scaleHistoricalCalories(existing, item.consumedWeightGrams)
          return {
            sourceType: 'ingredient' as const,
            ingredientId: existing.ingredientId,
            nameSnapshot: existing.nameSnapshot,
            consumedWeightGrams: item.consumedWeightGrams,
            kcalPer100Snapshot: existing.kcalPer100Snapshot,
            kcalBasisUnitSnapshot: existing.kcalBasisUnitSnapshot,
            ignoreCaloriesSnapshot: existing.ignoreCaloriesSnapshot,
            caloriesSnapshot: calories,
            notes: normalizeInputNotes(item.notes, existing.notes),
          }
        }
        const ingredient = await db.get(item.ingredientId)
        if (!isOwnedBy(ingredient, owner) || ingredient.archived) {
          throw new Error('Meal ingredient not found.')
        }
        assertExpectedNutritionSnapshot(
          item.expectedSnapshot,
          {
            name: ingredient.name,
            kcalPer100: ingredient.kcalPer100,
            kcalBasisUnit: ingredient.kcalBasisUnit,
            ignoreCalories: ingredient.ignoreCalories,
          },
          'Ingredient',
        )
        const consumedWeightGrams = item.consumedWeightGrams
        const ignoreCalories = ingredient.ignoreCalories
        const ingredientKcalPer100 = getIngredientKcalPer100(ingredient)
        const kcalBasisUnit = ingredient.kcalBasisUnit
        if (kcalBasisUnit !== 'g') {
          throw new Error(
            'Only gram-based ingredients can be added directly to meals.',
          )
        }
        if (!ignoreCalories) {
          assertPositive(ingredientKcalPer100, 'Ingredient kcal/100')
        }
        const calories = assertFiniteDerived(
          ignoreCalories
            ? 0
            : (consumedWeightGrams * ingredientKcalPer100) / 100,
          'Meal item calories',
        )
        return {
          sourceType: 'ingredient' as const,
          ingredientId: ingredient._id,
          nameSnapshot: ingredient.name,
          consumedWeightGrams,
          kcalPer100Snapshot: ingredientKcalPer100,
          kcalBasisUnitSnapshot: kcalBasisUnit,
          ignoreCaloriesSnapshot: ignoreCalories,
          caloriesSnapshot: calories,
          notes: normalizeInputNotes(item.notes),
        }
      }

      if (item.sourceType === 'customByWeight') {
        const existing = item.existingMealItemId
          ? options?.existingItemsById?.get(item.existingMealItemId)
          : undefined
        assertPositive(item.consumedWeightGrams, 'Consumed weight')
        if (existing) {
          if (
            existing.sourceType !== 'customByWeight' ||
            (item.ingredientId !== undefined &&
              item.ingredientId !== existing.ingredientId)
          ) {
            throw new Error('Existing meal item does not match custom item.')
          }
        }
        const ingredientName = normalizeRequiredText(
          item.name,
          'Custom ingredient name',
        )
        const normalizedKcalPer100 = normalizeKcalPer100(item.kcalPer100, {
          allowZero: item.ignoreCalories,
          fieldName: 'Custom ingredient kcal/100',
        })
        const consumedWeightGrams = item.consumedWeightGrams
        const kcalBasisUnit =
          item.kcalBasisUnit ??
          (existing?.sourceType === 'customByWeight'
            ? existing.kcalBasisUnitSnapshot
            : 'g')
        if (kcalBasisUnit !== 'g') {
          throw new Error('Custom meal items must use a gram calorie basis.')
        }
        let ingredientId = await assertOwnedIngredientLink(
          db,
          owner,
          item.ingredientId ??
            (existing?.sourceType === 'customByWeight'
              ? existing.ingredientId
              : undefined),
          {
            allowArchivedIngredientId:
              existing?.sourceType === 'customByWeight'
                ? existing.ingredientId
                : undefined,
          },
        )
        if (!ingredientId && item.saveToCatalog) {
          ingredientId = await saveCustomIngredientToCatalog(
            db,
            owner,
            createdIngredientByKey,
            now,
            {
              name: ingredientName,
              kcalPer100: normalizedKcalPer100,
              kcalBasisUnit,
              ignoreCalories: item.ignoreCalories,
            },
          )
        }

        const calories = assertFiniteDerived(
          item.ignoreCalories
            ? 0
            : (consumedWeightGrams * normalizedKcalPer100) / 100,
          'Meal item calories',
        )
        return {
          sourceType: 'customByWeight' as const,
          ingredientId,
          nameSnapshot: ingredientName,
          consumedWeightGrams,
          kcalPer100Snapshot: normalizedKcalPer100,
          kcalBasisUnitSnapshot: kcalBasisUnit,
          ignoreCaloriesSnapshot: item.ignoreCalories,
          caloriesSnapshot: calories,
          notes: normalizeInputNotes(
            item.notes,
            existing?.sourceType === 'customByWeight'
              ? existing.notes
              : undefined,
          ),
        }
      }

      if (item.sourceType === 'fixedCalories') {
        const existing = item.existingMealItemId
          ? options?.existingItemsById?.get(item.existingMealItemId)
          : undefined
        if (existing && existing.sourceType !== 'fixedCalories') {
          throw new Error('Existing meal item does not match fixed item.')
        }
        const nameSnapshot = normalizeRequiredText(item.name, 'Item name')
        assertNonNegative(item.calories, 'Calories')
        return {
          sourceType: 'fixedCalories' as const,
          nameSnapshot,
          caloriesSnapshot: assertFiniteDerived(
            item.calories,
            'Meal item calories',
          ),
          notes: normalizeInputNotes(item.notes, existing?.notes),
        }
      }

      assertPositive(item.consumedWeightGrams, 'Consumed weight')
      const existing = item.existingMealItemId
        ? options?.existingItemsById?.get(item.existingMealItemId)
        : undefined
      if (existing) {
        if (
          existing.sourceType !== 'cookedFood' ||
          existing.cookedFoodId !== item.cookedFoodId
        ) {
          throw new Error('Existing meal item does not match cooked food.')
        }
        const calories = scaleHistoricalCalories(
          existing,
          item.consumedWeightGrams,
        )
        return {
          sourceType: 'cookedFood' as const,
          cookedFoodId: existing.cookedFoodId,
          nameSnapshot: existing.nameSnapshot,
          consumedWeightGrams: item.consumedWeightGrams,
          kcalPer100Snapshot: existing.kcalPer100Snapshot,
          kcalBasisUnitSnapshot: existing.kcalBasisUnitSnapshot,
          ignoreCaloriesSnapshot: existing.ignoreCaloriesSnapshot,
          caloriesSnapshot: calories,
          notes: normalizeInputNotes(item.notes, existing.notes),
        }
      }
      const cookedFood = await db.get(item.cookedFoodId)
      if (!isOwnedBy(cookedFood, owner) || cookedFood.archived) {
        throw new Error('Meal cooked food item not found.')
      }
      assertExpectedNutritionSnapshot(
        item.expectedSnapshot,
        {
          name: cookedFood.name,
          kcalPer100: cookedFood.kcalPer100,
          kcalBasisUnit: 'g',
          ignoreCalories: false,
        },
        'Cooked food',
      )
      const cookedFoodKcalPer100 = normalizeKcalPer100(cookedFood.kcalPer100, {
        allowZero: true,
        fieldName: 'Meal cooked food kcal/100',
      })
      const calories = assertFiniteDerived(
        (item.consumedWeightGrams * cookedFoodKcalPer100) / 100,
        'Meal item calories',
      )
      return {
        sourceType: 'cookedFood' as const,
        cookedFoodId: cookedFood._id,
        nameSnapshot: cookedFood.name,
        consumedWeightGrams: item.consumedWeightGrams,
        kcalPer100Snapshot: cookedFoodKcalPer100,
        kcalBasisUnitSnapshot: 'g' as const,
        ignoreCaloriesSnapshot: false,
        caloriesSnapshot: calories,
        notes: normalizeInputNotes(item.notes),
      }
    }),
  )
}

async function insertMealItemSnapshots(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  mealId: Id<'meals'>,
  snapshots: MealItemSnapshot[],
) {
  await Promise.all(
    snapshots.map((snapshot) => {
      const common = {
        ...ownerFields(owner),
        mealId,
        nameSnapshot: snapshot.nameSnapshot,
        caloriesSnapshot: snapshot.caloriesSnapshot,
        notes: snapshot.notes,
      }
      if (snapshot.sourceType === 'fixedCalories') {
        return db.insert('mealItems', {
          ...common,
          sourceType: 'fixedCalories',
        })
      }
      const weighted = {
        ...common,
        consumedWeightGrams: snapshot.consumedWeightGrams,
        kcalPer100Snapshot: snapshot.kcalPer100Snapshot,
        kcalBasisUnitSnapshot: snapshot.kcalBasisUnitSnapshot,
        ignoreCaloriesSnapshot: snapshot.ignoreCaloriesSnapshot,
      }
      if (snapshot.sourceType === 'ingredient') {
        return db.insert('mealItems', {
          ...weighted,
          sourceType: 'ingredient',
          ingredientId: snapshot.ingredientId,
        })
      }
      if (snapshot.sourceType === 'customByWeight') {
        return db.insert('mealItems', {
          ...weighted,
          sourceType: 'customByWeight',
          ingredientId: snapshot.ingredientId,
          kcalBasisUnitSnapshot: 'g',
        })
      }
      return db.insert('mealItems', {
        ...weighted,
        sourceType: 'cookedFood',
        cookedFoodId: snapshot.cookedFoodId,
      })
    }),
  )
}

function sumMealItemCalories(snapshots: MealItemSnapshot[]) {
  return snapshots.reduce(
    (total, item) =>
      assertFiniteDerived(total + item.caloriesSnapshot, 'Meal total calories'),
    0,
  )
}

async function adjustDailySummary(
  db: DatabaseWriter,
  owner: AuthenticatedOwner,
  key: { personId: Id<'people'>; eatenOn: string },
  delta: { consumedCalories: number; mealCount: number },
  now: number,
) {
  assertFiniteDerived(delta.consumedCalories, 'Daily summary calorie change')
  assertSafeDerivedInteger(delta.mealCount, 'Daily summary meal count change')
  if (delta.consumedCalories === 0 && delta.mealCount === 0) {
    return
  }
  const current = await db
    .query('dailySummaries')
    .withIndex('by_ownerTokenIdentifier_and_personId_and_eatenOn', (q) =>
      q
        .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
        .eq('personId', key.personId)
        .eq('eatenOn', key.eatenOn),
    )
    .unique()
  const consumedCalories = assertFiniteDerived(
    (current?.consumedCalories ?? 0) + delta.consumedCalories,
    'Daily summary calories',
  )
  const mealCount = assertSafeDerivedInteger(
    (current?.mealCount ?? 0) + delta.mealCount,
    'Daily summary meal count',
  )
  if (mealCount < 0 || consumedCalories < -0.000_001) {
    throw new Error('Daily summary would become inconsistent.')
  }
  if (mealCount === 0) {
    if (current) {
      await db.delete(current._id)
    }
    return
  }
  if (current) {
    await db.patch(current._id, {
      consumedCalories: Math.max(0, consumedCalories),
      mealCount,
      updatedAt: now,
    })
    return
  }
  await db.insert('dailySummaries', {
    ...ownerFields(owner),
    ...key,
    consumedCalories,
    mealCount,
    createdAt: now,
    updatedAt: now,
  })
}

async function touchCookSession(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  sessionId: Id<'cookSessions'>,
  updatedAt = Date.now(),
) {
  const session = await ctx.db.get(sessionId)
  if (!isOwnedBy(session, owner)) {
    return
  }
  await ctx.db.patch(sessionId, { updatedAt })
}

async function deleteCookedFoodWithChildren(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  cookedFoodId: Id<'cookedFoods'>,
) {
  const cookedFood = assertOwnedOrThrow(
    await ctx.db.get(cookedFoodId),
    owner,
    'Cooked food not found.',
  )
  const mealRefs = await ctx.db
    .query('mealItems')
    .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
      q
        .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
        .eq('cookedFoodId', cookedFoodId),
    )
    .first()
  if (mealRefs) {
    throw new Error('Cooked food is in meal history. Archive instead.')
  }

  const ingredientRows = await ctx.db
    .query('cookedFoodIngredients')
    .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
      q
        .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
        .eq('cookedFoodId', cookedFoodId),
    )
    .take(MAX_INGREDIENT_LINES + 1)
  if (ingredientRows.length > MAX_INGREDIENT_LINES) {
    throw new Error(
      'Cooked food is too large to delete safely. Archive instead.',
    )
  }
  await Promise.all(ingredientRows.map((row) => ctx.db.delete(row._id)))

  await ctx.db.delete(cookedFoodId)
  return cookedFood.cookSessionId
}

export const createPerson = mutation({
  args: {
    name: v.string(),
    currentDailyGoalKcal: v.number(),
    notes: v.optional(v.string()),
    effectiveDate: v.string(),
  },
  returns: v.id('people'),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertNonEmpty(args.name, 'Name')
    assertPositive(args.currentDailyGoalKcal, 'Daily goal')
    const now = Date.now()
    const personId = await ctx.db.insert('people', {
      ...ownerFields(owner),
      name: args.name.trim(),
      notes: normalizeOptionalText(args.notes, 'Notes', MAX_NOTES_LENGTH),
      currentDailyGoalKcal: args.currentDailyGoalKcal,
      editRevision: 0,
      archived: false,
      createdAt: now,
    })
    await ctx.db.insert('personGoalHistory', {
      ...ownerFields(owner),
      personId,
      effectiveDate: normalizeRequiredDate(
        args.effectiveDate,
        'Effective date',
      ),
      goalKcal: args.currentDailyGoalKcal,
      reason: 'Initial goal',
      createdAt: now,
    })
    return personId
  },
})

export const updatePerson = mutation({
  args: {
    personId: v.id('people'),
    expectedEditRevision: v.number(),
    name: v.string(),
    notes: optionalNullableStringValidator,
    goalKcal: v.optional(v.number()),
    effectiveDate: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const person = assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      owner,
      'Person not found.',
    )
    assertExpectedEditRevision(person, args.expectedEditRevision, 'Person')
    assertNonEmpty(args.name, 'Name')
    const personPatch: Partial<Doc<'people'>> = {
      name: args.name.trim(),
      editRevision: nextEditRevision(person, 'Person'),
    }
    if (args.notes !== undefined) {
      personPatch.notes = normalizeNullableText(args.notes)
    }
    const goalChanged =
      args.goalKcal !== undefined &&
      args.goalKcal !== person.currentDailyGoalKcal
    if (args.goalKcal !== undefined) {
      assertPositive(args.goalKcal, 'Goal')
      if (goalChanged) {
        personPatch.currentDailyGoalKcal = args.goalKcal
      }
    }
    await ctx.db.patch(args.personId, personPatch)
    if (goalChanged && args.goalKcal !== undefined) {
      const now = Date.now()
      await ctx.db.insert('personGoalHistory', {
        ...ownerFields(owner),
        personId: args.personId,
        effectiveDate: normalizeRequiredDate(
          args.effectiveDate,
          'Effective date',
        ),
        goalKcal: args.goalKcal,
        reason: normalizeOptionalText(
          args.reason,
          'Goal reason',
          MAX_DESCRIPTION_LENGTH,
        ),
        createdAt: now,
      })
    }
  },
})

export const updatePersonGoal = mutation({
  args: {
    personId: v.id('people'),
    expectedEditRevision: v.number(),
    goalKcal: v.number(),
    effectiveDate: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertPositive(args.goalKcal, 'Goal')
    const person = assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      owner,
      'Person not found.',
    )
    assertExpectedEditRevision(person, args.expectedEditRevision, 'Person')
    if (args.goalKcal === person.currentDailyGoalKcal) {
      return
    }
    const now = Date.now()
    await ctx.db.patch(args.personId, {
      currentDailyGoalKcal: args.goalKcal,
      editRevision: nextEditRevision(person, 'Person'),
    })
    await ctx.db.insert('personGoalHistory', {
      ...ownerFields(owner),
      personId: args.personId,
      effectiveDate: normalizeRequiredDate(
        args.effectiveDate,
        'Effective date',
      ),
      goalKcal: args.goalKcal,
      reason: normalizeOptionalText(
        args.reason,
        'Goal reason',
        MAX_DESCRIPTION_LENGTH,
      ),
      createdAt: now,
    })
  },
})

export const setPersonArchived = mutation({
  args: {
    personId: v.id('people'),
    expectedEditRevision: v.number(),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const person = assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      owner,
      'Person not found.',
    )
    assertExpectedEditRevision(person, args.expectedEditRevision, 'Person')
    if (person.archived === args.archived) {
      return
    }
    await ctx.db.patch(args.personId, {
      archived: args.archived,
      editRevision: nextEditRevision(person, 'Person'),
    })
  },
})

export const deletePerson = mutation({
  args: {
    personId: v.id('people'),
    expectedEditRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const person = assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      owner,
      'Person not found.',
    )
    assertExpectedEditRevision(person, args.expectedEditRevision, 'Person')
    const [mealRefs, cookingRefs] = await Promise.all([
      ctx.db
        .query('meals')
        .withIndex('by_ownerTokenIdentifier_and_personId_and_eatenOn', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('personId', args.personId),
        )
        .first(),
      ctx.db
        .query('cookSessions')
        .withIndex('by_ownerTokenIdentifier_and_cookedByPersonId', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('cookedByPersonId', args.personId),
        )
        .first(),
    ])
    if (mealRefs || cookingRefs) {
      throw new Error(
        'Cannot delete person with meal/cooking history. Archive instead.',
      )
    }
    const goalRows = await ctx.db
      .query('personGoalHistory')
      .withIndex('by_ownerTokenIdentifier_and_personId_and_createdAt', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('personId', args.personId),
      )
      .take(MAX_INGREDIENT_LINES + 1)
    if (goalRows.length > MAX_INGREDIENT_LINES) {
      throw new Error(
        'Person has too much goal history to delete. Archive instead.',
      )
    }
    await Promise.all(goalRows.map((row) => ctx.db.delete(row._id)))
    await ctx.db.delete(args.personId)
  },
})

export const createFoodGroup = mutation({
  args: {
    name: v.string(),
    appliesTo: groupScopeValidator,
  },
  returns: v.id('foodGroups'),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertNonEmpty(args.name, 'Group name')
    const now = Date.now()
    return await ctx.db.insert('foodGroups', {
      ...ownerFields(owner),
      name: args.name.trim(),
      appliesTo: args.appliesTo,
      editRevision: 0,
      archived: false,
      createdAt: now,
    })
  },
})

export const updateFoodGroup = mutation({
  args: {
    groupId: v.id('foodGroups'),
    expectedEditRevision: v.number(),
    name: v.string(),
    appliesTo: groupScopeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertNonEmpty(args.name, 'Group name')
    const group = assertOwnedOrThrow(
      await ctx.db.get(args.groupId),
      owner,
      'Group not found.',
    )
    assertExpectedEditRevision(group, args.expectedEditRevision, 'Group')
    if (group.appliesTo !== args.appliesTo) {
      const [ingredients, cookedFoods] = await Promise.all([
        ctx.db
          .query('ingredients')
          .withIndex('by_ownerTokenIdentifier_and_groupId', (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('groupId', args.groupId),
          )
          .first(),
        ctx.db
          .query('cookedFoods')
          .withIndex('by_ownerTokenIdentifier_and_groupId', (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('groupId', args.groupId),
          )
          .first(),
      ])
      if (ingredients || cookedFoods) {
        throw new Error(
          'Group scope cannot change while the group is assigned to records.',
        )
      }
    }
    await ctx.db.patch(args.groupId, {
      name: args.name.trim(),
      appliesTo: args.appliesTo,
      editRevision: nextEditRevision(group, 'Group'),
    })
  },
})

export const setFoodGroupArchived = mutation({
  args: {
    groupId: v.id('foodGroups'),
    expectedEditRevision: v.number(),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const group = assertOwnedOrThrow(
      await ctx.db.get(args.groupId),
      owner,
      'Group not found.',
    )
    assertExpectedEditRevision(group, args.expectedEditRevision, 'Group')
    if (group.archived === args.archived) {
      return
    }
    await ctx.db.patch(args.groupId, {
      archived: args.archived,
      editRevision: nextEditRevision(group, 'Group'),
    })
  },
})

export const deleteFoodGroup = mutation({
  args: {
    groupId: v.id('foodGroups'),
    expectedEditRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const group = assertOwnedOrThrow(
      await ctx.db.get(args.groupId),
      owner,
      'Group not found.',
    )
    assertExpectedEditRevision(group, args.expectedEditRevision, 'Group')
    const [ingredients, cookedFoods] = await Promise.all([
      ctx.db
        .query('ingredients')
        .withIndex('by_ownerTokenIdentifier_and_groupId', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('groupId', args.groupId),
        )
        .first(),
      ctx.db
        .query('cookedFoods')
        .withIndex('by_ownerTokenIdentifier_and_groupId', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('groupId', args.groupId),
        )
        .first(),
    ])
    const inUse = Boolean(ingredients || cookedFoods)
    if (inUse) {
      throw new Error(
        'Group is used by records. Archive instead or remove references first.',
      )
    }
    await ctx.db.delete(args.groupId)
  },
})

export const createIngredient = mutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    kcalPer100: v.number(),
    kcalBasisUnit: v.optional(nutritionUnitValidator),
    ignoreCalories: v.boolean(),
    groupId: v.optional(v.id('foodGroups')),
    notes: v.optional(v.string()),
  },
  returns: v.id('ingredients'),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertNonEmpty(args.name, 'Ingredient name')
    const normalizedKcalPer100 = normalizeKcalPer100(args.kcalPer100, {
      allowZero: args.ignoreCalories,
      fieldName: 'kcal/100',
    })
    await assertGroupForScope(ctx.db, owner, args.groupId, 'ingredient')

    const now = Date.now()
    return await ctx.db.insert('ingredients', {
      ...ownerFields(owner),
      name: args.name.trim(),
      brand: normalizeOptionalText(args.brand, 'Brand', MAX_NAME_LENGTH),
      kcalPer100: normalizedKcalPer100,
      kcalBasisUnit: args.kcalBasisUnit ?? 'g',
      ignoreCalories: args.ignoreCalories,
      editRevision: 0,
      groupId: args.groupId,
      notes: normalizeOptionalText(
        args.notes,
        'Ingredient notes',
        MAX_NOTES_LENGTH,
      ),
      archived: false,
      createdAt: now,
    })
  },
})

export const updateIngredient = mutation({
  args: {
    ingredientId: v.id('ingredients'),
    expectedEditRevision: v.number(),
    name: v.string(),
    brand: v.optional(v.string()),
    kcalPer100: v.number(),
    kcalBasisUnit: v.optional(nutritionUnitValidator),
    ignoreCalories: v.boolean(),
    groupId: v.optional(v.id('foodGroups')),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const ingredient = assertOwnedOrThrow(
      await ctx.db.get(args.ingredientId),
      owner,
      'Ingredient not found.',
    )
    assertExpectedEditRevision(
      ingredient,
      args.expectedEditRevision,
      'Ingredient',
    )
    assertNonEmpty(args.name, 'Ingredient name')
    const normalizedKcalPer100 = normalizeKcalPer100(args.kcalPer100, {
      allowZero: args.ignoreCalories,
      fieldName: 'kcal/100',
    })
    await assertGroupForScope(
      ctx.db,
      owner,
      args.groupId,
      'ingredient',
      ingredient.groupId,
    )
    await ctx.db.patch(args.ingredientId, {
      name: args.name.trim(),
      brand: normalizeOptionalText(args.brand, 'Brand', MAX_NAME_LENGTH),
      kcalPer100: normalizedKcalPer100,
      kcalBasisUnit: args.kcalBasisUnit ?? ingredient.kcalBasisUnit,
      ignoreCalories: args.ignoreCalories,
      editRevision: nextEditRevision(ingredient, 'Ingredient'),
      groupId: args.groupId,
      notes: normalizeOptionalText(
        args.notes,
        'Ingredient notes',
        MAX_NOTES_LENGTH,
      ),
    })
  },
})

export const setIngredientArchived = mutation({
  args: {
    ingredientId: v.id('ingredients'),
    expectedEditRevision: v.number(),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const ingredient = assertOwnedOrThrow(
      await ctx.db.get(args.ingredientId),
      owner,
      'Ingredient not found.',
    )
    assertExpectedEditRevision(
      ingredient,
      args.expectedEditRevision,
      'Ingredient',
    )
    if (ingredient.archived === args.archived) {
      return
    }
    await ctx.db.patch(args.ingredientId, {
      archived: args.archived,
      editRevision: nextEditRevision(ingredient, 'Ingredient'),
    })
  },
})

export const deleteIngredient = mutation({
  args: {
    ingredientId: v.id('ingredients'),
    expectedEditRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const ingredient = assertOwnedOrThrow(
      await ctx.db.get(args.ingredientId),
      owner,
      'Ingredient not found.',
    )
    assertExpectedEditRevision(
      ingredient,
      args.expectedEditRevision,
      'Ingredient',
    )
    const [recipeRefs, cookedRefs, mealRefs] = await Promise.all([
      ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier_and_ingredientId', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('ingredientId', args.ingredientId),
        )
        .first(),
      ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ownerTokenIdentifier_and_ingredientId', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('ingredientId', args.ingredientId),
        )
        .first(),
      ctx.db
        .query('mealItems')
        .withIndex('by_ownerTokenIdentifier_and_ingredientId', (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('ingredientId', args.ingredientId),
        )
        .first(),
    ])
    if (recipeRefs || cookedRefs || mealRefs) {
      throw new Error('Ingredient is in historical records. Archive instead.')
    }
    await ctx.db.delete(args.ingredientId)
  },
})

export const createRecipe = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    notes: v.optional(v.string()),
    ingredientLines: v.array(recipeIngredientValidator),
  },
  returns: v.object({
    recipeId: v.id('recipes'),
    recipeVersionId: v.id('recipeVersions'),
  }),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const recipeName = normalizeRequiredText(args.name, 'Recipe name')
    const resolvedLines = await resolveRecipeIngredientLines(
      ctx.db,
      owner,
      args.ingredientLines,
    )

    const now = Date.now()
    const recipeId = await ctx.db.insert('recipes', {
      ...ownerFields(owner),
      name: recipeName,
      description: normalizeOptionalText(
        args.description,
        'Recipe description',
        MAX_DESCRIPTION_LENGTH,
      ),
      archived: false,
      latestVersionNumber: 1,
      editRevision: 0,
      createdAt: now,
    })

    const versionId = await ctx.db.insert('recipeVersions', {
      ...ownerFields(owner),
      recipeId,
      versionNumber: 1,
      name: recipeName,
      instructions: normalizeOptionalText(
        args.instructions,
        'Recipe instructions',
        MAX_INSTRUCTIONS_LENGTH,
      ),
      notes: normalizeOptionalText(
        args.notes,
        'Recipe notes',
        MAX_NOTES_LENGTH,
      ),
      createdAt: now,
    })

    await insertRecipeIngredientSnapshots(
      ctx.db,
      owner,
      versionId,
      resolvedLines,
    )

    return { recipeId, recipeVersionId: versionId }
  },
})

export const updateRecipeCurrentVersion = mutation({
  args: {
    recipeId: v.id('recipes'),
    expectedRecipeVersionId: v.id('recipeVersions'),
    expectedEditRevision: v.number(),
    name: v.string(),
    description: optionalNullableStringValidator,
    instructions: optionalNullableStringValidator,
    notes: optionalNullableStringValidator,
    ingredientLines: v.array(recipeIngredientValidator),
  },
  returns: v.object({
    recipeVersionId: v.id('recipeVersions'),
    versionNumber: v.number(),
  }),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const recipe = assertOwnedOrThrow(
      await ctx.db.get(args.recipeId),
      owner,
      'Recipe not found.',
    )
    assertExpectedEditRevision(recipe, args.expectedEditRevision, 'Recipe')
    const recipeName = normalizeRequiredText(args.name, 'Recipe name')
    const current = await ctx.db
      .query('recipeVersions')
      .withIndex(
        'by_ownerTokenIdentifier_and_recipeId_and_versionNumber',
        (q) =>
          q
            .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
            .eq('recipeId', args.recipeId)
            .eq('versionNumber', recipe.latestVersionNumber),
      )
      .unique()
    if (!current) {
      throw new Error('Current recipe version not found.')
    }
    if (current._id !== args.expectedRecipeVersionId) {
      throw new Error(
        'Recipe changed since editing began. Refresh and try again.',
      )
    }
    const currentLines = await ctx.db
      .query('recipeVersionIngredients')
      .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('recipeVersionId', current._id),
      )
      .take(MAX_INGREDIENT_LINES + 1)
    if (currentLines.length > MAX_INGREDIENT_LINES) {
      throw new Error('Recipe has too many ingredient rows to update safely.')
    }
    const existingLinesById = new Map(
      currentLines.map((line) => [line._id, line] as const),
    )
    const allowArchivedIngredientCounts = new Map<Id<'ingredients'>, number>()
    const allowArchivedCustomIngredientCounts = new Map<
      Id<'ingredients'>,
      number
    >()
    for (const line of currentLines) {
      if (line.sourceType === 'ingredient') {
        allowArchivedIngredientCounts.set(
          line.ingredientId,
          (allowArchivedIngredientCounts.get(line.ingredientId) ?? 0) + 1,
        )
      } else if (line.ingredientId) {
        allowArchivedCustomIngredientCounts.set(
          line.ingredientId,
          (allowArchivedCustomIngredientCounts.get(line.ingredientId) ?? 0) + 1,
        )
      }
    }
    const resolvedLines = await resolveRecipeIngredientLines(
      ctx.db,
      owner,
      args.ingredientLines,
      {
        existingLinesById,
        allowArchivedIngredientCounts,
        allowArchivedCustomIngredientCounts,
      },
    )
    const nextVersionNumber = assertSafeDerivedInteger(
      recipe.latestVersionNumber + 1,
      'Recipe version number',
    )
    if (nextVersionNumber <= 1) {
      throw new Error('Recipe version number must be greater than 1.')
    }

    const recipePatch: {
      name: string
      description?: string
      latestVersionNumber: number
      editRevision: number
    } = {
      name: recipeName,
      latestVersionNumber: nextVersionNumber,
      editRevision: nextEditRevision(recipe, 'Recipe'),
    }
    if (args.description !== undefined) {
      recipePatch.description = normalizeNullableText(
        args.description,
        'Recipe description',
        MAX_DESCRIPTION_LENGTH,
      )
    }
    await ctx.db.patch(args.recipeId, recipePatch)
    const nextVersionId = await ctx.db.insert('recipeVersions', {
      ...ownerFields(owner),
      recipeId: args.recipeId,
      versionNumber: nextVersionNumber,
      name: recipeName,
      instructions:
        args.instructions === undefined
          ? current.instructions
          : normalizeNullableText(
              args.instructions,
              'Recipe instructions',
              MAX_INSTRUCTIONS_LENGTH,
            ),
      notes:
        args.notes === undefined
          ? current.notes
          : normalizeNullableText(args.notes),
      createdAt: Date.now(),
    })

    await insertRecipeIngredientSnapshots(
      ctx.db,
      owner,
      nextVersionId,
      resolvedLines,
    )

    return { recipeVersionId: nextVersionId, versionNumber: nextVersionNumber }
  },
})

export const setRecipeArchived = mutation({
  args: {
    recipeId: v.id('recipes'),
    expectedEditRevision: v.number(),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const recipe = assertOwnedOrThrow(
      await ctx.db.get(args.recipeId),
      owner,
      'Recipe not found.',
    )
    assertExpectedEditRevision(recipe, args.expectedEditRevision, 'Recipe')
    if (recipe.archived === args.archived) {
      return
    }
    await ctx.db.patch(args.recipeId, {
      archived: args.archived,
      editRevision: nextEditRevision(recipe, 'Recipe'),
    })
  },
})

export const deleteRecipe = mutation({
  args: {
    recipeId: v.id('recipes'),
    expectedEditRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const recipe = assertOwnedOrThrow(
      await ctx.db.get(args.recipeId),
      owner,
      'Recipe not found.',
    )
    assertExpectedEditRevision(recipe, args.expectedEditRevision, 'Recipe')
    const cookedRef = await ctx.db
      .query('cookedFoods')
      .withIndex('by_ownerTokenIdentifier_and_recipeId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('recipeId', args.recipeId),
      )
      .first()
    if (cookedRef) {
      throw new Error('Recipe has cooked history. Archive instead.')
    }

    const versions = await ctx.db
      .query('recipeVersions')
      .withIndex('by_ownerTokenIdentifier_and_recipeId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('recipeId', args.recipeId),
      )
      .take(2)
    if (versions.length !== 1) {
      throw new Error(
        'Only single-version recipes can be deleted. Archive instead.',
      )
    }
    const versionIngredients = await ctx.db
      .query('recipeVersionIngredients')
      .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('recipeVersionId', versions[0]._id),
      )
      .take(MAX_INGREDIENT_LINES + 1)
    if (versionIngredients.length > MAX_INGREDIENT_LINES) {
      throw new Error('Recipe is too large to delete safely. Archive instead.')
    }
    await Promise.all(versionIngredients.map((line) => ctx.db.delete(line._id)))
    await ctx.db.delete(versions[0]._id)
    await ctx.db.delete(args.recipeId)
  },
})

export const createCookSession = mutation({
  args: {
    label: v.optional(v.string()),
    cookedAt: v.number(),
    cookedByPersonId: v.optional(v.id('people')),
    notes: v.optional(v.string()),
  },
  returns: v.id('cookSessions'),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertSafeTimestamp(args.cookedAt, 'Cooked at')
    if (args.cookedByPersonId) {
      const person = assertOwnedOrThrow(
        await ctx.db.get(args.cookedByPersonId),
        owner,
        'Cook person not found.',
      )
      if (person.archived) {
        throw new Error('Cook person not found.')
      }
    }

    const now = Date.now()
    const label =
      normalizeOptionalText(args.label, 'Session label', MAX_NAME_LENGTH) ?? ''
    return await ctx.db.insert('cookSessions', {
      ...ownerFields(owner),
      label,
      searchText:
        `${new Date(args.cookedAt).toISOString().slice(0, 10)} ${label}`.trim(),
      cookedAt: args.cookedAt,
      cookedByPersonId: args.cookedByPersonId,
      notes: normalizeOptionalText(
        args.notes,
        'Session notes',
        MAX_NOTES_LENGTH,
      ),
      archived: false,
      editRevision: 0,
      updatedAt: now,
      createdAt: now,
    })
  },
})

export const updateCookSession = mutation({
  args: {
    sessionId: v.id('cookSessions'),
    expectedEditRevision: v.number(),
    label: v.optional(v.string()),
    cookedAt: v.number(),
    cookedByPersonId: v.optional(v.id('people')),
    notes: optionalNullableStringValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const session = assertOwnedOrThrow(
      await ctx.db.get(args.sessionId),
      owner,
      'Cook session not found.',
    )
    assertExpectedEditRevision(
      session,
      args.expectedEditRevision,
      'Cook session',
    )
    assertSafeTimestamp(args.cookedAt, 'Cooked at')
    if (args.cookedByPersonId) {
      const person = assertOwnedOrThrow(
        await ctx.db.get(args.cookedByPersonId),
        owner,
        'Cook person not found.',
      )
      if (person.archived && person._id !== session.cookedByPersonId) {
        throw new Error('Cook person not found.')
      }
    }
    const label =
      normalizeOptionalText(args.label, 'Session label', MAX_NAME_LENGTH) ?? ''
    const sessionPatch: {
      label: string
      searchText: string
      cookedAt: number
      cookedByPersonId?: Id<'people'>
      notes?: string
      updatedAt: number
      editRevision: number
    } = {
      label,
      searchText:
        `${new Date(args.cookedAt).toISOString().slice(0, 10)} ${label}`.trim(),
      cookedAt: args.cookedAt,
      cookedByPersonId: args.cookedByPersonId,
      updatedAt: Date.now(),
      editRevision: nextEditRevision(session, 'Cook session'),
    }
    if (args.notes !== undefined) {
      sessionPatch.notes = normalizeNullableText(args.notes)
    }
    await ctx.db.patch(args.sessionId, sessionPatch)
  },
})

export const setCookSessionArchived = mutation({
  args: {
    sessionId: v.id('cookSessions'),
    expectedEditRevision: v.number(),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const session = assertOwnedOrThrow(
      await ctx.db.get(args.sessionId),
      owner,
      'Cook session not found.',
    )
    assertExpectedEditRevision(
      session,
      args.expectedEditRevision,
      'Cook session',
    )
    if (session.archived === args.archived) {
      return
    }
    await ctx.db.patch(args.sessionId, {
      archived: args.archived,
      editRevision: nextEditRevision(session, 'Cook session'),
    })
  },
})

export const deleteCookSession = mutation({
  args: {
    sessionId: v.id('cookSessions'),
    expectedEditRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const session = assertOwnedOrThrow(
      await ctx.db.get(args.sessionId),
      owner,
      'Cook session not found.',
    )
    assertExpectedEditRevision(
      session,
      args.expectedEditRevision,
      'Cook session',
    )
    const cookedFood = await ctx.db
      .query('cookedFoods')
      .withIndex('by_ownerTokenIdentifier_and_cookSessionId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('cookSessionId', args.sessionId),
      )
      .first()
    if (cookedFood) {
      throw new Error('Cook session has cooked foods. Archive instead.')
    }
    await ctx.db.delete(args.sessionId)
  },
})

export const createCookedFood = mutation({
  args: {
    cookSessionId: v.id('cookSessions'),
    name: v.string(),
    recipeId: v.optional(v.id('recipes')),
    recipeVersionId: v.optional(v.id('recipeVersions')),
    saveAsRecipe: v.optional(v.boolean()),
    recipeDraft: v.optional(cookedFoodRecipeDraftValidator),
    groupId: v.optional(v.id('foodGroups')),
    finishedWeightGrams: v.number(),
    notes: v.optional(v.string()),
    ingredients: v.array(cookedFoodIngredientValidator),
  },
  returns: cookedFoodWriteResultValidator,
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertNonEmpty(args.name, 'Cooked food name')
    const cookSession = assertOwnedOrThrow(
      await ctx.db.get(args.cookSessionId),
      owner,
      'Cook session not found.',
    )
    if (cookSession.archived) {
      throw new Error('Cook session not found.')
    }
    if (args.saveAsRecipe && (args.recipeId || args.recipeVersionId)) {
      throw new Error(
        'Cannot select an existing recipe while saving as a new recipe.',
      )
    }
    let existingRecipeLink: {
      recipeId?: Id<'recipes'>
      recipeVersionId?: Id<'recipeVersions'>
    } = {}
    if (!args.saveAsRecipe) {
      existingRecipeLink = await resolveRecipeLink(
        ctx.db,
        owner,
        args.recipeId,
        args.recipeVersionId,
      )
    }
    await assertGroupForScope(ctx.db, owner, args.groupId, 'cookedFood')

    const nutrition = await buildCookedFoodNutrition(
      ctx.db,
      owner,
      args.ingredients,
      args.finishedWeightGrams,
      {
        persistAllCustomIngredients: Boolean(args.saveAsRecipe),
      },
    )

    const now = Date.now()
    let linkedRecipeId = existingRecipeLink.recipeId
    let linkedRecipeVersionId = existingRecipeLink.recipeVersionId
    if (args.saveAsRecipe) {
      const recipeName = normalizeRequiredText(
        args.recipeDraft?.name || args.name,
        'Recipe name',
      )
      const recipeLines = nutrition.ingredientSnapshots

      linkedRecipeId = await ctx.db.insert('recipes', {
        ...ownerFields(owner),
        name: recipeName,
        description: normalizeOptionalText(
          args.recipeDraft?.description,
          'Recipe description',
          MAX_DESCRIPTION_LENGTH,
        ),
        archived: false,
        latestVersionNumber: 1,
        editRevision: 0,
        createdAt: now,
      })
      linkedRecipeVersionId = await ctx.db.insert('recipeVersions', {
        ...ownerFields(owner),
        recipeId: linkedRecipeId,
        versionNumber: 1,
        name: recipeName,
        instructions: normalizeOptionalText(
          args.recipeDraft?.instructions,
          'Recipe instructions',
          MAX_INSTRUCTIONS_LENGTH,
        ),
        notes: normalizeOptionalText(
          args.recipeDraft?.notes,
          'Recipe notes',
          MAX_NOTES_LENGTH,
        ),
        createdAt: now,
      })
      const recipeSnapshots: RecipeIngredientSnapshot[] = recipeLines.map(
        (line) =>
          line.sourceType === 'ingredient'
            ? {
                ...line,
                sourceType: 'ingredient',
                ingredientId: line.ingredientId,
                kcalPer100Snapshot: line.ingredientKcalPer100Snapshot,
                kcalBasisUnitSnapshot: line.ingredientKcalBasisUnitSnapshot,
              }
            : {
                ...line,
                sourceType: 'custom',
                ingredientId: line.ingredientId,
                kcalPer100Snapshot: line.ingredientKcalPer100Snapshot,
                kcalBasisUnitSnapshot: line.ingredientKcalBasisUnitSnapshot,
              },
      )
      await insertRecipeIngredientSnapshots(
        ctx.db,
        owner,
        linkedRecipeVersionId,
        recipeSnapshots,
      )
    }

    const cookedFoodId = await ctx.db.insert('cookedFoods', {
      ...ownerFields(owner),
      cookSessionId: args.cookSessionId,
      name: args.name.trim(),
      recipeId: linkedRecipeId,
      recipeVersionId: linkedRecipeVersionId,
      groupId: args.groupId,
      finishedWeightGrams: args.finishedWeightGrams,
      totalRawWeightGrams: nutrition.totalRawWeightGrams,
      totalCalories: nutrition.totalCalories,
      kcalPer100: nutrition.kcalPer100,
      editRevision: 0,
      notes: normalizeOptionalText(
        args.notes,
        'Cooked food notes',
        MAX_NOTES_LENGTH,
      ),
      archived: false,
      createdAt: now,
    })

    const cookedFoodIngredientIds = await insertCookedIngredientSnapshots(
      ctx.db,
      owner,
      cookedFoodId,
      nutrition.ingredientSnapshots,
    )

    await touchCookSession(ctx, owner, args.cookSessionId, now)
    return {
      cookedFoodId,
      editRevision: 0,
      cookedFoodIngredientIds,
      recipeId: linkedRecipeId,
      recipeVersionId: linkedRecipeVersionId,
    }
  },
})

export const updateCookedFood = mutation({
  args: {
    cookedFoodId: v.id('cookedFoods'),
    expectedCookedFoodIngredientIds: v.array(v.id('cookedFoodIngredients')),
    expectedEditRevision: v.number(),
    cookSessionId: v.id('cookSessions'),
    name: v.string(),
    recipeId: v.optional(v.id('recipes')),
    recipeVersionId: v.optional(v.id('recipeVersions')),
    groupId: v.optional(v.id('foodGroups')),
    finishedWeightGrams: v.number(),
    notes: v.optional(v.string()),
    ingredients: v.array(cookedFoodIngredientValidator),
  },
  returns: cookedFoodWriteResultValidator,
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const cookedFood = assertOwnedOrThrow(
      await ctx.db.get(args.cookedFoodId),
      owner,
      'Cooked food not found.',
    )
    assertExpectedEditRevision(
      cookedFood,
      args.expectedEditRevision,
      'Cooked food',
    )
    assertNonEmpty(args.name, 'Cooked food name')
    const cookSession = assertOwnedOrThrow(
      await ctx.db.get(args.cookSessionId),
      owner,
      'Cook session not found.',
    )
    if (cookSession.archived && cookSession._id !== cookedFood.cookSessionId) {
      throw new Error('Cook session not found.')
    }
    const recipeLink = await resolveRecipeLink(
      ctx.db,
      owner,
      args.recipeId,
      args.recipeVersionId,
      cookedFood.recipeId,
      cookedFood.recipeVersionId,
    )
    await assertGroupForScope(
      ctx.db,
      owner,
      args.groupId,
      'cookedFood',
      cookedFood.groupId,
    )

    const oldRows = await ctx.db
      .query('cookedFoodIngredients')
      .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('cookedFoodId', args.cookedFoodId),
      )
      .take(MAX_INGREDIENT_LINES + 1)
    if (oldRows.length > MAX_INGREDIENT_LINES) {
      throw new Error(
        'Cooked food has too many ingredient rows to update safely.',
      )
    }
    assertExpectedIdSet(
      args.expectedCookedFoodIngredientIds,
      oldRows.map((row) => row._id),
      'Cooked food',
    )
    const existingIngredientsById = new Map(
      oldRows.map((row) => [row._id, row] as const),
    )

    const nutrition = await buildCookedFoodNutrition(
      ctx.db,
      owner,
      args.ingredients,
      args.finishedWeightGrams,
      { existingIngredientsById },
    )
    const now = Date.now()
    const editRevision = nextEditRevision(cookedFood, 'Cooked food')
    await ctx.db.patch(args.cookedFoodId, {
      cookSessionId: args.cookSessionId,
      name: args.name.trim(),
      recipeId: recipeLink.recipeId,
      recipeVersionId: recipeLink.recipeVersionId,
      groupId: args.groupId,
      finishedWeightGrams: args.finishedWeightGrams,
      totalRawWeightGrams: nutrition.totalRawWeightGrams,
      totalCalories: nutrition.totalCalories,
      kcalPer100: nutrition.kcalPer100,
      editRevision,
      notes: normalizeOptionalText(
        args.notes,
        'Cooked food notes',
        MAX_NOTES_LENGTH,
      ),
    })

    const cookedFoodIngredientIds = await reconcileCookedIngredientSnapshots(
      ctx.db,
      owner,
      args.cookedFoodId,
      oldRows,
      nutrition.ingredientSnapshots,
    )
    await touchCookSession(ctx, owner, args.cookSessionId, now)
    if (cookedFood.cookSessionId !== args.cookSessionId) {
      await touchCookSession(ctx, owner, cookedFood.cookSessionId, now)
    }
    return {
      cookedFoodId: args.cookedFoodId,
      editRevision,
      cookedFoodIngredientIds,
      recipeId: recipeLink.recipeId,
      recipeVersionId: recipeLink.recipeVersionId,
    }
  },
})

export const setCookedFoodArchived = mutation({
  args: {
    cookedFoodId: v.id('cookedFoods'),
    expectedEditRevision: v.number(),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const cookedFood = assertOwnedOrThrow(
      await ctx.db.get(args.cookedFoodId),
      owner,
      'Cooked food not found.',
    )
    assertExpectedEditRevision(
      cookedFood,
      args.expectedEditRevision,
      'Cooked food',
    )
    if (cookedFood.archived === args.archived) {
      return
    }
    await ctx.db.patch(args.cookedFoodId, {
      archived: args.archived,
      editRevision: nextEditRevision(cookedFood, 'Cooked food'),
    })
    await touchCookSession(ctx, owner, cookedFood.cookSessionId)
  },
})

export const deleteCookedFood = mutation({
  args: {
    cookedFoodId: v.id('cookedFoods'),
    expectedEditRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const cookedFood = assertOwnedOrThrow(
      await ctx.db.get(args.cookedFoodId),
      owner,
      'Cooked food not found.',
    )
    assertExpectedEditRevision(
      cookedFood,
      args.expectedEditRevision,
      'Cooked food',
    )
    const sessionId = await deleteCookedFoodWithChildren(
      ctx,
      owner,
      args.cookedFoodId,
    )
    await touchCookSession(ctx, owner, sessionId)
  },
})

export const createMeal = mutation({
  args: {
    personId: v.id('people'),
    name: v.optional(v.string()),
    eatenOn: v.string(),
    notes: v.optional(v.string()),
    items: v.array(mealItemInputValidator),
  },
  returns: v.id('meals'),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const person = assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      owner,
      'Person not found.',
    )
    if (person.archived) {
      throw new Error('Person not found.')
    }
    const now = Date.now()
    const itemSnapshots = await buildMealItemSnapshots(
      ctx.db,
      owner,
      args.items,
    )
    const eatenOn = normalizeRequiredDate(args.eatenOn, 'Meal date')
    const totalCalories = sumMealItemCalories(itemSnapshots)
    const mealId = await ctx.db.insert('meals', {
      ...ownerFields(owner),
      personId: args.personId,
      name: normalizeOptionalText(args.name, 'Meal name', MAX_NAME_LENGTH),
      eatenOn,
      notes: normalizeOptionalText(args.notes, 'Meal notes', MAX_NOTES_LENGTH),
      archived: false,
      totalCalories,
      itemCount: itemSnapshots.length,
      editRevision: 0,
      createdAt: now,
    })
    await insertMealItemSnapshots(ctx.db, owner, mealId, itemSnapshots)
    await adjustDailySummary(
      ctx.db,
      owner,
      { personId: args.personId, eatenOn },
      { consumedCalories: totalCalories, mealCount: 1 },
      now,
    )
    return mealId
  },
})

export const updateMeal = mutation({
  args: {
    mealId: v.id('meals'),
    expectedMealItemIds: v.array(v.id('mealItems')),
    expectedEditRevision: v.number(),
    personId: v.id('people'),
    name: v.optional(v.string()),
    eatenOn: v.string(),
    notes: optionalNullableStringValidator,
    items: v.array(mealItemInputValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const meal = assertOwnedOrThrow(
      await ctx.db.get(args.mealId),
      owner,
      'Meal not found.',
    )
    assertExpectedEditRevision(meal, args.expectedEditRevision, 'Meal')
    const person = assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      owner,
      'Person not found.',
    )
    if (person.archived && person._id !== meal.personId) {
      throw new Error('Person not found.')
    }
    const existingItems = await ctx.db
      .query('mealItems')
      .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('mealId', args.mealId),
      )
      .take(MAX_INGREDIENT_LINES + 1)
    if (existingItems.length > MAX_INGREDIENT_LINES) {
      throw new Error('Meal has too many items to update safely.')
    }
    assertExpectedIdSet(
      args.expectedMealItemIds,
      existingItems.map((item) => item._id),
      'Meal',
    )
    const existingItemsById = new Map(
      existingItems.map((item) => [item._id, item] as const),
    )
    const snapshots = await buildMealItemSnapshots(ctx.db, owner, args.items, {
      existingItemsById,
    })
    const totalCalories = sumMealItemCalories(snapshots)
    const eatenOn = normalizeRequiredDate(args.eatenOn, 'Meal date')
    const mealPatch: {
      personId: Id<'people'>
      name?: string
      eatenOn: string
      notes?: string
      totalCalories: number
      itemCount: number
      editRevision: number
    } = {
      personId: args.personId,
      name: normalizeOptionalText(args.name, 'Meal name', MAX_NAME_LENGTH),
      eatenOn,
      totalCalories,
      itemCount: snapshots.length,
      editRevision: nextEditRevision(meal, 'Meal'),
    }
    if (args.notes !== undefined) {
      mealPatch.notes = normalizeNullableText(args.notes)
    }
    await ctx.db.patch(args.mealId, mealPatch)
    await Promise.all(existingItems.map((item) => ctx.db.delete(item._id)))
    await insertMealItemSnapshots(ctx.db, owner, args.mealId, snapshots)
    const now = Date.now()
    if (!meal.archived) {
      const oldKey = { personId: meal.personId, eatenOn: meal.eatenOn }
      const newKey = { personId: args.personId, eatenOn }
      if (
        oldKey.personId === newKey.personId &&
        oldKey.eatenOn === newKey.eatenOn
      ) {
        await adjustDailySummary(
          ctx.db,
          owner,
          newKey,
          {
            consumedCalories: totalCalories - meal.totalCalories,
            mealCount: 0,
          },
          now,
        )
      } else {
        await adjustDailySummary(
          ctx.db,
          owner,
          oldKey,
          { consumedCalories: -meal.totalCalories, mealCount: -1 },
          now,
        )
        await adjustDailySummary(
          ctx.db,
          owner,
          newKey,
          { consumedCalories: totalCalories, mealCount: 1 },
          now,
        )
      }
    }
  },
})

export const setMealArchived = mutation({
  args: {
    mealId: v.id('meals'),
    expectedEditRevision: v.number(),
    archived: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const meal = assertOwnedOrThrow(
      await ctx.db.get(args.mealId),
      owner,
      'Meal not found.',
    )
    assertExpectedEditRevision(meal, args.expectedEditRevision, 'Meal')
    if (meal.archived === args.archived) {
      return
    }
    await ctx.db.patch(args.mealId, {
      archived: args.archived,
      editRevision: nextEditRevision(meal, 'Meal'),
    })
    await adjustDailySummary(
      ctx.db,
      owner,
      { personId: meal.personId, eatenOn: meal.eatenOn },
      {
        consumedCalories: args.archived
          ? -meal.totalCalories
          : meal.totalCalories,
        mealCount: args.archived ? -1 : 1,
      },
      Date.now(),
    )
  },
})

export const deleteMeal = mutation({
  args: {
    mealId: v.id('meals'),
    expectedEditRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const meal = assertOwnedOrThrow(
      await ctx.db.get(args.mealId),
      owner,
      'Meal not found.',
    )
    assertExpectedEditRevision(meal, args.expectedEditRevision, 'Meal')
    const items = await ctx.db
      .query('mealItems')
      .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('mealId', args.mealId),
      )
      .take(MAX_INGREDIENT_LINES + 1)
    if (items.length > MAX_INGREDIENT_LINES) {
      throw new Error(
        'Meal has too many items to delete safely. Archive instead.',
      )
    }
    await Promise.all(items.map((item) => ctx.db.delete(item._id)))
    await ctx.db.delete(args.mealId)
    if (!meal.archived) {
      await adjustDailySummary(
        ctx.db,
        owner,
        { personId: meal.personId, eatenOn: meal.eatenOn },
        { consumedCalories: -meal.totalCalories, mealCount: -1 },
        Date.now(),
      )
    }
  },
})
