import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    recoveryUnavailable:
      'Edit recovery is unavailable. Keep this tab open until you save or discard your changes.',
    invalidLine:
      'Enter an ingredient name, positive reference amount, and valid nutrition and counted amount.',
    invalidFood:
      'Enter a name, a positive finished weight, and at least one ingredient.',
    unfinishedLine: 'Add or clear the unfinished ingredient before saving.',
    saved:
      'Cooked food saved. Previously logged meals keep their recorded nutrition.',
    editor: 'Cooked food editor',
    editTitle: 'Edit cooked food',
    recoverTitle: 'Recover cooking draft',
    historyNote: 'Existing meals keep their historical portions and nutrition.',
    close: 'Close',
    unsafeLegacyEdit:
      'This older edit has no safe revision baseline. Export the recovered draft, then reopen the current cooked food to apply your changes.',
    originalUnavailable:
      'This cooked food is unavailable. Your recovered edit is preserved.',
    name: 'Name',
    finishedWeight: 'Finished weight (g)',
    composition: 'Composition',
    historicalIngredient: 'Historical ingredient',
    removeLine: (name: string) => `Remove ${name}`,
    remove: 'Remove',
    referenceAmountIn: (unit: string) => `Reference amount (${unit})`,
    countedAmountIn: (unit: string) => `Counted amount (${unit})`,
    caloriesIgnored: 'Calories ignored.',
    countedAmountHint:
      'A reference quantity alone does not convert to the nutrition basis. Enter the counted amount in its stated unit.',
    lineNotes: 'Line notes',
    notesFor: (name: string) => `Notes for ${name}`,
    addIngredient: 'Add an ingredient',
    unfinishedCatalogSelection:
      'An unfinished catalog selection remains in this recovered draft. Copy it from the original export, or clear the selection before saving.',
    clearCatalogSelection: 'Clear unfinished catalog selection',
    ingredientName: 'Ingredient name',
    caloriesPer100Basis: 'Calories / 100 basis units',
    nutritionBasis: 'Nutrition basis',
    newNutritionBasis: 'New ingredient nutrition basis',
    referenceAmount: 'Reference amount',
    referenceUnit: 'Reference unit',
    newReferenceUnit: 'New ingredient reference unit',
    ignoreCalories: 'Ignore calories',
    addLine: 'Add ingredient line',
    foodNotes: 'Food notes',
    cookedFoodNotes: 'Cooked food notes',
    recoveredRecipeName: 'Recovered recipe name',
    recoveredRecipeInstructions: 'Recovered recipe instructions',
    cancel: 'Cancel',
    saving: 'Saving…',
    saveChanges: 'Save changes',
    saveRecovered: 'Save recovered cooking',
    discardTitle: 'Discard cooking changes?',
    discardDescription:
      'Your unsaved changes in this editor will be lost. Existing records and other recovered drafts stay in place.',
    discardChanges: 'Discard changes',
  },
  hu: {
    recoveryUnavailable:
      'A szerkesztés helyreállítása nem érhető el. Tartsd nyitva ezt a lapot, amíg nem mented vagy veted el a módosításokat.',
    invalidLine:
      'Adj meg alapanyagnevet, pozitív referenciamennyiséget, valamint érvényes tápértéket és beszámított mennyiséget.',
    invalidFood:
      'Adj meg egy nevet, pozitív kész tömeget és legalább egy alapanyagot.',
    unfinishedLine: 'Mentés előtt add hozzá vagy töröld a félkész alapanyagot.',
    saved:
      'Főtt étel mentve. A korábban rögzített étkezések tápértéke nem változik.',
    editor: 'Főtt étel szerkesztése',
    editTitle: 'Főtt étel szerkesztése',
    recoverTitle: 'Főzési piszkozat helyreállítása',
    historyNote:
      'A meglévő étkezések megtartják a korábbi adagjukat és tápértéküket.',
    close: 'Bezárás',
    unsafeLegacyEdit:
      'Ehhez a régebbi szerkesztéshez nincs biztonságos kiinduló változat. Exportáld a helyreállított piszkozatot, majd nyisd meg újra a főtt étel aktuális változatát, és abban végezd el a módosításokat.',
    originalUnavailable:
      'Ez a főtt étel nem érhető el. A helyreállított szerkesztésed megmaradt.',
    name: 'Név',
    finishedWeight: 'Kész tömeg (g)',
    composition: 'Összetétel',
    historicalIngredient: 'Korábbi alapanyag',
    removeLine: (name: string) => `Eltávolítás: ${name}`,
    remove: 'Eltávolítás',
    referenceAmountIn: (unit: string) => `Referenciamennyiség (${unit})`,
    countedAmountIn: (unit: string) => `Beszámított mennyiség (${unit})`,
    caloriesIgnored: 'Kalória kihagyva.',
    countedAmountHint:
      'A referenciamennyiséget nem váltjuk át magától a tápérték-alapegységre. A beszámított mennyiséget a feltüntetett egységben add meg.',
    lineNotes: 'Megjegyzés',
    notesFor: (name: string) => `Megjegyzés: ${name}`,
    addIngredient: 'Alapanyag hozzáadása',
    unfinishedCatalogSelection:
      'A helyreállított piszkozatban maradt egy befejezetlen választás az ételtárból. Másold át az eredeti exportból, vagy mentés előtt töröld a választást.',
    clearCatalogSelection: 'Befejezetlen választás törlése',
    ingredientName: 'Alapanyag neve',
    caloriesPer100Basis: 'Kalória / 100 alapegység',
    nutritionBasis: 'Tápérték-alapegység',
    newNutritionBasis: 'Új alapanyag tápérték-alapegysége',
    referenceAmount: 'Referenciamennyiség',
    referenceUnit: 'Referenciaegység',
    newReferenceUnit: 'Új alapanyag referenciaegysége',
    ignoreCalories: 'Kalória kihagyása',
    addLine: 'Hozzáadás',
    foodNotes: 'Megjegyzés az ételhez',
    cookedFoodNotes: 'Megjegyzés a főtt ételhez',
    recoveredRecipeName: 'Helyreállított recept neve',
    recoveredRecipeInstructions: 'Helyreállított recept elkészítési útmutatója',
    cancel: 'Mégse',
    saving: 'Mentés…',
    saveChanges: 'Módosítások mentése',
    saveRecovered: 'Helyreállított főzés mentése',
    discardTitle: 'Elveted a módosításokat?',
    discardDescription:
      'A szerkesztőben végzett, nem mentett módosítások elvesznek. A meglévő bejegyzések és a többi helyreállított piszkozat megmarad.',
    discardChanges: 'Módosítások elvetése',
  },
})
