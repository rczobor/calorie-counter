import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    showArchived: 'Show archived',
    create: (noun: string) => `New ${noun}`,
  },
  hu: {
    showArchived: 'Archiváltak megjelenítése',
    create: (noun: string) => `Új ${noun}`,
  },
})
