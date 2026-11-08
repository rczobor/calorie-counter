import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    loading: (list: string) => `Loading ${list.toLowerCase()}`,
  },
  hu: {
    loading: (list: string) => `${list} betöltése`,
  },
})
