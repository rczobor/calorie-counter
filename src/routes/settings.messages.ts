import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    title: 'Settings',
    account: 'Account',
    signedIn: 'Signed in',
    setup: 'Setup',
    people: 'People & goals',
    weight: 'Weight',
    assistants: 'AI assistants',
    household: 'Household',
    dataMaintenance: 'Data maintenance',
    archivedMeals: 'Archived meals',
    foodLibrary: 'Food library',
    cooking: 'Cooking',
    admin: 'Admin',
    usage: 'Usage',
    diagnostics: 'Diagnostics',
    recentStarts: 'Recent app starts',
    recentStartsHint:
      'Time from launch until each step finished on this device.',
    timings: (steps: {
      page: string
      app: string
      signIn: string
      data: string
    }) =>
      `Page ${steps.page} · App ${steps.app} · Sign-in ${steps.signIn} · Data ${steps.data} · `,
    homeScreenApp: 'Home Screen app',
    browser: 'Browser',
    cachedFiles: ' · Cached files',
  },
  hu: {
    title: 'Beállítások',
    account: 'Fiók',
    signedIn: 'Bejelentkezve',
    setup: 'Általános',
    people: 'Személyek és célok',
    weight: 'Testsúly',
    assistants: 'AI-asszisztensek',
    household: 'Háztartás',
    dataMaintenance: 'Adatkezelés',
    archivedMeals: 'Archivált étkezések',
    foodLibrary: 'Ételtár',
    cooking: 'Főzés',
    admin: 'Adminisztráció',
    usage: 'Használat',
    diagnostics: 'Diagnosztika',
    recentStarts: 'Legutóbbi indítások',
    recentStartsHint:
      'Az indítástól az egyes lépések befejezéséig eltelt idő ezen az eszközön.',
    timings: (steps: {
      page: string
      app: string
      signIn: string
      data: string
    }) =>
      `Oldal ${steps.page} · Alkalmazás ${steps.app} · Bejelentkezés ${steps.signIn} · Adatok ${steps.data} · `,
    homeScreenApp: 'Kezdőképernyős alkalmazás',
    browser: 'Böngésző',
    cachedFiles: ' · Gyorsítótárazott fájlok',
  },
})
