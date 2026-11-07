// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  TEST_TOKEN_IDENTIFIER,
  testHouseholdId,
} from '../src/tests/convex-test-utils'

vi.hoisted(() => {
  process.env.MCP_CONSENT_URL = 'https://app.example.test/connect'
})

const label = {
  kind: 'provided' as const,
  origin: 'label' as const,
  source: 'User packaging',
  assumptions: 'Values transcribed from the supplied product label.',
  verifiedOn: '2026-11-01',
}

async function fixture() {
  const t = createConvexTest()
  rateLimiterTest.register(t)
  const account = asTestUser(t)
  const personId = await account.mutation(api.nutrition.createPerson, {
    name: 'Alex',
    currentDailyGoalKcal: 2000,
    effectiveDate: '2026-11-01',
  })
  const ingredientId = await account.mutation(api.nutrition.createIngredient, {
    name: 'Whole milk',
    brand: 'Brand A',
    variant: '3.5%',
    kcalPer100: 64,
    ignoreCalories: false,
    nutritionProvenance: label,
  })
  const mealId = await account.mutation(api.nutrition.createMeal, {
    personId,
    eatenOn: '2026-11-01',
    name: 'Afternoon snack',
    notes: 'Private meal notes',
    items: [
      {
        sourceType: 'ingredient',
        ingredientId,
        expectedSnapshot: {
          name: 'Whole milk',
          kcalPer100: 64,
          kcalBasisUnit: 'g',
          ignoreCalories: false,
        },
        consumedWeightGrams: 245,
        notes: 'Private item notes',
      },
      {
        sourceType: 'customByWeight',
        name: 'Chai latte powder',
        kcalPer100: 464,
        ignoreCalories: false,
        consumedWeightGrams: 7,
        nutritionProvenance: {
          ...label,
          kind: 'estimate',
          origin: 'generic',
          assumptions: 'Generic powder estimate.',
        },
        foodIdentity: { basis: 'g', brand: 'Tea Brand' },
      },
      {
        sourceType: 'fixedCalories',
        name: 'Cookie',
        calories: 200,
        servingCount: 2,
        foodIdentity: {
          basis: 'serving',
          brand: 'Cookie Brand',
          servingLabel: 'cookie',
        },
        nutritionProvenance: label,
      },
    ],
  })
  const detail = await account.query(api.meals.getDetail, { mealId })
  if (!detail) throw new Error('Missing fixture meal')
  const user = {
    userId: TEST_TOKEN_IDENTIFIER,
    connectionId: 'reuse-workflows',
    scopes: ['nutrition:read', 'meals:write'],
  }
  return {
    t,
    account,
    personId,
    ingredientId,
    mealId,
    user,
    items: detail.items,
  }
}

