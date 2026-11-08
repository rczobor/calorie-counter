// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, internal } from './_generated/api'
import { createConvexTest } from '../src/tests/convex-test-utils'

type Test = ReturnType<typeof createConvexTest>

const DEV_TOKEN = 'https://clerk.dev.example|user_dev'
const PROD_TOKEN = 'https://clerk.prod.example|user_prod'
// More than one migration batch, so the continuation cursor is exercised.
const EXTRA_PEOPLE = 120

// Rows exactly as the app wrote them before the users table existed.
async function insertLegacyAccount(t: Test) {
  return t.run(async (ctx) => {
    const householdId = await ctx.db.insert('households', {
      name: 'Home',
      personalOwnerTokenIdentifier: DEV_TOKEN,
      createdAt: 1,
    })
    await ctx.db.insert('householdMembers', {
      householdId,
      tokenIdentifier: DEV_TOKEN,
      name: 'Robi',
      role: 'admin',
      joinedAt: 1,
    })
    const person = {
      householdId,
      ownerTokenIdentifier: DEV_TOKEN,
      currentDailyGoalKcal: 2000,
      editRevision: 0,
      archived: false,
      createdAt: 1,
    }
    const personId = await ctx.db.insert('people', { ...person, name: 'Alex' })
    for (let index = 0; index < EXTRA_PEOPLE; index += 1)
      await ctx.db.insert('people', { ...person, name: `Person ${index}` })
    await ctx.db.insert('householdInvitations', {
      householdId,
      tokenHash: 'invitation-hash',
      createdBy: DEV_TOKEN,
      expiresAt: 2,
    })
    await ctx.db.insert('userPreferences', {
      tokenIdentifier: DEV_TOKEN,
      locale: 'hu',
    })
    await ctx.db.insert('mcpPreferences', {
      tokenIdentifier: DEV_TOKEN,
      householdId,
      personId,
      timeZone: 'Europe/Budapest',
      confirmationMode: 'always',
    })
    return householdId
  })
}

// Reads without the bootstrap mutation, as an already-open browser tab would.
async function readAccount(t: Test, tokenIdentifier: string) {
  const user = t.withIdentity({ tokenIdentifier })
  const households = await user.query(api.households.list, {})
  const householdId = households[0]?._id
  return {
    households,
    people: householdId
      ? (
          await user.query(api.people.list, {
            householdId,
            archived: false,
            paginationOpts: { numItems: 1, cursor: null },
          })
        ).page.map((person) => person.name)
      : [],
    locale: await user.query(api.userPreferences.getLocale, {}),
    assistantDefaults: await user.query(api.mcpPreferences.get, {}),
  }
}

async function rekeyAccounts(t: Test) {
  await t.mutation(internal.migrations.rekeyAccounts, {})
  await t.finishAllScheduledFunctions(vi.runAllTimers)
}

async function dumpAccountTables(t: Test) {
  return t.run(async (ctx) => ({
    users: await ctx.db.query('users').collect(),
    households: await ctx.db.query('households').collect(),
    householdMembers: await ctx.db.query('householdMembers').collect(),
    householdInvitations: await ctx.db.query('householdInvitations').collect(),
    people: await ctx.db.query('people').collect(),
    userPreferences: await ctx.db.query('userPreferences').collect(),
    mcpPreferences: await ctx.db.query('mcpPreferences').collect(),
  }))
}

describe('rekeying accounts to users rows', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serves legacy rows before the backfill and identical data after it', async () => {
    const t = createConvexTest()
    const householdId = await insertLegacyAccount(t)
    // A visit after deploy creates the users row while every other row is legacy.
    await t
      .withIdentity({ tokenIdentifier: DEV_TOKEN })
      .mutation(api.households.ensurePersonal, {})
    const before = await readAccount(t, DEV_TOKEN)
    expect(before).toMatchObject({
      households: [{ _id: householdId, name: 'Home', role: 'admin' }],
      people: ['Alex'],
      locale: 'hu',
      assistantDefaults: { householdName: 'Home', available: true },
    })

    await rekeyAccounts(t)

    const tables = await dumpAccountTables(t)
    expect(tables.users).toHaveLength(1)
    const userId = tables.users[0]._id
    expect(tables.households).toMatchObject([{ personalOwnerUserId: userId }])
    expect(tables.householdMembers).toMatchObject([{ userId }])
    expect(tables.householdInvitations).toMatchObject([
      { createdByUserId: userId },
    ])
    expect(tables.people).toHaveLength(EXTRA_PEOPLE + 1)
    expect(tables.people.every((row) => row.ownerUserId === userId)).toBe(true)
    expect(tables.userPreferences).toMatchObject([{ userId }])
    expect(tables.mcpPreferences).toMatchObject([{ userId }])
    expect(JSON.stringify(tables)).not.toMatch(
      /"(ownerTokenIdentifier|personalOwnerTokenIdentifier|createdBy)"/,
    )
    expect(
      [
        ...tables.householdMembers,
        ...tables.userPreferences,
        ...tables.mcpPreferences,
      ].some((row) => 'tokenIdentifier' in row),
    ).toBe(false)
    expect(await readAccount(t, DEV_TOKEN)).toEqual(before)

    await rekeyAccounts(t)
    expect(await dumpAccountTables(t)).toEqual(tables)
  })

  it('moves every row to a new Clerk identity by rewriting only the users row', async () => {
    const t = createConvexTest()
    await insertLegacyAccount(t)
    const before = await readAccount(t, DEV_TOKEN)
    await rekeyAccounts(t)

    await t.run(async (ctx) => {
      const user = await ctx.db.query('users').unique()
      if (!user) throw new Error('Expected the rekeyed account.')
      await ctx.db.patch(user._id, { tokenIdentifier: PROD_TOKEN })
    })

    expect(await readAccount(t, PROD_TOKEN)).toEqual(before)
    expect(await readAccount(t, DEV_TOKEN)).toMatchObject({
      households: [],
      locale: null,
      assistantDefaults: null,
    })
  })
})
