// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest'
import mcpTest from '@convex-dev/mcp/test'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { checkValue } from '@convex-dev/mcp'
import type { GenericValidator, Infer } from 'convex/values'
import { api, components } from './_generated/api'
import type { Id } from './_generated/dataModel'
import {
  cookingPreview,
  cookingResult,
  foodMacrosPreview,
  foodMacrosResult,
  mealCorrectionPreview,
  mealCorrectionsBatchPreview,
  mealCorrectionsBatchResult,
  mealDetails,
  mealPreview,
  mealResult,
  templateRefreshPreview,
  templateResult,
  templateSearchResult,
} from './mcpValidators'
import {
  acceptPrivacyNotice,
  asTestUser,
  createConvexTest,
  insertIngredient,
  insertPerson,
  TEST_TOKEN_IDENTIFIER,
  testHouseholdId,
} from '../src/tests/convex-test-utils'

vi.hoisted(() => {
  process.env.MCP_CONSENT_URL = 'https://app.example.test/connect'
  process.env.CONVEX_SITE_URL = 'https://mcp.example.test'
})

function setup() {
  const t = createConvexTest()
  mcpTest.register(t)
  rateLimiterTest.register(t)
  return t
}
type Test = ReturnType<typeof setup>

async function sha256(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  )
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}
async function credential(t: Test) {
  const token = `test-${crypto.randomUUID()}`
  await acceptPrivacyNotice(t, TEST_TOKEN_IDENTIFIER)
  await t.mutation(components.mcp.grants.createApiKey, {
    userId: TEST_TOKEN_IDENTIFIER,
    name: 'Test assistant',
    scopes: ['nutrition:read', 'meals:write', 'cooking:write'],
    resource: 'https://mcp.example.test/mcp',
    hash: await sha256(token),
  })
  return token
}
async function call(t: Test, token: string, name: string, args: unknown) {
  return t.fetch('/mcp', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  })
}
async function output<V extends GenericValidator>(
  response: Response,
  validator: V,
): Promise<Infer<V>> {
  const body: unknown = await response.json()
  if (
    !body ||
    typeof body !== 'object' ||
    !('result' in body) ||
    !body.result ||
    typeof body.result !== 'object' ||
    !('structuredContent' in body.result)
  )
    throw new Error(JSON.stringify(body))
  const checked = checkValue(validator, body.result.structuredContent)
  if (!checked.ok) throw new Error(checked.error)
  return checked.value as Infer<V>
}
async function errorText(response: Response) {
  const body: unknown = await response.json()
  expect(body).toMatchObject({ result: { isError: true } })
  return JSON.stringify(body)
}

const label = {
  kind: 'provided' as const,
  origin: 'label' as const,
  source: 'Package label',
  assumptions: 'Per 100 g as printed.',
}
const oats = { proteinG: 13, carbsG: 60, fatG: 7 }
const snapshot = (name: string, kcalPer100: number) => ({
  name,
  kcalPer100,
  kcalBasisUnit: 'g' as const,
  ignoreCalories: false,
})

const read = <T extends 'meals' | 'mealItems' | 'ingredients' | 'cookedFoods'>(
  t: Test,
  id: Id<T>,
) => t.run((ctx) => ctx.db.get(id))
const daySummary = (t: Test, personId: Id<'people'>, eatenOn: string) =>
  asTestUser(t).query(api.meals.getDaySummary, { personId, eatenOn })
async function itemsOf(t: Test, mealId: Id<'meals'>) {
  const detail = await asTestUser(t).query(api.meals.getDetail, { mealId })
  if (!detail) throw new Error('Meal not found.')
  return detail.items
}
async function logOats(
  t: Test,
  personId: Id<'people'>,
  ingredientId: Id<'ingredients'>,
  eatenOn: string,
  grams: number,
  kcalPer100 = 380,
) {
  return asTestUser(t).mutation(api.nutrition.createMeal, {
    personId,
    eatenOn,
    items: [
      {
        sourceType: 'ingredient',
        ingredientId,
        expectedSnapshot: snapshot('Oats', kcalPer100),
        consumedWeightGrams: grams,
      },
    ],
  })
}

