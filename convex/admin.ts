import { v, type Infer } from 'convex/values'

import { env, query, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { findUserId, listMemberships } from './lib/auth'
import { localCalendarDate } from './mcpContext'
import { shiftDay } from './lib/energy'
import { hasAcceptedPrivacyNotice } from './lib/privacy'
import { DomainError, normalizeRequiredDate } from './lib/validation'

// The usage dashboard reads every account, so only the accounts listed in
// SUPER_ADMIN_USER_IDS (comma-separated `users` ids) may open it. It reports
// whether people log, never what they eat: no food names, calories or weights
// leave this module per account. Like every other read of household data, it
// skips accounts that have not accepted the current privacy notice, and their
// households unless a consenting member shares them.

const WINDOW_DAYS = 28
const NEW_ACCOUNT_DAYS = 14
/** An active account that has logged nothing for this long is slipping. */
const SLIPPING_AFTER_DAYS = 7
/** Below this, halving the days logged is noise rather than a trend. */
const MIN_PREVIOUS_DAYS_FOR_DROP = 8
/** A day within this share of the goal counts as near it. */
const NEAR_GOAL_SHARE = 0.1

// One query reads everything, so the caps add up to a budget well inside a
// Convex transaction (32,000 documents, 4,096 index reads, 16 MiB):
//   200 accounts × (consent + 10 memberships + 1 meal)  2,400 docs
//   meals shared by every account                      8,000
//   foods 2,000 + batches 500 + day summaries 2,000    4,500
//   200 people × (1 person + 10 goals)                 2,200
//   200 logging preferences + 1,000 agent receipts      1,200
//   5 features × 500 rows                              2,500
// About 21,200 documents and 1,400 index reads at most. Receipts hold their
// input and result as JSON, a few KB each, so they get the smallest cap that
// still covers a busy month. Reads take the newest rows first; past a cap the
// page says its figures are partial.
const MAX_ACCOUNTS = 200
const MAX_MEMBERSHIPS = 10
const MEAL_BUDGET = 8_000
const MAX_MEALS_PER_ACCOUNT = 500
const MAX_ITEMS = 2_000
const MAX_COOK_SESSIONS = 500
const MAX_DAY_SUMMARIES = 2_000
const MAX_GOAL_PEOPLE = 200
const MAX_GOAL_ROWS = 10
const MAX_RECEIPTS = 1_000
const MAX_FEATURE_ROWS = 500

/** Agent meal items that reuse a recorded food rather than typing one in. */
const REUSED_SOURCES = new Set([
  'historical',
  'savedFood',
  'ingredient',
  'cookedFood',
])

const statusValidator = v.union(
  v.literal('active'),
  v.literal('slipping'),
  v.literal('lapsed'),
  v.literal('new'),
  v.literal('neverStarted'),
)
export type EngagementStatus = Infer<typeof statusValidator>

const STATUS_ORDER: Record<EngagementStatus, number> = {
  slipping: 0,
  active: 1,
  new: 2,
  lapsed: 3,
  neverStarted: 4,
}

const sourceCounts = {
  meals: v.number(),
  webMeals: v.number(),
  agentMeals: v.number(),
  /** Logged before meals recorded where they came from. */
  untaggedMeals: v.number(),
}

const accountValidator = v.object({
  userId: v.id('users'),
  name: v.union(v.string(), v.null()),
  joinedAt: v.number(),
  households: v.number(),
  lastLoggedOn: v.union(v.string(), v.null()),
  /** Days with a meal this account logged, in the last 28 days. */
  daysLogged: v.number(),
  /** The same count for the 28 days before that. */
  previousDaysLogged: v.number(),
  ...sourceCounts,
  status: statusValidator,
  /** The meal budget cut this account's reads short, so its counts are low. */
  partial: v.boolean(),
})

const engagementValidator = v.object({
  accounts: v.array(accountValidator),
  /** Accounts left out until they accept the current privacy notice. */
  awaitingConsent: v.number(),
  /** Some reads hit their cap, so some figures cover only part of the data. */
  partial: v.boolean(),
  totals: v.object({
    ...sourceCounts,
    editedMeals: v.number(),
    archivedMeals: v.number(),
    /** Entered on a later day than they were eaten, in the account's time zone. */
    lateMeals: v.number(),
    /** Calories of meals still kept, and how many of them have no macros. */
    calories: v.object({ total: v.number(), withoutMacros: v.number() }),
    /** Foods the AI assistant logged: repeated from records, or typed in. */
    agentItems: v.object({ reused: v.number(), typed: v.number() }),
    /** Accounts that used each feature in the window. */
    features: v.object({
      weighIns: v.number(),
      goals: v.number(),
      savedFoods: v.number(),
      templates: v.number(),
      cooking: v.number(),
      recipes: v.number(),
    }),
    items: v.object({
      ingredient: v.number(),
      cookedFood: v.number(),
      customByWeight: v.number(),
      fixedCalories: v.number(),
    }),
    cookSessions: v.number(),
    /** Finished person-days by how they ended against the goal. */
    goalDays: v.object({
      under: v.number(),
      near: v.number(),
      over: v.number(),
    }),
  }),
})

// Ids of `users` rows: an admin who deletes their account and signs up again
// gets a new id, which must be added here again.
function superAdminIds() {
  return new Set(
    (env.SUPER_ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
}

async function findSuperAdmin(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null
  const userId = await findUserId(ctx, identity.tokenIdentifier)
  return userId && superAdminIds().has(userId) ? userId : null
}

function isoDay(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10)
}

/** The calendar day in a saved time zone, or in UTC without a valid one. */
function dayIn(timeZone: string | undefined, timestamp: number) {
  if (timeZone) {
    try {
      return localCalendarDate(timeZone, timestamp)
    } catch {
      // A zone this runtime does not know falls back to UTC.
    }
  }
  return isoDay(timestamp)
}

/**
 * Counts the foods in the assistant's saved meals by whether they reuse a
 * recorded food. Receipts store the exact input as JSON; anything that does
 * not parse as a meal is skipped.
 */
export function countAgentItems(inputs: Array<string>) {
  let reused = 0
  let typed = 0
  for (const json of inputs) {
    let input: unknown
    try {
      input = JSON.parse(json)
    } catch {
      continue
    }
    if (typeof input !== 'object' || input === null || !('items' in input))
      continue
    if (!Array.isArray(input.items)) continue
    const items: ReadonlyArray<unknown> = input.items
    for (const item of items) {
      const sourceType =
        typeof item === 'object' && item !== null && 'sourceType' in item
          ? item.sourceType
          : undefined
      if (typeof sourceType !== 'string') continue
      if (REUSED_SOURCES.has(sourceType)) reused += 1
      else typed += 1
    }
  }
  return { reused, typed }
}

function dayStart(date: string) {
  return Date.parse(`${date}T00:00:00Z`)
}

export function engagementStatus({
  today,
  joinedOn,
  lastLoggedOn,
  daysLogged,
  previousDaysLogged,
}: {
  today: string
  joinedOn: string
  lastLoggedOn: string | null
  daysLogged: number
  previousDaysLogged: number
}): EngagementStatus {
  const isNew = joinedOn > shiftDay(today, -NEW_ACCOUNT_DAYS)
  if (lastLoggedOn === null) return isNew ? 'new' : 'neverStarted'
  if (isNew) return 'new'
  // From the exact last day: daysLogged can be cut short by the read budget.
  if (lastLoggedOn < shiftDay(today, 1 - WINDOW_DAYS)) return 'lapsed'
  if (lastLoggedOn <= shiftDay(today, -SLIPPING_AFTER_DAYS)) return 'slipping'
  if (
    previousDaysLogged >= MIN_PREVIOUS_DAYS_FOR_DROP &&
    daysLogged * 2 <= previousDaysLogged
  )
    return 'slipping'
  return 'active'
}

function countSources(meals: Array<Doc<'meals'>>) {
  let webMeals = 0
  let agentMeals = 0
  for (const meal of meals) {
    if (meal.source === 'web') webMeals += 1
    else if (meal.source === 'agent') agentMeals += 1
  }
  return {
    meals: meals.length,
    webMeals,
    agentMeals,
    untaggedMeals: meals.length - webMeals - agentMeals,
  }
}

async function readAccount(
  ctx: QueryCtx,
  user: Doc<'users'>,
  today: string,
  windowStart: string,
  previousStart: string,
  mealLimit: number,
) {
  const [memberships, readMeals, latestMeal, preferences] = await Promise.all([
    listMemberships(ctx, user._id, MAX_MEMBERSHIPS),
    ctx.db
      .query('meals')
      .withIndex('by_ownerUserId_and_eatenOn', (q) =>
        q
          .eq('ownerUserId', user._id)
          .gte('eatenOn', previousStart)
          .lte('eatenOn', today),
      )
      .order('desc')
      // One extra row tells a cut-short read from an exact fit.
      .take(mealLimit + 1),
    ctx.db
      .query('meals')
      .withIndex('by_ownerUserId_and_eatenOn', (q) =>
        q.eq('ownerUserId', user._id).lte('eatenOn', today),
      )
      .order('desc')
      .first(),
    ctx.db
      .query('mcpPreferences')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .first(),
  ])
  const partial = readMeals.length > mealLimit
  const recentMeals = readMeals.slice(0, mealLimit)
  // Archived meals still count: logging one was use of the app.
  const meals = recentMeals.filter((meal) => meal.eatenOn >= windowStart)
  const daysLogged = new Set(meals.map((meal) => meal.eatenOn)).size
  const previousDaysLogged = new Set(
    recentMeals
      .filter((meal) => meal.eatenOn < windowStart)
      .map((meal) => meal.eatenOn),
  ).size
  const firstMembership = memberships.reduce<
    Doc<'householdMembers'> | undefined
  >(
    (first, row) => (!first || row.joinedAt < first.joinedAt ? row : first),
    undefined,
  )
  const lastLoggedOn = latestMeal?.eatenOn ?? null
  // Moving a meal to an earlier day also counts; it is rare.
  const lateMeals = meals.filter(
    (meal) => dayIn(preferences?.timeZone, meal.createdAt) > meal.eatenOn,
  ).length
  return {
    account: {
      userId: user._id,
      name: firstMembership?.name ?? null,
      joinedAt: user._creationTime,
      households: memberships.length,
      lastLoggedOn,
      daysLogged,
      previousDaysLogged,
      ...countSources(meals),
      status: engagementStatus({
        today,
        joinedOn: isoDay(user._creationTime),
        lastLoggedOn,
        daysLogged,
        previousDaysLogged,
      }),
      partial,
    },
    meals,
    lateMeals,
    mealsRead: recentMeals.length,
    householdIds: memberships.map((row) => row.householdId),
  }
}

async function countGoalDays(
  ctx: QueryCtx,
  households: Set<Id<'households'>>,
  since: number,
  windowStart: string,
  yesterday: string,
) {
  const summaries = (
    await ctx.db
      .query('dailySummaries')
      .withIndex('by_creation_time', (q) => q.gte('_creationTime', since))
      .order('desc')
      .take(MAX_DAY_SUMMARIES)
  ).filter(
    (row) =>
      households.has(row.householdId) &&
      row.mealCount > 0 &&
      row.eatenOn >= windowStart &&
      row.eatenOn <= yesterday,
  )
  const goalsByPerson = new Map<
    Id<'people'>,
    { fallback: number; history: Array<Doc<'personGoalHistory'>> }
  >()
  let partial = summaries.length === MAX_DAY_SUMMARIES
  for (const row of summaries) {
    if (goalsByPerson.has(row.personId)) continue
    if (goalsByPerson.size === MAX_GOAL_PEOPLE) {
      partial = true
      continue
    }
    const [person, history] = await Promise.all([
      ctx.db.get(row.personId),
      ctx.db
        .query('personGoalHistory')
        .withIndex('by_householdId_and_personId_and_effectiveDate', (q) =>
          q
            .eq('householdId', row.householdId)
            .eq('personId', row.personId)
            .lte('effectiveDate', yesterday),
        )
        .order('desc')
        .take(MAX_GOAL_ROWS),
    ])
    goalsByPerson.set(row.personId, {
      fallback: person?.currentDailyGoalKcal ?? 0,
      history,
    })
  }
  const goalDays = { under: 0, near: 0, over: 0 }
  for (const row of summaries) {
    const goals = goalsByPerson.get(row.personId)
    if (!goals) continue
    // Same rule as readDayNutrition: the latest goal effective on that day.
    const goal =
      goals.history.find((entry) => entry.effectiveDate <= row.eatenOn)
        ?.goalKcal ?? goals.fallback
    if (goal <= 0) continue
    const difference = (row.consumedCalories - goal) / goal
    if (difference < -NEAR_GOAL_SHARE) goalDays.under += 1
    else if (difference > NEAR_GOAL_SHARE) goalDays.over += 1
    else goalDays.near += 1
  }
  return { goalDays, partial }
}

/** Whether the signed-in account may open the usage dashboard. */
export const isSuperAdmin = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => (await findSuperAdmin(ctx)) !== null,
})

