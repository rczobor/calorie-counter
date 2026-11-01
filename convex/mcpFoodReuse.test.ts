// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { api, internal } from './_generated/api'
import { resolveCookedIngredient, resolveSavedMealItem } from './mcpFoodReuse'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertIngredient,
  insertPerson,
  testHouseholdId,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

async function fixture() {
  const t = createConvexTest()
  rateLimiterTest.register(t)
  const personId = await insertPerson(t)
  const mealId = await asTestUser(t).mutation(api.nutrition.createMeal, {
    personId,
    eatenOn: '2026-11-01',
    notes: 'Private meal note',
    items: [
      {
        sourceType: 'fixedCalories',
        name: 'Gummy vitamins',
        calories: 14,
        notes: 'Private vitamin note',
      },
      {
        sourceType: 'customByWeight',
        name: 'Seeded bread',
        kcalPer100: 268,
        ignoreCalories: false,
        consumedWeightGrams: 96,
        nutritionProvenance: {
          source: 'User packaging',
          assumptions: '268 kcal per 100 g from the supplied label.',
        },
      },
    ],
  })
  const owner = {
    householdId: testHouseholdId(t),
    ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
  }
  const user = {
    userId: TEST_TOKEN_IDENTIFIER,
    connectionId: 'test-food-reuse',
    scopes: ['nutrition:read', 'meals:write', 'cooking:write'],
  }
  const items = await t.run((ctx) =>
    ctx.db
      .query('mealItems')
      .withIndex('by_householdId_and_mealId', (q) =>
        q.eq('householdId', owner.householdId).eq('mealId', mealId),
      )
      .take(3),
  )
  return { t, personId, mealId, owner, user, items }
}

async function pumpkinFixture() {
  const state = await fixture()
  const cookSessionId = await asTestUser(state.t).mutation(
    api.nutrition.createCookSession,
    { cookedAt: 1, cookedOn: '2026-10-31', label: 'Pumpkin' },
  )
  const result = await asTestUser(state.t).mutation(
    api.nutrition.createCookedFood,
    {
      cookSessionId,
      name: 'Baked pumpkin',
      finishedWeightGrams: 1250,
      notes: 'Private batch note',
      ingredients: [
        {
          sourceType: 'custom',
          name: 'Raw pumpkin',
          kcalPer100: 45,
          kcalBasisUnit: 'g',
          ignoreCalories: false,
          referenceAmount: 2072,
          referenceUnit: 'g',
          countedAmount: 2072,
          notes: 'Private source ingredient note',
          nutritionProvenance: {
            source: 'Pumpkin estimate',
            assumptions: 'Raw edible pumpkin estimated at 45 kcal/100 g.',
          },
        },
      ],
    },
  )
  return { ...state, cookSessionId, ...result }
}