describe('review regressions', () => {
  it.each(['portion', 'customNutrition', 'calorieOnly', 'app'] as const)(
    'keeps weighted serving evidence consistent through %s corrections',
    async (mode) => {
      const { t, account, user, personId } = await fixture()
      const original = {
        sourceType: 'customByWeight' as const,
        name: 'Protein powder',
        kcalPer100: 380,
        ignoreCalories: false,
        consumedWeightGrams: 30,
      }
      const mealId = await account.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-11-02',
        items: [{ ...original, servingCount: 1 }, original],
      })
      const before = await t.mutation(internal.mcpMealCorrections.getMeal, {
        user,
        mealId,
      })
      const grams = mode === 'calorieOnly' ? 30 : 60
      const kcalPer100 =
        mode === 'customNutrition' || mode === 'calorieOnly' ? 400 : 380
      const calories = (grams * kcalPer100) / 100
      if (mode === 'app') {
        await account.mutation(api.nutrition.updateMeal, {
          mealId,
          expectedEditRevision: before.editRevision,
          expectedMealItemIds: before.items.map((item) => item.id),
          personId,
          eatenOn: '2026-11-02',
          items: before.items.map((item) => ({
            ...original,
            existingMealItemId: item.id,
            consumedWeightGrams: grams,
          })),
        })
      } else {
        const preview = await t.mutation(
          internal.mcpMealCorrections.previewMealCorrection,
          {
            user,
            input: {
              mealId,
              expectedEditRevision: before.editRevision,
              itemChanges: before.items.map((item) =>
                mode === 'portion'
                  ? {
                      kind: 'portion' as const,
                      itemId: item.id,
                      consumedWeightGrams: grams,
                    }
                  : {
                      kind: 'customNutrition' as const,
                      itemId: item.id,
                      kcalPer100,
                      ...(mode === 'customNutrition'
                        ? { consumedWeightGrams: grams }
                        : {}),
                    },
              ),
            },
          },
        )
        expect(preview.after.items[0].servingCount).toBe(grams / 30)
        expect(preview.after.items[1].servingCount).toBeUndefined()
        await t.mutation(internal.mcpMealCorrections.correctMeal, {
          user,
          input: preview.input,
          operationKey: `weighted-correction-${mode}`,
        })
      }
      const after = await t.mutation(internal.mcpMealCorrections.getMeal, {
        user,
        mealId,
      })
      expect(after.items[0]).toMatchObject({
        consumedWeightGrams: grams,
        servingCount: grams / 30,
        calories,
      })
      expect(after.items[1].servingCount).toBeUndefined()
      const day = await account.query(api.meals.getDaySummary, {
        personId,
        eatenOn: '2026-11-02',
      })
      expect(day?.consumedCalories).toBe(calories * 2)
    },
  )

  it('scales weighted template serving counts together with grams and calories', async () => {
    const { t, account, user, personId } = await fixture()
    const mealId = await account.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-01',
      items: [
        {
          sourceType: 'customByWeight',
          name: 'Protein powder',
          kcalPer100: 380,
          ignoreCalories: false,
          consumedWeightGrams: 30,
          servingCount: 1,
        },
      ],
    })
    const template = await t.mutation(
      internal.mcpFoodReuse.manageMealTemplate,
      {
        user,
        input: { action: 'save', mealId, name: 'Protein shake' },
        operationKey: 'weighted-template',
      },
    )
    const preview = await t.mutation(
      internal.mcpFoodReuse.previewMealTemplate,
      {
        user,
        templateId: template.templateId,
        personId,
        eatenOn: '2026-11-02',
        multiplier: 2,
      },
    )
    expect(preview.input.items[0]).toMatchObject({
      consumedWeightGrams: 60,
      servingCount: 2,
    })
    expect(preview.totalCalories).toBe(228)
    const saved = await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input: preview.input,
      operationKey: 'approved-weighted-template',
    })
    const meal = await account.query(api.meals.getDetail, {
      mealId: saved.mealId,
    })
    expect(meal?.items[0]).toMatchObject({
      consumedWeightGrams: 60,
      servingCount: 2,
      caloriesSnapshot: 228,
    })
  })

  it('corrects a fixed portion count explicitly and keeps reusable per-serving calories accurate', async () => {
    const { t, user, personId, mealId, items } = await fixture()
    const calorieOnly = await t.mutation(
      internal.mcpMealCorrections.previewMealCorrection,
      {
        user,
        input: {
          mealId,
          expectedEditRevision: 0,
          itemChanges: [
            { kind: 'fixedCalories', itemId: items[2]._id, calories: 180 },
          ],
        },
      },
    )
    expect(calorieOnly.after.items[2].servingCount).toBe(2)
    const input = {
      mealId,
      expectedEditRevision: 0,
      itemChanges: [
        {
          kind: 'fixedCalories' as const,
          itemId: items[2]._id,
          calories: 100,
          servingCount: 1,
        },
      ],
    }
    const preview = await t.mutation(
      internal.mcpMealCorrections.previewMealCorrection,
      { user, input },
    )
    expect(preview.after.items[2]).toMatchObject({
      calories: 100,
      servingCount: 1,
    })
    await expect(
      t.mutation(internal.mcpMealCorrections.previewMealCorrection, {
        user,
        input: {
          ...input,
          itemChanges: [{ ...input.itemChanges[0], servingCount: 0 }],
        },
      }),
    ).rejects.toThrow('greater than 0')
    const corrected = await t.mutation(
      internal.mcpMealCorrections.correctMeal,
      { user, input: preview.input, operationKey: 'one-cookie-correction' },
    )
    expect(corrected.dailySummary?.consumedCalories).toBeCloseTo(289.28)
    const detail = await t.mutation(internal.mcpMealCorrections.getMeal, {
      user,
      mealId,
    })
    const cookie = detail.items[2]
    expect(cookie).toMatchObject({ calories: 100, servingCount: 1 })
    const saved = await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
      user,
      mealId,
      itemId: cookie.id,
      operationKey: 'corrected-cookie',
    })
    expect((await t.run((ctx) => ctx.db.get(saved.foodId)))?.nutrition).toEqual(
      { kind: 'fixedCalories', calories: 100 },
    )
    const repeated = await t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
      user,
      input: {
        mealId,
        personId,
        eatenOn: '2026-11-02',
        selections: [{ itemId: cookie.id, multiplier: 2 }],
      },
    })
    expect(repeated.totalCalories).toBe(200)
    const reused = await t.mutation(internal.mcpOperations.previewMeal, {
      user,
      input: {
        personId,
        eatenOn: '2026-11-02',
        items: [
          {
            sourceType: 'savedFood',
            savedFoodId: saved.foodId,
            portion: { servings: 2 },
          },
        ],
      },
    })
    expect(reused.totalCalories).toBe(200)
  })

  it('keeps estimated ingredient nutrition when the consumed portion is measured', async () => {
    const { t, account, user, personId } = await fixture()
    const ingredientId = await account.mutation(
      api.nutrition.createIngredient,
      {
        name: 'Estimated rice',
        kcalPer100: 130,
        ignoreCalories: false,
        nutritionProvenance: {
          kind: 'estimate',
          source: 'Generic rice nutrition',
          assumptions: 'Estimated cooked rice calories.',
        },
      },
    )
    const preview = await t.mutation(internal.mcpOperations.previewMeal, {
      user,
      input: {
        personId,
        eatenOn: '2026-11-02',
        items: [
          {
            sourceType: 'ingredient',
            ingredientId,
            consumedWeightGrams: 100,
            nutritionProvenance: {
              kind: 'provided',
              source: 'Kitchen scale',
              assumptions: 'Measured 100 g portion.',
            },
          },
        ],
      },
    })
    const evidence = preview.items[0].nutritionProvenance
    expect(evidence?.kind).toBe('estimate')
    expect(evidence?.assumptions).toContain('Estimated cooked rice calories.')
    expect(evidence?.assumptions).toContain('Measured 100 g portion.')
    const saved = await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input: preview.input,
      operationKey: 'measured-estimate',
    })
    const meal = await t.mutation(internal.mcpMealCorrections.getMeal, {
      user,
      mealId: saved.mealId,
    })
    expect(meal.items[0].nutritionProvenance).toEqual(evidence)
    const repeat = await t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
      user,
      input: { mealId: saved.mealId, personId, eatenOn: '2026-11-03' },
    })
    expect(repeat.items[0].nutritionProvenance).toEqual(evidence)
    const template = await t.mutation(
      internal.mcpFoodReuse.manageMealTemplate,
      {
        user,
        input: { action: 'save', mealId: saved.mealId, name: 'Measured rice' },
        operationKey: 'measured-template',
      },
    )
    const templatePreview = await t.mutation(
      internal.mcpFoodReuse.previewMealTemplate,
      {
        user,
        templateId: template.templateId,
        personId,
        eatenOn: '2026-11-03',
      },
    )
    expect(templatePreview.items[0].nutritionProvenance).toEqual(evidence)
  })

  it('browses a known date directly despite multiple pages of newer meals', async () => {
    const { t, account, user, personId, mealId } = await fixture()
    for (let day = 2; day <= 7; day++)
      await account.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: `2026-11-0${day}`,
        items: [
          { sourceType: 'fixedCalories', name: 'Newer meal', calories: 1 },
        ],
      })
    for (const person of [undefined, personId]) {
      const result = await t.mutation(internal.mcpFoodReuse.searchMealHistory, {
        user,
        search: '',
        eatenOn: '2026-11-01',
        personId: person,
        limit: 2,
      })
      expect(result.matches.map((match) => match.mealId)).toEqual([mealId])
      expect(result.cursor).toBeNull()
    }
  })
})

