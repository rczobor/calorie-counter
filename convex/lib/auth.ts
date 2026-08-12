import type { MutationCtx, QueryCtx } from '../_generated/server'

export type AuthenticatedOwner = {
  ownerTokenIdentifier: string
}

export type OwnedDocument = {
  ownerTokenIdentifier: string
} | null

export function ownerFields(owner: AuthenticatedOwner) {
  return {
    ownerTokenIdentifier: owner.ownerTokenIdentifier,
  }
}

export type WithoutOwner<TDoc> = TDoc extends {
  ownerTokenIdentifier: string
}
  ? Omit<TDoc, 'ownerTokenIdentifier'>
  : never

export function withoutOwner<TDoc extends { ownerTokenIdentifier: string }>(
  doc: TDoc,
): WithoutOwner<TDoc> {
  const publicFields: Partial<TDoc> = { ...doc }
  delete publicFields.ownerTokenIdentifier
  return publicFields as WithoutOwner<TDoc>
}

export function isOwnedBy<TDoc extends OwnedDocument>(
  doc: TDoc,
  owner: AuthenticatedOwner,
): doc is NonNullable<TDoc> {
  return doc?.ownerTokenIdentifier === owner.ownerTokenIdentifier
}

export function assertOwnedOrThrow<TDoc extends OwnedDocument>(
  doc: TDoc,
  owner: AuthenticatedOwner,
  notFoundMessage: string,
): NonNullable<TDoc> {
  if (!isOwnedBy(doc, owner)) {
    throw new Error(notFoundMessage)
  }
  return doc
}

export async function requireAuthenticatedUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Authentication required.')
  }
  return {
    ownerTokenIdentifier: identity.tokenIdentifier,
  }
}
