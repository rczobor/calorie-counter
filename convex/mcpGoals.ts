import { vMcpUser } from '@convex-dev/mcp'
import { v, type Infer } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { readCheckInData } from './energy'
import { assertOwnedOrThrow, type AuthenticatedOwner } from './lib/auth'
import {
  ageInYearOf,
  buildCheckIn,
  calculatorReason,
  closeness,
  energyPlanProblem,
  formulaMaintenance,
  goalForPlan,
  MIN_ADULT_AGE,
  MIN_GOAL_KCAL,
  MIN_LOGGED_DAYS,
  MIN_WEIGH_INS,
  roundKcal,
  shiftDay,
  weeksToTarget,
  type Estimate,
  type GoalPlan,
} from './lib/energy'
import {
  DomainError,
  MAX_DESCRIPTION_LENGTH,
  normalizeOptionalText,
  normalizeRequiredDate,
} from './lib/validation'
import {
  domainResult,
  getPreferences,
  localCalendarDate,
  requireMcpOwner,
} from './mcpContext'
import { appUrl, canonical, limiter } from './mcpOperations'
import {
  goalChangeInput,
  goalChangePreview,
  goalChangeResult,
  goalStatusResult,
} from './mcpValidators'
import { assertExpectedEditRevision, updatePersonForOwner } from './nutrition'

const GOAL_HISTORY_ROWS = 10
const STATED_REASON = 'Set through an AI assistant'

/**
 * Goals apply from today, so earlier days keep the goal they had, and a goal
 * dated tomorrow can't later override the app's. With a saved time zone that
 * is the exact local date; without one, any date within a day of the UTC date,
 * which covers every time zone.
 */
async function requireToday(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  date: string,
  field: string,
) {
  const day = normalizeRequiredDate(date, field)
  const now = Date.now()
  const preferences = await getPreferences(ctx, owner.ownerTokenIdentifier)
  // get_logging_context uses the saved zone only for its own household.
  const timeZone =
    preferences?.householdId === owner.householdId
      ? preferences.timeZone
      : undefined
  if (timeZone) {
    // Named, so a caller who passed another zone can correct the date.
    const today = localCalendarDate(timeZone, now)
    if (day !== today)
      throw new DomainError(
        `${field} must be today, ${today} in the saved time zone ${timeZone}. Goal changes apply from today and earlier days keep their goals.`,
      )
    return day
  }
  const utc = new Date(now).toISOString().slice(0, 10)
  if (day < shiftDay(utc, -1) || day > shiftDay(utc, 1))
    throw new DomainError(
      `${field} must be today. Use localDate from get_logging_context: goal changes apply from today and earlier days keep their goals.`,
    )
  return day
}

const round2 = (value: number) => Math.round(value * 100) / 100

function goalState(person: Doc<'people'>) {
  return {
    goalKcal: person.currentDailyGoalKcal,
    energyProfile: person.energyProfile,
    goalPlan: person.goalPlan,
  }
}

function weightPath(owner: AuthenticatedOwner, person: Doc<'people'>) {
  const path = `/weight?householdId=${owner.householdId}&personId=${person._id}`
  return { path, url: appUrl(path) }
}

function requireActivePerson(
  person: Doc<'people'> | null,
  owner: AuthenticatedOwner,
) {
  const owned = assertOwnedOrThrow(person, owner, 'Person not found.')
  if (owned.archived)
    throw new DomainError(
      'Person is archived. Restore them in the app before changing their goal.',
    )
  return owned
}

function rangeOf(estimate: Estimate) {
  return {
    low: roundKcal(estimate.kcal - estimate.uncertaintyKcal),
    high: roundKcal(estimate.kcal + estimate.uncertaintyKcal),
  }
}

