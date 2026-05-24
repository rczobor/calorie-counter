// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  createConvexTest,
  insertMeal,
  insertMealItem,
} from '../src/tests/convex-test-utils'

describe('nutrition scoped queries', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('normalizes the dashboard meal date before querying', async () => {
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
    expect(data.mealItems).toHaveLength(1)
  })
})
