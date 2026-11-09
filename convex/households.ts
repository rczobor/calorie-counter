import { v } from 'convex/values'
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import type { Id } from './_generated/dataModel'
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import {
  ensureUserId,
  findLinkedPerson,
  findMembership,
  findPersonalHousehold,
  findUserId,
  listMemberships,
  requireAuthenticatedHousehold,
  requireAuthenticatedUser,
} from './lib/auth'
import { assertPageSize, normalizeRequiredText } from './lib/validation'

const MAX_MEMBERS = 20
const MAX_HOUSEHOLDS = 10

export async function ensurePersonalHousehold(
  ctx: MutationCtx,
  tokenIdentifier: string,
  name = 'My household',
) {
  const userId = await ensureUserId(ctx, tokenIdentifier)
  let household = await findPersonalHousehold(ctx, userId)
  if (!household) {
    const householdId = await ctx.db.insert('households', {
      name,
      personalOwnerUserId: userId,
      createdAt: Date.now(),
    })
    await ctx.db.insert('householdMembers', {
      householdId,
      userId,
      name: 'Household creator',
      role: 'admin',
      joinedAt: Date.now(),
    })
    household = await ctx.db.get(householdId)
  }
  if (!household) throw new Error('Household could not be created.')
  return household._id
}

export const ensurePersonal = mutation({
  args: {},
  returns: v.id('households'),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Authentication required.')
    const householdId = await ensurePersonalHousehold(
      ctx,
      identity.tokenIdentifier,
    )
    const member = await findMembership(
      ctx,
      await ensureUserId(ctx, identity.tokenIdentifier),
      householdId,
    )
    if (member)
      await ctx.db.patch(member._id, {
        name:
          identity.name?.trim() ||
          identity.nickname?.trim() ||
          identity.email ||
          'Household creator',
      })
    return householdId
  },
})

const householdDto = v.object({
  _id: v.id('households'),
  name: v.string(),
  role: v.union(v.literal('admin'), v.literal('member')),
})
export const list = query({
  args: {},
  returns: v.array(householdDto),
  handler: async (ctx) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    const userId = await findUserId(ctx, tokenIdentifier)
    const memberships = userId
      ? await listMemberships(ctx, userId, MAX_HOUSEHOLDS)
      : []
    const households = []
    for (const membership of memberships) {
      const household = await ctx.db.get(membership.householdId)
      if (household)
        households.push({
          _id: household._id,
          name: household.name,
          role: membership.role,
        })
    }
    return households
  },
})

async function requireAdmin(ctx: MutationCtx, householdId: Id<'households'>) {
  const account = await requireAuthenticatedHousehold(ctx, householdId)
  const member = await findMembership(ctx, account.userId, householdId)
  if (member?.role !== 'admin')
    throw new Error('Only household admins can do this.')
  return account
}

export const rename = mutation({
  args: { householdId: v.id('households'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.householdId)
    await ctx.db.patch(args.householdId, {
      name: normalizeRequiredText(args.name, 'Household name'),
    })
    return null
  },
})

