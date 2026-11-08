import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { DomainError } from './validation'

// Account data is keyed by app-owned `users` rows. Only
// `users.tokenIdentifier` names the Clerk identity, so moving Clerk instances
// or domains rewrites that row and nothing else.
export type AuthenticatedOwner = {
  householdId: Id<'households'>
  userId: Id<'users'>
}

type Reader = Pick<QueryCtx, 'db'>
type OwnedDocument = { householdId?: Id<'households'> } | null
type OwnerKeys = 'ownerUserId' | 'householdId'

// Account attribution only; authorization uses householdId.
export function ownerFields(owner: AuthenticatedOwner) {
  return { householdId: owner.householdId, ownerUserId: owner.userId }
}

export type WithoutOwner<TDoc> = TDoc extends unknown
  ? Omit<TDoc, OwnerKeys>
  : never

export function withoutOwner<TDoc extends Partial<Record<OwnerKeys, string>>>(
  doc: TDoc,
): WithoutOwner<TDoc> {
  const publicFields: Partial<TDoc> = { ...doc }
  delete publicFields.ownerUserId
  delete publicFields.householdId
  return publicFields as WithoutOwner<TDoc>
}

export function isOwnedBy<TDoc extends OwnedDocument>(
  doc: TDoc,
  owner: AuthenticatedOwner,
): doc is NonNullable<TDoc> {
  return doc !== null && doc.householdId === owner.householdId
}

export function assertOwnedOrThrow<TDoc extends OwnedDocument>(
  doc: TDoc,
  owner: AuthenticatedOwner,
  notFoundMessage: string,
): NonNullable<TDoc> {
  if (!isOwnedBy(doc, owner)) throw new DomainError(notFoundMessage)
  return doc
}

export async function requireAuthenticatedUser(
  ctx: Pick<QueryCtx | MutationCtx, 'auth'>,
) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new DomainError('Authentication required.')
  return { tokenIdentifier: identity.tokenIdentifier }
}

/** The account's users row, or null before its first bootstrap mutation. */
export async function findUserId(ctx: Reader, tokenIdentifier: string) {
  const user = await ctx.db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) =>
      q.eq('tokenIdentifier', tokenIdentifier),
    )
    .unique()
  return user?._id ?? null
}

export async function ensureUserId(ctx: MutationCtx, tokenIdentifier: string) {
  return (
    (await findUserId(ctx, tokenIdentifier)) ??
    (await ctx.db.insert('users', { tokenIdentifier }))
  )
}

export function findPersonalHousehold(ctx: Reader, userId: Id<'users'>) {
  return ctx.db
    .query('households')
    .withIndex('by_personalOwnerUserId', (q) =>
      q.eq('personalOwnerUserId', userId),
    )
    .unique()
}

export function findMembership(
  ctx: Reader,
  userId: Id<'users'>,
  householdId: Id<'households'>,
) {
  return ctx.db
    .query('householdMembers')
    .withIndex('by_userId_and_householdId', (q) =>
      q.eq('userId', userId).eq('householdId', householdId),
    )
    .unique()
}

export function listMemberships(
  ctx: Reader,
  userId: Id<'users'>,
  limit: number,
) {
  return ctx.db
    .query('householdMembers')
    .withIndex('by_userId_and_householdId', (q) => q.eq('userId', userId))
    .take(limit)
}

export async function requireHouseholdForAccount(
  ctx: Reader,
  tokenIdentifier: string,
  requestedHouseholdId?: Id<'households'>,
): Promise<AuthenticatedOwner> {
  const userId = await findUserId(ctx, tokenIdentifier)
  const householdId =
    requestedHouseholdId ??
    (userId ? (await findPersonalHousehold(ctx, userId))?._id : undefined)
  if (!householdId) throw new DomainError('Select a household first.')
  if (!userId || !(await findMembership(ctx, userId, householdId)))
    throw new DomainError('Household access denied.')
  return { householdId, userId }
}

export async function requireAuthenticatedHousehold(
  ctx: QueryCtx | MutationCtx,
  householdId?: Id<'households'>,
) {
  const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
  return requireHouseholdForAccount(ctx, tokenIdentifier, householdId)
}
