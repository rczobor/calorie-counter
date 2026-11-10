import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    invalidWeight: 'Enter a weight in kilograms, like 82.4.',
    outOfRange: (min: number, max: number) =>
      `Weight must be between ${min} and ${max} kg.`,
    editTitle: 'Edit weight',
    recordTitle: 'Record weight',
    close: 'Close',
    updated: 'Weight updated.',
    saved: 'Weight saved.',
    deleted: 'Weight deleted.',
    date: 'Date',
    dateLabel: 'Weight date',
    replacesExisting: (kg: string) =>
      `Replaces the ${kg}\u00a0kg already recorded for this day.`,
    weight: 'Weight',
    delete: 'Delete',
    save: 'Save weight',
    confirmTitle: 'Delete this weight?',
    confirmDescription: (kg: string, date: string) =>
      `${kg} kg on ${date} will be removed.`,
  },
  hu: {
    invalidWeight: 'Add meg a testsúlyt kilogrammban, például 82,4.',
    outOfRange: (min: number, max: number) =>
      `A testsúly ${min} és ${max} kg között lehet.`,
    editTitle: 'Testsúly szerkesztése',
    recordTitle: 'Testsúly rögzítése',
    close: 'Bezárás',
    updated: 'Testsúly frissítve.',
    saved: 'Testsúly mentve.',
    deleted: 'Testsúly törölve.',
    date: 'Dátum',
    dateLabel: 'Mérés dátuma',
    replacesExisting: (kg: string) => `Felülírja a napi mérést: ${kg}\u00a0kg.`,
    weight: 'Testsúly',
    delete: 'Törlés',
    save: 'Mentés',
    confirmTitle: 'Törlöd ezt a mérést?',
    // In parentheses, so a date ending in a period ("nov. 8.") never doubles it.
    confirmDescription: (kg: string, date: string) =>
      `Ez a mérés törlődik: ${kg} kg (${date}).`,
  },
})
