import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { query, type QueryCtx } from './_generated/server'
import {
  assertOwnedOrThrow,
  requireAuthenticatedHousehold,
  type AuthenticatedOwner,
} from './lib/auth'
import { buildCheckIn, CHECK_IN_LOOKBACK_DAYS, shiftDay } from './lib/energy'
import { normalizeRequiredDate } from './lib/validation'
import { weightEntriesForPerson } from './weight'

const estimateDto = v.object({ kcal: v.number(), uncertaintyKcal: v.number() })
const progressFields = {
  loggedDays: v.number(),
  weighIns: v.number(),
  weighInSpanDays: v.number(),
  incompleteDays: v.array(v.object({ date: v.string(), kcal: v.number() })),
}

const checkInDto = v.object({
  latestWeightKg: v.union(v.null(), v.number()),
  /** The equations' estimate; null until the person has a profile and a weight. */
  formula: v.union(v.null(), estimateDto),
  estimate: v.union(
    v.object({ status: v.literal('learning'), ...progressFields }),
    v.object({
      status: v.literal('ready'),
      ...progressFields,
      averageIntakeKcal: v.number(),
      trendKgPerWeek: v.number(),
      trendWeightKg: v.number(),
      measuredKcal: v.number(),
      maintenance: estimateDto,
    }),
  ),
  history: v.array(estimateDto.extend({ date: v.string() })),
  /** The goal that keeps the saved plan on pace, once the estimate is ready. */
  suggestion: v.union(
    v.null(),
    v.object({
      goalKcal: v.number(),
      kgPerWeek: v.number(),
      heldAtMinimum: v.boolean(),
      targetReached: v.boolean(),
      belowHealthyWeight: v.boolean(),
    }),
  ),
})

/**
 * The logged days and weigh-ins a check-in for `today` reads. The app's query
 * and the MCP server build their check-ins from the same reads.
 */
export async function readCheckInData(
  ctx: Pick<QueryCtx, 'db'>,
  owner: AuthenticatedOwner,
  personId: Id<'people'>,
  today: string,
) {
  const firstDay = shiftDay(today, -CHECK_IN_LOOKBACK_DAYS)
  // One summary and at most one weight per day, so the ranges bound the reads.
  const summaries = await ctx.db
    .query('dailySummaries')
    .withIndex('by_householdId_and_personId_and_eatenOn', (q) =>
      q
        .eq('householdId', owner.householdId)
        .eq('personId', personId)
        .gte('eatenOn', firstDay)
        .lt('eatenOn', today),
    )
    .take(CHECK_IN_LOOKBACK_DAYS)
  const weighIns = await weightEntriesForPerson(ctx, owner, personId, {
    startDate: firstDay,
    endDate: today,
  }).take(CHECK_IN_LOOKBACK_DAYS + 1)
  const latest = await weightEntriesForPerson(ctx, owner, personId, {
    endDate: today,
  })
    .order('desc')
    .first()
  return {
    intake: summaries
      .filter((day) => day.mealCount > 0)
      .map((day) => ({ date: day.eatenOn, kcal: day.consumedCalories })),
    weights: weighIns.map((entry) => ({
      date: entry.measuredOn,
      kg: entry.weightKg,
    })),
    latestWeightKg: latest?.weightKg ?? null,
  }
}

/**
 * A person's maintenance calories measured from their last four weeks of logs
 * and weigh-ins, and the goal that keeps their plan on pace. Suggests only:
 * the goal changes when someone accepts it.
 */
export const checkIn = query({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    // The client's local date: queries must not read the clock.
    today: v.string(),
  },
  returns: checkInDto,
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const person = assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      owner,
      'Person not found.',
    )
    const today = normalizeRequiredDate(args.today, 'Today')
    return buildCheckIn({
      today,
      ...(await readCheckInData(ctx, owner, person._id, today)),
      profile: person.energyProfile,
      plan: person.goalPlan,
    })
  },
})
