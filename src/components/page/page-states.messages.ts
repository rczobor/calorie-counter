import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    configMissingTitle: 'Connect Convex First',
    configMissingDescription:
      'Add VITE_CONVEX_URL and CONVEX_DEPLOYMENT in .env.local, then reload.',
    errorTitle: 'Something went wrong',
    pageLoadFailed: (message: string) =>
      `This page could not be loaded: ${message}`,
    retry: 'Retry',
  },
  hu: {
    configMissingTitle: 'Előbb csatlakoztasd a Convexet',
    configMissingDescription:
      'Add meg a VITE_CONVEX_URL és a CONVEX_DEPLOYMENT értékét a .env.local fájlban, majd töltsd újra az oldalt.',
    errorTitle: 'Hiba történt',
    pageLoadFailed: (message: string) =>
      `Nem sikerült betölteni az oldalt: ${message}`,
    retry: 'Próbáld újra',
  },
})
