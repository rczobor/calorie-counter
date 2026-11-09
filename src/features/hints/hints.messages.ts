import { defineMessages } from '@/i18n/messages'

// One sentence each; the action is a verb that says where it goes.
export const messages = defineMessages({
  en: {
    gotIt: 'Got it',
    quoted: (text: string) => `“${text}”`,
    tryAsking: 'Try asking',
    copy: 'Copy',
    copiedLabel: 'Copied',
    copied: 'Copied. Paste it into your assistant.',
    copyFailed: 'Couldn’t copy. Select the text instead.',
    examples: {
      cooking:
        'I cooked chili with 500\u00a0g beef, 400\u00a0g beans and 300\u00a0g onion. The pot weighs 1.8\u00a0kg. Save it as a cooked food.',
      savedFood: 'Save my usual oat milk latte as a reusable food.',
      template: 'Save the breakfast I just logged as a meal template.',
    },
    hints: {
      assistant: {
        title: 'Log by chatting',
        body: 'Tell ChatGPT or Claude what you ate or cooked, and it does the logging for you.',
        action: 'Set up an assistant',
      },
      history: {
        title: 'Your recent weeks',
        body: 'History shows each day against its goal, with your daily average.',
        action: 'Open History',
      },
      weighIn: {
        title: 'Learn what you really burn',
        body: 'Weigh in a few mornings a week, and after two weeks the app measures it.',
        action: 'Record a weigh-in',
      },
      maintenance: {
        title: 'Your maintenance is ready',
        body: 'Your logs and weigh-ins now show what you really burn.',
        action: 'See your maintenance',
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
      footer: 'Each tip shows once on Today when it’s useful.',
    },
  },
  hu: {
    gotIt: 'Értem',
    quoted: (text: string) => `„${text}”`,
    tryAsking: 'Kérd például így',
    copy: 'Másolás',
    copiedLabel: 'Kimásolva',
    copied: 'Kimásolva. Illeszd be az asszisztensednek.',
    copyFailed: 'Nem sikerült másolni. Jelöld ki a szöveget.',
    examples: {
      cooking:
        'Főztem chilit 500\u00a0g marhával, 400\u00a0g babbal és 300\u00a0g hagymával. A kész étel 1,8\u00a0kg. Mentsd el főtt ételként.',
      savedFood: 'Mentsd el a szokásos zabtejes lattémat mentett ételként.',
      template: 'Mentsd el az imént rögzített reggelimet étkezéssablonként.',
    },
    hints: {
      assistant: {
        title: 'Rögzítés csevegve',
        body: 'Írd meg a ChatGPT-nek vagy a Claude-nak, mit ettél vagy főztél, és elvégzi helyetted a rögzítést.',
        action: 'Asszisztens beállítása',
      },
      history: {
        title: 'Az elmúlt hetek',
        body: 'Az Előzményekben minden nap a napi célja mellett látszik, a napi átlagoddal együtt.',
        action: 'Előzmények megnyitása',
      },
      weighIn: {
        title: 'Tudd meg, mennyit égetsz',
        body: 'Mérd meg magad hetente pár reggel, és két hét után az app kiszámolja.',
        action: 'Testsúly rögzítése',
      },
      maintenance: {
        title: 'Megvan a fenntartó kalóriád',
        body: 'A rögzítéseidből és méréseidből már látszik, mennyit égetsz valójában.',
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
      footer: 'Minden tipp egyszer a Ma oldalon is megjelenik, amikor hasznos.',
    },
  },
})
