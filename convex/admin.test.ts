// @vitest-environment edge-runtime
import { afterEach, describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import { engagementStatus } from './admin'
import { shiftDay } from './lib/energy'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertCookSession,
  insertMeal,
  insertMealItem,
  insertPerson,
  testHouseholdId,
  testUserId,
} from '../src/tests/convex-test-utils'

// Rows get real creation times, so the window ends on the real date.
const today = new Date().toISOString().slice(0, 10)
const day = (offset: number) => shiftDay(today, offset)

afterEach(() => {
  delete process.env.SUPER_ADMIN_USER_IDS
})

describe('usage dashboard access', () => {
  it('opens only for accounts listed in SUPER_ADMIN_USER_IDS', async () => {
    const t = createConvexTest()
    const admin = asTestUser(t)
    const other = asTestUserWithToken(t, 'https://example.test|other')
    expect(await admin.query(api.admin.isSuperAdmin, {})).toBe(false)

    process.env.SUPER_ADMIN_USER_IDS = ` ${await testUserId(t)} ,`
    expect(await admin.query(api.admin.isSuperAdmin, {})).toBe(true)
    expect(await other.query(api.admin.isSuperAdmin, {})).toBe(false)
    expect(await t.query(api.admin.isSuperAdmin, {})).toBe(false)
    await expect(other.query(api.admin.engagement, { today })).rejects.toThrow(
      'Not found.',
    )
    await expect(t.query(api.admin.engagement, { today })).rejects.toThrow(
      'Not found.',
    )
  })
})

