import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    action: 'Delete account',
    title: 'Delete your account?',
    // One fact per line: what goes, what else goes, what stays, then the warning.
    description: {
      lead: 'This permanently deletes your account, your sign-in and your AI assistant connections.',
      solo: 'Every household only you belong to goes too, with all its people, meals, weights, goals, foods and recipes.',
      shared: 'Households you share keep their data for the other members.',
      note: 'You may be asked to confirm it’s you. This can’t be undone.',
    },
    deleting: 'Deleting…',
    deleted: 'Your account was deleted.',
    signInKept: (email: string) =>
      `Your data was deleted, but your sign-in could not be removed. Write to ${email} to remove it.`,
  },
  hu: {
    action: 'Fiók törlése',
    title: 'Törlöd a fiókodat?',
    description: {
      lead: 'Ezzel véglegesen törlöd a fiókodat, a bejelentkezésedet és az AI-asszisztens-kapcsolataidat.',
      solo: 'Minden olyan háztartás is törlődik, amelynek csak te vagy a tagja, az összes személlyel, étkezéssel, testsúllyal, céllal, étellel és recepttel együtt.',
      shared: 'A közös háztartások adatai a többi tagnál maradnak.',
      note: 'Előfordulhat, hogy újra igazolnod kell magad. Ez nem vonható vissza.',
    },
    deleting: 'Törlés…',
    deleted: 'A fiókodat töröltük.',
    signInKept: (email: string) =>
      `Az adataidat töröltük, de a bejelentkezésedet nem sikerült eltávolítani. Az eltávolításához írj erre a címre: ${email}`,
  },
})
