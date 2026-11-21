import type { ReactNode } from 'react'

import { defineMessages, rich } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    title: 'History',
    loadFailed: (error: string) => `History could not be loaded: ${error}`,
    retry: 'Retry',
    loadingPeople: 'Loading people',
    noActivePeople: 'No active people.',
    loadMorePeople: 'Load more people',
    range: 'Range',
    days: (count: number) => `${count} days`,
    customRange: 'Custom range',
    startDate: 'History start date',
    endDate: 'History end date',
    rangeTooLong: (max: number) =>
      `History ranges can include at most ${max} days.`,
    rangeReversed: 'The start date must be on or before the end date.',
    loadingRange: 'Loading the complete date range',
    // The verdict: "2014 kcal a day", beside the balance against the goal.
    kcalADay: 'kcal a day',
    // Under it: "5 of 7 days over", and the days without meals when the
    // range has any. The first figure is styled apart from the words.
    daysOver: (over: ReactNode, logged: number, empty: number) =>
      rich(
        over,
        ` of ${logged} ${logged === 1 ? 'day' : 'days'} over`,
        empty
          ? ` · ${empty} ${empty === 1 ? 'day' : 'days'} without meals`
          : '',
      ),
    dailyCalories: 'Daily calories',
    daysHeading: 'Days',
    noData: 'No data for the selected range.',
    emptyRangeTitle: 'Nothing logged in this range',
    emptyRange: 'Tell your AI assistant what you ate, or open a day below.',
  },
  hu: {
    title: 'Előzmények',
    loadFailed: (error: string) =>
      `Nem sikerült betölteni az előzményeket: ${error}`,
    retry: 'Próbáld újra',
    loadingPeople: 'Személyek betöltése',
    noActivePeople: 'Nincs aktív személy.',
    loadMorePeople: 'További személyek betöltése',
    range: 'Időszak',
    days: (count: number) => `${count} nap`,
    customRange: 'Egyéni időszak',
    startDate: 'Kezdő dátum',
    endDate: 'Záró dátum',
    rangeTooLong: (max: number) => `Az időszak legfeljebb ${max} nap lehet.`,
    rangeReversed: 'A kezdő dátum nem lehet későbbi a záró dátumnál.',
    loadingRange: 'A teljes időszak betöltése',
    kcalADay: 'kcal naponta',
    // "7 napból 5 túllépés"
    daysOver: (over: ReactNode, logged: number, empty: number) =>
      rich(
        `${logged} napból `,
        over,
        ' túllépés',
        empty ? ` · ${empty} nap étkezés nélkül` : '',
      ),
    dailyCalories: 'Napi kalória',
    daysHeading: 'Napok',
    noData: 'A kiválasztott időszakhoz nincs adat.',
    emptyRangeTitle: 'Ebben az időszakban nincs rögzítés',
    emptyRange:
      'Írd meg az AI-asszisztensednek, mit ettél, vagy nyiss meg lent egy napot.',
  },
})
