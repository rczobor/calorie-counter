import {
  mutation,
  query,
  type DatabaseWriter,
  type MutationCtx,
  type QueryCtx,
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

const cookedFoodIngredientValidator = v.union(
  v.object({
    sourceType: v.literal('ingredient'),
    ingredientId: v.id('ingredients'),
    rawWeightGrams: v.number(),
  }),
  v.object({
    sourceType: v.literal('custom'),
    name: v.string(),
    kcalPer100g: v.number(),
    rawWeightGrams: v.number(),
    saveToCatalog: v.optional(v.boolean()),
  }),
)

const cookedFoodRecipeDraftValidator = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  instructions: v.optional(v.string()),
  notes: v.optional(v.string()),
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

function assertOwnedOrThrow<
  TDoc extends {
    ownerUserId?: string
  } | null,
>(
  doc: TDoc,
  ownerUserId: string,
  notFoundMessage: string,
) {
  if (!doc || doc.ownerUserId !== ownerUserId) {
    throw new Error(notFoundMessage)
  }
  return doc
}

async function requireAuthenticatedUserId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Authentication required.')
  }
  return identity.subject
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
  createdAt: number
}) {
  if (meal.eatenOn) {
    return meal.eatenOn
  }
  return toLocalDateString(meal.createdAt)
}

async function buildCookedFoodNutrition(
  db: DatabaseWriter,
  ownerUserId: string,
  ingredients: Array<
    | {
        sourceType: 'ingredient'
        ingredientId: Id<'ingredients'>
        rawWeightGrams: number
      }
    | {
        sourceType: 'custom'
        name: string
        kcalPer100g: number
        rawWeightGrams: number
        saveToCatalog?: boolean
      }
  >,
  finishedWeightGrams: number,
  options?: {
    persistAllCustomIngredients?: boolean
  },
) {
  assertPositive(finishedWeightGrams, 'Finished weight')
  if (ingredients.length === 0) {
    throw new Error('At least one ingredient is required.')
  }

  const now = Date.now()
  const createdIngredientByKey = new Map<string, Id<'ingredients'>>()
  const persistAllCustomIngredients = options?.persistAllCustomIngredients ?? false
  let totalRawWeightGrams = 0
  let totalCalories = 0
  const ingredientSnapshots: Array<{
    ingredientId?: Id<'ingredients'>
    ingredientNameSnapshot: string
    rawWeightGrams: number
    ingredientKcalPer100gSnapshot: number
    ingredientCaloriesSnapshot: number
  }> = []
  for (const line of ingredients) {
    assertPositive(line.rawWeightGrams, 'Raw ingredient weight')
    if (line.sourceType === 'ingredient') {
      const ingredient = await db.get(line.ingredientId)
      if (!ingredient || ingredient.ownerUserId !== ownerUserId) {
        throw new Error('One or more ingredients are missing.')
      }
      const ingredientCalories = (line.rawWeightGrams * ingredient.kcalPer100g) / 100
      totalRawWeightGrams += line.rawWeightGrams
      totalCalories += ingredientCalories
      ingredientSnapshots.push({
        ingredientId: ingredient._id,
        ingredientNameSnapshot: ingredient.name,
        rawWeightGrams: line.rawWeightGrams,
        ingredientKcalPer100gSnapshot: ingredient.kcalPer100g,
        ingredientCaloriesSnapshot: ingredientCalories,
      })
      continue
    }

    assertNonEmpty(line.name, 'Custom ingredient name')
    assertPositive(line.kcalPer100g, 'Custom ingredient kcal/100g')
    const ingredientName = line.name.trim()
    const shouldSaveToCatalog = persistAllCustomIngredients || Boolean(line.saveToCatalog)
    let savedIngredientId: Id<'ingredients'> | undefined
    if (shouldSaveToCatalog) {
      const dedupeKey = `${ingredientName.toLowerCase()}::${line.kcalPer100g.toFixed(6)}`
      const cachedId = createdIngredientByKey.get(dedupeKey)
      if (cachedId) {
        savedIngredientId = cachedId
      } else {
        savedIngredientId = await db.insert('ingredients', {
          ownerUserId,
          name: ingredientName,
          brand: undefined,
          kcalPer100g: line.kcalPer100g,
          defaultUnit: 'g',
          gramsPerUnit: undefined,
          groupIds: [],
          notes: undefined,
          archived: false,
          createdAt: now,
        })
        createdIngredientByKey.set(dedupeKey, savedIngredientId)
      }
    }

    const ingredientCalories = (line.rawWeightGrams * line.kcalPer100g) / 100
    totalRawWeightGrams += line.rawWeightGrams
    totalCalories += ingredientCalories
    ingredientSnapshots.push({
      ingredientId: savedIngredientId,
      ingredientNameSnapshot: ingredientName,
      rawWeightGrams: line.rawWeightGrams,
      ingredientKcalPer100gSnapshot: line.kcalPer100g,
      ingredientCaloriesSnapshot: ingredientCalories,
    })
  }

  return {
    totalRawWeightGrams,
    totalCalories,
    kcalPer100g: (totalCalories / finishedWeightGrams) * 100,
    ingredientSnapshots,
  }
}

