// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'

import { internal } from './_generated/api'
import {
  createConvexTest,
  TEST_USER_ID,
} from '../src/tests/convex-test-utils'

const owner = {
  ownerUserId: TEST_USER_ID,
  ownerTokenIdentifier: `${TEST_USER_ID}|token`,
}

async function insertContractFixture(
  t: ReturnType<typeof createConvexTest>,
  options: {
    invalidKcal?: boolean
    missingOwnerToken?: boolean
    mismatchedMealTotal?: boolean
    crossOwnerMealItem?: boolean
  } = {},
) {
  return await t.run(async (ctx) => {
    const personId = await ctx.db.insert('people', {
      ...(options.missingOwnerToken
        ? { ownerUserId: TEST_USER_ID }
        : owner),
      name: 'Alex',
      currentDailyGoalKcal: 2000,
      active: true,
      createdAt: 1,
    })
    await ctx.db.insert('personGoalHistory', {
      ...owner,
      personId,
      effectiveDate: '2026-04-01',
      goalKcal: 2000,
      createdAt: 1,
    })
    const groupId = await ctx.db.insert('foodGroups', {
      ...owner,
      name: 'Staples',
      appliesTo: 'ingredient',
      archived: false,
      createdAt: 1,
    })
    const ingredientId = await ctx.db.insert('ingredients', {
      ...owner,
      name: 'Oats',
      kcalPer100: options.invalidKcal ? -1 : 100.4,
      ignoreCalories: false,
      groupIds: [groupId],
      archived: false,
      createdAt: 1,
    })
    const recipeId = await ctx.db.insert('recipes', {
      ...owner,
      name: 'Porridge',
      archived: false,
      latestVersionNumber: 1,
      createdAt: 1,
    })
    const recipeVersionId = await ctx.db.insert('recipeVersions', {
      ...owner,
      recipeId,
      versionNumber: 1,
      name: 'Porridge',
      isCurrent: true,
      createdAt: 1,
    })
    const recipeLineId = await ctx.db.insert('recipeVersionIngredients', {
      ...owner,
      recipeVersionId,
      sourceType: 'ingredient',
      ingredientId,
      kcalPer100Snapshot: 200.4,
      referenceAmount: 100,
      referenceUnit: 'g',
    })
    const cookSessionId = await ctx.db.insert('cookSessions', {
      ...owner,
      cookedAt: 1,
      cookedByPersonId: personId,
      createdAt: 1,
    })
    const cookedFoodId = await ctx.db.insert('cookedFoods', {
      ...owner,
      cookSessionId,
      name: 'Porridge',
      recipeId,
      recipeVersionId,
      groupIds: [],
      finishedWeightGrams: 100,
      totalRawWeightGrams: 100,
      totalCalories: 300.4,
      kcalPer100: 300.4,
      createdAt: 1,
    })
    const cookedFoodLineId = await ctx.db.insert('cookedFoodIngredients', {
      ...owner,
      cookedFoodId,
      sourceType: 'ingredient',
      ingredientId,
      ingredientNameSnapshot: 'Oats',
      referenceAmount: 100,
      referenceUnit: 'g',
      ingredientKcalPer100Snapshot: 400.4,
      ingredientCaloriesSnapshot: 400.4,
    })
    const mealId = await ctx.db.insert('meals', {
      ...owner,
      personId,
      eatenOn: '2026-04-01',
      totalCalories: options.mismatchedMealTotal ? 101 : 100.25,
      createdAt: 1,
    })
    const mealItemId = await ctx.db.insert('mealItems', {
      ...(options.crossOwnerMealItem
        ? {
            ownerUserId: 'other-user',
            ownerTokenIdentifier: 'other-user|token',
          }
        : owner),
      mealId,
      sourceType: 'custom',
      nameSnapshot: 'Oats',
      kcalPer100Snapshot: 500.4,
      consumedWeightGrams: 20,
      caloriesSnapshot: 100.25,
    })
    await ctx.db.insert('mealItems', {
      ...owner,
      mealId,
      sourceType: 'cookedFood',
      cookedFoodId,
      nameSnapshot: 'Zero-calorie food',
      kcalPer100Snapshot: 0,
      consumedWeightGrams: 10,
      caloriesSnapshot: 0,
    })

    return {
      ingredientId,
      recipeLineId,
      cookedFoodId,
      cookedFoodLineId,
      mealId,
      mealItemId,
    }
  })
}

