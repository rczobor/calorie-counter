import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { query } from './_generated/server'
import { requireAuthenticatedUser, withoutOwner } from './lib/auth'
import {
  assertPageSize,
  MAX_SEARCH_RESULTS,
  normalizeSearch,
  normalizeRequiredDate,
} from './lib/validation'

const personDto = v.object({
  _id: v.id('people'),
  _creationTime: v.number(),
  name: v.string(),
  notes: v.optional(v.string()),
  currentDailyGoalKcal: v.number(),
  archived: v.boolean(),
  editRevision: v.number(),
  createdAt: v.number(),
})

function personWithoutOwner(person: Doc<'people'>) {
  return { ...withoutOwner(person), editRevision: person.editRevision ?? 0 }
}

const personWithTodayDto = personDto.extend({
  consumedCalories: v.number(),
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
    archived: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(personDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('people')
      .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('archived', args.archived),
      )
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(personWithoutOwner) }
  },
})

export const get = query({
  args: { personId: v.id('people') },
  returns: v.union(v.null(), personDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const person = await ctx.db.get(args.personId)
    if (person?.ownerTokenIdentifier !== owner.ownerTokenIdentifier) {
      return null
    }
    return personWithoutOwner(person)
  },
})

export const listWithToday = query({
  args: {
    archived: v.boolean(),
    today: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(personWithTodayDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const today = normalizeRequiredDate(args.today, 'Today')
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('people')
      .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('archived', args.archived),
      )
      .paginate(args.paginationOpts)
    const page = await Promise.all(
      result.page.map(async (person) => {
        const summary = await ctx.db
          .query('dailySummaries')
          .withIndex('by_ownerTokenIdentifier_and_personId_and_eatenOn', (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('personId', person._id)
              .eq('eatenOn', today),
          )
          .unique()
        return {
          ...personWithoutOwner(person),
          consumedCalories: summary?.consumedCalories ?? 0,
        }
      }),
    )
    return { ...result, page }
  },
})

export const search = query({
  args: { archived: v.boolean(), search: v.string() },
  returns: v.array(personDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    const search = normalizeSearch(args.search)
    const rows = search
      ? await ctx.db
          .query('people')
          .withSearchIndex('search_name', (q) =>
            q
              .search('name', search)
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
      : await ctx.db
          .query('people')
          .withIndex('by_ownerTokenIdentifier_and_archived_and_name', (q) =>
            q
              .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
              .eq('archived', args.archived),
          )
          .take(MAX_SEARCH_RESULTS)
    return rows.map(personWithoutOwner)
  },
})

export const listGoalHistory = query({
  args: {
    personId: v.id('people'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(goalDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedUser(ctx)
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('personGoalHistory')
      .withIndex('by_ownerTokenIdentifier_and_personId_and_createdAt', (q) =>
        q
          .eq('ownerTokenIdentifier', owner.ownerTokenIdentifier)
          .eq('personId', args.personId),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(withoutOwner) }
  },
})
