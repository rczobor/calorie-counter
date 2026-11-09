import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    weight: 'Weight',
    notRecorded: 'Not recorded',
    privateTo: (name: string) => `Private to ${name}`,
    record: 'Record',
    recordLabel: (name: string, date: string) =>
      `Record ${name}’s weight for ${date}`,
  },
  hu: {
    weight: 'Testsúly',
    notRecorded: 'Nincs rögzítve',
    privateTo: (name: string) => `Csak ${name} látja`,
    record: 'Rögzítés',
    // Starts with the visible label, so voice control finds the button.
    recordLabel: (name: string, date: string) =>
      `Rögzítés: testsúly · ${name} · ${date}`,
  },
})
