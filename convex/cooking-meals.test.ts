// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertCookSession,
  insertIngredient,
  insertMeal,
  insertMealItem,
  insertPerson,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

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
      finishedWeightGrams: 180,
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

    const { cookedFood, ingredientLines, session } = await t.run(
      async (ctx) => {
        const cookedFood = await ctx.db.get(cookedFoodId)
        const ingredientLines = await ctx.db
          .query('cookedFoodIngredients')
          .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
            q
              .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
              .eq('cookedFoodId', cookedFoodId),
          )
          .collect()
        const session = await ctx.db.get(sessionId)
        return { cookedFood, ingredientLines, session }
      },
    )

    expect(cookedFood).toMatchObject({
      name: 'Oat base',
      totalRawWeightGrams: 150,
      totalCalories: 300,
      kcalPer100: 167,
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
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER),
        )
        .collect()
      const recipes = await ctx.db
        .query('recipes')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER),
        )
        .collect()
      const versions = await ctx.db
        .query('recipeVersions')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER),
        )
        .collect()
      const versionLines = await ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER),
        )
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
    expect(records.versionLines[0]?.ingredientId).toBe(
      records.ingredients[0]?._id,
    )
    expect(records.cookedFood?.recipeId).toBe(records.recipes[0]?._id)
    expect(records.cookedFood?.recipeVersionId).toBe(records.versions[0]?._id)
  })

  it('preserves non-gram basis units in custom ingredient snapshots and catalog saves', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)

    const cookedFoodId = await user.mutation(api.nutrition.createCookedFood, {
      cookSessionId: sessionId,
      name: 'Stock cubes',
      finishedWeightGrams: 100,
      ingredients: [
        {
          sourceType: 'custom',
          name: 'Stock cube',
          kcalPer100: 200,
          kcalBasisUnit: 'piece',
          ignoreCalories: false,
          referenceAmount: 2,
          referenceUnit: 'piece',
          countedAmount: 2,
          saveToCatalog: true,
        },
      ],
    })

    const records = await t.run(async (ctx) => ({
      cookedFood: await ctx.db.get(cookedFoodId),
      lines: await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('cookedFoodId', cookedFoodId),
        )
        .collect(),
      ingredients: await ctx.db
        .query('ingredients')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER),
        )
        .collect(),
    }))

    expect(records.cookedFood).toMatchObject({
      totalRawWeightGrams: 0,
      totalCalories: 4,
    })
    expect(records.lines[0]).toMatchObject({
      ingredientKcalBasisUnitSnapshot: 'piece',
      countedAmount: 2,
    })
    expect(records.lines[0]).not.toHaveProperty('rawWeightGrams')
    expect(records.ingredients[0]?.kcalBasisUnit).toBe('piece')
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
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('mealId', mealId),
        )
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

  it('stores fixed-calorie meal items without synthetic weight fields', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)

    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'fixedCalories',
          name: '  Restaurant estimate  ',
          calories: 725,
          notes: '  Menu value  ',
        },
      ],
    })

    const { meal, item } = await t.run(async (ctx) => ({
      meal: await ctx.db.get(mealId),
      item: await ctx.db
        .query('mealItems')
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('mealId', mealId),
        )
        .unique(),
    }))

    expect(meal).toMatchObject({ totalCalories: 725, itemCount: 1 })
    expect(item).toMatchObject({
      sourceType: 'fixedCalories',
      nameSnapshot: 'Restaurant estimate',
      caloriesSnapshot: 725,
      notes: 'Menu value',
    })
    expect(item).not.toHaveProperty('consumedWeightGrams')
    expect(item).not.toHaveProperty('kcalPer100Snapshot')
  })

  it('keeps daily summaries consistent across meal lifecycle changes', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const alexId = await insertPerson(t, { name: 'Alex' })
    const samId = await insertPerson(t, { name: 'Sam' })
    const readSummary = async (personId: typeof alexId, eatenOn: string) =>
      await t.run(
        async (ctx) =>
          await ctx.db
            .query('dailySummaries')
            .withIndex(
              'by_ownerTokenIdentifier_and_personId_and_eatenOn',
              (q) =>
                q
                  .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
                  .eq('personId', personId)
                  .eq('eatenOn', eatenOn),
            )
            .unique(),
      )

    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId: alexId,
      eatenOn: '2026-04-04',
      items: [{ sourceType: 'fixedCalories', name: 'Estimate', calories: 400 }],
    })
    expect(await readSummary(alexId, '2026-04-04')).toMatchObject({
      consumedCalories: 400,
      mealCount: 1,
    })

    await user.mutation(api.nutrition.updateMeal, {
      mealId,
      personId: alexId,
      eatenOn: '2026-04-04',
      items: [{ sourceType: 'fixedCalories', name: 'Estimate', calories: 550 }],
    })
    expect(await readSummary(alexId, '2026-04-04')).toMatchObject({
      consumedCalories: 550,
      mealCount: 1,
    })

    await user.mutation(api.nutrition.updateMeal, {
      mealId,
      personId: samId,
      eatenOn: '2026-04-05',
      items: [{ sourceType: 'fixedCalories', name: 'Estimate', calories: 600 }],
    })
    expect(await readSummary(alexId, '2026-04-04')).toBeNull()
    expect(await readSummary(samId, '2026-04-05')).toMatchObject({
      consumedCalories: 600,
      mealCount: 1,
    })

    await user.mutation(api.nutrition.setMealArchived, {
      mealId,
      archived: true,
    })
    expect(await readSummary(samId, '2026-04-05')).toBeNull()

    await user.mutation(api.nutrition.setMealArchived, {
      mealId,
      archived: false,
    })
    expect(await readSummary(samId, '2026-04-05')).toMatchObject({
      consumedCalories: 600,
      mealCount: 1,
    })

    await user.mutation(api.nutrition.deleteMeal, { mealId })
    expect(await readSummary(samId, '2026-04-05')).toBeNull()
  })

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    -1,
    1.5,
  ])('rejects invalid cooking timestamps (%s)', async (cookedAt) => {
    const t = createConvexTest()
    const user = asTestUser(t)

    await expect(
      user.mutation(api.nutrition.createCookSession, {
        cookedAt,
      }),
    ).rejects.toThrow('Cooked at must be a non-negative integer timestamp.')
  })

  it('applies shared text limits to nested meal item notes', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)

    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'fixedCalories',
            name: 'Estimate',
            calories: 500,
            notes: 'x'.repeat(2_001),
          },
        ],
      }),
    ).rejects.toThrow('Item notes cannot exceed 2000 characters.')
  })

  it('keeps historical meal item snapshots after ingredient updates', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Chicken',
      kcalPer100: 300,
    })

    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          consumedWeightGrams: 60,
        },
      ],
    })

    await user.mutation(api.nutrition.updateIngredient, {
      ingredientId,
      name: 'Turkey',
      kcalPer100: 120,
      ignoreCalories: false,
    })

    const items = await t.run(async (ctx) => {
      return await ctx.db
        .query('mealItems')
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('mealId', mealId),
        )
        .collect()
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      ingredientId,
      nameSnapshot: 'Chicken',
      kcalPer100Snapshot: 300,
      consumedWeightGrams: 60,
      caloriesSnapshot: 180,
    })
  })

  it('preserves meal notes when an edit omits them and requires an explicit date', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, { name: 'Chicken' })
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-01',
      notes: 'Keep this note',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          consumedWeightGrams: 50,
        },
      ],
    })

    await user.mutation(api.nutrition.updateMeal, {
      mealId,
      personId,
      name: 'Updated meal',
      eatenOn: '2026-04-01',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          consumedWeightGrams: 60,
        },
      ],
    })

    expect(await t.run(async (ctx) => await ctx.db.get(mealId))).toMatchObject({
      eatenOn: '2026-04-01',
      notes: 'Keep this note',
    })

    await user.mutation(api.nutrition.updateMeal, {
      mealId,
      personId,
      eatenOn: ' 2026-04-02 ',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          consumedWeightGrams: 60,
        },
      ],
    })
    expect(
      await t.run(async (ctx) => (await ctx.db.get(mealId))?.eatenOn),
    ).toBe('2026-04-02')
    await expect(
      user.mutation(api.nutrition.updateMeal, {
        mealId,
        personId,
        eatenOn: '2026-02-30',
        items: [
          {
            sourceType: 'ingredient',
            ingredientId,
            consumedWeightGrams: 60,
          },
        ],
      }),
    ).rejects.toThrow('Meal date must be a valid calendar date.')
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
      eatenOn: '2026-04-04',
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
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('mealId', mealId),
        )
        .collect()
      return { meal, items }
    })

    expect(meal).toBeNull()
    expect(items).toHaveLength(0)
  })

  it('requires archiving a cook session that still has cooked foods', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const sessionId = await insertCookSession(t)
    const createFood = (name: string) =>
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: sessionId,
        name,
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'custom' as const,
            name: `${name} ingredient`,
            kcalPer100: 100,
            ignoreCalories: false,
            referenceAmount: 100,
            referenceUnit: 'g' as const,
            countedAmount: 100,
          },
        ],
      })
    const firstFoodId = await createFood('First food')
    const referencedFoodId = await createFood('Referenced food')
    await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'cookedFood',
          cookedFoodId: referencedFoodId,
          consumedWeightGrams: 50,
        },
      ],
    })

    await expect(
      user.mutation(api.nutrition.deleteCookSession, { sessionId }),
    ).rejects.toThrow('Cook session has cooked foods. Archive instead.')

    const remaining = await t.run(async (ctx) => ({
      session: await ctx.db.get(sessionId),
      firstFood: await ctx.db.get(firstFoodId),
      referencedFood: await ctx.db.get(referencedFoodId),
      firstLines: await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('cookedFoodId', firstFoodId),
        )
        .collect(),
      referencedLines: await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('cookedFoodId', referencedFoodId),
        )
        .collect(),
    }))
    expect(remaining.session).not.toBeNull()
    expect(remaining.firstFood).not.toBeNull()
    expect(remaining.referencedFood).not.toBeNull()
    expect(remaining.firstLines).toHaveLength(1)
    expect(remaining.referencedLines).toHaveLength(1)
  })

  it("rejects another token before deleting a meal's children", async () => {
    const t = createConvexTest()
    const foreignUser = asTestUserWithToken(t, 'user-1|other-token')
    const personId = await insertPerson(t)
    const mealId = await insertMeal(t, personId)
    const ownItemId = await insertMealItem(t, mealId)

    await expect(
      foreignUser.mutation(api.nutrition.deleteMeal, { mealId }),
    ).rejects.toThrow('Meal not found.')

    expect(await t.run(async (ctx) => ctx.db.get(mealId))).not.toBeNull()
    expect(await t.run(async (ctx) => ctx.db.get(ownItemId))).not.toBeNull()
  })
})