async function buildMealItemSnapshots(
  db: DatabaseWriter,
  ownerUserId: string,
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
        if (!ingredient || ingredient.ownerUserId !== ownerUserId) {
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
      if (!cookedFood || cookedFood.ownerUserId !== ownerUserId) {
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

async function touchCookSession(
  ctx: MutationCtx,
  ownerUserId: string,
  sessionId: Id<'cookSessions'>,
  updatedAt = Date.now(),
) {
  const session = await ctx.db.get(sessionId)
  if (!session || session.ownerUserId !== ownerUserId) {
    return
  }
  await ctx.db.patch(sessionId, { updatedAt })
}

async function deleteCookedFoodWithChildren(
  ctx: MutationCtx,
  ownerUserId: string,
  cookedFoodId: Id<'cookedFoods'>,
) {
  const cookedFood = assertOwnedOrThrow(
    await ctx.db.get(cookedFoodId),
    ownerUserId,
    'Cooked food not found.',
  )
  const mealRefs = await ctx.db
    .query('mealItems')
    .withIndex('by_cookedFood', (q) => q.eq('cookedFoodId', cookedFoodId))
    .collect()
  if (mealRefs.some((row) => row.ownerUserId === ownerUserId)) {
    throw new Error('Cooked food is in meal history. Archive instead.')
  }

  const ingredientRows = await ctx.db
    .query('cookedFoodIngredients')
    .withIndex('by_cookedFood', (q) => q.eq('cookedFoodId', cookedFoodId))
    .collect()
  await Promise.all(
    ingredientRows
      .filter((row) => row.ownerUserId === ownerUserId)
      .map((row) => ctx.db.delete(row._id)),
  )

  await ctx.db.delete(cookedFoodId)
  return cookedFood.cookSessionId
}

export const getManagementData = query({
  args: {},
  handler: async (ctx) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    const [
      people,
      personGoalHistory,
      foodGroups,
      ingredients,
      recipes,
      recipeVersions,
      recipeVersionIngredients,
      cookSessions,
      cookedFoods,
      cookedFoodIngredients,
      meals,
      mealItems,
    ] = await Promise.all([
      ctx.db
        .query('people')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('personGoalHistory')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('foodGroups')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('ingredients')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('recipes')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('recipeVersions')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('cookSessions')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('cookedFoods')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('meals')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('mealItems')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
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
      cookSessions: cookSessions.sort(
        (a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt),
      ),
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    const person = assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      'Person not found.',
    )

    const date = normalizeDate(args.date, Date.now())
    const meals = await ctx.db
      .query('meals')
      .withIndex('by_person_eatenOn', (q) => q.eq('personId', args.personId))
      .collect()
    const activeMeals = meals.filter(
      (meal) =>
        meal.ownerUserId === ownerUserId &&
        !meal.archived &&
        mealDateKey(meal) === date,
    )
    const mealItemRows = await Promise.all(
      activeMeals.map((meal) =>
        ctx.db
          .query('mealItems')
          .withIndex('by_meal', (q) => q.eq('mealId', meal._id))
          .collect()
          .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertNonEmpty(args.name, 'Name')
    assertPositive(args.currentDailyGoalKcal, 'Daily goal')
    const now = Date.now()
    const personId = await ctx.db.insert('people', {
      ownerUserId,
      name: args.name.trim(),
      notes: args.notes?.trim() || undefined,
      currentDailyGoalKcal: args.currentDailyGoalKcal,
      active: true,
      createdAt: now,
    })
    await ctx.db.insert('personGoalHistory', {
      ownerUserId,
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      'Person not found.',
    )
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertPositive(args.goalKcal, 'Goal')
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      'Person not found.',
    )
    const now = Date.now()
    await ctx.db.patch(args.personId, {
      currentDailyGoalKcal: args.goalKcal,
    })
    await ctx.db.insert('personGoalHistory', {
      ownerUserId,
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      'Person not found.',
    )
    await ctx.db.patch(args.personId, { active: !args.archived })
  },
})

export const deletePerson = mutation({
  args: { personId: v.id('people') },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      'Person not found.',
    )
    const [mealRefs, cookingRefs] = await Promise.all([
      ctx.db
        .query('meals')
        .withIndex('by_person_eatenOn', (q) => q.eq('personId', args.personId))
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
      ctx.db
        .query('cookSessions')
        .withIndex('by_person', (q) => q.eq('cookedByPersonId', args.personId))
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
    ])
    if (mealRefs.length > 0 || cookingRefs.some((c) => c.cookedByPersonId === args.personId)) {
      throw new Error('Cannot delete person with meal/cooking history. Archive instead.')
    }
    const goalRows = await ctx.db
      .query('personGoalHistory')
      .withIndex('by_person_createdAt', (q) => q.eq('personId', args.personId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId))
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertNonEmpty(args.name, 'Group name')
    const now = Date.now()
    return await ctx.db.insert('foodGroups', {
      ownerUserId,
      name: args.name.trim(),
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertNonEmpty(args.name, 'Group name')
    assertOwnedOrThrow(
      await ctx.db.get(args.groupId),
      ownerUserId,
      'Group not found.',
    )
    await ctx.db.patch(args.groupId, {
      name: args.name.trim(),
      appliesTo: args.appliesTo,
    })
  },
})

export const setFoodGroupArchived = mutation({
  args: {
    groupId: v.id('foodGroups'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.groupId),
      ownerUserId,
      'Group not found.',
    )
    await ctx.db.patch(args.groupId, { archived: args.archived })
  },
})

export const deleteFoodGroup = mutation({
  args: { groupId: v.id('foodGroups') },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.groupId),
      ownerUserId,
      'Group not found.',
    )
    const [ingredients, cookedFoods] = await Promise.all([
      ctx.db
        .query('ingredients')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
      ctx.db
        .query('cookedFoods')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
        .collect(),
    ])
    const inUse =
      ingredients.some((item) => item.groupIds.includes(args.groupId)) ||
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertNonEmpty(args.name, 'Ingredient name')
    assertPositive(args.kcalPer100g, 'kcal/100g')
    if (args.gramsPerUnit !== undefined) {
      assertPositive(args.gramsPerUnit, 'grams per unit')
    }
    const groups = await Promise.all(args.groupIds.map((groupId) => ctx.db.get(groupId)))
    if (groups.some((group) => !group || group.ownerUserId !== ownerUserId)) {
      throw new Error('One or more groups are missing.')
    }

    const now = Date.now()
    return await ctx.db.insert('ingredients', {
      ownerUserId,
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.ingredientId),
      ownerUserId,
      'Ingredient not found.',
    )
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.ingredientId),
      ownerUserId,
      'Ingredient not found.',
    )
    await ctx.db.patch(args.ingredientId, { archived: args.archived })
  },
})

