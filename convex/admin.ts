import { v, type Infer } from 'convex/values'

import { env, query, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { findUserId, listMemberships } from './lib/auth'
import { shiftDay } from './lib/energy'
import { DomainError, normalizeRequiredDate } from './lib/validation'

// The usage dashboard reads every account, so only the accounts listed in
// SUPER_ADMIN_USER_IDS (comma-separated `users` ids) may open it. It reports
// whether people log, never what they eat: no food names, calories or weights
// leave this module per account.

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
//   200 accounts × (10 memberships + 1 latest meal)     2,200 docs
//   meals shared by every account                      8,000
//   foods 2,000 + batches 500 + day summaries 2,000    4,500
//   200 people × (1 person + 10 goals)                 2,200
// About 17,000 documents and 1,000 index reads at most. Reads take the newest
// rows first; past a cap the page says its figures are partial.
const MAX_ACCOUNTS = 200
const MAX_MEMBERSHIPS = 10
const MEAL_BUDGET = 8_000
const MAX_MEALS_PER_ACCOUNT = 500
const MAX_ITEMS = 2_000
const MAX_COOK_SESSIONS = 500
const MAX_DAY_SUMMARIES = 2_000
const MAX_GOAL_PEOPLE = 200
const MAX_GOAL_ROWS = 10

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
})

const engagementValidator = v.object({
  accounts: v.array(accountValidator),
  /** Some reads hit their cap, so some figures cover only part of the data. */
  partial: v.boolean(),
  totals: v.object({
    ...sourceCounts,
    editedMeals: v.number(),
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
  if (daysLogged === 0) return 'lapsed'
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
  const [memberships, recentMeals, latestMeal] = await Promise.all([
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
      .take(mealLimit),
    ctx.db
      .query('meals')
      .withIndex('by_ownerUserId_and_eatenOn', (q) =>
        q.eq('ownerUserId', user._id).lte('eatenOn', today),
      )
      .order('desc')
      .first(),
  ])
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
    },
    meals,
    partial: recentMeals.length === mealLimit,
    mealsRead: recentMeals.length,
  }
}

async function countGoalDays(
  ctx: QueryCtx,
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
    for (const user of users) {
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

    // Meals count by the day they were eaten, foods and batches by the UTC
    // day they were entered, so a backdated meal's foods may fall in another
    // window. Close enough for shares.
    const [items, cookSessions, goals] = await Promise.all([
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
        dayStart(shiftDay(windowStart, -1)),
        windowStart,
        shiftDay(today, -1),
      ),
    ])
    const itemCounts = {
      ingredient: 0,
      cookedFood: 0,
      customByWeight: 0,
      fixedCalories: 0,
    }
    for (const item of items) itemCounts[item.sourceType] += 1

    return {
      accounts,
      partial:
        users.length === MAX_ACCOUNTS ||
        rows.some((row) => row.partial) ||
        items.length === MAX_ITEMS ||
        cookSessions.length === MAX_COOK_SESSIONS ||
        goals.partial,
      totals: {
        ...countSources(meals),
        // Archiving also bumps editRevision, and is not an edit.
        editedMeals: meals.filter(
          (meal) => !meal.archived && (meal.editRevision ?? 0) > 0,
        ).length,
        items: itemCounts,
        cookSessions: cookSessions.length,
        goalDays: goals.goalDays,
      },
    }
  },
})
