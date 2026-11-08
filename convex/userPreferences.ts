import { v } from 'convex/values'

import { mutation, query, type QueryCtx } from './_generated/server'
import { requireAuthenticatedUser } from './lib/auth'
import { localeValidator } from './validators'

function getUserPreferences(
  ctx: Pick<QueryCtx, 'db'>,
  tokenIdentifier: string,
) {
  return ctx.db
    .query('userPreferences')
    .withIndex('by_tokenIdentifier', (q) =>
      q.eq('tokenIdentifier', tokenIdentifier),
    )
    .unique()
}

/** The account's chosen language, or null to follow the browser. */
export const getLocale = query({
  args: {},
  returns: v.union(localeValidator, v.null()),
  handler: async (ctx) => {
    const { ownerTokenIdentifier } = await requireAuthenticatedUser(ctx)
    return (await getUserPreferences(ctx, ownerTokenIdentifier))?.locale ?? null
  },
})

export const setLocale = mutation({
  args: { locale: localeValidator },
  returns: v.null(),
  handler: async (ctx, { locale }) => {
    const { ownerTokenIdentifier } = await requireAuthenticatedUser(ctx)
    const existing = await getUserPreferences(ctx, ownerTokenIdentifier)
    if (existing) {
      if (existing.locale !== locale)
        await ctx.db.patch(existing._id, { locale })
    } else {
      await ctx.db.insert('userPreferences', {
        tokenIdentifier: ownerTokenIdentifier,
        locale,
      })
    }
    return null
  },
})
