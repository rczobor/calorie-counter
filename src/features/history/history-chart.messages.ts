import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    legendOver: 'Over',
    legendGoal: 'Goal',
    noMealsLogged: 'No meals logged',
    noChartData: 'No chart data for the selected range.',
    // The chart's text for screen readers; each day follows as a link.
    summary: (days: number, logged: number, over: number) =>
      `${days} days: ${logged} with meals, ${over} over the goal.`,
  },
  hu: {
    // The day balance's word: "kcal túllépés".
    legendOver: 'Túllépés',
    legendGoal: 'Cél',
    noMealsLogged: 'Nincs rögzített étkezés',
    noChartData: 'A kiválasztott időszakhoz nincs grafikonadat.',
    summary: (days: number, logged: number, over: number) =>
      `${days} nap: ${logged} napon van étkezés, ${over} napon túllépés.`,
  },
})
