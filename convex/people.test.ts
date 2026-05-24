// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertCookSession,
  insertMeal,
} from '../src/tests/convex-test-utils'

describe('nutrition people mutations', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-04T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a trimmed person and initial goal history entry', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)

    const personId = await user.mutation(api.nutrition.createPerson, {
      name: '  Alex  ',
      currentDailyGoalKcal: 2200,
      notes: '  Training block  ',
    })

    const { person, history } = await t.run(async (ctx) => {
      const person = await ctx.db.get(personId)
      const history = await ctx.db
        .query('personGoalHistory')
        .withIndex('by_person_createdAt', (q) => q.eq('personId', personId))
        .collect()
      return { person, history }
    })

    expect(person).toMatchObject({
      name: 'Alex',
      notes: 'Training block',
      currentDailyGoalKcal: 2200,
      active: true,
    })
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({
      personId,
      effectiveDate: '2026-04-04',
      goalKcal: 2200,
      reason: 'Initial goal',
    })
  })

  it('stores the canonical auth token identifier for new owned records', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)

    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
    })

    const records = await t.run(async (ctx) => {
      const person = await ctx.db.get(personId)
      const history = await ctx.db
        .query('personGoalHistory')
        .withIndex('by_person_createdAt', (q) => q.eq('personId', personId))
        .collect()
      return { person, history }
    })

    expect(records.person).toMatchObject({
      ownerUserId: 'user-1',
      ownerTokenIdentifier: 'user-1|token',
    })
    expect(records.history[0]).toMatchObject({
      ownerUserId: 'user-1',
      ownerTokenIdentifier: 'user-1|token',
    })
  })

  it('rejects writes from a different token with the same subject', async () => {
    const t = createConvexTest()
    const owner = asTestUser(t)
    const sameSubjectDifferentToken = asTestUserWithToken(t, 'user-1|other-token')

    const personId = await owner.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
    })

    await expect(
      sameSubjectDifferentToken.mutation(api.nutrition.updatePerson, {
        personId,
        name: 'Intruder',
      }),
    ).rejects.toThrowError('Person not found.')
  })

  it('updates the current goal and appends goal history', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
    })

    await user.mutation(api.nutrition.updatePersonGoal, {
      personId,
      goalKcal: 1800,
      effectiveDate: '2026-04-05',
      reason: '  Cutting  ',
    })

    const { person, history } = await t.run(async (ctx) => {
      const person = await ctx.db.get(personId)
      const history = await ctx.db
        .query('personGoalHistory')
        .withIndex('by_person_createdAt', (q) => q.eq('personId', personId))
        .collect()
      return { person, history }
    })

    expect(person?.currentDailyGoalKcal).toBe(1800)
    expect(history).toHaveLength(2)
    expect(history[history.length - 1]).toMatchObject({
      effectiveDate: '2026-04-05',
      goalKcal: 1800,
      reason: 'Cutting',
    })
  })

  it('refuses to delete a person with meal history', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
    })
    await insertMeal(t, personId)

    await expect(
      user.mutation(api.nutrition.deletePerson, { personId }),
    ).rejects.toThrowError('Cannot delete person with meal/cooking history.')
  })

  it('refuses to delete a person with cooking history', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
    })
    await insertCookSession(t, { cookedByPersonId: personId })

    await expect(
      user.mutation(api.nutrition.deletePerson, { personId }),
    ).rejects.toThrowError('Cannot delete person with meal/cooking history.')
  })
})