export const getGoal = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    localDate: v.string(),
  },
  returns: goalStatusResult,
  handler: (ctx, args) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(
        ctx,
        args.user,
        'nutrition:read',
        args.householdId,
      )
      const person = assertOwnedOrThrow(
        await ctx.db.get(args.personId),
        owner,
        'Person not found.',
      )
      const today = await requireToday(ctx, owner, args.localDate, 'Local date')
      const checkIn = buildCheckIn({
        today,
        ...(await readCheckInData(ctx, owner, person._id, today)),
        profile: person.energyProfile,
        plan: person.goalPlan,
      })
      const history = await ctx.db
        .query('personGoalHistory')
        .withIndex('by_householdId_and_personId_and_effectiveDate', (q) =>
          q.eq('householdId', owner.householdId).eq('personId', person._id),
        )
        .order('desc')
        .take(GOAL_HISTORY_ROWS)
      const { estimate, suggestion, formula } = checkIn
      return {
        householdId: owner.householdId,
        personId: person._id,
        person: person.name,
        editRevision: person.editRevision ?? 0,
        currentGoalKcal: person.currentDailyGoalKcal,
        energyProfile: person.energyProfile,
        goalPlan: person.goalPlan,
        history: history.map((entry) => ({
          effectiveDate: entry.effectiveDate,
          goalKcal: entry.goalKcal,
          reason: entry.reason,
        })),
        checkIn: {
          status: estimate.status,
          loggedDays: estimate.loggedDays,
          requiredLoggedDays: MIN_LOGGED_DAYS,
          weighIns: estimate.weighIns,
          requiredWeighIns: MIN_WEIGH_INS,
          skippedIncompleteDays: estimate.incompleteDays.map((day) => ({
            date: day.date,
            kcal: Math.round(day.kcal),
          })),
          formulaKcal: formula ? roundKcal(formula.kcal) : undefined,
          ...(estimate.status === 'ready'
            ? {
                maintenanceKcal: roundKcal(estimate.maintenance.kcal),
                likelyRangeKcal: rangeOf(estimate.maintenance),
                confidence: closeness(estimate.maintenance.uncertaintyKcal),
                averageLoggedKcal: Math.round(estimate.averageIntakeKcal),
                weightTrendKgPerWeek: round2(estimate.trendKgPerWeek),
              }
            : {}),
          suggestion: suggestion
            ? {
                goalKcal: suggestion.goalKcal,
                plannedKgPerWeek: round2(suggestion.kgPerWeek),
                heldAtMinimum: suggestion.heldAtMinimum,
                targetReached: suggestion.targetReached,
                belowHealthyWeight: suggestion.belowHealthyWeight,
              }
            : undefined,
        },
        ...weightPath(owner, person),
      }
    }),
})

/**
 * Resolves a goal change: a goal the user states, or one calculated for the
 * plan from the check-in when it is ready, otherwise from the formula and the
 * latest weigh-in. Returns the exact input to save and what it changes.
 */
