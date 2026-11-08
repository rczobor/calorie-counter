import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import {
  findAccount,
  requireAuthenticatedUser,
  requireHouseholdForAccount,
} from './lib/auth'
import {
  getPreferences,
  updateLoggingPreferencesForAccount,
} from './mcpContext'
import { loggingPreferences } from './mcpValidators'

const preferencesDto = loggingPreferences.extend({
  householdName: v.union(v.string(), v.null()),
  personName: v.union(v.string(), v.null()),
  available: v.boolean(),
})

export const get = query({
  args: {},
  returns: v.union(preferencesDto, v.null()),
  handler: async (ctx) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    const preferences = await getPreferences(
      ctx,
      await findAccount(ctx, tokenIdentifier),
    )
    if (!preferences) return null
    const { householdId, personId, timeZone, confirmationMode } = preferences
    const stored = { householdId, personId, timeZone, confirmationMode }
    try {
      await requireHouseholdForAccount(ctx, tokenIdentifier, householdId)
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== 'Household access denied.'
      )
        throw error
      // Expose only the account's own saved defaults after membership removal.
      return {
        ...stored,
        householdName: null,
        personName: null,
        available: false,
      }
    }
    const [household, person] = await Promise.all([
      ctx.db.get(householdId),
      ctx.db.get(personId),
    ])
    const scopedPerson = person?.householdId === householdId ? person : null
    return {
      ...stored,
      householdName: household?.name ?? null,
      personName: scopedPerson?.name ?? null,
      available: Boolean(household && scopedPerson && !scopedPerson.archived),
    }
  },
})

export const update = mutation({
  args: { preferences: v.union(loggingPreferences, v.null()) },
  returns: v.null(),
  handler: async (ctx, { preferences }) => {
    const { tokenIdentifier } = await requireAuthenticatedUser(ctx)
    await updateLoggingPreferencesForAccount(ctx, tokenIdentifier, preferences)
    return null
  },
})
