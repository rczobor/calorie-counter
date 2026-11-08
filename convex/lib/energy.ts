/**
 * Daily energy needs and goal planning. Pure functions shared by the goal
 * calculator (client) and the maintenance check-in (server), so both show the
 * same numbers.
 *
 * The starting estimate uses the adult total energy expenditure equations of
 * the National Academies' Dietary Reference Intakes for Energy (2023), fitted
 * to doubly labelled water data. The check-in then measures maintenance from
 * the person's own logged intake against their weight trend, which also
 * absorbs any consistent under- or over-logging.
 */

export type EnergySex = 'female' | 'male'
export type ActivityLevel = 'inactive' | 'lowActive' | 'active' | 'veryActive'
export type EnergyProfile = {
  sex: EnergySex
  birthYear: number
  heightCm: number
  activity: ActivityLevel
}
export type GoalPlan =
  | { direction: 'maintain' }
  | {
      direction: 'lose' | 'gain'
      percentPerWeek: number
      targetWeightKg?: number
    }

export const ACTIVITY_LEVELS = [
  'inactive',
  'lowActive',
  'active',
  'veryActive',
] as const satisfies readonly ActivityLevel[]

/** Weekly paces offered, as a percentage of body weight. */
export const PACES = { lose: [0.25, 0.5, 0.75, 1], gain: [0.25, 0.5] } as const
export const DEFAULT_PACE = { lose: 0.5, gain: 0.25 } as const

/** Energy stored or released per kilogram of body weight change. */
export const KCAL_PER_KG = 7700
/** The equations are for adults; children and teens need energy to grow. */
export const MIN_ADULT_AGE = 18
/** The lowest goal suggested without medical supervision (AHA/ACC/TOS 2013). */
export const MIN_GOAL_KCAL = { female: 1200, male: 1500 } as const
export const MIN_HEALTHY_BMI = 18.5
export const MIN_HEIGHT_CM = 100
export const MAX_HEIGHT_CM = 250
export const MIN_BIRTH_YEAR = 1900

// TEE (kcal/day) = intercept − age × years + height × cm + weight × kg.
// `rmse` is the equations' standard error of the estimate.
const EQUATIONS = {
  female: {
    age: 7.01,
    rmse: 246,
    levels: {
      inactive: [584.9, 5.72, 11.71],
      lowActive: [575.77, 6.6, 12.14],
      active: [710.25, 6.54, 12.34],
      veryActive: [511.83, 9.07, 12.56],
    },
  },
  male: {
    age: 10.83,
    rmse: 339,
    levels: {
      inactive: [753.07, 6.5, 14.1],
      lowActive: [581.47, 8.3, 14.94],
      active: [1004.82, 6.52, 15.91],
      veryActive: [-517.88, 15.61, 19.11],
    },
  },
} satisfies Record<
  EnergySex,
  {
    age: number
    rmse: number
    levels: Record<ActivityLevel, [number, number, number]>
  }
>

export type Estimate = { kcal: number; uncertaintyKcal: number }

export function roundKcal(value: number) {
  return Math.round(value / 10) * 10
}

/** Age reached during the year of `date` (YYYY-MM-DD). */
export function ageInYearOf(birthYear: number, date: string) {
  return Number(date.slice(0, 4)) - birthYear
}

export function bmi(weightKg: number, heightCm: number) {
  return weightKg / (heightCm / 100) ** 2
}

/** The lowest weight with a healthy BMI at this height. */
export function minHealthyWeightKg(heightCm: number) {
  return MIN_HEALTHY_BMI * (heightCm / 100) ** 2
}

/** Maintenance calories from the equations: a starting point, not a measurement. */
export function formulaMaintenance(
  profile: EnergyProfile,
  weightKg: number,
  date: string,
): Estimate {
  const equation = EQUATIONS[profile.sex]
  const [intercept, perCm, perKg] = equation.levels[profile.activity]
  return {
    kcal:
      intercept -
      equation.age * ageInYearOf(profile.birthYear, date) +
      perCm * profile.heightCm +
      perKg * weightKg,
    uncertaintyKcal: equation.rmse,
  }
}

