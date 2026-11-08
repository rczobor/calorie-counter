// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { shiftDay } from './lib/energy'
import {
  asTestUser,
  asTestUserWithToken,
  createConvexTest,
  insertPerson,
} from '../src/tests/convex-test-utils'

const TODAY = '2026-11-08'
const profile = {
  sex: 'female',
  birthYear: 1988,
  heightCm: 170,
  activity: 'lowActive',
} as const

/** Four weeks of ~1960 kcal logged a day while losing ~0.26 kg a week. */
async function logFourWeeks(
  t: ReturnType<typeof createConvexTest>,
  personId: Id<'people'>,
) {
  await t.run(async (ctx) => {
    const person = await ctx.db.get(personId)
    if (!person) throw new Error('Expected the test person.')
    const owner = {
      ownerUserId: person.ownerUserId,
      householdId: person.householdId,
    }
    for (let daysAgo = 28; daysAgo >= 1; daysAgo--) {
      const date = shiftDay(TODAY, -daysAgo)
      await ctx.db.insert('dailySummaries', {
        ...owner,
        personId,
        eatenOn: date,
        // One unfinished day, which the check-in leaves out.
        consumedCalories:
          daysAgo === 10 ? 500 : 1960 + (daysAgo % 2 ? 80 : -80),
        mealCount: 3,
        createdAt: 0,
        updatedAt: 0,
      })
      if (daysAgo % 2 === 0)
        await ctx.db.insert('weightEntries', {
          ...owner,
          personId,
          measuredOn: date,
          weightKg:
            83.4 - ((28 - daysAgo) * 0.26) / 7 + (daysAgo % 4 ? 0.2 : -0.2),
          editRevision: 0,
          createdAt: 0,
          updatedAt: 0,
        })
    }
  })
}

describe('energy check-in', () => {
  it('measures maintenance and suggests the goal that keeps the plan on pace', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t, {
      energyProfile: profile,
      goalPlan: { direction: 'lose', percentPerWeek: 0.5 },
    })
    await logFourWeeks(t, personId)

    const checkIn = await user.query(api.energy.checkIn, {
      personId,
      today: TODAY,
    })
    expect(checkIn.estimate).toMatchObject({
      status: 'ready',
      loggedDays: 27,
      // The weigh-in 28 days ago falls just outside the window.
      weighIns: 13,
      incompleteDays: [{ date: shiftDay(TODAY, -10), kcal: 500 }],
      averageIntakeKcal: expect.closeTo(1960, -1),
      trendKgPerWeek: expect.closeTo(-0.26, 1),
    })
    if (checkIn.estimate.status !== 'ready') throw new Error('Not ready.')
    // The logs say ~2250; the formula (~2420) pulls it up a little.
    expect(checkIn.formula?.kcal).toBeCloseTo(2420, -2)
    expect(checkIn.estimate.measuredKcal).toBeCloseTo(2250, -2)
    expect(checkIn.estimate.maintenance.kcal).toBeGreaterThan(
      checkIn.estimate.measuredKcal,
    )
    expect(checkIn.estimate.maintenance.kcal).toBeLessThan(2350)
    // Weekly points from when two weeks of data first existed.
    expect(checkIn.history.map((point) => point.date)).toEqual([
      '2026-10-25',
      '2026-11-01',
      TODAY,
    ])
    expect(checkIn.history[checkIn.history.length - 1]).toEqual({
      date: TODAY,
      ...checkIn.estimate.maintenance,
    })
    expect(checkIn.suggestion).toMatchObject({
      // Maintenance less 0.5% of 82.6 kg a week: 0.41 kg, 450 kcal a day.
      goalKcal: Math.round(checkIn.estimate.maintenance.kcal / 10) * 10 - 450,
      kgPerWeek: expect.closeTo(-0.41, 1),
      heldAtMinimum: false,
      targetReached: false,
    })
  })

  it('suggests maintenance once the target is reached', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t, {
      energyProfile: profile,
      goalPlan: { direction: 'lose', percentPerWeek: 0.5, targetWeightKg: 83 },
    })
    await logFourWeeks(t, personId)
    const checkIn = await user.query(api.energy.checkIn, {
      personId,
      today: TODAY,
    })
    if (checkIn.estimate.status !== 'ready') throw new Error('Not ready.')
    expect(checkIn.suggestion).toMatchObject({
      kgPerWeek: 0,
      targetReached: true,
      goalKcal: Math.round(checkIn.estimate.maintenance.kcal / 10) * 10,
    })
  })

  it('keeps learning without enough data and needs no profile', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    expect(
      await user.query(api.energy.checkIn, { personId, today: TODAY }),
    ).toEqual({
      latestWeightKg: null,
      formula: null,
      estimate: {
        status: 'learning',
        loggedDays: 0,
        weighIns: 0,
        weighInSpanDays: 0,
        incompleteDays: [],
      },
      history: [],
      suggestion: null,
    })
  })

  it("refuses another household's person", async () => {
    const t = createConvexTest()
    const personId = await insertPerson(t)
    const stranger = asTestUserWithToken(t, 'user-2|token')
    await expect(
      stranger.query(api.energy.checkIn, { personId, today: TODAY }),
    ).rejects.toThrowError('Person not found.')
  })
})

