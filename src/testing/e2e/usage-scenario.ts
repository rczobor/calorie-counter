// Synthetic usage dashboard data for the browser mock: one account per status,
// with invented names. Dates follow the page's own `today`.
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { shiftDay } from '../../../convex/lib/energy'

type Engagement = FunctionReturnType<typeof api.admin.engagement>
type Account = Engagement['accounts'][number]

const DAY = 86_400_000

export function createUsageData(today: string): Engagement {
  const joined = (daysAgo: number) =>
    Date.parse(`${shiftDay(today, -daysAgo)}T09:00:00Z`)
  const account = (
    id: string,
    fields: Omit<Account, 'userId' | 'untaggedMeals'> & {
      untaggedMeals?: number
    },
  ): Account => ({
    userId: id as Id<'users'>,
    untaggedMeals: 0,
    ...fields,
  })
  const accounts = [
    account('e2e-user-noor', {
      name: 'Noor',
      joinedAt: joined(120),
      households: 1,
      lastLoggedOn: shiftDay(today, -9),
      daysLogged: 11,
      previousDaysLogged: 24,
      meals: 31,
      webMeals: 31,
      agentMeals: 0,
      status: 'slipping',
    }),
    account('e2e-user', {
      name: 'Alex',
      joinedAt: joined(300),
      households: 2,
      lastLoggedOn: today,
      daysLogged: 27,
      previousDaysLogged: 26,
      meals: 96,
      webMeals: 28,
      agentMeals: 61,
      untaggedMeals: 7,
      status: 'active',
    }),
    account('e2e-user-sam', {
      name: 'sam.k@example.com',
      joinedAt: joined(80),
      households: 1,
      lastLoggedOn: shiftDay(today, -1),
      daysLogged: 19,
      previousDaysLogged: 21,
      meals: 52,
      webMeals: 52,
      agentMeals: 0,
      status: 'active',
    }),
    account('e2e-user-mira', {
      name: 'Mira',
      joinedAt: joined(5),
      households: 1,
      lastLoggedOn: shiftDay(today, -2),
      daysLogged: 3,
      previousDaysLogged: 0,
      meals: 6,
      webMeals: 2,
      agentMeals: 4,
      status: 'new',
    }),
    account('e2e-user-jonas', {
      name: 'Jonas',
      joinedAt: joined(200),
      households: 1,
      lastLoggedOn: shiftDay(today, -41),
      daysLogged: 0,
      previousDaysLogged: 6,
      meals: 0,
      webMeals: 0,
      agentMeals: 0,
      status: 'lapsed',
    }),
    account('e2e-user-unnamed', {
      name: null,
      joinedAt: joined(60) - DAY,
      households: 1,
      lastLoggedOn: null,
      daysLogged: 0,
      previousDaysLogged: 0,
      meals: 0,
      webMeals: 0,
      agentMeals: 0,
      status: 'neverStarted',
    }),
  ]
  return {
    accounts,
    accountsTruncated: false,
    totals: {
      meals: 185,
      webMeals: 113,
      agentMeals: 65,
      untaggedMeals: 7,
      editedMeals: 14,
      items: {
        ingredient: 96,
        cookedFood: 41,
        customByWeight: 77,
        fixedCalories: 58,
      },
      itemsTruncated: false,
      cookSessions: 6,
      goalDays: { under: 22, near: 31, over: 19 },
    },
  }
}
