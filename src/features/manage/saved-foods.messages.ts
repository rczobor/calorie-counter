import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    section: 'Reusable foods',
    noneTitle: 'No reusable foods yet',
    none: 'Ask your AI assistant to save a packaged food or a fixed portion, and it logs in one step next time.',
    search: 'Search reusable foods',
    empty:
      'No reusable foods found. Ask your AI assistant to remember a logged food to save it here.',
    savedPortion: 'saved portion',
    kcalPerPortion: (portion: string) => `kcal / ${portion}`,
    per100: (unit: 'g' | 'ml') => `per 100 ${unit}`,
    hint: 'A reusable food keeps the nutrition it was saved with.',
    oneServingMeans: (servingLabel: string) =>
      `One serving means one ${servingLabel}.`,
    wholeLoggedItem:
      'One saved portion is the entire originally logged item. It may include several package servings.',
    measuredPortion: (byVolume: boolean) =>
      `Reuse this food with a measured portion in ${byVolume ? 'millilitres' : 'grams'}.`,
    restored: 'Reusable food restored.',
    archived: 'Reusable food archived.',
    loadMore: 'Load more reusable foods',
    loadMoreArchived: 'Load more archived foods',
  },
  hu: {
    section: 'Mentett ételek',
    noneTitle: 'Még nincs mentett étel',
    none: 'Kérd meg az AI-asszisztensedet, hogy mentsen el egy csomagolt ételt vagy állandó adagot, és legközelebb egy lépésben rögzíti.',
    search: 'Mentett ételek keresése',
    empty:
      'Nem található mentett étel. Kérd meg az AI-asszisztensedet, hogy jegyezzen meg egy rögzített ételt, és itt megjelenik.',
    savedPortion: 'mentett adag',
    kcalPerPortion: (portion: string) => `kcal / ${portion}`,
    per100: (unit: 'g' | 'ml') => `/ 100 ${unit}`,
    hint: 'A mentett étel megtartja a mentéskor rögzített tápértéket.',
    oneServingMeans: (servingLabel: string) => `Egy adag egy ${servingLabel}.`,
    wholeLoggedItem:
      'Egy mentett adag a teljes, eredetileg rögzített tétel. Több csomagolási adagot is tartalmazhat.',
    measuredPortion: (byVolume: boolean) =>
      `Ezt az ételt ${byVolume ? 'milliliterben' : 'grammban'} mért adaggal használhatod újra.`,
    restored: 'Mentett étel visszaállítva.',
    archived: 'Mentett étel archiválva.',
    loadMore: 'További mentett ételek betöltése',
    loadMoreArchived: 'További archivált ételek betöltése',
  },
})