describe('usage dashboard', () => {
  it('reports who logs and how, without what anyone ate', async () => {
    const t = createConvexTest()
    const admin = asTestUser(t)
    const drifter = 'https://example.test|drifter'
    const quiet = asTestUserWithToken(t, 'https://example.test|quiet')
    await quiet.query(api.admin.isSuperAdmin, {})
    await admin.query(api.admin.isSuperAdmin, {})
    const personId = await insertPerson(t)
    const adminId = await testUserId(t)
    const householdId = testHouseholdId(t)
    process.env.SUPER_ADMIN_USER_IDS = adminId

    // Logged in the app, so it is tagged and updates the day's summary.
    await admin.mutation(api.nutrition.createMeal, {
      personId,
      eatenOn: day(-1),
      items: [{ sourceType: 'fixedCalories', name: 'Soup', calories: 2000 }],
    })
    const agentMeal = await insertMeal(t, personId, {
      eatenOn: day(-2),
      source: 'agent',
    })
    await insertMealItem(t, agentMeal)
    await insertMeal(t, personId, { eatenOn: day(-2), editRevision: 1 })
    // Archiving bumps the revision too, but is not an edit.
    await insertMeal(t, personId, {
      eatenOn: day(-3),
      source: 'web',
      archived: true,
      editRevision: 1,
    })
    await insertMeal(t, personId, { eatenOn: day(-30), source: 'web' })
    await insertMeal(t, personId, { eatenOn: day(-40), source: 'web' })
    // Planned ahead: neither activity nor the last logged day.
    await insertMeal(t, personId, { eatenOn: day(3), source: 'web' })
    const drifterPerson = await insertPerson(t, { account: drifter })
    for (const offset of [-35, -36])
      await insertMeal(t, drifterPerson, {
        account: drifter,
        eatenOn: day(offset),
        source: 'web',
      })
    await insertCookSession(t)

    await t.run(async (ctx) => {
      await ctx.db.insert('personGoalHistory', {
        ownerUserId: adminId,
        householdId,
        personId,
        effectiveDate: day(-2),
        goalKcal: 2600,
        createdAt: Date.now(),
      })
      for (const [offset, consumedCalories] of [
        [-3, 1500],
        [-4, 2050],
        [-5, 2500],
        // Today is not over, so it does not count yet.
        [0, 5000],
      ])
        await ctx.db.insert('dailySummaries', {
          ownerUserId: adminId,
          householdId,
          personId,
          eatenOn: day(offset),
          consumedCalories,
          mealCount: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
    })

    const result = await admin.query(api.admin.engagement, { today })

    const byId = new Map(result.accounts.map((row) => [row.userId, row]))
    expect(byId.get(adminId)).toEqual({
      userId: adminId,
      // The membership name, from the sign-in's name or email when present.
      name: 'Household creator',
      joinedAt: expect.any(Number),
      households: 1,
      lastLoggedOn: day(-1),
      daysLogged: 3,
      previousDaysLogged: 2,
      meals: 4,
      webMeals: 2,
      agentMeals: 1,
      untaggedMeals: 1,
      status: 'new',
    })
    expect(byId.get(await testUserId(t, drifter))).toMatchObject({
      lastLoggedOn: day(-35),
      daysLogged: 0,
      previousDaysLogged: 2,
      meals: 0,
    })
    expect(
      byId.get(await testUserId(t, 'https://example.test|quiet')),
    ).toMatchObject({ lastLoggedOn: null, daysLogged: 0, meals: 0 })
    expect(result.partial).toBe(false)
    expect(result.totals).toEqual({
      meals: 4,
      webMeals: 2,
      agentMeals: 1,
      untaggedMeals: 1,
      editedMeals: 1,
      items: {
        ingredient: 0,
        cookedFood: 0,
        customByWeight: 1,
        fixedCalories: 1,
      },
      cookSessions: 1,
      // Day -1: 2000 of a 2600 goal. Days -3 to -5 predate it: 2000.
      goalDays: { under: 2, near: 1, over: 1 },
    })
  })

  it('says its figures are partial when an account has more meals than it reads', async () => {
    const t = createConvexTest()
    const admin = asTestUser(t)
    await admin.query(api.admin.isSuperAdmin, {})
    const userId = await testUserId(t)
    const householdId = testHouseholdId(t)
    const personId = await insertPerson(t)
    process.env.SUPER_ADMIN_USER_IDS = userId
    await t.run(async (ctx) => {
      for (let index = 0; index < 500; index += 1)
        await ctx.db.insert('meals', {
          ownerUserId: userId,
          householdId,
          personId,
          eatenOn: day(-(index % 50)),
          archived: false,
          totalCalories: 100,
          itemCount: 1,
          createdAt: Date.now(),
          source: 'web',
        })
    })
    const result = await admin.query(api.admin.engagement, { today })
    expect(result.partial).toBe(true)
    // The newest meals are the ones read.
    expect(result.accounts[0]).toMatchObject({ lastLoggedOn: today })
  })

  it('rejects a malformed date', async () => {
    const t = createConvexTest()
    const admin = asTestUser(t)
    await admin.query(api.admin.isSuperAdmin, {})
    process.env.SUPER_ADMIN_USER_IDS = await testUserId(t)
    await expect(
      admin.query(api.admin.engagement, { today: 'yesterday' }),
    ).rejects.toThrow('Today must be in YYYY-MM-DD format.')
  })
})

describe('engagement status', () => {
  const base = {
    today: '2026-11-09',
    joinedOn: '2026-08-01',
    lastLoggedOn: '2026-11-08',
    daysLogged: 20,
    previousDaysLogged: 20,
  }
  it.each([
    ['active', {}],
    ['new', { joinedOn: '2026-11-01' }],
    ['new', { joinedOn: '2026-11-01', lastLoggedOn: null, daysLogged: 0 }],
    [
      'neverStarted',
      { lastLoggedOn: null, daysLogged: 0, previousDaysLogged: 0 },
    ],
    ['lapsed', { lastLoggedOn: '2026-10-01', daysLogged: 0 }],
    ['slipping', { lastLoggedOn: '2026-11-02', daysLogged: 12 }],
    ['active', { lastLoggedOn: '2026-11-03' }],
    ['slipping', { daysLogged: 8, previousDaysLogged: 16 }],
    // Too little history to call a halving a drop.
    ['active', { daysLogged: 3, previousDaysLogged: 6 }],
  ] as const)('%s for %o', (status, change) => {
    expect(engagementStatus({ ...base, ...change })).toBe(status)
  })
})
