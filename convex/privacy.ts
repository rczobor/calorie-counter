import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { ensureUserId, findUserId, requireAuthenticatedUser } from './lib/auth'
import { hasAcceptedPrivacyNotice, PRIVACY_NOTICE_VERSION } from './lib/privacy'
import { DomainError } from './lib/validation'

/** Whether the account has accepted the current privacy notice. */
export const consent = query({
  args: {},
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    const userId = await findUserId(ctx, tokenIdentifier)
    return {
      accepted:
        userId !== null && (await hasAcceptedPrivacyNotice(ctx, userId)),
    }
  },
})

/**
 * Records explicit consent to the notice version the person read. An older
 * cached app sends an older version, which must not count as consent to text
 * it never showed.
 */
export const accept = mutation({
  args: { version: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    if (args.version !== PRIVACY_NOTICE_VERSION)
      throw new DomainError(
        'The privacy notice has changed. Reload the app to read it.',
      )
    const userId = await ensureUserId(ctx, tokenIdentifier)
    if (await hasAcceptedPrivacyNotice(ctx, userId)) return null
    await ctx.db.insert('privacyConsents', {
      userId,
      version: PRIVACY_NOTICE_VERSION,
      acceptedAt: Date.now(),
    })
    return null
  },
})
