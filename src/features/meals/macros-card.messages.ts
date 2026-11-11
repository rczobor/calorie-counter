import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    macros: 'Macros',
    protein: 'Protein',
    carbs: 'Carbs',
    fat: 'Fat',
    grams: (grams: string) => `${grams} g`,
    ofGoal: (grams: string, goal: string) => `${grams} / ${goal} g`,
    // Like the calorie card's "kcal left": what is still to eat.
    toGo: (grams: string) => `${grams} g to go`,
    goalMet: 'Goal met',
    proteinPerKg: (perKg: string) => `Protein: ${perKg} g/kg`,
    proteinPerKgOfGoal: (perKg: string, goal: string) =>
      `Protein: ${perKg} / ${goal} g/kg`,
    showByMeal: 'Show macros by meal',
    byMeal: 'Macros by meal',
    mealMacros: (protein: string, carbs: string, fat: string) =>
      `${protein} g protein · ${carbs} g carbs · ${fat} g fat`,
    noMacros: 'No macros recorded',
    noMeals: 'No meals logged.',
    editGoals: 'Edit macro goals',
    close: 'Close',
  },
  hu: {
    macros: 'Makrók',
    protein: 'Fehérje',
    carbs: 'Szénhidrát',
    fat: 'Zsír',
    grams: (grams: string) => `${grams} g`,
    ofGoal: (grams: string, goal: string) => `${grams} / ${goal} g`,
    toGo: (grams: string) => `még ${grams} g`,
    goalMet: 'Teljesítve',
    // Grams per kilogram of body weight, as Hungarian dietetics writes it.
    proteinPerKg: (perKg: string) => `Fehérje: ${perKg} g/ttkg`,
    proteinPerKgOfGoal: (perKg: string, goal: string) =>
      `Fehérje: ${perKg} / ${goal} g/ttkg`,
    showByMeal: 'Makrók étkezésenként',
    byMeal: 'Makrók étkezésenként',
    mealMacros: (protein: string, carbs: string, fat: string) =>
      `fehérje ${protein} g · szénhidrát ${carbs} g · zsír ${fat} g`,
    noMacros: 'Nincs rögzített makró',
    noMeals: 'Nincs rögzített étkezés.',
    editGoals: 'Makrócélok szerkesztése',
    close: 'Bezárás',
  },
})
