import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    title: 'Home Screen widget',
    intro:
      'See how many calories are left today without opening the app. Set it up on your iPhone, with the free Scriptable app.',
    widgets: 'Widgets',
    created: (date: string) => `Created ${date}`,
    remove: 'Remove',
    removeTitle: (person: string) => `Remove the widget for ${person}?`,
    removeDescription:
      'The widget stops updating. Meals and goals stay as they are.',
    addTitle: 'New widget',
    selectPerson: 'Select a person',
    loadMorePeople: 'Load more people',
    create: 'Create widget',
    creating: 'Creating…',
    setupTitle: (person: string) => `Widget for ${person}`,
    previewLabel: (person: string) =>
      `Widget preview: ${person}’s calories left today`,
    previewDescription:
      'Calories left today, on your Home Screen. It updates about every 15 minutes.',
    openScriptable: 'Open Scriptable',
    scriptLabel: 'Widget script',
    showScript: 'Show script',
    secretTitle: 'Private key, shown once.',
    secretBody: (person: string) =>
      `The script lets anyone who has it see ${person}’s calories. Copy it now: it won’t be shown again.`,
    copy: 'Copy script',
    copyAgain: 'Copy again',
    copiedTitle: 'Copied. Keep it private.',
    copiedBody: (person: string) =>
      `Anyone who has the script can see ${person}’s calories.`,
    done: 'Done',
    addHint:
      'Create it on the iPhone that will show it. You’ll see its script only once. Each widget shows one person.',
    stepInstallBefore: 'If you don’t have it yet, install ',
    stepInstallAfter: ' from the App Store.',
    groupHere: 'Here',
    groupScriptable: 'In Scriptable',
    groupHomeScreen: 'On your Home Screen',
    // [Brackets] mark the controls to tap; they render as key tokens.
    stepPaste:
      'Open a new script with the button below (or tap [+] in Scriptable), paste the script and name it Calories.',
    stepAdd:
      'Long-press an empty spot, tap [Edit], then [Add Widget]. Choose Scriptable, pick a size and tap [Add Widget].',
    stepEdit:
      'Long-press the new widget, tap [Edit Widget] and choose Calories as its [Script].',
    unconfigured: 'No script chosen',
    unconfiguredLabel: 'A widget with no script chosen yet',
    afterStep: (step: number) => `After step ${step}`,
    closeTitle: 'Close without copying?',
    closeDescription:
      'The script won’t be shown again. You can remove this widget and create a new one.',
    closeConfirm: 'Close',
    script: {
      left: 'kcal left',
      over: 'kcal over',
      goal: 'Daily goal: {goal} kcal',
      failed: 'Couldn’t load today’s calories.',
    },
  },
  hu: {
    title: 'Kezdőképernyő-widget',
    intro:
      'Az alkalmazás megnyitása nélkül is láthatod, mennyi kalória maradt mára. Az iPhone-odon állítsd be, az ingyenes Scriptable alkalmazással.',
    widgets: 'Widgetek',
    created: (date: string) => `Létrehozva: ${date}`,
    remove: 'Eltávolítás',
    removeTitle: (person: string) => `Eltávolítod ezt a widgetet: ${person}?`,
    removeDescription:
      'A widget nem frissül tovább. Az étkezések és a célok megmaradnak.',
    addTitle: 'Új widget',
    selectPerson: 'Válassz egy személyt',
    loadMorePeople: 'További személyek betöltése',
    create: 'Widget létrehozása',
    creating: 'Létrehozás…',
    setupTitle: (person: string) => `Widget · ${person}`,
    previewLabel: (person: string) =>
      `Widget előnézete · ${person}: mára maradt kalória`,
    previewDescription:
      'A mára maradt kalória a kezdőképernyőn. Nagyjából 15 percenként frissül.',
    openScriptable: 'Scriptable megnyitása',
    scriptLabel: 'Widget-szkript',
    showScript: 'Szkript megjelenítése',
    secretTitle: 'Privát kulcs, csak most látod.',
    secretBody: (person: string) =>
      `A szkripttel bárki láthatja ${person} kalóriabevitelét. Most másold ki: később nem jelenik meg újra.`,
    copy: 'Szkript másolása',
    copyAgain: 'Másolás újra',
    copiedTitle: 'Kimásolva. Tartsd titokban.',
    copiedBody: (person: string) =>
      `A szkripttel bárki láthatja ${person} kalóriabevitelét.`,
    done: 'Kész',
    addHint:
      'Azon az iPhone-on hozd létre, amelyen használni fogod. A szkriptjét csak egyszer látod. Egy widget egy személyt mutat.',
    stepInstallBefore: 'Ha még nincs meg, telepítsd a ',
    // A non-breaking space and hyphen keep “App Store-ból” on one line.
    stepInstallAfter: ' alkalmazást az App Store‑ból.',
    groupHere: 'Itt',
    groupScriptable: 'A Scriptable-ben',
    groupHomeScreen: 'A kezdőképernyőn',
    // A [szögletes zárójel] a megérintendő vezérlőt jelöli.
    stepPaste:
      'Nyiss egy új szkriptet a lenti gombbal (vagy a Scriptable-ben a [+] gombbal), illeszd be a szkriptet, és nevezd el így: Kalória.',
    stepAdd:
      'Tartsd lenyomva egy üres helyet, koppints a [Szerkesztés], majd a [Widget hozzáadása] lehetőségre. Válaszd a Scriptable-t, válassz méretet, és koppints a [Widget hozzáadása] gombra.',
    stepEdit:
      'Tartsd lenyomva az új widgetet, koppints a [Widget szerkesztése] lehetőségre, és a [Script] mezőben válaszd a Kalória szkriptet.',
    unconfigured: 'Nincs kiválasztott szkript',
    unconfiguredLabel: 'Widget még kiválasztott szkript nélkül',
    afterStep: (step: number) => `${step}. lépés után`,
    closeTitle: 'Bezárod másolás nélkül?',
    closeDescription:
      'A szkript nem jelenik meg újra. Eltávolíthatod ezt a widgetet, és létrehozhatsz egy újat.',
    closeConfirm: 'Bezárás',
    script: {
      left: 'kcal maradt',
      over: 'kcal túllépés',
      goal: 'Napi cél: {goal} kcal',
      failed: 'Nem sikerült betölteni a mai kalóriákat.',
    },
  },
})
