// The meal card's text. It runs as plain script inside an assistant's chat, so
// messages are strings, not functions: `{n}` and friends are filled in there,
// and each language keeps its own word order around them.
const en = {
  meal: 'Meal',
  estimated: 'Estimated',
  noMacros: 'No macros',
  dayTotal: '{consumed} / {goal} kcal',
  left: '{n} kcal left',
  over: '{n} kcal over',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  loading: 'Loading…',
  failed: 'Something went wrong',
  save: 'Save',
  // Sent into the chat as the person's own reply when they tap Save.
  saveNamed: 'Save {meal} ({kcal} kcal)',
  saveUnnamed: 'Save this meal ({kcal} kcal)',
}

export const mealCardMessages = {
  en,
  hu: {
    meal: 'Étkezés',
    estimated: 'Becsült',
    noMacros: 'Nincs makró',
    dayTotal: '{consumed} / {goal} kcal',
    left: '{n} kcal maradt',
    over: '{n} kcal túllépés',
    protein: 'Fehérje',
    carbs: 'Szénhidrát',
    fat: 'Zsír',
    loading: 'Betöltés…',
    failed: 'Hiba történt',
    save: 'Mentés',
    saveNamed: 'Mentsd el: {meal} ({kcal} kcal)',
    saveUnnamed: 'Mentsd el ezt az étkezést ({kcal} kcal)',
  } satisfies typeof en,
}