describe('historical meal discovery and repeats', () => {
  it('lists meals larger than the reuse limit partially instead of failing the page', async () => {
    const { t, account, user, personId } = await fixture()
    const bigMealId = await account.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-05',
      name: 'Party platter',
      items: Array.from({ length: 31 }, (_, index) => ({
        sourceType: 'fixedCalories' as const,
        name: `Bite ${index + 1}`,
        calories: 10,
      })),
    })
    const result = await t.mutation(internal.mcpFoodReuse.searchMealHistory, {
      user,
      search: '',
      personId,
    })
    const big = result.matches.find((match) => match.mealId === bigMealId)
    expect(big).toMatchObject({ totalCalories: 310, omittedItemCount: 1 })
    expect(big?.items).toHaveLength(30)
    await expect(
      t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
        user,
        input: { mealId: bigMealId, personId, eatenOn: '2026-11-06' },
      }),
    ).rejects.toThrow(
      'Historical meal items cannot contain more than 30 items.',
    )
  })

  it('finds individual food names within differently named meals and paginates meal-name hits', async () => {
    const { t, user, mealId, personId } = await fixture()
    const result = await t.mutation(internal.mcpFoodReuse.searchMealHistory, {
      user,
      search: 'chai lat',
      personId,
    })
    expect(result.matches).toMatchObject([
      {
        kind: 'mealItem',
        mealId,
        eatenOn: '2026-11-01',
        name: 'Afternoon snack',
        items: [
          {
            name: 'Chai latte powder',
            consumedWeightGrams: 7,
            kcalPer100: 464,
            calories: 32.48,
            nutritionProvenance: { kind: 'estimate' },
          },
        ],
      },
    ])
    expect(JSON.stringify(result)).not.toContain('Private')
    const byName = await t.mutation(internal.mcpFoodReuse.searchMealHistory, {
      user,
      search: 'Afternoon',
    })
    expect(byName.cursor).not.toBeNull()
    const next = await t.mutation(internal.mcpFoodReuse.searchMealHistory, {
      user,
      search: 'Afternoon',
      cursor: byName.cursor!,
    })
    expect(next.matches).toMatchObject([
      {
        kind: 'meal',
        mealId,
        items: [
          { foodIdentity: { brand: 'Brand A' } },
          {},
          { servingCount: 2 },
        ],
      },
    ])
    expect(next.cursor).toBeNull()
    await expect(
      t.mutation(internal.mcpFoodReuse.searchMealHistory, {
        user,
        search: 'different',
        cursor: byName.cursor!,
      }),
    ).rejects.toThrow('Invalid history cursor')
  })

  it('bounds pages, isolates people, excludes archived meals, and checks foreign scopes', async () => {
    const { t, account, user, personId, mealId } = await fixture()
    const otherPerson = await account.mutation(api.nutrition.createPerson, {
      name: 'Other',
      currentDailyGoalKcal: 1800,
      effectiveDate: '2026-11-01',
    })
    for (let i = 0; i < 5; i++)
      await account.mutation(api.nutrition.createMeal, {
        personId: otherPerson,
        eatenOn: `2026-11-0${i + 1}`,
        items: [
          { sourceType: 'fixedCalories', name: 'Chai latte', calories: 1 },
        ],
      })
    let cursor: string | undefined
    const found = new Set<string>()
    for (let page = 0; page < 10; page++) {
      const result = await t.mutation(internal.mcpFoodReuse.searchMealHistory, {
        user,
        search: 'Chai',
        personId,
        limit: 2,
        cursor,
      })
      expect(result.matches.length).toBeLessThanOrEqual(2)
      result.matches.forEach((match) => {
        expect(match.personId).toBe(personId)
        found.add(match.mealId)
      })
      if (!result.cursor) break
      cursor = result.cursor
    }
    expect([...found]).toEqual([mealId])
    const foreign = asTestUserWithToken(t, 'foreign')
    const foreignPerson = await foreign.mutation(api.nutrition.createPerson, {
      name: 'Private',
      currentDailyGoalKcal: 2000,
      effectiveDate: '2026-11-01',
    })
    await expect(
      t.mutation(internal.mcpFoodReuse.searchMealHistory, {
        user,
        search: 'Chai',
        personId: foreignPerson,
      }),
    ).rejects.toThrow('Person not found')
    await expect(
      t.mutation(internal.mcpFoodReuse.searchMealHistory, {
        user,
        search: '',
        householdId: testHouseholdId(t, 'foreign'),
      }),
    ).rejects.toThrow()
    await t.run((ctx) => ctx.db.patch(mealId, { archived: true }))
    expect(
      (
        await t.mutation(internal.mcpFoodReuse.searchMealHistory, {
          user,
          search: 'Chai',
          personId,
        })
      ).matches,
    ).toEqual([])
    await expect(
      t.mutation(internal.mcpFoodReuse.searchMealHistory, {
        user: { ...user, scopes: [] },
        search: 'Chai',
      }),
    ).rejects.toThrow()
  })

  it('refuses a repeat preview after its source meal was edited, even with stable item IDs', async () => {
    const { t, account, user, personId, mealId } = await fixture()
    const detail = (await account.query(api.meals.getDetail, { mealId }))!
    const cookie = detail.items.find((item) => item.nameSnapshot === 'Cookie')!
    const preview = await t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
      user,
      input: {
        mealId,
        personId,
        eatenOn: '2026-11-02',
        selections: [{ itemId: cookie._id, multiplier: 1 }],
      },
    })
    expect(preview.totalCalories).toBe(200)
    await account.mutation(api.nutrition.updateMeal, {
      mealId,
      expectedMealItemIds: detail.items.map((item) => item._id),
      expectedEditRevision: detail.meal.editRevision,
      personId,
      eatenOn: detail.meal.eatenOn,
      items: [
        {
          existingMealItemId: cookie._id,
          sourceType: 'fixedCalories',
          name: 'Cookie',
          calories: 400,
        },
      ],
    })
    await expect(
      t.mutation(internal.mcpOperations.logMeal, {
        user,
        input: preview.input,
        operationKey: 'stale-repeat',
      }),
    ).rejects.toThrow('Meal changed since editing began')
  })

  it('repeats exact snapshots despite catalog edits and saves only on the explicit write, once per key', async () => {
    const { t, account, user, personId, mealId, ingredientId, items } =
      await fixture()
    await account.mutation(api.nutrition.updateIngredient, {
      ingredientId,
      expectedEditRevision: 0,
      name: 'Changed milk',
      brand: 'Brand B',
      kcalPer100: 100,
      ignoreCalories: false,
    })
    const before = await account.query(api.meals.getDetail, { mealId })
    const preview = await t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
      user,
      input: { mealId, personId, eatenOn: '2026-11-02' },
    })
    expect(preview.totalCalories).toBeCloseTo(389.28)
    expect(preview.items[0]).toMatchObject({
      name: 'Whole milk',
      calories: 156.8,
      nutritionProvenance: label,
    })
    expect(preview.items[1].nutritionProvenance?.kind).toBe('estimate')
    expect(preview.projectedDailySummary?.consumedCalories).toBeCloseTo(389.28)
    expect((await t.run((ctx) => ctx.db.query('meals').take(10))).length).toBe(
      1,
    )
    expect(
      await t.run((ctx) => ctx.db.query('mcpSavedFoods').take(10)),
    ).toEqual([])
    expect(
      await t.run((ctx) => ctx.db.query('mealTemplates').take(10)),
    ).toEqual([])
    const save = { user, input: preview.input, operationKey: 'approved-repeat' }
    const result = await t.mutation(internal.mcpOperations.logMeal, save)
    expect(await t.mutation(internal.mcpOperations.logMeal, save)).toEqual(
      result,
    )
    expect(result.dailySummary).toMatchObject({
      mealCount: 1,
      eatenOn: '2026-11-02',
    })
    expect(result.dailySummary?.consumedCalories).toBeCloseTo(389.28)
    expect(await account.query(api.meals.getDetail, { mealId })).toEqual(before)
    const repeated = await account.query(api.meals.getDetail, {
      mealId: result.mealId,
    })
    expect(repeated?.items.map((item) => item.caloriesSnapshot)).toEqual(
      items.map((item) => item.caloriesSnapshot),
    )
    expect(repeated?.items[0].foodIdentity).toEqual({
      basis: 'g',
      brand: 'Brand A',
      variant: '3.5%',
    })
    expect(JSON.stringify(repeated)).not.toContain('Private')
    await expect(
      t.mutation(internal.mcpOperations.logMeal, {
        ...save,
        input: { ...preview.input, eatenOn: '2026-11-03' },
      }),
    ).rejects.toThrow('different inputs')
  })

  it('resizes weighted portions, repeats one item, removes others, and accepts additions', async () => {
    const { t, user, mealId, personId, items } = await fixture()
    const weighted = await t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
      user,
      input: {
        mealId,
        personId,
        eatenOn: '2026-11-02',
        selections: [{ itemId: items[0]._id, multiplier: 2 }],
        additions: [
          { sourceType: 'fixedCalories', name: 'Extra', calories: 10 },
        ],
      },
    })
    expect(weighted.totalCalories).toBeCloseTo(323.6)
    expect(weighted.items.map((item) => item.name)).toEqual([
      'Whole milk',
      'Extra',
    ])
    const cookie = await t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
      user,
      input: {
        mealId,
        personId,
        eatenOn: '2026-11-02',
        selections: [{ itemId: items[2]._id, multiplier: 0.5 }],
      },
    })
    expect(cookie.totalCalories).toBe(100)
    const saved = await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input: cookie.input,
      operationKey: 'one-cookie',
    })
    expect(
      (
        await t.mutation(internal.mcpMealCorrections.getMeal, {
          user,
          mealId: saved.mealId,
        })
      ).items,
    ).toMatchObject([{ servingCount: 1, calories: 100 }])
    await expect(
      t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
        user,
        input: {
          mealId,
          personId,
          eatenOn: '2026-11-02',
          selections: [{ itemId: items[0]._id, multiplier: 0 }],
        },
      }),
    ).rejects.toThrow('greater than 0')
  })
})

