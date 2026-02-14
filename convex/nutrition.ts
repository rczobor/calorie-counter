import {
  mutation,
  query,
  type DatabaseWriter,
  type MutationCtx,
} from './_generated/server'
import type { Id } from './_generated/dataModel'
import { v } from 'convex/values'

const unitValidator = v.union(
  v.literal('g'),
  v.literal('ml'),
  v.literal('piece'),
)

const groupScopeValidator = v.union(
  v.literal('ingredient'),
  v.literal('cookedFood'),
  v.literal('both'),
)

const mealSourceValidator = v.union(
  v.literal('ingredient'),
  v.literal('cookedFood'),
)

const recipeIngredientValidator = v.object({
  ingredientId: v.id('ingredients'),
  plannedWeightGrams: v.number(),
  notes: v.optional(v.string()),
})

const recipeOutputValidator = v.object({
  name: v.string(),
  groupIds: v.array(v.id('foodGroups')),
  plannedFinishedWeightGrams: v.optional(v.number()),
})

const cookedFoodIngredientValidator = v.object({
  ingredientId: v.id('ingredients'),
  rawWeightGrams: v.number(),
})

const mealItemInputValidator = v.object({
  sourceType: mealSourceValidator,
  ingredientId: v.optional(v.id('ingredients')),
  cookedFoodId: v.optional(v.id('cookedFoods')),
  consumedWeightGrams: v.number(),
  notes: v.optional(v.string()),
})

function assertNonEmpty(value: string, fieldName: string) {
  if (!value.trim()) {
    throw new Error(`${fieldName} is required.`)
  }
}

