import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    title: 'Daily intake',
    loadFailed: (reason: string) =>
      `Daily intake could not be loaded: ${reason}`,
    retry: 'Retry',
  },
  hu: {
    title: 'Napi bevitel',
    loadFailed: (reason: string) =>
      `Nem sikerült betölteni a napi bevitelt: ${reason}`,
    retry: 'Próbáld újra',
  },
})
