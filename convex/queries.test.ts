// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFunctionReference } from 'convex/server'

import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertCookSession,
  insertMeal,
  insertMealItem,
  readEditRevision,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

const seedDefaults = makeFunctionReference<
  'mutation',
  { ownerUserId?: string; ownerTokenIdentifier?: string },
  unknown
>('seed:defaults')

describe('nutrition scoped queries', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes day-query dates and returns precomputed meal totals', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
      effectiveDate: '2026-04-04',
    })
    const mealId = await insertMeal(t, personId, {
      eatenOn: '2026-04-04',
      totalCalories: 500,
    })
    await insertMealItem(t, mealId, { caloriesSnapshot: 500 })

    const data = await user.query(api.meals.listForDay, {
      personId,
      eatenOn: ' 2026-04-04 ',
      archived: false,
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(data.page).toHaveLength(1)
    expect(data.page[0]).toMatchObject({
      _id: mealId,
      totalCalories: 500,
      itemCount: 1,
    })
    expect(data.page[0]).not.toHaveProperty('ownerTokenIdentifier')
  })

  it('serves bounded owner-free DTOs from the domain query APIs', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
      effectiveDate: '2026-04-04',
    })
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [{ sourceType: 'fixedCalories', name: 'Dinner', calories: 640 }],
    })
    const archivedMealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [
        { sourceType: 'fixedCalories', name: 'Archived snack', calories: 180 },
      ],
    })
    await user.mutation(api.nutrition.setMealArchived, {
      mealId: archivedMealId,
      expectedEditRevision: await readEditRevision(t, archivedMealId),
      archived: true,
    })
    const paginationOpts = { numItems: 10, cursor: null }

    const [people, meals, activeMeals, detail, history] = await Promise.all([
      user.query(api.people.listWithToday, {
        archived: false,
        today: '2026-04-04',
        paginationOpts,
      }),
      user.query(api.meals.listForDay, {
        personId,
        eatenOn: '2026-04-04',
        paginationOpts,
      }),
      user.query(api.meals.listForDay, {
        personId,
        eatenOn: '2026-04-04',
        archived: false,
        paginationOpts,
      }),
      user.query(api.meals.getDetail, { mealId }),
      user.query(api.history.list, {
        personId,
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        paginationOpts,
      }),
    ])

    expect(people.page).toHaveLength(1)
    expect(people.page[0]).toMatchObject({ consumedCalories: 640 })
    expect(people.page[0]).not.toHaveProperty('ownerTokenIdentifier')
    expect(meals.page).toHaveLength(2)
    expect(new Set(meals.page.map((meal) => meal._id))).toEqual(
      new Set([mealId, archivedMealId]),
    )
    expect(meals.isDone).toBe(true)
    expect(meals.page.every((meal) => !('ownerTokenIdentifier' in meal))).toBe(
      true,
    )
    expect(activeMeals.page).toHaveLength(1)
    expect(activeMeals.isDone).toBe(true)
    expect(activeMeals.page[0]).toMatchObject({
      _id: mealId,
      archived: false,
      totalCalories: 640,
      itemCount: 1,
    })
    expect(activeMeals.page[0]).not.toHaveProperty('ownerTokenIdentifier')
    expect(detail?.items).toHaveLength(1)
    expect(detail?.items[0]).toMatchObject({
      sourceType: 'fixedCalories',
      caloriesSnapshot: 640,
    })
    expect(detail?.items[0]).not.toHaveProperty('ownerTokenIdentifier')
    expect(history.page).toHaveLength(1)
    expect(history.page[0]).toMatchObject({
      consumedCalories: 640,
      mealCount: 1,
    })
    expect(history.page[0]).not.toHaveProperty('ownerTokenIdentifier')
  })

  it('normalizes missing legacy edit revisions in every editable DTO', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const legacy = await t.run(async (ctx) => {
      const createdAt = Date.now()
      const personId = await ctx.db.insert('people', {
        ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
        name: 'Legacy person',
        currentDailyGoalKcal: 2_000,
        archived: false,
        createdAt,
      })
      const groupId = await ctx.db.insert('foodGroups', {
        ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
        name: 'Legacy group',
        appliesTo: 'ingredient',
        archived: false,
        createdAt,
      })
      const ingredientId = await ctx.db.insert('ingredients', {
        ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
        name: 'Legacy ingredient',
        kcalPer100: 100,
        kcalBasisUnit: 'g',
        ignoreCalories: false,
        groupId,
        archived: false,
        createdAt,
      })
      const recipeId = await ctx.db.insert('recipes', {
        ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
        name: 'Legacy recipe',
        archived: false,
        latestVersionNumber: 1,
        createdAt,
      })
      await ctx.db.insert('recipeVersions', {
        ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
        recipeId,
        versionNumber: 1,
        name: 'Legacy recipe',
        createdAt,
      })
      const sessionId = await ctx.db.insert('cookSessions', {
        ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
        label: 'Legacy session',
        searchText: '2026-04-04 Legacy session',
        cookedAt: createdAt,
        archived: false,
        updatedAt: createdAt,
        createdAt,
      })
      const cookedFoodId = await ctx.db.insert('cookedFoods', {
        ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
        cookSessionId: sessionId,
        name: 'Legacy cooked food',
        finishedWeightGrams: 100,
        totalRawWeightGrams: 100,
        totalCalories: 100,
        kcalPer100: 100,
        archived: false,
        createdAt,
      })
      const mealId = await ctx.db.insert('meals', {
        ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
        personId,
        name: 'Legacy meal',
        eatenOn: '2026-04-04',
        archived: false,
        totalCalories: 0,
        itemCount: 0,
        createdAt,
      })
      return {
        personId,
        groupId,
        ingredientId,
        recipeId,
        sessionId,
        cookedFoodId,
        mealId,
      }
    })

    const [
      person,
      group,
      ingredient,
      recipe,
      currentRecipe,
      session,
      food,
      meal,
    ] = await Promise.all([
      user.query(api.people.get, { personId: legacy.personId }),
      user.query(api.catalog.getFoodGroup, { groupId: legacy.groupId }),
      user.query(api.catalog.getIngredient, {
        ingredientId: legacy.ingredientId,
      }),
      user.query(api.catalog.getRecipe, { recipeId: legacy.recipeId }),
      user.query(api.recipes.getCurrent, { recipeId: legacy.recipeId }),
      user.query(api.cooking.getSession, { sessionId: legacy.sessionId }),
      user.query(api.cooking.getCookedFoodDetail, {
        cookedFoodId: legacy.cookedFoodId,
      }),
      user.query(api.meals.getDetail, { mealId: legacy.mealId }),
    ])

    expect([
      person?.editRevision,
      group?.editRevision,
      ingredient?.editRevision,
      recipe?.editRevision,
      currentRecipe?.recipe.editRevision,
      session?.editRevision,
      food?.cookedFood.editRevision,
      meal?.meal.editRevision,
    ]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('rejects pagination requests above the shared page-size bound', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)

    await expect(
      user.query(api.people.list, {
        archived: false,
        paginationOpts: { numItems: 51, cursor: null },
      }),
    ).rejects.toThrow('Page size must be between 1 and 50.')
  })

  it('paginates active cooked foods within an owned cooking session', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const sessionId = await insertCookSession(t, { label: 'Weekend prep' })
    const otherSessionId = await insertCookSession(t, {
      label: 'Other prep',
    })
    const [cookedFoodId] = await t.run(async (ctx) => {
      const insertCookedFood = async (
        cookSessionId: typeof sessionId,
        name: string,
        archived: boolean,
      ) =>
        await ctx.db.insert('cookedFoods', {
          ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
          cookSessionId,
          name,
          recipeId: undefined,
          recipeVersionId: undefined,
          groupId: undefined,
          finishedWeightGrams: 100,
          totalRawWeightGrams: 100,
          totalCalories: 100,
          kcalPer100: 100,
          notes: undefined,
          archived,
          createdAt: Date.now(),
        })
      return await Promise.all([
        insertCookedFood(sessionId, 'Visible batch', false),
        insertCookedFood(sessionId, 'Archived batch', true),
        insertCookedFood(otherSessionId, 'Other batch', false),
      ])
    })

    const result = await user.query(api.cooking.listCookedFoodsForSession, {
      cookSessionId: sessionId,
      archived: false,
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(result.page).toHaveLength(1)
    expect(result.page[0]).toMatchObject({
      _id: cookedFoodId,
      cookSessionId: sessionId,
      name: 'Visible batch',
      archived: false,
    })
    expect(result.page[0]).not.toHaveProperty('ownerTokenIdentifier')
    const searchResult = await user.query(
      api.cooking.searchCookedFoodsBySession,
      {
        cookSessionId: sessionId,
        archived: false,
        search: 'Visible',
      },
    )
    expect(searchResult).toHaveLength(1)
    expect(searchResult[0]).toMatchObject({
      _id: cookedFoodId,
      name: 'Visible batch',
    })
    expect(searchResult[0]).not.toHaveProperty('ownerTokenIdentifier')
    await expect(
      asTestUserWithToken(t, 'other-user|token').query(
        api.cooking.listCookedFoodsForSession,
        {
          cookSessionId: sessionId,
          archived: false,
          paginationOpts: { numItems: 10, cursor: null },
        },
      ),
    ).rejects.toThrow('Cook session not found.')
  })

  it('keeps archived cook-by person labels in bounded session DTOs', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Archived cook',
      currentDailyGoalKcal: 2000,
      effectiveDate: '2026-04-04',
    })
    await user.mutation(api.nutrition.setPersonArchived, {
      personId,
      expectedEditRevision: await readEditRevision(t, personId),
      archived: true,
    })
    const sessionId = await insertCookSession(t, {
      label: 'Historic prep',
      cookedByPersonId: personId,
    })

    const result = await user.query(api.cooking.listSessions, {
      archived: false,
      paginationOpts: { numItems: 10, cursor: null },
    })

    expect(result.page).toContainEqual(
      expect.objectContaining({
        _id: sessionId,
        cookedByPersonId: personId,
        cookedByPersonName: 'Archived cook',
      }),
    )
    expect(result.page[0]).not.toHaveProperty('ownerTokenIdentifier')
  })

  it('returns the latest goal before a history range, not the oldest goal', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 1800,
      effectiveDate: '2026-01-01',
    })
    await user.mutation(api.nutrition.updatePersonGoal, {
      personId,
      expectedEditRevision: await readEditRevision(t, personId),
      goalKcal: 1900,
      effectiveDate: '2026-02-01',
    })
    await user.mutation(api.nutrition.updatePersonGoal, {
      personId,
      expectedEditRevision: await readEditRevision(t, personId),
      goalKcal: 2000,
      effectiveDate: '2026-03-01',
    })

    const goals = await user.query(api.history.goalsForRange, {
      personId,
      startDate: '2026-02-15',
      endDate: '2026-03-31',
    })

    expect(goals.map((goal) => goal.effectiveDate)).toEqual([
      '2026-03-01',
      '2026-02-01',
    ])
  })

  it('keeps every archival path token-scoped without deleting history', async () => {
    const t = createConvexTest()
    const tokenA = 'https://issuer-a.example|user-1'
    const tokenB = 'https://issuer-b.example|user-1'
    await t.mutation(seedDefaults, {
      ownerTokenIdentifier: tokenB,
    })
    const userA = asTestUserWithToken(t, tokenA)
    const userB = asTestUserWithToken(t, tokenB)
    const seeded = await t.run(async (ctx) => ({
      person: await ctx.db
        .query('people')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', tokenB),
        )
        .first(),
      group: await ctx.db
        .query('foodGroups')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', tokenB),
        )
        .first(),
      ingredient: await ctx.db
        .query('ingredients')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', tokenB),
        )
        .first(),
      recipe: await ctx.db
        .query('recipes')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', tokenB),
        )
        .first(),
      session: await ctx.db
        .query('cookSessions')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', tokenB),
        )
        .first(),
      cookedFood: await ctx.db
        .query('cookedFoods')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', tokenB),
        )
        .first(),
      meal: await ctx.db
        .query('meals')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', tokenB),
        )
        .first(),
    }))
    const personId = seeded.person!._id
    const groupId = seeded.group!._id
    const ingredientId = seeded.ingredient!._id
    const recipeId = seeded.recipe!._id
    const sessionId = seeded.session!._id
    const cookedFoodId = seeded.cookedFood!._id
    const mealId = seeded.meal!._id

    await Promise.all([
      expect(
        userA.mutation(api.nutrition.setPersonArchived, {
          personId,
          expectedEditRevision: seeded.person!.editRevision ?? 0,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setFoodGroupArchived, {
          groupId,
          expectedEditRevision: seeded.group!.editRevision ?? 0,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setIngredientArchived, {
          ingredientId,
          expectedEditRevision: seeded.ingredient!.editRevision ?? 0,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setRecipeArchived, {
          recipeId,
          expectedEditRevision: seeded.recipe!.editRevision ?? 0,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setCookSessionArchived, {
          sessionId,
          expectedEditRevision: seeded.session!.editRevision ?? 0,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setCookedFoodArchived, {
          cookedFoodId,
          expectedEditRevision: seeded.cookedFood!.editRevision ?? 0,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setMealArchived, {
          mealId,
          expectedEditRevision: seeded.meal!.editRevision ?? 0,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
    ])

    await userB.mutation(api.nutrition.setPersonArchived, {
      personId,
      expectedEditRevision: seeded.person!.editRevision ?? 0,
      archived: true,
    })
    await userB.mutation(api.nutrition.setFoodGroupArchived, {
      groupId,
      expectedEditRevision: seeded.group!.editRevision ?? 0,
      archived: true,
    })
    await userB.mutation(api.nutrition.setIngredientArchived, {
      ingredientId,
      expectedEditRevision: seeded.ingredient!.editRevision ?? 0,
      archived: true,
    })
    await userB.mutation(api.nutrition.setRecipeArchived, {
      recipeId,
      expectedEditRevision: seeded.recipe!.editRevision ?? 0,
      archived: true,
    })
    await userB.mutation(api.nutrition.setCookSessionArchived, {
      sessionId,
      expectedEditRevision: seeded.session!.editRevision ?? 0,
      archived: true,
    })
    await userB.mutation(api.nutrition.setCookedFoodArchived, {
      cookedFoodId,
      expectedEditRevision: seeded.cookedFood!.editRevision ?? 0,
      archived: true,
    })
    await userB.mutation(api.nutrition.setMealArchived, {
      mealId,
      expectedEditRevision: seeded.meal!.editRevision ?? 0,
      archived: true,
    })

    const archived = await t.run(async (ctx) => ({
      person: await ctx.db.get(personId),
      group: await ctx.db.get(groupId),
      ingredient: await ctx.db.get(ingredientId),
      recipe: await ctx.db.get(recipeId),
      session: await ctx.db.get(sessionId),
      cookedFood: await ctx.db.get(cookedFoodId),
      meal: await ctx.db.get(mealId),
      recipeLines: await ctx.db
        .query('recipeVersionIngredients')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', tokenB),
        )
        .take(10),
      cookedFoodLines: await ctx.db
        .query('cookedFoodIngredients')
        .withIndex('by_ownerTokenIdentifier', (q) =>
          q.eq('ownerTokenIdentifier', tokenB),
        )
        .take(10),
    }))
    expect(archived.person?.archived).toBe(true)
    expect(archived.group?.archived).toBe(true)
    expect(archived.ingredient?.archived).toBe(true)
    expect(archived.recipe?.archived).toBe(true)
    expect(archived.session?.archived).toBe(true)
    expect(archived.cookedFood?.archived).toBe(true)
    expect(archived.meal?.archived).toBe(true)
    expect(archived.recipeLines).toHaveLength(3)
    expect(archived.cookedFoodLines).toHaveLength(3)
  })
})
