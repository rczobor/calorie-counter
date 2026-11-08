import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    empty: 'No weights in this range.',
    single: (kg: string, date: string) => `Weight ${kg} kg on ${date}`,
    range: (
      fromKg: string,
      fromDate: string,
      toKg: string,
      toDate: string,
      count: number,
    ) =>
      `Weight from ${fromKg} kg on ${fromDate} to ${toKg} kg on ${toDate}, ${count} weigh-ins`,
    withGaps: (label: string) =>
      `${label}. Dashed where there were no weigh-ins for over a week.`,
    gapCaption: 'No weigh-ins for over a week',
  },
  hu: {
    empty: 'Ebben az időszakban nincs mérés.',
    single: (kg: string, date: string) => `Testsúly: ${kg} kg, ${date}`,
    range: (
      fromKg: string,
      fromDate: string,
      toKg: string,
      toDate: string,
      count: number,
    ) =>
      `Testsúly ${fromDate} és ${toDate} között: ${fromKg} kg-ról ${toKg} kg-ra, ${count} mérés`,
    withGaps: (label: string) =>
      `${label}. Szaggatott vonal jelzi, ahol több mint egy hétig nem volt mérés.`,
    gapCaption: 'Több mint egy hétig nem volt mérés',
  },
})