describe('cooked-batch macros', () => {
  it('derives batch macros only from complete ingredients and sets them over MCP', async () => {
    const t = setup()
    const token = await credential(t)
    const personId = await insertPerson(t)
    const beefId = await insertIngredient(t, {
      name: 'Beef',
      kcalPer100: 250,
      macros: { proteinG: 26, carbsG: 0, fatG: 15 },
    })
    const tomatoId = await insertIngredient(t, {
      name: 'Tomato',
      kcalPer100: 20,
    })
    const cooking = (ingredientIds: Array<Id<'ingredients'>>) => ({
      input: {
        session: { cookedAt: Date.UTC(2026, 10, 9), cookedOn: '2026-11-09' },
        outputs: [
          {
            name: 'Chili',
            finishedWeightGrams: 1000,
            ingredients: ingredientIds.map((ingredientId) => ({
              sourceType: 'ingredient',
              ingredientId,
              referenceAmount: 500,
              referenceUnit: 'g',
              countedAmount: 500,
            })),
          },
        ],
      },
    })
    const partial = await output(
      await call(t, token, 'preview_cooking', cooking([beefId, tomatoId])),
      cookingPreview,
    )
    expect(partial.outputs[0].macros).toBeUndefined()
    expect(partial.outputs[0].missingMacros).toEqual(['Tomato'])
    const complete = await output(
      await call(t, token, 'preview_cooking', cooking([beefId])),
      cookingPreview,
    )
    expect(complete.outputs[0]).toMatchObject({
      macros: { proteinG: 13, carbsG: 0, fatG: 7.5 },
    })
    expect(complete.outputs[0].missingMacros).toBeUndefined()

    const logged = await output(
      await call(t, token, 'log_cooking', {
        input: partial.input,
        operationKey: 'cook-chili',
      }),
      cookingResult,
    )
    const chiliId = logged.foods[0].id
    expect((await read(t, chiliId))?.macros).toBeUndefined()
    // A meal logged before the batch had macros.
    const lunchId = await asTestUser(t).mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-10',
      items: [
        {
          sourceType: 'cookedFood',
          cookedFoodId: chiliId,
          expectedSnapshot: snapshot('Chili', 135),
          consumedWeightGrams: 200,
        },
      ],
    })

    const tooRich = { proteinG: 30, carbsG: 30, fatG: 30 }
    const wrong = await output(
      await call(t, token, 'preview_food_macros', {
        input: {
          kind: 'cookedFood',
          foodId: chiliId,
          ...tooRich,
          nutritionProvenance: label,
        },
      }),
      foodMacrosPreview,
    )
    expect(wrong.warnings[0]).toContain('510 kcal')
    const preview = await output(
      await call(t, token, 'preview_food_macros', {
        input: {
          kind: 'cookedFood',
          foodId: chiliId,
          proteinG: 13,
          carbsG: 2,
          fatG: 8,
          nutritionProvenance: label,
        },
      }),
      foodMacrosPreview,
    )
    expect(preview).toMatchObject({
      food: { kind: 'cookedFood', kcal: 135, basis: 'g' },
      before: null,
      warnings: [],
    })
    await output(
      await call(t, token, 'set_food_macros', { input: preview.input }),
      foodMacrosResult,
    )
    expect((await read(t, chiliId))?.macros).toEqual({
      proteinG: 13,
      carbsG: 2,
      fatG: 8,
      nutritionProvenance: label,
    })

    // New portions carry the batch's macros; the earlier lunch can refresh.
    const dinner = await output(
      await call(t, token, 'preview_meal', {
        input: {
          personId,
          eatenOn: '2026-11-11',
          items: [
            {
              sourceType: 'cookedFood',
              cookedFoodId: chiliId,
              consumedWeightGrams: 200,
            },
          ],
        },
      }),
      mealPreview,
    )
    expect(dinner.macros).toEqual({
      proteinG: 26,
      carbsG: 4,
      fatG: 16,
      coveredCalories: 270,
    })
    // An app edit that keeps the batch's density keeps the set macros; one
    // that changes it leaves them to be set again.
    const editBatch = async (finishedWeightGrams: number) => {
      const food = await read(t, chiliId)
      const lines = await t.run((ctx) =>
        ctx.db
          .query('cookedFoodIngredients')
          .withIndex('by_householdId_and_cookedFoodId', (q) =>
            q.eq('householdId', testHouseholdId(t)).eq('cookedFoodId', chiliId),
          )
          .collect(),
      )
      await asTestUser(t).mutation(api.nutrition.updateCookedFood, {
        cookedFoodId: chiliId,
        expectedCookedFoodIngredientIds: lines.map((line) => line._id),
        expectedEditRevision: food?.editRevision ?? 0,
        cookSessionId: logged.sessionId,
        name: 'Chili',
        finishedWeightGrams,
        ingredients: lines.flatMap((line) =>
          line.sourceType === 'ingredient'
            ? [
                {
                  sourceType: 'ingredient' as const,
                  existingCookedFoodIngredientId: line._id,
                  ingredientId: line.ingredientId,
                  referenceAmount: line.referenceAmount,
                  referenceUnit: line.referenceUnit,
                  countedAmount: line.countedAmount,
                },
              ]
            : [],
        ),
      })
      return (await read(t, chiliId))?.macros
    }
    expect(await editBatch(1000)).toMatchObject({ proteinG: 13 })
    const [lunchItem] = await itemsOf(t, lunchId)
    const refresh = await output(
      await call(t, token, 'preview_meal_correction', {
        input: {
          mealId: lunchId,
          expectedEditRevision: 0,
          itemChanges: [{ kind: 'refreshFromCatalog', itemId: lunchItem._id }],
        },
      }),
      mealCorrectionPreview,
    )
    expect(refresh.after.items[0]).toMatchObject({
      calories: 270,
      macros: { proteinG: 13, carbsG: 2, fatG: 8 },
    })
    const past = await output(
      await call(t, token, 'preview_food_macros', {
        input: { ...preview.input, applyToPastMeals: true },
      }),
      foodMacrosPreview,
    )
    expect(past.pastMeals?.items).toMatchObject([
      {
        mealId: lunchId,
        consumedWeightGrams: 200,
        calories: 270,
        macros: { proteinG: 26, carbsG: 4, fatG: 16 },
      },
    ])
    expect(await editBatch(900)).toBeUndefined()
  })
})