export const deleteIngredient = mutation({
  args: { ingredientId: v.id('ingredients') },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.ingredientId),
      ownerUserId,
      'Ingredient not found.',
    )
    const [recipeRefs, cookedRefs, mealRefs] = await Promise.all([
      ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ingredient', (q) => q.eq('ingredientId', args.ingredientId))
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
      ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ingredient', (q) => q.eq('ingredientId', args.ingredientId))
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
      ctx.db
        .query('mealItems')
        .withIndex('by_ingredient', (q) => q.eq('ingredientId', args.ingredientId))
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId)),
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
    plannedIngredients: v.array(recipeIngredientValidator),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertNonEmpty(args.name, 'Recipe name')
    if (args.plannedIngredients.length === 0) {
      throw new Error('Recipe needs at least one ingredient.')
    }
    for (const line of args.plannedIngredients) {
      assertPositive(line.plannedWeightGrams, 'Planned ingredient weight')
    }

    const ingredientDocs = await Promise.all(
      args.plannedIngredients.map((line) => ctx.db.get(line.ingredientId)),
    )
    if (ingredientDocs.some((item) => !item || item.ownerUserId !== ownerUserId)) {
      throw new Error('One or more ingredients are missing.')
    }

    const now = Date.now()
    const recipeId = await ctx.db.insert('recipes', {
      ownerUserId,
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      archived: false,
      latestVersionNumber: 1,
      createdAt: now,
    })

    const versionId = await ctx.db.insert('recipeVersions', {
      ownerUserId,
      recipeId,
      versionNumber: 1,
      name: args.name.trim(),
      instructions: args.instructions?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      isCurrent: true,
      createdAt: now,
    })

    await Promise.all(
      args.plannedIngredients.map((line) =>
        ctx.db.insert('recipeVersionIngredients', {
          ownerUserId,
          recipeVersionId: versionId,
          ingredientId: line.ingredientId,
          plannedWeightGrams: line.plannedWeightGrams,
          notes: line.notes?.trim() || undefined,
        }),
      ),
    )

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
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.recipeId),
      ownerUserId,
      'Recipe not found.',
    )
    assertNonEmpty(args.name, 'Recipe name')
    if (args.plannedIngredients.length === 0) {
      throw new Error('Recipe needs at least one ingredient.')
    }
    for (const line of args.plannedIngredients) {
      assertPositive(line.plannedWeightGrams, 'Planned ingredient weight')
    }

    const ingredientDocs = await Promise.all(
      args.plannedIngredients.map((line) => ctx.db.get(line.ingredientId)),
    )
    if (ingredientDocs.some((item) => !item || item.ownerUserId !== ownerUserId)) {
      throw new Error('One or more ingredients are missing.')
    }

    const versions = await ctx.db
      .query('recipeVersions')
      .withIndex('by_recipe', (q) => q.eq('recipeId', args.recipeId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId))
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

    const oldIngredients = await ctx.db
      .query('recipeVersionIngredients')
      .withIndex('by_recipeVersion', (q) => q.eq('recipeVersionId', current._id))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId))

    await Promise.all([
      ...oldIngredients.map((line) => ctx.db.delete(line._id)),
      ...args.plannedIngredients.map((line) =>
        ctx.db.insert('recipeVersionIngredients', {
          ownerUserId,
          recipeVersionId: current._id,
          ingredientId: line.ingredientId,
          plannedWeightGrams: line.plannedWeightGrams,
          notes: line.notes?.trim() || undefined,
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.recipeId),
      ownerUserId,
      'Recipe not found.',
    )
    await ctx.db.patch(args.recipeId, { archived: args.archived })
  },
})