async function prepareGoalChange(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  input: Infer<typeof goalChangeInput>,
): Promise<Infer<typeof goalChangePreview>> {
  const person = requireActivePerson(await ctx.db.get(input.personId), owner)
  assertExpectedEditRevision(person, input.expectedEditRevision, 'Person')
  const effectiveDate = await requireToday(
    ctx,
    owner,
    input.effectiveDate,
    'Effective date',
  )
  const profile = input.energyProfile ?? person.energyProfile
  let plan: GoalPlan | undefined =
    input.goalPlan === undefined
      ? person.goalPlan
      : (input.goalPlan ?? undefined)
  const data = await readCheckInData(ctx, owner, person._id, effectiveDate)
  const warnings: string[] = []
  if (input.energyProfile !== undefined || input.goalPlan !== undefined) {
    if (plan && !profile)
      throw new DomainError(
        'Add sex, year of birth, height and activity before a goal plan.',
      )
    const problem = profile
      ? energyPlanProblem({
          profile,
          plan,
          date: effectiveDate,
          weightKg: data.latestWeightKg ?? undefined,
        })
      : null
    if (problem) throw new DomainError(problem)
  }

  let goalKcal: number
  let basis: 'stated' | 'checkIn' | 'formula'
  let working: Infer<typeof goalChangePreview>['working']
  let reason = normalizeOptionalText(
    input.reason,
    'Goal reason',
    MAX_DESCRIPTION_LENGTH,
  )
  if (input.goalKcal !== undefined) {
    if (!Number.isFinite(input.goalKcal) || input.goalKcal <= 0)
      throw new DomainError('Daily goal must be a positive number of kcal.')
    goalKcal = input.goalKcal
    basis = 'stated'
    reason ??= STATED_REASON
  } else {
    if (!plan)
      throw new DomainError(
        'Give goalKcal, or a goalPlan to calculate the goal from.',
      )
    if (!profile)
      throw new DomainError(
        'Add sex, year of birth, height and activity before a goal plan.',
      )
    const checkIn = buildCheckIn({
      today: effectiveDate,
      ...data,
      profile,
      plan,
    })
    let maintenance: Estimate
    let goal: ReturnType<typeof goalForPlan>
    if (
      checkIn.estimate.status === 'ready' &&
      checkIn.suggestion &&
      data.latestWeightKg !== null
    ) {
      maintenance = checkIn.estimate.maintenance
      const { targetReached, belowHealthyWeight } = checkIn.suggestion
      const endsPlan =
        (targetReached || belowHealthyWeight) && plan.direction !== 'maintain'
      // The same calculation as the suggestion, which keeps its working.
      goal = goalForPlan({
        maintenanceKcal: maintenance.kcal,
        weightKg: data.latestWeightKg,
        sex: profile.sex,
        plan: endsPlan ? { direction: 'maintain' } : plan,
      })
      basis = 'checkIn'
      reason ??= `Check-in: maintenance ≈ ${roundKcal(maintenance.kcal)} kcal`
      // A plan that has to stop ends, as the app's check-in does.
      if (endsPlan) {
        plan = { direction: 'maintain' }
        warnings.push(
          targetReached
            ? 'The target is reached, so the plan changes to keeping weight steady.'
            : 'Below a healthy weight for this height, so the plan changes to keeping weight steady.',
        )
      }
    } else {
      if (data.latestWeightKg === null)
        throw new DomainError(
          'Record a weight first with record_weight, or give goalKcal.',
        )
      // A saved plan can go stale (a target passed): check it as the app does.
      const problem = energyPlanProblem({
        profile,
        plan,
        date: effectiveDate,
        weightKg: data.latestWeightKg,
      })
      if (problem) throw new DomainError(problem)
      maintenance = formulaMaintenance(
        profile,
        data.latestWeightKg,
        effectiveDate,
      )
      goal = goalForPlan({
        maintenanceKcal: maintenance.kcal,
        weightKg: data.latestWeightKg,
        sex: profile.sex,
        plan,
      })
      basis = 'formula'
      reason ??= calculatorReason(plan)
      warnings.push(
        `A starting estimate from the formula. After ${MIN_LOGGED_DAYS} logged days and ${MIN_WEIGH_INS} weigh-ins, the check-in measures maintenance from the person's own data.`,
      )
    }
    goalKcal = goal.goalKcal
    working = {
      maintenanceKcal: roundKcal(maintenance.kcal),
      likelyRangeKcal: rangeOf(maintenance),
      confidence: closeness(maintenance.uncertaintyKcal),
      adjustmentKcal: goal.adjustmentKcal,
      plannedKgPerWeek: round2(goal.kgPerWeek),
      heldAtMinimum: goal.heldAtMinimum,
    }
    if (goal.heldAtMinimum)
      warnings.push(
        `Held at the ${MIN_GOAL_KCAL[profile.sex]} kcal minimum, so the pace will be slower.`,
      )
  }
  if (basis === 'stated') {
    const minimum = profile ? MIN_GOAL_KCAL[profile.sex] : MIN_GOAL_KCAL.female
    if (goalKcal < minimum)
      warnings.push(
        `Below ${minimum} kcal a day, the lowest goal suggested without medical supervision.`,
      )
    if (
      profile &&
      ageInYearOf(profile.birthYear, effectiveDate) < MIN_ADULT_AGE
    )
      warnings.push(
        'This person is under 18. Teens need energy to grow; a doctor or dietitian should suggest their goal.',
      )
  }
  const before = goalState(person)
  const after = { goalKcal, energyProfile: profile, goalPlan: plan }
  if (canonical(after) === canonical(before))
    warnings.push(
      'This matches the saved goal, plan and profile: saving changes nothing.',
    )
  const weeks =
    plan && data.latestWeightKg !== null
      ? weeksToTarget(plan, data.latestWeightKg)
      : null
  // The plan as it will be saved: omitted keeps it, null clears it.
  const goalPlan =
    plan === person.goalPlan && input.goalPlan === undefined
      ? undefined
      : (plan ?? null)
  return {
    householdId: owner.householdId,
    personId: person._id,
    person: person.name,
    input: {
      personId: person._id,
      expectedEditRevision: input.expectedEditRevision,
      effectiveDate,
      goalKcal,
      ...(input.energyProfile ? { energyProfile: input.energyProfile } : {}),
      ...(goalPlan !== undefined ? { goalPlan } : {}),
      ...(reason ? { reason } : {}),
    },
    before,
    after,
    basis,
    working,
    targetProjection:
      weeks !== null &&
      plan &&
      plan.direction !== 'maintain' &&
      plan.targetWeightKg !== undefined
        ? { targetWeightKg: plan.targetWeightKg, weeks: Math.round(weeks) }
        : undefined,
    warnings,
  }
}

