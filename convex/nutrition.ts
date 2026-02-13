import { mutation, query } from './_generated/server'
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

function toDateOnly(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
      meals: meals.sort((a, b) => b.eatenAt - a.eatenAt),
      mealItems,
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
      effectiveDate: args.effectiveDate ?? toDateOnly(now),
      goalKcal: args.currentDailyGoalKcal,
      reason: 'Initial goal',
      createdAt: now,
    })
    return personId
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
      effectiveDate: args.effectiveDate ?? toDateOnly(now),
      goalKcal: args.goalKcal,
      reason: args.reason?.trim() || undefined,
      createdAt: now,
    })
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
    for (const line of args.plannedIngredients) {
      assertPositive(line.plannedWeightGrams, 'Planned ingredient weight')
    }
    const recipeIngredients = await Promise.all(
      args.plannedIngredients.map((line) => ctx.db.get(line.ingredientId)),
    )
    if (recipeIngredients.some((ingredient) => !ingredient)) {
      throw new Error('One or more planned ingredients are missing.')
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

    const now = Date.now()
    const recipeId = await ctx.db.insert('recipes', {
      name: args.name.trim(),
      description: args.description?.trim() || undefined,
      ownerUserId: args.ownerUserId?.trim() || undefined,
      archived: false,
      latestVersionNumber: 1,
      createdAt: now,
    })

    const recipeVersionId = await ctx.db.insert('recipeVersions', {
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
          recipeVersionId,
          ingredientId: line.ingredientId,
          plannedWeightGrams: line.plannedWeightGrams,
          notes: line.notes?.trim() || undefined,
        }),
      ),
      ...args.plannedOutputs.map((output, index) =>
        ctx.db.insert('recipeVersionOutputs', {
          recipeVersionId,
          name: output.name.trim(),
          groupIds: output.groupIds,
          plannedFinishedWeightGrams: output.plannedFinishedWeightGrams,
          sortOrder: index,
        }),
      ),
    ])

    return { recipeId, recipeVersionId }
  },
})