export const deleteRecipe = mutation({
  args: { recipeId: v.id('recipes') },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.recipeId),
      ownerUserId,
      'Recipe not found.',
    )
    const cookedRef = (
      await ctx.db
        .query('cookedFoods')
        .withIndex('by_recipe', (q) => q.eq('recipeId', args.recipeId))
        .collect()
        .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId))
    ).some(
      (item) => item.recipeId === args.recipeId,
    )
    if (cookedRef) {
      throw new Error('Recipe has cooked history. Archive instead.')
    }

    const versions = await ctx.db
      .query('recipeVersions')
      .withIndex('by_recipe', (q) => q.eq('recipeId', args.recipeId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId))
    const versionIds = new Set(versions.map((version) => version._id))
    const versionIngredients = await ctx.db
      .query('recipeVersionIngredients')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
      .collect()
    await Promise.all([
      ...versionIngredients
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    if (args.cookedByPersonId) {
      assertOwnedOrThrow(
        await ctx.db.get(args.cookedByPersonId),
        ownerUserId,
        'Cook person not found.',
      )
    }

    const now = Date.now()
    return await ctx.db.insert('cookSessions', {
      ownerUserId,
      label: args.label?.trim() || undefined,
      cookedAt: args.cookedAt ?? now,
      cookedByPersonId: args.cookedByPersonId,
      notes: args.notes?.trim() || undefined,
      archived: false,
      updatedAt: now,
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    const session = assertOwnedOrThrow(
      await ctx.db.get(args.sessionId),
      ownerUserId,
      'Cook session not found.',
    )
    if (args.cookedByPersonId) {
      assertOwnedOrThrow(
        await ctx.db.get(args.cookedByPersonId),
        ownerUserId,
        'Cook person not found.',
      )
    }
    await ctx.db.patch(args.sessionId, {
      label: args.label?.trim() || undefined,
      cookedAt: args.cookedAt ?? session.cookedAt,
      cookedByPersonId: args.cookedByPersonId,
      notes: args.notes?.trim() || undefined,
      updatedAt: Date.now(),
    })
  },
})

export const setCookSessionArchived = mutation({
  args: {
    sessionId: v.id('cookSessions'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.sessionId),
      ownerUserId,
      'Cook session not found.',
    )
    await ctx.db.patch(args.sessionId, { archived: args.archived })
  },
})

