import type { ReactNode } from 'react'
import { defineMessages, rich } from '@/i18n/messages'

// Figures arrive styled; the words around them stay quiet.
type Figure = ReactNode

export const messages = defineMessages({
  en: {
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    ofGoal: (grams: string, goal: string) => `${grams} / ${goal} g`,
    // The calorie card's words: "801 kcal left", "Goal reached".
    left: (grams: Figure) => rich(grams, ' g left'),
    // Short, so it fits a phone's third of the strip beside its check.
    goalReached: 'Reached',
    meal: 'Meal',
    noMacros: 'No macros',
    macroGrams: (label: string, grams: string) => `${label} ${grams} g`,
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
    protein: 'Fehérje',
    carbs: 'Szénhidrát',
    fat: 'Zsír',
    ofGoal: (grams: string, goal: string) => `${grams} / ${goal} g`,
    left: (grams: Figure) => rich(grams, ' g maradt'),
    goalReached: 'Elérve',
    meal: 'Étkezés',
    noMacros: 'Nincs makró',
    macroGrams: (label: string, grams: string) => `${label} ${grams} g`,
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
