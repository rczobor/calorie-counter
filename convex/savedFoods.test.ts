// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest'
import rateLimiterTest from '@convex-dev/rate-limiter/test'
import { api, internal } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

vi.hoisted(() => {
  process.env.MCP_CONSENT_URL = 'https://app.example.test/connect'
})

async function fixture() {
  const t = createConvexTest()
  rateLimiterTest.register(t)
  const account = asTestUser(t)
  const personId = await account.mutation(api.nutrition.createPerson, {
    name: 'Alex',
    currentDailyGoalKcal: 2000,
    effectiveDate: '2026-11-01',
  })
  const mealId = await account.mutation(api.nutrition.createMeal, {
    personId,
    eatenOn: '2026-11-01',
    items: [{ sourceType: 'fixedCalories', name: 'Vitamins', calories: 14 }],
  })
  const detail = await account.query(api.meals.getDetail, { mealId })
  if (!detail) throw new Error('Expected source meal.')
  const user = {
    userId: TEST_TOKEN_IDENTIFIER,
    connectionId: 'saved-food-tests',
    scopes: ['nutrition:read', 'meals:write'],
  }
  const save = {
    user,
    mealId,
    itemId: detail.items[0]._id,
    operationKey: 'save',
  }
  const saved = await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, save)
  return { t, account, personId, mealId, user, saved, save }
}

describe('reusable-food maintenance', () => {
  it('indexes legacy active foods, archives/restores searches, and preserves meal evidence', async () => {
    const { t, account, mealId, user, saved } = await fixture()
    const args = {
      archived: false,
      paginationOpts: { numItems: 20, cursor: null },
    }
    expect((await account.query(api.savedFoods.list, args)).page).toMatchObject(
      [{ _id: saved.foodId, name: 'Vitamins', nutrition: { calories: 14 } }],
    )
    await account.mutation(api.savedFoods.setArchived, {
      foodId: saved.foodId,
      archived: true,
    })
    const firstArchive = await t.run((ctx) => ctx.db.get(saved.foodId))
    await account.mutation(api.savedFoods.setArchived, {
      foodId: saved.foodId,
      archived: true,
    })
    expect((await t.run((ctx) => ctx.db.get(saved.foodId)))?.archivedAt).toBe(
      firstArchive?.archivedAt,
    )
    expect((await account.query(api.savedFoods.list, args)).page).toEqual([])
    expect(
      (
        await account.query(api.savedFoods.list, {
          ...args,
          archived: true,
          search: 'Vitamins',
        })
      ).page,
    ).toHaveLength(1)
    expect(
      await t.mutation(internal.mcpOperations.searchFoods, {
        user,
        kind: 'savedFood',
        search: 'Vitamins',
      }),
    ).toMatchObject({ foods: [] })
    expect(
      (await account.query(api.meals.getDetail, { mealId }))?.meal
        .totalCalories,
    ).toBe(14)
    await account.mutation(api.savedFoods.setArchived, {
      foodId: saved.foodId,
      archived: false,
    })
    expect(
      (
        await account.query(api.savedFoods.list, {
          ...args,
          search: 'Vitamins',
        })
      ).page,
    ).toHaveLength(1)
    expect(
      await t.mutation(internal.mcpOperations.searchFoods, {
        user,
        kind: 'savedFood',
        search: '',
      }),
    ).toMatchObject({ foods: [{ id: saved.foodId }] })
  })

  it('rejects archived sources for fresh previews/writes while replaying completed writes', async () => {
    const { t, account, personId, user, saved, save } = await fixture()
    const input = {
      personId,
      eatenOn: '2026-11-02',
      items: [
        {
          sourceType: 'savedFood' as const,
          savedFoodId: saved.foodId,
          portion: { servings: 1 },
        },
      ],
    }
    const preview = await t.mutation(internal.mcpOperations.previewMeal, {
      user,
      input,
    })
    const write = { user, input: preview.input, operationKey: 'log' }
    const logged = await t.mutation(internal.mcpOperations.logMeal, write)
    await account.mutation(api.savedFoods.setArchived, {
      foodId: saved.foodId,
      archived: true,
    })
    await expect(
      t.mutation(internal.mcpOperations.previewMeal, { user, input }),
    ).rejects.toThrow('archived')
    await expect(
      t.mutation(internal.mcpOperations.logMeal, {
        ...write,
        operationKey: 'new-log',
      }),
    ).rejects.toThrow('archived')
    await expect(
      t.mutation(internal.mcpOperations.getFoodDetails, {
        user,
        kind: 'savedFood',
        id: saved.foodId,
      }),
    ).rejects.toThrow('archived')
    expect(await t.mutation(internal.mcpOperations.logMeal, write)).toEqual(
      logged,
    )
    expect(
      await t.mutation(internal.mcpFoodReuse.saveFoodFromMeal, save),
    ).toEqual(saved)
    expect(
      (
        await account.query(api.meals.getDayNutrition, {
          personId,
          eatenOn: '2026-11-02',
        })
      ).mealCount,
    ).toBe(1)
  })

  it('requires authentication, current household membership, and bounded inputs', async () => {
    const { t, account, saved } = await fixture()
    const args = {
      archived: false,
      paginationOpts: { numItems: 20, cursor: null },
    }
    await expect(t.query(api.savedFoods.list, args)).rejects.toThrow(
      'Authentication required',
    )
    await expect(
      t.mutation(api.savedFoods.setArchived, {
        foodId: saved.foodId,
        archived: true,
      }),
    ).rejects.toThrow('Authentication required')
    const other = asTestUserWithToken(t, 'other|token')
    expect((await other.query(api.savedFoods.list, args)).page).toEqual([])
    await expect(
      other.mutation(api.savedFoods.setArchived, {
        foodId: saved.foodId,
        archived: true,
      }),
    ).rejects.toThrow('Saved food not found')
    await expect(
      account.query(api.savedFoods.list, { ...args, search: 'x'.repeat(101) }),
    ).rejects.toThrow('Search cannot exceed')
    await expect(
      account.query(api.savedFoods.list, {
        ...args,
        paginationOpts: { numItems: 1001, cursor: null },
      }),
    ).rejects.toThrow('Page size')
  })
})
