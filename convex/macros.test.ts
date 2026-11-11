// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertCookSession,
  insertIngredient,
  insertPerson,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

vi.hoisted(() => {
  process.env.MCP_CONSENT_URL = 'https://app.example.test/connect'
})

const snapshot = (
  name: string,
  kcalPer100: number,
  ignoreCalories = false,
) => ({
  name,
  kcalPer100,
  kcalBasisUnit: 'g' as const,
  ignoreCalories,
})
const provenance = {
  kind: 'provided' as const,
  source: 'Package label',
  assumptions: 'Per 100 g as printed.',
}
const yogurt = {
  proteinG: 10,
  carbsG: 4,
  fatG: 5,
  nutritionProvenance: provenance,
}
const oats = {
  proteinG: 13,
  carbsG: 60,
  fatG: 7,
  nutritionProvenance: provenance,
}
const mcpUser = {
  userId: TEST_TOKEN_IDENTIFIER,
  connectionId: 'test-macros',
  scopes: ['nutrition:read', 'meals:write', 'cooking:write'],
}

function setup() {
  const t = createConvexTest()
  rateLimiterTest.register(t)
  return t
}
type Test = ReturnType<typeof setup>

// The app's own queries, so their return validators must accept macros too.
const summaryFor = (t: Test, personId: Id<'people'>) =>
  asTestUser(t).query(api.meals.getDaySummary, {
    personId,
    eatenOn: '2026-11-10',
  })
const detailOf = async (t: Test, mealId: Id<'meals'>) => {
  const detail = await asTestUser(t).query(api.meals.getDetail, { mealId })
  if (!detail) throw new Error('Meal not found.')
  return detail
}

describe('macronutrients in meals and daily totals', () => {
  it('sums item macros into the meal and the day, and removes them again', async () => {
    const t = setup()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Greek yogurt',
      kcalPer100: 100,
      macros: yogurt,
    })
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-10',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: snapshot('Greek yogurt', 100),
          consumedWeightGrams: 200,
        },
        { sourceType: 'fixedCalories', name: 'Biscuit', calories: 80 },
      ],
    })
    // Only the yogurt has macros, so they cover its 200 kcal of the 280.
    const yogurtTotals = {
      proteinG: 20,
      carbsG: 8,
      fatG: 10,
      coveredCalories: 200,
    }
    const { meal, items } = await detailOf(t, mealId)
    expect(meal).toMatchObject({ totalCalories: 280, macros: yogurtTotals })
    expect(await summaryFor(t, personId)).toMatchObject({
      consumedCalories: 280,
      macros: yogurtTotals,
    })

    const yogurtItem = items.find((item) => item.sourceType === 'ingredient')
    const biscuit = items.find((item) => item.sourceType === 'fixedCalories')
    if (!yogurtItem || !biscuit) throw new Error('Items not found.')
    expect(yogurtItem.macrosSnapshot).toEqual({
      proteinG: 10,
      carbsG: 4,
      fatG: 5,
    })

    // A second meal adds its macros; the first one's portion shrinks.
    const snackId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-10',
      items: [
        {
          sourceType: 'fixedCalories',
          name: 'Protein bar',
          calories: 200,
          macros: { proteinG: 20, carbsG: 20, fatG: 6 },
        },
      ],
    })
    await user.mutation(api.nutrition.updateMeal, {
      mealId,
      expectedMealItemIds: items.map((item) => item._id),
      expectedEditRevision: 0,
      personId,
      eatenOn: '2026-11-10',
      items: [
        {
          sourceType: 'ingredient',
          existingMealItemId: yogurtItem._id,
          ingredientId,
          consumedWeightGrams: 100,
        },
        {
          sourceType: 'fixedCalories',
          existingMealItemId: biscuit._id,
          name: 'Biscuit',
          calories: 80,
        },
      ],
    })
    expect(await summaryFor(t, personId)).toMatchObject({
      consumedCalories: 380,
      macros: { proteinG: 30, carbsG: 24, fatG: 11, coveredCalories: 300 },
    })

    await user.mutation(api.nutrition.setMealArchived, {
      mealId: snackId,
      expectedEditRevision: 0,
      archived: true,
    })
    await user.mutation(api.nutrition.setMealArchived, {
      mealId,
      expectedEditRevision: 1,
      archived: true,
    })
    await user.mutation(api.nutrition.setMealArchived, {
      mealId,
      expectedEditRevision: 2,
      archived: false,
    })
    expect(await summaryFor(t, personId)).toMatchObject({
      consumedCalories: 180,
      macros: { proteinG: 10, carbsG: 4, fatG: 5, coveredCalories: 100 },
    })
  })

  it('keeps custom item macros only while their calories stay the same', async () => {
    const t = setup()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-10',
      items: [
        {
          sourceType: 'customByWeight',
          name: 'Bread',
          kcalPer100: 250,
          ignoreCalories: false,
          consumedWeightGrams: 100,
          macros: { proteinG: 9, carbsG: 45, fatG: 3 },
        },
      ],
    })
    const edit = async (revision: number, kcalPer100: number) => {
      const [item] = (await detailOf(t, mealId)).items
      await user.mutation(api.nutrition.updateMeal, {
        mealId,
        expectedMealItemIds: [item._id],
        expectedEditRevision: revision,
        personId,
        eatenOn: '2026-11-10',
        items: [
          {
            sourceType: 'customByWeight',
            existingMealItemId: item._id,
            name: 'Bread',
            kcalPer100,
            ignoreCalories: false,
            consumedWeightGrams: 150,
          },
        ],
      })
      return (await summaryFor(t, personId))?.macros
    }
    // A client that does not send macros keeps them while kcal/100 is unchanged.
    expect(await edit(0, 250)).toMatchObject({
      proteinG: 13.5,
      coveredCalories: 375,
    })
    expect(await edit(1, 260)).toBeUndefined()
  })
})

