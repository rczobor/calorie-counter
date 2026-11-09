// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  TEST_TOKEN_IDENTIFIER,
  testHouseholdId,
  testUserId,
} from '../src/tests/convex-test-utils'

vi.hoisted(() => {
  process.env.CONVEX_SITE_URL = 'https://widget.example.test'
})

const person = {
  name: 'Alex',
  currentDailyGoalKcal: 2000,
  effectiveDate: '2026-04-01',
}

function readDay(
  t: ReturnType<typeof createConvexTest>,
  token: string | null,
  date = '2026-04-04',
) {
  return t.fetch(`/widget/today?date=${date}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

async function setup() {
  const t = createConvexTest()
  const user = asTestUser(t)
  const personId = await user.mutation(api.nutrition.createPerson, person)
  const otherId = await user.mutation(api.nutrition.createPerson, {
    ...person,
    name: 'Sam',
  })
  for (const [id, calories] of [
    [personId, 450],
    [otherId, 900],
  ] as const)
    await user.mutation(api.nutrition.createMeal, {
      personId: id,
      eatenOn: '2026-04-04',
      items: [{ sourceType: 'fixedCalories', name: 'Soup', calories }],
    })
  const widget = await user.mutation(api.widgets.create, { personId })
  return { t, user, personId, widget }
}

describe('home screen widgets', () => {
  it("reads one person's day with the widget token", async () => {
    const { t, widget } = await setup()
    expect(widget.url).toBe('https://widget.example.test/widget/today')

    const response = await readDay(t, widget.token)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      person: 'Alex',
      eatenOn: '2026-04-04',
      goalKcal: 2000,
      consumedCalories: 450,
      remainingCalories: 1550,
    })
  })

  it('rejects a missing, unknown or removed token and a bad date', async () => {
    const { t, user, widget } = await setup()
    expect((await readDay(t, null)).status).toBe(401)
    expect((await readDay(t, 'ccw_unknown')).status).toBe(401)
    expect((await readDay(t, widget.token, '2026-02-30')).status).toBe(400)

    const [row] = await user.query(api.widgets.list, {})
    expect(row).toMatchObject({ person: 'Alex' })
    expect(await user.query(api.widgets.count, {})).toBe(1)
    await user.mutation(api.widgets.remove, { id: row.id })

    expect((await readDay(t, widget.token)).status).toBe(401)
  })

  it('stops working when the account leaves the household', async () => {
    const { t, widget } = await setup()
    const userId = await testUserId(t)
    const householdId = testHouseholdId(t)
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query('householdMembers')
        .withIndex('by_userId_and_householdId', (q) =>
          q.eq('userId', userId).eq('householdId', householdId),
        )
        .unique()
      if (membership) await ctx.db.delete(membership._id)
    })

    // Paused, not removed: it works again if the account rejoins, so it
    // must not tell people to create another one.
    const response = await readDay(t, widget.token)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: 'Open Calorie Counter to continue.',
    })
    // Still listed account-wide, so it can be removed.
    expect(
      await t
        .withIdentity({ tokenIdentifier: TEST_TOKEN_IDENTIFIER })
        .query(api.widgets.list, {}),
    ).toEqual([expect.objectContaining({ person: 'Alex' })])
  })

  it("keeps widgets to the account's own households and its own rows", async () => {
    const { t, user } = await setup()
    const stranger = asTestUserWithToken(t, 'https://example.test|stranger')
    const strangersPerson = await stranger.mutation(
      api.nutrition.createPerson,
      person,
    )
    await expect(
      user.mutation(api.widgets.create, { personId: strangersPerson }),
    ).rejects.toThrow('Person not found.')

    const [row] = await user.query(api.widgets.list, {})
    await expect(
      stranger.mutation(api.widgets.remove, { id: row.id }),
    ).rejects.toThrow('Widget not found.')
    expect(await stranger.query(api.widgets.list, {})).toEqual([])
  })
})