export const deleteCookSession = mutation({
  args: { sessionId: v.id('cookSessions') },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.sessionId),
      ownerUserId,
      'Cook session not found.',
    )
    const cookedFoods = await ctx.db
      .query('cookedFoods')
      .withIndex('by_session', (q) => q.eq('cookSessionId', args.sessionId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId))
    const cookedFoodIds = new Set(cookedFoods.map((food) => food._id))
    const mealRefs = await ctx.db
      .query('mealItems')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', ownerUserId))
      .collect()
    if (mealRefs.some((row) => row.cookedFoodId && cookedFoodIds.has(row.cookedFoodId))) {
      throw new Error('One or more cooked foods are in meal history. Archive instead.')
    }

    for (const food of cookedFoods) {
      await deleteCookedFoodWithChildren(ctx, ownerUserId, food._id)
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
    groupIds: v.array(v.id('foodGroups')),
    finishedWeightGrams: v.number(),
    notes: v.optional(v.string()),
    ingredients: v.array(cookedFoodIngredientValidator),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertNonEmpty(args.name, 'Cooked food name')
    assertOwnedOrThrow(
      await ctx.db.get(args.cookSessionId),
      ownerUserId,
      'Cook session not found.',
    )
    if (args.saveAsRecipe && (args.recipeId || args.recipeVersionId)) {
      throw new Error('Cannot select an existing recipe while saving as a new recipe.')
    }
    if (!args.saveAsRecipe) {
      if (args.recipeId) {
        assertOwnedOrThrow(
          await ctx.db.get(args.recipeId),
          ownerUserId,
          'Recipe not found.',
        )
      }
      if (args.recipeVersionId) {
        assertOwnedOrThrow(
          await ctx.db.get(args.recipeVersionId),
          ownerUserId,
          'Recipe version not found.',
        )
      }
    }
    const groups = await Promise.all(args.groupIds.map((groupId) => ctx.db.get(groupId)))
    if (groups.some((group) => !group || group.ownerUserId !== ownerUserId)) {
      throw new Error('One or more groups are missing.')
    }

    const nutrition = await buildCookedFoodNutrition(
      ctx.db,
      ownerUserId,
      args.ingredients,
      args.finishedWeightGrams,
      {
        persistAllCustomIngredients: Boolean(args.saveAsRecipe),
      },
    )

    const now = Date.now()
    let linkedRecipeId = args.recipeId
    let linkedRecipeVersionId = args.recipeVersionId
    if (args.saveAsRecipe) {
      const recipeName = args.recipeDraft?.name?.trim() || args.name.trim()
      assertNonEmpty(recipeName, 'Recipe name')
      const recipeLines = nutrition.ingredientSnapshots.map((snapshot) => ({
        ingredientId: snapshot.ingredientId,
        plannedWeightGrams: snapshot.rawWeightGrams,
      }))
      if (recipeLines.some((line) => !line.ingredientId)) {
        throw new Error('Unable to save recipe because one or more ingredients are not persisted.')
      }

      linkedRecipeId = await ctx.db.insert('recipes', {
        ownerUserId,
        name: recipeName,
        description: args.recipeDraft?.description?.trim() || undefined,
        archived: false,
        latestVersionNumber: 1,
        createdAt: now,
      })
      linkedRecipeVersionId = await ctx.db.insert('recipeVersions', {
        ownerUserId,
        recipeId: linkedRecipeId,
        versionNumber: 1,
        name: recipeName,
        instructions: args.recipeDraft?.instructions?.trim() || undefined,
        notes: args.recipeDraft?.notes?.trim() || undefined,
        isCurrent: true,
        createdAt: now,
      })
      await Promise.all(
        recipeLines.map((line) =>
          ctx.db.insert('recipeVersionIngredients', {
            ownerUserId,
            recipeVersionId: linkedRecipeVersionId as Id<'recipeVersions'>,
            ingredientId: line.ingredientId as Id<'ingredients'>,
            plannedWeightGrams: line.plannedWeightGrams,
            notes: undefined,
          }),
        ),
      )
    }

    const cookedFoodId = await ctx.db.insert('cookedFoods', {
      ownerUserId,
      cookSessionId: args.cookSessionId,
      name: args.name.trim(),
      recipeId: linkedRecipeId,
      recipeVersionId: linkedRecipeVersionId,
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
          ownerUserId,
          cookedFoodId,
          ingredientId: snapshot.ingredientId,
          ingredientNameSnapshot: snapshot.ingredientNameSnapshot,
          rawWeightGrams: snapshot.rawWeightGrams,
          ingredientKcalPer100gSnapshot: snapshot.ingredientKcalPer100gSnapshot,
          ingredientCaloriesSnapshot: snapshot.ingredientCaloriesSnapshot,
        }),
      ),
    )

    await touchCookSession(ctx, ownerUserId, args.cookSessionId, now)
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    const cookedFood = assertOwnedOrThrow(
      await ctx.db.get(args.cookedFoodId),
      ownerUserId,
      'Cooked food not found.',
    )
    assertNonEmpty(args.name, 'Cooked food name')
    assertOwnedOrThrow(
      await ctx.db.get(args.cookSessionId),
      ownerUserId,
      'Cook session not found.',
    )
    if (args.recipeId) {
      assertOwnedOrThrow(
        await ctx.db.get(args.recipeId),
        ownerUserId,
        'Recipe not found.',
      )
    }
    if (args.recipeVersionId) {
      assertOwnedOrThrow(
        await ctx.db.get(args.recipeVersionId),
        ownerUserId,
        'Recipe version not found.',
      )
    }
    const groups = await Promise.all(args.groupIds.map((groupId) => ctx.db.get(groupId)))
    if (groups.some((group) => !group || group.ownerUserId !== ownerUserId)) {
      throw new Error('One or more groups are missing.')
    }

    const nutrition = await buildCookedFoodNutrition(
      ctx.db,
      ownerUserId,
      args.ingredients,
      args.finishedWeightGrams,
    )
    const now = Date.now()
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
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId))
    await Promise.all(oldRows.map((row) => ctx.db.delete(row._id)))
    await Promise.all(
      nutrition.ingredientSnapshots.map((snapshot) =>
        ctx.db.insert('cookedFoodIngredients', {
          ownerUserId,
          cookedFoodId: args.cookedFoodId,
          ingredientId: snapshot.ingredientId,
          ingredientNameSnapshot: snapshot.ingredientNameSnapshot,
          rawWeightGrams: snapshot.rawWeightGrams,
          ingredientKcalPer100gSnapshot: snapshot.ingredientKcalPer100gSnapshot,
          ingredientCaloriesSnapshot: snapshot.ingredientCaloriesSnapshot,
        }),
      ),
    )
    await touchCookSession(ctx, ownerUserId, args.cookSessionId, now)
    if (cookedFood.cookSessionId !== args.cookSessionId) {
      await touchCookSession(ctx, ownerUserId, cookedFood.cookSessionId, now)
    }
  },
})

