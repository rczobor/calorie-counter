import { defineMessages } from '@/i18n/messages'

// One sentence each; the action is a verb that says where it goes.
export const messages = defineMessages({
  en: {
    gotIt: 'Got it',
    hints: {
      assistant: {
        title: 'Log by chatting',
        body: 'Tell ChatGPT or Claude what you ate or cooked, and it logs it here.',
        action: 'Set up an assistant',
      },
      history: {
        title: 'Your recent weeks',
        body: 'History shows each day against its goal, with your daily average.',
        action: 'Open History',
      },
      weighIn: {
        title: 'Find your real maintenance',
        body: 'Weigh in a few mornings a week, and after two weeks the app measures what you burn.',
        action: 'Record a weigh-in',
      },
      maintenance: {
        title: 'Your maintenance is ready',
        body: 'Your logs and weigh-ins now show what you burn, so check your goal still fits.',
        action: 'See maintenance',
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
      group: 'Easy to miss',
      footer: 'Each tip also shows once on Today, when it’s useful.',
    },
  },
  hu: {
    gotIt: 'Értem',
    hints: {
      assistant: {
        title: 'Rögzítés csevegve',
        body: 'Írd meg a ChatGPT-nek vagy a Claude-nak, mit ettél vagy főztél, és itt rögzíti.',
        action: 'Asszisztens beállítása',
      },
      history: {
        title: 'Az elmúlt hetek',
        body: 'Az Előzményekben minden nap a napi célja mellett látszik, a napi átlagoddal együtt.',
        action: 'Előzmények megnyitása',
      },
      weighIn: {
        title: 'A valódi fenntartó kalóriád',
        body: 'Mérd meg magad hetente néhány reggel, és két hét után az app kiszámolja, mennyit égetsz.',
        action: 'Mérés rögzítése',
      },
      maintenance: {
        title: 'Megvan a fenntartó kalóriád',
        body: 'A rögzítéseidből és méréseidből már látszik, mennyit égetsz, ezért nézd meg, illik-e még a napi célod.',
        action: 'Fenntartó kalória megtekintése',
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
      group: 'Könnyen elsiklik',
      footer:
        'Mindegyik tipp egyszer a Ma oldalon is megjelenik, amikor hasznos.',
    },
  },
})
