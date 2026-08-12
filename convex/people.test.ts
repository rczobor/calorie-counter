// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertCookSession,
  insertMeal,
  readEditRevision,
  TEST_TOKEN_IDENTIFIER,
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
      effectiveDate: '2026-04-04',
    })

    const { person, history } = await t.run(async (ctx) => {
      const person = await ctx.db.get(personId)
      const history = await ctx.db
        .query('personGoalHistory')
        .withIndex('by_ownerTokenIdentifier_and_personId_and_createdAt', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('personId', personId),
        )
        .collect()
      return { person, history }
    })

    expect(person).toMatchObject({
      name: 'Alex',
      notes: 'Training block',
      currentDailyGoalKcal: 2200,
      archived: false,
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
      effectiveDate: '2026-04-04',
    })

    const records = await t.run(async (ctx) => {
      const person = await ctx.db.get(personId)
      const history = await ctx.db
        .query('personGoalHistory')
        .withIndex('by_ownerTokenIdentifier_and_personId_and_createdAt', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('personId', personId),
        )
        .collect()
      return { person, history }
    })

    expect(records.person).toMatchObject({
      ownerTokenIdentifier: 'user-1|token',
    })
    expect(records.history[0]).toMatchObject({
      ownerTokenIdentifier: 'user-1|token',
    })
    expect(records.person).not.toHaveProperty('ownerUserId')
    expect(records.history[0]).not.toHaveProperty('ownerUserId')
  })

  it('rejects writes from a different token with the same subject', async () => {
    const t = createConvexTest()
    const owner = asTestUser(t)
    const sameSubjectDifferentToken = asTestUserWithToken(
      t,
      'user-1|other-token',
    )

    const personId = await owner.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
      effectiveDate: '2026-04-04',
    })

    await expect(
      sameSubjectDifferentToken.mutation(api.nutrition.updatePerson, {
        personId,
        expectedEditRevision: await readEditRevision(t, personId),
        name: 'Intruder',
        effectiveDate: '2026-04-04',
      }),
    ).rejects.toThrowError('Person not found.')
  })

  it('point-loads only an owned person without exposing owner metadata', async () => {
    const t = createConvexTest()
    const owner = asTestUser(t)
    const otherUser = asTestUserWithToken(t, 'user-2|token')
    const personId = await owner.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
      effectiveDate: '2026-04-04',
    })

    const person = await owner.query(api.people.get, { personId })

    expect(person).toMatchObject({ _id: personId, name: 'Alex' })
    expect(person).not.toHaveProperty('ownerTokenIdentifier')
    await expect(
      otherUser.query(api.people.get, { personId }),
    ).resolves.toBeNull()
  })

  it('returns empty goal history for deleted or foreign people', async () => {
    const t = createConvexTest()
    const owner = asTestUser(t)
    const otherUser = asTestUserWithToken(t, 'user-2|token')
    const personId = await owner.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
      effectiveDate: '2026-04-04',
    })
    const paginationOpts = { cursor: null, numItems: 10 }

    await expect(
      otherUser.query(api.people.listGoalHistory, {
        personId,
        paginationOpts,
      }),
    ).resolves.toMatchObject({ page: [], isDone: true })

    await owner.mutation(api.nutrition.deletePerson, {
      personId,
      expectedEditRevision: 0,
    })
    await expect(
      owner.query(api.people.listGoalHistory, {
        personId,
        paginationOpts,
      }),
    ).resolves.toMatchObject({ page: [], isDone: true })
  })

  it('updates the current goal and appends goal history', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
      effectiveDate: '2026-04-04',
    })

    await user.mutation(api.nutrition.updatePersonGoal, {
      personId,
      expectedEditRevision: await readEditRevision(t, personId),
      goalKcal: 1800,
      effectiveDate: '2026-04-05',
      reason: '  Cutting  ',
    })

    const { person, history } = await t.run(async (ctx) => {
      const person = await ctx.db.get(personId)
      const history = await ctx.db
        .query('personGoalHistory')
        .withIndex('by_ownerTokenIdentifier_and_personId_and_createdAt', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('personId', personId),
        )
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

  it('updates profile and goal atomically without erasing notes or duplicating history', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
      notes: 'Keep this note',
      effectiveDate: '2026-04-04',
    })

    await user.mutation(api.nutrition.updatePerson, {
      personId,
      expectedEditRevision: await readEditRevision(t, personId),
      name: 'Alex Updated',
      goalKcal: 1800,
      effectiveDate: '2026-04-05',
      reason: 'Cutting',
    })
    await user.mutation(api.nutrition.updatePerson, {
      personId,
      expectedEditRevision: await readEditRevision(t, personId),
      name: 'Alex Updated',
      goalKcal: 1800,
      effectiveDate: '2026-04-05',
    })

    const { person, history } = await t.run(async (ctx) => ({
      person: await ctx.db.get(personId),
      history: await ctx.db
        .query('personGoalHistory')
        .withIndex('by_ownerTokenIdentifier_and_personId_and_createdAt', (q) =>
          q
            .eq('ownerTokenIdentifier', TEST_TOKEN_IDENTIFIER)
            .eq('personId', personId),
        )
        .collect(),
    }))

    expect(person).toMatchObject({
      name: 'Alex Updated',
      notes: 'Keep this note',
      currentDailyGoalKcal: 1800,
    })
    expect(history).toHaveLength(2)
    expect(history[1]).toMatchObject({
      effectiveDate: '2026-04-05',
      goalKcal: 1800,
      reason: 'Cutting',
    })
  })

  it('rejects impossible calendar dates', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)

    await expect(
      user.mutation(api.nutrition.createPerson, {
        name: 'Alex',
        currentDailyGoalKcal: 2200,
        effectiveDate: '2026-02-30',
      }),
    ).rejects.toThrowError('Effective date must be a valid calendar date.')
  })

  it('refuses to delete a person with meal history', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
      effectiveDate: '2026-04-04',
    })
    await insertMeal(t, personId)

    await expect(
      user.mutation(api.nutrition.deletePerson, {
        personId,
        expectedEditRevision: await readEditRevision(t, personId),
      }),
    ).rejects.toThrowError(
      'Cannot delete person with meal/cooking history. Archive instead.',
    )
  })

  it('refuses to delete a person with cooking history', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
      effectiveDate: '2026-04-04',
    })
    await insertCookSession(t, { cookedByPersonId: personId })

    await expect(
      user.mutation(api.nutrition.deletePerson, {
        personId,
        expectedEditRevision: await readEditRevision(t, personId),
      }),
    ).rejects.toThrowError(
      'Cannot delete person with meal/cooking history. Archive instead.',
    )
  })

  it('requires archiving a person whose goal history exceeds the delete bound', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Alex',
      currentDailyGoalKcal: 2200,
      effectiveDate: '2026-04-04',
    })

    await t.run(async (ctx) => {
      await Promise.all(
        Array.from({ length: 100 }, (_, index) =>
          ctx.db.insert('personGoalHistory', {
            ownerTokenIdentifier: TEST_TOKEN_IDENTIFIER,
            personId,
            effectiveDate: '2026-04-04',
            goalKcal: 2200 + index,
            reason: 'Historical goal',
            createdAt: Date.now() + index + 1,
          }),
        ),
      )
    })

    await expect(
      user.mutation(api.nutrition.deletePerson, {
        personId,
        expectedEditRevision: await readEditRevision(t, personId),
      }),
    ).rejects.toThrow(
      'Person has too much goal history to delete. Archive instead.',
    )
  })

  it('rejects stale profile updates, archival, and deletion', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Original',
      currentDailyGoalKcal: 2200,
      effectiveDate: '2026-04-04',
    })
    const originalRevision = await readEditRevision(t, personId)

    await user.mutation(api.nutrition.updatePerson, {
      personId,
      expectedEditRevision: originalRevision,
      name: 'First editor',
      effectiveDate: '2026-04-04',
    })

    const staleUpdate = user.mutation(api.nutrition.updatePerson, {
      personId,
      expectedEditRevision: originalRevision,
      name: 'Second editor',
      effectiveDate: '2026-04-04',
    })
    const staleArchive = user.mutation(api.nutrition.setPersonArchived, {
      personId,
      expectedEditRevision: originalRevision,
      archived: true,
    })
    const staleDelete = user.mutation(api.nutrition.deletePerson, {
      personId,
      expectedEditRevision: originalRevision,
    })
    await expect(staleUpdate).rejects.toThrow(
      'Person changed since editing began. Refresh and try again.',
    )
    await expect(staleArchive).rejects.toThrow(
      'Person changed since editing began. Refresh and try again.',
    )
    await expect(staleDelete).rejects.toThrow(
      'Person changed since editing began. Refresh and try again.',
    )

    expect(
      await t.run(async (ctx) => await ctx.db.get(personId)),
    ).toMatchObject({
      name: 'First editor',
      archived: false,
      editRevision: originalRevision + 1,
    })
  })
})
