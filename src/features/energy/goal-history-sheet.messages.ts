import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    title: 'Goal history',
    close: 'Close goal history',
    empty: 'No goal history found.',
    loadMore: 'Load more goal history',
    kcalPerDay: 'kcal / day',
    // Later changes on a date replace earlier ones; only the last applied.
    replacedCount: (count: number) =>
      `Replaced ${count} earlier ${count === 1 ? 'goal' : 'goals'} that day`,
    replacedAt: (time: string) => `Replaced · set at ${time}`,
  },
  hu: {
    title: 'Célelőzmények',
    close: 'Célelőzmények bezárása',
    empty: 'Nincsenek célelőzmények.',
    loadMore: 'További célelőzmények betöltése',
    kcalPerDay: 'kcal / nap',
    replacedCount: (count: number) => `Aznap ${count} korábbi célt váltott fel`,
    replacedAt: (time: string) => `Lecserélve · beállítva: ${time}`,
  },
})
