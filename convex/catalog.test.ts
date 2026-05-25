// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertCookSession,
  insertIngredient,
  insertPerson,
} from '../src/tests/convex-test-utils'

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

  it('rejects updating ingredients with groups owned by another token', async () => {
    const t = createConvexTest()
    const owner = asTestUser(t)
    const sameSubjectDifferentToken = asTestUserWithToken(t, 'user-1|other-token')
    const ingredientId = await insertIngredient(t, { name: 'Greek yogurt' })
    const foreignGroupId = await sameSubjectDifferentToken.mutation(
      api.nutrition.createFoodGroup,
      {
        name: 'Other catalog',
        appliesTo: 'ingredient',
      },
    )

    await expect(
      owner.mutation(api.nutrition.updateIngredient, {
        ingredientId,
        name: 'Greek yogurt',
        kcalPer100: 100,
        ignoreCalories: false,
        groupIds: [foreignGroupId],
      }),
    ).rejects.toThrowError('One or more groups are missing.')
  })

  it('creates a new current recipe version while preserving the old version', async () => {
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

    const { versions, oldVersionLines, newVersionLines } = await t.run(
      async (ctx) => {
        const versions = await ctx.db
          .query('recipeVersions')
          .withIndex('by_recipe', (q) => q.eq('recipeId', created.recipeId))
          .collect()
        const currentVersion = versions.find((version) => version.isCurrent)
        if (!currentVersion) {
          throw new Error('Expected a current recipe version.')
        }
        const oldVersionLines = await ctx.db
          .query('recipeVersionIngredients')
          .withIndex('by_recipeVersion', (q) =>
            q.eq('recipeVersionId', created.recipeVersionId),
          )
          .collect()
        const newVersionLines = await ctx.db
          .query('recipeVersionIngredients')
          .withIndex('by_recipeVersion', (q) =>
            q.eq('recipeVersionId', currentVersion._id),
          )
          .collect()
        return { versions, oldVersionLines, newVersionLines }
      },
    )

    expect(versions).toHaveLength(2)
    expect(versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: created.recipeVersionId,
          versionNumber: 1,
          isCurrent: false,
        }),
        expect.objectContaining({
          versionNumber: 2,
          isCurrent: true,
        }),
      ]),
    )
    expect(oldVersionLines).toHaveLength(1)
    expect(oldVersionLines[0]?.ingredientId).toBe(ingredientA)
    expect(newVersionLines).toHaveLength(1)
    expect(newVersionLines[0]?.ingredientId).toBe(ingredientB)
    expect(newVersionLines[0]?.referenceAmount).toBe(50)
  })

  it('replaces lines within each created recipe version without duplicating them', async () => {
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

    const currentVersionLines = await t.run(async (ctx) => {
      const versions = await ctx.db
        .query('recipeVersions')
        .withIndex('by_recipe', (q) => q.eq('recipeId', created.recipeId))
        .collect()
      const currentVersion = versions.find((version) => version.isCurrent)
      if (!currentVersion) {
        throw new Error('Expected a current recipe version.')
      }
      return await ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_recipeVersion', (q) =>
          q.eq('recipeVersionId', currentVersion._id),
        )
        .collect()
    })

    expect(currentVersionLines).toHaveLength(1)
    expect(currentVersionLines[0]?.ingredientId).toBe(ingredientB)
    expect(currentVersionLines[0]?.referenceAmount).toBe(50)
  })

  it('blocks deleting recipes that have cooked history', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Rice',
      kcalPer100: 130,
    })
    const created = await user.mutation(api.nutrition.createRecipe, {
      name: 'Rice bowl',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })

    await user.mutation(api.nutrition.createCookedFood, {
      cookSessionId: sessionId,
      name: 'Rice batch',
      recipeId: created.recipeId,
      recipeVersionId: created.recipeVersionId,
      groupIds: [],
      finishedWeightGrams: 100,
      ingredients: [
        {
          sourceType: 'ingredient',
          ingredientId,
          referenceAmount: 100,
          referenceUnit: 'g',
          countedAmount: 100,
        },
      ],
    })

    await expect(
      user.mutation(api.nutrition.deleteRecipe, { recipeId: created.recipeId }),
    ).rejects.toThrowError('Recipe has cooked history. Archive instead.')
  })
})