export const setCookedFoodArchived = mutation({
  args: {
    cookedFoodId: v.id('cookedFoods'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    const cookedFood = assertOwnedOrThrow(
      await ctx.db.get(args.cookedFoodId),
      ownerUserId,
      'Cooked food not found.',
    )
    await ctx.db.patch(args.cookedFoodId, { archived: args.archived })
    await touchCookSession(ctx, ownerUserId, cookedFood.cookSessionId)
  },
})

export const deleteCookedFood = mutation({
  args: { cookedFoodId: v.id('cookedFoods') },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    const sessionId = await deleteCookedFoodWithChildren(
      ctx,
      ownerUserId,
      args.cookedFoodId,
    )
    await touchCookSession(ctx, ownerUserId, sessionId)
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      'Person not found.',
    )
    const now = Date.now()
    const itemSnapshots = await buildMealItemSnapshots(ctx.db, ownerUserId, args.items)
    const mealId = await ctx.db.insert('meals', {
      ownerUserId,
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
          ownerUserId,
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(await ctx.db.get(args.mealId), ownerUserId, 'Meal not found.')
    assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      ownerUserId,
      'Person not found.',
    )
    const snapshots = await buildMealItemSnapshots(ctx.db, ownerUserId, args.items)
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
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId))
    await Promise.all(existingItems.map((item) => ctx.db.delete(item._id)))
    await Promise.all(
      snapshots.map((item) =>
        ctx.db.insert('mealItems', {
          ownerUserId,
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
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(await ctx.db.get(args.mealId), ownerUserId, 'Meal not found.')
    await ctx.db.patch(args.mealId, { archived: args.archived })
  },
})

export const deleteMeal = mutation({
  args: { mealId: v.id('meals') },
  handler: async (ctx, args) => {
    const ownerUserId = await requireAuthenticatedUserId(ctx)
    assertOwnedOrThrow(await ctx.db.get(args.mealId), ownerUserId, 'Meal not found.')
    const items = await ctx.db
      .query('mealItems')
      .withIndex('by_meal', (q) => q.eq('mealId', args.mealId))
      .collect()
      .then((rows) => rows.filter((row) => row.ownerUserId === ownerUserId))
    await Promise.all(items.map((item) => ctx.db.delete(item._id)))
    await ctx.db.delete(args.mealId)
  },
})
