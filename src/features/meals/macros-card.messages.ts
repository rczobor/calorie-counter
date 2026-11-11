import type { ReactNode } from 'react'
import { defineMessages, rich } from '@/i18n/messages'

// Figures arrive styled; the words around them stay quiet.
type Figure = ReactNode

export const messages = defineMessages({
  en: {
    macros: 'Macros',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    grams: (grams: Figure) => rich(grams, ' g'),
    ofGoal: (grams: string, goal: string) => `${grams} / ${goal} g`,
    // The calorie card's words: "801 kcal left", "Goal reached".
    left: (grams: Figure) => rich(grams, ' g left'),
    goalReached: 'Goal reached',
    noMacros: 'No macros',
    noGoal: 'No goal',
    proteinPerKg: (perKg: string) => `Protein: ${perKg} g/kg`,
    proteinPerKgOfGoal: (perKg: string, goal: string) =>
      `Protein: ${perKg} / ${goal} g/kg`,
    showByMeal: 'Show macros by meal',
    byMeal: 'Macros by meal',
    total: 'Total',
    noMeals: 'No meals logged.',
    editGoals: 'Edit macro goals',
    close: 'Close',
  },
  hu: {
    macros: 'Makrók',
    protein: 'Fehérje',
    carbs: 'Szénhidrát',
    fat: 'Zsír',
    grams: (grams: Figure) => rich(grams, ' g'),
    ofGoal: (grams: string, goal: string) => `${grams} / ${goal} g`,
    left: (grams: Figure) => rich(grams, ' g maradt'),
    goalReached: 'Cél elérve',
    noMacros: 'Nincs makró',
    noGoal: 'Nincs cél',
    // Grams per kilogram of body weight, as Hungarian dietetics writes it.
    proteinPerKg: (perKg: string) => `Fehérje: ${perKg} g/ttkg`,
    proteinPerKgOfGoal: (perKg: string, goal: string) =>
      `Fehérje: ${perKg} / ${goal} g/ttkg`,
    showByMeal: 'Makrók étkezésenként',
    byMeal: 'Makrók étkezésenként',
    total: 'Összesen',
    noMeals: 'Nincs rögzített étkezés.',
    editGoals: 'Makrócélok szerkesztése',
    close: 'Bezárás',
  },
})