/** Signed weekly weight change the plan aims for, in kilograms. */
export function plannedKgPerWeek(plan: GoalPlan, weightKg: number) {
  if (plan.direction === 'maintain') return 0
  const kg = (weightKg * plan.percentPerWeek) / 100
  return plan.direction === 'lose' ? -kg : kg
}

/**
 * The daily goal for a plan: maintenance plus the energy the planned weekly
 * change stores or releases. Never below the sex's minimum goal.
 */
export function goalForPlan({
  maintenanceKcal,
  weightKg,
  sex,
  plan,
}: {
  maintenanceKcal: number
  weightKg: number
  sex: EnergySex
  plan: GoalPlan
}) {
  const kgPerWeek = plannedKgPerWeek(plan, weightKg)
  const adjustmentKcal = roundKcal((kgPerWeek * KCAL_PER_KG) / 7)
  const planned = roundKcal(maintenanceKcal) + adjustmentKcal
  const minimum = MIN_GOAL_KCAL[sex]
  return {
    goalKcal: Math.max(planned, minimum),
    kgPerWeek,
    adjustmentKcal,
    heldAtMinimum: planned < minimum,
  }
}

/**
 * Weeks to reach the plan's target at a constant percentage pace, which the
 * check-ins keep by re-targeting as weight changes. Null without a reachable
 * target.
 */
export function weeksToTarget(plan: GoalPlan, weightKg: number) {
  if (plan.direction === 'maintain' || plan.targetWeightKg === undefined)
    return null
  const target = plan.targetWeightKg
  if (plan.direction === 'lose' ? target >= weightKg : target <= weightKg)
    return null
  const factor =
    plan.direction === 'lose'
      ? 1 - plan.percentPerWeek / 100
      : 1 + plan.percentPerWeek / 100
  return Math.log(target / weightKg) / Math.log(factor)
}

/**
 * Why a profile or plan cannot be used, or null. The server enforces this; the
 * calculator shows the same message in place.
 */
export function energyPlanProblem({
  profile,
  plan,
  date,
  weightKg,
}: {
  profile: EnergyProfile
  plan?: GoalPlan | null
  date: string
  weightKg?: number
}) {
  const year = Number(date.slice(0, 4))
  if (
    !Number.isInteger(profile.birthYear) ||
    profile.birthYear < MIN_BIRTH_YEAR ||
    profile.birthYear > year
  )
    return `Year of birth must be between ${MIN_BIRTH_YEAR} and ${year}.`
  if (
    !Number.isFinite(profile.heightCm) ||
    profile.heightCm < MIN_HEIGHT_CM ||
    profile.heightCm > MAX_HEIGHT_CM
  )
    return `Height must be between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm.`
  if (!plan) return null
  if (ageInYearOf(profile.birthYear, date) < MIN_ADULT_AGE)
    return 'Goal plans are for adults.'
  if (plan.direction === 'maintain') return null
  if (
    !(PACES[plan.direction] as readonly number[]).includes(plan.percentPerWeek)
  )
    return 'Choose one of the offered paces.'
  if (
    plan.direction === 'lose' &&
    weightKg !== undefined &&
    bmi(weightKg, profile.heightCm) < MIN_HEALTHY_BMI
  )
    return `Losing weight isn't offered below a BMI of ${MIN_HEALTHY_BMI}.`
  const target = plan.targetWeightKg
  if (target === undefined) return null
  if (!Number.isFinite(target)) return 'Enter a target weight in kilograms.'
  const minimum = minHealthyWeightKg(profile.heightCm)
  if (target < minimum)
    return `The target is below a healthy weight for this height (${minimum.toFixed(1)} kg).`
  if (weightKg !== undefined) {
    if (plan.direction === 'lose' && target >= weightKg)
      return 'The target is not below the current weight.'
    if (plan.direction === 'gain' && target <= weightKg)
      return 'The target is not above the current weight.'
  }
  return null
}

