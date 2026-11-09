import type { Id } from '../_generated/dataModel'
import type { QueryCtx } from '../_generated/server'

/**
 * The privacy notice everyone must have accepted, named by the date it last
 * changed. Bump it only for a change people must agree to again: every
 * account then sees the consent screen, and household data stays locked
 * (assistants included) until they accept.
 */
export const PRIVACY_NOTICE_VERSION = '2026-11-09'

export async function hasAcceptedPrivacyNotice(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
) {
  const consent = await ctx.db
    .query('privacyConsents')
    .withIndex('by_userId_and_version', (q) =>
      q.eq('userId', userId).eq('version', PRIVACY_NOTICE_VERSION),
    )
    .first()
  return consent !== null
}
