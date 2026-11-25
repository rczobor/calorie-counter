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
import {
  combineMacroTotals,
  settleMacroTotals,
  type MacroTotals,
} from './lib/macros'
import { readDayNutrition } from './lib/dayNutrition'
import { DomainError } from './lib/validation'
import { hasAcceptedPrivacyNotice } from './lib/privacy'
import {
  assertOwnedOrThrow,
  ensureUserId,
  findLinkedPerson,
  findUserId,
  listMemberships,
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

const DOMAIN_MESSAGE =
  /^(At least|Too many|Meal|Person|Cook|Ingredient|Custom|Finished|Consumed|Counted|Reference|Recipe|Session|Output|Estimate|Food|Operation|Name|Date|Daily|Selected|Only |Invalid|Cannot|Linked|Existing|Expected)/

// Only domain validation messages reach the model; unexpected database failures stay private.
export async function domainResult<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ConvexError) throw error
    if (error instanceof DomainError) throw new ConvexError(error.message)
    if (
      error instanceof Error &&
      DOMAIN_MESSAGE.test(error.message) &&
      error.message.length < 300
    )
      throw new ConvexError(error.message)
    throw error
  }
}

// The message domainResult would show the model, or undefined for a failure
// that must stay private.
export function domainMessage(error: unknown): string | undefined {
  if (error instanceof ConvexError)
    return typeof error.data === 'string' ? error.data : error.message
  if (error instanceof DomainError) return error.message
  if (
    error instanceof Error &&
    DOMAIN_MESSAGE.test(error.message) &&
    error.message.length < 300
  )
    return error.message
  return undefined
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
  const userId = await findUserId(ctx, user.userId)
  const preferences = householdId ? null : await getPreferences(ctx, userId)
  try {
    return await requireHouseholdForAccount(
      ctx,
      user.userId,
      householdId ??
        preferences?.householdId ??
        (await linkedHouseholdId(ctx, userId)),
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

// With nothing requested or saved, a member tracks where they linked a person
// to themselves, not in the personal household the app created for them.
// Undefined keeps that personal household, which agents already rely on when
// the account has no link, and leaves the privacy refusal to
// requireHouseholdForAccount before any household data is read.
async function linkedHouseholdId(
  ctx: Pick<QueryCtx, 'db'>,
  userId: Id<'users'> | null,
) {
  if (!userId || !(await hasAcceptedPrivacyNotice(ctx, userId)))
    return undefined
  const memberships = await listMemberships(ctx, userId, 10)
  const linked = []
  for (const { householdId } of memberships) {
    const person = await findLinkedPerson(ctx, householdId, userId)
    if (person && !person.archived) linked.push(householdId)
  }
  if (linked.length < 2) return linked[0]
  throw new ConvexError(
    'You are linked in several households. Use list_households, ask which one the user means, then pass its householdId; no fallback was used.',
  )
}

export async function describeContext(
  ctx: MutationCtx,
  owner: AuthenticatedOwner,
): Promise<Infer<typeof loggingContext>> {
  const household = await ctx.db.get(owner.householdId)
  if (!household) throw new ConvexError('Household not found.')
  const preferences = await getPreferences(ctx, owner.userId)
  const saved =
    preferences?.householdId === owner.householdId ? preferences : null
  const savedPerson = saved && (await ctx.db.get(saved.personId))
  const savedDefault =
    savedPerson?.householdId === owner.householdId && !savedPerson.archived
      ? savedPerson
      : null
  const linkedPerson = savedDefault
    ? null
    : await findLinkedPerson(ctx, owner.householdId, owner.userId)
  const defaultPerson =
    savedDefault ?? (linkedPerson?.archived ? null : linkedPerson)
  return {
    householdId: owner.householdId,
    household: household.name,
    defaultPersonId: defaultPerson?._id,
    defaultPerson: defaultPerson?.name,
    timeZone: saved?.timeZone,
    // The saved approval policy belongs to the saved person, never a fallback.
    confirmationMode: savedDefault && saved ? saved.confirmationMode : 'always',
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
  macrosDelta?: MacroTotals,
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
    macros:
      mealCount === 0
        ? undefined
        : settleMacroTotals(combineMacroTotals(summary.macros, macrosDelta)),
    // Measured against the day's protein before the change; read the day
    // again after saving for the new figure.
    proteinPerKg: undefined,
  }
}
