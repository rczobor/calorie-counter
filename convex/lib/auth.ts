import type { Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

export type AuthenticatedOwner = {
  householdId: Id<'households'>
  ownerTokenIdentifier: string
}

type OwnedDocument = { householdId?: Id<'households'> } | null

export function ownerFields(owner: AuthenticatedOwner) {
  return {
    householdId: owner.householdId,
    ownerTokenIdentifier: owner.ownerTokenIdentifier,
  }
}

export type WithoutOwner<TDoc> = TDoc extends { ownerTokenIdentifier: string }
  ? Omit<TDoc, 'ownerTokenIdentifier' | 'householdId'>
  : never

export function withoutOwner<
  TDoc extends { ownerTokenIdentifier: string; householdId?: Id<'households'> },
>(doc: TDoc): WithoutOwner<TDoc> {
  const publicFields: Partial<TDoc> = { ...doc }
  delete publicFields.ownerTokenIdentifier
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
  if (!isOwnedBy(doc, owner)) throw new Error(notFoundMessage)
  return doc
}

export async function requireAuthenticatedUser(
  ctx: Pick<QueryCtx | MutationCtx, 'auth'>,
) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Authentication required.')
  return { ownerTokenIdentifier: identity.tokenIdentifier }
}

export async function requireHouseholdForAccount(
  ctx: Pick<QueryCtx, 'db'>,
  tokenIdentifier: string,
  requestedHouseholdId?: Id<'households'>,
): Promise<AuthenticatedOwner> {
  const householdId =
    requestedHouseholdId ??
    (
      await ctx.db
        .query('households')
        .withIndex('by_personalOwnerTokenIdentifier', (q) =>
          q.eq('personalOwnerTokenIdentifier', tokenIdentifier),
        )
        .unique()
    )?._id
  if (!householdId) throw new Error('Select a household first.')
  const member = await ctx.db
    .query('householdMembers')
    .withIndex('by_tokenIdentifier_and_householdId', (q) =>
      q.eq('tokenIdentifier', tokenIdentifier).eq('householdId', householdId),
    )
    .unique()
  if (!member) throw new Error('Household access denied.')
  return { householdId, ownerTokenIdentifier: tokenIdentifier }
}

export async function requireAuthenticatedHousehold(
  ctx: QueryCtx | MutationCtx,
  householdId?: Id<'households'>,
) {
  const account = await requireAuthenticatedUser(ctx)
  return requireHouseholdForAccount(
    ctx,
    account.ownerTokenIdentifier,
    householdId,
  )
}