function assertPositive(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`)
  }
}

function toLocalDateString(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeDate(value: string | undefined, fallbackDate: number) {
  if (!value) {
    return toLocalDateString(fallbackDate)
  }
  const trimmed = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('Date must be in YYYY-MM-DD format.')
  }
  return trimmed
}

function mealDateKey(meal: {
  eatenOn?: string
  eatenAt?: number
  createdAt: number
}) {
  if (meal.eatenOn) {
    return meal.eatenOn
  }
  if (meal.eatenAt) {
    return toLocalDateString(meal.eatenAt)
  }
  return toLocalDateString(meal.createdAt)
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function buildCookedFoodNutrition(
  db: DatabaseWriter,
  ingredients: {
    ingredientId: Id<'ingredients'>
    rawWeightGrams: number
  }[],
  finishedWeightGrams: number,
) {
  assertPositive(finishedWeightGrams, 'Finished weight')
  if (ingredients.length === 0) {
    throw new Error('At least one ingredient is required.')
  }

  const ingredientDocs = await Promise.all(
    ingredients.map((item) => db.get(item.ingredientId)),
  )
  if (ingredientDocs.some((item) => !item)) {
    throw new Error('One or more ingredients are missing.')
  }

  let totalRawWeightGrams = 0
  let totalCalories = 0
  const ingredientSnapshots = ingredients.map((line, index) => {
    assertPositive(line.rawWeightGrams, 'Raw ingredient weight')
    const ingredient = ingredientDocs[index]
    if (!ingredient) {
      throw new Error('Ingredient not found.')
    }
    const ingredientCalories = (line.rawWeightGrams * ingredient.kcalPer100g) / 100
    totalRawWeightGrams += line.rawWeightGrams
    totalCalories += ingredientCalories
    return {
      ingredientId: ingredient._id,
      rawWeightGrams: line.rawWeightGrams,
      ingredientKcalPer100gSnapshot: ingredient.kcalPer100g,
      ingredientCaloriesSnapshot: ingredientCalories,
    }
  })

  return {
    totalRawWeightGrams,
    totalCalories,
    kcalPer100g: (totalCalories / finishedWeightGrams) * 100,
    ingredientSnapshots,
  }
}

async function buildMealItemSnapshots(
  db: DatabaseWriter,
  items: {
    sourceType: 'ingredient' | 'cookedFood'
    ingredientId?: Id<'ingredients'>
    cookedFoodId?: Id<'cookedFoods'>
    consumedWeightGrams: number
    notes?: string
  }[],
) {
  if (items.length === 0) {
    throw new Error('At least one meal item is required.')
  }

  return await Promise.all(
    items.map(async (item) => {
      assertPositive(item.consumedWeightGrams, 'Consumed weight')
      if (item.sourceType === 'ingredient') {
        if (!item.ingredientId) {
          throw new Error('Ingredient meal item is missing ingredientId.')
        }
        const ingredient = await db.get(item.ingredientId)
        if (!ingredient) {
          throw new Error('Meal ingredient not found.')
        }
        const calories = (item.consumedWeightGrams * ingredient.kcalPer100g) / 100
        return {
          sourceType: item.sourceType,
          ingredientId: ingredient._id,
          cookedFoodId: undefined,
          consumedWeightGrams: item.consumedWeightGrams,
          kcalPer100gSnapshot: ingredient.kcalPer100g,
          caloriesSnapshot: calories,
          notes: item.notes?.trim() || undefined,
        }
      }

      if (!item.cookedFoodId) {
        throw new Error('Cooked food meal item is missing cookedFoodId.')
      }
      const cookedFood = await db.get(item.cookedFoodId)
      if (!cookedFood) {
        throw new Error('Meal cooked food item not found.')
      }
      const calories = (item.consumedWeightGrams * cookedFood.kcalPer100g) / 100
      return {
        sourceType: item.sourceType,
        ingredientId: undefined,
        cookedFoodId: cookedFood._id,
        consumedWeightGrams: item.consumedWeightGrams,
        kcalPer100gSnapshot: cookedFood.kcalPer100g,
        caloriesSnapshot: calories,
        notes: item.notes?.trim() || undefined,
      }
    }),
  )
}

async function deleteCookedFoodWithChildren(ctx: MutationCtx, cookedFoodId: Id<'cookedFoods'>) {
  const ingredientRows = await ctx.db
    .query('cookedFoodIngredients')
    .withIndex('by_cookedFood', (q) => q.eq('cookedFoodId', cookedFoodId))
    .collect()
  await Promise.all(ingredientRows.map((row) => ctx.db.delete(row._id)))

  const mealItems = await ctx.db.query('mealItems').collect()
  await Promise.all(
    mealItems
      .filter((item) => item.cookedFoodId === cookedFoodId)
      .map((item) => ctx.db.patch(item._id, { cookedFoodId: undefined })),
  )

  await ctx.db.delete(cookedFoodId)
}

export const getManagementData = query({
  args: {},
  handler: async (ctx) => {
    const [
      people,
      personGoalHistory,
      foodGroups,
      ingredients,
      recipes,
      recipeVersions,
      recipeVersionIngredients,
      recipeVersionOutputs,
      cookSessions,
      cookedFoods,
      cookedFoodIngredients,
      meals,
      mealItems,
    ] = await Promise.all([
      ctx.db.query('people').collect(),
      ctx.db.query('personGoalHistory').collect(),
      ctx.db.query('foodGroups').collect(),
      ctx.db.query('ingredients').collect(),
      ctx.db.query('recipes').collect(),
      ctx.db.query('recipeVersions').collect(),
      ctx.db.query('recipeVersionIngredients').collect(),
      ctx.db.query('recipeVersionOutputs').collect(),
      ctx.db.query('cookSessions').collect(),
      ctx.db.query('cookedFoods').collect(),
      ctx.db.query('cookedFoodIngredients').collect(),
      ctx.db.query('meals').collect(),
      ctx.db.query('mealItems').collect(),
    ])

    return {
      people: people.sort((a, b) => a.name.localeCompare(b.name)),
      personGoalHistory: personGoalHistory.sort(
        (a, b) => b.createdAt - a.createdAt,
      ),
      foodGroups: foodGroups.sort((a, b) => a.name.localeCompare(b.name)),
      ingredients: ingredients.sort((a, b) => a.name.localeCompare(b.name)),
      recipes: recipes.sort((a, b) => b.createdAt - a.createdAt),
      recipeVersions: recipeVersions.sort((a, b) => b.createdAt - a.createdAt),
      recipeVersionIngredients,
      recipeVersionOutputs: recipeVersionOutputs.sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ),
      cookSessions: cookSessions.sort((a, b) => b.cookedAt - a.cookedAt),
      cookedFoods: cookedFoods.sort((a, b) => b.createdAt - a.createdAt),
      cookedFoodIngredients,
      meals: meals.sort((a, b) => {
        const aDate = mealDateKey(a)
        const bDate = mealDateKey(b)
        if (aDate === bDate) {
          return b.createdAt - a.createdAt
        }
        return aDate < bDate ? 1 : -1
      }),
      mealItems,
    }
  },
})

export const getPersonDailySummary = query({
  args: {
    personId: v.id('people'),
    date: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId)
    if (!person) {
      throw new Error('Person not found.')
    }

    const date = normalizeDate(args.date, Date.now())
    const meals = await ctx.db
      .query('meals')
      .withIndex('by_person_eatenOn', (q) => q.eq('personId', args.personId))
      .collect()
    const activeMeals = meals.filter(
      (meal) => !meal.archived && mealDateKey(meal) === date,
    )
    const mealItemRows = await Promise.all(
      activeMeals.map((meal) =>
        ctx.db
          .query('mealItems')
          .withIndex('by_meal', (q) => q.eq('mealId', meal._id))
          .collect(),
      ),
    )
    const consumedKcal = mealItemRows
      .flat()
      .reduce((sum, item) => sum + item.caloriesSnapshot, 0)

    return {
      personId: person._id,
      date,
      goalKcal: person.currentDailyGoalKcal,
      consumedKcal,
      remainingKcal: person.currentDailyGoalKcal - consumedKcal,
    }
  },
})

export const createPerson = mutation({
  args: {
    name: v.string(),
    currentDailyGoalKcal: v.number(),
    notes: v.optional(v.string()),
    effectiveDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertNonEmpty(args.name, 'Name')
    assertPositive(args.currentDailyGoalKcal, 'Daily goal')
    const now = Date.now()
    const personId = await ctx.db.insert('people', {
      name: args.name.trim(),
      notes: args.notes?.trim() || undefined,
      currentDailyGoalKcal: args.currentDailyGoalKcal,
      active: true,
      createdAt: now,
    })
    await ctx.db.insert('personGoalHistory', {
      personId,
      effectiveDate: normalizeDate(args.effectiveDate, now),
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
    name: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId)
    if (!person) {
      throw new Error('Person not found.')
    }
    assertNonEmpty(args.name, 'Name')
    await ctx.db.patch(args.personId, {
      name: args.name.trim(),
      notes: args.notes?.trim() || undefined,
    })
  },
})

export const updatePersonGoal = mutation({
  args: {
    personId: v.id('people'),
    goalKcal: v.number(),
    effectiveDate: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertPositive(args.goalKcal, 'Goal')
    const person = await ctx.db.get(args.personId)
    if (!person) {
      throw new Error('Person not found.')
    }
    const now = Date.now()
    await ctx.db.patch(args.personId, {
      currentDailyGoalKcal: args.goalKcal,
    })
    await ctx.db.insert('personGoalHistory', {
      personId: args.personId,
      effectiveDate: normalizeDate(args.effectiveDate, now),
      goalKcal: args.goalKcal,
      reason: args.reason?.trim() || undefined,
      createdAt: now,
    })
  },
})

export const setPersonArchived = mutation({
  args: {
    personId: v.id('people'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId)
    if (!person) {
      throw new Error('Person not found.')
    }
    await ctx.db.patch(args.personId, { active: !args.archived })
  },
})

export const deletePerson = mutation({
  args: { personId: v.id('people') },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId)
    if (!person) {
      throw new Error('Person not found.')
    }
    const [mealRefs, cookingRefs] = await Promise.all([
      ctx.db
        .query('meals')
        .withIndex('by_person_eatenOn', (q) => q.eq('personId', args.personId))
        .collect(),
      ctx.db.query('cookSessions').collect(),
    ])
    if (mealRefs.length > 0 || cookingRefs.some((c) => c.cookedByPersonId === args.personId)) {
      throw new Error('Cannot delete person with meal/cooking history. Archive instead.')
    }
    const goalRows = await ctx.db
      .query('personGoalHistory')
      .withIndex('by_person_createdAt', (q) => q.eq('personId', args.personId))
      .collect()
    await Promise.all(goalRows.map((row) => ctx.db.delete(row._id)))
    await ctx.db.delete(args.personId)
  },
})

export const createFoodGroup = mutation({
  args: {
    name: v.string(),
    appliesTo: groupScopeValidator,
  },
  handler: async (ctx, args) => {
    assertNonEmpty(args.name, 'Group name')
    const now = Date.now()
    const trimmedName = args.name.trim()
    const slugBase = toSlug(trimmedName)
    const suffix = Math.random().toString(36).slice(2, 7)
    return await ctx.db.insert('foodGroups', {
      name: trimmedName,
      slug: slugBase ? `${slugBase}-${suffix}` : suffix,
      appliesTo: args.appliesTo,
      archived: false,
      createdAt: now,
    })
  },
})

export const updateFoodGroup = mutation({
  args: {
    groupId: v.id('foodGroups'),
    name: v.string(),
    appliesTo: groupScopeValidator,
  },
  handler: async (ctx, args) => {
    assertNonEmpty(args.name, 'Group name')
    const group = await ctx.db.get(args.groupId)
    if (!group) {
      throw new Error('Group not found.')
    }
    await ctx.db.patch(args.groupId, {
      name: args.name.trim(),
      appliesTo: args.appliesTo,
      slug: toSlug(args.name) || group.slug,
    })
  },
})

export const setFoodGroupArchived = mutation({
  args: {
    groupId: v.id('foodGroups'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) {
      throw new Error('Group not found.')
    }
    await ctx.db.patch(args.groupId, { archived: args.archived })
  },
})

export const deleteFoodGroup = mutation({
  args: { groupId: v.id('foodGroups') },
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) {
      throw new Error('Group not found.')
    }
    const [ingredients, outputs, cookedFoods] = await Promise.all([
      ctx.db.query('ingredients').collect(),
      ctx.db.query('recipeVersionOutputs').collect(),
      ctx.db.query('cookedFoods').collect(),
    ])
    const inUse =
      ingredients.some((item) => item.groupIds.includes(args.groupId)) ||
      outputs.some((item) => item.groupIds.includes(args.groupId)) ||
      cookedFoods.some((item) => item.groupIds.includes(args.groupId))
    if (inUse) {
      throw new Error('Group is used by records. Archive instead or remove references first.')
    }
    await ctx.db.delete(args.groupId)
  },
})

export const createIngredient = mutation({
  args: {
    name: v.string(),
    brand: v.optional(v.string()),
    kcalPer100g: v.number(),
    defaultUnit: unitValidator,
    gramsPerUnit: v.optional(v.number()),
    groupIds: v.array(v.id('foodGroups')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertNonEmpty(args.name, 'Ingredient name')
    assertPositive(args.kcalPer100g, 'kcal/100g')
    if (args.gramsPerUnit !== undefined) {
      assertPositive(args.gramsPerUnit, 'grams per unit')
    }
    const now = Date.now()
    return await ctx.db.insert('ingredients', {
      name: args.name.trim(),
      brand: args.brand?.trim() || undefined,
      kcalPer100g: args.kcalPer100g,
      defaultUnit: args.defaultUnit,
      gramsPerUnit: args.gramsPerUnit,
      groupIds: args.groupIds,
      notes: args.notes?.trim() || undefined,
      archived: false,
      createdAt: now,
    })
  },
})

export const updateIngredient = mutation({
  args: {
    ingredientId: v.id('ingredients'),
    name: v.string(),
    brand: v.optional(v.string()),
    kcalPer100g: v.number(),
    defaultUnit: unitValidator,
    gramsPerUnit: v.optional(v.number()),
    groupIds: v.array(v.id('foodGroups')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ingredient = await ctx.db.get(args.ingredientId)
    if (!ingredient) {
      throw new Error('Ingredient not found.')
    }
    assertNonEmpty(args.name, 'Ingredient name')
    assertPositive(args.kcalPer100g, 'kcal/100g')
    if (args.gramsPerUnit !== undefined) {
      assertPositive(args.gramsPerUnit, 'grams per unit')
    }
    await ctx.db.patch(args.ingredientId, {
      name: args.name.trim(),
      brand: args.brand?.trim() || undefined,
      kcalPer100g: args.kcalPer100g,
      defaultUnit: args.defaultUnit,
      gramsPerUnit: args.gramsPerUnit,
      groupIds: args.groupIds,
      notes: args.notes?.trim() || undefined,
    })
  },
})

export const setIngredientArchived = mutation({
  args: {
    ingredientId: v.id('ingredients'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ingredient = await ctx.db.get(args.ingredientId)
    if (!ingredient) {
      throw new Error('Ingredient not found.')
    }
    await ctx.db.patch(args.ingredientId, { archived: args.archived })
  },
})

export const deleteIngredient = mutation({
  args: { ingredientId: v.id('ingredients') },
  handler: async (ctx, args) => {
    const ingredient = await ctx.db.get(args.ingredientId)
    if (!ingredient) {
      throw new Error('Ingredient not found.')
    }
    const [recipeRefs, cookedRefs, mealRefs] = await Promise.all([
      ctx.db.query('recipeVersionIngredients').collect(),
      ctx.db.query('cookedFoodIngredients').collect(),
      ctx.db.query('mealItems').collect(),
    ])
    const used =
      recipeRefs.some((item) => item.ingredientId === args.ingredientId) ||
      cookedRefs.some((item) => item.ingredientId === args.ingredientId) ||
      mealRefs.some((item) => item.ingredientId === args.ingredientId)
    if (used) {
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
    ownerUserId: v.optional(v.string()),
    plannedIngredients: v.array(recipeIngredientValidator),
    plannedOutputs: v.array(recipeOutputValidator),
  },
  handler: async (ctx, args) => {
    assertNonEmpty(args.name, 'Recipe name')
    if (args.plannedIngredients.length === 0) {
      throw new Error('Recipe needs at least one ingredient.')
    }
    for (const line of args.plannedIngredients) {
      assertPositive(line.plannedWeightGrams, 'Planned ingredient weight')
    }
    for (const output of args.plannedOutputs) {
      assertNonEmpty(output.name, 'Planned output name')
      if (output.plannedFinishedWeightGrams !== undefined) {
        assertPositive(
          output.plannedFinishedWeightGrams,
          'Planned finished output weight',
        )
      }
    }

    const ingredientDocs = await Promise.all(
      args.plannedIngredients.map((line) => ctx.db.get(line.ingredientId)),
    )
    if (ingredientDocs.some((item) => !item)) {
      throw new Error('One or more ingredients are missing.')
    }

    const now = Date.now()
    const recipeId = await ctx.db.insert('recipes', {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      ownerUserId: args.ownerUserId?.trim() || undefined,
      archived: false,
      latestVersionNumber: 1,
      createdAt: now,
    })

    const versionId = await ctx.db.insert('recipeVersions', {
      recipeId,
      versionNumber: 1,
      name: args.name.trim(),
      instructions: args.instructions?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      isCurrent: true,
      createdAt: now,
    })

    await Promise.all([
      ...args.plannedIngredients.map((line) =>
        ctx.db.insert('recipeVersionIngredients', {
          recipeVersionId: versionId,
          ingredientId: line.ingredientId,
          plannedWeightGrams: line.plannedWeightGrams,
          notes: line.notes?.trim() || undefined,
        }),
      ),
      ...args.plannedOutputs.map((output, index) =>
        ctx.db.insert('recipeVersionOutputs', {
          recipeVersionId: versionId,
          name: output.name.trim(),
          groupIds: output.groupIds,
          plannedFinishedWeightGrams: output.plannedFinishedWeightGrams,
          sortOrder: index,
        }),
      ),
    ])

    return { recipeId, recipeVersionId: versionId }
  },
})

export const updateRecipeCurrentVersion = mutation({
  args: {
    recipeId: v.id('recipes'),
    name: v.string(),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    notes: v.optional(v.string()),
    plannedIngredients: v.array(recipeIngredientValidator),
    plannedOutputs: v.array(recipeOutputValidator),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId)
    if (!recipe) {
      throw new Error('Recipe not found.')
    }
    assertNonEmpty(args.name, 'Recipe name')
    if (args.plannedIngredients.length === 0) {
      throw new Error('Recipe needs at least one ingredient.')
    }
    for (const line of args.plannedIngredients) {
      assertPositive(line.plannedWeightGrams, 'Planned ingredient weight')
    }
    for (const output of args.plannedOutputs) {
      assertNonEmpty(output.name, 'Planned output name')
      if (output.plannedFinishedWeightGrams !== undefined) {
        assertPositive(
          output.plannedFinishedWeightGrams,
          'Planned finished output weight',
        )
      }
    }

    const versions = await ctx.db
      .query('recipeVersions')
      .withIndex('by_recipe', (q) => q.eq('recipeId', args.recipeId))
      .collect()
    const current = versions.find((version) => version.isCurrent)
    if (!current) {
      throw new Error('Current recipe version not found.')
    }

    await ctx.db.patch(args.recipeId, {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
    })
    await ctx.db.patch(current._id, {
      name: args.name.trim(),
      instructions: args.instructions?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
    })

    const [oldIngredients, oldOutputs] = await Promise.all([
      ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_recipeVersion', (q) =>
          q.eq('recipeVersionId', current._id),
        )
        .collect(),
      ctx.db
        .query('recipeVersionOutputs')
        .withIndex('by_recipeVersion', (q) =>
          q.eq('recipeVersionId', current._id),
        )
        .collect(),
    ])

    await Promise.all([
      ...oldIngredients.map((line) => ctx.db.delete(line._id)),
      ...oldOutputs.map((line) => ctx.db.delete(line._id)),
      ...args.plannedIngredients.map((line) =>
        ctx.db.insert('recipeVersionIngredients', {
          recipeVersionId: current._id,
          ingredientId: line.ingredientId,
          plannedWeightGrams: line.plannedWeightGrams,
          notes: line.notes?.trim() || undefined,
        }),
      ),
      ...args.plannedOutputs.map((output, index) =>
        ctx.db.insert('recipeVersionOutputs', {
          recipeVersionId: current._id,
          name: output.name.trim(),
          groupIds: output.groupIds,
          plannedFinishedWeightGrams: output.plannedFinishedWeightGrams,
          sortOrder: index,
        }),
      ),
    ])
  },
})

export const setRecipeArchived = mutation({
  args: {
    recipeId: v.id('recipes'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId)
    if (!recipe) {
      throw new Error('Recipe not found.')
    }
    await ctx.db.patch(args.recipeId, { archived: args.archived })
  },
})

export const deleteRecipe = mutation({
  args: { recipeId: v.id('recipes') },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId)
    if (!recipe) {
      throw new Error('Recipe not found.')
    }
    const cookedRef = (await ctx.db.query('cookedFoods').collect()).some(
      (item) => item.recipeId === args.recipeId,
    )
    if (cookedRef) {
      throw new Error('Recipe has cooked history. Archive instead.')
    }

    const versions = await ctx.db
      .query('recipeVersions')
      .withIndex('by_recipe', (q) => q.eq('recipeId', args.recipeId))
      .collect()
    const versionIds = new Set(versions.map((version) => version._id))
    const [versionIngredients, versionOutputs] = await Promise.all([
      ctx.db.query('recipeVersionIngredients').collect(),
      ctx.db.query('recipeVersionOutputs').collect(),
    ])
    await Promise.all([
      ...versionIngredients
        .filter((line) => versionIds.has(line.recipeVersionId))
        .map((line) => ctx.db.delete(line._id)),
      ...versionOutputs
        .filter((line) => versionIds.has(line.recipeVersionId))
        .map((line) => ctx.db.delete(line._id)),
      ...versions.map((version) => ctx.db.delete(version._id)),
    ])
    await ctx.db.delete(args.recipeId)
  },
})

export const createCookSession = mutation({
  args: {
    label: v.optional(v.string()),
    cookedAt: v.optional(v.number()),
    cookedByPersonId: v.optional(v.id('people')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.cookedByPersonId) {
      const person = await ctx.db.get(args.cookedByPersonId)
      if (!person) {
        throw new Error('Cook person not found.')
      }
    }

    const now = Date.now()
    return await ctx.db.insert('cookSessions', {
      label: args.label?.trim() || undefined,
      cookedAt: args.cookedAt ?? now,
      cookedByPersonId: args.cookedByPersonId,
      notes: args.notes?.trim() || undefined,
      archived: false,
      createdAt: now,
    })
  },
})

export const updateCookSession = mutation({
  args: {
    sessionId: v.id('cookSessions'),
    label: v.optional(v.string()),
    cookedAt: v.optional(v.number()),
    cookedByPersonId: v.optional(v.id('people')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (!session) {
      throw new Error('Cook session not found.')
    }
    if (args.cookedByPersonId) {
      const person = await ctx.db.get(args.cookedByPersonId)
      if (!person) {
        throw new Error('Cook person not found.')
      }
    }
    await ctx.db.patch(args.sessionId, {
      label: args.label?.trim() || undefined,
      cookedAt: args.cookedAt ?? session.cookedAt,
      cookedByPersonId: args.cookedByPersonId,
      notes: args.notes?.trim() || undefined,
    })
  },
})

export const setCookSessionArchived = mutation({
  args: {
    sessionId: v.id('cookSessions'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (!session) {
      throw new Error('Cook session not found.')
    }
    await ctx.db.patch(args.sessionId, { archived: args.archived })
  },
})

export const deleteCookSession = mutation({
  args: { sessionId: v.id('cookSessions') },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (!session) {
      throw new Error('Cook session not found.')
    }
    const cookedFoods = await ctx.db
      .query('cookedFoods')
      .withIndex('by_session', (q) => q.eq('cookSessionId', args.sessionId))
      .collect()
    for (const food of cookedFoods) {
    await deleteCookedFoodWithChildren(ctx, food._id)
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
    groupIds: v.array(v.id('foodGroups')),
    finishedWeightGrams: v.number(),
    notes: v.optional(v.string()),
    ingredients: v.array(cookedFoodIngredientValidator),
  },
  handler: async (ctx, args) => {
    assertNonEmpty(args.name, 'Cooked food name')
    const session = await ctx.db.get(args.cookSessionId)
    if (!session) {
      throw new Error('Cook session not found.')
    }
    if (args.recipeId) {
      const recipe = await ctx.db.get(args.recipeId)
      if (!recipe) {
        throw new Error('Recipe not found.')
      }
    }
    if (args.recipeVersionId) {
      const version = await ctx.db.get(args.recipeVersionId)
      if (!version) {
        throw new Error('Recipe version not found.')
      }
    }

    const nutrition = await buildCookedFoodNutrition(
      ctx.db,
      args.ingredients,
      args.finishedWeightGrams,
    )

    const now = Date.now()
    const cookedFoodId = await ctx.db.insert('cookedFoods', {
      cookSessionId: args.cookSessionId,
      name: args.name.trim(),
      recipeId: args.recipeId,
      recipeVersionId: args.recipeVersionId,
      groupIds: args.groupIds,
      finishedWeightGrams: args.finishedWeightGrams,
      totalRawWeightGrams: nutrition.totalRawWeightGrams,
      totalCalories: nutrition.totalCalories,
      kcalPer100g: nutrition.kcalPer100g,
      notes: args.notes?.trim() || undefined,
      archived: false,
      createdAt: now,
    })

    await Promise.all(
      nutrition.ingredientSnapshots.map((snapshot) =>
        ctx.db.insert('cookedFoodIngredients', {
          cookedFoodId,
          ingredientId: snapshot.ingredientId,
          rawWeightGrams: snapshot.rawWeightGrams,
          ingredientKcalPer100gSnapshot: snapshot.ingredientKcalPer100gSnapshot,
          ingredientCaloriesSnapshot: snapshot.ingredientCaloriesSnapshot,
        }),
      ),
    )

    return cookedFoodId
  },
})

export const updateCookedFood = mutation({
  args: {
    cookedFoodId: v.id('cookedFoods'),
    cookSessionId: v.id('cookSessions'),
    name: v.string(),
    recipeId: v.optional(v.id('recipes')),
    recipeVersionId: v.optional(v.id('recipeVersions')),
    groupIds: v.array(v.id('foodGroups')),
    finishedWeightGrams: v.number(),
    notes: v.optional(v.string()),
    ingredients: v.array(cookedFoodIngredientValidator),
  },
  handler: async (ctx, args) => {
    const cookedFood = await ctx.db.get(args.cookedFoodId)
    if (!cookedFood) {
      throw new Error('Cooked food not found.')
    }
    assertNonEmpty(args.name, 'Cooked food name')

    const nutrition = await buildCookedFoodNutrition(
      ctx.db,
      args.ingredients,
      args.finishedWeightGrams,
    )
    await ctx.db.patch(args.cookedFoodId, {
      cookSessionId: args.cookSessionId,
      name: args.name.trim(),
      recipeId: args.recipeId,
      recipeVersionId: args.recipeVersionId,
      groupIds: args.groupIds,
      finishedWeightGrams: args.finishedWeightGrams,
      totalRawWeightGrams: nutrition.totalRawWeightGrams,
      totalCalories: nutrition.totalCalories,
      kcalPer100g: nutrition.kcalPer100g,
      notes: args.notes?.trim() || undefined,
    })

    const oldRows = await ctx.db
      .query('cookedFoodIngredients')
      .withIndex('by_cookedFood', (q) => q.eq('cookedFoodId', args.cookedFoodId))
      .collect()
    await Promise.all(oldRows.map((row) => ctx.db.delete(row._id)))
    await Promise.all(
      nutrition.ingredientSnapshots.map((snapshot) =>
        ctx.db.insert('cookedFoodIngredients', {
          cookedFoodId: args.cookedFoodId,
          ingredientId: snapshot.ingredientId,
          rawWeightGrams: snapshot.rawWeightGrams,
          ingredientKcalPer100gSnapshot: snapshot.ingredientKcalPer100gSnapshot,
          ingredientCaloriesSnapshot: snapshot.ingredientCaloriesSnapshot,
        }),
      ),
    )
  },
})

export const setCookedFoodArchived = mutation({
  args: {
    cookedFoodId: v.id('cookedFoods'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const cookedFood = await ctx.db.get(args.cookedFoodId)
    if (!cookedFood) {
      throw new Error('Cooked food not found.')
    }
    await ctx.db.patch(args.cookedFoodId, { archived: args.archived })
  },
})

export const deleteCookedFood = mutation({
  args: { cookedFoodId: v.id('cookedFoods') },
  handler: async (ctx, args) => {
    const cookedFood = await ctx.db.get(args.cookedFoodId)
    if (!cookedFood) {
      throw new Error('Cooked food not found.')
    }
    await deleteCookedFoodWithChildren(ctx, args.cookedFoodId)
  },
})

export const createMeal = mutation({
  args: {
    personId: v.id('people'),
    name: v.optional(v.string()),
    eatenOn: v.optional(v.string()),
    notes: v.optional(v.string()),
    items: v.array(mealItemInputValidator),
  },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId)
    if (!person) {
      throw new Error('Person not found.')
    }
    const now = Date.now()
    const itemSnapshots = await buildMealItemSnapshots(ctx.db, args.items)
    const mealId = await ctx.db.insert('meals', {
      personId: args.personId,
      name: args.name?.trim() || undefined,
      eatenOn: normalizeDate(args.eatenOn, now),
      notes: args.notes?.trim() || undefined,
      archived: false,
      createdAt: now,
    })
    await Promise.all(
      itemSnapshots.map((item) =>
        ctx.db.insert('mealItems', {
          mealId,
          sourceType: item.sourceType,
          ingredientId: item.ingredientId,
          cookedFoodId: item.cookedFoodId,
          consumedWeightGrams: item.consumedWeightGrams,
          kcalPer100gSnapshot: item.kcalPer100gSnapshot,
          caloriesSnapshot: item.caloriesSnapshot,
          notes: item.notes,
        }),
      ),
    )
    return mealId
  },
})

export const updateMeal = mutation({
  args: {
    mealId: v.id('meals'),
    personId: v.id('people'),
    name: v.optional(v.string()),
    eatenOn: v.optional(v.string()),
    notes: v.optional(v.string()),
    items: v.array(mealItemInputValidator),
  },
  handler: async (ctx, args) => {
    const meal = await ctx.db.get(args.mealId)
    if (!meal) {
      throw new Error('Meal not found.')
    }
    const person = await ctx.db.get(args.personId)
    if (!person) {
      throw new Error('Person not found.')
    }
    const snapshots = await buildMealItemSnapshots(ctx.db, args.items)
    await ctx.db.patch(args.mealId, {
      personId: args.personId,
      name: args.name?.trim() || undefined,
      eatenOn: normalizeDate(args.eatenOn, Date.now()),
      notes: args.notes?.trim() || undefined,
    })
    const existingItems = await ctx.db
      .query('mealItems')
      .withIndex('by_meal', (q) => q.eq('mealId', args.mealId))
      .collect()
    await Promise.all(existingItems.map((item) => ctx.db.delete(item._id)))
    await Promise.all(
      snapshots.map((item) =>
        ctx.db.insert('mealItems', {
          mealId: args.mealId,
          sourceType: item.sourceType,
          ingredientId: item.ingredientId,
          cookedFoodId: item.cookedFoodId,
          consumedWeightGrams: item.consumedWeightGrams,
          kcalPer100gSnapshot: item.kcalPer100gSnapshot,
          caloriesSnapshot: item.caloriesSnapshot,
          notes: item.notes,
        }),
      ),
    )
  },
})

export const setMealArchived = mutation({
  args: {
    mealId: v.id('meals'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const meal = await ctx.db.get(args.mealId)
    if (!meal) {
      throw new Error('Meal not found.')
    }
    await ctx.db.patch(args.mealId, { archived: args.archived })
  },
})

export const deleteMeal = mutation({
  args: { mealId: v.id('meals') },
  handler: async (ctx, args) => {
    const meal = await ctx.db.get(args.mealId)
    if (!meal) {
      throw new Error('Meal not found.')
    }
    const items = await ctx.db
      .query('mealItems')
      .withIndex('by_meal', (q) => q.eq('mealId', args.mealId))
      .collect()
    await Promise.all(items.map((item) => ctx.db.delete(item._id)))
    await ctx.db.delete(args.mealId)
  },
})
