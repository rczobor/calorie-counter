import type { Doc } from '../_generated/dataModel'
import type { AuthenticatedOwner } from './auth'
import { DomainError } from './validation'

/**
 * A person a member linked to themselves keeps their body weight to that
 * member, and only that member changes their goal; the rest of the household
 * still sees the goal. People nobody linked stay the whole household's.
 */
export function isAnotherMembers(
  person: Pick<Doc<'people'>, 'userId'>,
  owner: AuthenticatedOwner,
) {
  return person.userId !== undefined && person.userId !== owner.userId
}

export function assertCanSeeWeight(
  person: Pick<Doc<'people'>, 'userId'>,
  owner: AuthenticatedOwner,
) {
  if (isAnotherMembers(person, owner))
    throw new DomainError(
      'Only the member linked to this person can see or change their weight.',
    )
}

export function assertCanChangeGoal(
  person: Pick<Doc<'people'>, 'userId'>,
  owner: AuthenticatedOwner,
) {
  if (isAnotherMembers(person, owner))
    throw new DomainError(
      'Only the member linked to this person can change their goal.',
    )
}
