import { describe, expect, it } from 'vitest'

import {
  trendWeightsByDay,
  buildCheckIn,
  energyPlanProblem,
  estimateFromLogs,
  formulaMaintenance,
  goalForPlan,
  shiftDay,
  weeksToTarget,
  type EnergyProfile,
} from './energy'

const alex: EnergyProfile = {
  sex: 'female',
  birthYear: 1988,
  heightCm: 170,
  activity: 'lowActive',
}

describe('formula maintenance', () => {
  it('applies the NASEM 2023 adult equations with their standard error', () => {
    // 575.77 − 7.01 × 38 + 6.60 × 170 + 12.14 × 82.4
    expect(formulaMaintenance(alex, 82.4, '2026-11-08')).toEqual({
      kcal: expect.closeTo(2431.7, 1),
      uncertaintyKcal: 246,
    })
    // −517.88 − 10.83 × 34 + 15.61 × 180 + 19.11 × 86.4
    expect(
      formulaMaintenance(
        { sex: 'male', birthYear: 1992, heightCm: 180, activity: 'veryActive' },
        86.4,
        '2026-01-01',
      ),
    ).toEqual({ kcal: expect.closeTo(3574.8, 1), uncertaintyKcal: 339 })
  })
})

describe('goal for a plan', () => {
  it('adds the energy of the planned weekly change to maintenance', () => {
    expect(
      goalForPlan({
        maintenanceKcal: 2431.7,
        weightKg: 82.4,
        sex: 'female',
        plan: { direction: 'lose', percentPerWeek: 0.5 },
      }),
    ).toEqual({
      goalKcal: 1980,
      kgPerWeek: expect.closeTo(-0.412, 3),
      adjustmentKcal: -450,
      heldAtMinimum: false,
    })
    expect(
      goalForPlan({
        maintenanceKcal: 2650,
        weightKg: 78,
        sex: 'male',
        plan: { direction: 'gain', percentPerWeek: 0.25 },
      }).goalKcal,
    ).toBe(2860)
  })

  it('never goes below the minimum goal', () => {
    expect(
      goalForPlan({
        maintenanceKcal: 1700,
        weightKg: 60,
        sex: 'female',
        plan: { direction: 'lose', percentPerWeek: 1 },
      }),
    ).toMatchObject({ goalKcal: 1200, heldAtMinimum: true })
  })

  it('counts the weeks to a target at a constant percentage pace', () => {
    const plan = {
      direction: 'lose',
      percentPerWeek: 0.5,
      targetWeightKg: 75,
    } as const
    expect(weeksToTarget(plan, 82.4)).toBeCloseTo(18.8, 1)
    expect(weeksToTarget(plan, 74)).toBeNull()
    expect(weeksToTarget({ direction: 'maintain' }, 80)).toBeNull()
  })
})

describe('plan problems', () => {
  const date = '2026-11-08'

  it('accepts an adult with an offered pace', () => {
    expect(
      energyPlanProblem({
        profile: alex,
        plan: { direction: 'lose', percentPerWeek: 0.5, targetWeightKg: 75 },
        date,
        weightKg: 82.4,
      }),
    ).toBeNull()
  })

  it('refuses plans for under-18s, unoffered paces and unhealthy targets', () => {
    const plan = { direction: 'lose', percentPerWeek: 0.5 } as const
    expect(
      energyPlanProblem({ profile: { ...alex, birthYear: 2011 }, plan, date }),
    ).toBe('Goal plans are for adults.')
    // A teen's profile alone is fine: only a plan needs an adult.
    expect(
      energyPlanProblem({ profile: { ...alex, birthYear: 2011 }, date }),
    ).toBeNull()
    expect(
      energyPlanProblem({
        profile: alex,
        plan: { direction: 'lose', percentPerWeek: 2 },
        date,
      }),
    ).toBe('Choose one of the offered paces.')
    expect(energyPlanProblem({ profile: alex, plan, date, weightKg: 52 })).toBe(
      "Losing weight isn't offered below a BMI of 18.5.",
    )
    expect(
      energyPlanProblem({
        profile: alex,
        plan: { ...plan, targetWeightKg: 50 },
        date,
      }),
    ).toBe('The target is below a healthy weight for this height (53.5 kg).')
    expect(
      energyPlanProblem({
        profile: alex,
        plan: { direction: 'gain', percentPerWeek: 0.25, targetWeightKg: 80 },
        date,
        weightKg: 82.4,
      }),
    ).toBe('The target is not above the current weight.')
    expect(
      energyPlanProblem({ profile: { ...alex, heightCm: 40 }, date }),
    ).toBe('Height must be between 100 and 250 cm.')
  })
})