describe('MCP reusable food snapshots', () => {
  it('saves the supplied 14 kcal value once and reuses it without inventing an estimate', async () => {
    const { t, user, owner, mealId, items } = await fixture()
    const args = {
      user,
      mealId,
      itemId: items[0]._id,
      operationKey: 'save-vitamins',
    }
    const saved = await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, args)
    expect(
      await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, args),
    ).toEqual(saved)
    const records = await t.run((ctx) => ctx.db.query('mcpSavedFoods').take(10))
    expect(records).toHaveLength(1)
    expect(records[0].nutrition).toEqual({
      kind: 'fixedCalories',
      calories: 14,
    })
    expect(records[0].nutritionProvenance).toBeUndefined()
    expect(JSON.stringify(records)).not.toContain('Private')

    await t.run((ctx) => ctx.db.patch(items[0]._id, { caloriesSnapshot: 30 }))
    const resolved = await t.run((ctx) =>
      resolveSavedMealItem(ctx, owner, {
        sourceType: 'savedFood',
        savedFoodId: saved.foodId,
        portion: { servings: 1 },
      }),
    )
    expect(resolved.input).toMatchObject({
      sourceType: 'fixedCalories',
      name: 'Gummy vitamins',
      calories: 14,
    })
    expect(resolved.input.nutritionProvenance).toBeUndefined()
    await expect(
      t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
        ...args,
        name: 'Changed input',
      }),
    ).rejects.toThrow('different inputs')
  })

  it('keeps weighted nutrition and its provenance while rejecting wrong portions and stale snapshots', async () => {
    const { t, user, owner, mealId, items } = await fixture()
    const saved = await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
      user,
      mealId,
      itemId: items[1]._id,
      operationKey: 'save-bread',
    })
    const item = {
      sourceType: 'savedFood' as const,
      savedFoodId: saved.foodId,
      portion: { grams: 71 },
      nutritionProvenance: {
        source: 'Portion estimate',
        assumptions: 'The uneaten slice was approximately 25 g.',
      },
    }
    const resolved = await t.run((ctx) =>
      resolveSavedMealItem(ctx, owner, item),
    )
    expect(resolved.input).toMatchObject({
      sourceType: 'customByWeight',
      kcalPer100: 268,
      consumedWeightGrams: 71,
    })
    expect(resolved.input.nutritionProvenance?.assumptions).toContain(
      '268 kcal per 100 g from the supplied label.',
    )
    expect(resolved.input.nutritionProvenance?.assumptions).toContain(
      'approximately 25 g',
    )
    await expect(
      t.run((ctx) =>
        resolveSavedMealItem(ctx, owner, {
          ...item,
          portion: { servings: 1 },
        }),
      ),
    ).rejects.toThrow('grams')
    await t.run((ctx) =>
      ctx.db.patch(saved.foodId, {
        nutrition: { kind: 'byWeight', kcalPer100: 300, ignoreCalories: false },
      }),
    )
    await expect(
      t.run((ctx) =>
        resolveSavedMealItem(ctx, owner, {
          ...item,
          expectedSnapshot: resolved.expectedSnapshot,
        }),
      ),
    ).rejects.toThrow('changed since preview')
  })

  it('checks the source meal, exact item relationship, household, and scopes', async () => {
    const { t, user, mealId, items, owner } = await fixture()
    const args = {
      user,
      mealId,
      itemId: items[0]._id,
      operationKey: 'source-checks',
    }
    await expect(
      t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
        ...args,
        user: { ...user, scopes: ['nutrition:read'] },
      }),
    ).rejects.toThrow('permission')
    const foreignPerson = await insertPerson(t, {
      ownerTokenIdentifier: 'other-account',
    })
    const foreignMeal = await asTestUserWithToken(t, 'other-account').mutation(
      api.nutrition.createMeal,
      {
        personId: foreignPerson,
        eatenOn: '2026-11-01',
        items: [{ sourceType: 'fixedCalories', name: 'Other', calories: 20 }],
      },
    )
    await expect(
      t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
        ...args,
        mealId: foreignMeal,
      }),
    ).rejects.toThrow('Meal not found')
    const otherMeal = await asTestUser(t).mutation(api.nutrition.createMeal, {
      personId: (await t.run((ctx) => ctx.db.get(mealId)))!.personId,
      eatenOn: '2026-11-01',
      items: [{ sourceType: 'fixedCalories', name: 'Other', calories: 20 }],
    })
    await expect(
      t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
        ...args,
        mealId: otherMeal,
      }),
    ).rejects.toThrow('not found in this meal')
    const saved = await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, args)
    await expect(
      t.run((ctx) =>
        resolveSavedMealItem(
          ctx,
          { ...owner, householdId: testHouseholdId(t, 'other-account') },
          {
            sourceType: 'savedFood',
            savedFoodId: saved.foodId,
            portion: { servings: 1 },
          },
        ),
      ),
    ).rejects.toThrow('Saved food not found')
    await t.run((ctx) => ctx.db.patch(mealId, { archived: true }))
    await expect(
      t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
        ...args,
        operationKey: 'archived-source',
      }),
    ).rejects.toThrow('archived')
  })
})

