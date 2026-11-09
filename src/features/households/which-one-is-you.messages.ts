import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    whichIsYou: 'Which one is you?',
    hint: 'Linking tells the app which person is you.',
    // An answer, not the bare name a row beside it already shows.
    imName: (name: string) => `I’m ${name}`,
    noneOfThese: 'None of these',
    linked: (name: string) => `Linked ${name} to your account.`,
    hidden: 'Hidden. Link yourself any time in People & goals.',
    undo: 'Undo',
  },
  hu: {
    whichIsYou: 'Melyik vagy te?',
    hint: 'Így tudja az app, melyik személy vagy te.',
    imName: (name: string) => `${name} vagyok`,
    noneOfThese: 'Egyik sem',
    linked: (name: string) => `A fiókodhoz kapcsolva: ${name}.`,
    hidden:
      'Elrejtve. A Személyek és célok oldalon bármikor kapcsolhatod magad.',
    undo: 'Visszavonás',
  },
})
