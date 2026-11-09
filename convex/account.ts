import { v } from 'convex/values'

import { components, internal } from './_generated/api'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from './_generated/server'
import {
  findUserId,
  listMemberships,
  requireAuthenticatedUser,
} from './lib/auth'

// Deleting an account is the one place that hard-deletes history: the person
// withdrew consent, so their data has to go, not be archived. A household
// they share keeps its data for the other members.

const MAX_HOUSEHOLDS = 10
const MAX_MEMBERS = 20
const MAX_INVITATIONS = 200
const MAX_CONSENTS = 100
/** Rows deleted per scheduled batch, small enough for any table's documents. */
const BATCH = 200

type Db = MutationCtx['db']
type Rows = Promise<Array<{ _id: Id<TableNames> }>>

// Every table that holds household data, children before their parents so a
// half-finished run never leaves a child pointing at a missing parent.
const householdTables: Array<
  (db: Db, householdId: Id<'households'>, limit: number) => Rows
> = [
  (db, id, limit) =>
    db
      .query('mealItems')
      .withIndex('by_householdId_and_mealId', (q) => q.eq('householdId', id))
      .take(limit),
  (db, id, limit) =>
    db
      .query('mealTemplates')
      .withIndex('by_householdId_and_name', (q) => q.eq('householdId', id))
      .take(limit),
  (db, id, limit) =>
    db
      .query('mcpSavedFoods')
      .withIndex('by_householdId_and_name', (q) => q.eq('householdId', id))
      .take(limit),
  (db, id, limit) =>
    db
      .query('meals')
      .withIndex('by_householdId_and_eatenOn', (q) => q.eq('householdId', id))
      .take(limit),
  (db, id, limit) =>
    db
      .query('dailySummaries')
      .withIndex('by_householdId_and_eatenOn', (q) => q.eq('householdId', id))
      .take(limit),
  (db, id, limit) =>
    db
      .query('weightEntries')
      .withIndex('by_householdId_and_personId_and_measuredOn', (q) =>
        q.eq('householdId', id),
      )
      .take(limit),
  (db, id, limit) =>
    db
      .query('personGoalHistory')
      .withIndex('by_householdId_and_personId_and_createdAt', (q) =>
        q.eq('householdId', id),
      )
      .take(limit),
  (db, id, limit) =>
    db
      .query('cookedFoodIngredients')
      .withIndex('by_householdId_and_cookedFoodId', (q) =>
        q.eq('householdId', id),
      )
      .take(limit),
  (db, id, limit) =>
    db
      .query('cookedFoods')
      .withIndex('by_householdId_and_archived_and_name', (q) =>
        q.eq('householdId', id),
      )
      .take(limit),
  (db, id, limit) =>
    db
      .query('cookSessions')
      .withIndex('by_householdId_and_archived_and_label', (q) =>
        q.eq('householdId', id),
      )
      .take(limit),
  (db, id, limit) =>
    db
      .query('recipeVersionIngredients')
      .withIndex('by_householdId_and_recipeVersionId', (q) =>
        q.eq('householdId', id),
      )
      .take(limit),
  (db, id, limit) =>
    db
      .query('recipeVersions')
      .withIndex('by_householdId_and_recipeId', (q) => q.eq('householdId', id))
      .take(limit),
  (db, id, limit) =>
    db
      .query('recipes')
      .withIndex('by_householdId_and_archived_and_name', (q) =>
        q.eq('householdId', id),
      )
      .take(limit),
  (db, id, limit) =>
    db
      .query('ingredients')
      .withIndex('by_householdId_and_archived_and_name', (q) =>
        q.eq('householdId', id),
      )
      .take(limit),
  (db, id, limit) =>
    db
      .query('foodGroups')
      .withIndex('by_householdId_and_archived_and_name', (q) =>
        q.eq('householdId', id),
      )
      .take(limit),
  (db, id, limit) =>
    db
      .query('people')
      .withIndex('by_householdId_and_archived_and_name', (q) =>
        q.eq('householdId', id),
      )
      .take(limit),
  (db, id, limit) =>
    db
      .query('householdInvitations')
      .withIndex('by_householdId', (q) => q.eq('householdId', id))
      .take(limit),
]

