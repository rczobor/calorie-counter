// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeFunctionReference } from 'convex/server'

import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertMeal,
  insertMealItem,
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

  it('normalizes dashboard dates and returns meal-item calorie snapshots', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
    })
    const mealId = await insertMeal(t, personId, {
      eatenOn: '2026-04-04',
    })
    await insertMealItem(t, mealId, { caloriesSnapshot: 500 })

    const data = await user.query(api.nutrition.getMealDashboardData, {
      eatenOn: ' 2026-04-04 ',
    })

    expect(data.meals).toHaveLength(1)
    expect(data.meals[0]).toMatchObject({ _id: mealId })
    expect(data.meals[0]).not.toHaveProperty('totalCalories')
    expect(data.mealItems).toHaveLength(1)
    expect(data.mealItems[0]?.caloriesSnapshot).toBe(500)
  })

  it('keeps every page query token-scoped when subjects match', async () => {
    const t = createConvexTest()
    const tokenA = 'https://issuer-a.example|user-1'
    const tokenB = 'https://issuer-b.example|user-1'
    await t.mutation(seedDefaults, {
      ownerUserId: 'user-1',
      ownerTokenIdentifier: tokenA,
    })
    await t.mutation(seedDefaults, {
      ownerUserId: 'user-1',
      ownerTokenIdentifier: tokenB,
    })
    const userA = asTestUserWithToken(t, tokenA)
    const userB = asTestUserWithToken(t, tokenB)
    const queryPages = (user: typeof userA) =>
      Promise.all([
        user.query(api.nutrition.getMealDashboardData, {
          eatenOn: '2026-04-04',
        }),
        user.query(api.nutrition.getPeopleData, { today: '2026-04-04' }),
        user.query(api.nutrition.getHistoryData, {
          startDate: '2026-04-04',
          endDate: '2026-04-04',
        }),
        user.query(api.nutrition.getCatalogData, {}),
        user.query(api.nutrition.getCookingData, {}),
      ])

    const results = await queryPages(userA)

    expect(Object.keys(results[0]).sort()).toEqual(
      [
        'people',
        'ingredients',
        'cookSessions',
        'cookedFoods',
        'meals',
        'mealItems',
      ].sort(),
    )
    expect(Object.keys(results[1]).sort()).toEqual(
      ['people', 'personGoalHistory', 'meals', 'mealItems'].sort(),
    )
    expect(Object.keys(results[2]).sort()).toEqual(
      ['people', 'personGoalHistory', 'meals', 'mealItems'].sort(),
    )
    expect(Object.keys(results[3]).sort()).toEqual(
      [
        'foodGroups',
        'ingredients',
        'recipes',
        'recipeVersions',
        'recipeVersionIngredients',
      ].sort(),
    )
    expect(Object.keys(results[4]).sort()).toEqual(
      [
        'people',
        'foodGroups',
        'ingredients',
        'recipes',
        'recipeVersions',
        'recipeVersionIngredients',
        'cookSessions',
        'cookedFoods',
        'cookedFoodIngredients',
      ].sort(),
    )

    for (const [token, tokenResults] of [
      [tokenA, results],
      [tokenB, await queryPages(userB)],
    ] as const) {
      for (const result of tokenResults) {
        for (const rows of Object.values(result)) {
          expect(rows.length).toBeGreaterThan(0)
          expect(
            rows.every(
              (row: { ownerTokenIdentifier: string }) =>
                row.ownerTokenIdentifier === token,
            ),
          ).toBe(true)
        }
      }
    }
  })

  it('keeps every archival path token-scoped without deleting history', async () => {
    const t = createConvexTest()
    const tokenA = 'https://issuer-a.example|user-1'
    const tokenB = 'https://issuer-b.example|user-1'
    await t.mutation(seedDefaults, {
      ownerUserId: 'user-1',
      ownerTokenIdentifier: tokenB,
    })
    const userA = asTestUserWithToken(t, tokenA)
    const userB = asTestUserWithToken(t, tokenB)
    const cooking = await userB.query(api.nutrition.getCookingData, {})
    const dashboard = await userB.query(api.nutrition.getMealDashboardData, {
      eatenOn: '2026-04-04',
    })
    const personId = cooking.people[0]!._id
    const groupId = cooking.foodGroups[0]!._id
    const ingredientId = cooking.ingredients[0]!._id
    const recipeId = cooking.recipes[0]!._id
    const sessionId = cooking.cookSessions[0]!._id
    const cookedFoodId = cooking.cookedFoods[0]!._id
    const mealId = dashboard.meals[0]!._id

    await Promise.all([
      expect(
        userA.mutation(api.nutrition.setPersonArchived, {
          personId,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setFoodGroupArchived, {
          groupId,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setIngredientArchived, {
          ingredientId,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setRecipeArchived, {
          recipeId,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setCookSessionArchived, {
          sessionId,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setCookedFoodArchived, {
          cookedFoodId,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
      expect(
        userA.mutation(api.nutrition.setMealArchived, {
          mealId,
          archived: true,
        }),
      ).rejects.toThrow('not found'),
    ])

    await userB.mutation(api.nutrition.setPersonArchived, {
      personId,
      archived: true,
    })
    await userB.mutation(api.nutrition.setFoodGroupArchived, {
      groupId,
      archived: true,
    })
    await userB.mutation(api.nutrition.setIngredientArchived, {
      ingredientId,
      archived: true,
    })
    await userB.mutation(api.nutrition.setRecipeArchived, {
      recipeId,
      archived: true,
    })
    await userB.mutation(api.nutrition.setCookSessionArchived, {
      sessionId,
      archived: true,
    })
    await userB.mutation(api.nutrition.setCookedFoodArchived, {
      cookedFoodId,
      archived: true,
    })
    await userB.mutation(api.nutrition.setMealArchived, {
      mealId,
      archived: true,
    })

    const archivedCooking = await userB.query(api.nutrition.getCookingData, {})
    const archivedDashboard = await userB.query(
      api.nutrition.getMealDashboardData,
      { eatenOn: '2026-04-04' },
    )
    expect(
      archivedCooking.people.find((row) => row._id === personId)?.active,
    ).toBe(false)
    expect(
      archivedCooking.foodGroups.find((row) => row._id === groupId)?.archived,
    ).toBe(true)
    expect(
      archivedCooking.ingredients.find((row) => row._id === ingredientId)
        ?.archived,
    ).toBe(true)
    expect(
      archivedCooking.recipes.find((row) => row._id === recipeId)?.archived,
    ).toBe(true)
    expect(
      archivedCooking.cookSessions.find((row) => row._id === sessionId)
        ?.archived,
    ).toBe(true)
    expect(
      archivedCooking.cookedFoods.find((row) => row._id === cookedFoodId)
        ?.archived,
    ).toBe(true)
    expect(
      archivedDashboard.meals.find((row) => row._id === mealId)?.archived,
    ).toBe(true)
    expect(archivedCooking.recipeVersionIngredients).toHaveLength(3)
    expect(archivedCooking.cookedFoodIngredients).toHaveLength(3)
    expect(archivedDashboard.mealItems).toHaveLength(2)
  })
})
