import type { ReactNode } from 'react'
import { defineMessages, rich } from '@/i18n/messages'

// Each promise names its key phrase, which the screen sets in semibold.
type Key = (text: string) => ReactNode

export const messages = defineMessages({
  en: {
    checking: 'Checking your privacy settings',
    title: 'Before you continue',
    body: 'Calorie Counter stores what you eat, your body weight and your goals. This is health data, so the app needs your explicit consent to process it.',
    points: {
      who: (key: Key) =>
        rich(key('Only you and your households'), ' see your data.'),
      statistics: (key: Key) =>
        rich(
          'Usage statistics show whether people log, ',
          key('never what they eat'),
          '.',
        ),
      delete: (key: Key) =>
        rich('You can ', key('delete your account and data'), ' at any time.'),
    },
    pointsTitle: 'Your data',
    readNotice: 'Privacy notice',
    noticeUpdated: (date: string) => `Updated ${date}`,
    statement:
      'I consent to Calorie Counter processing my health data as described in the privacy notice.',
    agree: 'Agree and continue',
    saving: 'Saving…',
    signOut: 'Sign out',
    decline: 'Don’t want to agree? You can delete your account instead.',
  },
  hu: {
    checking: 'Adatvédelmi beállítások ellenőrzése',
    title: 'Mielőtt folytatod',
    body: 'A Calorie Counter tárolja, mit eszel, a testsúlyodat és a céljaidat. Ezek egészségügyi adatok, ezért a kezelésükhöz a kifejezett hozzájárulásodra van szükség.',
    points: {
      who: (key: Key) =>
        rich(key('Csak te és a háztartásaid'), ' látják az adataidat.'),
      statistics: (key: Key) =>
        rich(
          'A használati statisztikák azt mutatják, hogy rögzítenek-e az emberek, ',
          key('azt soha, hogy mit esznek'),
          '.',
        ),
      delete: (key: Key) =>
        rich(key('Törölheted'), ' a fiókodat és az adataidat bármikor.'),
    },
    pointsTitle: 'Az adataid',
    readNotice: 'Adatvédelmi tájékoztató',
    noticeUpdated: (date: string) => `Frissítve: ${date}`,
    statement:
      'Hozzájárulok, hogy a Calorie Counter az adatvédelmi tájékoztatóban leírtak szerint kezelje az egészségügyi adataimat.',
    agree: 'Elfogadom és folytatom',
    saving: 'Mentés…',
    signOut: 'Kijelentkezés',
    decline: 'Nem szeretnéd elfogadni? Helyette törölheted a fiókodat.',
  },
})
