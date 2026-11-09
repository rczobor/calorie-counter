import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    action: 'Delete account',
    title: 'Delete your account?',
    description:
      'This permanently deletes your account, your AI assistant connections, and every household only you belong to, with all its people, meals, weights, goals, foods and recipes. Households you share keep their data for the other members. You may be asked to confirm it’s you. This can’t be undone.',
    deleting: 'Deleting…',
    deleted: 'Your account was deleted.',
    signInKept: (email: string) =>
      `Your data was deleted, but your sign-in could not be removed. Write to ${email} to remove it.`,
  },
  hu: {
    action: 'Fiók törlése',
    title: 'Törlöd a fiókodat?',
    description:
      'Ezzel véglegesen törlöd a fiókodat, az AI-asszisztens-kapcsolataidat és minden olyan háztartást, amelynek csak te vagy a tagja, az összes személlyel, étkezéssel, testsúllyal, céllal, étellel és recepttel együtt. A közös háztartások adatai a többi tagnál maradnak. Előfordulhat, hogy újra igazolnod kell magad. Ez nem vonható vissza.',
    deleting: 'Törlés…',
    deleted: 'A fiókodat töröltük.',
    signInKept: (email: string) =>
      `Az adataidat töröltük, de a bejelentkezésedet nem sikerült eltávolítani. Az eltávolításához írj erre a címre: ${email}`,
  },
})