/**
 * Who keeps logging, who is drifting away, and how people log, over the 28
 * days ending on `today`. The client passes its local date because queries
 * cannot read the clock.
 */
export const engagement = query({
  args: { today: v.string() },
  returns: engagementValidator,
  handler: async (ctx, args) => {
    // Indistinguishable from a missing page for everyone else.
    if (!(await findSuperAdmin(ctx))) throw new DomainError('Not found.')
    const today = normalizeRequiredDate(args.today, 'Today')
    const windowStart = shiftDay(today, 1 - WINDOW_DAYS)
    const previousStart = shiftDay(windowStart, -WINDOW_DAYS)
    const since = dayStart(windowStart)

    const users = await ctx.db.query('users').take(MAX_ACCOUNTS)
    // One after another, so the accounts share the meal budget.
    const rows = []
    let mealBudget = MEAL_BUDGET
    let awaitingConsent = 0
    for (const user of users) {
      if (!(await hasAcceptedPrivacyNotice(ctx, user._id))) {
        awaitingConsent += 1
        continue
      }
      const row = await readAccount(
        ctx,
        user,
        today,
        windowStart,
        previousStart,
        Math.min(MAX_MEALS_PER_ACCOUNT, mealBudget),
      )
      mealBudget -= row.mealsRead
      rows.push(row)
    }
    const accounts = rows
      .map((row) => row.account)
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          b.daysLogged - a.daysLogged ||
          (a.name ?? '').localeCompare(b.name ?? ''),
      )
    const meals = rows.flatMap((row) => row.meals)
    const households = new Set(rows.flatMap((row) => row.householdIds))
    const accountIds = new Set(accounts.map((account) => account.userId))

    // Meals count by the day they were eaten, foods and batches by the UTC
    // day they were entered, so a backdated meal's foods may fall in another
    // window. Close enough for shares.
    const [
      items,
      cookSessions,
      goals,
      receipts,
      weighIns,
      goalChanges,
      savedFoods,
      templates,
      recipeVersions,
    ] = await Promise.all([
      ctx.db
        .query('mealItems')
        .withIndex('by_creation_time', (q) => q.gte('_creationTime', since))
        .order('desc')
        .take(MAX_ITEMS),
      ctx.db
        .query('cookSessions')
        .withIndex('by_creation_time', (q) => q.gte('_creationTime', since))
        .order('desc')
        .take(MAX_COOK_SESSIONS),
      // A day's summary can be created up to a day before that date starts
      // in UTC; the date filter inside drops the extra rows.
      countGoalDays(
        ctx,
        households,
        dayStart(shiftDay(windowStart, -1)),
        windowStart,
        shiftDay(today, -1),
      ),
      ctx.db
        .query('mcpOperations')
        .withIndex('by_creation_time', (q) => q.gte('_creationTime', since))
        .order('desc')
        .take(MAX_RECEIPTS),
      ctx.db
        .query('weightEntries')
        .withIndex('by_creation_time', (q) => q.gte('_creationTime', since))
        .order('desc')
        .take(MAX_FEATURE_ROWS),
      ctx.db
        .query('personGoalHistory')
        .withIndex('by_creation_time', (q) => q.gte('_creationTime', since))
        .order('desc')
        .take(MAX_FEATURE_ROWS),
      ctx.db
        .query('mcpSavedFoods')
        .withIndex('by_creation_time', (q) => q.gte('_creationTime', since))
        .order('desc')
        .take(MAX_FEATURE_ROWS),
      ctx.db
        .query('mealTemplates')
        .withIndex('by_creation_time', (q) => q.gte('_creationTime', since))
        .order('desc')
        .take(MAX_FEATURE_ROWS),
      ctx.db
        .query('recipeVersions')
        .withIndex('by_creation_time', (q) => q.gte('_creationTime', since))
        .order('desc')
        .take(MAX_FEATURE_ROWS),
    ])
    // How many consenting accounts wrote at least one of these rows.
    const reach = (rows: Array<{ ownerUserId: Id<'users'> }>) =>
      new Set(
        rows
          .map((row) => row.ownerUserId)
          .filter((userId) => accountIds.has(userId)),
      ).size
    const keptMeals = meals.filter((meal) => !meal.archived)
    const itemCounts = {
      ingredient: 0,
      cookedFood: 0,
      customByWeight: 0,
      fixedCalories: 0,
    }
    for (const item of items)
      if (households.has(item.householdId)) itemCounts[item.sourceType] += 1

    return {
      accounts,
      awaitingConsent,
      partial:
        users.length === MAX_ACCOUNTS ||
        rows.some((row) => row.account.partial) ||
        items.length === MAX_ITEMS ||
        cookSessions.length === MAX_COOK_SESSIONS ||
        goals.partial ||
        receipts.length === MAX_RECEIPTS ||
        [weighIns, goalChanges, savedFoods, templates, recipeVersions].some(
          (rows) => rows.length === MAX_FEATURE_ROWS,
        ),
      totals: {
        ...countSources(meals),
        // Archiving also bumps editRevision, and is not an edit.
        editedMeals: keptMeals.filter((meal) => (meal.editRevision ?? 0) > 0)
          .length,
        archivedMeals: meals.length - keptMeals.length,
        lateMeals: rows.reduce((sum, row) => sum + row.lateMeals, 0),
        calories: keptMeals.reduce(
          (sum, meal) => ({
            total: sum.total + meal.totalCalories,
            withoutMacros:
              sum.withoutMacros +
              Math.max(
                0,
                meal.totalCalories - (meal.macros?.coveredCalories ?? 0),
              ),
          }),
          { total: 0, withoutMacros: 0 },
        ),
        agentItems: countAgentItems(
          receipts
            .filter(
              (receipt) =>
                receipt.operation === 'meal' &&
                accountIds.has(receipt.ownerUserId),
            )
            .map((receipt) => receipt.input),
        ),
        features: {
          weighIns: reach(weighIns),
          goals: reach(goalChanges),
          savedFoods: reach(savedFoods),
          templates: reach(templates),
          cooking: reach(cookSessions),
          recipes: reach(recipeVersions),
        },
        items: itemCounts,
        cookSessions: cookSessions.filter((session) =>
          households.has(session.householdId),
        ).length,
        goalDays: goals.goalDays,
      },
    }
  },
})