describe('macronutrients in cooked batches', () => {
  it('derives batch macros per 100 g only from fully known ingredients', async () => {
    const t = setup()
    const user = asTestUser(t)
    const cookSessionId = await insertCookSession(t)
    const oatsId = await insertIngredient(t, {
      name: 'Oats',
      kcalPer100: 380,
      macros: oats,
    })
    const waterId = await insertIngredient(t, {
      name: 'Water',
      kcalPer100: 0,
      ignoreCalories: true,
    })
    const plainId = await insertIngredient(t, {
      name: 'Honey',
      kcalPer100: 300,
    })
    const line = (
      ingredientId: Id<'ingredients'>,
      expectedSnapshot: ReturnType<typeof snapshot>,
      grams: number,
    ) => ({
      sourceType: 'ingredient' as const,
      ingredientId,
      expectedSnapshot,
      referenceAmount: grams,
      referenceUnit: 'g' as const,
      countedAmount: grams,
    })
    const { cookedFoodId } = await user.mutation(
      api.nutrition.createCookedFood,
      {
        cookSessionId,
        name: 'Porridge',
        finishedWeightGrams: 500,
        ingredients: [
          line(oatsId, snapshot('Oats', 380), 100),
          line(waterId, snapshot('Water', 0, true), 400),
        ],
      },
    )
    // 100 g of oats spread over 500 g of porridge.
    const batch = (await t.run((ctx) => ctx.db.get(cookedFoodId)))?.macros
    expect(batch?.proteinG).toBeCloseTo(2.6, 6)
    expect(batch?.carbsG).toBeCloseTo(12, 6)
    expect(batch?.fatG).toBeCloseTo(1.4, 6)
    const unknown = await user.mutation(api.nutrition.createCookedFood, {
      cookSessionId,
      name: 'Sweet porridge',
      finishedWeightGrams: 520,
      ingredients: [
        line(oatsId, snapshot('Oats', 380), 100),
        line(waterId, snapshot('Water', 0, true), 400),
        line(plainId, snapshot('Honey', 300), 20),
      ],
    })
    expect(
      (await t.run((ctx) => ctx.db.get(unknown.cookedFoodId)))?.macros,
    ).toBeUndefined()

    // Less water evaporated than assumed: same totals over more grams.
    await t.mutation(internal.mcpOperations.correctCookedFoodWeight, {
      user: mcpUser,
      input: {
        cookedFoodId,
        expectedEditRevision: 0,
        finishedWeightGrams: 650,
      },
      operationKey: 'heavier',
    })
    const corrected = await t.run((ctx) => ctx.db.get(cookedFoodId))
    expect(corrected?.macros?.proteinG).toBeCloseTo(2, 6)

    // A meal from the batch carries its macros into the day.
    const personId = await insertPerson(t)
    await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-10',
      items: [
        {
          sourceType: 'cookedFood',
          cookedFoodId,
          expectedSnapshot: snapshot('Porridge', corrected?.kcalPer100 ?? 0),
          consumedWeightGrams: 325,
        },
      ],
    })
    expect((await summaryFor(t, personId))?.macros).toMatchObject({
      proteinG: 6.5,
      coveredCalories: 190,
    })
  })
})

