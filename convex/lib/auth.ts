import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'
import { DomainError } from './validation'

// Account data is keyed by app-owned `users` rows, so a new Clerk instance or
// domain only rewrites `users.tokenIdentifier`. Rows written before
// `migrations:rekeyAccounts` still carry the raw tokenIdentifier; the lookups
// below fall back to it until that migration has run everywhere.
export type Account = {
  tokenIdentifier: string
  userId: Id<'users'> | null
}

export type AuthenticatedOwner = Account & { householdId: Id<'households'> }

type Reader = Pick<QueryCtx, 'db'>
type OwnedDocument = { householdId?: Id<'households'> } | null
type OwnerKeys = 'ownerTokenIdentifier' | 'ownerUserId' | 'householdId'

// Account attribution only; authorization uses householdId.
export function ownerFields(owner: AuthenticatedOwner) {
  return owner.userId
    ? { householdId: owner.householdId, ownerUserId: owner.userId }
    : {
        householdId: owner.householdId,
        ownerTokenIdentifier: owner.tokenIdentifier,
      }
}

export type WithoutOwner<TDoc> = TDoc extends unknown
  ? Omit<TDoc, OwnerKeys>
  : never

export function withoutOwner<TDoc extends Partial<Record<OwnerKeys, string>>>(
  doc: TDoc,
): WithoutOwner<TDoc> {
  const publicFields: Partial<TDoc> = { ...doc }
  delete publicFields.ownerTokenIdentifier
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

export async function findAccount(
  ctx: Reader,
  tokenIdentifier: string,
): Promise<Account> {
  const user = await ctx.db
    .query('users')
    .withIndex('by_tokenIdentifier', (q) =>
      q.eq('tokenIdentifier', tokenIdentifier),
    )
    .unique()
  return { tokenIdentifier, userId: user?._id ?? null }
}

export async function ensureAccount(
  ctx: MutationCtx,
  tokenIdentifier: string,
): Promise<Account & { userId: Id<'users'> }> {
  const account = await findAccount(ctx, tokenIdentifier)
  return {
    tokenIdentifier,
    userId:
      account.userId ?? (await ctx.db.insert('users', { tokenIdentifier })),
  }
}

/** The account a stored users reference points to, or null if it is gone. */
export async function accountForUser(
  ctx: Reader,
  userId: Id<'users'>,
): Promise<Account | null> {
  const user = await ctx.db.get(userId)
  return user ? { tokenIdentifier: user.tokenIdentifier, userId } : null
}

export function isAccount(
  row: { userId?: Id<'users'>; tokenIdentifier?: string },
  account: Account,
) {
  return row.userId
    ? row.userId === account.userId
    : row.tokenIdentifier === account.tokenIdentifier
}

export function isPersonalOwner(
  household: Doc<'households'> | null,
  account: Account,
) {
  if (!household) return false
  return household.personalOwnerUserId
    ? household.personalOwnerUserId === account.userId
    : household.personalOwnerTokenIdentifier === account.tokenIdentifier
}

export async function findPersonalHousehold(ctx: Reader, account: Account) {
  const { userId } = account
  const household = userId
    ? await ctx.db
        .query('households')
        .withIndex('by_personalOwnerUserId', (q) =>
          q.eq('personalOwnerUserId', userId),
        )
        .unique()
    : null
  return (
    household ??
    (await ctx.db
      .query('households')
      .withIndex('by_personalOwnerTokenIdentifier', (q) =>
        q.eq('personalOwnerTokenIdentifier', account.tokenIdentifier),
      )
      .unique())
  )
}

export async function findMembership(
  ctx: Reader,
  account: Account,
  householdId: Id<'households'>,
) {
  const { userId } = account
  const member = userId
    ? await ctx.db
        .query('householdMembers')
        .withIndex('by_userId_and_householdId', (q) =>
          q.eq('userId', userId).eq('householdId', householdId),
        )
        .unique()
    : null
  return (
    member ??
    (await ctx.db
      .query('householdMembers')
      .withIndex('by_tokenIdentifier_and_householdId', (q) =>
        q
          .eq('tokenIdentifier', account.tokenIdentifier)
          .eq('householdId', householdId),
      )
      .unique())
  )
}

export async function listMemberships(
  ctx: Reader,
  account: Account,
  limit: number,
) {
  const { userId } = account
  const current = userId
    ? await ctx.db
        .query('householdMembers')
        .withIndex('by_userId_and_householdId', (q) => q.eq('userId', userId))
        .take(limit)
    : []
  const legacy = await ctx.db
    .query('householdMembers')
    .withIndex('by_tokenIdentifier_and_householdId', (q) =>
      q.eq('tokenIdentifier', account.tokenIdentifier),
    )
    .take(limit)
  return [...current, ...legacy].slice(0, limit)
}

export async function requireHouseholdForAccount(
  ctx: Reader,
  tokenIdentifier: string,
  requestedHouseholdId?: Id<'households'>,
): Promise<AuthenticatedOwner> {
  const account = await findAccount(ctx, tokenIdentifier)
  const householdId =
    requestedHouseholdId ?? (await findPersonalHousehold(ctx, account))?._id
  if (!householdId) throw new DomainError('Select a household first.')
  if (!(await findMembership(ctx, account, householdId)))
    throw new DomainError('Household access denied.')
  return { ...account, householdId }
}

export async function requireAuthenticatedHousehold(
  ctx: QueryCtx | MutationCtx,
  householdId?: Id<'households'>,
) {
  const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
  return requireHouseholdForAccount(ctx, tokenIdentifier, householdId)
}
