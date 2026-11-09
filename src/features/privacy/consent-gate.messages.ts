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
        rich(
          key('Only you and the people in your households'),
          ' see your data.',
        ),
      statistics: (key: Key) =>
        rich(
          'Usage statistics show whether people log, ',
          key('never what they eat'),
          '.',
        ),
      delete: (key: Key) =>
        rich(
          'You can ',
          key('delete your account and data'),
          ' at any time in Settings.',
        ),
    },
    readNotice: 'Privacy notice',
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
        rich(key('Csak te és a háztartásaid tagjai'), ' látják az adataidat.'),
      statistics: (key: Key) =>
        rich(
          'A használati statisztikák azt mutatják, hogy rögzítenek-e az emberek, ',
          key('azt soha, hogy mit esznek'),
          '.',
        ),
      delete: (key: Key) =>
        rich(
          'A Beállításokban bármikor ',
          key('törölheted a fiókodat és az adataidat'),
          '.',
        ),
    },
    readNotice: 'Adatvédelmi tájékoztató',
    statement:
      'Hozzájárulok, hogy a Calorie Counter az adatvédelmi tájékoztatóban leírtak szerint kezelje az egészségügyi adataimat.',
    agree: 'Elfogadom és folytatom',
    saving: 'Mentés…',
    signOut: 'Kijelentkezés',
    decline: 'Nem szeretnéd elfogadni? Helyette törölheted a fiókodat.',
  },
})
