// @vitest-environment edge-runtime
import { describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  createConvexTest,
  testHouseholdId,
  testUserId,
} from '../src/tests/convex-test-utils'

vi.hoisted(() => {
  process.env.MCP_CONSENT_URL = 'https://app.example.test/connect'
})

const today = '2026-04-10'

async function setup() {
  const t = createConvexTest()
  const user = asTestUser(t)
  const personId = await user.mutation(api.nutrition.createPerson, {
    name: 'Alex',
    currentDailyGoalKcal: 2000,
    effectiveDate: '2026-04-01',
  })
  const logOn = (...days: string[]) =>
    Promise.all(
      days.map((eatenOn) =>
        user.mutation(api.nutrition.createMeal, {
          personId,
          eatenOn,
          items: [{ sourceType: 'fixedCalories', name: 'Soup', calories: 300 }],
        }),
      ),
    )
  const eligible = () => user.query(api.hints.eligible, { today })
  return { t, user, personId, logOn, eligible }
}

describe('feature hints', () => {
  it('stay quiet on the first day', async () => {
    const { logOn, eligible } = await setup()
    await logOn(today, today, '2026-04-11')
    expect(await eligible()).toEqual([])
  })

  it('qualify by logged days and never show again once seen', async () => {
    const { user, logOn, eligible } = await setup()
    await logOn('2026-04-08', '2026-04-09')
    expect(await eligible()).toEqual(['history'])

    await logOn('2026-04-07')
    expect(await eligible()).toEqual(['assistant', 'history'])

    await user.mutation(api.hints.setSeen, { hint: 'history', seen: true })
    await user.mutation(api.hints.setSeen, { hint: 'history', seen: true })
    expect(await eligible()).toEqual(['assistant'])

    await user.mutation(api.hints.setSeen, { hint: 'history', seen: false })
    expect(await eligible()).toEqual(['assistant', 'history'])
  })

  it('skip a feature that is already in use', async () => {
    const { t, user, personId, logOn, eligible } = await setup()
    await logOn('2026-04-05', '2026-04-06', '2026-04-07', '2026-04-08')
    await user.mutation(api.nutrition.setPersonLinkedToMe, {
      personId,
      linked: true,
    })
    await user.mutation(api.nutrition.createPerson, {
      name: 'Viki',
      currentDailyGoalKcal: 1800,
      effectiveDate: '2026-04-01',
    })
    expect(await eligible()).toEqual([
      'assistant',
      'history',
      'weighIn',
      'invite',
    ])

    await user.mutation(api.weight.record, {
      personId,
      measuredOn: '2026-04-09',
      weightKg: 80,
    })
    await user.mutation(api.households.invite, {
      householdId: testHouseholdId(t),
    })
    // An assistant write, as the MCP server records it.
    const userId = await testUserId(t)
    await t.run(async (ctx) => {
      const meal = await ctx.db.query('meals').first()
      if (!meal) throw new Error('Expected a meal.')
      await ctx.db.insert('mcpOperations', {
        ownerUserId: userId,
        connectionId: 'connection',
        operation: 'meal',
        key: 'key',
        input: '{}',
        result: {
          mealId: meal._id,
          personId,
          eatenOn: meal.eatenOn,
          totalCalories: meal.totalCalories,
          path: '/',
        },
      })
    })
    expect(await eligible()).toEqual(['history'])
  })
})
