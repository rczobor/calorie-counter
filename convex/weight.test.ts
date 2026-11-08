// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertPerson,
  readEditRevision,
} from '../src/tests/convex-test-utils'

async function fixture() {
  const t = createConvexTest()
  const user = asTestUser(t)
  const personId = await insertPerson(t)
  return { t, user, personId }
}

describe('weight entries', () => {
  it('keeps one weight per day and replaces it only at the read revision', async () => {
    const { t, user, personId } = await fixture()
    const day = { personId, measuredOn: '2026-11-08' }

    const entryId = await user.mutation(api.weight.record, {
      ...day,
      weightKg: 82.4,
    })
    // A retry of the same weight is a no-op, not a second entry or a conflict.
    expect(
      await user.mutation(api.weight.record, { ...day, weightKg: 82.4 }),
    ).toBe(entryId)
    await expect(
      user.mutation(api.weight.record, { ...day, weightKg: 81.9 }),
    ).rejects.toThrowError(
      'Weight for 2026-11-08 is already recorded as 82.4 kg (edit revision 0).',
    )
    await expect(
      user.mutation(api.weight.record, {
        ...day,
        weightKg: 81.9,
        expectedEditRevision: 3,
      }),
    ).rejects.toThrowError('Weight changed since it was read.')

    await user.mutation(api.weight.record, {
      ...day,
      weightKg: 81.9,
      expectedEditRevision: 0,
    })
    const entries = await t.run((ctx) =>
      ctx.db.query('weightEntries').collect(),
    )
    expect(entries).toMatchObject([
      { _id: entryId, weightKg: 81.9, editRevision: 1 },
    ])
  })

  it('reads ranges oldest first, pages newest first and finds the latest weight', async () => {
    const { user, personId } = await fixture()
    for (const [measuredOn, weightKg] of [
      ['2026-11-01', 83.1],
      ['2026-11-04', 82.8],
      ['2026-11-08', 82.4],
    ] as const)
      await user.mutation(api.weight.record, { personId, measuredOn, weightKg })

    const range = await user.query(api.weight.listRange, {
      personId,
      startDate: '2026-11-02',
      endDate: '2026-11-08',
    })
    expect(range.map((entry) => entry.measuredOn)).toEqual([
      '2026-11-04',
      '2026-11-08',
    ])
    const page = await user.query(api.weight.list, {
      personId,
      paginationOpts: { numItems: 2, cursor: null },
    })
    expect(page.page.map((entry) => entry.weightKg)).toEqual([82.4, 82.8])
    expect(page.isDone).toBe(false)
    expect(
      await user.query(api.weight.latestOnOrBefore, {
        personId,
        date: '2026-11-07',
      }),
    ).toMatchObject({ measuredOn: '2026-11-04', weightKg: 82.8 })
  })

  it('validates weights, dates and archived people', async () => {
    const { t, user, personId } = await fixture()
    for (const weightKg of [0, 0.5, 501, Number.NaN])
      await expect(
        user.mutation(api.weight.record, {
          personId,
          measuredOn: '2026-11-08',
          weightKg,
        }),
      ).rejects.toThrowError('Weight must be between 1 and 500 kg.')
    await expect(
      user.mutation(api.weight.record, {
        personId,
        measuredOn: '2026-02-30',
        weightKg: 80,
      }),
    ).rejects.toThrowError('Weight date must be a valid calendar date.')

    await user.mutation(api.nutrition.setPersonArchived, {
      personId,
      expectedEditRevision: await readEditRevision(t, personId),
      archived: true,
    })
    await expect(
      user.mutation(api.weight.record, {
        personId,
        measuredOn: '2026-11-08',
        weightKg: 80,
      }),
    ).rejects.toThrowError('Person is archived.')
  })

  it('keeps weights inside their household', async () => {
    const { t, user, personId } = await fixture()
    const entryId = await user.mutation(api.weight.record, {
      personId,
      measuredOn: '2026-11-08',
      weightKg: 82.4,
    })
    const other = asTestUserWithToken(t, 'user-2|token')

    await expect(
      other.mutation(api.weight.record, {
        personId,
        measuredOn: '2026-11-09',
        weightKg: 70,
      }),
    ).rejects.toThrowError('Person not found.')
    await expect(
      other.mutation(api.weight.remove, { entryId, expectedEditRevision: 0 }),
    ).rejects.toThrowError('Weight entry not found.')
    expect(
      (
        await other.query(api.weight.list, {
          personId,
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).page,
    ).toEqual([])
    expect(
      await other.query(api.weight.latestOnOrBefore, {
        personId,
        date: '2026-11-08',
      }),
    ).toBeNull()
  })

  it('deletes an entry at its revision, and a person with weights is archived instead', async () => {
    const { t, user, personId } = await fixture()
    const entryId = await user.mutation(api.weight.record, {
      personId,
      measuredOn: '2026-11-08',
      weightKg: 82.4,
    })

    await expect(
      user.mutation(api.nutrition.deletePerson, {
        personId,
        expectedEditRevision: await readEditRevision(t, personId),
      }),
    ).rejects.toThrowError(
      'Cannot delete person with meal, cooking or weight history. Archive instead.',
    )
    await expect(
      user.mutation(api.weight.remove, { entryId, expectedEditRevision: 1 }),
    ).rejects.toThrowError('Weight changed since it was read.')
    await user.mutation(api.weight.remove, { entryId, expectedEditRevision: 0 })
    expect(
      await t.run((ctx) => ctx.db.query('weightEntries').collect()),
    ).toEqual([])
  })
})
