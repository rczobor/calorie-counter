// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Id } from './_generated/dataModel'
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
  readEditRevision,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

type TestContext = ReturnType<typeof createConvexTest>

async function readMealItemIds(t: TestContext, mealId: Id<'meals'>) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query('mealItems')
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('mealId', mealId),
        )
        .collect()
    ).map((item) => item._id),
  )
}

async function readCookedFoodIngredientIds(
  t: TestContext,
  cookedFoodId: Id<'cookedFoods'>,
) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('cookedFoodId', cookedFoodId),
        )
        .collect()
    ).map((line) => line._id),
  )
}

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

    const created = await user.mutation(api.nutrition.createCookedFood, {
      cookSessionId: sessionId,
      name: '  Oat base  ',
      finishedWeightGrams: 180,
      notes: '  Batch  ',
      ingredients: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Oats',
            kcalPer100: 200,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          referenceAmount: 150,
          referenceUnit: 'g',
          countedAmount: 150,
        },
      ],
    })
    const { cookedFoodId } = created

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
    expect(created).toEqual({
      cookedFoodId,
      editRevision: 0,
      cookedFoodIngredientIds: [ingredientLines[0]._id],
      recipeId: undefined,
      recipeVersionId: undefined,
    })
  })

  it('creates linked recipe records when saving cooked food as a recipe', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)

    const result = await user.mutation(api.nutrition.createCookedFood, {
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
    const { cookedFoodId } = result

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
    expect(result).toMatchObject({
      cookedFoodId,
      editRevision: 0,
      recipeId: records.recipes[0]?._id,
      recipeVersionId: records.versions[0]?._id,
      cookedFoodIngredientIds: [expect.any(String)],
    })
    expect(records.cookedFood?.recipeId).toBe(records.recipes[0]?._id)
    expect(records.cookedFood?.recipeVersionId).toBe(records.versions[0]?._id)
  })

  it('preserves non-gram basis units in custom ingredient snapshots and catalog saves', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)

    const { cookedFoodId } = await user.mutation(
      api.nutrition.createCookedFood,
      {
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
      },
    )

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
          expectedSnapshot: {
            name: 'Chicken',
            kcalPer100: 300,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
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
      expectedMealItemIds: await readMealItemIds(t, mealId),
      expectedEditRevision: await readEditRevision(t, mealId),
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
      expectedMealItemIds: await readMealItemIds(t, mealId),
      expectedEditRevision: await readEditRevision(t, mealId),
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
      expectedEditRevision: await readEditRevision(t, mealId),
      archived: true,
    })
    expect(await readSummary(samId, '2026-04-05')).toBeNull()

    await user.mutation(api.nutrition.setMealArchived, {
      mealId,
      expectedEditRevision: await readEditRevision(t, mealId),
      archived: false,
    })
    expect(await readSummary(samId, '2026-04-05')).toMatchObject({
      consumedCalories: 600,
      mealCount: 1,
    })

    await user.mutation(api.nutrition.deleteMeal, {
      mealId,
      expectedEditRevision: await readEditRevision(t, mealId),
    })
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

  it('indexes the selected cooking calendar date independently of UTC', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await user.mutation(api.nutrition.createCookSession, {
      label: 'Island prep',
      cookedAt: Date.parse('2026-04-03T22:00:00Z'),
      cookedOn: '2026-04-04',
    })

    expect(
      await t.run(async (ctx) => await ctx.db.get(sessionId)),
    ).toMatchObject({ searchText: '2026-04-04 Island prep' })

    await user.mutation(api.nutrition.updateCookSession, {
      sessionId,
      expectedEditRevision: await readEditRevision(t, sessionId),
      label: 'Dateline prep',
      cookedAt: Date.parse('2026-04-05T12:00:00Z'),
      cookedOn: '2026-04-04',
    })

    expect(
      await t.run(async (ctx) => await ctx.db.get(sessionId)),
    ).toMatchObject({ searchText: '2026-04-04 Dateline prep' })
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

  it('requires custom meal items to use a gram calorie basis', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)

    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'customByWeight',
            name: 'Milk',
            kcalPer100: 60,
            // @ts-expect-error -- exercise the runtime argument validator.
            kcalBasisUnit: 'ml',
            ignoreCalories: false,
            consumedWeightGrams: 100,
          },
        ],
      }),
    ).rejects.toThrow()
  })

  it('requires new catalog ingredient meal items to use a gram calorie basis', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Egg',
      kcalPer100: 155,
      kcalBasisUnit: 'piece',
    })

    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: {
              name: 'Egg',
              kcalPer100: 155,
              kcalBasisUnit: 'piece',
              ignoreCalories: false,
            },
            consumedWeightGrams: 2,
          },
        ],
      }),
    ).rejects.toThrow(
      'Only gram-based ingredients can be added directly to meals.',
    )
  })

  it('deduplicates concurrent catalog saves for matching custom meal items', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)

    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'customByWeight',
          name: 'Homemade sauce',
          kcalPer100: 75,
          kcalBasisUnit: 'g',
          ignoreCalories: false,
          consumedWeightGrams: 40,
          saveToCatalog: true,
        },
        {
          sourceType: 'customByWeight',
          name: 'Homemade sauce',
          kcalPer100: 75,
          kcalBasisUnit: 'g',
          ignoreCalories: false,
          consumedWeightGrams: 60,
          saveToCatalog: true,
        },
      ],
    })

    const { ingredients, items } = await t.run(async (ctx) => ({
      ingredients: await ctx.db
        .query('ingredients')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER),
        )
        .collect(),
      items: await ctx.db
        .query('mealItems')
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('mealId', mealId),
        )
        .collect(),
    }))

    expect(ingredients).toHaveLength(1)
    expect(items).toHaveLength(2)
    expect(
      items.every(
        (item) =>
          item.sourceType === 'customByWeight' &&
          item.ingredientId === ingredients[0]?._id,
      ),
    ).toBe(true)
  })

  it('grandfathers unchanged over-limit legacy item notes', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const mealId = await insertMeal(t, personId)
    const legacyNotes = 'x'.repeat(2_001)
    const originalItemId = await insertMealItem(t, mealId, {
      notes: legacyNotes,
    })

    await user.mutation(api.nutrition.updateMeal, {
      mealId,
      expectedMealItemIds: await readMealItemIds(t, mealId),
      expectedEditRevision: await readEditRevision(t, mealId),
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'customByWeight',
          existingMealItemId: originalItemId,
          name: 'Item',
          kcalPer100: 100,
          kcalBasisUnit: 'g',
          ignoreCalories: false,
          consumedWeightGrams: 100,
          notes: legacyNotes,
        },
      ],
    })

    const currentItem = await t.run(async (ctx) =>
      ctx.db
        .query('mealItems')
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('mealId', mealId),
        )
        .unique(),
    )
    expect(currentItem?.notes).toBe(legacyNotes)

    await expect(
      user.mutation(api.nutrition.updateMeal, {
        mealId,
        expectedMealItemIds: await readMealItemIds(t, mealId),
        expectedEditRevision: await readEditRevision(t, mealId),
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'customByWeight',
            existingMealItemId: currentItem!._id,
            name: 'Item',
            kcalPer100: 100,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
            consumedWeightGrams: 100,
            notes: `${legacyNotes.slice(0, -1)}y`,
          },
        ],
      }),
    ).rejects.toThrow('Item notes cannot exceed 2000 characters.')
  })

  it('rejects non-finite meal item and meal total calculations atomically', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)

    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'customByWeight',
            name: 'Overflowing item',
            kcalPer100: Number.MAX_VALUE,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
            consumedWeightGrams: Number.MAX_VALUE,
          },
        ],
      }),
    ).rejects.toThrow('Meal item calories exceeds the supported numeric range.')

    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'fixedCalories',
            name: 'First estimate',
            calories: Number.MAX_VALUE,
          },
          {
            sourceType: 'fixedCalories',
            name: 'Second estimate',
            calories: Number.MAX_VALUE,
          },
        ],
      }),
    ).rejects.toThrow(
      'Meal total calories exceeds the supported numeric range.',
    )

    const records = await t.run(async (ctx) => ({
      meals: await ctx.db
        .query('meals')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER),
        )
        .collect(),
      summary: await ctx.db
        .query('dailySummaries')
        .withIndex('by_ownerTokenIdentifier_and_personId_and_eatenOn', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('personId', personId)
            .eq('eatenOn', '2026-04-04'),
        )
        .unique(),
    }))
    expect(records.meals).toHaveLength(0)
    expect(records.summary).toBeNull()
  })

  it('rejects non-finite historical meal scaling without changing stored state', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Concentrate',
      kcalPer100: Number.MAX_VALUE,
    })
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Concentrate',
            kcalPer100: Number.MAX_VALUE,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 1,
        },
      ],
    })
    const before = await t.run(async (ctx) => ({
      meal: await ctx.db.get(mealId),
      item: await ctx.db
        .query('mealItems')
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('mealId', mealId),
        )
        .unique(),
      summary: await ctx.db
        .query('dailySummaries')
        .withIndex('by_ownerTokenIdentifier_and_personId_and_eatenOn', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('personId', personId)
            .eq('eatenOn', '2026-04-04'),
        )
        .unique(),
    }))
    if (!before.item) {
      throw new Error('Expected the original meal item.')
    }

    await expect(
      user.mutation(api.nutrition.updateMeal, {
        mealId,
        expectedMealItemIds: await readMealItemIds(t, mealId),
        expectedEditRevision: await readEditRevision(t, mealId),
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'ingredient',
            existingMealItemId: before.item._id,
            ingredientId,
            consumedWeightGrams: Number.MAX_VALUE,
          },
        ],
      }),
    ).rejects.toThrow('Meal item calories exceeds the supported numeric range.')

    const after = await t.run(async (ctx) => ({
      meal: await ctx.db.get(mealId),
      item: await ctx.db.get(before.item!._id),
      summary: await ctx.db
        .query('dailySummaries')
        .withIndex('by_ownerTokenIdentifier_and_personId_and_eatenOn', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('personId', personId)
            .eq('eatenOn', '2026-04-04'),
        )
        .unique(),
    }))
    expect(after).toEqual(before)
  })

  it('rejects daily summary overflow and rolls back the added meal', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)

    await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'fixedCalories',
          name: 'Existing estimate',
          calories: Number.MAX_VALUE,
        },
      ],
    })
    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'fixedCalories',
            name: 'Overflowing estimate',
            calories: Number.MAX_VALUE,
          },
        ],
      }),
    ).rejects.toThrow(
      'Daily summary calories exceeds the supported numeric range.',
    )

    const records = await t.run(async (ctx) => ({
      meals: await ctx.db
        .query('meals')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER),
        )
        .collect(),
      summary: await ctx.db
        .query('dailySummaries')
        .withIndex('by_ownerTokenIdentifier_and_personId_and_eatenOn', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('personId', personId)
            .eq('eatenOn', '2026-04-04'),
        )
        .unique(),
    }))
    expect(records.meals).toHaveLength(1)
    expect(records.summary).toMatchObject({
      consumedCalories: Number.MAX_VALUE,
      mealCount: 1,
    })
  })

  it('rejects non-finite cooked-food line, aggregate, and kcal calculations', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)

    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: sessionId,
        name: 'Invalid ignored count',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'custom',
            name: 'Ignored ingredient',
            kcalPer100: 0,
            ignoreCalories: true,
            referenceAmount: 1,
            referenceUnit: 'g',
            countedAmount: Number.POSITIVE_INFINITY,
          },
        ],
      }),
    ).rejects.toThrow('Counted amount must be greater than 0.')

    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: sessionId,
        name: 'Line overflow',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'custom',
            name: 'Concentrate',
            kcalPer100: Number.MAX_VALUE,
            ignoreCalories: false,
            referenceAmount: Number.MAX_VALUE,
            referenceUnit: 'g',
            countedAmount: Number.MAX_VALUE,
          },
        ],
      }),
    ).rejects.toThrow(
      'Cooked ingredient calories exceeds the supported numeric range.',
    )

    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: sessionId,
        name: 'Raw aggregate overflow',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'custom',
            name: 'First ignored ingredient',
            kcalPer100: 0,
            ignoreCalories: true,
            referenceAmount: Number.MAX_VALUE,
            referenceUnit: 'g',
            countedAmount: Number.MAX_VALUE,
          },
          {
            sourceType: 'custom',
            name: 'Second ignored ingredient',
            kcalPer100: 0,
            ignoreCalories: true,
            referenceAmount: Number.MAX_VALUE,
            referenceUnit: 'g',
            countedAmount: Number.MAX_VALUE,
          },
        ],
      }),
    ).rejects.toThrow(
      'Cooked food raw weight exceeds the supported numeric range.',
    )

    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: sessionId,
        name: 'Kcal overflow',
        finishedWeightGrams: Number.MIN_VALUE,
        ingredients: [
          {
            sourceType: 'custom',
            name: 'Tiny batch ingredient',
            kcalPer100: 100,
            ignoreCalories: false,
            referenceAmount: 1,
            referenceUnit: 'g',
            countedAmount: 1,
          },
        ],
      }),
    ).rejects.toThrow(
      'Cooked food kcal/100 exceeds the supported numeric range.',
    )
  })

  it('rejects non-finite cooked-food calorie aggregation on update', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)
    const ingredientId = await insertIngredient(t)
    const seeded = await t.run(async (ctx) => {
      const cookedFoodId = await ctx.db.insert('cookedFoods', {
        ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
        cookSessionId: sessionId,
        name: 'Legacy batch',
        finishedWeightGrams: 100,
        totalRawWeightGrams: 2,
        totalCalories: 0,
        kcalPer100: 0,
        archived: false,
        createdAt: Date.now(),
      })
      const insertLine = () =>
        ctx.db.insert('cookedFoodIngredients', {
          ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
          cookedFoodId,
          sourceType: 'ingredient' as const,
          ingredientId,
          ingredientNameSnapshot: 'Ingredient',
          referenceAmount: 1,
          referenceUnit: 'g' as const,
          countedAmount: 1,
          ingredientKcalPer100Snapshot: Number.MAX_VALUE,
          ingredientKcalBasisUnitSnapshot: 'g' as const,
          ignoreCaloriesSnapshot: false,
          ingredientCaloriesSnapshot: Number.MAX_VALUE,
        })
      const firstLineId = await insertLine()
      const secondLineId = await insertLine()
      return { cookedFoodId, firstLineId, secondLineId }
    })

    await expect(
      user.mutation(api.nutrition.updateCookedFood, {
        cookedFoodId: seeded.cookedFoodId,
        expectedCookedFoodIngredientIds: [
          seeded.firstLineId,
          seeded.secondLineId,
        ],
        expectedEditRevision: await readEditRevision(t, seeded.cookedFoodId),
        cookSessionId: sessionId,
        name: 'Legacy batch',
        finishedWeightGrams: 100,
        ingredients: [seeded.firstLineId, seeded.secondLineId].map(
          (existingCookedFoodIngredientId) => ({
            sourceType: 'ingredient' as const,
            existingCookedFoodIngredientId,
            ingredientId,
            referenceAmount: 1,
            referenceUnit: 'g' as const,
            countedAmount: 1,
          }),
        ),
      }),
    ).rejects.toThrow(
      'Cooked food total calories exceeds the supported numeric range.',
    )

    const stored = await t.run(async (ctx) => ({
      cookedFood: await ctx.db.get(seeded.cookedFoodId),
      lines: await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('cookedFoodId', seeded.cookedFoodId),
        )
        .collect(),
    }))
    expect(stored.cookedFood).toMatchObject({ totalCalories: 0 })
    expect(stored.lines).toHaveLength(2)
  })

  it('rejects stale ingredient snapshots for new meal and cooking lines', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const sessionId = await insertCookSession(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Draft ingredient',
      kcalPer100: 100,
    })
    const staleSnapshot = {
      name: 'Draft ingredient',
      kcalPer100: 100,
      kcalBasisUnit: 'g' as const,
      ignoreCalories: false,
    }
    await user.mutation(api.nutrition.updateIngredient, {
      ingredientId,
      expectedEditRevision: await readEditRevision(t, ingredientId),
      name: 'Changed ingredient',
      kcalPer100: 250,
      kcalBasisUnit: 'g',
      ignoreCalories: false,
    })

    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: staleSnapshot,
            consumedWeightGrams: 100,
          },
        ],
      }),
    ).rejects.toThrow(
      'Ingredient changed since it was added. Refresh it and try again.',
    )
    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: sessionId,
        name: 'Stale batch',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: staleSnapshot,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      }),
    ).rejects.toThrow(
      'Ingredient changed since it was added. Refresh it and try again.',
    )
  })

  it('rejects stale cooked-food snapshots for new meal lines', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const sessionId = await insertCookSession(t)
    const { cookedFoodId } = await user.mutation(
      api.nutrition.createCookedFood,
      {
        cookSessionId: sessionId,
        name: 'Draft food',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'custom',
            name: 'Ingredient',
            kcalPer100: 100,
            ignoreCalories: false,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      },
    )
    await t.run(async (ctx) => {
      await ctx.db.patch(cookedFoodId, {
        name: 'Changed food',
        kcalPer100: 250,
      })
    })

    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'cookedFood',
            cookedFoodId,
            expectedSnapshot: {
              name: 'Draft food',
              kcalPer100: 100,
              kcalBasisUnit: 'g',
              ignoreCalories: false,
            },
            consumedWeightGrams: 100,
          },
        ],
      }),
    ).rejects.toThrow(
      'Cooked food changed since it was added. Refresh it and try again.',
    )
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
          expectedSnapshot: {
            name: 'Chicken',
            kcalPer100: 300,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 60,
        },
      ],
    })

    await user.mutation(api.nutrition.updateIngredient, {
      ingredientId,
      expectedEditRevision: await readEditRevision(t, ingredientId),
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
          expectedSnapshot: {
            name: 'Chicken',
            kcalPer100: 100,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 50,
        },
      ],
    })

    await user.mutation(api.nutrition.updateMeal, {
      mealId,
      expectedMealItemIds: await readMealItemIds(t, mealId),
      expectedEditRevision: await readEditRevision(t, mealId),
      personId,
      name: 'Updated meal',
      eatenOn: '2026-04-01',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Chicken',
            kcalPer100: 100,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
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
      expectedMealItemIds: await readMealItemIds(t, mealId),
      expectedEditRevision: await readEditRevision(t, mealId),
      personId,
      eatenOn: ' 2026-04-02 ',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Chicken',
            kcalPer100: 100,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
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
        expectedMealItemIds: await readMealItemIds(t, mealId),
        expectedEditRevision: await readEditRevision(t, mealId),
        personId,
        eatenOn: '2026-02-30',
        items: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: {
              name: 'Chicken',
              kcalPer100: 100,
              kcalBasisUnit: 'g',
              ignoreCalories: false,
            },
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
          expectedSnapshot: {
            name: 'Turkey',
            kcalPer100: 200,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 50,
        },
      ],
    })

    await user.mutation(api.nutrition.deleteMeal, {
      mealId,
      expectedEditRevision: await readEditRevision(t, mealId),
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

    expect(meal).toBeNull()
    expect(items).toHaveLength(0)
  })

  it('requires archiving a cook session that still has cooked foods', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const sessionId = await insertCookSession(t)
    const createFood = async (name: string) =>
      (
        await user.mutation(api.nutrition.createCookedFood, {
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
      ).cookedFoodId
    const firstFoodId = await createFood('First food')
    const referencedFoodId = await createFood('Referenced food')
    await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'cookedFood',
          cookedFoodId: referencedFoodId,
          expectedSnapshot: {
            name: 'Referenced food',
            kcalPer100: 100,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 50,
        },
      ],
    })

    await expect(
      user.mutation(api.nutrition.deleteCookSession, {
        sessionId,
        expectedEditRevision: await readEditRevision(t, sessionId),
      }),
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
      foreignUser.mutation(api.nutrition.deleteMeal, {
        mealId,
        expectedEditRevision: await readEditRevision(t, mealId),
      }),
    ).rejects.toThrow('Meal not found.')

    expect(await t.run(async (ctx) => ctx.db.get(mealId))).not.toBeNull()
    expect(await t.run(async (ctx) => ctx.db.get(ownItemId))).not.toBeNull()
  })

  it('rejects a stale meal edit after another editor fully replaces its items', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [{ sourceType: 'fixedCalories', name: 'Original', calories: 100 }],
    })
    const originalItemIds = await readMealItemIds(t, mealId)
    const originalMealRevision = await readEditRevision(t, mealId)

    await user.mutation(api.nutrition.updateMeal, {
      mealId,
      expectedMealItemIds: originalItemIds,
      expectedEditRevision: originalMealRevision,
      personId,
      name: 'First editor',
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'fixedCalories',
          name: 'First replacement',
          calories: 200,
        },
      ],
    })

    await expect(
      user.mutation(api.nutrition.updateMeal, {
        mealId,
        expectedMealItemIds: originalItemIds,
        expectedEditRevision: originalMealRevision,
        personId,
        name: 'Second editor',
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'fixedCalories',
            name: 'Second replacement',
            calories: 300,
          },
        ],
      }),
    ).rejects.toThrow(
      'Meal changed since editing began. Refresh and try again.',
    )

    const current = await t.run(async (ctx) => ({
      meal: await ctx.db.get(mealId),
      items: await ctx.db
        .query('mealItems')
        .withIndex('by_ownerTokenIdentifier_and_mealId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('mealId', mealId),
        )
        .collect(),
    }))
    expect(current.meal).toMatchObject({
      name: 'First editor',
      totalCalories: 200,
    })
    expect(current.items).toHaveLength(1)
    expect(current.items[0]).toMatchObject({
      nameSnapshot: 'First replacement',
      caloriesSnapshot: 200,
    })
  })

  it('rejects a stale cooked-food edit after another editor fully replaces its lines', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)
    const { cookedFoodId } = await user.mutation(
      api.nutrition.createCookedFood,
      {
        cookSessionId: sessionId,
        name: 'Original batch',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'custom',
            name: 'Original line',
            kcalPer100: 100,
            ignoreCalories: false,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      },
    )
    const originalLineIds = await readCookedFoodIngredientIds(t, cookedFoodId)
    const originalCookedFoodRevision = await readEditRevision(t, cookedFoodId)

    await user.mutation(api.nutrition.updateCookedFood, {
      cookedFoodId,
      expectedCookedFoodIngredientIds: originalLineIds,
      expectedEditRevision: originalCookedFoodRevision,
      cookSessionId: sessionId,
      name: 'First editor batch',
      finishedWeightGrams: 100,
      ingredients: [
        {
          sourceType: 'custom',
          name: 'First replacement',
          kcalPer100: 200,
          ignoreCalories: false,
          referenceAmount: 100,
          referenceUnit: 'g',
          countedAmount: 100,
        },
      ],
    })

    await expect(
      user.mutation(api.nutrition.updateCookedFood, {
        cookedFoodId,
        expectedCookedFoodIngredientIds: originalLineIds,
        expectedEditRevision: originalCookedFoodRevision,
        cookSessionId: sessionId,
        name: 'Second editor batch',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'custom',
            name: 'Second replacement',
            kcalPer100: 300,
            ignoreCalories: false,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      }),
    ).rejects.toThrow(
      'Cooked food changed since editing began. Refresh and try again.',
    )

    const current = await t.run(async (ctx) => ({
      cookedFood: await ctx.db.get(cookedFoodId),
      lines: await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('cookedFoodId', cookedFoodId),
        )
        .collect(),
    }))
    expect(current.cookedFood).toMatchObject({
      name: 'First editor batch',
      totalCalories: 200,
    })
    expect(current.lines).toHaveLength(1)
    expect(current.lines[0]).toMatchObject({
      ingredientNameSnapshot: 'First replacement',
      ingredientKcalPer100Snapshot: 200,
    })
  })

  it('returns cooked ingredient ids in input order across create and update', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)
    const customLine = (name: string) => ({
      sourceType: 'custom' as const,
      name,
      kcalPer100: 100,
      ignoreCalories: false,
      referenceAmount: 100,
      referenceUnit: 'g' as const,
      countedAmount: 100,
    })

    const created = await user.mutation(api.nutrition.createCookedFood, {
      cookSessionId: sessionId,
      name: 'Ordered batch',
      finishedWeightGrams: 300,
      ingredients: [customLine('First'), customLine('Second')],
    })
    const createdNames = await t.run(
      async (ctx) =>
        await Promise.all(
          created.cookedFoodIngredientIds.map(
            async (id) => (await ctx.db.get(id))?.ingredientNameSnapshot,
          ),
        ),
    )
    expect(createdNames).toEqual(['First', 'Second'])

    const [firstId, secondId] = created.cookedFoodIngredientIds
    const updated = await user.mutation(api.nutrition.updateCookedFood, {
      cookedFoodId: created.cookedFoodId,
      expectedCookedFoodIngredientIds: created.cookedFoodIngredientIds,
      expectedEditRevision: created.editRevision,
      cookSessionId: sessionId,
      name: 'Reordered batch',
      finishedWeightGrams: 300,
      ingredients: [
        {
          ...customLine('Second edited'),
          existingCookedFoodIngredientId: secondId,
        },
        customLine('New middle'),
        {
          ...customLine('First edited'),
          existingCookedFoodIngredientId: firstId,
        },
      ],
    })
    const updatedNames = await t.run(
      async (ctx) =>
        await Promise.all(
          updated.cookedFoodIngredientIds.map(
            async (id) => (await ctx.db.get(id))?.ingredientNameSnapshot,
          ),
        ),
    )
    expect(updated).toMatchObject({
      cookedFoodId: created.cookedFoodId,
      editRevision: created.editRevision + 1,
      cookedFoodIngredientIds: [secondId, expect.any(String), firstId],
    })
    expect(updatedNames).toEqual([
      'Second edited',
      'New middle',
      'First edited',
    ])
  })

  it('rejects stale cooked-food edits even when retained line ids still match', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)
    const { cookedFoodId } = await user.mutation(
      api.nutrition.createCookedFood,
      {
        cookSessionId: sessionId,
        name: 'Original batch',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'custom',
            name: 'Original line',
            kcalPer100: 100,
            ignoreCalories: false,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      },
    )
    const [lineId] = await readCookedFoodIngredientIds(t, cookedFoodId)
    const originalRevision = await readEditRevision(t, cookedFoodId)
    const retainedLine = (name: string, kcalPer100: number) => ({
      sourceType: 'custom' as const,
      existingCookedFoodIngredientId: lineId,
      name,
      kcalPer100,
      ignoreCalories: false,
      referenceAmount: 100,
      referenceUnit: 'g' as const,
      countedAmount: 100,
    })

    await user.mutation(api.nutrition.updateCookedFood, {
      cookedFoodId,
      expectedCookedFoodIngredientIds: [lineId],
      expectedEditRevision: originalRevision,
      cookSessionId: sessionId,
      name: 'First editor batch',
      finishedWeightGrams: 100,
      ingredients: [retainedLine('First editor line', 200)],
    })

    await expect(
      user.mutation(api.nutrition.updateCookedFood, {
        cookedFoodId,
        expectedCookedFoodIngredientIds: [lineId],
        expectedEditRevision: originalRevision,
        cookSessionId: sessionId,
        name: 'Second editor batch',
        finishedWeightGrams: 100,
        ingredients: [retainedLine('Second editor line', 300)],
      }),
    ).rejects.toThrow(
      'Cooked food changed since editing began. Refresh and try again.',
    )

    const current = await t.run(async (ctx) => ({
      cookedFood: await ctx.db.get(cookedFoodId),
      line: await ctx.db.get(lineId),
    }))
    expect(current.cookedFood).toMatchObject({
      name: 'First editor batch',
      totalCalories: 200,
      editRevision: originalRevision + 1,
    })
    expect(current.line).toMatchObject({
      ingredientNameSnapshot: 'First editor line',
      ingredientKcalPer100Snapshot: 200,
    })
  })

  it('does not invalidate a session editor for derived cooked-food touches', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await user.mutation(api.nutrition.createCookSession, {
      label: 'Original session',
      cookedAt: Date.now(),
    })
    const originalRevision = await readEditRevision(t, sessionId)

    vi.setSystemTime(new Date('2026-04-04T13:00:00'))
    await user.mutation(api.nutrition.createCookedFood, {
      cookSessionId: sessionId,
      name: 'Touching batch',
      finishedWeightGrams: 100,
      ingredients: [
        {
          sourceType: 'custom',
          name: 'Ingredient',
          kcalPer100: 100,
          ignoreCalories: false,
          referenceAmount: 100,
          referenceUnit: 'g',
          countedAmount: 100,
        },
      ],
    })

    expect(await readEditRevision(t, sessionId)).toBe(originalRevision)
    await expect(
      user.mutation(api.nutrition.updateCookSession, {
        sessionId,
        expectedEditRevision: originalRevision,
        label: 'Editor change',
        cookedAt: Date.parse('2026-04-04T12:00:00Z'),
      }),
    ).resolves.toBeNull()
    expect(
      await t.run(async (ctx) => await ctx.db.get(sessionId)),
    ).toMatchObject({
      label: 'Editor change',
      editRevision: originalRevision + 1,
    })
  })
})