describe('branded products and fixed servings', () => {
  it('finds an active product even when many identical archived versions precede it', async () => {
    const { t, user, mealId, items } = await fixture()
    const args = {
      user,
      mealId,
      itemId: items[2]._id,
      operationKey: 'first-cookie',
    }
    const saved = await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, args)
    const activeId = await t.run(async (ctx) => {
      const original = await ctx.db.get(saved.foodId)
      if (!original) throw new Error('Missing saved product')
      const { _id, _creationTime, ...fields } = original
      void [_id, _creationTime]
      await ctx.db.patch(saved.foodId, { archived: true, archivedAt: 1 })
      for (let i = 0; i < 21; i++)
        await ctx.db.insert('mcpSavedFoods', {
          ...fields,
          archived: true,
          archivedAt: 1,
        })
      return ctx.db.insert('mcpSavedFoods', fields)
    })
    const result = await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
      ...args,
      operationKey: 'same-product',
    })
    expect(result.foodId).toBe(activeId)
  })

  it('normalizes a two-cookie source, prevents duplicate products across keys, and preserves historical sources', async () => {
    const { t, user, mealId, personId, items } = await fixture()
    const args = { user, mealId, itemId: items[2]._id, operationKey: 'cookie' }
    const food = await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, args)
    expect(
      await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
        ...args,
        operationKey: 'cookie-again',
      }),
    ).toEqual(food)
    const product = await t.run((ctx) => ctx.db.get(food.foodId))
    expect(product).toMatchObject({
      nutrition: { kind: 'fixedCalories', calories: 100 },
      foodIdentity: { brand: 'Cookie Brand', servingLabel: 'cookie' },
      nutritionProvenance: label,
    })
    const preview = await t.mutation(internal.mcpOperations.previewMeal, {
      user,
      input: {
        personId,
        eatenOn: '2026-11-02',
        items: [
          {
            sourceType: 'savedFood',
            savedFoodId: food.foodId,
            portion: { servings: 2 },
          },
        ],
      },
    })
    expect(preview.totalCalories).toBe(200)
    const saved = await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input: preview.input,
      operationKey: 'two-cookies',
    })
    expect(
      (
        await t.mutation(internal.mcpMealCorrections.getMeal, {
          user,
          mealId: saved.mealId,
        })
      ).items[0].servingCount,
    ).toBe(2)
    await expect(
      t.mutation(internal.mcpOperations.previewMeal, {
        user,
        input: {
          ...preview.input,
          items: [
            {
              sourceType: 'savedFood',
              savedFoodId: food.foodId,
              portion: { grams: 2 },
            },
          ],
        },
      }),
    ).rejects.toThrow('servings')
  })

  it('keeps same-name brands with different values separate and supports a one-off precise override', async () => {
    const { t, account, user, personId } = await fixture()
    const products: Id<'mcpSavedFoods'>[] = []
    for (const [brand, kcal] of [
      ['Brand A', 339],
      ['Brand B', 270],
    ] as const) {
      const mealId = await account.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-11-02',
        items: [
          {
            sourceType: 'customByWeight',
            name: 'Cheese',
            kcalPer100: kcal,
            ignoreCalories: false,
            consumedWeightGrams: 50,
            foodIdentity: { basis: 'g', brand },
            nutritionProvenance: label,
          },
        ],
      })
      const detail = await account.query(api.meals.getDetail, { mealId })
      const food = await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
        user,
        mealId,
        itemId: detail!.items[0]._id,
        operationKey: brand,
      })
      products.push(food.foodId)
    }
    expect(products[0]).not.toBe(products[1])
    const result = await t.mutation(internal.mcpOperations.searchFoods, {
      user,
      kind: 'savedFood',
      search: 'Cheese',
    })
    expect(
      result.foods
        .map((food) =>
          food.kind === 'savedFood' ? food.foodIdentity?.brand : undefined,
        )
        .sort(),
    ).toEqual(['Brand A', 'Brand B'])
    const override = await t.mutation(internal.mcpOperations.previewMeal, {
      user,
      input: {
        personId,
        eatenOn: '2026-11-03',
        items: [
          {
            sourceType: 'customByWeight',
            name: 'Cheese',
            kcalPer100: 270.5,
            ignoreCalories: false,
            consumedWeightGrams: 50,
            foodIdentity: { basis: 'g', brand: 'Brand B' },
            nutritionProvenance: label,
          },
        ],
      },
    })
    expect(override.totalCalories).toBe(135.25)
    await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input: override.input,
      operationKey: 'fresh-label',
    })
    expect((await t.run((ctx) => ctx.db.get(products[1])))?.nutrition).toEqual({
      kind: 'byWeight',
      kcalPer100: 270,
      ignoreCalories: false,
    })
  })

  it('stores ml as ml, without inventing a gram conversion', async () => {
    const { t, account, user, personId } = await fixture()
    const mealId = await account.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-02',
      items: [
        {
          sourceType: 'fixedCalories',
          name: 'Milk by volume',
          calories: 156.8,
          servingCount: 245,
          foodIdentity: {
            basis: 'ml',
            brand: 'Volume Brand',
            servingLabel: 'ml',
          },
          nutritionProvenance: label,
        },
      ],
    })
    const detail = await account.query(api.meals.getDetail, { mealId })
    const saved = await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
      user,
      mealId,
      itemId: detail!.items[0]._id,
      operationKey: 'milk-ml',
    })
    expect(
      (await t.run((ctx) => ctx.db.get(saved.foodId)))?.nutrition,
    ).toMatchObject({ kind: 'byVolume', kcalPer100: 64 })
    const preview = await t.mutation(internal.mcpOperations.previewMeal, {
      user,
      input: {
        personId,
        eatenOn: '2026-11-03',
        items: [
          {
            sourceType: 'savedFood',
            savedFoodId: saved.foodId,
            portion: { ml: 200 },
          },
        ],
      },
    })
    expect(preview.totalCalories).toBe(128)
    await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input: preview.input,
      operationKey: 'volume-repeat',
    })
    expect(
      (
        await t.mutation(internal.mcpFoodReuse.suggestReusableFoods, {
          user,
          mealId,
        })
      ).suggestions,
    ).toEqual([])
    await expect(
      t.mutation(internal.mcpOperations.previewMeal, {
        user,
        input: {
          ...preview.input,
          items: [
            {
              sourceType: 'savedFood',
              savedFoodId: saved.foodId,
              portion: { grams: 200 },
            },
          ],
        },
      }),
    ).rejects.toThrow('millilitres')
  })
})