/**
 * Four weeks of someone whose real maintenance is `maintenance`: they log
 * `intake` (±150 alternating) and the scale follows the energy balance with
 * ±0.4 kg of day-to-day noise.
 */
function steadyWeeks({
  maintenance = 2300,
  intake = 2000,
  weighEvery = 1,
}: { maintenance?: number; intake?: number; weighEvery?: number } = {}) {
  const end = '2026-11-08'
  const days = Array.from({ length: 28 }, (_, i) => ({
    date: shiftDay(end, i - 28),
    kcal: intake + (i % 2 ? 150 : -150),
  }))
  const weights = Array.from({ length: 28 }, (_, i) => i + 1)
    .filter((day) => day % weighEvery === 0)
    .map((day) => ({
      date: shiftDay(end, day - 28),
      kg: 84 + (day * (intake - maintenance)) / 7700 + (day % 2 ? 0.4 : -0.4),
    }))
  return { days, weights }
}

describe('estimate from logs', () => {
  it('measures maintenance from intake and the weight trend', () => {
    const { days, weights } = steadyWeeks()
    const estimate = estimateFromLogs({ intake: days, weights, prior: null })
    expect(estimate).toMatchObject({
      status: 'ready',
      loggedDays: 28,
      weighIns: 28,
      averageIntakeKcal: 2000,
      // −300 kcal a day is −0.27 kg a week; the scale noise moves it a little.
      trendKgPerWeek: expect.closeTo(-0.27, 1),
    })
    if (estimate.status !== 'ready') throw new Error('Expected an estimate.')
    expect(estimate.maintenance.kcal).toBeCloseTo(2300, -2)
    expect(estimate.maintenance.uncertaintyKcal).toBeLessThan(150)
  })

  it('leans on the formula less as weigh-ins get denser', () => {
    const prior = { kcal: 2700, uncertaintyKcal: 246 }
    const sparse = steadyWeeks({ weighEvery: 4 })
    const dense = steadyWeeks()
    const fromSparse = estimateFromLogs({
      intake: sparse.days,
      weights: sparse.weights,
      prior,
    })
    const fromDense = estimateFromLogs({
      intake: dense.days,
      weights: dense.weights,
      prior,
    })
    if (fromSparse.status !== 'ready' || fromDense.status !== 'ready')
      throw new Error('Expected estimates.')
    expect(fromSparse.maintenance.kcal).toBeGreaterThan(
      fromDense.maintenance.kcal,
    )
    expect(fromDense.maintenance.kcal).toBeLessThan(2400)
    expect(fromDense.maintenance.uncertaintyKcal).toBeLessThan(
      fromSparse.maintenance.uncertaintyKcal,
    )
  })

  it('leaves out unlogged and unfinished days instead of counting them low', () => {
    const { days, weights } = steadyWeeks()
    const withGaps = days
      .filter((_, i) => i % 7 !== 3)
      .map((day, i) => (i === 5 ? { ...day, kcal: 600 } : day))
    const estimate = estimateFromLogs({
      intake: [...withGaps, { date: '2026-10-30', kcal: 0 }],
      weights,
      prior: null,
    })
    expect(estimate).toMatchObject({
      status: 'ready',
      loggedDays: 23,
      incompleteDays: [{ date: withGaps[5].date, kcal: 600 }],
    })
    if (estimate.status !== 'ready') throw new Error('Expected an estimate.')
    expect(estimate.averageIntakeKcal).toBeCloseTo(2000, -2)
  })

  it('keeps learning until two weeks of logs and six weigh-ins span two weeks', () => {
    const { days, weights } = steadyWeeks()
    expect(
      estimateFromLogs({ intake: days.slice(0, 13), weights, prior: null }),
    ).toMatchObject({ status: 'learning', loggedDays: 13, weighIns: 28 })
    expect(
      estimateFromLogs({
        intake: days,
        weights: weights.slice(0, 5),
        prior: null,
      }),
    ).toMatchObject({ status: 'learning', weighIns: 5 })
    expect(
      estimateFromLogs({
        intake: days,
        weights: weights.slice(20),
        prior: null,
      }),
    ).toMatchObject({ status: 'learning', weighIns: 8, weighInSpanDays: 7 })
  })
})

