import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    editTemplate: 'Edit template',
    hint: 'Templates keep their recorded nutrition until you replace a product. Past meals stay unchanged.',
    templateName: 'Template name',
    templateFoods: 'Template foods',
    servings: 'servings',
    recordedPortions: 'recorded portions',
    weightLine: (grams: string, kcalPer100: string) =>
      `${grams} g · ${kcalPer100} kcal/100 g`,
    portionLine: (count: string, unit: string, calories: string) =>
      `${count} ${unit} · ${calories} kcal`,
    quantity: (unit: string) => `Quantity (${unit})`,
    replace: (name: string) => `Replace ${name}`,
    keepRecordedProduct: 'Keep recorded product',
    kcalPerServing: (calories: string) => `${calories} kcal / serving`,
    kcalPer100: (kcal: string, unit: 'g' | 'ml') => `${kcal} kcal/100 ${unit}`,
    remove: (name: string) => `Remove ${name}`,
    loadMoreReplacements: 'Load more replacement foods',
    conflict:
      'This template changed. Close and reopen it to use the latest version.',
    moreActions: (name: string) => `More actions for ${name}`,
    delete: 'Delete template',
    confirmDelete: (name: string) =>
      `Delete “${name}”? Logged meals will keep their recorded nutrition.`,
    deleted: 'Template deleted.',
    updated: 'Template updated.',
    save: 'Save template',
    section: 'Meal templates',
    intro:
      'Your AI assistant saves templates from logged meals. Editing one never changes past meals.',
    search: 'Search meal templates',
    empty: 'No meal templates found.',
    noneTitle: 'No meal templates yet',
    none: 'Ask your AI assistant to save a logged meal as a template.',
    edit: 'Edit',
    foodCount: (count: number) => `${count} ${count === 1 ? 'food' : 'foods'}`,
    loadMore: 'Load more templates',
  },
  hu: {
    editTemplate: 'Sablon szerkesztése',
    hint: 'A sablon megtartja a rögzített tápértéket, amíg le nem cserélsz egy terméket. A korábbi étkezések nem változnak.',
    templateName: 'Sablon neve',
    templateFoods: 'A sablon ételei',
    servings: 'adag',
    recordedPortions: 'rögzített adag',
    weightLine: (grams: string, kcalPer100: string) =>
      `${grams} g · ${kcalPer100} kcal/100 g`,
    portionLine: (count: string, unit: string, calories: string) =>
      `${count} ${unit} · ${calories} kcal`,
    quantity: (unit: string) => `Mennyiség (${unit})`,
    replace: (name: string) => `Csere: ${name}`,
    keepRecordedProduct: 'Rögzített termék megtartása',
    kcalPerServing: (calories: string) => `${calories} kcal / adag`,
    kcalPer100: (kcal: string, unit: 'g' | 'ml') => `${kcal} kcal/100 ${unit}`,
    remove: (name: string) => `Eltávolítás: ${name}`,
    loadMoreReplacements: 'További csereételek betöltése',
    conflict:
      'Ez a sablon közben megváltozott. A legfrissebb változathoz zárd be, és nyisd meg újra.',
    moreActions: (name: string) => `További műveletek: ${name}`,
    delete: 'Sablon törlése',
    confirmDelete: (name: string) =>
      `Törlöd ezt a sablont: „${name}”? A már rögzített étkezések tápértéke nem változik.`,
    deleted: 'Sablon törölve.',
    updated: 'Sablon frissítve.',
    save: 'Sablon mentése',
    section: 'Étkezéssablonok',
    intro:
      'Az AI-asszisztensed rögzített étkezésekből ment sablonokat. Egy sablon szerkesztése sosem módosítja a korábbi étkezéseket.',
    search: 'Étkezéssablonok keresése',
    empty: 'Nem található étkezéssablon.',
    noneTitle: 'Még nincs étkezéssablon',
    none: 'Kérd meg az AI-asszisztensedet, hogy mentsen el sablonként egy rögzített étkezést.',
    edit: 'Szerkesztés',
    foodCount: (count: number) => `${count} étel`,
    loadMore: 'További sablonok betöltése',
  },
})
