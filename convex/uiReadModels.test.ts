// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'
import { api, internal } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  testHouseholdId,
  TEST_TOKEN_IDENTIFIER,
} from '../src/tests/convex-test-utils'

const paginationOpts = { numItems: 20, cursor: null }

async function fixture() {
  const t = createConvexTest()
  const user = asTestUser(t)
  const personId = await user.mutation(api.nutrition.createPerson, {
    name: 'Alex',
    currentDailyGoalKcal: 2000,
    effectiveDate: '2026-10-01',
  })
  return { t, user, personId, householdId: testHouseholdId(t) }
}

describe('dated browser nutrition', () => {
  it('uses the effective goal and complete saved totals independently of meal pages', async () => {
    const { user, personId } = await fixture()
    await user.mutation(api.nutrition.updatePersonGoal, {
      personId,
      expectedEditRevision: 0,
      goalKcal: 2300,
      effectiveDate: '2026-11-01',
    })
    for (const calories of [350, 450])
      await user.mutation(api.nutrition.createMeal, {
        personId,
        eatenOn: '2026-10-31',
        items: [{ sourceType: 'fixedCalories', name: 'Lunch', calories }],
      })
    const page = await user.query(api.meals.listForDay, {
      personId,
      eatenOn: '2026-10-31',
      archived: false,
      paginationOpts: { numItems: 1, cursor: null },
    })
    expect(page.page).toHaveLength(1)
    expect(page.isDone).toBe(false)
    const summary = await user.query(api.meals.getDayNutrition, {
      personId,
      eatenOn: '2026-10-31',
    })
    expect(summary).toMatchObject({
      consumedCalories: 800,
      goalKcal: 2000,
      remainingCalories: 1200,
      mealCount: 2,
    })
    expect(summary).not.toHaveProperty('capturedAt')
    const people = await user.query(api.people.listForDay, {
      archived: false,
      eatenOn: '2026-10-31',
      paginationOpts,
    })
    expect(people.page[0]).toMatchObject({
      _id: personId,
      consumedCalories: 800,
      goalKcal: 2000,
      remainingCalories: 1200,
      mealCount: 2,
    })
    expect(
      await user.query(api.meals.getDayNutrition, {
        personId,
        eatenOn: '2026-11-02',
      }),
    ).toMatchObject({ consumedCalories: 0, goalKcal: 2300, mealCount: 0 })
  })

  it('rejects foreign people, invalid dates, and unauthenticated reads', async () => {
    const { t, user, personId } = await fixture()
    const other = asTestUserWithToken(t, 'other|token')
    await expect(
      other.query(api.meals.getDayNutrition, {
        personId,
        eatenOn: '2026-10-31',
      }),
    ).rejects.toThrow('Person not found')
    await expect(
      user.query(api.people.listForDay, {
        archived: false,
        eatenOn: '2026-02-30',
        paginationOpts,
      }),
    ).rejects.toThrow('date')
    await expect(
      t.query(api.meals.getDayNutrition, { personId, eatenOn: '2026-10-31' }),
    ).rejects.toThrow('Authentication required')
  })
})

describe('account logging preference controls', () => {
  it('shares stored defaults and validation with MCP without using a connection identity', async () => {
    const { t, user, personId, householdId } = await fixture()
    expect(await user.query(api.mcpPreferences.get, {})).toBeNull()
    const preferences = {
      householdId,
      personId,
      timeZone: 'Europe/Budapest',
      confirmationMode: 'explicitOnly' as const,
    }
    await user.mutation(api.mcpPreferences.update, { preferences })
    expect(await user.query(api.mcpPreferences.get, {})).toEqual({
      ...preferences,
      householdName: 'My household',
      personName: 'Alex',
      available: true,
    })
    expect(
      (
        await t.mutation(internal.mcpOperations.getLoggingContext, {
          user: {
            userId: TEST_TOKEN_IDENTIFIER,
            connectionId: 'test-defaults',
            scopes: ['nutrition:read'],
          },
          now: Date.parse('2026-11-01T23:30:00Z'),
        })
      ).context,
    ).toMatchObject({
      defaultPersonId: personId,
      confirmationMode: 'explicitOnly',
    })
    await expect(
      user.mutation(api.mcpPreferences.update, {
        preferences: { ...preferences, timeZone: 'invalid/timezone' },
      }),
    ).rejects.toThrow('IANA timezone')
    await expect(t.query(api.mcpPreferences.get, {})).rejects.toThrow(
      'Authentication required',
    )
    await expect(
      t.mutation(api.mcpPreferences.update, { preferences: null }),
    ).rejects.toThrow('Authentication required')
  })

  it('allows inspecting and clearing unavailable defaults without exposing revoked household data', async () => {
    const { t, user, personId, householdId } = await fixture()
    await user.mutation(api.mcpPreferences.update, {
      preferences: {
        householdId,
        personId,
        timeZone: 'Europe/Budapest',
        confirmationMode: 'always',
      },
    })
    await t.run(async (ctx) => {
      const member = await ctx.db
        .query('householdMembers')
        .withIndex('by_tokenIdentifier_and_householdId', (q) =>
          q
            .eq('tokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('householdId', householdId),
        )
        .unique()
      if (!member) throw new Error('Expected test membership.')
      await ctx.db.delete(member._id)
    })
    expect(await user.query(api.mcpPreferences.get, {})).toMatchObject({
      householdName: null,
      personName: null,
      available: false,
    })
    await user.mutation(api.mcpPreferences.update, { preferences: null })
    expect(await user.query(api.mcpPreferences.get, {})).toBeNull()
  })

  it('rejects a foreign household/person pair and flags an archived remembered person', async () => {
    const { t, user, personId, householdId } = await fixture()
    const other = asTestUserWithToken(t, 'other|token')
    const foreignPersonId = await other.mutation(api.nutrition.createPerson, {
      name: 'Other person',
      currentDailyGoalKcal: 2100,
      effectiveDate: '2026-11-01',
    })
    const preferences = {
      householdId,
      personId,
      timeZone: 'Europe/Budapest',
      confirmationMode: 'always' as const,
    }
    await expect(
      other.mutation(api.mcpPreferences.update, { preferences }),
    ).rejects.toThrow('Household access denied')
    await expect(
      user.mutation(api.mcpPreferences.update, {
        preferences: { ...preferences, personId: foreignPersonId },
      }),
    ).rejects.toThrow('Person not found')
    expect(await other.query(api.mcpPreferences.get, {})).toBeNull()
    await user.mutation(api.mcpPreferences.update, { preferences })
    await user.mutation(api.nutrition.setPersonArchived, {
      personId,
      expectedEditRevision: 0,
      archived: true,
    })
    expect(await user.query(api.mcpPreferences.get, {})).toMatchObject({
      personName: 'Alex',
      available: false,
    })
    await expect(
      user.mutation(api.mcpPreferences.update, { preferences }),
    ).rejects.toThrow('archived')
  })
})
