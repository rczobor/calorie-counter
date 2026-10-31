// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertPerson,
  readEditRevision,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

async function setupHousehold() {
  const t = createConvexTest()
  const robi = asTestUser(t)
  const viki = asTestUserWithToken(t, 'https://clerk.example|viki')
  const householdId = await robi.mutation(api.households.ensurePersonal, {})
  const token = await robi.mutation(api.households.invite, { householdId })
  await viki.mutation(api.households.acceptInvitation, { token })
  return { t, robi, viki, householdId }
}
const riceSnapshot = {
  name: 'Rice',
  kcalPer100: 100,
  kcalBasisUnit: 'g' as const,
  ignoreCalories: false,
}
const page = { numItems: 20, cursor: null }
afterEach(() => vi.useRealTimers())

describe('household sharing', () => {
  it('migrates existing data in place, preserves history, and is idempotent', async () => {
    const t = createConvexTest()
    const personId = await insertPerson(t)
    const mealId = await t.run((ctx) =>
      ctx.db.insert('meals', {
        ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
        personId,
        eatenOn: '2026-10-31',
        archived: false,
        totalCalories: 123,
        itemCount: 1,
        createdAt: 1,
      }),
    )
    const user = asTestUser(t)
    const householdId = await user.mutation(api.households.ensurePersonal, {})
    expect(await user.mutation(api.households.ensurePersonal, {})).toBe(
      householdId,
    )
    const stored = await t.run(async (ctx) => ({
      person: await ctx.db.get(personId),
      meal: await ctx.db.get(mealId),
      members: await ctx.db.query('householdMembers').collect(),
    }))
    expect(stored.person).toMatchObject({ _id: personId, householdId })
    expect(stored.meal).toMatchObject({
      _id: mealId,
      householdId,
      personId,
      totalCalories: 123,
    })
    expect(stored.members).toHaveLength(1)
    expect(await user.query(api.households.list, {})).toEqual([
      { _id: householdId, name: 'My household', role: 'admin' },
    ])
  })

  it('fails an oversized legacy migration atomically instead of partially moving data', async () => {
    const t = createConvexTest()
    await t.run(async (ctx) => {
      for (let i = 0; i < 201; i++)
        await ctx.db.insert('people', {
          ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
          name: `Person ${i}`,
          archived: false,
          currentDailyGoalKcal: 2000,
          createdAt: 1,
        })
    })
    const user = t.withIdentity({ tokenIdentifier: TEST_TOKEN_IDENTIFIER })
    await expect(
      user.mutation(api.households.ensurePersonal, {}),
    ).rejects.toThrow('administrator-assisted')
    expect(await t.run((ctx) => ctx.db.query('households').collect())).toEqual(
      [],
    )
  })

  it('shares people, catalog, recipes, cooking, meals, and summaries while keeping original households separate', async () => {
    const { t, robi, viki, householdId } = await setupHousehold()
    const personId = await robi.mutation(api.nutrition.createPerson, {
      householdId,
      name: 'Viki',
      currentDailyGoalKcal: 2000,
      effectiveDate: '2026-10-31',
    })
    const groupId = await viki.mutation(api.nutrition.createFoodGroup, {
      householdId,
      name: 'Staples',
      appliesTo: 'ingredient',
    })
    const ingredientId = await robi.mutation(api.nutrition.createIngredient, {
      householdId,
      name: 'Rice',
      groupId,
      kcalPer100: 100,
      ignoreCalories: false,
    })
    expect(
      (
        await viki.query(api.catalog.getIngredient, {
          householdId,
          ingredientId,
        })
      )?.groupName,
    ).toBe('Staples')
    const recipe = await viki.mutation(api.nutrition.createRecipe, {
      householdId,
      name: 'Rice bowl',
      ingredientLines: [
        {
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: riceSnapshot,
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    expect(
      (
        await robi.query(api.recipes.getCurrent, {
          householdId,
          recipeId: recipe.recipeId,
        })
      )?.ingredients,
    ).toHaveLength(1)
    const sessionId = await robi.mutation(api.nutrition.createCookSession, {
      householdId,
      label: 'Dinner',
      cookedAt: Date.now(),
      cookedByPersonId: personId,
    })
    const food = await viki.mutation(api.nutrition.createCookedFood, {
      householdId,
      cookSessionId: sessionId,
      name: 'Rice bowl',
      recipeId: recipe.recipeId,
      recipeVersionId: recipe.recipeVersionId,
      finishedWeightGrams: 200,
      ingredients: [
        {
          countedAmount: 100,
          sourceType: 'ingredient',
          ingredientId,
          expectedSnapshot: riceSnapshot,
          referenceAmount: 100,
          referenceUnit: 'g',
        },
      ],
    })
    const detail = await robi.query(api.cooking.getCookedFoodDetail, {
      householdId,
      cookedFoodId: food.cookedFoodId,
    })
    expect(detail?.cookSession?.cookedByPersonName).toBe('Viki')
    expect(detail?.linkedRecipe?.recipeId).toBe(recipe.recipeId)
    const mealId = await viki.mutation(api.nutrition.createMeal, {
      householdId,
      personId,
      eatenOn: '2026-10-31',
      items: [
        {
          sourceType: 'cookedFood',
          cookedFoodId: food.cookedFoodId,
          expectedSnapshot: {
            name: 'Rice bowl',
            kcalPer100: 50,
            kcalBasisUnit: 'g',
            ignoreCalories: false,
          },
          consumedWeightGrams: 100,
        },
      ],
    })
    expect(
      (
        await robi.query(api.meals.getDaySummary, {
          householdId,
          personId,
          eatenOn: '2026-10-31',
        })
      )?.consumedCalories,
    ).toBe(50)
    expect(
      (
        await robi.query(api.people.search, {
          householdId,
          archived: false,
          search: 'Viki',
        })
      )[0]?._id,
    ).toBe(personId)
    const vikiHousehold = (await viki.query(api.households.list, {})).find(
      (row) => row._id !== householdId,
    )
    expect(vikiHousehold).toBeDefined()
    expect(
      (
        await viki.query(api.people.list, {
          householdId: vikiHousehold!._id,
          archived: false,
          paginationOpts: page,
        })
      ).page,
    ).toEqual([])
    await expect(
      robi.mutation(api.nutrition.deleteCookedFood, {
        householdId,
        cookedFoodId: food.cookedFoodId,
        expectedEditRevision: await readEditRevision(t, food.cookedFoodId),
      }),
    ).rejects.toThrow('meal history')
    expect(
      (await robi.query(api.meals.getDetail, { householdId, mealId }))
        ?.items[0],
    ).toMatchObject({ caloriesSnapshot: 50 })
  })

  it('rejects foreign household IDs and foreign relationships, including search and writes', async () => {
    const { robi, viki, householdId } = await setupHousehold()
    const privateId = (await viki.query(api.households.list, {})).find(
      (row) => row._id !== householdId,
    )!._id
    const ingredientId = await viki.mutation(api.nutrition.createIngredient, {
      householdId: privateId,
      name: 'Private rice',
      kcalPer100: 100,
      ignoreCalories: false,
    })
    await expect(
      robi.query(api.catalog.searchIngredients, {
        householdId: privateId,
        archived: false,
        search: 'rice',
      }),
    ).rejects.toThrow('access denied')
    await expect(
      robi.mutation(api.nutrition.createPerson, {
        householdId: privateId,
        name: 'Intruder',
        currentDailyGoalKcal: 2000,
        effectiveDate: '2026-10-31',
      }),
    ).rejects.toThrow('access denied')
    expect(
      await viki.query(api.catalog.getIngredient, {
        householdId,
        ingredientId,
      }),
    ).toBeNull()
    await expect(
      viki.mutation(api.nutrition.createRecipe, {
        householdId,
        name: 'Invalid',
        ingredientLines: [
          {
            sourceType: 'ingredient',
            ingredientId,
            expectedSnapshot: riceSnapshot,
            referenceAmount: 100,
            referenceUnit: 'g',
          },
        ],
      }),
    ).rejects.toThrow('ingredients are missing')
  })

  it('revokes access immediately without deleting people or meals and cannot be bypassed by bootstrap', async () => {
    const { t, robi, viki, householdId } = await setupHousehold()
    const personId = await viki.mutation(api.nutrition.createPerson, {
      householdId,
      name: 'Viki',
      currentDailyGoalKcal: 2000,
      effectiveDate: '2026-10-31',
    })
    const member = (
      await robi.query(api.households.members, { householdId })
    ).find((row) => !row.isYou)!
    await robi.mutation(api.households.updateMember, {
      householdId,
      memberId: member._id,
      role: 'remove',
    })
    await expect(
      viki.query(api.people.get, { householdId, personId }),
    ).rejects.toThrow('access denied')
    expect((await t.run((ctx) => ctx.db.get(personId)))?.householdId).toBe(
      householdId,
    )
    expect(await viki.query(api.households.list, {})).toHaveLength(1)
    expect(
      await robi.query(api.people.get, { householdId, personId }),
    ).toMatchObject({ name: 'Viki' })
  })

  it('enforces admin roles, protects the last admin, and allows transfer and leaving', async () => {
    const { robi, viki, householdId } = await setupHousehold()
    const rows = await robi.query(api.households.members, { householdId })
    const admin = rows.find((row) => row.isYou)!
    const member = rows.find((row) => !row.isYou)!
    await expect(
      viki.mutation(api.households.rename, { householdId, name: 'Forbidden' }),
    ).rejects.toThrow('Only household admins')
    await expect(
      viki.mutation(api.households.invite, { householdId }),
    ).rejects.toThrow('Only household admins')
    await expect(
      viki.mutation(api.households.updateMember, {
        householdId,
        memberId: admin._id,
        role: 'remove',
      }),
    ).rejects.toThrow('Only household admins')
    await expect(
      robi.mutation(api.households.updateMember, {
        householdId,
        memberId: admin._id,
        role: 'member',
      }),
    ).rejects.toThrow('last admin')
    await robi.mutation(api.households.rename, {
      householdId,
      name: '  Robi and Viki  ',
    })
    expect((await robi.query(api.households.list, {}))[0].name).toBe(
      'Robi and Viki',
    )
    await robi.mutation(api.households.updateMember, {
      householdId,
      memberId: member._id,
      role: 'admin',
    })
    await robi.mutation(api.households.updateMember, {
      householdId,
      memberId: admin._id,
      role: 'remove',
    })
    await expect(
      robi.query(api.households.members, { householdId }),
    ).rejects.toThrow('access denied')
    expect(
      await viki.query(api.households.members, { householdId }),
    ).toHaveLength(1)
  })

  it('keeps invitations hashed, single-use, revocable, and expired on the server', async () => {
    const t = createConvexTest()
    const robi = asTestUser(t)
    const viki = asTestUserWithToken(t, 'viki|token')
    const householdId = await robi.mutation(api.households.ensurePersonal, {})
    const token = await robi.mutation(api.households.invite, { householdId })
    const stored = (
      await t.run((ctx) => ctx.db.query('householdInvitations').collect())
    )[0]
    expect(stored.tokenHash).not.toContain(token)
    expect(stored).not.toHaveProperty('token')
    expect(
      await viki.query(api.households.inspectInvitation, {
        token,
        now: Date.now(),
      }),
    ).toEqual({ householdId, name: 'My household' })
    await robi.mutation(api.households.revokeInvitation, {
      householdId,
      invitationId: stored._id,
    })
    expect(
      await viki.query(api.households.inspectInvitation, {
        token,
        now: Date.now(),
      }),
    ).toBeNull()
    await expect(
      viki.mutation(api.households.acceptInvitation, { token }),
    ).rejects.toThrow('expired')
    const expired = await robi.mutation(api.households.invite, { householdId })
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000)
    await expect(
      viki.mutation(api.households.acceptInvitation, { token: expired }),
    ).rejects.toThrow('expired')
    vi.useRealTimers()
    const usable = await robi.mutation(api.households.invite, { householdId })
    await viki.mutation(api.households.acceptInvitation, { token: usable })
    await expect(
      asTestUserWithToken(t, 'other|token').mutation(
        api.households.acceptInvitation,
        { token: usable },
      ),
    ).rejects.toThrow('already used')
  })

  it('creates a separate personal household when a new account accepts an invitation directly', async () => {
    const t = createConvexTest()
    const robi = asTestUser(t)
    const householdId = await robi.mutation(api.households.ensurePersonal, {})
    const token = await robi.mutation(api.households.invite, { householdId })
    const newcomer = t.withIdentity({
      tokenIdentifier: 'https://clerk.example|new-account',
    })
    await newcomer.mutation(api.households.acceptInvitation, { token })
    const households = await newcomer.query(api.households.list, {})
    expect(households).toHaveLength(2)
    expect(households.find((row) => row._id !== householdId)?.role).toBe(
      'admin',
    )
  })

  it('requires authentication for household discovery, bootstrap, and invitation inspection', async () => {
    const t = createConvexTest()
    await expect(t.query(api.households.list, {})).rejects.toThrow(
      'Authentication required',
    )
    await expect(t.mutation(api.households.ensurePersonal, {})).rejects.toThrow(
      'Authentication required',
    )
    await expect(
      t.query(api.households.inspectInvitation, {
        token: 'invalid',
        now: Date.now(),
      }),
    ).rejects.toThrow('Authentication required')
  })
})
