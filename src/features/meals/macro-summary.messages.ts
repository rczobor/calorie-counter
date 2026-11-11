import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    macros: 'Macros',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    // Some foods have no macros, so the grams cover part of the day.
    coverage: (percent: string) => `Macros cover ${percent}% of logged kcal`,
  },
  hu: {
    macros: 'Makrók',
    protein: 'Fehérje',
    carbs: 'Szénhidrát',
    fat: 'Zsír',
    coverage: (percent: string) => `Makrókkal lefedett kcal: ${percent}%`,
  },
})