describe('data contract preparation', () => {
  it('reports pending work without writing during a dry run', async () => {
    const t = createConvexTest()
    const ids = await insertContractFixture(t)

    const summary = await t.mutation(
      internal.nutrition.prepareDataContract,
      { dryRun: true },
    )

    expect(summary).toMatchObject({
      dryRun: true,
      canApply: true,
      missingOwnerTokenIdentifiers: { total: 0 },
      nonIntegerCalories: {
        ingredients: 1,
        recipeVersionIngredients: 1,
        cookedFoods: 1,
        cookedFoodIngredients: 1,
        mealItems: 1,
        total: 5,
      },
      invalidCalories: { total: 0 },
      legacyMealTotals: 1,
      mismatchedMealTotals: 0,
      invalidMealItemRelationships: 0,
    })
    const stored = await t.run(async (ctx) => ({
      ingredient: await ctx.db.get(ids.ingredientId),
      meal: await ctx.db.get(ids.mealId),
    }))
    expect(stored.ingredient?.kcalPer100).toBe(100.4)
    expect(stored.meal?.totalCalories).toBe(100.25)
  })

  it('normalizes matching data once and is idempotent', async () => {
    const t = createConvexTest()
    const ids = await insertContractFixture(t)

    const first = await t.mutation(internal.nutrition.prepareDataContract, {})
    const stored = await t.run(async (ctx) => ({
      ingredient: await ctx.db.get(ids.ingredientId),
      recipeLine: await ctx.db.get(ids.recipeLineId),
      cookedFood: await ctx.db.get(ids.cookedFoodId),
      cookedFoodLine: await ctx.db.get(ids.cookedFoodLineId),
      meal: await ctx.db.get(ids.mealId),
      mealItem: await ctx.db.get(ids.mealItemId),
    }))
    const second = await t.mutation(internal.nutrition.prepareDataContract, {})

    expect(first).toMatchObject({
      canApply: true,
      nonIntegerCalories: { total: 5 },
      invalidCalories: { total: 0 },
      legacyMealTotals: 1,
      mismatchedMealTotals: 0,
      invalidMealItemRelationships: 0,
    })
    expect(stored.ingredient?.kcalPer100).toBe(100)
    expect(stored.recipeLine?.kcalPer100Snapshot).toBe(200)
    expect(stored.cookedFood?.kcalPer100).toBe(300)
    expect(stored.cookedFood?.totalCalories).toBe(300.4)
    expect(stored.cookedFoodLine?.ingredientKcalPer100Snapshot).toBe(400)
    expect(stored.cookedFoodLine?.ingredientCaloriesSnapshot).toBe(400.4)
    expect(stored.mealItem?.kcalPer100Snapshot).toBe(500)
    expect(stored.mealItem?.caloriesSnapshot).toBe(100.25)
    expect(stored.meal?.totalCalories).toBeUndefined()
    expect(second).toMatchObject({
      canApply: true,
      nonIntegerCalories: { total: 0 },
      invalidCalories: { total: 0 },
      legacyMealTotals: 0,
      mismatchedMealTotals: 0,
      invalidMealItemRelationships: 0,
    })
  })

  it('refuses mismatched meal totals without partial cleanup', async () => {
    const t = createConvexTest()
    const ids = await insertContractFixture(t, { mismatchedMealTotal: true })

    expect(
      await t.mutation(internal.nutrition.prepareDataContract, {
        dryRun: true,
      }),
    ).toMatchObject({ canApply: false, mismatchedMealTotals: 1 })
    await expect(
      t.mutation(internal.nutrition.prepareDataContract, {}),
    ).rejects.toThrow('legacy meal totals do not match')

    const stored = await t.run(async (ctx) => ({
      ingredient: await ctx.db.get(ids.ingredientId),
      meal: await ctx.db.get(ids.mealId),
    }))
    expect(stored.ingredient?.kcalPer100).toBe(100.4)
    expect(stored.meal?.totalCalories).toBe(101)
  })

  it('refuses missing ownership tokens without partial cleanup', async () => {
    const t = createConvexTest()
    const ids = await insertContractFixture(t, { missingOwnerToken: true })

    expect(
      await t.mutation(internal.nutrition.prepareDataContract, {
        dryRun: true,
      }),
    ).toMatchObject({
      canApply: false,
      invalidCalories: { total: 0 },
      missingOwnerTokenIdentifiers: { people: 1, total: 1 },
      mismatchedMealTotals: 0,
      invalidMealItemRelationships: 0,
    })

    await expect(
      t.mutation(internal.nutrition.prepareDataContract, {}),
    ).rejects.toThrow('documents are missing ownerTokenIdentifier')

    const stored = await t.run(async (ctx) => ({
      ingredient: await ctx.db.get(ids.ingredientId),
      meal: await ctx.db.get(ids.mealId),
    }))
    expect(stored.ingredient?.kcalPer100).toBe(100.4)
    expect(stored.meal?.totalCalories).toBe(100.25)
  })

  it('refuses invalid calorie values without partial cleanup', async () => {
    const t = createConvexTest()
    const ids = await insertContractFixture(t, { invalidKcal: true })

    expect(
      await t.mutation(internal.nutrition.prepareDataContract, {
        dryRun: true,
      }),
    ).toMatchObject({
      canApply: false,
      invalidCalories: { ingredients: 1, total: 1 },
      missingOwnerTokenIdentifiers: { total: 0 },
      mismatchedMealTotals: 0,
      invalidMealItemRelationships: 0,
    })
    await expect(
      t.mutation(internal.nutrition.prepareDataContract, {}),
    ).rejects.toThrow('calorie values are invalid')

    const stored = await t.run(async (ctx) => ({
      ingredient: await ctx.db.get(ids.ingredientId),
      recipeLine: await ctx.db.get(ids.recipeLineId),
      meal: await ctx.db.get(ids.mealId),
    }))
    expect(stored.ingredient?.kcalPer100).toBe(-1)
    expect(stored.recipeLine?.kcalPer100Snapshot).toBe(200.4)
    expect(stored.meal?.totalCalories).toBe(100.25)
  })

  it('refuses cross-owner meal items without a legacy total', async () => {
    const t = createConvexTest()
    const ids = await insertContractFixture(t, { crossOwnerMealItem: true })
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.mealId, { totalCalories: undefined })
    })

    expect(
      await t.mutation(internal.nutrition.prepareDataContract, {
        dryRun: true,
      }),
    ).toMatchObject({
      canApply: false,
      legacyMealTotals: 0,
      mismatchedMealTotals: 0,
      invalidMealItemRelationships: 1,
    })
    await expect(
      t.mutation(internal.nutrition.prepareDataContract, {}),
    ).rejects.toThrow('meal items have missing or cross-owner meals')

    expect(
      await t.run(async (ctx) =>
        (await ctx.db.get(ids.ingredientId))?.kcalPer100,
      ),
    ).toBe(100.4)
  })
})