export const previewGoalChange = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    input: goalChangeInput,
  },
  returns: goalChangePreview,
  handler: (ctx, args) =>
    domainResult(async () =>
      prepareGoalChange(
        ctx,
        await requireMcpOwner(
          ctx,
          args.user,
          'nutrition:read',
          args.householdId,
        ),
        args.input,
      ),
    ),
})

export const setGoal = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    input: goalChangeInput,
  },
  returns: goalChangeResult,
  handler: (ctx, { user, householdId, input }) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(ctx, user, 'meals:write', householdId)
      const person = requireActivePerson(
        await ctx.db.get(input.personId),
        owner,
      )
      if (input.goalKcal === undefined)
        throw new DomainError(
          'Send the exact input returned by preview_goal_change, including its goalKcal.',
        )
      const effectiveDate = await requireToday(
        ctx,
        owner,
        input.effectiveDate,
        'Effective date',
      )
      const requested = {
        goalKcal: input.goalKcal,
        energyProfile: input.energyProfile ?? person.energyProfile,
        goalPlan:
          input.goalPlan === undefined
            ? person.goalPlan
            : (input.goalPlan ?? undefined),
      }
      const result = {
        householdId: owner.householdId,
        personId: person._id,
        person: person.name,
        effectiveDate,
        ...weightPath(owner, person),
      }
      // A retry after a save that went through finds its state in place.
      if (canonical(requested) === canonical(goalState(person)))
        return {
          ...result,
          change: 'unchanged' as const,
          previous: goalState(person),
          current: requested,
          editRevision: person.editRevision ?? 0,
        }
      await limiter.limit(ctx, 'writes', {
        key: owner.ownerTokenIdentifier,
        throws: true,
      })
      const { previous, editRevision } = await updatePersonForOwner(
        ctx,
        owner,
        {
          personId: person._id,
          expectedEditRevision: input.expectedEditRevision,
          name: person.name,
          goalKcal: input.goalKcal,
          effectiveDate,
          reason: input.reason ?? STATED_REASON,
          energyProfile: input.energyProfile,
          goalPlan: input.goalPlan,
        },
      )
      return {
        ...result,
        change: 'updated' as const,
        previous: goalState(previous),
        current: requested,
        editRevision,
      }
    }),
})
