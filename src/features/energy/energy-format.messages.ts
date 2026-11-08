import {
  calculatorReason,
  closeness,
  type GoalPlan,
} from '../../../convex/lib/energy'
import { formatAmount } from '@/i18n/format'
import { defineMessages } from '@/i18n/messages'

type Direction = 'lose' | 'gain'
type DayPart = 'early' | 'mid' | 'late'

const HU_CLOSENESS = {
  'a close estimate': 'pontos becslés',
  'a fair estimate': 'közelítő becslés',
  'a rough estimate': 'durva becslés',
} satisfies Record<ReturnType<typeof closeness>, string>

export const messages = defineMessages({
  en: {
    maintaining: 'Keeping weight steady',
    plan: (direction: Direction, percent: string) =>
      `${direction === 'lose' ? 'Losing' : 'Gaining'} ${percent}% a week`,
    currentGoal: (current: number, change: string) =>
      `Current goal ${current} (${change})`,
    noChange: 'no change',
    list: (head: string, last: string) => `${head} and ${last}`,
    roughDate: (part: DayPart, monthYear: string) =>
      `${{ early: 'early ', mid: 'mid-', late: 'late ' }[part]}${monthYear}`,
    // English is the assistant's own wording, so goal history and its
    // answers read the same as the app.
    calculatorReason,
    closeness: (uncertaintyKcal: number): string => closeness(uncertaintyKcal),
  },
  hu: {
    maintaining: 'Testsúly szinten tartása',
    plan: (direction: Direction, percent: string) =>
      `Heti ${percent}% ${direction === 'lose' ? 'fogyás' : 'hízás'}`,
    currentGoal: (current: number, change: string) =>
      `Jelenlegi cél: ${current} (${change})`,
    noChange: 'nincs változás',
    list: (head: string, last: string) => `${head} és ${last}`,
    roughDate: (part: DayPart, monthYear: string) =>
      `${monthYear} ${{ early: 'eleje', mid: 'közepe', late: 'vége' }[part]}`,
    calculatorReason: (plan: GoalPlan) =>
      plan.direction === 'maintain'
        ? 'Kalkulátor: szinten tartás'
        : `Kalkulátor: heti ${formatAmount(plan.percentPerWeek, 'hu')}% ${plan.direction === 'lose' ? 'fogyás' : 'hízás'}`,
    closeness: (uncertaintyKcal: number) =>
      HU_CLOSENESS[closeness(uncertaintyKcal)],
  },
})
