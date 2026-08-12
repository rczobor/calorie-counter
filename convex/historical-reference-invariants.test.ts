// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'

import type { Id } from './_generated/dataModel'
import { api } from './_generated/api'
import {
  asTestUser,
  createConvexTest,
  insertCookSession,
  insertFoodGroup,
  insertIngredient,
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

async function readMealState(t: TestContext, mealId: Id<'meals'>) {
  return await t.run(async (ctx) => ({
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
}

async function readCookedFoodState(
  t: TestContext,
  cookedFoodId: Id<'cookedFoods'>,
) {
  return await t.run(async (ctx) => ({
    cookedFood: await ctx.db.get(cookedFoodId),
    line: await ctx.db
      .query('cookedFoodIngredients')
      .withIndex('by_ownerTokenIdentifier_and_cookedFoodId', (q) =>
        q
          .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
          .eq('cookedFoodId', cookedFoodId),
      )
      .unique(),
  }))
}

describe('historical reference invariants', () => {
  it('reuses an ingredient meal snapshot after catalog edits and scales its historical calories', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Original oats',
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
            name: 'Original oats',
            kcalPer100: 200,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 50,
          notes: 'Historical line note',
        },
      ],
    })
    const original = await readMealState(t, mealId)
    if (!original.item) {
      throw new Error('Expected the original meal item.')
    }

    await user.mutation(api.nutrition.updateIngredient, {
      ingredientId,
      expectedEditRevision: await readEditRevision(t, ingredientId),
      name: 'Renamed oats',
      kcalPer100: 480,
      ignoreCalories: false,
    })
    await user.mutation(api.nutrition.setIngredientArchived, {
      ingredientId,
      expectedEditRevision: await readEditRevision(t, ingredientId),
      archived: true,
    })

    await user.mutation(api.nutrition.updateMeal, {
      mealId,
      expectedMealItemIds: await readMealItemIds(t, mealId),
      expectedEditRevision: await readEditRevision(t, mealId),
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'ingredient',
          existingMealItemId: original.item._id,
          ingredientId,
          consumedWeightGrams: 75,
        },
      ],
    })

    const updated = await readMealState(t, mealId)
    expect(updated.meal).toMatchObject({ totalCalories: 150, itemCount: 1 })
    expect(updated.item).toMatchObject({
      sourceType: 'ingredient',
      ingredientId,
      nameSnapshot: 'Original oats',
      kcalPer100Snapshot: 200,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      consumedWeightGrams: 75,
      caloriesSnapshot: 150,
      notes: 'Historical line note',
    })
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('dailySummaries')
          .withIndex('by_ownerTokenIdentifier_and_personId_and_eatenOn', (q) =>
            q
              .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
              .eq('personId', personId)
              .eq('eatenOn', '2026-04-04'),
          )
          .unique(),
      ),
    ).toMatchObject({ consumedCalories: 150, mealCount: 1 })

    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-05',
        items: [
          {
            sourceType: 'ingredient',
            ingredientId,
            consumedWeightGrams: 10,
          },
        ],
      }),
    ).rejects.toThrow('Meal ingredient not found.')
  })

  it('reuses a cooked ingredient snapshot after catalog edits and scales its counted calories', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Original stock',
      kcalPer100: 250,
    })
    const { cookedFoodId } = await user.mutation(
      api.nutrition.createCookedFood,
      {
        cookSessionId: sessionId,
        name: 'Stock base',
        finishedWeightGrams: 200,
        ingredients: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: {
              name: 'Original stock',
              kcalPer100: 250,
              kcalBasisUnit: 'g',
              ignoreCalories: false,
            },
            referenceAmount: 80,
            referenceUnit: 'g',
            countedAmount: 80,
            notes: 'Historical cooking note',
          },
        ],
      },
    )
    const original = await readCookedFoodState(t, cookedFoodId)
    if (!original.line) {
      throw new Error('Expected the original cooked ingredient.')
    }

    await user.mutation(api.nutrition.updateIngredient, {
      ingredientId,
      expectedEditRevision: await readEditRevision(t, ingredientId),
      name: 'Renamed stock',
      kcalPer100: 500,
      ignoreCalories: false,
    })
    await user.mutation(api.nutrition.setIngredientArchived, {
      ingredientId,
      expectedEditRevision: await readEditRevision(t, ingredientId),
      archived: true,
    })

    await user.mutation(api.nutrition.updateCookedFood, {
      cookedFoodId,
      expectedCookedFoodIngredientIds: await readCookedFoodIngredientIds(
        t,
        cookedFoodId,
      ),
      expectedEditRevision: await readEditRevision(t, cookedFoodId),
      cookSessionId: sessionId,
      name: 'Stock base',
      finishedWeightGrams: 100,
      ingredients: [
        {
          sourceType: 'ingredient',
          existingCookedFoodIngredientId: original.line._id,
          ingredientId,
          referenceAmount: 80,
          referenceUnit: 'g',
          countedAmount: 40,
        },
      ],
    })

    const updated = await readCookedFoodState(t, cookedFoodId)
    expect(updated.cookedFood).toMatchObject({
      totalRawWeightGrams: 40,
      totalCalories: 100,
      kcalPer100: 100,
    })
    expect(updated.line).toMatchObject({
      _id: original.line._id,
      sourceType: 'ingredient',
      ingredientId,
      ingredientNameSnapshot: 'Original stock',
      ingredientKcalPer100Snapshot: 250,
      ingredientKcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      countedAmount: 40,
      ingredientCaloriesSnapshot: 100,
      notes: 'Historical cooking note',
    })

    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: sessionId,
        name: 'New stock use',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'ingredient',
            ingredientId,
            referenceAmount: 10,
            referenceUnit: 'g',
            countedAmount: 10,
          },
        ],
      }),
    ).rejects.toThrow('One or more ingredients are missing.')
  })

  it('reuses a cooked-food meal snapshot after the cooked food changes and is archived', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const sessionId = await insertCookSession(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Stew ingredient',
      kcalPer100: 200,
    })
    const { cookedFoodId } = await user.mutation(
      api.nutrition.createCookedFood,
      {
        cookSessionId: sessionId,
        name: 'Original stew',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: {
              name: 'Stew ingredient',
              kcalPer100: 200,
              kcalBasisUnit: 'g',
              ignoreCalories: false,
            },
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      },
    )
    const cookedState = await readCookedFoodState(t, cookedFoodId)
    if (!cookedState.line) {
      throw new Error('Expected the cooked ingredient.')
    }
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'cookedFood',
          cookedFoodId,
          expectedSnapshot: {
            name: 'Original stew',
            kcalPer100: 200,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 50,
        },
      ],
    })
    const originalMeal = await readMealState(t, mealId)
    if (!originalMeal.item) {
      throw new Error('Expected the original cooked-food meal item.')
    }

    await user.mutation(api.nutrition.updateCookedFood, {
      cookedFoodId,
      expectedCookedFoodIngredientIds: await readCookedFoodIngredientIds(
        t,
        cookedFoodId,
      ),
      expectedEditRevision: await readEditRevision(t, cookedFoodId),
      cookSessionId: sessionId,
      name: 'Changed stew',
      finishedWeightGrams: 100,
      ingredients: [
        {
          sourceType: 'ingredient',
          existingCookedFoodIngredientId: cookedState.line._id,
          ingredientId,
          referenceAmount: 100,
          referenceUnit: 'g',
          countedAmount: 50,
        },
      ],
    })
    await user.mutation(api.nutrition.setCookedFoodArchived, {
      cookedFoodId,
      expectedEditRevision: await readEditRevision(t, cookedFoodId),
      archived: true,
    })

    await user.mutation(api.nutrition.updateMeal, {
      mealId,
      expectedMealItemIds: await readMealItemIds(t, mealId),
      expectedEditRevision: await readEditRevision(t, mealId),
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'cookedFood',
          existingMealItemId: originalMeal.item._id,
          cookedFoodId,
          consumedWeightGrams: 100,
        },
      ],
    })

    const updatedMeal = await readMealState(t, mealId)
    expect(updatedMeal.meal).toMatchObject({ totalCalories: 200, itemCount: 1 })
    expect(updatedMeal.item).toMatchObject({
      sourceType: 'cookedFood',
      cookedFoodId,
      nameSnapshot: 'Original stew',
      kcalPer100Snapshot: 200,
      consumedWeightGrams: 100,
      caloriesSnapshot: 200,
    })

    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-05',
        items: [
          {
            sourceType: 'cookedFood',
            cookedFoodId,
            consumedWeightGrams: 10,
          },
        ],
      }),
    ).rejects.toThrow('Meal cooked food item not found.')
  })

  it('rejects duplicate and different-meal stable meal item IDs', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t)
    const firstMealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Ingredient',
            kcalPer100: 100,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 50,
        },
      ],
    })
    const secondMealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-05',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Ingredient',
            kcalPer100: 100,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 25,
        },
      ],
    })
    const first = await readMealState(t, firstMealId)
    const second = await readMealState(t, secondMealId)
    if (!first.item || !second.item) {
      throw new Error('Expected both meal items.')
    }

    await expect(
      user.mutation(api.nutrition.updateMeal, {
        mealId: firstMealId,
        expectedMealItemIds: await readMealItemIds(t, firstMealId),
        expectedEditRevision: await readEditRevision(t, firstMealId),
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'ingredient',
            existingMealItemId: first.item._id,
            ingredientId,
            consumedWeightGrams: 50,
          },
          {
            sourceType: 'ingredient',
            existingMealItemId: first.item._id,
            ingredientId,
            consumedWeightGrams: 25,
          },
        ],
      }),
    ).rejects.toThrow('Meal item references must be unique.')

    await expect(
      user.mutation(api.nutrition.updateMeal, {
        mealId: firstMealId,
        expectedMealItemIds: await readMealItemIds(t, firstMealId),
        expectedEditRevision: await readEditRevision(t, firstMealId),
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'ingredient',
            existingMealItemId: second.item._id,
            ingredientId,
            consumedWeightGrams: 50,
          },
        ],
      }),
    ).rejects.toThrow('Existing meal item not found.')
  })

  it('rejects duplicate and different-food stable cooked ingredient IDs', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)
    const ingredientId = await insertIngredient(t)
    const createFood = async (name: string) =>
      (
        await user.mutation(api.nutrition.createCookedFood, {
          cookSessionId: sessionId,
          name,
          finishedWeightGrams: 100,
          ingredients: [
            {
              sourceType: 'ingredient' as const,
              ingredientId,
              expectedSnapshot: {
                name: 'Ingredient',
                kcalPer100: 100,
                kcalBasisUnit: 'g' as const,
                ignoreCalories: false,
              },
              referenceAmount: 100,
              referenceUnit: 'g' as const,
              countedAmount: 100,
            },
          ],
        })
      ).cookedFoodId
    const firstFoodId = await createFood('First food')
    const secondFoodId = await createFood('Second food')
    const first = await readCookedFoodState(t, firstFoodId)
    const second = await readCookedFoodState(t, secondFoodId)
    if (!first.line || !second.line) {
      throw new Error('Expected both cooked ingredient rows.')
    }

    await expect(
      user.mutation(api.nutrition.updateCookedFood, {
        cookedFoodId: firstFoodId,
        expectedCookedFoodIngredientIds: await readCookedFoodIngredientIds(
          t,
          firstFoodId,
        ),
        expectedEditRevision: await readEditRevision(t, firstFoodId),
        cookSessionId: sessionId,
        name: 'First food',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'ingredient',
            existingCookedFoodIngredientId: first.line._id,
            ingredientId,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
          {
            sourceType: 'ingredient',
            existingCookedFoodIngredientId: first.line._id,
            ingredientId,
            referenceAmount: 50,
            referenceUnit: 'g',
            countedAmount: 50,
          },
        ],
      }),
    ).rejects.toThrow('Cooked ingredient references must be unique.')

    await expect(
      user.mutation(api.nutrition.updateCookedFood, {
        cookedFoodId: firstFoodId,
        expectedCookedFoodIngredientIds: await readCookedFoodIngredientIds(
          t,
          firstFoodId,
        ),
        expectedEditRevision: await readEditRevision(t, firstFoodId),
        cookSessionId: sessionId,
        name: 'First food',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'ingredient',
            existingCookedFoodIngredientId: second.line._id,
            ingredientId,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      }),
    ).rejects.toThrow('Existing cooked ingredient not found.')
  })

  it('allows exact archived session and recipe links on update but rejects new or changed links', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const ingredientId = await insertIngredient(t)
    const originalSessionId = await insertCookSession(t, { label: 'Original' })
    const activeSessionId = await insertCookSession(t, { label: 'Active' })
    const otherArchivedSessionId = await insertCookSession(t, {
      label: 'Other archived',
    })
    const originalRecipe = await user.mutation(api.nutrition.createRecipe, {
      name: 'Original recipe',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Ingredient',
            kcalPer100: 100,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    const otherRecipe = await user.mutation(api.nutrition.createRecipe, {
      name: 'Other recipe',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Ingredient',
            kcalPer100: 100,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    const { cookedFoodId } = await user.mutation(
      api.nutrition.createCookedFood,
      {
        cookSessionId: originalSessionId,
        name: 'Historical batch',
        recipeId: originalRecipe.recipeId,
        recipeVersionId: originalRecipe.recipeVersionId,
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: {
              name: 'Ingredient',
              kcalPer100: 100,
              kcalBasisUnit: 'g',
              ignoreCalories: false,
            },
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      },
    )
    const cookedState = await readCookedFoodState(t, cookedFoodId)
    if (!cookedState.line) {
      throw new Error('Expected the cooked ingredient row.')
    }

    await user.mutation(api.nutrition.setCookSessionArchived, {
      sessionId: originalSessionId,
      expectedEditRevision: await readEditRevision(t, originalSessionId),
      archived: true,
    })
    await user.mutation(api.nutrition.setCookSessionArchived, {
      sessionId: otherArchivedSessionId,
      expectedEditRevision: await readEditRevision(t, otherArchivedSessionId),
      archived: true,
    })
    await user.mutation(api.nutrition.setRecipeArchived, {
      recipeId: originalRecipe.recipeId,
      expectedEditRevision: await readEditRevision(t, originalRecipe.recipeId),
      archived: true,
    })
    await user.mutation(api.nutrition.setRecipeArchived, {
      recipeId: otherRecipe.recipeId,
      expectedEditRevision: await readEditRevision(t, otherRecipe.recipeId),
      archived: true,
    })

    const unchangedIngredients = [
      {
        sourceType: 'ingredient' as const,
        existingCookedFoodIngredientId: cookedState.line._id,
        ingredientId,
        referenceAmount: 100,
        referenceUnit: 'g' as const,
        countedAmount: 100,
      },
    ]
    await expect(
      user.mutation(api.nutrition.updateCookedFood, {
        cookedFoodId,
        expectedCookedFoodIngredientIds: await readCookedFoodIngredientIds(
          t,
          cookedFoodId,
        ),
        expectedEditRevision: await readEditRevision(t, cookedFoodId),
        cookSessionId: originalSessionId,
        name: 'Historical batch',
        recipeId: originalRecipe.recipeId,
        recipeVersionId: originalRecipe.recipeVersionId,
        finishedWeightGrams: 100,
        ingredients: unchangedIngredients,
      }),
    ).resolves.toMatchObject({ cookedFoodId, editRevision: 1 })

    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: originalSessionId,
        name: 'New archived-session batch',
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
      }),
    ).rejects.toThrow('Cook session not found.')

    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: activeSessionId,
        name: 'New archived-recipe batch',
        recipeId: originalRecipe.recipeId,
        recipeVersionId: originalRecipe.recipeVersionId,
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
      }),
    ).rejects.toThrow('Recipe not found.')

    await expect(
      user.mutation(api.nutrition.updateCookedFood, {
        cookedFoodId,
        expectedCookedFoodIngredientIds: await readCookedFoodIngredientIds(
          t,
          cookedFoodId,
        ),
        expectedEditRevision: await readEditRevision(t, cookedFoodId),
        cookSessionId: otherArchivedSessionId,
        name: 'Historical batch',
        recipeId: originalRecipe.recipeId,
        recipeVersionId: originalRecipe.recipeVersionId,
        finishedWeightGrams: 100,
        ingredients: unchangedIngredients,
      }),
    ).rejects.toThrow('Cook session not found.')

    await expect(
      user.mutation(api.nutrition.updateCookedFood, {
        cookedFoodId,
        expectedCookedFoodIngredientIds: await readCookedFoodIngredientIds(
          t,
          cookedFoodId,
        ),
        expectedEditRevision: await readEditRevision(t, cookedFoodId),
        cookSessionId: originalSessionId,
        name: 'Historical batch',
        recipeId: otherRecipe.recipeId,
        recipeVersionId: otherRecipe.recipeVersionId,
        finishedWeightGrams: 100,
        ingredients: unchangedIngredients,
      }),
    ).rejects.toThrow('Recipe not found.')
  })

  it('limits archived recipe ingredient reuse to the current version occurrence count', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const ingredientId = await insertIngredient(t)
    const recipe = await user.mutation(api.nutrition.createRecipe, {
      name: 'Historical recipe',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Ingredient',
            kcalPer100: 100,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    await user.mutation(api.nutrition.setIngredientArchived, {
      ingredientId,
      expectedEditRevision: await readEditRevision(t, ingredientId),
      archived: true,
    })
    const currentLine = await t.run(async (ctx) =>
      ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('recipeVersionId', recipe.recipeVersionId),
        )
        .unique(),
    )
    if (!currentLine) {
      throw new Error('Expected the current recipe ingredient.')
    }

    const updated = await user.mutation(
      api.nutrition.updateRecipeCurrentVersion,
      {
        recipeId: recipe.recipeId,
        expectedRecipeVersionId: recipe.recipeVersionId,
        expectedEditRevision: await readEditRevision(t, recipe.recipeId),
        name: 'Historical recipe v2',
        ingredientLines: [
          {
            sourceType: 'ingredient',
            existingRecipeVersionIngredientId: currentLine._id,
            ingredientId,
            referenceAmount: 120,
            referenceUnit: 'g',
          },
        ],
      },
    )
    expect(updated).toMatchObject({ versionNumber: 2 })

    await expect(
      user.mutation(api.nutrition.updateRecipeCurrentVersion, {
        recipeId: recipe.recipeId,
        expectedRecipeVersionId: updated.recipeVersionId,
        expectedEditRevision: await readEditRevision(t, recipe.recipeId),
        name: 'Invalid duplicate',
        ingredientLines: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: {
              name: 'Ingredient',
              kcalPer100: 100,
              kcalBasisUnit: 'g',
              ignoreCalories: false,
            },
            referenceAmount: 60,
            referenceUnit: 'g',
          },
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: {
              name: 'Ingredient',
              kcalPer100: 100,
              kcalBasisUnit: 'g',
              ignoreCalories: false,
            },
            referenceAmount: 60,
            referenceUnit: 'g',
          },
        ],
      }),
    ).rejects.toThrow('One or more ingredients are missing.')

    await expect(
      user.mutation(api.nutrition.createRecipe, {
        name: 'New recipe',
        ingredientLines: [
          {
            sourceType: 'ingredient',
            ingredientId,
            referenceAmount: 100,
            referenceUnit: 'g',
          },
        ],
      }),
    ).rejects.toThrow('One or more ingredients are missing.')
  })

  it('preserves exact archived custom catalog links while rejecting new links', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const sessionId = await insertCookSession(t)
    const linkedIngredientId = await insertIngredient(t, {
      name: 'Linked catalog row',
      kcalPer100: 50,
    })
    const recipe = await user.mutation(api.nutrition.createRecipe, {
      name: 'Custom-link recipe',
      ingredientLines: [
        {
          sourceType: 'custom',
          ingredientId: linkedIngredientId,
          name: 'Recipe custom line',
          kcalPer100: 120,
          ignoreCalories: false,
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    const { cookedFoodId } = await user.mutation(
      api.nutrition.createCookedFood,
      {
        cookSessionId: sessionId,
        name: 'Custom-link cooked food',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'custom',
            ingredientId: linkedIngredientId,
            name: 'Cooked custom line',
            kcalPer100: 200,
            ignoreCalories: false,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      },
    )
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'customByWeight',
          ingredientId: linkedIngredientId,
          name: 'Meal custom line',
          kcalPer100: 300,
          ignoreCalories: false,
          consumedWeightGrams: 50,
        },
      ],
    })
    const cookedState = await readCookedFoodState(t, cookedFoodId)
    const mealState = await readMealState(t, mealId)
    if (!cookedState.line || !mealState.item) {
      throw new Error('Expected the historical custom-linked rows.')
    }

    await user.mutation(api.nutrition.setIngredientArchived, {
      ingredientId: linkedIngredientId,
      expectedEditRevision: await readEditRevision(t, linkedIngredientId),
      archived: true,
    })

    const updatedRecipe = await user.mutation(
      api.nutrition.updateRecipeCurrentVersion,
      {
        recipeId: recipe.recipeId,
        expectedRecipeVersionId: recipe.recipeVersionId,
        expectedEditRevision: await readEditRevision(t, recipe.recipeId),
        name: 'Custom-link recipe v2',
        ingredientLines: [
          {
            sourceType: 'custom',
            ingredientId: linkedIngredientId,
            name: 'Edited recipe custom line',
            kcalPer100: 180,
            ignoreCalories: false,
            referenceAmount: 80,
            referenceUnit: 'g',
          },
        ],
      },
    )
    await user.mutation(api.nutrition.updateCookedFood, {
      cookedFoodId,
      expectedCookedFoodIngredientIds: await readCookedFoodIngredientIds(
        t,
        cookedFoodId,
      ),
      expectedEditRevision: await readEditRevision(t, cookedFoodId),
      cookSessionId: sessionId,
      name: 'Custom-link cooked food',
      finishedWeightGrams: 100,
      ingredients: [
        {
          sourceType: 'custom',
          existingCookedFoodIngredientId: cookedState.line._id,
          ingredientId: linkedIngredientId,
          name: 'Edited cooked custom line',
          kcalPer100: 300,
          ignoreCalories: false,
          referenceAmount: 40,
          referenceUnit: 'g',
          countedAmount: 40,
        },
      ],
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
          existingMealItemId: mealState.item._id,
          ingredientId: linkedIngredientId,
          name: 'Edited meal custom line',
          kcalPer100: 400,
          ignoreCalories: false,
          consumedWeightGrams: 25,
        },
      ],
    })

    const updatedCookedState = await readCookedFoodState(t, cookedFoodId)
    const updatedMealState = await readMealState(t, mealId)
    const updatedRecipeLine = await t.run(async (ctx) =>
      ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('recipeVersionId', updatedRecipe.recipeVersionId),
        )
        .unique(),
    )
    expect(updatedRecipeLine).toMatchObject({
      sourceType: 'custom',
      ingredientId: linkedIngredientId,
      ingredientNameSnapshot: 'Edited recipe custom line',
      kcalPer100Snapshot: 180,
    })
    expect(updatedCookedState.cookedFood).toMatchObject({ totalCalories: 120 })
    expect(updatedCookedState.line).toMatchObject({
      sourceType: 'custom',
      ingredientId: linkedIngredientId,
      ingredientNameSnapshot: 'Edited cooked custom line',
      ingredientKcalPer100Snapshot: 300,
      countedAmount: 40,
      ingredientCaloriesSnapshot: 120,
    })
    expect(updatedMealState.meal).toMatchObject({ totalCalories: 100 })
    expect(updatedMealState.item).toMatchObject({
      sourceType: 'customByWeight',
      ingredientId: linkedIngredientId,
      nameSnapshot: 'Edited meal custom line',
      kcalPer100Snapshot: 400,
      consumedWeightGrams: 25,
      caloriesSnapshot: 100,
    })

    await expect(
      user.mutation(api.nutrition.createRecipe, {
        name: 'Invalid new custom-link recipe',
        ingredientLines: [
          {
            sourceType: 'custom',
            ingredientId: linkedIngredientId,
            name: 'New custom line',
            kcalPer100: 100,
            ignoreCalories: false,
            referenceAmount: 100,
            referenceUnit: 'g',
          },
        ],
      }),
    ).rejects.toThrow('Linked ingredient not found.')
    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: sessionId,
        name: 'Invalid new custom-link cooked food',
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'custom',
            ingredientId: linkedIngredientId,
            name: 'New custom line',
            kcalPer100: 100,
            ignoreCalories: false,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      }),
    ).rejects.toThrow('Linked ingredient not found.')
    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-05',
        items: [
          {
            sourceType: 'customByWeight',
            ingredientId: linkedIngredientId,
            name: 'New custom line',
            kcalPer100: 100,
            ignoreCalories: false,
            consumedWeightGrams: 100,
          },
        ],
      }),
    ).rejects.toThrow('Linked ingredient not found.')
  })

  it('allows exact archived people and groups on update but rejects new assignments', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t, { name: 'Historical person' })
    const otherPersonId = await insertPerson(t, { name: 'Other person' })
    const ingredientGroupId = await insertFoodGroup(t, {
      name: 'Ingredient group',
      appliesTo: 'ingredient',
    })
    const cookedGroupId = await insertFoodGroup(t, {
      name: 'Cooked group',
      appliesTo: 'cookedFood',
    })
    const otherIngredientGroupId = await insertFoodGroup(t, {
      name: 'Other ingredient group',
      appliesTo: 'ingredient',
    })
    const otherCookedGroupId = await insertFoodGroup(t, {
      name: 'Other cooked group',
      appliesTo: 'cookedFood',
    })
    const ingredientId = await insertIngredient(t, {
      groupId: ingredientGroupId,
    })
    const sessionId = await user.mutation(api.nutrition.createCookSession, {
      cookedAt: Date.parse('2026-04-04T12:00:00Z'),
      cookedByPersonId: personId,
    })
    const { cookedFoodId } = await user.mutation(
      api.nutrition.createCookedFood,
      {
        cookSessionId: sessionId,
        name: 'Grouped food',
        groupId: cookedGroupId,
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: {
              name: 'Ingredient',
              kcalPer100: 100,
              kcalBasisUnit: 'g',
              ignoreCalories: false,
            },
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      },
    )
    const cookedState = await readCookedFoodState(t, cookedFoodId)
    if (!cookedState.line) {
      throw new Error('Expected the grouped cooked ingredient.')
    }
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [{ sourceType: 'fixedCalories', name: 'Estimate', calories: 500 }],
    })
    const mealState = await readMealState(t, mealId)
    if (!mealState.item) {
      throw new Error('Expected the historical meal item.')
    }

    await user.mutation(api.nutrition.setPersonArchived, {
      personId,
      expectedEditRevision: await readEditRevision(t, personId),
      archived: true,
    })
    await user.mutation(api.nutrition.setPersonArchived, {
      personId: otherPersonId,
      expectedEditRevision: await readEditRevision(t, otherPersonId),
      archived: true,
    })
    await user.mutation(api.nutrition.setFoodGroupArchived, {
      groupId: ingredientGroupId,
      expectedEditRevision: await readEditRevision(t, ingredientGroupId),
      archived: true,
    })
    await user.mutation(api.nutrition.setFoodGroupArchived, {
      groupId: cookedGroupId,
      expectedEditRevision: await readEditRevision(t, cookedGroupId),
      archived: true,
    })
    await user.mutation(api.nutrition.setFoodGroupArchived, {
      groupId: otherIngredientGroupId,
      expectedEditRevision: await readEditRevision(t, otherIngredientGroupId),
      archived: true,
    })
    await user.mutation(api.nutrition.setFoodGroupArchived, {
      groupId: otherCookedGroupId,
      expectedEditRevision: await readEditRevision(t, otherCookedGroupId),
      archived: true,
    })

    await expect(
      user.mutation(api.nutrition.updateMeal, {
        mealId,
        expectedMealItemIds: await readMealItemIds(t, mealId),
        expectedEditRevision: await readEditRevision(t, mealId),
        personId,
        eatenOn: '2026-04-04',
        items: [
          {
            sourceType: 'fixedCalories',
            existingMealItemId: mealState.item._id,
            name: 'Estimate',
            calories: 500,
          },
        ],
      }),
    ).resolves.toBeNull()
    await expect(
      user.mutation(api.nutrition.updateCookSession, {
        sessionId,
        expectedEditRevision: await readEditRevision(t, sessionId),
        cookedAt: Date.parse('2026-04-04T12:00:00Z'),
        cookedByPersonId: personId,
      }),
    ).resolves.toBeNull()
    await expect(
      user.mutation(api.nutrition.updateIngredient, {
        ingredientId,
        expectedEditRevision: await readEditRevision(t, ingredientId),
        name: 'Ingredient',
        kcalPer100: 100,
        ignoreCalories: false,
        groupId: ingredientGroupId,
      }),
    ).resolves.toBeNull()
    await expect(
      user.mutation(api.nutrition.updateCookedFood, {
        cookedFoodId,
        expectedCookedFoodIngredientIds: await readCookedFoodIngredientIds(
          t,
          cookedFoodId,
        ),
        expectedEditRevision: await readEditRevision(t, cookedFoodId),
        cookSessionId: sessionId,
        name: 'Grouped food',
        groupId: cookedGroupId,
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'ingredient',
            existingCookedFoodIngredientId: cookedState.line._id,
            ingredientId,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      }),
    ).resolves.toMatchObject({ cookedFoodId, editRevision: 1 })

    await expect(
      user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-04-05',
        items: [
          { sourceType: 'fixedCalories', name: 'Estimate', calories: 100 },
        ],
      }),
    ).rejects.toThrow('Person not found.')
    await expect(
      user.mutation(api.nutrition.updateMeal, {
        mealId,
        expectedMealItemIds: await readMealItemIds(t, mealId),
        expectedEditRevision: await readEditRevision(t, mealId),
        personId: otherPersonId,
        eatenOn: '2026-04-04',
        items: [
          { sourceType: 'fixedCalories', name: 'Estimate', calories: 500 },
        ],
      }),
    ).rejects.toThrow('Person not found.')
    await expect(
      user.mutation(api.nutrition.createCookSession, {
        cookedAt: Date.parse('2026-04-05T12:00:00Z'),
        cookedByPersonId: personId,
      }),
    ).rejects.toThrow('Cook person not found.')
    await expect(
      user.mutation(api.nutrition.updateCookSession, {
        sessionId,
        expectedEditRevision: await readEditRevision(t, sessionId),
        cookedAt: Date.parse('2026-04-04T12:00:00Z'),
        cookedByPersonId: otherPersonId,
      }),
    ).rejects.toThrow('Cook person not found.')
    await expect(
      user.mutation(api.nutrition.createIngredient, {
        name: 'New grouped ingredient',
        kcalPer100: 100,
        ignoreCalories: false,
        groupId: ingredientGroupId,
      }),
    ).rejects.toThrow(
      'One or more groups are missing or do not apply to ingredients.',
    )
    await expect(
      user.mutation(api.nutrition.updateIngredient, {
        ingredientId,
        expectedEditRevision: await readEditRevision(t, ingredientId),
        name: 'Ingredient',
        kcalPer100: 100,
        ignoreCalories: false,
        groupId: otherIngredientGroupId,
      }),
    ).rejects.toThrow(
      'One or more groups are missing or do not apply to ingredients.',
    )
    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: sessionId,
        name: 'New grouped food',
        groupId: cookedGroupId,
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
      }),
    ).rejects.toThrow(
      'One or more groups are missing or do not apply to cooked foods.',
    )
    await expect(
      user.mutation(api.nutrition.updateCookedFood, {
        cookedFoodId,
        expectedCookedFoodIngredientIds: await readCookedFoodIngredientIds(
          t,
          cookedFoodId,
        ),
        expectedEditRevision: await readEditRevision(t, cookedFoodId),
        cookSessionId: sessionId,
        name: 'Grouped food',
        groupId: otherCookedGroupId,
        finishedWeightGrams: 100,
        ingredients: [
          {
            sourceType: 'ingredient',
            existingCookedFoodIngredientId: cookedState.line._id,
            ingredientId,
            referenceAmount: 100,
            referenceUnit: 'g',
            countedAmount: 100,
          },
        ],
      }),
    ).rejects.toThrow(
      'One or more groups are missing or do not apply to cooked foods.',
    )
  })
})
