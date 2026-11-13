import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v, type Infer } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import { query } from './_generated/server'
import {
  findLinkedPerson,
  requireAuthenticatedHousehold,
  withoutOwner,
} from './lib/auth'
import { goalReasonFor } from './lib/personPrivacy'
import { dayNutrition, readDayNutrition } from './lib/dayNutrition'
import {
  assertPageSize,
  MAX_PAGE_SIZE,
  MAX_SEARCH_RESULTS,
  normalizeSearch,
  normalizeRequiredDate,
} from './lib/validation'
import {
  energyProfileValidator,
  goalPlanValidator,
  macroGoalsValidator,
  macroTotalsValidator,
} from './validators'

const personDto = v.object({
  _id: v.id('people'),
  _creationTime: v.number(),
  name: v.string(),
  notes: v.optional(v.string()),
  currentDailyGoalKcal: v.number(),
  energyProfile: v.optional(energyProfileValidator),
  goalPlan: v.optional(goalPlanValidator),
  macroGoals: v.optional(macroGoalsValidator),
  archived: v.boolean(),
  editRevision: v.number(),
  createdAt: v.number(),
  // Whose account this person is linked to, from the viewer's side.
  linkedAccount: v.optional(v.union(v.literal('you'), v.literal('other'))),
})

function personWithoutOwner(
  person: Doc<'people'>,
  viewer: Id<'users'>,
): Infer<typeof personDto> {
  const { userId, energyProfile, goalPlan, ...fields } = withoutOwner(person)
  // When the link was made is the server's business, not the viewer's.
  delete fields.linkedAt
  if (userId && userId !== viewer) {
    // Another member's person: their goal stays visible, but the profile and
    // target weight behind it are as private as their weight.
    const plan =
      goalPlan && goalPlan.direction !== 'maintain'
        ? {
            direction: goalPlan.direction,
            percentPerWeek: goalPlan.percentPerWeek,
          }
        : goalPlan
    return {
      ...fields,
      ...(plan && { goalPlan: plan }),
      editRevision: person.editRevision ?? 0,
      linkedAccount: 'other' as const,
    }
  }
  return {
    ...fields,
    ...(energyProfile && { energyProfile }),
    ...(goalPlan && { goalPlan }),
    editRevision: person.editRevision ?? 0,
    ...(userId && { linkedAccount: 'you' as const }),
  }
}

const personWithTodayDto = personDto.extend({
  consumedCalories: v.number(),
})

const personWithDayDto = personWithTodayDto.extend({
  macros: v.optional(macroTotalsValidator),
  macroTargets: dayNutrition.fields.macroTargets,
  proteinPerKg: v.optional(v.number()),
  goalKcal: v.number(),
  remainingCalories: v.number(),
  mealCount: v.number(),
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
    archived: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(personDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('people')
      .withIndex('by_householdId_and_archived_and_name', (q) =>
        q.eq('householdId', owner.householdId).eq('archived', args.archived),
      )
      .paginate(args.paginationOpts)
    return {
      ...result,
      page: result.page.map((person) =>
        personWithoutOwner(person, owner.userId),
      ),
    }
  },
})

export const get = query({
  args: {
    householdId: v.optional(v.id('households')),
    // Deep links and saved selections may hold malformed IDs; treat them as missing.
    personId: v.string(),
  },
  returns: v.union(v.null(), personDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const personId = ctx.db.normalizeId('people', args.personId)
    const person = personId ? await ctx.db.get(personId) : null
    if (person?.householdId !== owner.householdId) {
      return null
    }
    return personWithoutOwner(person, owner.userId)
  },
})