describe('applyToPastMeals', () => {
  async function pastMealsFixture() {
    const t = setup()
    const token = await credential(t)
    const user = asTestUser(t)
    const personId = await insertPerson(t, { name: 'Alex' })
    const ingredientId = await insertIngredient(t, {
      name: 'Oats',
      kcalPer100: 360,
    })
    // Logged before the label's calories were corrected.
    const olderId = await logOats(
      t,
      personId,
      ingredientId,
      '2026-11-01',
      50,
      360,
    )
    await t.run((ctx) => ctx.db.patch(ingredientId, { kcalPer100: 380 }))
    const breakfastId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-08',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: snapshot('Oats', 380),
          consumedWeightGrams: 50,
        },
        { sourceType: 'fixedCalories', name: 'Biscuit', calories: 80 },
      ],
    })
    const porridgeId = await logOats(
      t,
      personId,
      ingredientId,
      '2026-11-09',
      100,
    )
    const ignoredId = await logOats(t, personId, ingredientId, '2026-11-09', 10)
    const [ignoredItem] = await itemsOf(t, ignoredId)
    await t.run((ctx) =>
      ctx.db.patch(ignoredItem._id, { ignoreCaloriesSnapshot: true }),
    )
    const archivedId = await logOats(
      t,
      personId,
      ingredientId,
      '2026-11-09',
      30,
    )
    await user.mutation(api.nutrition.setMealArchived, {
      mealId: archivedId,
      expectedEditRevision: 0,
      archived: true,
    })
    const coveredId = await logOats(t, personId, ingredientId, '2026-11-07', 20)
    const [coveredItem] = await itemsOf(t, coveredId)
    await t.run((ctx) =>
      ctx.db.patch(coveredItem._id, {
        macrosSnapshot: { proteinG: 12, carbsG: 61, fatG: 7 },
      }),
    )
    const previewInput = {
      kind: 'ingredient' as const,
      foodId: ingredientId,
      ...oats,
      nutritionProvenance: label,
      applyToPastMeals: true,
    }
    return {
      t,
      token,
      personId,
      ingredientId,
      previewInput,
      meals: {
        olderId,
        breakfastId,
        porridgeId,
        ignoredId,
        archivedId,
        coveredId,
      },
    }
  }

  it('previews every affected and skipped item, then fills them atomically', async () => {
    const { t, token, personId, ingredientId, previewInput, meals } =
      await pastMealsFixture()
    const preview = await output(
      await call(t, token, 'preview_food_macros', { input: previewInput }),
      foodMacrosPreview,
    )
    expect(
      preview.pastMeals?.items.map((item) => [
        item.mealId,
        item.eatenOn,
        item.person,
        item.consumedWeightGrams,
        item.calories,
        item.macros,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [
          meals.breakfastId,
          '2026-11-08',
          'Alex',
          50,
          190,
          { proteinG: 6.5, carbsG: 30, fatG: 3.5 },
        ],
        [
          meals.porridgeId,
          '2026-11-09',
          'Alex',
          100,
          380,
          { proteinG: 13, carbsG: 60, fatG: 7 },
        ],
      ]),
    )
    expect(preview.pastMeals?.items).toHaveLength(2)
    expect(
      Object.fromEntries(
        (preview.pastMeals?.skipped ?? []).map((item) => [
          item.mealId,
          item.reason,
        ]),
      ),
    ).toEqual({
      [meals.olderId]: 'kcalMismatch',
      [meals.ignoredId]: 'ignoreCalories',
      [meals.archivedId]: 'archivedMeal',
      [meals.coveredId]: 'hasMacros',
    })
    expect(preview.pastMeals?.days).toEqual([
      {
        personId,
        person: 'Alex',
        eatenOn: '2026-11-08',
        before: null,
        after: { proteinG: 6.5, carbsG: 30, fatG: 3.5, coveredCalories: 190 },
        change: { proteinG: 6.5, carbsG: 30, fatG: 3.5, coveredCalories: 190 },
      },
      {
        personId,
        person: 'Alex',
        eatenOn: '2026-11-09',
        before: null,
        after: { proteinG: 13, carbsG: 60, fatG: 7, coveredCalories: 380 },
        change: { proteinG: 13, carbsG: 60, fatG: 7, coveredCalories: 380 },
      },
    ])
    expect(preview.input.expectedPastMeals).toEqual(
      [meals.breakfastId, meals.porridgeId]
        .sort()
        .map((mealId) => ({ mealId, expectedEditRevision: 0 })),
    )
    // The preview saved nothing.
    expect((await read(t, ingredientId))?.macros).toBeUndefined()
    expect(
      (await itemsOf(t, meals.porridgeId))[0].macrosSnapshot,
    ).toBeUndefined()

    expect(
      await errorText(
        await call(t, token, 'set_food_macros', { input: preview.input }),
      ),
    ).toContain('needs an operationKey')
    const saved = await output(
      await call(t, token, 'set_food_macros', {
        input: preview.input,
        operationKey: 'oats-past',
      }),
      foodMacrosResult,
    )
    expect(saved).toMatchObject({
      change: 'updated',
      pastMeals: { updatedItemCount: 2, days: preview.pastMeals?.days },
    })
    expect((await read(t, ingredientId))?.macros).toEqual({
      ...oats,
      nutritionProvenance: label,
    })
    const breakfast = await read(t, meals.breakfastId)
    expect(breakfast).toMatchObject({
      totalCalories: 270,
      editRevision: 1,
      macros: { proteinG: 6.5, carbsG: 30, fatG: 3.5, coveredCalories: 190 },
    })
    const [oatsItem, biscuit] = await itemsOf(t, meals.breakfastId)
    expect(oatsItem).toMatchObject({
      caloriesSnapshot: 190,
      consumedWeightGrams: 50,
      kcalPer100Snapshot: 380,
      macrosSnapshot: oats,
    })
    expect(oatsItem.nutritionProvenance).toBeUndefined()
    expect(biscuit.macrosSnapshot).toBeUndefined()
    // Calories stay put; the day's macros cover the oats' 190 kcal.
    expect(await daySummary(t, personId, '2026-11-08')).toMatchObject({
      consumedCalories: 270,
      macros: { proteinG: 6.5, carbsG: 30, fatG: 3.5, coveredCalories: 190 },
    })
    expect(await daySummary(t, personId, '2026-11-09')).toMatchObject({
      macros: { proteinG: 13, carbsG: 60, fatG: 7, coveredCalories: 380 },
    })
    // Skipped items are untouched.
    for (const mealId of [meals.olderId, meals.ignoredId, meals.archivedId])
      expect((await itemsOf(t, mealId))[0].macrosSnapshot).toBeUndefined()
    expect((await itemsOf(t, meals.coveredId))[0].macrosSnapshot).toEqual({
      proteinG: 12,
      carbsG: 61,
      fatG: 7,
    })

    // A retried save returns its first result and changes nothing more.
    const retried = await output(
      await call(t, token, 'set_food_macros', {
        input: preview.input,
        operationKey: 'oats-past',
      }),
      foodMacrosResult,
    )
    expect(retried).toEqual(saved)
    expect((await read(t, meals.breakfastId))?.editRevision).toBe(1)
    expect(
      await errorText(
        await call(t, token, 'set_food_macros', {
          input: { ...preview.input, proteinG: 12 },
          operationKey: 'oats-past',
        }),
      ),
    ).toContain('already used with different inputs')
  })

  it('saves nothing when a previewed meal changed or a new one was logged', async () => {
    const { t, token, personId, ingredientId, previewInput, meals } =
      await pastMealsFixture()
    const preview = await output(
      await call(t, token, 'preview_food_macros', { input: previewInput }),
      foodMacrosPreview,
    )
    const [porridgeItem] = await itemsOf(t, meals.porridgeId)
    await output(
      await call(t, token, 'correct_meal', {
        input: {
          mealId: meals.porridgeId,
          expectedEditRevision: 0,
          itemChanges: [
            {
              kind: 'portion',
              itemId: porridgeItem._id,
              consumedWeightGrams: 120,
            },
          ],
        },
        operationKey: 'porridge-portion',
      }),
      mealResult,
    )
    const lateId = await logOats(t, personId, ingredientId, '2026-11-10', 40)
    const text = await errorText(
      await call(t, token, 'set_food_macros', {
        input: preview.input,
        operationKey: 'stale',
      }),
    )
    expect(text).toContain('nothing was saved')
    expect(text).toContain(`meal ${meals.porridgeId} is at editRevision 1`)
    expect(text).toContain(`meal ${lateId} was logged or changed`)
    expect((await read(t, ingredientId))?.macros).toBeUndefined()
    expect(
      (await itemsOf(t, meals.breakfastId))[0].macrosSnapshot,
    ).toBeUndefined()

    // A fresh preview covers the new state.
    const fresh = await output(
      await call(t, token, 'preview_food_macros', { input: previewInput }),
      foodMacrosPreview,
    )
    expect(fresh.pastMeals?.items).toHaveLength(3)
    await output(
      await call(t, token, 'set_food_macros', {
        input: fresh.input,
        operationKey: 'fresh',
      }),
      foodMacrosResult,
    )
    expect((await itemsOf(t, lateId))[0].macrosSnapshot).toEqual(oats)
  })

  it('leaves past meals alone without the option and refuses saved foods', async () => {
    const { t, token, ingredientId, previewInput, meals } =
      await pastMealsFixture()
    const plain = await output(
      await call(t, token, 'preview_food_macros', {
        input: { ...previewInput, applyToPastMeals: undefined },
      }),
      foodMacrosPreview,
    )
    expect(plain.pastMeals).toBeUndefined()
    expect(plain.input.expectedPastMeals).toBeUndefined()
    await output(
      await call(t, token, 'set_food_macros', { input: plain.input }),
      foodMacrosResult,
    )
    expect((await read(t, ingredientId))?.macros).toBeDefined()
    expect(
      (await itemsOf(t, meals.porridgeId))[0].macrosSnapshot,
    ).toBeUndefined()

    const [item] = await itemsOf(t, meals.porridgeId)
    const savedFoodId = await t.run(async (ctx) => {
      const meal = await ctx.db.get(meals.porridgeId)
      if (!meal) throw new Error('Meal not found.')
      return ctx.db.insert('mcpSavedFoods', {
        ownerUserId: meal.ownerUserId,
        householdId: meal.householdId,
        name: 'Granola',
        nutrition: { kind: 'byWeight', kcalPer100: 450, ignoreCalories: false },
        sourceMealId: meals.porridgeId,
        sourceItemId: item._id,
        createdAt: Date.now(),
      })
    })
    expect(
      await errorText(
        await call(t, token, 'preview_food_macros', {
          input: {
            ...previewInput,
            kind: 'savedFood',
            foodId: savedFoodId,
          },
        }),
      ),
    ).toContain('preview_meal_corrections_batch')
  })
})

