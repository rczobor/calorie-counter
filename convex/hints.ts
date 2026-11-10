import { v } from 'convex/values'

import { components } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { env, mutation, query, type QueryCtx } from './_generated/server'
import { readCheckInData } from './energy'
import {
  findLinkedPerson,
  findMembership,
  requireAuthenticatedHousehold,
  requireAuthenticatedUser,
} from './lib/auth'
import { buildCheckIn } from './lib/energy'
import { HINTS, hintValidator, type Hint } from './lib/hints'
import { normalizeRequiredDate } from './lib/validation'

/**
 * Days with a meal this account logged, counted before today only: the first
 * day is for looking around, so no hint can qualify on it.
 */
const DAYS_FOR = {
  history: 2,
  invite: 2,
  maintenance: 2,
  assistant: 3,
  weighIn: 3,
  widget: 5,
} satisfies Partial<Record<Hint, number>>
const MOST_DAYS = Math.max(...Object.values(DAYS_FOR))

/** Distinct days before `today` with a meal the account logged, up to `limit`. */
async function loggedDaysBefore(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
  today: string,
  limit: number,
) {
  // One index seek per day, newest first, so a busy day costs one read.
  let days = 0
  let before = today
  while (days < limit) {
    const meal = await ctx.db
      .query('meals')
      .withIndex('by_ownerUserId_and_eatenOn', (q) =>
        q.eq('ownerUserId', userId).lt('eatenOn', before),
      )
      .order('desc')
      .first()
    if (!meal) break
    days++
    before = meal.eatenOn
  }
  return days
}

/** Whether the account has an AI assistant connected right now. */
async function hasAssistant(ctx: QueryCtx) {
  // Connection grants are keyed by the Clerk identity (see mcp.ts); revoking
  // one deletes it, so any grant is a live connection.
  const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
  const grants = await ctx.runQuery(components.mcp.grants.list, {
    userId: tokenIdentifier,
  })
  return grants.length > 0
}

/**
 * Whether an AI assistant is connected, so the lists only it fills offer its
 * setup only to accounts without one.
 */
export const assistantConnected = query({
  args: { householdId: v.optional(v.id('households')) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requireAuthenticatedHousehold(ctx, args.householdId)
    return await hasAssistant(ctx)
  },
})

/**
 * The hints the account qualifies for and hasn't seen, in priority order.
 * The client adds the device-only check (iPhone) and shows at most
 * one per launch. A hint never qualifies once its feature is in use.
 */
export const eligible = query({
  args: {
    householdId: v.optional(v.id('households')),
    // The client's local date: queries must not read the clock.
    today: v.string(),
  },
  returns: v.array(hintValidator),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const today = normalizeRequiredDate(args.today, 'Today')
    const seen = new Set(
      (
        await ctx.db
          .query('seenHints')
          .withIndex('by_userId_and_hint', (q) => q.eq('userId', owner.userId))
          .take(HINTS.length)
      ).map((row) => row.hint),
    )
    const days = await loggedDaysBefore(ctx, owner.userId, today, MOST_DAYS)
    const linked = await findLinkedPerson(ctx, owner.householdId, owner.userId)

    // Checks run lazily, in priority order, and only for unseen hints.
    const qualifies: Record<Hint, () => Promise<boolean>> = {
      assistant: async () =>
        days >= DAYS_FOR.assistant &&
        Boolean(env.MCP_CONSENT_URL) &&
        // A connection, or any recorded assistant write, means it's in use.
        !(await hasAssistant(ctx)) &&
        !(await ctx.db
          .query('mcpOperations')
          .withIndex('by_ownerUserId_and_connectionId_and_key', (q) =>
            q.eq('ownerUserId', owner.userId),
          )
          .first()),
      history: async () => days >= DAYS_FOR.history,
      // Weight is private to the linked member, so these are about them.
      weighIn: async () =>
        days >= DAYS_FOR.weighIn &&
        linked !== null &&
        !(await ctx.db
          .query('weightEntries')
          .withIndex('by_householdId_and_personId_and_measuredOn', (q) =>
            q.eq('householdId', owner.householdId).eq('personId', linked._id),
          )
          .first()),
      // The estimate may come from someone else's logs, such as a member
      // who just linked to a person the household already tracks.
      maintenance: async () =>
        days >= DAYS_FOR.maintenance &&
        linked !== null &&
        buildCheckIn({
          today,
          ...(await readCheckInData(ctx, owner, linked, today)),
          profile: linked.energyProfile,
          plan: linked.goalPlan,
        }).estimate.status === 'ready',
      invite: async () => {
        if (days < DAYS_FOR.invite) return false
        const membership = await findMembership(
          ctx,
          owner.userId,
          owner.householdId,
        )
        if (membership?.role !== 'admin') return false
        const [members, people, invitation] = await Promise.all([
          ctx.db
            .query('householdMembers')
            .withIndex('by_householdId', (q) =>
              q.eq('householdId', owner.householdId),
            )
            .take(2),
          ctx.db
            .query('people')
            .withIndex('by_householdId_and_archived_and_name', (q) =>
              q.eq('householdId', owner.householdId).eq('archived', false),
            )
            .take(2),
          ctx.db
            .query('householdInvitations')
            .withIndex('by_householdId', (q) =>
              q.eq('householdId', owner.householdId),
            )
            .first(),
        ])
        // Someone else is tracked here, and nobody has been invited yet.
        return members.length === 1 && people.length === 2 && !invitation
      },
      widget: async () =>
        days >= DAYS_FOR.widget &&
        !(await ctx.db
          .query('widgetTokens')
          .withIndex('by_userId_and_householdId', (q) =>
            q.eq('userId', owner.userId).eq('householdId', owner.householdId),
          )
          .first()),
    }

    const result: Hint[] = []
    for (const hint of HINTS)
      if (!seen.has(hint) && (await qualifies[hint]())) result.push(hint)
    return result
  },
})

/** Marks a hint seen for the account; it never shows again. */
export const setSeen = mutation({
  args: {
    // Hints show inside a household, so the call authenticates like its reads.
    householdId: v.optional(v.id('households')),
    hint: hintValidator,
  },
  returns: v.null(),
  handler: async (ctx, { householdId, hint }) => {
    // Seen state belongs to the account, in every household.
    const { userId } = await requireAuthenticatedHousehold(ctx, householdId)
    const existing = await ctx.db
      .query('seenHints')
      .withIndex('by_userId_and_hint', (q) =>
        q.eq('userId', userId).eq('hint', hint),
      )
      .unique()
    if (!existing)
      await ctx.db.insert('seenHints', { userId, hint, seenAt: Date.now() })
    return null
  },
})
