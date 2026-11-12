import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    legendOver: 'Over',
    legendGoal: 'Goal',
    noMealsLogged: 'No meals logged',
    // Today's column is still filling up.
    today: 'Today',
    // The chart's text for screen readers; each day follows as a link.
    summary: (days: number, logged: number, over: number) =>
      `${days} ${days === 1 ? 'day' : 'days'}: ${logged} with meals, ${over} over the goal.`,
  },
  hu: {
    // The day balance's word: "kcal túllépés".
    legendOver: 'Túllépés',
    legendGoal: 'Cél',
    noMealsLogged: 'Nincs rögzített étkezés',
    today: 'Ma',
    summary: (days: number, logged: number, over: number) =>
      `${days} nap: ${logged} napon van étkezés, ${over} napon túllépés.`,
  },
})