describe('saving a goal plan', () => {
  it('saves the profile, plan and goal with its reason, and clears the plan', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    await user.mutation(api.weight.record, {
      personId,
      measuredOn: TODAY,
      weightKg: 82.4,
    })
    await user.mutation(api.nutrition.updatePerson, {
      personId,
      expectedEditRevision: 0,
      name: 'Alex',
      goalKcal: 1980,
      effectiveDate: TODAY,
      reason: 'Calculator: lose 0.5% a week',
      energyProfile: profile,
      goalPlan: { direction: 'lose', percentPerWeek: 0.5, targetWeightKg: 75 },
    })
    const saved = await user.query(api.people.get, { personId })
    expect(saved).toMatchObject({
      currentDailyGoalKcal: 1980,
      energyProfile: profile,
      goalPlan: { direction: 'lose', percentPerWeek: 0.5, targetWeightKg: 75 },
    })
    const history = await user.query(api.people.listGoalHistory, {
      personId,
      paginationOpts: { numItems: 5, cursor: null },
    })
    expect(history.page[0]).toMatchObject({
      goalKcal: 1980,
      reason: 'Calculator: lose 0.5% a week',
    })

    // Editing the name alone keeps the plan; a null plan clears it.
    await user.mutation(api.nutrition.updatePerson, {
      personId,
      expectedEditRevision: 1,
      name: 'Alex B',
      effectiveDate: TODAY,
    })
    expect(await user.query(api.people.get, { personId })).toMatchObject({
      goalPlan: { direction: 'lose' },
    })
    await user.mutation(api.nutrition.updatePerson, {
      personId,
      expectedEditRevision: 2,
      name: 'Alex B',
      effectiveDate: TODAY,
      goalPlan: null,
    })
    const cleared = await user.query(api.people.get, { personId })
    expect(cleared?.goalPlan).toBeUndefined()
    expect(cleared?.energyProfile).toEqual(profile)
  })

  it('refuses plans the calculator would not offer', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await insertPerson(t)
    const base = {
      personId,
      expectedEditRevision: 0,
      name: 'Mia',
      effectiveDate: TODAY,
    }
    await expect(
      user.mutation(api.nutrition.updatePerson, {
        ...base,
        energyProfile: { ...profile, birthYear: 2011 },
        goalPlan: { direction: 'maintain' },
      }),
    ).rejects.toThrowError('Goal plans are for adults.')
    await expect(
      user.mutation(api.nutrition.updatePerson, {
        ...base,
        goalPlan: { direction: 'maintain' },
      }),
    ).rejects.toThrowError(
      'Add sex, year of birth, height and activity before a goal plan.',
    )
    await user.mutation(api.weight.record, {
      personId,
      measuredOn: TODAY,
      weightKg: 50,
    })
    await expect(
      user.mutation(api.nutrition.updatePerson, {
        ...base,
        energyProfile: profile,
        goalPlan: { direction: 'lose', percentPerWeek: 0.25 },
      }),
    ).rejects.toThrowError("Losing weight isn't offered below a BMI of 18.5.")
    await expect(
      user.mutation(api.nutrition.createPerson, {
        name: 'Sam',
        currentDailyGoalKcal: 2860,
        effectiveDate: TODAY,
        energyProfile: { ...profile, sex: 'male', heightCm: 300 },
      }),
    ).rejects.toThrowError('Height must be between 100 and 250 cm.')
  })

  it('creates a person with a plan and records the calculator as the reason', async () => {
    const t = createConvexTest()
    const user = asTestUser(t)
    const personId = await user.mutation(api.nutrition.createPerson, {
      name: 'Sam',
      currentDailyGoalKcal: 2860,
      effectiveDate: TODAY,
      energyProfile: { ...profile, sex: 'male', heightCm: 182 },
      goalPlan: { direction: 'gain', percentPerWeek: 0.25 },
      reason: 'Calculator: gain 0.25% a week',
    })
    const history = await user.query(api.people.listGoalHistory, {
      personId,
      paginationOpts: { numItems: 5, cursor: null },
    })
    expect(history.page).toMatchObject([
      { goalKcal: 2860, reason: 'Calculator: gain 0.25% a week' },
    ])
  })
})