describe('catalog macros in meal corrections', () => {
  it('sets or refreshes macros on catalog items without changing calories', async () => {
    const t = setup()
    const token = await credential(t)
    const personId = await insertPerson(t)
    const yogurtId = await insertIngredient(t, {
      name: 'Yogurt',
      kcalPer100: 100,
    })
    const waterId = await insertIngredient(t, {
      name: 'Water',
      kcalPer100: 0,
      ignoreCalories: true,
    })
    const mealId = await asTestUser(t).mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-10',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId: yogurtId,
          expectedSnapshot: snapshot('Yogurt', 100),
          consumedWeightGrams: 200,
        },
        {
          sourceType: 'ingredient',
          ingredientId: waterId,
          expectedSnapshot: { ...snapshot('Water', 0), ignoreCalories: true },
          consumedWeightGrams: 300,
        },
        {
          sourceType: 'customByWeight',
          name: 'Honey',
          kcalPer100: 300,
          ignoreCalories: false,
          consumedWeightGrams: 10,
        },
      ],
    })
    const meal = await output(
      await call(t, token, 'get_meal', { mealId }),
      mealDetails,
    )
    const [yogurt, water, honey] = meal.items
    const change = (itemChanges: unknown[]) =>
      call(t, token, 'preview_meal_correction', {
        input: { mealId, expectedEditRevision: meal.editRevision, itemChanges },
      })
    const macros = { proteinG: 10, carbsG: 4, fatG: 5 }

    expect(
      await errorText(
        await change([{ kind: 'macros', itemId: yogurt.id, macros }]),
      ),
    ).toContain('nutritionProvenance')
    expect(
      await errorText(
        await change([
          {
            kind: 'macros',
            itemId: water.id,
            macros,
            nutritionProvenance: label,
          },
        ]),
      ),
    ).toContain('calories are ignored')
    expect(
      await errorText(
        await change([
          {
            kind: 'macros',
            itemId: honey.id,
            macros,
            nutritionProvenance: label,
          },
        ]),
      ),
    ).toContain('customNutrition')
    expect(
      await errorText(
        await change([{ kind: 'refreshFromCatalog', itemId: yogurt.id }]),
      ),
    ).toContain('has no macros in the catalog')

    const preview = await output(
      await change([
        {
          kind: 'macros',
          itemId: yogurt.id,
          macros,
          nutritionProvenance: label,
        },
      ]),
      mealCorrectionPreview,
    )
    expect(preview.after.totalCalories).toBe(preview.before.totalCalories)
    expect(preview.after.items[0]).toMatchObject({
      calories: 200,
      consumedWeightGrams: 200,
      macros,
    })
    expect(preview.dailySummaries?.[0].after.macros).toEqual({
      ...{ proteinG: 20, carbsG: 8, fatG: 10 },
      coveredCalories: 200,
    })
    await output(
      await call(t, token, 'correct_meal', {
        input: preview.input,
        operationKey: 'yogurt-macros',
      }),
      mealResult,
    )
    expect(await daySummary(t, personId, '2026-11-10')).toMatchObject({
      consumedCalories: 230,
      macros: { proteinG: 20, carbsG: 8, fatG: 10, coveredCalories: 200 },
    })

    // Refresh copies the catalog's macros only while its kcal still match.
    await t.run((ctx) =>
      ctx.db.patch(yogurtId, {
        macros: { proteinG: 9, carbsG: 4, fatG: 5, nutritionProvenance: label },
      }),
    )
    const refreshed = await output(
      await call(t, token, 'preview_meal_correction', {
        input: {
          mealId,
          expectedEditRevision: 1,
          itemChanges: [{ kind: 'refreshFromCatalog', itemId: yogurt.id }],
        },
      }),
      mealCorrectionPreview,
    )
    expect(refreshed.after.items[0]).toMatchObject({
      calories: 200,
      macros: { proteinG: 9, carbsG: 4, fatG: 5 },
    })
    await t.run((ctx) => ctx.db.patch(yogurtId, { kcalPer100: 120 }))
    expect(
      await errorText(
        await call(t, token, 'preview_meal_correction', {
          input: {
            mealId,
            expectedEditRevision: 1,
            itemChanges: [{ kind: 'refreshFromCatalog', itemId: yogurt.id }],
          },
        }),
      ),
    ).toContain('recorded 100 kcal/100 g, but Yogurt now has 120 kcal/100 g')
  })
})

