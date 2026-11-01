import { vMcpUser, type McpUser } from '@convex-dev/mcp'
import { ConvexError, v, type Infer } from 'convex/values'
import { internalMutation, type MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { ensurePersonalHousehold } from './households'
import { calculateDailySummaryChange } from './nutrition'
import {
  assertOwnedOrThrow,
  requireHouseholdForAccount,
  type AuthenticatedOwner,
} from './lib/auth'
import {
  dailySummary,
  loggingContext,
  loggingPreferences,
} from './mcpValidators'

function requireAccount(user: McpUser, scope = 'nutrition:read') {
  if (
    !user.userId ||
    !user.connectionId ||
    !user.scopes.includes('nutrition:read') ||
    !user.scopes.includes(scope)
  )
    throw new ConvexError(
      'This connection does not have permission for this operation. Reconnect with the required permissions.',
    )
}

export function getPreferences(ctx: MutationCtx, userId: string) {
  return ctx.db
    .query('mcpPreferences')
    .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', userId))
    .unique()
}

export async function requireMcpOwner(
  ctx: MutationCtx,
  user: McpUser,
  scope: string,
  householdId?: Id<'households'>,
): Promise<AuthenticatedOwner> {
  requireAccount(user, scope)
  await ensurePersonalHousehold(ctx, user.userId)
  const preferences = householdId
    ? null
    : await getPreferences(ctx, user.userId)
  try {
    return await requireHouseholdForAccount(
      ctx,
      user.userId,
      householdId ?? preferences?.householdId,
    )
  } catch (error) {
    if (
      preferences &&
      error instanceof Error &&
      ['Household access denied.', 'Select a household first.'].includes(
        error.message,
      )
    )
      throw new ConvexError(
        'Saved household is unavailable. Use list_households and set_logging_preferences to select an accessible household; no fallback was used.',
      )
    throw error
  }
}

export async function describeContext(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
): Promise<Infer<typeof loggingContext>> {
  const household = await ctx.db.get(owner.householdId)
  if (!household) throw new ConvexError('Household not found.')
  const preferences = await getPreferences(ctx, owner.ownerTokenIdentifier)
  const person =
    preferences?.householdId === owner.householdId
      ? await ctx.db.get(preferences.personId)
      : null
  const defaultPerson =
    person && person.householdId === owner.householdId && !person.archived
      ? person
      : null
  return {
    householdId: owner.householdId,
    household: household.name,
    defaultPersonId: defaultPerson?._id,
    defaultPerson: defaultPerson?.name,
    timeZone:
      preferences?.householdId === owner.householdId
        ? preferences.timeZone
        : undefined,
    confirmationMode: defaultPerson
      ? (preferences?.confirmationMode ?? 'always')
      : 'always',
    requiresPersonSelection: !defaultPerson,
  }
}

export function localCalendarDate(timeZone: string, now: number) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    throw new ConvexError(
      'Supply a valid IANA timezone, such as Europe/Budapest.',
    )
  }
}

export const setLoggingPreferences = internalMutation({
  args: {
    user: vMcpUser(),
    preferences: v.union(loggingPreferences, v.null()),
  },
  returns: v.object({ context: v.union(loggingContext, v.null()) }),
  handler: async (ctx, { user, preferences }) => {
    requireAccount(user, 'meals:write')
    await ensurePersonalHousehold(ctx, user.userId)
    const previous = await getPreferences(ctx, user.userId)
    if (!preferences) {
      if (previous) await ctx.db.delete(previous._id)
      return { context: null }
    }
    const owner = await requireHouseholdForAccount(
      ctx,
      user.userId,
      preferences.householdId,
    )
    const person = assertOwnedOrThrow(
      await ctx.db.get(preferences.personId),
      owner,
      'Person not found.',
    )
    if (person.archived)
      throw new ConvexError('Person is archived. Choose an active person.')
    localCalendarDate(preferences.timeZone, Date.now())
    if (previous)
      await ctx.db.replace(previous._id, {
        tokenIdentifier: user.userId,
        ...preferences,
      })
    else
      await ctx.db.insert('mcpPreferences', {
        tokenIdentifier: user.userId,
        ...preferences,
      })
    return { context: await describeContext(ctx, owner) }
  },
})

export async function readDailySummary(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  personId: Id<'people'>,
  eatenOn: string,
): Promise<Infer<typeof dailySummary>> {
  const person = assertOwnedOrThrow(
    await ctx.db.get(personId),
    owner,
    'Person not found.',
  )
  const summary = await ctx.db
    .query('dailySummaries')
    .withIndex('by_householdId_and_personId_and_eatenOn', (q) =>
      q
        .eq('householdId', owner.householdId)
        .eq('personId', personId)
        .eq('eatenOn', eatenOn),
    )
    .unique()
  const goal = await ctx.db
    .query('personGoalHistory')
    .withIndex('by_householdId_and_personId_and_effectiveDate', (q) =>
      q
        .eq('householdId', owner.householdId)
        .eq('personId', personId)
        .lte('effectiveDate', eatenOn),
    )
    .order('desc')
    .first()
  const consumedCalories = summary?.consumedCalories ?? 0
  const goalKcal = goal?.goalKcal ?? person.currentDailyGoalKcal
  return {
    personId,
    person: person.name,
    eatenOn,
    consumedCalories,
    goalKcal,
    mealCount: summary?.mealCount ?? 0,
    remainingCalories: goalKcal - consumedCalories,
    capturedAt: Date.now(),
  }
}

export function projectDailySummary(
  summary: Infer<typeof dailySummary>,
  calorieDelta: number,
  mealCountDelta = 0,
): Infer<typeof dailySummary> {
  const { consumedCalories, mealCount } = calculateDailySummaryChange(summary, {
    consumedCalories: calorieDelta,
    mealCount: mealCountDelta,
  })
  return {
    ...summary,
    consumedCalories,
    mealCount,
    remainingCalories: summary.goalKcal - consumedCalories,
  }
}