describe('check-in suggestion', () => {
  it('judges a reached target by the trend, not one low weigh-in', () => {
    const { days, weights } = steadyWeeks()
    // The trend ends near 82.9 kg; one morning reads 82.0.
    const noisy = weights.map((entry, i) =>
      i === weights.length - 1 ? { ...entry, kg: 82.0 } : entry,
    )
    const plan = {
      direction: 'lose',
      percentPerWeek: 0.5,
      targetWeightKg: 82.5,
    } as const
    const checkIn = buildCheckIn({
      today: '2026-11-08',
      intake: days,
      weights: noisy,
      latestWeightKg: 82.0,
      profile: alex,
      plan,
    })
    expect(checkIn.suggestion).toMatchObject({ targetReached: false })
    expect(
      buildCheckIn({
        today: '2026-11-08',
        intake: days,
        weights,
        latestWeightKg: 82.9,
        profile: alex,
        plan: { ...plan, targetWeightKg: 83.5 },
      }).suggestion,
    ).toMatchObject({ targetReached: true, kgPerWeek: 0 })
  })

  it('stops a loss plan without a target below a healthy BMI', () => {
    const { days, weights } = steadyWeeks()
    // 150 cm, about 41 kg: a BMI near 18.
    const light = weights.map((entry) => ({ ...entry, kg: entry.kg - 43 }))
    const checkIn = buildCheckIn({
      today: '2026-11-08',
      intake: days,
      weights: light,
      latestWeightKg: 40.9,
      profile: { ...alex, heightCm: 150 },
      plan: { direction: 'lose', percentPerWeek: 0.5 },
    })
    expect(checkIn.suggestion).toMatchObject({
      belowHealthyWeight: true,
      targetReached: false,
      kgPerWeek: 0,
    })
  })
})

describe('trend weights by day', () => {
  it('follows a steady loss and waits for three weigh-ins', () => {
    const weights = [
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ].map((date, index) => ({ date, kg: 84 - index * 0.1 }))
    const trend = trendWeightsByDay(weights)
    expect(trend.slice(0, 2)).toEqual([null, null])
    expect(trend[2]).toBeCloseTo(83.8)
    expect(trend[3]).toBeCloseTo(83.7)
  })

  it('fits the 28 days up to a day, leaving out the day 28 before', () => {
    const weights = [
      { date: '2026-10-01', kg: 90 },
      { date: '2026-10-02', kg: 80 },
      { date: '2026-10-03', kg: 80 },
      { date: '2026-10-29', kg: 80 },
    ]
    // Oct 1 is 28 days before Oct 29, so its outlier stays out of the fit.
    expect(trendWeightsByDay(weights)[3]).toBeCloseTo(80)
  })

  it('is steadier than the weigh-ins', () => {
    // A ±0.5 kg daily swing around a flat 80 kg.
    const weights = Array.from({ length: 40 }, (_, index) => ({
      date: shiftDay('2026-09-01', index),
      kg: 80 + (index % 2 ? 0.5 : -0.5),
    }))
    for (const kg of trendWeightsByDay(weights).slice(10))
      expect(Math.abs((kg ?? 0) - 80)).toBeLessThan(0.15)
  })
})
