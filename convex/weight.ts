import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import {
  assertOwnedOrThrow,
  findLinkedPerson,
  isOwnedBy,
  ownerFields,
  requireAuthenticatedHousehold,
  type AuthenticatedOwner,
} from './lib/auth'
import { assertCanSeeWeight, isAnotherMembers } from './lib/personPrivacy'
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

/** A person's weigh-ins, for a viewer allowed to see them (else it throws). */
export function weightEntriesForPerson(
  ctx: Pick<QueryCtx, 'db'>,
  owner: AuthenticatedOwner,
  person: Doc<'people'>,
  range: { startDate?: string; endDate?: string } = {},
) {
  assertCanSeeWeight(person, owner)
  return ctx.db
    .query('weightEntries')
    .withIndex('by_householdId_and_personId_and_measuredOn', (q) => {
      const scoped = q
        .eq('householdId', owner.householdId)
        .eq('personId', person._id)
      if (range.startDate && range.endDate)
        return scoped
          .gte('measuredOn', range.startDate)
          .lte('measuredOn', range.endDate)
      if (range.startDate) return scoped.gte('measuredOn', range.startDate)
      if (range.endDate) return scoped.lte('measuredOn', range.endDate)
      return scoped
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
  const existing = await weightEntriesForPerson(ctx, owner, person, {
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

/**
 * The person whose weigh-ins a query may return: in this household and not
 * another member's. Otherwise the query returns nothing rather than throwing,
 * so a page open while a person becomes private just shows its private state.
 */
async function visiblePerson(
  ctx: Pick<QueryCtx, 'db'>,
  owner: AuthenticatedOwner,
  personId: Id<'people'>,
) {
  const person = await ctx.db.get(personId)
  return isOwnedBy(person, owner) && !isAnotherMembers(person, owner)
    ? person
    : null
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
    const person = await visiblePerson(ctx, owner, args.personId)
    if (!person) return { page: [], isDone: true, continueCursor: '' }
    const result = await weightEntriesForPerson(ctx, owner, person)
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
    const person = await visiblePerson(ctx, owner, args.personId)
    if (!person) return []
    // One entry per day, so the range bounds the read.
    const entries = await weightEntriesForPerson(ctx, owner, person, {
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
    const person = await visiblePerson(ctx, owner, args.personId)
    if (!person) return null
    const entry = await weightEntriesForPerson(ctx, owner, person, {
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
    const person = await ctx.db.get(entry.personId)
    if (person) assertCanSeeWeight(person, owner)
    if (entry.editRevision !== args.expectedEditRevision)
      throw new DomainError(
        'Weight changed since it was read. Refresh and try again.',
      )
    await ctx.db.delete(entry._id)
    return null
  },
})

/** Weigh-ins deleted per scheduled batch. */
const DEPARTED_BATCH = 100

/**
 * Links made before `linkedAt` existed count from the day linking shipped:
 * nothing was private before it.
 */
const LINKING_SHIPPED = Date.UTC(2026, 10, 9)

/**
 * A member who leaves a household, or deletes their account, takes the
 * weight of the person linked to them along: it was private to them, and
 * unlinked it would show to everyone. The person and its other history stay.
 * The link holds until the weight is gone, so nobody sees it meanwhile.
 */
export async function releaseLinkedPerson(
  ctx: MutationCtx,
  householdId: Id<'households'>,
  userId: Id<'users'>,
) {
  const linked = await findLinkedPerson(ctx, householdId, userId)
  if (linked)
    await ctx.scheduler.runAfter(0, internal.weight.deleteDepartedWeights, {
      personId: linked._id,
      userId,
      // Taken now: an unlink before the job runs would clear linkedAt.
      since: linked.linkedAt ?? LINKING_SHIPPED,
    })
}

export const deleteDepartedWeights = internalMutation({
  args: {
    personId: v.id('people'),
    userId: v.id('users'),
    since: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId)
    if (!person) return null
    // Another member's now; only possible after this one rejoined and left
    // the person: what is left is theirs.
    if (person.userId !== undefined && person.userId !== args.userId)
      return null
    // Only what was recorded or corrected while linked: the household's
    // earlier weigh-ins and goal reasons stay shared.
    const { since } = args
    const weights = await ctx.db
      .query('weightEntries')
      .withIndex('by_householdId_and_personId_and_measuredOn', (q) =>
        q.eq('householdId', person.householdId).eq('personId', person._id),
      )
      .filter((q) =>
        q.or(
          q.gte(q.field('createdAt'), since),
          q.gte(q.field('updatedAt'), since),
        ),
      )
      .take(DEPARTED_BATCH)
    for (const entry of weights) await ctx.db.delete(entry._id)
    // Check-in reasons carry maintenance figures, as private as the weight.
    const reasons =
      weights.length === DEPARTED_BATCH
        ? []
        : await ctx.db
            .query('personGoalHistory')
            .withIndex('by_householdId_and_personId_and_createdAt', (q) =>
              q
                .eq('householdId', person.householdId)
                .eq('personId', person._id)
                .gte('createdAt', since),
            )
            .filter((q) => q.neq(q.field('reason'), undefined))
            .take(DEPARTED_BATCH)
    for (const row of reasons)
      await ctx.db.patch(row._id, { reason: undefined })
    if (weights.length === DEPARTED_BATCH || reasons.length === DEPARTED_BATCH)
      await ctx.scheduler.runAfter(
        0,
        internal.weight.deleteDepartedWeights,
        args,
      )
    else
      // The profile and target weight were as private as the weight.
      await ctx.db.patch(person._id, {
        userId: undefined,
        linkedAt: undefined,
        energyProfile: undefined,
        ...(person.goalPlan?.direction !== 'maintain' &&
          person.goalPlan && {
            goalPlan: {
              direction: person.goalPlan.direction,
              percentPerWeek: person.goalPlan.percentPerWeek,
            },
          }),
      })
    return null
  },
})
