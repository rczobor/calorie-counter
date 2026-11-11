import type { ReactNode } from 'react'
import { defineMessages, rich } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    macros: 'Macros',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    // The figures are styled apart from the words.
    ofGoal: (grams: ReactNode, goal: ReactNode) =>
      rich(grams, ' / ', goal, ' g'),
    perKg: (grams: string) => `${grams} g/kg`,
  },
  hu: {
    macros: 'Makrók',
    protein: 'Fehérje',
    carbs: 'Szénhidrát',
    fat: 'Zsír',
    ofGoal: (grams: ReactNode, goal: ReactNode) =>
      rich(grams, ' / ', goal, ' g'),
    // Grams per kilogram of body weight, as Hungarian dietetics writes it.
    perKg: (grams: string) => `${grams} g/ttkg`,
  },
})
