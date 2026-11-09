import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    checking: 'Checking your privacy settings',
    title: 'Before you start',
    body: 'Calorie Counter stores what you eat, your body weight and your goals. This is health data, so the app needs your explicit consent to process it.',
    points: [
      'Only you and the people in your households see it.',
      'Usage statistics show whether people log, never what they eat.',
      'You can delete your account and data at any time in Settings.',
    ],
    readNotice: 'Read the privacy notice',
    statement:
      'I consent to Calorie Counter processing my health data as described in the privacy notice.',
    agree: 'Agree and continue',
    saving: 'Saving…',
    signOut: 'Sign out',
  },
  hu: {
    checking: 'Adatvédelmi beállítások ellenőrzése',
    title: 'Mielőtt elkezded',
    body: 'A Calorie Counter tárolja, mit eszel, a testsúlyodat és a céljaidat. Ezek egészségügyi adatok, ezért a kezelésükhöz a kifejezett hozzájárulásodra van szükség.',
    points: [
      'Csak te és a háztartásaid tagjai látják őket.',
      'A használati statisztikák azt mutatják, hogy rögzítenek-e az emberek, azt soha, hogy mit esznek.',
      'A fiókodat és az adataidat bármikor törölheted a Beállításokban.',
    ],
    readNotice: 'Az adatvédelmi tájékoztató elolvasása',
    statement:
      'Hozzájárulok, hogy a Calorie Counter az adatvédelmi tájékoztatóban leírtak szerint kezelje az egészségügyi adataimat.',
    agree: 'Elfogadom és folytatom',
    saving: 'Mentés…',
    signOut: 'Kijelentkezés',
  },
})
