// @vitest-environment edge-runtime
import mcpTest from '@convex-dev/mcp/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, components, internal } from './_generated/api'
import schema from './schema'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertCookSession,
  insertIngredient,
  insertMealItem,
  TEST_TOKEN_IDENTIFIER,
  testHouseholdId,
  testUserId,
} from '../src/tests/convex-test-utils'

type Test = ReturnType<typeof createConvexTest>

function setup() {
  vi.useFakeTimers()
  const t = createConvexTest()
  mcpTest.register(t)
  return t
}

afterEach(() => {
  vi.useRealTimers()
})

/** Row counts of every app table, so nothing can hide in a forgotten one. */
function countRows(t: Test) {
  return t.run(async (ctx) => {
    const counts: Partial<Record<keyof typeof schema.tables, number>> = {}
    for (const table of Object.keys(schema.tables) as Array<
      keyof typeof schema.tables
    >) {
      const rows = await ctx.db.query(table).collect()
      if (rows.length) counts[table] = rows.length
    }
    return counts
  })
}

const person = {
  name: 'Alex',
  currentDailyGoalKcal: 2000,
  effectiveDate: '2026-04-04',
}

describe('account deletion', () => {
  it('deletes an account and every household only it belonged to, in batches', async () => {
    const t = setup()
    const other = asTestUserWithToken(t, 'https://example.test|other')
    await other.mutation(api.nutrition.createPerson, person)
    const untouched = await countRows(t)

    const user = asTestUser(t)
    await user.mutation(api.userPreferences.setLocale, { locale: 'hu' })
    await user.mutation(api.hints.setSeen, { hint: 'history' })
    const personId = await user.mutation(api.nutrition.createPerson, person)
    const mealId = await user.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: '2026-04-04',
      items: [{ sourceType: 'fixedCalories', name: 'Soup', calories: 300 }],
    })
    await user.mutation(api.weight.record, {
      personId,
      measuredOn: '2026-04-04',
      weightKg: 80,
    })
    await insertIngredient(t)
    await insertCookSession(t)
    await insertMealItem(t, mealId)
    const userId = await testUserId(t)
    const householdId = testHouseholdId(t)
    await t.run(async (ctx) => {
      // More rows than one deletion batch.
      for (let index = 0; index < 250; index += 1)
        await ctx.db.insert('dailySummaries', {
          ownerUserId: userId,
          householdId,
          personId,
          eatenOn: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
          consumedCalories: 100,
          mealCount: 1,
          createdAt: 0,
          updatedAt: 0,
        })
      await ctx.db.insert('mcpOperations', {
        ownerUserId: userId,
        householdId,
        connectionId: 'connection',
        operation: 'meal',
        key: 'meal:1',
        input: '{}',
        result: {
          mealId,
          personId,
          eatenOn: '2026-04-04',
          totalCalories: 300,
          path: '/',
        },
      })
    })
    await t.mutation(components.mcp.grants.createApiKey, {
      userId: TEST_TOKEN_IDENTIFIER,
      name: 'Assistant',
      scopes: ['nutrition:read'],
      resource: 'https://mcp.example.test/mcp',
      hash: 'hash',
    })

    await user.mutation(api.widgets.create, { personId })

    await user.mutation(api.account.deleteMyAccount, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await countRows(t)).toEqual(untouched)
    expect(
      await t.query(components.mcp.grants.list, {
        userId: TEST_TOKEN_IDENTIFIER,
      }),
    ).toEqual([])
  })

  it('leaves a shared household and its data with the other members', async () => {
    const t = setup()
    const robi = asTestUser(t)
    const householdId = await robi.mutation(api.households.ensurePersonal, {})
    const viki = asTestUserWithToken(t, 'https://example.test|viki')
    await viki.mutation(api.households.acceptInvitation, {
      token: await robi.mutation(api.households.invite, { householdId }),
    })
    await robi.mutation(api.households.invite, { householdId })
    const personId = await viki.mutation(api.nutrition.createPerson, {
      ...person,
      householdId,
    })
    await robi.mutation(api.nutrition.createMeal, {
      householdId,
      personId,
      eatenOn: '2026-04-04',
      items: [{ sourceType: 'fixedCalories', name: 'Soup', calories: 300 }],
    })
    await robi.mutation(api.nutrition.setPersonLinkedToMe, {
      householdId,
      personId,
      linked: true,
    })

    await robi.mutation(api.account.deleteMyAccount, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    // The person stays, without a link to the deleted account.
    expect(
      (await viki.query(api.people.get, { householdId, personId }))
        ?.linkedAccount,
    ).toBeUndefined()
    // Viki becomes the admin; the household is nobody's personal one now.
    expect(await viki.query(api.households.members, { householdId })).toEqual([
      expect.objectContaining({ role: 'admin', isYou: true }),
    ])
    const remaining = await t.run(async (ctx) => ({
      household: await ctx.db.get(householdId),
      meals: await ctx.db.query('meals').collect(),
      invitations: await ctx.db.query('householdInvitations').collect(),
      robi: await ctx.db
        .query('users')
        .withIndex('by_tokenIdentifier', (q) =>
          q.eq('tokenIdentifier', TEST_TOKEN_IDENTIFIER),
        )
        .unique(),
    }))
    expect(remaining.household).toMatchObject({ name: 'My household' })
    expect(remaining.household?.personalOwnerUserId).toBeUndefined()
    expect(remaining.meals).toHaveLength(1)
    expect(remaining.invitations).toEqual([])
    expect(remaining.robi).toBeNull()
  })

  it('never deletes a household that still has a member', async () => {
    const t = setup()
    const user = asTestUser(t)
    await user.mutation(api.nutrition.createPerson, person)
    const before = await countRows(t)
    await t.mutation(internal.account.deleteHousehold, {
      householdId: testHouseholdId(t),
    })
    expect(await countRows(t)).toEqual(before)
  })

  it('requires a signed-in account', async () => {
    const t = setup()
    await expect(t.mutation(api.account.deleteMyAccount, {})).rejects.toThrow(
      'Authentication required',
    )
  })
})