export const members = query({
  args: { householdId: v.id('households') },
  returns: v.array(
    v.object({
      _id: v.id('householdMembers'),
      name: v.string(),
      role: v.union(v.literal('admin'), v.literal('member')),
      isYou: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const account = await requireAuthenticatedHousehold(ctx, args.householdId)
    const rows = await ctx.db
      .query('householdMembers')
      .withIndex('by_householdId', (q) => q.eq('householdId', args.householdId))
      .take(MAX_MEMBERS)
    return rows.map((row) => ({
      _id: row._id,
      name: row.name,
      role: row.role,
      isYou: row.userId === account.userId,
    }))
  },
})

export const updateMember = mutation({
  args: {
    householdId: v.id('households'),
    memberId: v.id('householdMembers'),
    role: v.union(v.literal('admin'), v.literal('member'), v.literal('remove')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const account = await requireAuthenticatedHousehold(ctx, args.householdId)
    const member = await ctx.db.get(args.memberId)
    if (!member || member.householdId !== args.householdId)
      throw new Error('Household member not found.')
    const leaving = args.role === 'remove' && member.userId === account.userId
    if (!leaving) await requireAdmin(ctx, args.householdId)
    if (member.role === 'admin' && args.role !== 'admin') {
      const admins = await ctx.db
        .query('householdMembers')
        .withIndex('by_householdId', (q) =>
          q.eq('householdId', args.householdId),
        )
        .take(MAX_MEMBERS)
      if (!admins.some((row) => row._id !== member._id && row.role === 'admin'))
        throw new Error(
          'Promote another admin before leaving or changing the last admin.',
        )
    }
    if (args.role === 'remove') {
      await ctx.db.delete(member._id)
      // The person stays with the household; only the account link goes.
      const linked = await findLinkedPerson(
        ctx,
        args.householdId,
        member.userId,
      )
      if (linked) await ctx.db.patch(linked._id, { userId: undefined })
    } else await ctx.db.patch(member._id, { role: args.role })
    return null
  },
})

async function hashToken(token: string) {
  if (!token || token.length > 100) throw new Error('Invalid invitation.')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export const invite = mutation({
  args: { householdId: v.id('households') },
  returns: v.string(),
  handler: async (ctx, args) => {
    const account = await requireAdmin(ctx, args.householdId)
    // Only the hash is stored. The link is a single-use, seven-day bearer invitation.
    const token = crypto.randomUUID() + crypto.randomUUID()
    await ctx.db.insert('householdInvitations', {
      householdId: args.householdId,
      tokenHash: await hashToken(token),
      createdByUserId: account.userId,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
    return token
  },
})

export const invitations = query({
  args: {
    householdId: v.id('households'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.id('householdInvitations'),
      expiresAt: v.number(),
      acceptedAt: v.optional(v.number()),
      revokedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuthenticatedHousehold(ctx, args.householdId)
    assertPageSize(args.paginationOpts.numItems)
    const result = await ctx.db
      .query('householdInvitations')
      .withIndex('by_householdId', (q) => q.eq('householdId', args.householdId))
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...result,
      page: result.page.map(({ _id, expiresAt, acceptedAt, revokedAt }) => ({
        _id,
        expiresAt,
        acceptedAt,
        revokedAt,
      })),
    }
  },
})

export const revokeInvitation = mutation({
  args: {
    householdId: v.id('households'),
    invitationId: v.id('householdInvitations'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx, args.householdId)
    const invitation = await ctx.db.get(args.invitationId)
    if (!invitation || invitation.householdId !== args.householdId)
      throw new Error('Invitation not found.')
    await ctx.db.patch(invitation._id, { revokedAt: Date.now() })
    return null
  },
})

async function findInvitation(ctx: Pick<QueryCtx, 'db'>, token: string) {
  if (token.length > 100) throw new Error('Invalid invitation.')
  const invitation = await ctx.db
    .query('householdInvitations')
    .withIndex('by_tokenHash', (q) => q.eq('tokenHash', token))
    .unique()
  return invitation
}

export const inspectInvitation = query({
  args: { token: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({ householdId: v.id('households'), name: v.string() }),
  ),
  handler: async (ctx, args) => {
    await requireAuthenticatedUser(ctx)
    const invitation = await findInvitation(ctx, await hashToken(args.token))
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.acceptedAt ||
      invitation.expiresAt <= args.now
    )
      return null
    const household = await ctx.db.get(invitation.householdId)
    return household
      ? { householdId: household._id, name: household.name }
      : null
  },
})

export const acceptInvitation = mutation({
  args: { token: v.string() },
  returns: v.id('households'),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Authentication required.')
    const invitation = await findInvitation(ctx, await hashToken(args.token))
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.acceptedAt ||
      invitation.expiresAt <= Date.now()
    )
      throw new Error('This invitation has expired or was already used.')
    const inviter = await findMembership(
      ctx,
      invitation.createdByUserId,
      invitation.householdId,
    )
    if (inviter?.role !== 'admin')
      throw new Error('This invitation is no longer valid.')
    await ensurePersonalHousehold(ctx, identity.tokenIdentifier)
    const userId = await ensureUserId(ctx, identity.tokenIdentifier)
    const existing = await findMembership(ctx, userId, invitation.householdId)
    if (existing) return invitation.householdId
    const memberships = await listMemberships(ctx, userId, MAX_HOUSEHOLDS)
    if (memberships.length >= MAX_HOUSEHOLDS)
      throw new Error('You can belong to at most 10 households.')
    const members = await ctx.db
      .query('householdMembers')
      .withIndex('by_householdId', (q) =>
        q.eq('householdId', invitation.householdId),
      )
      .take(MAX_MEMBERS)
    if (members.length >= MAX_MEMBERS)
      throw new Error('This household has reached its member limit.')
    await ctx.db.insert('householdMembers', {
      householdId: invitation.householdId,
      userId,
      name:
        identity.name?.trim() ||
        identity.nickname?.trim() ||
        identity.email ||
        'Household member',
      role: 'member',
      joinedAt: Date.now(),
    })
    await ctx.db.patch(invitation._id, { acceptedAt: Date.now() })
    return invitation.householdId
  },
})
