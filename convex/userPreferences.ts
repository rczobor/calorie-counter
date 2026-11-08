import { v } from 'convex/values'

import { mutation, query, type QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { ensureUserId, findUserId, requireAuthenticatedUser } from './lib/auth'
import { localeValidator } from './validators'

function getUserPreferences(ctx: Pick<QueryCtx, 'db'>, userId: Id<'users'>) {
  return ctx.db
    .query('userPreferences')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique()
}

/** The account's chosen language, or null to follow the browser. */
export const getLocale = query({
  args: {},
  returns: v.union(localeValidator, v.null()),
  handler: async (ctx) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    const userId = await findUserId(ctx, tokenIdentifier)
    return userId
      ? ((await getUserPreferences(ctx, userId))?.locale ?? null)
      : null
  },
})

export const setLocale = mutation({
  args: { locale: localeValidator },
  returns: v.null(),
  handler: async (ctx, { locale }) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    const userId = await ensureUserId(ctx, tokenIdentifier)
    const existing = await getUserPreferences(ctx, userId)
    if (existing) {
      if (existing.locale !== locale)
        await ctx.db.patch(existing._id, { locale })
    } else {
      await ctx.db.insert('userPreferences', { userId, locale })
    }
    return null
  },
})
