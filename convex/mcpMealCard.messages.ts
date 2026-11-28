// The meal card's text. It runs as plain script inside an assistant's chat, so
// messages are strings, not functions: `{n}` and friends are filled in there,
// and each language keeps its own word order around them.
const en = {
  meal: 'Meal',
  estimated: 'Estimated',
  noMacros: 'No macros',
  dayTotal: '{consumed} of {goal} kcal',
  left: '{n} kcal left after this',
  over: '{n} kcal over after this',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  loading: 'Loading…',
  failed: 'Something went wrong',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  saveFailed: "Couldn't save. Try again.",
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
    saving: 'Mentés…',
    saved: 'Mentve',
    saveFailed: 'Nem sikerült menteni. Próbáld újra.',
  } satisfies typeof en,
}