export const listWithToday = query({
  args: {
    householdId: v.optional(v.id('households')),
    archived: v.boolean(),
    today: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(personWithTodayDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const today = normalizeRequiredDate(args.today, 'Today')
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('people')
      .withIndex('by_householdId_and_archived_and_name', (q) =>
        q.eq('householdId', owner.householdId).eq('archived', args.archived),
      )
      .paginate(args.paginationOpts)
    const page = await Promise.all(
      result.page.map(async (person) => {
        const summary = await ctx.db
          .query('dailySummaries')
          .withIndex('by_householdId_and_personId_and_eatenOn', (q) =>
            q
              .eq('householdId', owner.householdId)
              .eq('personId', person._id)
              .eq('eatenOn', today),
          )
          .unique()
        return {
          ...personWithoutOwner(person, owner.userId),
          consumedCalories: summary?.consumedCalories ?? 0,
        }
      }),
    )
    return { ...result, page }
  },
})

export const listForDay = query({
  args: {
    householdId: v.optional(v.id('households')),
    archived: v.boolean(),
    eatenOn: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(personWithDayDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const eatenOn = normalizeRequiredDate(args.eatenOn, 'Meal date')
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('people')
      .withIndex('by_householdId_and_archived_and_name', (q) =>
        q.eq('householdId', owner.householdId).eq('archived', args.archived),
      )
      .paginate(args.paginationOpts)
    const page = await Promise.all(
      result.page.map(async (person) => {
        const summary = await readDayNutrition(ctx, owner, person._id, eatenOn)
        return {
          ...personWithoutOwner(person, owner.userId),
          consumedCalories: summary.consumedCalories,
          macros: summary.macros,
          macroTargets: summary.macroTargets,
          proteinPerKg: summary.proteinPerKg,
          goalKcal: summary.goalKcal,
          remainingCalories: summary.remainingCalories,
          mealCount: summary.mealCount,
        }
      }),
    )
    return { ...result, page }
  },
})

export const search = query({
  args: {
    householdId: v.optional(v.id('households')),
    archived: v.boolean(),
    search: v.string(),
  },
  returns: v.array(personDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const search = normalizeSearch(args.search)
    const rows = search
      ? await ctx.db
          .query('people')
          .withSearchIndex('search_name', (q) =>
            q
              .search('name', search)
              .eq('householdId', owner.householdId)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
      : await ctx.db
          .query('people')
          .withIndex('by_householdId_and_archived_and_name', (q) =>
            q
              .eq('householdId', owner.householdId)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
    return rows.map((person) => personWithoutOwner(person, owner.userId))
  },
})

/**
 * Whether anyone active in the household tracks macros, which they opt into by
 * setting a macro goal. Until then the app shows no macro fields.
 */
export const tracksMacros = query({
  args: { householdId: v.optional(v.id('households')) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const people = await ctx.db
      .query('people')
      .withIndex('by_householdId_and_archived_and_name', (q) =>
        q.eq('householdId', owner.householdId).eq('archived', false),
      )
      // Households hold a handful of people; this bounds a pathological one.
      .take(MAX_PAGE_SIZE)
    return people.some((person) => person.macroGoals !== undefined)
  },
})

/**
 * The person the viewer linked to themselves in this household, or null. The
 * list asks "Which one is you?" until there is one, even when that person is
 * archived or on a later page.
 */
export const linkedToMe = query({
  args: { householdId: v.optional(v.id('households')) },
  returns: v.union(v.null(), v.id('people')),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const person = await findLinkedPerson(ctx, owner.householdId, owner.userId)
    return person?._id ?? null
  },
})

export const listGoalHistory = query({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(goalDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    // The order readDayNutrition picks the goal in effect by: newest date,
    // then newest change, so the client can fold same-day changes under the
    // one that applied.
    const result = await ctx.db
      .query('personGoalHistory')
      .withIndex('by_householdId_and_personId_and_effectiveDate', (q) =>
        q.eq('householdId', owner.householdId).eq('personId', args.personId),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    const person = await ctx.db.get(args.personId)
    return {
      ...result,
      page: result.page.map((row) => ({
        ...withoutOwner(row),
        reason: person ? goalReasonFor(person, owner, row.reason) : undefined,
      })),
    }
  },
})
