import { v } from 'convex/values'
import { env, internalQuery, mutation, query } from './_generated/server'
import {
  assertOwnedOrThrow,
  findMembership,
  findUserId,
  requireAuthenticatedHousehold,
  requireAuthenticatedUser,
} from './lib/auth'
import { dayNutrition, readDayNutrition } from './lib/dayNutrition'
import { hasAcceptedPrivacyNotice } from './lib/privacy'
import { DomainError } from './lib/validation'

// A widget token reads one person's daily totals and nothing else. It is a
// bearer secret pasted into a widget script, so it is shown once and stored
// only as a hash; every read re-checks the account's membership and consent.

export const MAX_WIDGETS = 10
const TOKEN_PREFIX = 'ccw_'

export async function hashWidgetToken(token: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const base64 = btoa(String.fromCharCode(...bytes))
  return `${TOKEN_PREFIX}${base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

// Account-wide, like `count` and the cap: a widget left in a household the
// account has since left must still be listable, so it can be removed.
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('widgetTokens'),
      person: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    const userId = await findUserId(ctx, tokenIdentifier)
    if (!userId) return []
    const rows = await ctx.db
      .query('widgetTokens')
      .withIndex('by_userId_and_householdId', (q) => q.eq('userId', userId))
      .take(MAX_WIDGETS)
    return await Promise.all(
      rows.map(async (row) => ({
        id: row._id,
        person: (await ctx.db.get(row.personId))?.name ?? '',
        createdAt: row.createdAt,
      })),
    )
  },
})

/** How many widgets the account has, in every household, for Settings. */
export const count = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    const userId = await findUserId(ctx, tokenIdentifier)
    if (!userId) return 0
    const rows = await ctx.db
      .query('widgetTokens')
      .withIndex('by_userId_and_householdId', (q) => q.eq('userId', userId))
      .take(MAX_WIDGETS)
    return rows.length
  },
})

export const create = mutation({
  args: {
    householdId: v.optional(v.id('households')),
    personId: v.id('people'),
  },
  returns: v.object({
    id: v.id('widgetTokens'),
    token: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    const owner = await requireAuthenticatedHousehold(ctx, args.householdId)
    const person = assertOwnedOrThrow(
      await ctx.db.get(args.personId),
      owner,
      'Person not found.',
    )
    if (person.archived) throw new DomainError('Person is archived.')
    const existing = await ctx.db
      .query('widgetTokens')
      .withIndex('by_userId_and_householdId', (q) =>
        q.eq('userId', owner.userId),
      )
      .take(MAX_WIDGETS)
    if (existing.length >= MAX_WIDGETS)
      throw new DomainError(
        `You can have up to ${MAX_WIDGETS} widgets. Remove one first.`,
      )
    const token = randomToken()
    const id = await ctx.db.insert('widgetTokens', {
      userId: owner.userId,
      householdId: owner.householdId,
      personId: person._id,
      tokenHash: await hashWidgetToken(token),
      createdAt: Date.now(),
    })
    return { id, token, url: `${env.CONVEX_SITE_URL}/widget/today` }
  },
})

export const remove = mutation({
  args: { id: v.id('widgetTokens') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    const userId = await findUserId(ctx, tokenIdentifier)
    const row = await ctx.db.get(args.id)
    if (!row || row.userId !== userId)
      throw new DomainError('Widget not found.')
    await ctx.db.delete(row._id)
    return null
  },
})

/**
 * The widget's day. `removed` means the token is gone for good; `paused` means
 * the account must act in the app first (a new privacy notice, or it left the
 * household), after which the same widget works again.
 */
export const readDay = internalQuery({
  args: { tokenHash: v.string(), eatenOn: v.string() },
  returns: v.union(
    v.object({ status: v.literal('ok'), day: dayNutrition }),
    v.object({ status: v.literal('removed') }),
    v.object({ status: v.literal('paused') }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('widgetTokens')
      .withIndex('by_tokenHash', (q) => q.eq('tokenHash', args.tokenHash))
      .unique()
    if (!row) return { status: 'removed' as const }
    if (
      !(await hasAcceptedPrivacyNotice(ctx, row.userId)) ||
      !(await findMembership(ctx, row.userId, row.householdId))
    )
      return { status: 'paused' as const }
    const person = await ctx.db.get(row.personId)
    if (!person || person.householdId !== row.householdId)
      return { status: 'removed' as const }
    return {
      status: 'ok' as const,
      // Daily totals only: protein targets and per-kg figures give the
      // weight away to whoever holds the token.
      day: {
        ...(await readDayNutrition(
          ctx,
          { userId: row.userId, householdId: row.householdId },
          row.personId,
          args.eatenOn,
        )),
        macroTargets: undefined,
        proteinPerKg: undefined,
      },
    }
  },
})