describe('meal templates and suggestions', () => {
  it('creates once, freezes snapshots, edits quantities/products/name, previews, and deletes idempotently', async () => {
    const { t, account, user, mealId, personId, ingredientId } = await fixture()
    const args = {
      user,
      input: { action: 'save' as const, mealId, name: 'Usual snack' },
      operationKey: 'template',
    }
    const saved = await t.mutation(
      internal.mcpFoodReuse.manageMealTemplate,
      args,
    )
    expect(
      await t.mutation(internal.mcpFoodReuse.manageMealTemplate, {
        ...args,
        operationKey: 'template-again',
      }),
    ).toEqual(saved)
    const list = await t.mutation(internal.mcpFoodReuse.searchMealTemplates, {
      user,
      search: 'Usual',
    })
    expect(list.templates[0].ingredientIds).toEqual([ingredientId])
    await account.mutation(api.nutrition.updateIngredient, {
      ingredientId,
      expectedEditRevision: 0,
      name: 'New milk',
      kcalPer100: 99,
      ignoreCalories: false,
    })
    const preview = await t.mutation(
      internal.mcpFoodReuse.previewMealTemplate,
      {
        user,
        templateId: saved.templateId,
        personId,
        eatenOn: '2026-11-02',
        multiplier: 2,
      },
    )
    expect(preview.totalCalories).toBeCloseTo(778.56)
    expect((await t.run((ctx) => ctx.db.query('meals').take(10))).length).toBe(
      1,
    )
    const replacement = await account.mutation(api.nutrition.createIngredient, {
      name: 'Different milk',
      brand: 'Brand B',
      kcalPer100: 50,
      ignoreCalories: false,
    })
    await t.mutation(internal.mcpFoodReuse.manageMealTemplate, {
      user,
      input: {
        action: 'edit',
        templateId: saved.templateId,
        expectedEditRevision: 0,
        name: 'Lighter snack',
        items: [
          {
            sourceType: 'ingredient',
            ingredientId: replacement,
            consumedWeightGrams: 100,
          },
        ],
      },
      operationKey: 'edit-template',
    })
    const changed = await t.mutation(
      internal.mcpFoodReuse.previewMealTemplate,
      { user, templateId: saved.templateId, personId, eatenOn: '2026-11-03' },
    )
    expect(changed.totalCalories).toBe(50)
    expect(changed.input.items).toMatchObject([
      { sourceType: 'customByWeight', foodIdentity: { brand: 'Brand B' } },
    ])
    const meal = await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input: changed.input,
      operationKey: 'approved-template',
    })
    await expect(
      account.mutation(api.savedFoods.updateTemplate, {
        input: {
          action: 'edit',
          templateId: saved.templateId,
          expectedEditRevision: 0,
          name: 'Stale',
        },
      }),
    ).rejects.toThrow('changed since editing')
    const deletion = {
      user,
      input: {
        action: 'delete' as const,
        templateId: saved.templateId,
        expectedEditRevision: 1,
      },
      operationKey: 'delete-template',
    }
    expect(
      await t.mutation(internal.mcpFoodReuse.manageMealTemplate, deletion),
    ).toMatchObject({ deleted: true })
    expect(
      await t.mutation(internal.mcpFoodReuse.manageMealTemplate, deletion),
    ).toMatchObject({ deleted: true })
    expect(
      (
        await t.mutation(internal.mcpFoodReuse.searchMealTemplates, {
          user,
          search: '',
        })
      ).templates,
    ).toEqual([])
    expect(
      (await account.query(api.meals.getDetail, { mealId: meal.mealId }))?.meal
        .totalCalories,
    ).toBe(50)
  })

  it('rejects foreign repeat items, target people, templates, and stale source IDs', async () => {
    const { t, user, mealId, personId, items } = await fixture()
    const foreign = asTestUserWithToken(t, 'other')
    const foreignPerson = await foreign.mutation(api.nutrition.createPerson, {
      name: 'Other',
      currentDailyGoalKcal: 2000,
      effectiveDate: '2026-11-01',
    })
    const foreignMeal = await foreign.mutation(api.nutrition.createMeal, {
      personId: foreignPerson,
      eatenOn: '2026-11-01',
      items: [{ sourceType: 'fixedCalories', name: 'Private', calories: 1 }],
    })
    const foreignItem = (await foreign.query(api.meals.getDetail, {
      mealId: foreignMeal,
    }))!.items[0]._id
    await expect(
      t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
        user,
        input: {
          mealId,
          personId,
          eatenOn: '2026-11-02',
          selections: [{ itemId: foreignItem, multiplier: 1 }],
        },
      }),
    ).rejects.toThrow('not found in this meal')
    await expect(
      t.mutation(internal.mcpOperations.previewMeal, {
        user,
        input: {
          personId,
          eatenOn: '2026-11-02',
          items: [
            { sourceType: 'historical', itemId: foreignItem, multiplier: 1 },
          ],
        },
      }),
    ).rejects.toThrow('Meal item not found')
    await expect(
      t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
        user,
        input: { mealId, personId: foreignPerson, eatenOn: '2026-11-02' },
      }),
    ).rejects.toThrow('Person not found')
    const saved = await t.mutation(internal.mcpFoodReuse.manageMealTemplate, {
      user,
      input: { action: 'save', mealId, name: 'Private template' },
      operationKey: 'scope-template',
    })
    await expect(
      foreign.mutation(api.savedFoods.updateTemplate, {
        input: {
          action: 'delete',
          templateId: saved.templateId,
          expectedEditRevision: 0,
        },
      }),
    ).rejects.toThrow('Template not found')
    const preview = await t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
      user,
      input: { mealId, personId, eatenOn: '2026-11-02' },
    })
    await t.run((ctx) => ctx.db.delete(items[0]._id))
    await expect(
      t.mutation(internal.mcpOperations.logMeal, {
        user,
        input: preview.input,
        operationKey: 'stale-source',
      }),
    ).rejects.toThrow('Meal item not found')
  })

  it('suggests meaningful repeats without saving, skips vague names, and stops after saving', async () => {
    const { t, user, mealId, personId, items } = await fixture()
    const preview = await t.mutation(internal.mcpFoodReuse.previewRepeatMeal, {
      user,
      input: { mealId, personId, eatenOn: '2026-11-02' },
    })
    await t.mutation(internal.mcpOperations.logMeal, {
      user,
      input: preview.input,
      operationKey: 'repeated',
    })
    const suggestions = await t.mutation(
      internal.mcpFoodReuse.suggestReusableFoods,
      { user, mealId },
    )
    expect(suggestions.suggestions).toMatchObject(
      expect.arrayContaining([
        {
          mealId,
          itemId: items[2]._id,
          name: 'Cookie',
          occurrences: 2,
          foodIdentity: {
            basis: 'serving',
            brand: 'Cookie Brand',
            servingLabel: 'cookie',
          },
        },
      ]),
    )
    expect(
      await t.run((ctx) => ctx.db.query('mcpSavedFoods').take(10)),
    ).toEqual([])
    await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, {
      user,
      mealId,
      itemId: items[2]._id,
      operationKey: 'save-suggested-cookie',
    })
    expect(
      (
        await t.mutation(internal.mcpFoodReuse.suggestReusableFoods, {
          user,
          mealId,
        })
      ).suggestions.some((item) => item.name === 'Cookie'),
    ).toBe(false)
  })
})
