// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertIngredient,
} from '../src/tests/convex-test-utils'

describe('recipe queries', () => {
  it('returns the current owner-scoped version without owner metadata', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const otherUser = asTestUserWithToken(t, 'user-2|token')
    const ingredientId = await insertIngredient(t, { name: 'Oats' })
    const created = await user.mutation(api.nutrition.createRecipe, {
      name: 'Breakfast bowl',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          referenceAmount: 100,
          referenceUnit: 'g',
          notes: 'Keep chilled.',
        },
      ],
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(ingredientId, {
        name: 'Current oats',
        kcalPer100: 410,
        kcalBasisUnit: 'piece',
        ignoreCalories: true,
        archived: true,
      })
    })

    const detail = await user.query(api.recipes.getCurrent, {
      recipeId: created.recipeId,
    })

    expect(detail).toMatchObject({
      recipe: { _id: created.recipeId, name: 'Breakfast bowl' },
      version: { _id: created.recipeVersionId, versionNumber: 1 },
      ingredients: [
        {
          ingredientId,
          ingredientNameSnapshot: 'Oats',
          notes: 'Keep chilled.',
        },
      ],
      referencedIngredients: [
        {
          _id: ingredientId,
          name: 'Current oats',
          kcalPer100: 410,
          kcalBasisUnit: 'piece',
          ignoreCalories: true,
          archived: true,
        },
      ],
    })
    expect(detail?.recipe).not.toHaveProperty('ownerTokenIdentifier')
    expect(detail?.version).not.toHaveProperty('ownerTokenIdentifier')
    expect(detail?.ingredients[0]).not.toHaveProperty('ownerTokenIdentifier')
    expect(detail?.referencedIngredients[0]).not.toHaveProperty(
      'ownerTokenIdentifier',
    )
    await expect(
      otherUser.query(api.recipes.getCurrent, {
        recipeId: created.recipeId,
      }),
    ).resolves.toBeNull()
  })
})