describe('batch meal corrections', () => {
  it('previews and saves many meals as one write, all or nothing', async () => {
    const t = setup()
    const token = await credential(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Oats',
      kcalPer100: 380,
    })
    const mealIds: Array<Id<'meals'>> = []
    for (let index = 0; index < 12; index++)
      mealIds.push(
        await logOats(
          t,
          personId,
          ingredientId,
          index < 6 ? '2026-11-09' : '2026-11-10',
          50,
        ),
      )
    await t.run((ctx) =>
      ctx.db.patch(ingredientId, {
        macros: { ...oats, nutritionProvenance: label },
      }),
    )
    const corrections = await Promise.all(
      mealIds.map(async (mealId) => ({
        mealId,
        expectedEditRevision: 0,
        itemChanges: [
          {
            kind: 'refreshFromCatalog' as const,
            itemId: (await itemsOf(t, mealId))[0]._id,
          },
        ],
      })),
    )
    // Another edit moved one meal on since it was read.
    const stale = corrections.map((correction, index) =>
      index === 3 ? { ...correction, expectedEditRevision: 7 } : correction,
    )
    const rejected = await output(
      await call(t, token, 'preview_meal_corrections_batch', {
        input: { corrections: stale },
      }),
      mealCorrectionsBatchPreview,
    )
    expect(rejected.ready).toBe(false)
    expect(rejected.meals[3]).toMatchObject({
      mealId: mealIds[3],
      ok: false,
      error: expect.stringContaining('changed'),
    })
    expect(rejected.meals.filter((meal) => meal.ok)).toHaveLength(11)
    const failed = await errorText(
      await call(t, token, 'correct_meals_batch', {
        input: { corrections: stale },
        operationKey: 'stale-batch',
      }),
    )
    expect(failed).toContain('No meals were saved: 1 of 12 corrections failed')
    expect(failed).toContain(mealIds[3])
    for (const mealId of mealIds)
      expect((await itemsOf(t, mealId))[0].macrosSnapshot).toBeUndefined()

    const preview = await output(
      await call(t, token, 'preview_meal_corrections_batch', {
        input: { corrections },
      }),
      mealCorrectionsBatchPreview,
    )
    expect(preview.ready).toBe(true)
    expect(preview.meals[0]).toMatchObject({
      ok: true,
      before: { totalCalories: 190 },
      after: {
        totalCalories: 190,
        macros: { proteinG: 6.5, carbsG: 30, fatG: 3.5, coveredCalories: 190 },
      },
    })
    expect(
      preview.dailySummaries.map(({ before, after }) => [
        before.eatenOn,
        before.consumedCalories,
        after.consumedCalories,
        after.macros?.coveredCalories,
      ]),
    ).toEqual([
      ['2026-11-09', 1140, 1140, 1140],
      ['2026-11-10', 1140, 1140, 1140],
    ])

    // Twelve meals exceed the write bucket's ten tokens: the batch is one.
    const saved = await output(
      await call(t, token, 'correct_meals_batch', {
        input: preview.input,
        operationKey: 'oats-batch',
      }),
      mealCorrectionsBatchResult,
    )
    expect(saved.meals).toHaveLength(12)
    expect(saved.meals.every((meal) => meal.editRevision === 1)).toBe(true)
    expect(saved.dailySummaries.map((day) => day.macros)).toEqual([
      { proteinG: 39, carbsG: 180, fatG: 21, coveredCalories: 1140 },
      { proteinG: 39, carbsG: 180, fatG: 21, coveredCalories: 1140 },
    ])
    for (const mealId of mealIds)
      expect(await itemsOf(t, mealId)).toMatchObject([
        { caloriesSnapshot: 190, macrosSnapshot: oats },
      ])
    expect(
      await output(
        await call(t, token, 'correct_meals_batch', {
          input: preview.input,
          operationKey: 'oats-batch',
        }),
        mealCorrectionsBatchResult,
      ),
    ).toEqual(saved)
    expect(
      await errorText(
        await call(t, token, 'preview_meal_corrections_batch', {
          input: { corrections: [corrections[0], corrections[0]] },
        }),
      ),
    ).toContain('Each meal may appear once')
  })
  it('asks to split a batch too big for one transaction', async () => {
    const t = setup()
    const token = await credential(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Oats',
      kcalPer100: 380,
    })
    // Custom items linked to the catalog cost a read each again on save.
    const corrections = []
    for (let day = 1; day <= 40; day++) {
      const mealId = await asTestUser(t).mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: `2026-09-${String((day % 30) + 1).padStart(2, '0')}`,
        items: Array.from({ length: 30 }, () => ({
          sourceType: 'customByWeight' as const,
          ingredientId,
          name: 'Oats',
          kcalPer100: 380,
          ignoreCalories: false,
          consumedWeightGrams: day,
        })),
      })
      const [first] = await itemsOf(t, mealId)
      corrections.push({
        mealId,
        expectedEditRevision: 0,
        itemChanges: [
          {
            kind: 'customNutrition' as const,
            itemId: first._id,
            kcalPer100: 380,
            macros: oats,
            nutritionProvenance: label,
          },
        ],
      })
    }
    expect(
      await errorText(
        await call(t, token, 'correct_meals_batch', {
          input: { corrections },
          operationKey: 'too-big',
        }),
      ),
    ).toContain('Split it into smaller batches')
  })
})

