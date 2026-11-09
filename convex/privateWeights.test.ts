// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
} from '../src/tests/convex-test-utils'

const page = { numItems: 20, cursor: null }
afterEach(() => vi.useRealTimers())

/** Robi and Viki share a household; one person is linked to `linkedTo`. */
async function shared(linkedTo: 'robi' | 'viki') {
  const t = createConvexTest()
  const robi = asTestUser(t)
  const viki = asTestUserWithToken(t, 'https://clerk.example|viki')
  const householdId = await robi.mutation(api.households.ensurePersonal, {})
  const token = await robi.mutation(api.households.invite, { householdId })
  await viki.mutation(api.households.acceptInvitation, { token })
  const member = linkedTo === 'robi' ? robi : viki
  const personId = await member.mutation(api.nutrition.createPerson, {
    householdId,
    name: 'Linked',
    currentDailyGoalKcal: 2000,
    effectiveDate: '2026-04-04',
    energyProfile: {
      sex: 'male',
      birthYear: 1990,
      heightCm: 180,
      activity: 'active',
    },
    goalPlan: { direction: 'lose', percentPerWeek: 0.5, targetWeightKg: 75 },
    linkedToMe: true,
  })
  await member.mutation(api.weight.record, {
    householdId,
    personId,
    measuredOn: '2026-04-04',
    weightKg: 82,
  })
  return { t, robi, viki, householdId, personId }
}

describe('private weights', () => {
  it('keeps a linked person’s weight to the member linked to them', async () => {
    const { robi, viki, householdId, personId } = await shared('robi')
    const range = {
      householdId,
      personId,
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    }

    expect(await robi.query(api.weight.listRange, range)).toHaveLength(1)
    expect(await viki.query(api.weight.listRange, range)).toEqual([])
    expect(
      (
        await viki.query(api.weight.list, {
          householdId,
          personId,
          paginationOpts: page,
        })
      ).page,
    ).toEqual([])
    expect(
      await viki.query(api.weight.latestOnOrBefore, {
        householdId,
        personId,
        date: '2026-04-30',
      }),
    ).toBeNull()
    expect(
      await viki.query(api.energy.checkIn, {
        householdId,
        personId,
        today: '2026-04-30',
      }),
    ).toBeNull()
    await expect(
      viki.mutation(api.weight.record, {
        householdId,
        personId,
        measuredOn: '2026-04-05',
        weightKg: 81,
      }),
    ).rejects.toThrow('Only the member linked to this person')
    const [entry] = await robi.query(api.weight.listRange, range)
    await expect(
      viki.mutation(api.weight.remove, {
        householdId,
        entryId: entry._id,
        expectedEditRevision: entry.editRevision,
      }),
    ).rejects.toThrow('Only the member linked to this person')

    // The goal stays visible to Viki, without the profile and target weight.
    const seenByViki = await viki.query(api.people.get, {
      householdId,
      personId,
    })
    expect(seenByViki).toMatchObject({
      currentDailyGoalKcal: 2000,
      goalPlan: { direction: 'lose', percentPerWeek: 0.5 },
      linkedAccount: 'other',
    })
    expect(seenByViki?.energyProfile).toBeUndefined()
    expect(seenByViki?.goalPlan).not.toHaveProperty('targetWeightKg')
    expect(
      await robi.query(api.people.get, { householdId, personId }),
    ).toMatchObject({
      goalPlan: { targetWeightKg: 75 },
      energyProfile: { heightCm: 180 },
    })
  })

  it('lets only the linked member change the goal; the name stays shared', async () => {
    const { robi, viki, householdId, personId } = await shared('robi')
    await viki.mutation(api.nutrition.updatePerson, {
      householdId,
      personId,
      expectedEditRevision: 0,
      name: 'Renamed',
      goalKcal: 2000,
      effectiveDate: '2026-04-05',
    })
    await expect(
      viki.mutation(api.nutrition.updatePerson, {
        householdId,
        personId,
        expectedEditRevision: 1,
        name: 'Renamed',
        goalKcal: 1800,
        effectiveDate: '2026-04-05',
      }),
    ).rejects.toThrow(
      'Only the member linked to this person can change their goal.',
    )
    await expect(
      viki.mutation(api.nutrition.updatePersonGoal, {
        householdId,
        personId,
        expectedEditRevision: 1,
        goalKcal: 1800,
        effectiveDate: '2026-04-05',
      }),
    ).rejects.toThrow('can change their goal')
    await robi.mutation(api.nutrition.updatePersonGoal, {
      householdId,
      personId,
      expectedEditRevision: 1,
      goalKcal: 1800,
      effectiveDate: '2026-04-05',
    })
    expect(
      await viki.query(api.people.get, { householdId, personId }),
    ).toMatchObject({ name: 'Renamed', currentDailyGoalKcal: 1800 })
  })

  it('deletes a leaving member’s weight before freeing their person', async () => {
    const { t, robi, viki, householdId, personId } = await shared('viki')
    const leaving = (
      await viki.query(api.households.members, { householdId })
    ).find((row) => row.isYou)!
    vi.useFakeTimers()
    await viki.mutation(api.households.updateMember, {
      householdId,
      memberId: leaving._id,
      role: 'remove',
    })
    // Still private until the weight is gone.
    expect(
      (await robi.query(api.people.get, { householdId, personId }))
        ?.linkedAccount,
    ).toBe('other')
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const left = await t.run(async (ctx) => ({
      person: await ctx.db.get(personId),
      weights: await ctx.db.query('weightEntries').collect(),
    }))
    expect(left.person).toMatchObject({
      name: 'Linked',
      goalPlan: { direction: 'lose', percentPerWeek: 0.5 },
    })
    expect(left.person?.userId).toBeUndefined()
    // The profile and target weight were as private as the weight.
    expect(left.person?.energyProfile).toBeUndefined()
    expect(left.person?.goalPlan).not.toHaveProperty('targetWeightKg')
    expect(left.weights).toEqual([])
  })
})
