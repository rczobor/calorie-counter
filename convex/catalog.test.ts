// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  createConvexTest,
  insertIngredient,
  insertPerson,
} from './test-utils'

describe('nutrition catalog mutations', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes ingredient kcal values to integers', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)

    const ingredientId = await user.mutation(api.nutrition.createIngredient, {
      name: '  Greek yogurt  ',
      brand: '  Farm  ',
      kcalPer100: 101.6,
      ignoreCalories: false,
      groupIds: [],
      notes: '  Breakfast  ',
    })

    const ingredient = await t.run(async (ctx) => await ctx.db.get(ingredientId))

    expect(ingredient).toMatchObject({
      name: 'Greek yogurt',
      brand: 'Farm',
      kcalPer100: 102,
      notes: 'Breakfast',
    })
  })

  it('blocks deleting ingredients referenced by historical meal items', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Protein powder',
      kcalPer100: 400,
    })

    await user.mutation(api.nutrition.createMeal, {
      personId,
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          consumedWeightGrams: 50,
        },
      ],
    })

    await expect(
      user.mutation(api.nutrition.deleteIngredient, { ingredientId }),
    ).rejects.toThrowError('Ingredient is in historical records. Archive instead.')
  })

  it('replaces current recipe ingredient lines instead of appending duplicates', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const ingredientA = await insertIngredient(t, { name: 'Oats' })
    const ingredientB = await insertIngredient(t, { name: 'Berries' })

    const created = await user.mutation(api.nutrition.createRecipe, {
      name: 'Breakfast bowl',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId: ingredientA,
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })

    await user.mutation(api.nutrition.updateRecipeCurrentVersion, {
      recipeId: created.recipeId,
      name: 'Breakfast bowl',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId: ingredientB,
          referenceAmount: 50,
          referenceUnit: 'g',
        },
      ],
    })

    const versionLines = await t.run(async (ctx) => {
      return await ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_recipeVersion', (q) =>
          q.eq('recipeVersionId', created.recipeVersionId),
        )
        .collect()
    })

    expect(versionLines).toHaveLength(1)
    expect(versionLines[0]?.ingredientId).toBe(ingredientB)
    expect(versionLines[0]?.referenceAmount).toBe(50)
  })
})