describe('macronutrients over MCP', () => {
  it('scales saved-food macros by portion and projects them into the day', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const sourceMealId = await asTestUser(t).mutation(
      api.nutrition.createMeal,
      {
        personId,
        eatenOn: '2026-11-09',
        items: [{ sourceType: 'fixedCalories', name: 'Bar', calories: 200 }],
      },
    )
    const savedFoodId = await t.run(async (ctx) => {
      const meal = await ctx.db.get(sourceMealId)
      const item = await ctx.db
        .query('mealItems')
        .withIndex('by_householdId_and_mealId', (q) =>
          q.eq('householdId', meal!.householdId).eq('mealId', sourceMealId),
        )
        .first()
      return await ctx.db.insert('mcpSavedFoods', {
        ownerUserId: meal!.ownerUserId,
        householdId: meal!.householdId,
        name: 'Bar',
        nutrition: { kind: 'fixedCalories', calories: 200 },
        macros: {
          proteinG: 20,
          carbsG: 20,
          fatG: 6,
          nutritionProvenance: provenance,
        },
        sourceMealId,
        sourceItemId: item!._id,
        createdAt: 0,
      })
    })
    const preview = await t.mutation(internal.mcpOperations.previewMeal, {
      user: mcpUser,
      input: {
        personId,
        eatenOn: '2026-11-10',
        items: [
          { sourceType: 'savedFood', savedFoodId, portion: { servings: 2 } },
        ],
      },
    })
    const twoBars = { proteinG: 40, carbsG: 40, fatG: 12, coveredCalories: 400 }
    expect(preview).toMatchObject({
      totalCalories: 400,
      macros: twoBars,
      projectedDailySummary: { consumedCalories: 400, macros: twoBars },
    })
    await t.mutation(internal.mcpOperations.logMeal, {
      user: mcpUser,
      input: preview.input,
      operationKey: 'two-bars',
    })
    expect(
      await t.mutation(internal.mcpOperations.getDay, {
        user: mcpUser,
        personId,
        eatenOn: '2026-11-10',
      }),
    ).toMatchObject({ consumedCalories: 400, macros: twoBars })
  })

  it('lets a correction resend macros when it changes an item’s calories', async () => {
    const t = setup()
    const personId = await insertPerson(t)
    const mealId = await asTestUser(t).mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-10',
      items: [
        {
          sourceType: 'fixedCalories',
          name: 'Protein bar',
          calories: 200,
          macros: { proteinG: 20, carbsG: 20, fatG: 6 },
        },
      ],
    })
    const correct = async (
      calories: number,
      macros: { proteinG: number; carbsG: number; fatG: number } | undefined,
    ) => {
      const meal = await t.mutation(internal.mcpMealCorrections.getMeal, {
        user: mcpUser,
        mealId,
      })
      await t.mutation(internal.mcpMealCorrections.correctMeal, {
        user: mcpUser,
        input: {
          mealId,
          expectedEditRevision: meal.editRevision,
          itemChanges: [
            {
              kind: 'fixedCalories',
              itemId: meal.items[0].id,
              calories,
              macros,
            },
          ],
        },
        operationKey: `half-${calories}`,
      })
      return meal
    }
    // The assistant sees the item's macros before correcting it.
    const before = await correct(100, { proteinG: 10, carbsG: 10, fatG: 3 })
    expect(before.items[0].macros).toEqual({
      proteinG: 20,
      carbsG: 20,
      fatG: 6,
    })
    expect((await summaryFor(t, personId))?.macros).toEqual({
      proteinG: 10,
      carbsG: 10,
      fatG: 3,
      coveredCalories: 100,
    })
    // New calories without macros cannot keep macros for the old ones.
    await correct(150, undefined)
    expect((await summaryFor(t, personId))?.macros).toBeUndefined()
  })
})

