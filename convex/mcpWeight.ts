import { vMcpUser } from '@convex-dev/mcp'
import { v } from 'convex/values'
import type { Doc } from './_generated/dataModel'
import { internalMutation } from './_generated/server'
import { assertOwnedOrThrow } from './lib/auth'
import { DomainError, normalizeRequiredDate } from './lib/validation'
import { domainResult, requireMcpOwner } from './mcpContext'
import { appUrl, limiter } from './mcpOperations'
import { weightHistoryResult, weightRecordResult } from './mcpValidators'
import { recordWeightForOwner, weightEntriesForPerson } from './weight'

const WEIGHT_PAGE_SIZE = 30

function toMcpEntry(entry: Doc<'weightEntries'>) {
  return {
    entryId: entry._id,
    measuredOn: entry.measuredOn,
    weightKg: entry.weightKg,
    editRevision: entry.editRevision,
  }
}

export const getWeightHistory = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    cursor: v.optional(v.string()),
  },
  returns: weightHistoryResult,
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
      const startDate =
        args.startDate === undefined
          ? undefined
          : normalizeRequiredDate(args.startDate, 'Start date')
      const endDate =
        args.endDate === undefined
          ? undefined
          : normalizeRequiredDate(args.endDate, 'End date')
      if (startDate && endDate && startDate > endDate)
        throw new DomainError('Start date must be on or before end date.')
      const page = await weightEntriesForPerson(ctx, owner, person._id, {
        startDate,
        endDate,
      })
        .order('desc')
        .paginate({ numItems: WEIGHT_PAGE_SIZE, cursor: args.cursor ?? null })
      return {
        householdId: owner.householdId,
        personId: person._id,
        person: person.name,
        entries: page.page.map(toMcpEntry),
        cursor: page.isDone ? null : page.continueCursor,
      }
    }),
})

export const recordWeight = internalMutation({
  args: {
    user: vMcpUser(),
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    measuredOn: v.string(),
    weightKg: v.number(),
    expectedEditRevision: v.optional(v.number()),
  },
  returns: weightRecordResult,
  handler: (ctx, { user, householdId, ...input }) =>
    domainResult(async () => {
      const owner = await requireMcpOwner(ctx, user, 'meals:write', householdId)
      await limiter.limit(ctx, 'writes', {
        key: owner.tokenIdentifier,
        throws: true,
      })
      const result = await recordWeightForOwner(ctx, owner, input)
      const path = `/weight?householdId=${owner.householdId}&personId=${result.person._id}`
      return {
        householdId: owner.householdId,
        personId: result.person._id,
        person: result.person.name,
        entry: toMcpEntry(result.entry),
        change: result.change,
        ...('previousWeightKg' in result
          ? { previousWeightKg: result.previousWeightKg }
          : {}),
        path,
        url: appUrl(path),
      }
    }),
})
