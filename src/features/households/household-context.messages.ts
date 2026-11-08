import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    retry: 'Retry',
    preparing: 'Preparing your household',
    noHouseholds:
      'You no longer belong to any households. Ask a household admin for an invitation link to join again.',
    selectionUnavailable:
      'Your selected household is no longer available. Choose a household to continue.',
    loadingChoices: 'Loading household choices',
    household: 'Household',
    setupFailed: (error: string) =>
      `Household setup could not finish: ${error} Your current household is still available. Save your changes before refreshing to retry.`,
  },
  hu: {
    retry: 'Próbáld újra',
    preparing: 'Háztartás előkészítése',
    noHouseholds:
      'Már egyetlen háztartásnak sem vagy a tagja. Kérj meghívólinket egy háztartás adminisztrátorától, hogy újra csatlakozhass.',
    selectionUnavailable:
      'A kiválasztott háztartás már nem érhető el. A folytatáshoz válassz egy háztartást.',
    loadingChoices: 'Háztartások betöltése',
    household: 'Háztartás',
    setupFailed: (error: string) =>
      `Nem sikerült befejezni a háztartás beállítását: ${error} A jelenlegi háztartásod továbbra is elérhető. Az újrapróbáláshoz frissítsd az oldalt, de előtte mentsd a módosításaidat.`,
  },
})