describe('MCP cooked batches used in cooking', () => {
  it('uses cooked pumpkin nutrition and keeps historical composition without private source notes', async () => {
    const { t, owner, cookedFoodId } = await pumpkinFixture()
    const resolved = await t.run((ctx) =>
      resolveCookedIngredient(ctx, owner, {
        sourceType: 'cookedFood',
        cookedFoodId,
        consumedWeightGrams: 365,
      }),
    )
    expect(resolved.input).toMatchObject({
      sourceType: 'custom',
      name: 'Baked pumpkin',
      kcalPer100: 75,
      referenceAmount: 365,
      referenceUnit: 'g',
      countedAmount: 365,
    })
    expect(resolved.input.notes).toContain('finished 1250 g')
    expect(resolved.input.notes).toContain('Raw pumpkin: 2072 g')
    expect(resolved.input.notes).toContain('45 kcal/100 g')
    expect(resolved.input.notes).not.toContain('Private')
    expect(resolved.input.nutritionProvenance?.assumptions).toContain(
      '45 kcal/100 g',
    )
    const snapshot = { ...resolved.input }
    await t.run((ctx) => ctx.db.patch(cookedFoodId, { kcalPer100: 90 }))
    expect(snapshot.kcalPer100).toBe(75)
    await expect(
      t.run((ctx) =>
        resolveCookedIngredient(ctx, owner, {
          sourceType: 'cookedFood',
          cookedFoodId,
          consumedWeightGrams: 365,
          expectedSnapshot: resolved.expectedSnapshot,
          expectedEditRevision: resolved.expectedEditRevision,
        }),
      ),
    ).rejects.toThrow('changed since preview')
  })

  it('rejects changed composition revisions, archived batches and sessions, and foreign batches', async () => {
    const { t, owner, cookedFoodId, cookSessionId } = await pumpkinFixture()
    const item = {
      sourceType: 'cookedFood' as const,
      cookedFoodId,
      consumedWeightGrams: 100,
    }
    await t.run((ctx) => ctx.db.patch(cookedFoodId, { editRevision: 1 }))
    await expect(
      t.run((ctx) =>
        resolveCookedIngredient(ctx, owner, {
          ...item,
          expectedEditRevision: 0,
        }),
      ),
    ).rejects.toThrow('changed since editing began')
    await t.run((ctx) => ctx.db.patch(cookedFoodId, { archived: true }))
    await expect(
      t.run((ctx) => resolveCookedIngredient(ctx, owner, item)),
    ).rejects.toThrow('archived')
    await t.run(async (ctx) => {
      await ctx.db.patch(cookedFoodId, { archived: false })
      await ctx.db.patch(cookSessionId, { archived: true })
    })
    await expect(
      t.run((ctx) => resolveCookedIngredient(ctx, owner, item)),
    ).rejects.toThrow('session is archived')
    await asTestUserWithToken(t, 'other-account').mutation(
      api.households.ensurePersonal,
      {},
    )
    await expect(
      t.run((ctx) =>
        resolveCookedIngredient(
          ctx,
          { ...owner, householdId: testHouseholdId(t, 'other-account') },
          item,
        ),
      ),
    ).rejects.toThrow('Cooked food not found')
  })

  it('rejects composition too large to preserve instead of silently truncating history', async () => {
    const { t, owner, cookedFoodId } = await pumpkinFixture()
    await t.run(async (ctx) => {
      for (let index = 0; index < 20; index++) {
        await ctx.db.insert('cookedFoodIngredients', {
          ...owner,
          cookedFoodId,
          sourceType: 'custom',
          ingredientNameSnapshot: `Ingredient ${index} ${'long name '.repeat(9)}`,
          referenceAmount: 100,
          referenceUnit: 'g',
          countedAmount: 100,
          ingredientKcalPer100Snapshot: 100,
          ingredientKcalBasisUnitSnapshot: 'g',
          ignoreCaloriesSnapshot: false,
          ingredientCaloriesSnapshot: 100,
        })
      }
    })
    await expect(
      t.run((ctx) =>
        resolveCookedIngredient(ctx, owner, {
          sourceType: 'cookedFood',
          cookedFoodId,
          consumedWeightGrams: 100,
        }),
      ),
    ).rejects.toThrow('cannot exceed 2000 characters')
  })

  it('checks household scope again when following historical source ingredients', async () => {
    const { t, owner, cookedFoodId } = await pumpkinFixture()
    const foreignIngredient = await insertIngredient(t, {
      ownerTokenIdentifier: 'other-account',
    })
    await asTestUserWithToken(t, 'other-account').mutation(
      api.households.ensurePersonal,
      {},
    )
    await t.run(async (ctx) => {
      const ingredient = await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_householdId_and_cookedFoodId', (q) =>
          q
            .eq('householdId', owner.householdId)
            .eq('cookedFoodId', cookedFoodId),
        )
        .first()
      if (!ingredient) throw new Error('Expected pumpkin source ingredient.')
      await ctx.db.patch(ingredient._id, { ingredientId: foreignIngredient })
    })
    await expect(
      t.run((ctx) =>
        resolveCookedIngredient(ctx, owner, {
          sourceType: 'cookedFood',
          cookedFoodId,
          consumedWeightGrams: 100,
        }),
      ),
    ).rejects.toThrow('Cooked source ingredient not found')
  })
})