describe('meal template refresh', () => {
  it('flags templates missing macros and refreshes them from their sources', async () => {
    const t = setup()
    const token = await credential(t)
    const personId = await insertPerson(t)
    const ingredientId = await insertIngredient(t, {
      name: 'Oats',
      kcalPer100: 380,
    })
    const mealId = await asTestUser(t).mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-11-10',
      items: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: snapshot('Oats', 380),
          consumedWeightGrams: 50,
        },
        { sourceType: 'fixedCalories', name: 'Coffee', calories: 5 },
      ],
    })
    const { templateId } = await output(
      await call(t, token, 'save_meal_template', {
        input: { action: 'save', mealId, name: 'Breakfast' },
        operationKey: 'save-breakfast',
      }),
      templateResult,
    )
    const search = async () =>
      (
        await output(
          await call(t, token, 'search_meal_templates', { search: '' }),
          templateSearchResult,
        )
      ).templates[0]
    expect(await search()).toMatchObject({
      missingMacros: true,
      itemMacroStatus: [
        { name: 'Oats', missingMacros: true },
        { name: 'Coffee', missingMacros: true },
      ],
    })
    // The app's list carries the same flag for its indicator.
    expect(
      (
        await asTestUser(t).query(api.savedFoods.listTemplates, {
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).page[0].missingMacros,
    ).toBe(true)

    await t.run((ctx) =>
      ctx.db.patch(ingredientId, {
        macros: { ...oats, nutritionProvenance: label },
      }),
    )
    const preview = await output(
      await call(t, token, 'preview_meal_template_refresh', { templateId }),
      templateRefreshPreview,
    )
    expect(preview.items).toEqual([
      { name: 'Oats', status: 'updated', before: null, after: oats },
      {
        name: 'Coffee',
        status: 'skipped',
        reason: 'sourceHasNoMacros',
        before: null,
        after: null,
      },
    ])
    expect(preview).toMatchObject({
      missingMacrosBefore: true,
      missingMacrosAfter: true,
    })
    expect(
      await errorText(
        await call(t, token, 'save_meal_template', {
          input: { ...preview.input, expectedItems: undefined },
          operationKey: 'refresh-unpreviewed',
        }),
      ),
    ).toContain('Preview first')

    // Sources that change after the preview need a new approval.
    await t.run((ctx) =>
      ctx.db.patch(ingredientId, {
        macros: { ...oats, proteinG: 12, nutritionProvenance: label },
      }),
    )
    expect(
      await errorText(
        await call(t, token, 'save_meal_template', {
          input: preview.input,
          operationKey: 'refresh-stale',
        }),
      ),
    ).toContain('sources changed since the preview')
    await t.run((ctx) =>
      ctx.db.patch(ingredientId, {
        macros: { ...oats, nutritionProvenance: label },
      }),
    )
    await output(
      await call(t, token, 'save_meal_template', {
        input: preview.input,
        operationKey: 'refresh-breakfast',
      }),
      templateResult,
    )
    const refreshed = await search()
    expect(refreshed).toMatchObject({
      editRevision: 1,
      itemMacroStatus: [
        { name: 'Oats', missingMacros: false },
        { name: 'Coffee', missingMacros: true },
      ],
    })
    expect(refreshed.items[0]).toMatchObject({ kcalPer100: 380, macros: oats })

    // A catalog whose calories moved on no longer describes the template.
    await t.run((ctx) => ctx.db.patch(ingredientId, { kcalPer100: 400 }))
    const mismatch = await output(
      await call(t, token, 'preview_meal_template_refresh', { templateId }),
      templateRefreshPreview,
    )
    expect(mismatch.items[0]).toMatchObject({
      status: 'skipped',
      reason: 'kcalMismatch',
      before: oats,
      after: oats,
    })
  })
})
