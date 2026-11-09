import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    maintenanceTitle: 'Scheduled maintenance',
    maintenanceDescription:
      'Calorie Counter is temporarily unavailable while its data is being upgraded. Please check back shortly.',
    authSetupTitle: 'Authentication setup required',
    authSetupDescription:
      'Add `VITE_CLERK_PUBLISHABLE_KEY` to your project `.env.local` to sign in and access data.',
    dataSetupTitle: 'Data setup required',
    dataSetupDescription:
      'Add `VITE_CONVEX_URL` and `CONVEX_DEPLOYMENT` to your project `.env.local` to connect authenticated sessions to data.',
    signInTitle: 'Sign in required',
    signInDescription: 'You must be signed in to view or manage calorie data.',
    signIn: 'Sign in to continue',
    sessionFailedTitle: 'Session verification failed',
    sessionFailedDescription:
      'Sign out and sign in again. If this persists, create a Clerk JWT template named `convex` (audience `convex`), verify CLERK_JWT_ISSUER_DOMAIN, then restart `pnpm exec convex dev`.',
    preparingSession: 'Preparing your session',
    privacyNotice: 'Privacy notice',
  },
  hu: {
    maintenanceTitle: 'Tervezett karbantartás',
    maintenanceDescription:
      'A Calorie Counter átmenetileg nem érhető el, amíg frissítjük az adatait. Nézz vissza hamarosan.',
    authSetupTitle: 'Be kell állítani a hitelesítést',
    authSetupDescription:
      'A bejelentkezéshez és az adatok eléréséhez add hozzá a `VITE_CLERK_PUBLISHABLE_KEY` értéket a projekt `.env.local` fájljához.',
    dataSetupTitle: 'Be kell állítani az adatkapcsolatot',
    dataSetupDescription:
      'Add hozzá a `VITE_CONVEX_URL` és a `CONVEX_DEPLOYMENT` értéket a projekt `.env.local` fájljához, hogy a bejelentkezett munkamenetek elérjék az adatokat.',
    signInTitle: 'Jelentkezz be',
    signInDescription:
      'A kalóriaadatok megtekintéséhez és kezeléséhez be kell jelentkezned.',
    signIn: 'Bejelentkezés',
    sessionFailedTitle: 'Nem sikerült ellenőrizni a munkamenetet',
    sessionFailedDescription:
      'Jelentkezz ki, majd be újra. Ha a hiba továbbra is fennáll, hozz létre egy `convex` nevű Clerk JWT-sablont (audience: `convex`), ellenőrizd a CLERK_JWT_ISSUER_DOMAIN értékét, majd indítsd újra a `pnpm exec convex dev` parancsot.',
    preparingSession: 'Munkamenet előkészítése',
    privacyNotice: 'Adatvédelmi tájékoztató',
  },
})
