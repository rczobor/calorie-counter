import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import type { Doc, Id } from './_generated/dataModel'
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import {
  assertOwnedOrThrow,
  ownerFields,
  requireAuthenticatedHousehold,
  type AuthenticatedOwner,
} from './lib/auth'
import {
  assertHistoryRange,
  assertPageSize,
  DomainError,
  MAX_HISTORY_DAYS,
  normalizeRequiredDate,
} from './lib/validation'

export const MIN_WEIGHT_KG = 1
export const MAX_WEIGHT_KG = 500

export const weightEntryDto = v.object({
  _id: v.id('weightEntries'),
  personId: v.id('people'),
  measuredOn: v.string(),
  weightKg: v.number(),
  editRevision: v.number(),
})

export function toWeightEntryDto(entry: Doc<'weightEntries'>) {
  return {
    _id: entry._id,
    personId: entry.personId,
    measuredOn: entry.measuredOn,
    weightKg: entry.weightKg,
    editRevision: entry.editRevision,
  }
}

export function normalizeWeightKg(value: number) {
  if (
    !Number.isFinite(value) ||
    value < MIN_WEIGHT_KG ||
    value > MAX_WEIGHT_KG
  ) {
    throw new DomainError(
      `Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`,
    )
  }
  return value
}

export function weightEntriesForPerson(
  ctx: Pick<QueryCtx, 'db'>,
  owner: AuthenticatedOwner,
  personId: Id<'people'>,
  range: { startDate?: string; endDate?: string } = {},
) {
  return ctx.db
    .query('weightEntries')
    .withIndex('by_householdId_and_personId_and_measuredOn', (q) => {
      const person = q
        .eq('householdId', owner.householdId)
        .eq('personId', personId)
      if (range.startDate && range.endDate)
        return person
          .gte('measuredOn', range.startDate)
          .lte('measuredOn', range.endDate)
      if (range.startDate) return person.gte('measuredOn', range.startDate)
      if (range.endDate) return person.lte('measuredOn', range.endDate)
      return person
    })
}

/**
 * Sets a person's weight for one day. Saving the weight already recorded
 * changes nothing, so retries are safe. Replacing a different weight needs the
 * entry's current edit revision, so nobody overwrites a value they have not
 * seen.
 */
export async function recordWeightForOwner(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  input: {
    personId: Id<'people'>
    measuredOn: string
    weightKg: number
    expectedEditRevision?: number
  },
) {
  const person = assertOwnedOrThrow(
    await ctx.db.get(input.personId),
    owner,
    'Person not found.',
  )
  if (person.archived)
    throw new DomainError(
      'Person is archived. Restore them before recording a weight.',
    )
  const measuredOn = normalizeRequiredDate(input.measuredOn, 'Weight date')
  const weightKg = normalizeWeightKg(input.weightKg)
  const existing = await weightEntriesForPerson(ctx, owner, person._id, {
    startDate: measuredOn,
    endDate: measuredOn,
  }).unique()
  const now = Date.now()
  if (!existing) {
    const id = await ctx.db.insert('weightEntries', {
      ...ownerFields(owner),
      personId: person._id,
      measuredOn,
      weightKg,
      editRevision: 0,
      createdAt: now,
      updatedAt: now,
    })
    const entry = await ctx.db.get(id)
    if (!entry) throw new Error('Weight entry was not saved.')
    return { person, entry, change: 'created' as const }
  }
  if (existing.weightKg === weightKg)
    return { person, entry: existing, change: 'unchanged' as const }
  if (input.expectedEditRevision === undefined)
    throw new DomainError(
      `Weight for ${measuredOn} is already recorded as ${existing.weightKg} kg (edit revision ${existing.editRevision}). Confirm the replacement, then save again with that revision.`,
    )
  if (input.expectedEditRevision !== existing.editRevision)
    throw new DomainError(
      'Weight changed since it was read. Refresh and try again.',
    )
  const editRevision = existing.editRevision + 1
  await ctx.db.patch(existing._id, { weightKg, editRevision, updatedAt: now })
  return {
    person,
    entry: { ...existing, weightKg, editRevision, updatedAt: now },
    change: 'updated' as const,
    previousWeightKg: existing.weightKg,
  }
}

export const list = query({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(weightEntryDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    const result = await weightEntriesForPerson(ctx, owner, args.personId)
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map(toWeightEntryDto) }
  },
})

export const listRange = query({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    startDate: v.string(),
    endDate: v.string(),
  },
  returns: v.array(weightEntryDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const startDate = normalizeRequiredDate(args.startDate, 'Start date')
    const endDate = normalizeRequiredDate(args.endDate, 'End date')
    assertHistoryRange(startDate, endDate)
    // One entry per day, so the range bounds the read.
    const entries = await weightEntriesForPerson(ctx, owner, args.personId, {
      startDate,
      endDate,
    }).take(MAX_HISTORY_DAYS)
    return entries.map(toWeightEntryDto)
  },
})

export const latestOnOrBefore = query({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    date: v.string(),
  },
  returns: v.union(v.null(), weightEntryDto),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const endDate = normalizeRequiredDate(args.date, 'Date')
    const entry = await weightEntriesForPerson(ctx, owner, args.personId, {
      endDate,
    })
      .order('desc')
      .first()
    return entry ? toWeightEntryDto(entry) : null
  },
})

export const record = mutation({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
    measuredOn: v.string(),
    weightKg: v.number(),
    expectedEditRevision: v.optional(v.number()),
  },
  returns: v.id('weightEntries'),
  handler: async (ctx, { householdId, ...input }) => {
    const owner = await requireAuthenticatedHousehold(ctx, householdId)
    return (await recordWeightForOwner(ctx, owner, input)).entry._id
  },
})

// Nothing references a weight entry, so deleting one cannot rewrite history.
export const remove = mutation({
  args: {
    householdId: v.optional(v.id('households')),
    entryId: v.id('weightEntries'),
    expectedEditRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const entry = assertOwnedOrThrow(
      await ctx.db.get(args.entryId),
      owner,
      'Weight entry not found.',
    )
    if (entry.editRevision !== args.expectedEditRevision)
      throw new DomainError(
        'Weight changed since it was read. Refresh and try again.',
      )
    await ctx.db.delete(entry._id)
    return null
  },
})
