import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    macros: 'Macros',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    grams: (grams: string) => `${grams} g`,
    // Some foods have no macros, so the grams cover part of the day.
    coverage: (percent: string) => `Logged kcal with macros: ${percent}%`,
  },
  hu: {
    macros: 'Makrók',
    protein: 'Fehérje',
    carbs: 'Szénhidrát',
    fat: 'Zsír',
    grams: (grams: string) => `${grams} g`,
    coverage: (percent: string) => `Makróval rögzített kcal: ${percent}%`,
  },
})
