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
  readEditRevision,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

function expectedNutritionSnapshot(
  name: string,
  kcalPer100 = 100,
  kcalBasisUnit: 'g' | 'ml' | 'piece' = 'g',
  ignoreCalories = false,
) {
  return { name, kcalPer100, kcalBasisUnit, ignoreCalories }
}

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
      notes: '  Breakfast  ',
    })

    const ingredient = await t.run(
      async (ctx) => await ctx.db.get(ingredientId),
    )

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
      eatenOn: '2026-04-04',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Protein powder',
            kcalPer100: 400,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 50,
        },
      ],
    })

    await expect(
      user.mutation(api.nutrition.deleteIngredient, {
        ingredientId,
        expectedEditRevision: await readEditRevision(t, ingredientId),
      }),
    ).rejects.toThrowError(
      'Ingredient is in historical records. Archive instead.',
    )
  })

  it('rejects updating ingredients with groups owned by another token', async () => {
    const t = createConvexTest()
    const owner = asTestUser(t)
    const sameSubjectDifferentToken = asTestUserWithToken(
      t,
      'user-1|other-token',
    )
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
        expectedEditRevision: await readEditRevision(t, ingredientId),
        name: 'Greek yogurt',
        kcalPer100: 100,
        ignoreCalories: false,
        groupId: foreignGroupId,
      }),
    ).rejects.toThrowError(
      'One or more groups are missing or do not apply to ingredients.',
    )
  })

  it('rejects groups whose scope does not match the record type', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const cookedFoodGroupId = await user.mutation(
      api.nutrition.createFoodGroup,
      {
        name: 'Dinner',
        appliesTo: 'cookedFood',
      },
    )

    await expect(
      user.mutation(api.nutrition.createIngredient, {
        name: 'Rice',
        kcalPer100: 130,
        ignoreCalories: false,
        groupId: cookedFoodGroupId,
      }),
    ).rejects.toThrowError(
      'One or more groups are missing or do not apply to ingredients.',
    )
  })

  it('joins an owned archived group into bounded ingredient results', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const groupId = await user.mutation(api.nutrition.createFoodGroup, {
      name: 'Legacy staples',
      appliesTo: 'ingredient',
    })
    const ingredientId = await user.mutation(api.nutrition.createIngredient, {
      name: 'Rice',
      kcalPer100: 130,
      ignoreCalories: false,
      groupId,
    })
    await user.mutation(api.nutrition.setFoodGroupArchived, {
      groupId,
      expectedEditRevision: await readEditRevision(t, groupId),
      archived: true,
    })

    const [listed, searched] = await Promise.all([
      user.query(api.catalog.listIngredients, {
        archived: false,
        paginationOpts: { numItems: 10, cursor: null },
      }),
      user.query(api.catalog.searchIngredients, {
        archived: false,
        search: '',
      }),
    ])

    for (const result of [listed.page, searched]) {
      expect(result).toContainEqual(
        expect.objectContaining({
          _id: ingredientId,
          groupId,
          groupName: 'Legacy staples',
          groupArchived: true,
        }),
      )
      expect(result[0]).not.toHaveProperty('ownerTokenIdentifier')
    }
  })

  it('point-loads owned catalog references without exposing another token', async () => {
    const t = createConvexTest()
    const owner = asTestUser(t)
    const otherToken = asTestUserWithToken(t, 'user-1|other-token')
    const groupId = await owner.mutation(api.nutrition.createFoodGroup, {
      name: 'Restored group',
      appliesTo: 'ingredient',
    })
    const ingredientId = await owner.mutation(api.nutrition.createIngredient, {
      name: 'Restored serving',
      kcalPer100: 42,
      kcalBasisUnit: 'piece',
      ignoreCalories: false,
      groupId,
    })
    const recipe = await owner.mutation(api.nutrition.createRecipe, {
      name: 'Restored recipe',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: expectedNutritionSnapshot(
            'Restored serving',
            42,
            'piece',
          ),
          referenceAmount: 1,
          referenceUnit: 'piece',
        },
      ],
    })

    await expect(
      Promise.all([
        owner.query(api.catalog.getFoodGroup, { groupId }),
        owner.query(api.catalog.getIngredient, { ingredientId }),
        owner.query(api.catalog.getRecipe, { recipeId: recipe.recipeId }),
      ]),
    ).resolves.toEqual([
      expect.objectContaining({ _id: groupId, name: 'Restored group' }),
      expect.objectContaining({
        _id: ingredientId,
        name: 'Restored serving',
        kcalBasisUnit: 'piece',
        groupName: 'Restored group',
      }),
      expect.objectContaining({
        _id: recipe.recipeId,
        name: 'Restored recipe',
      }),
    ])

    await expect(
      Promise.all([
        otherToken.query(api.catalog.getFoodGroup, { groupId }),
        otherToken.query(api.catalog.getIngredient, { ingredientId }),
        otherToken.query(api.catalog.getRecipe, {
          recipeId: recipe.recipeId,
        }),
      ]),
    ).resolves.toEqual([null, null, null])
  })

  it('filters gram ingredients before pagination when requested', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const gramIngredient = await insertIngredient(t, {
      name: 'Rice',
      kcalBasisUnit: 'g',
    })
    await insertIngredient(t, {
      name: 'Egg',
      kcalBasisUnit: 'piece',
    })

    const result = await user.query(api.catalog.listIngredients, {
      archived: false,
      kcalBasisUnit: 'g',
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(result.page).toHaveLength(1)
    expect(result.page[0]?._id).toBe(gramIngredient)
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
          expectedSnapshot: expectedNutritionSnapshot('Oats'),
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })

    await user.mutation(api.nutrition.updateRecipeCurrentVersion, {
      recipeId: created.recipeId,
      expectedRecipeVersionId: created.recipeVersionId,
      expectedEditRevision: await readEditRevision(t, created.recipeId),
      name: 'Breakfast bowl',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId: ingredientB,
          expectedSnapshot: expectedNutritionSnapshot('Berries'),
          referenceAmount: 50,
          referenceUnit: 'g',
        },
      ],
    })

    const { recipe, versions, oldVersionLines, newVersionLines } = await t.run(
      async (ctx) => {
        const recipe = await ctx.db.get(created.recipeId)
        if (!recipe) {
          throw new Error('Expected the recipe to exist.')
        }
        const versions = await ctx.db
          .query('recipeVersions')
          .withIndex('by_ownerTokenIdentifier_and_recipeId', (q) =>
            q
              .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
              .eq('recipeId', created.recipeId),
          )
          .collect()
        const currentVersion = versions.find(
          (version) => version.versionNumber === recipe.latestVersionNumber,
        )
        if (!currentVersion) {
          throw new Error('Expected a current recipe version.')
        }
        const oldVersionLines = await ctx.db
          .query('recipeVersionIngredients')
          .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
            q
              .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
              .eq('recipeVersionId', created.recipeVersionId),
          )
          .collect()
        const newVersionLines = await ctx.db
          .query('recipeVersionIngredients')
          .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
            q
              .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
              .eq('recipeVersionId', currentVersion._id),
          )
          .collect()
        return { recipe, versions, oldVersionLines, newVersionLines }
      },
    )

    expect(recipe.latestVersionNumber).toBe(2)
    expect(versions).toHaveLength(2)
    expect(versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: created.recipeVersionId,
          versionNumber: 1,
        }),
        expect.objectContaining({
          versionNumber: 2,
        }),
      ]),
    )
    expect(oldVersionLines).toHaveLength(1)
    expect(oldVersionLines[0]?.ingredientId).toBe(ingredientA)
    expect(newVersionLines).toHaveLength(1)
    expect(newVersionLines[0]?.ingredientId).toBe(ingredientB)
    expect(newVersionLines[0]?.referenceAmount).toBe(50)
    await expect(
      user.mutation(api.nutrition.deleteRecipe, {
        recipeId: created.recipeId,
        expectedEditRevision: await readEditRevision(t, created.recipeId),
      }),
    ).rejects.toThrow(
      'Only single-version recipes can be deleted. Archive instead.',
    )
  })

  it('preserves omitted recipe metadata when creating a new version', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const ingredientId = await insertIngredient(t, { name: 'Oats' })
    const created = await user.mutation(api.nutrition.createRecipe, {
      name: 'Breakfast bowl',
      description: 'A useful description',
      instructions: 'Mix carefully',
      notes: 'Private note',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: expectedNutritionSnapshot('Oats'),
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })

    const updated = await user.mutation(
      api.nutrition.updateRecipeCurrentVersion,
      {
        recipeId: created.recipeId,
        expectedRecipeVersionId: created.recipeVersionId,
        expectedEditRevision: await readEditRevision(t, created.recipeId),
        name: 'Breakfast bowl v2',
        ingredientLines: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: expectedNutritionSnapshot('Oats'),
            referenceAmount: 120,
            referenceUnit: 'g',
          },
        ],
      },
    )

    const { recipe, version } = await t.run(async (ctx) => ({
      recipe: await ctx.db.get(created.recipeId),
      version: await ctx.db.get(updated.recipeVersionId),
    }))
    expect(recipe?.description).toBe('A useful description')
    expect(version).toMatchObject({
      instructions: 'Mix carefully',
      notes: 'Private note',
    })
  })

  it('preserves stable recipe ingredient snapshots and unchanged legacy notes', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Original oats',
      kcalPer100: 200,
    })
    const created = await user.mutation(api.nutrition.createRecipe, {
      name: 'Breakfast bowl',
      instructions: 'Original instructions',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: expectedNutritionSnapshot('Original oats', 200),
          referenceAmount: 100,
          referenceUnit: 'g',
          notes: 'Original line note',
        },
      ],
    })
    const originalLine = await t.run(async (ctx) =>
      ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('recipeVersionId', created.recipeVersionId),
        )
        .unique(),
    )
    if (!originalLine) {
      throw new Error('Expected the original recipe ingredient.')
    }
    const legacyNotes = 'x'.repeat(2_001)
    await t.run(async (ctx) => {
      await ctx.db.patch(originalLine._id, { notes: legacyNotes })
    })
    await user.mutation(api.nutrition.updateIngredient, {
      ingredientId,
      expectedEditRevision: await readEditRevision(t, ingredientId),
      name: 'Changed oats',
      kcalPer100: 0,
      kcalBasisUnit: 'piece',
      ignoreCalories: true,
    })
    await user.mutation(api.nutrition.setIngredientArchived, {
      ingredientId,
      expectedEditRevision: await readEditRevision(t, ingredientId),
      archived: true,
    })

    const updated = await user.mutation(
      api.nutrition.updateRecipeCurrentVersion,
      {
        recipeId: created.recipeId,
        expectedRecipeVersionId: created.recipeVersionId,
        expectedEditRevision: await readEditRevision(t, created.recipeId),
        name: 'Breakfast bowl',
        instructions: 'Updated instructions only',
        ingredientLines: [
          {
            sourceType: 'ingredient',
            existingRecipeVersionIngredientId: originalLine._id,
            ingredientId,
            referenceAmount: 120,
            referenceUnit: 'g',
            notes: legacyNotes,
          },
        ],
      },
    )
    const newLine = await t.run(async (ctx) =>
      ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('recipeVersionId', updated.recipeVersionId),
        )
        .unique(),
    )

    expect(newLine).toMatchObject({
      sourceType: 'ingredient',
      ingredientId,
      ingredientNameSnapshot: 'Original oats',
      kcalPer100Snapshot: 200,
      kcalBasisUnitSnapshot: 'g',
      ignoreCaloriesSnapshot: false,
      referenceAmount: 120,
      notes: legacyNotes,
    })
  })

  it('validates stable recipe ingredient identity and current-version membership', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const ingredientId = await insertIngredient(t, { name: 'Oats' })
    const otherIngredientId = await insertIngredient(t, { name: 'Berries' })
    const created = await user.mutation(api.nutrition.createRecipe, {
      name: 'Breakfast bowl',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: expectedNutritionSnapshot('Oats'),
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    const currentLine = await t.run(async (ctx) =>
      ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('recipeVersionId', created.recipeVersionId),
        )
        .unique(),
    )
    if (!currentLine) {
      throw new Error('Expected the current recipe ingredient.')
    }
    const stableLine = {
      sourceType: 'ingredient' as const,
      existingRecipeVersionIngredientId: currentLine._id,
      ingredientId,
      referenceAmount: 100,
      referenceUnit: 'g' as const,
    }

    await expect(
      user.mutation(api.nutrition.updateRecipeCurrentVersion, {
        recipeId: created.recipeId,
        expectedRecipeVersionId: created.recipeVersionId,
        expectedEditRevision: await readEditRevision(t, created.recipeId),
        name: 'Breakfast bowl',
        ingredientLines: [stableLine, stableLine],
      }),
    ).rejects.toThrow('Recipe ingredient references must be unique.')
    await expect(
      user.mutation(api.nutrition.updateRecipeCurrentVersion, {
        recipeId: created.recipeId,
        expectedRecipeVersionId: created.recipeVersionId,
        expectedEditRevision: await readEditRevision(t, created.recipeId),
        name: 'Breakfast bowl',
        ingredientLines: [{ ...stableLine, ingredientId: otherIngredientId }],
      }),
    ).rejects.toThrow('Existing recipe ingredient does not match ingredient.')

    const otherToken = 'https://issuer.example|other-recipe-owner'
    const otherUser = asTestUserWithToken(t, otherToken)
    const foreignIngredientId = await otherUser.mutation(
      api.nutrition.createIngredient,
      {
        name: 'Foreign ingredient',
        kcalPer100: 100,
        ignoreCalories: false,
      },
    )
    const foreignRecipe = await otherUser.mutation(api.nutrition.createRecipe, {
      name: 'Foreign recipe',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId: foreignIngredientId,
          expectedSnapshot: expectedNutritionSnapshot('Foreign ingredient'),
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    const foreignLine = await t.run(async (ctx) =>
      ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
          q
            .eq('ownerTokenIdentifier', otherToken)
            .eq('recipeVersionId', foreignRecipe.recipeVersionId),
        )
        .unique(),
    )
    if (!foreignLine) {
      throw new Error('Expected the foreign recipe ingredient.')
    }
    await expect(
      user.mutation(api.nutrition.updateRecipeCurrentVersion, {
        recipeId: created.recipeId,
        expectedRecipeVersionId: created.recipeVersionId,
        expectedEditRevision: await readEditRevision(t, created.recipeId),
        name: 'Breakfast bowl',
        ingredientLines: [
          {
            sourceType: 'ingredient',
            existingRecipeVersionIngredientId: foreignLine._id,
            ingredientId: foreignIngredientId,
            referenceAmount: 100,
            referenceUnit: 'g',
          },
        ],
      }),
    ).rejects.toThrow('Existing recipe ingredient not found.')
  })

  it('rejects recipe version numbers without safe increment capacity', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const ingredientId = await insertIngredient(t)
    const created = await user.mutation(api.nutrition.createRecipe, {
      name: 'Maxed recipe',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: expectedNutritionSnapshot('Ingredient'),
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    await t.run(async (ctx) => {
      await ctx.db.patch(created.recipeId, {
        latestVersionNumber: Number.MAX_SAFE_INTEGER,
      })
      await ctx.db.patch(created.recipeVersionId, {
        versionNumber: Number.MAX_SAFE_INTEGER,
      })
    })

    await expect(
      user.mutation(api.nutrition.updateRecipeCurrentVersion, {
        recipeId: created.recipeId,
        expectedRecipeVersionId: created.recipeVersionId,
        expectedEditRevision: await readEditRevision(t, created.recipeId),
        name: 'Maxed recipe',
        ingredientLines: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: expectedNutritionSnapshot('Ingredient'),
            referenceAmount: 100,
            referenceUnit: 'g',
          },
        ],
      }),
    ).rejects.toThrow(
      'Recipe version number exceeds the supported integer range.',
    )
  })

  it('rejects a stale recipe base version even when every line was replaced', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const firstIngredientId = await insertIngredient(t, { name: 'Oats' })
    const replacementIngredientId = await insertIngredient(t, {
      name: 'Berries',
    })
    const created = await user.mutation(api.nutrition.createRecipe, {
      name: 'Breakfast bowl',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId: firstIngredientId,
          expectedSnapshot: expectedNutritionSnapshot('Oats'),
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    const firstUpdate = await user.mutation(
      api.nutrition.updateRecipeCurrentVersion,
      {
        recipeId: created.recipeId,
        expectedRecipeVersionId: created.recipeVersionId,
        expectedEditRevision: await readEditRevision(t, created.recipeId),
        name: 'Breakfast bowl v2',
        ingredientLines: [
          {
            sourceType: 'ingredient',
            ingredientId: replacementIngredientId,
            expectedSnapshot: expectedNutritionSnapshot('Berries'),
            referenceAmount: 50,
            referenceUnit: 'g',
          },
        ],
      },
    )

    await expect(
      user.mutation(api.nutrition.updateRecipeCurrentVersion, {
        recipeId: created.recipeId,
        expectedRecipeVersionId: created.recipeVersionId,
        expectedEditRevision: 0,
        name: 'Stale replacement',
        ingredientLines: [
          {
            sourceType: 'ingredient',
            ingredientId: firstIngredientId,
            expectedSnapshot: expectedNutritionSnapshot('Oats'),
            referenceAmount: 25,
            referenceUnit: 'g',
          },
        ],
      }),
    ).rejects.toThrow(
      'Recipe changed since editing began. Refresh and try again.',
    )
    expect(
      await t.run(async (ctx) => ctx.db.get(created.recipeId)),
    ).toMatchObject({
      name: 'Breakfast bowl v2',
      latestVersionNumber: firstUpdate.versionNumber,
    })
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
          expectedSnapshot: expectedNutritionSnapshot('Oats'),
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })

    await user.mutation(api.nutrition.updateRecipeCurrentVersion, {
      recipeId: created.recipeId,
      expectedRecipeVersionId: created.recipeVersionId,
      expectedEditRevision: await readEditRevision(t, created.recipeId),
      name: 'Breakfast bowl',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId: ingredientB,
          expectedSnapshot: expectedNutritionSnapshot('Berries'),
          referenceAmount: 50,
          referenceUnit: 'g',
        },
      ],
    })

    const currentVersionLines = await t.run(async (ctx) => {
      const recipe = await ctx.db.get(created.recipeId)
      if (!recipe) {
        throw new Error('Expected the recipe to exist.')
      }
      const versions = await ctx.db
        .query('recipeVersions')
        .withIndex('by_ownerTokenIdentifier_and_recipeId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('recipeId', created.recipeId),
        )
        .collect()
      const currentVersion = versions.find(
        (version) => version.versionNumber === recipe.latestVersionNumber,
      )
      if (!currentVersion) {
        throw new Error('Expected a current recipe version.')
      }
      return await ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier_and_recipeVersionId', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('recipeVersionId', currentVersion._id),
        )
        .collect()
    })

    expect(currentVersionLines).toHaveLength(1)
    expect(currentVersionLines[0]?.ingredientId).toBe(ingredientB)
    expect(currentVersionLines[0]?.referenceAmount).toBe(50)
  })

  it('blocks changing the scope of a group that is already assigned', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const groupId = await user.mutation(api.nutrition.createFoodGroup, {
      name: 'Pantry',
      appliesTo: 'ingredient',
    })
    await user.mutation(api.nutrition.createIngredient, {
      name: 'Rice',
      kcalPer100: 130,
      ignoreCalories: false,
      groupId,
    })

    await expect(
      user.mutation(api.nutrition.updateFoodGroup, {
        groupId,
        expectedEditRevision: await readEditRevision(t, groupId),
        name: 'Prepared food',
        appliesTo: 'cookedFood',
      }),
    ).rejects.toThrowError(
      'Group scope cannot change while the group is assigned to records.',
    )
  })

  it('rejects recipe versions linked to a different recipe', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t)
    const ingredientId = await insertIngredient(t, { name: 'Rice' })
    const recipeA = await user.mutation(api.nutrition.createRecipe, {
      name: 'Recipe A',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: expectedNutritionSnapshot('Rice'),
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    const recipeB = await user.mutation(api.nutrition.createRecipe, {
      name: 'Recipe B',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: expectedNutritionSnapshot('Rice'),
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })

    await expect(
      user.mutation(api.nutrition.createCookedFood, {
        cookSessionId: sessionId,
        name: 'Invalid link',
        recipeId: recipeA.recipeId,
        recipeVersionId: recipeB.recipeVersionId,
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
    ).rejects.toThrowError(
      'Recipe version does not belong to the selected recipe.',
    )
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
          expectedSnapshot: expectedNutritionSnapshot('Rice', 130),
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
      finishedWeightGrams: 100,
      ingredients: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: {
            name: 'Rice',
            kcalPer100: 130,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          referenceAmount: 100,
          referenceUnit: 'g',
          countedAmount: 100,
        },
      ],
    })

    await expect(
      user.mutation(api.nutrition.deleteRecipe, {
        recipeId: created.recipeId,
        expectedEditRevision: await readEditRevision(t, created.recipeId),
      }),
    ).rejects.toThrowError('Recipe has cooked history. Archive instead.')
  })
})