// ---- Check-in: maintenance measured from logs and weigh-ins ----

/** Days of logs and weigh-ins the check-in looks back over. */
export const CHECK_IN_DAYS = 28
export const MIN_LOGGED_DAYS = 14
export const MIN_WEIGH_INS = 6
export const MIN_WEIGH_IN_SPAN_DAYS = 14
/** A logged day under this share of the typical day is treated as unfinished. */
const INCOMPLETE_SHARE = 0.5
/** Day-to-day scale noise is rarely below this, even when a few points agree. */
const MIN_WEIGHT_NOISE_KG = 0.3
/** Logging is never exact, however steady the scale. */
const MIN_DATA_UNCERTAINTY_KCAL = 60

function dayNumber(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000
}

/** The calendar date `days` after `date` (YYYY-MM-DD), free of time zones. */
export function shiftDay(date: string, days: number) {
  return new Date((dayNumber(date) + days) * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/** Least-squares slope in kg per day and its standard error. */
function weightTrend(weights: Array<{ date: string; kg: number }>) {
  const xs = weights.map((entry) => dayNumber(entry.date))
  const ys = weights.map((entry) => entry.kg)
  const n = xs.length
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2
    sxy += (xs[i] - meanX) * (ys[i] - meanY)
  }
  const slope = sxy / sxx
  let residuals = 0
  for (let i = 0; i < n; i++)
    residuals += (ys[i] - meanY - slope * (xs[i] - meanX)) ** 2
  const noise = Math.max(MIN_WEIGHT_NOISE_KG, Math.sqrt(residuals / (n - 2)))
  return { kgPerDay: slope, standardError: noise / Math.sqrt(sxx) }
}

export type CheckInEstimate =
  | {
      status: 'learning'
      loggedDays: number
      weighIns: number
      weighInSpanDays: number
      incompleteDays: Array<{ date: string; kcal: number }>
    }
  | {
      status: 'ready'
      loggedDays: number
      weighIns: number
      weighInSpanDays: number
      incompleteDays: Array<{ date: string; kcal: number }>
      averageIntakeKcal: number
      trendKgPerWeek: number
      /** Maintenance from the logs alone. */
      measuredKcal: number
      /** The logs blended with the formula; the formula fades as data grows. */
      maintenance: Estimate
    }

/**
 * Measures maintenance from one window of logged days and weigh-ins: average
 * intake minus the energy the weight trend stored. Days with nothing logged
 * are left out rather than counted as zero, and so are days far below the
 * typical logged day, which are most likely unfinished.
 *
 * The result is combined with `prior` (the formula) by inverse variance, so a
 * noisy window leans on the formula and a steady one replaces it.
 */
export function estimateFromLogs({
  intake,
  weights,
  prior,
}: {
  intake: Array<{ date: string; kcal: number }>
  weights: Array<{ date: string; kg: number }>
  prior: Estimate | null
}): CheckInEstimate {
  const logged = intake.filter((day) => day.kcal > 0)
  const typical = logged.length ? median(logged.map((day) => day.kcal)) : 0
  const incompleteDays = logged.filter(
    (day) => day.kcal < typical * INCOMPLETE_SHARE,
  )
  const complete = logged.filter(
    (day) => day.kcal >= typical * INCOMPLETE_SHARE,
  )
  const days = weights.map((entry) => dayNumber(entry.date))
  const progress = {
    loggedDays: complete.length,
    weighIns: weights.length,
    weighInSpanDays: days.length ? Math.max(...days) - Math.min(...days) : 0,
    incompleteDays,
  }
  if (
    progress.loggedDays < MIN_LOGGED_DAYS ||
    progress.weighIns < MIN_WEIGH_INS ||
    progress.weighInSpanDays < MIN_WEIGH_IN_SPAN_DAYS
  )
    return { status: 'learning', ...progress }

  const averageIntakeKcal =
    complete.reduce((sum, day) => sum + day.kcal, 0) / complete.length
  const trend = weightTrend(weights)
  const measuredKcal = averageIntakeKcal - trend.kgPerDay * KCAL_PER_KG
  const measuredUncertainty = Math.max(
    MIN_DATA_UNCERTAINTY_KCAL,
    trend.standardError * KCAL_PER_KG,
  )
  let maintenance: Estimate = {
    kcal: measuredKcal,
    uncertaintyKcal: measuredUncertainty,
  }
  if (prior) {
    const priorWeight = 1 / prior.uncertaintyKcal ** 2
    const measuredWeight = 1 / measuredUncertainty ** 2
    const total = priorWeight + measuredWeight
    maintenance = {
      kcal: (prior.kcal * priorWeight + measuredKcal * measuredWeight) / total,
      uncertaintyKcal: 1 / Math.sqrt(total),
    }
  }
  return {
    status: 'ready',
    ...progress,
    averageIntakeKcal,
    trendKgPerWeek: trend.kgPerDay * 7,
    measuredKcal,
    maintenance,
  }
}

/** Weekly estimates kept for the trend, the latest one included. */
export const CHECK_IN_HISTORY_POINTS = 4
/** Days of data a check-in reads, to compute every weekly estimate. */
export const CHECK_IN_LOOKBACK_DAYS =
  CHECK_IN_DAYS + 7 * (CHECK_IN_HISTORY_POINTS - 1)

/**
 * A person's check-in from their logged days and weigh-ins in the lookback
 * (oldest first): this week's estimate, the weekly estimates before it, and
 * the goal that keeps their plan on pace.
 */
export function buildCheckIn({
  today,
  intake,
  weights,
  latestWeightKg,
  profile,
  plan,
}: {
  today: string
  intake: Array<{ date: string; kcal: number }>
  weights: Array<{ date: string; kg: number }>
  /** The latest weigh-in on or before today, however old. */
  latestWeightKg: number | null
  profile?: EnergyProfile
  plan?: GoalPlan
}) {
  function estimateUntil(end: string) {
    const start = shiftDay(end, -CHECK_IN_DAYS)
    const window = weights.filter((w) => w.date > start && w.date <= end)
    const weightKg = window[window.length - 1]?.kg ?? latestWeightKg
    return estimateFromLogs({
      // The window's last day is still being eaten, so intake stops before it.
      intake: intake.filter((day) => day.date >= start && day.date < end),
      weights: window,
      prior:
        profile && weightKg !== null
          ? formulaMaintenance(profile, weightKg, end)
          : null,
    })
  }

  const estimate = estimateUntil(today)
  const history: Array<Estimate & { date: string }> = []
  for (let weeksAgo = CHECK_IN_HISTORY_POINTS - 1; weeksAgo >= 0; weeksAgo--) {
    const date = shiftDay(today, -7 * weeksAgo)
    const point = weeksAgo === 0 ? estimate : estimateUntil(date)
    if (point.status === 'ready') history.push({ date, ...point.maintenance })
  }

  let suggestion = null
  if (
    estimate.status === 'ready' &&
    plan &&
    profile &&
    latestWeightKg !== null
  ) {
    const targetReached =
      plan.direction !== 'maintain' &&
      plan.targetWeightKg !== undefined &&
      (plan.direction === 'lose'
        ? latestWeightKg <= plan.targetWeightKg
        : latestWeightKg >= plan.targetWeightKg)
    const goal = goalForPlan({
      maintenanceKcal: estimate.maintenance.kcal,
      weightKg: latestWeightKg,
      sex: profile.sex,
      plan: targetReached ? { direction: 'maintain' } : plan,
    })
    suggestion = {
      goalKcal: goal.goalKcal,
      kgPerWeek: goal.kgPerWeek,
      heldAtMinimum: goal.heldAtMinimum,
      targetReached,
    }
  }

  return {
    latestWeightKg,
    formula:
      profile && latestWeightKg !== null
        ? formulaMaintenance(profile, latestWeightKg, today)
        : null,
    estimate,
    history,
    suggestion,
  }
}