async function leaveHousehold(
  ctx: MutationCtx,
  userId: Id<'users'>,
  membership: Doc<'householdMembers'>,
) {
  const { householdId } = membership
  const others = (
    await ctx.db
      .query('householdMembers')
      .withIndex('by_householdId', (q) => q.eq('householdId', householdId))
      .take(MAX_MEMBERS)
  ).filter((row) => row._id !== membership._id)
  await ctx.db.delete(membership._id)
  if (others.length === 0) {
    await ctx.scheduler.runAfter(0, internal.account.deleteHousehold, {
      householdId,
    })
    return
  }
  // A shared household keeps an admin: the longest-standing member.
  if (
    membership.role === 'admin' &&
    !others.some((row) => row.role === 'admin')
  )
    await ctx.db.patch(
      others.reduce((first, row) =>
        row.joinedAt < first.joinedAt ? row : first,
      )._id,
      { role: 'admin' },
    )
  const household = await ctx.db.get(householdId)
  if (household?.personalOwnerUserId === userId)
    await ctx.db.patch(householdId, { personalOwnerUserId: undefined })
  const invitations = await ctx.db
    .query('householdInvitations')
    .withIndex('by_householdId', (q) => q.eq('householdId', householdId))
    .take(MAX_INVITATIONS)
  for (const invitation of invitations)
    if (invitation.createdByUserId === userId)
      await ctx.db.delete(invitation._id)
}

/**
 * Deletes the signed-in account: its assistant connections, settings and
 * consent, its membership of every household, and every household it was the
 * only member of. The client then deletes the Clerk sign-in.
 */
export const deleteMyAccount = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    // Assistant connections are keyed by the Clerk identity (see mcp.ts).
    const grants = await ctx.runQuery(components.mcp.grants.list, {
      userId: tokenIdentifier,
    })
    for (const grant of grants)
      await ctx.runMutation(components.mcp.grants.revoke, {
        userId: tokenIdentifier,
        grantId: grant._id,
      })
    const userId = await findUserId(ctx, tokenIdentifier)
    if (!userId) return null
    for (const membership of await listMemberships(ctx, userId, MAX_HOUSEHOLDS))
      await leaveHousehold(ctx, userId, membership)
    const settings = await Promise.all([
      ctx.db
        .query('userPreferences')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique(),
      ctx.db
        .query('mcpPreferences')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique(),
    ])
    for (const row of settings) if (row) await ctx.db.delete(row._id)
    const consents = await ctx.db
      .query('privacyConsents')
      .withIndex('by_userId_and_version', (q) => q.eq('userId', userId))
      .take(MAX_CONSENTS)
    for (const row of consents) await ctx.db.delete(row._id)
    await ctx.db.delete(userId)
    await ctx.scheduler.runAfter(0, internal.account.deleteOperations, {
      userId,
    })
    return null
  },
})

/** Deletes a household nobody belongs to any more, one batch at a time. */
export const deleteHousehold = internalMutation({
  args: { householdId: v.id('households') },
  returns: v.null(),
  handler: async (ctx, { householdId }) => {
    // Never delete data someone can still reach.
    const member = await ctx.db
      .query('householdMembers')
      .withIndex('by_householdId', (q) => q.eq('householdId', householdId))
      .first()
    if (member) return null
    for (const rows of householdTables) {
      const batch = await rows(ctx.db, householdId, BATCH)
      if (batch.length === 0) continue
      for (const row of batch) await ctx.db.delete(row._id)
      await ctx.scheduler.runAfter(0, internal.account.deleteHousehold, {
        householdId,
      })
      return null
    }
    if (await ctx.db.get(householdId)) await ctx.db.delete(householdId)
    return null
  },
})

/** Deletes a deleted account's assistant operation receipts, in batches. */
export const deleteOperations = internalMutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const batch = await ctx.db
      .query('mcpOperations')
      .withIndex('by_ownerUserId_and_connectionId_and_key', (q) =>
        q.eq('ownerUserId', userId),
      )
      .take(BATCH)
    for (const row of batch) await ctx.db.delete(row._id)
    if (batch.length === BATCH)
      await ctx.scheduler.runAfter(0, internal.account.deleteOperations, {
        userId,
      })
    return null
  },
})
