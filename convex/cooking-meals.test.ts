// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  createConvexTest,
  insertCookSession,
  insertIngredient,
  insertPerson,
} from './test-utils'

describe('nutrition cooking and meal mutations', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates cooked food nutrition snapshots and touches the session', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t, {
      cookedAt: new Date('2026-04-03T12:00:00').getTime(),
      updatedAt: new Date('2026-04-03T12:00:00').getTime(),
    })
    const ingredientId = await insertIngredient(t, {
      name: 'Oats',
      kcalPer100: 200,
    })

    const cookedFoodId = await user.mutation(api.nutrition.createCookedFood, {
      cookSessionId: sessionId,
      name: '  Oat base  ',
      groupIds: [],
      finishedWeightGrams: 200,
      notes: '  Batch  ',
      ingredients: [
        {
          sourceType: 'ingredient',
          ingredientId,
          referenceAmount: 150,
          referenceUnit: 'g',
          countedAmount: 150,
        },
      ],
    })

    const { cookedFood, ingredientLines, session } = await t.run(async (ctx) => {
      const cookedFood = await ctx.db.get(cookedFoodId)
      const ingredientLines = await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_cookedFood', (q) => q.eq('cookedFoodId', cookedFoodId))
        .collect()
      const session = await ctx.db.get(sessionId)
      return { cookedFood, ingredientLines, session }
    })

    expect(cookedFood).toMatchObject({
      name: 'Oat base',
      totalRawWeightGrams: 150,
      totalCalories: 300,
      kcalPer100: 150,
      notes: 'Batch',
    })
    expect(session?.updatedAt).toBe(Date.now())
    expect(ingredientLines).toHaveLength(1)
    expect(ingredientLines[0]).toMatchObject({
      ingredientId,
      ingredientNameSnapshot: 'Oats',
      countedAmount: 150,
      ingredientKcalPer100Snapshot: 200,
      ingredientCaloriesSnapshot: 300,
    })
  })

  it('creates linked recipe records when saving cooked food as a recipe', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)

    const cookedFoodId = await user.mutation(api.nutrition.createCookedFood, {
      cookSessionId: sessionId,
      name: 'Overnight oats',
      saveAsRecipe: true,
      recipeDraft: {
        name: '  Breakfast jars  ',
        instructions: '  Mix and chill  ',
      },
      groupIds: [],
      finishedWeightGrams: 100,
      ingredients: [
        {
          sourceType: 'custom',
          name: '  Oats  ',
          kcalPer100: 389,
          ignoreCalories: false,
          referenceAmount: 100,
          referenceUnit: 'g',
          countedAmount: 100,
          saveToCatalog: false,
        },
      ],
    })

    const records = await t.run(async (ctx) => {
      const cookedFood = await ctx.db.get(cookedFoodId)
      const ingredients = await ctx.db
        .query('ingredients')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', 'user-1'))
        .collect()
      const recipes = await ctx.db
        .query('recipes')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', 'user-1'))
        .collect()
      const versions = await ctx.db
        .query('recipeVersions')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', 'user-1'))
        .collect()
      const versionLines = await ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_owner', (q) => q.eq('ownerUserId', 'user-1'))
        .collect()
      return { cookedFood, ingredients, recipes, versions, versionLines }
    })

    expect(records.recipes).toHaveLength(1)
    expect(records.versions).toHaveLength(1)
    expect(records.versionLines).toHaveLength(1)
    expect(records.ingredients).toHaveLength(1)
    expect(records.recipes[0]).toMatchObject({ name: 'Breakfast jars' })
    expect(records.versions[0]).toMatchObject({
      name: 'Breakfast jars',
      instructions: 'Mix and chill',
    })
    expect(records.versionLines[0]?.ingredientId).toBe(records.ingredients[0]?._id)
    expect(records.cookedFood?.recipeId).toBe(records.recipes[0]?._id)
    expect(records.cookedFood?.recipeVersionId).toBe(records.versions[0]?._id)
  })

  it('normalizes meal dates and stores calorie snapshots', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Chicken',
      kcalPer100: 300,
    })

    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      name: '  Lunch  ',
      eatenOn: ' 2026-04-04 ',
      notes: '  Post workout  ',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          consumedWeightGrams: 60,
          notes: '  Warm  ',
        },
      ],
    })

    const { meal, items } = await t.run(async (ctx) => {
      const meal = await ctx.db.get(mealId)
      const items = await ctx.db
        .query('mealItems')
        .withIndex('by_meal', (q) => q.eq('mealId', mealId))
        .collect()
      return { meal, items }
    })

    expect(meal).toMatchObject({
      name: 'Lunch',
      eatenOn: '2026-04-04',
      notes: 'Post workout',
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      ingredientId,
      nameSnapshot: 'Chicken',
      kcalPer100Snapshot: 300,
      consumedWeightGrams: 60,
      caloriesSnapshot: 180,
      notes: 'Warm',
    })
  })

  it('deletes a meal and its child meal items', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Turkey',
      kcalPer100: 200,
    })
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          consumedWeightGrams: 50,
        },
      ],
    })

    await user.mutation(api.nutrition.deleteMeal, { mealId })

    const { meal, items } = await t.run(async (ctx) => {
      const meal = await ctx.db.get(mealId)
      const items = await ctx.db
        .query('mealItems')
        .withIndex('by_meal', (q) => q.eq('mealId', mealId))
        .collect()
      return { meal, items }
    })

    expect(meal).toBeNull()
    expect(items).toHaveLength(0)
  })
})
