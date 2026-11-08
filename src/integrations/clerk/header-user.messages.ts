import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    mockSession: 'Mock test session',
    authSetup: 'Add `VITE_CLERK_PUBLISHABLE_KEY` to enable auth.',
  },
  hu: {
    mockSession: 'Szimulált tesztmunkamenet',
    authSetup:
      'A bejelentkezéshez add hozzá a `VITE_CLERK_PUBLISHABLE_KEY` értéket.',
  },
})