export const addRecipeVersion = mutation({
  args: {
    recipeId: v.id('recipes'),
    name: v.optional(v.string()),
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

    for (const line of args.plannedIngredients) {
      assertPositive(line.plannedWeightGrams, 'Planned ingredient weight')
    }
    const versionIngredients = await Promise.all(
      args.plannedIngredients.map((line) => ctx.db.get(line.ingredientId)),
    )
    if (versionIngredients.some((ingredient) => !ingredient)) {
      throw new Error('One or more planned ingredients are missing.')
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

    const existingVersions = await ctx.db
      .query('recipeVersions')
      .withIndex('by_recipe', (q) => q.eq('recipeId', args.recipeId))
      .collect()
    const nextVersion =
      Math.max(...existingVersions.map((version) => version.versionNumber), 0) +
      1

    await Promise.all(
      existingVersions
        .filter((version) => version.isCurrent)
        .map((version) => ctx.db.patch(version._id, { isCurrent: false })),
    )

    const now = Date.now()
    const recipeVersionId = await ctx.db.insert('recipeVersions', {
      recipeId: args.recipeId,
      versionNumber: nextVersion,
      name: args.name?.trim() || recipe.name,
      instructions: args.instructions?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      isCurrent: true,
      createdAt: now,
    })

    await Promise.all([
      ...args.plannedIngredients.map((line) =>
        ctx.db.insert('recipeVersionIngredients', {
          recipeVersionId,
          ingredientId: line.ingredientId,
          plannedWeightGrams: line.plannedWeightGrams,
          notes: line.notes?.trim() || undefined,
        }),
      ),
      ...args.plannedOutputs.map((output, index) =>
        ctx.db.insert('recipeVersionOutputs', {
          recipeVersionId,
          name: output.name.trim(),
          groupIds: output.groupIds,
          plannedFinishedWeightGrams: output.plannedFinishedWeightGrams,
          sortOrder: index,
        }),
      ),
    ])

    await ctx.db.patch(args.recipeId, {
      latestVersionNumber: nextVersion,
    })

    return recipeVersionId
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
      createdAt: now,
    })
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
    assertPositive(args.finishedWeightGrams, 'Finished weight')
    if (args.ingredients.length === 0) {
      throw new Error('At least one ingredient is required.')
    }

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
      const recipeVersion = await ctx.db.get(args.recipeVersionId)
      if (!recipeVersion) {
        throw new Error('Recipe version not found.')
      }
    }

    const ingredientDocs = await Promise.all(
      args.ingredients.map((item) => ctx.db.get(item.ingredientId)),
    )
    if (ingredientDocs.some((item) => !item)) {
      throw new Error('One or more ingredients are missing.')
    }

    let totalRawWeightGrams = 0
    let totalCalories = 0
    const ingredientSnapshots = args.ingredients.map((line, index) => {
      assertPositive(line.rawWeightGrams, 'Raw ingredient weight')
      const ingredient = ingredientDocs[index]
      if (!ingredient) {
        throw new Error('Ingredient not found.')
      }
      const ingredientCalories =
        (line.rawWeightGrams * ingredient.kcalPer100g) / 100
      totalRawWeightGrams += line.rawWeightGrams
      totalCalories += ingredientCalories
      return {
        ingredientId: ingredient._id,
        rawWeightGrams: line.rawWeightGrams,
        ingredientKcalPer100gSnapshot: ingredient.kcalPer100g,
        ingredientCaloriesSnapshot: ingredientCalories,
      }
    })

    const kcalPer100g = (totalCalories / args.finishedWeightGrams) * 100
    const now = Date.now()
    const cookedFoodId = await ctx.db.insert('cookedFoods', {
      cookSessionId: args.cookSessionId,
      name: args.name.trim(),
      recipeId: args.recipeId,
      recipeVersionId: args.recipeVersionId,
      groupIds: args.groupIds,
      finishedWeightGrams: args.finishedWeightGrams,
      totalRawWeightGrams,
      totalCalories,
      kcalPer100g,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
    })

    await Promise.all(
      ingredientSnapshots.map((snapshot) =>
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

export const createMeal = mutation({
  args: {
    personId: v.id('people'),
    name: v.optional(v.string()),
    eatenAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    items: v.array(mealItemInputValidator),
  },
  handler: async (ctx, args) => {
    if (args.items.length === 0) {
      throw new Error('At least one meal item is required.')
    }

    const person = await ctx.db.get(args.personId)
    if (!person) {
      throw new Error('Person not found.')
    }

    const mealItemSnapshots = await Promise.all(
      args.items.map(async (item) => {
        assertPositive(item.consumedWeightGrams, 'Consumed weight')
        if (item.sourceType === 'ingredient') {
          if (!item.ingredientId) {
            throw new Error('Ingredient meal item is missing ingredientId.')
          }
          const ingredient = await ctx.db.get(item.ingredientId)
          if (!ingredient) {
            throw new Error('Meal ingredient not found.')
          }
          const calories =
            (item.consumedWeightGrams * ingredient.kcalPer100g) / 100
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
        const cookedFood = await ctx.db.get(item.cookedFoodId)
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

    const now = Date.now()
    const mealId = await ctx.db.insert('meals', {
      personId: args.personId,
      name: args.name?.trim() || undefined,
      eatenAt: args.eatenAt ?? now,
      notes: args.notes?.trim() || undefined,
      createdAt: now,
    })

    await Promise.all(
      mealItemSnapshots.map((snapshot) =>
        ctx.db.insert('mealItems', {
          mealId,
          sourceType: snapshot.sourceType,
          ingredientId: snapshot.ingredientId,
          cookedFoodId: snapshot.cookedFoodId,
          consumedWeightGrams: snapshot.consumedWeightGrams,
          kcalPer100gSnapshot: snapshot.kcalPer100gSnapshot,
          caloriesSnapshot: snapshot.caloriesSnapshot,
          notes: snapshot.notes,
        }),
      ),
    )

    return mealId
  },
})
