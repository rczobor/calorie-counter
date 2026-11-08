import { v } from 'convex/values'

import { mutation, query, type QueryCtx } from './_generated/server'
import {
  ensureAccount,
  findAccount,
  requireAuthenticatedUser,
  type Account,
} from './lib/auth'
import { localeValidator } from './validators'

async function getUserPreferences(ctx: Pick<QueryCtx, 'db'>, account: Account) {
  const { userId } = account
  const current = userId
    ? await ctx.db
        .query('userPreferences')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique()
    : null
  return (
    current ??
    (await ctx.db
      .query('userPreferences')
      .withIndex('by_tokenIdentifier', (q) =>
        q.eq('tokenIdentifier', account.tokenIdentifier),
      )
      .unique())
  )
}

/** The account's chosen language, or null to follow the browser. */
export const getLocale = query({
  args: {},
  returns: v.union(localeValidator, v.null()),
  handler: async (ctx) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    const account = await findAccount(ctx, tokenIdentifier)
    return (await getUserPreferences(ctx, account))?.locale ?? null
  },
})

export const setLocale = mutation({
  args: { locale: localeValidator },
  returns: v.null(),
  handler: async (ctx, { locale }) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    const account = await ensureAccount(ctx, tokenIdentifier)
    const existing = await getUserPreferences(ctx, account)
    if (existing) {
      if (existing.locale !== locale)
        await ctx.db.patch(existing._id, { locale })
    } else {
      await ctx.db.insert('userPreferences', { userId: account.userId, locale })
    }
    return null
  },
})
