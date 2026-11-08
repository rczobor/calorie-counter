import { vMcpUser, type McpUser } from '@convex-dev/mcp'
import { ConvexError, v, type Infer } from 'convex/values'
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server'
import type { Id } from './_generated/dataModel'
import { ensurePersonalHousehold } from './households'
import { calculateDailySummaryChange } from './nutrition'
import { readDayNutrition } from './lib/dayNutrition'
import { DomainError } from './lib/validation'
import {
  assertOwnedOrThrow,
  ensureUserId,
  findUserId,
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

// Only domain validation messages reach the model; unexpected database failures stay private.
export async function domainResult<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ConvexError) throw error
    if (error instanceof DomainError) throw new ConvexError(error.message)
    if (
      error instanceof Error &&
      /^(At least|Too many|Meal|Person|Cook|Ingredient|Custom|Finished|Consumed|Counted|Reference|Recipe|Session|Output|Estimate|Food|Operation|Name|Date|Daily|Selected|Only |Invalid|Cannot|Linked|Existing|Expected)/.test(
        error.message,
      ) &&
      error.message.length < 300
    )
      throw new ConvexError(error.message)
    throw error
  }
}

export async function getPreferences(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'> | null,
) {
  return userId
    ? await ctx.db
        .query('mcpPreferences')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique()
    : null
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
    : await getPreferences(ctx, await findUserId(ctx, user.userId))
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
  const preferences = await getPreferences(ctx, owner.userId)
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
  handler: (ctx, { user, preferences }) =>
    domainResult(async () => {
      requireAccount(user, 'meals:write')
      await ensurePersonalHousehold(ctx, user.userId)
      // Relaxing approval must be a human choice in the app, never an agent's.
      if (
        preferences?.confirmationMode === 'explicitOnly' &&
        (await getPreferences(ctx, await findUserId(ctx, user.userId)))
          ?.confirmationMode !== 'explicitOnly'
      )
        throw new ConvexError(
          'Only the user can turn on explicitOnly, in Calorie Counter under Settings, AI assistants. Use confirmationMode always.',
        )
      const owner = await updateLoggingPreferencesForAccount(
        ctx,
        user.userId,
        preferences,
      )
      return { context: owner ? await describeContext(ctx, owner) : null }
    }),
})

export async function updateLoggingPreferencesForAccount(
  ctx: MutationCtx,
  tokenIdentifier: string,
  preferences: Infer<typeof loggingPreferences> | null,
) {
  const userId = await ensureUserId(ctx, tokenIdentifier)
  const previous = await getPreferences(ctx, userId)
  if (!preferences) {
    if (previous) await ctx.db.delete(previous._id)
    return null
  }
  const owner = await requireHouseholdForAccount(
    ctx,
    tokenIdentifier,
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
  const document = { userId, ...preferences }
  if (previous) await ctx.db.replace(previous._id, document)
  else await ctx.db.insert('mcpPreferences', document)
  return owner
}

export async function readDailySummary(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
  personId: Id<'people'>,
  eatenOn: string,
): Promise<Infer<typeof dailySummary>> {
  return {
    ...(await readDayNutrition(ctx, owner, personId, eatenOn)),
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