describe('macronutrients in the ingredient editor', () => {
  it('saves the grams the app shows and keeps their source while unchanged', async () => {
    const t = setup()
    const user = asTestUser(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Greek yogurt',
      kcalPer100: 100,
      macros: yogurt,
    })
    const stored = () =>
      t.run(async (ctx) => (await ctx.db.get(ingredientId))?.macros ?? null)
    const save = (
      revision: number,
      kcalPer100: number,
      macros: { proteinG: number; carbsG: number; fatG: number } | null,
    ) =>
      user.mutation(api.nutrition.updateIngredient, {
        ingredientId,
        expectedEditRevision: revision,
        name: 'Greek yogurt',
        kcalPer100,
        ignoreCalories: false,
        macros,
      })

    // A new calorie figure saved with the same grams keeps the label source.
    await save(0, 97, { proteinG: 10, carbsG: 4, fatG: 5 })
    expect(await stored()).toEqual(yogurt)
    await save(1, 97, { proteinG: 9, carbsG: 4, fatG: 5 })
    expect(await stored()).toEqual({ proteinG: 9, carbsG: 4, fatG: 5 })
    await save(2, 97, null)
    expect(await stored()).toBeNull()

    expect(
      await user.query(api.catalog.getIngredient, { ingredientId }),
    ).not.toHaveProperty('macros')
    const createdId = await user.mutation(api.nutrition.createIngredient, {
      name: 'Oats',
      kcalPer100: 380,
      ignoreCalories: false,
      macros: { proteinG: 13, carbsG: 60, fatG: 7 },
    })
    expect(
      await user.query(api.catalog.getIngredient, { ingredientId: createdId }),
    ).toMatchObject({ macros: { proteinG: 13, carbsG: 60, fatG: 7 } })
  })
})

describe('macro goals', () => {
  it('derives the protein target from the latest weigh-in, privately', async () => {
    const t = setup()
    const robi = asTestUser(t)
    const viki = asTestUserWithToken(t, 'https://clerk.example|viki')
    const householdId = await robi.mutation(api.households.ensurePersonal, {})
    const token = await robi.mutation(api.households.invite, { householdId })
    await viki.mutation(api.households.acceptInvitation, { token })
    const personId = await robi.mutation(api.nutrition.createPerson, {
      householdId,
      name: 'Robi',
      currentDailyGoalKcal: 2000,
      effectiveDate: '2026-04-04',
      linkedToMe: true,
    })
    await robi.mutation(api.weight.record, {
      householdId,
      personId,
      measuredOn: '2026-04-04',
      weightKg: 82,
    })
    const setGoals = (
      member: typeof robi,
      revision: number,
      macroGoals: { proteinGPerKg?: number; fatG?: number } | null,
    ) =>
      member.mutation(api.nutrition.updatePerson, {
        householdId,
        personId,
        expectedEditRevision: revision,
        name: 'Robi',
        effectiveDate: '2026-04-05',
        macroGoals,
      })
    await setGoals(robi, 0, { proteinGPerKg: 1.6, fatG: 70 })
    await robi.mutation(api.nutrition.createMeal, {
      householdId,
      personId,
      eatenOn: '2026-04-05',
      items: [
        {
          sourceType: 'fixedCalories',
          name: 'Skyr',
          calories: 200,
          macros: { proteinG: 41, carbsG: 8, fatG: 0.4 },
        },
      ],
    })
    const day = (member: typeof robi) =>
      member.query(api.meals.getDayNutrition, {
        householdId,
        personId,
        eatenOn: '2026-04-05',
      })

    const own = await day(robi)
    expect(own.macroTargets?.proteinG).toBeCloseTo(131.2, 6)
    expect(own.macroTargets?.fatG).toBe(70)
    expect(own.proteinPerKg).toBe(0.5)
    // The protein target in grams would give another member the weight away.
    const shared = await day(viki)
    // The goal itself stays the household's to see, as the calorie goal does.
    expect(shared.macroTargets).toEqual({ proteinGPerKg: 1.6, fatG: 70 })
    expect(shared.proteinPerKg).toBeUndefined()
    await expect(setGoals(viki, 1, { fatG: 60 })).rejects.toThrow(
      'Only the member linked to this person',
    )

    await setGoals(robi, 1, null)
    expect((await day(robi)).macroTargets).toBeUndefined()
  })
})
