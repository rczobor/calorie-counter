import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    gotIt: 'Got it',
    hints: {
      assistant: {
        title: 'Log by chatting',
        body: 'Tell ChatGPT or Claude what you ate, and it logs the meal here. Cooking too.',
        action: 'Set up an assistant',
      },
      history: {
        title: 'Your recent weeks',
        body: 'History shows each day against its goal, with your daily average.',
        action: 'Open History',
      },
      weighIn: {
        title: 'Find your real maintenance',
        body: 'Weigh in a few mornings a week. After two weeks the app measures what you actually burn.',
        action: 'Open Weight',
      },
      maintenance: {
        title: 'Maintenance measured',
        body: 'Your logs and weigh-ins now show what you actually burn. Check that your goal still fits.',
        action: 'Open Weight',
      },
      invite: {
        title: 'Let others log for themselves',
        body: 'Invite someone you track, so they can log their own meals.',
        action: 'Invite someone',
      },
      widget: {
        title: 'Calories left, at a glance',
        body: 'A Home Screen widget shows what’s left today without opening the app.',
        action: 'Set up a widget',
      },
    },
    tips: {
      title: 'Tips',
      intro:
        'Features that are easy to miss. Each tip also shows once on Today, when it’s useful.',
    },
  },
  hu: {
    gotIt: 'Értem',
    hints: {
      assistant: {
        title: 'Rögzítés csevegve',
        body: 'Írd meg a ChatGPT-nek vagy a Claude-nak, mit ettél, és rögzíti itt az étkezést. A főzést is.',
        action: 'Asszisztens beállítása',
      },
      history: {
        title: 'Az elmúlt hetek',
        body: 'Az Előzményekben minden nap a napi célja mellett látszik, a napi átlagoddal együtt.',
        action: 'Előzmények',
      },
      weighIn: {
        title: 'A valódi fenntartó kalóriád',
        body: 'Mérd meg magad hetente néhány reggel. Két hét után az app kiszámolja, mennyit égetsz valójában.',
        action: 'Testsúly',
      },
      maintenance: {
        title: 'Megvan a fenntartó kalóriád',
        body: 'A rögzítéseid és méréseid alapján már látszik, mennyit égetsz valójában. Nézd meg, illik-e még hozzá a napi célod.',
        action: 'Testsúly',
      },
      invite: {
        title: 'Rögzítsenek mások is',
        body: 'Hívd meg, akinek a kalóriáit követed, hogy a saját étkezéseit maga rögzíthesse.',
        action: 'Meghívó küldése',
      },
      widget: {
        title: 'A maradék kalória egy pillantással',
        body: 'Egy kezdőképernyő-widget az app megnyitása nélkül mutatja, mennyi maradt mára.',
        action: 'Widget beállítása',
      },
    },
    tips: {
      title: 'Tippek',
      intro:
        'Könnyen észrevétlen funkciók. Mindegyik tipp egyszer a Ma oldalon is megjelenik, amikor hasznos.',
    },
  },
})
