import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { query } from './_generated/server'
import { requireAuthenticatedHousehold, withoutOwner } from './lib/auth'
import {
  assertHistoryRange,
  assertPageSize,
  MAX_RELATED_ROWS,
  normalizeRequiredDate,
} from './lib/validation'

const summaryDto = v.object({
  _id: v.id('dailySummaries'),
  _creationTime: v.number(),
  personId: v.id('people'),
  eatenOn: v.string(),
  consumedCalories: v.number(),
  mealCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const goalDto = v.object({
  _id: v.id('personGoalHistory'),
  _creationTime: v.number(),
  personId: v.id('people'),
  effectiveDate: v.string(),
  goalKcal: v.number(),
  reason: v.optional(v.string()),
  createdAt: v.number(),
})

export const list = query({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    startDate: v.string(),
    endDate: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(summaryDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    const startDate = normalizeRequiredDate(args.startDate, 'Start date')
    const endDate = normalizeRequiredDate(args.endDate, 'End date')
    assertHistoryRange(startDate, endDate)
    const person = await ctx.db.get(args.personId)
    if (person?.householdId !== owner.householdId) {
      throw new Error('Person not found.')
    }
    const result = await ctx.db
      .query('dailySummaries')
      .withIndex('by_householdId_and_personId_and_eatenOn', (q) =>
        q
          .eq('householdId', owner.householdId)
          .eq('personId', args.personId)
          .gte('eatenOn', startDate)
          .lte('eatenOn', endDate),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutOwner) }
  },
})

export const goalsForRange = query({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.array(goalDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const startDate = normalizeRequiredDate(args.startDate, 'Start date')
    const endDate = normalizeRequiredDate(args.endDate, 'End date')
    assertHistoryRange(startDate, endDate)
    const person = await ctx.db.get(args.personId)
    if (person?.householdId !== owner.householdId) {
      throw new Error('Person not found.')
    }
    const inRange = await ctx.db
      .query('personGoalHistory')
      .withIndex('by_householdId_and_personId_and_effectiveDate', (q) =>
        q
          .eq('householdId', owner.householdId)
          .eq('personId', args.personId)
          .gte('effectiveDate', startDate)
          .lte('effectiveDate', endDate),
      )
      .order('desc')
      .take(MAX_RELATED_ROWS + 1)
    if (inRange.length > MAX_RELATED_ROWS) {
      throw new Error('Goal history is too large for the selected range.')
    }

    const precedingGoal = await ctx.db
      .query('personGoalHistory')
      .withIndex('by_householdId_and_personId_and_effectiveDate', (q) =>
        q
          .eq('householdId', owner.householdId)
          .eq('personId', args.personId)
          .lt('effectiveDate', startDate),
      )
      .order('desc')
      .first()

    const result = precedingGoal ? [...inRange, precedingGoal] : inRange
    if (result.length > MAX_RELATED_ROWS) {
      throw new Error('Goal history is too large for the selected range.')
    }
    return result.map(withoutOwner)
  },
})
