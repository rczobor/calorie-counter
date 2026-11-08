import type { ReactNode } from 'react'
import { defineMessages, rich } from '@/i18n/messages'

// Browser and system labels are rendered bold, and each language places them.
type Strong = (label: string) => ReactNode

export const messages = defineMessages({
  en: {
    addToDevice: 'Add to your device',
    suggestionLabel: 'Add Calorie Counter to your device',
    suggestionTitle: 'Keep Calorie Counter handy',
    suggestionDescription:
      'Add it to your home screen for quicker meal logging.',
    opening: 'Opening installation…',
    install: 'Install app',
    showHow: 'Show me how',
    dismiss: 'Dismiss',
    helpDescription: 'Open Calorie Counter like an app next time.',
    closeHelp: 'Close installation steps',
    promptFailed:
      'The install dialog couldn’t open. Try these browser steps instead.',
    iosOpenSafari: (b: Strong) => rich('Open this page in ', b('Safari'), '.'),
    iosShare: (b: Strong, icon: ReactNode) =>
      rich('Tap ', icon, b('Share'), ' in the browser menu or toolbar.'),
    iosAddToHomeScreen: (b: Strong, icon: ReactNode) =>
      rich('Scroll down and tap ', icon, b('Add to Home Screen'), '.'),
    iosWebApp: (b: Strong) =>
      rich(
        'If shown, turn on ',
        b('Open as Web App'),
        ', then tap ',
        b('Add'),
        '.',
      ),
    safariDock: (b: Strong) =>
      rich(
        'In Safari, choose ',
        b('File → Add to Dock'),
        ', then click ',
        b('Add'),
        '. If that option is missing, try Chrome or Edge.',
      ),
    androidMenu: (b: Strong) =>
      rich(
        'Open your browser’s menu and look for ',
        b('Install app'),
        ' or ',
        b('Add to Home Screen'),
        '.',
      ),
    browserMenu: (b: Strong) =>
      rich(
        'Open your browser’s menu and look for ',
        b('Install app'),
        ' or an option to install this page as an app.',
      ),
    addressBar: 'You may also see an install icon in the address bar.',
    fallback:
      'If no installation option appears, try opening this page in Chrome or Edge. You can keep using Calorie Counter in your browser.',
    done: 'Done',
  },
  hu: {
    addToDevice: 'Hozzáadás az eszközhöz',
    suggestionLabel: 'A Calorie Counter hozzáadása az eszközhöz',
    suggestionTitle: 'Legyen kéznél a Calorie Counter',
    suggestionDescription:
      'Add hozzá a kezdőképernyődhöz, hogy gyorsabban rögzíthesd az étkezéseidet.',
    opening: 'Telepítés indítása…',
    install: 'Telepítés',
    showHow: 'Mutasd, hogyan',
    dismiss: 'Elrejtés',
    helpDescription:
      'Így legközelebb alkalmazásként nyílik meg a Calorie Counter.',
    closeHelp: 'Telepítési lépések bezárása',
    promptFailed:
      'Nem sikerült megnyitni a telepítési ablakot. Kövesd inkább az alábbi lépéseket a böngészőben.',
    iosOpenSafari: (b: Strong) =>
      rich('Nyisd meg ezt az oldalt a ', b('Safari'), ' böngészőben.'),
    iosShare: (b: Strong, icon: ReactNode) =>
      rich(
        'Koppints a böngésző menüjében vagy eszköztárán a ',
        icon,
        b('Megosztás'),
        ' gombra.',
      ),
    iosAddToHomeScreen: (b: Strong, icon: ReactNode) =>
      rich(
        'Görgess le, és koppints a ',
        icon,
        b('Főképernyőhöz adás'),
        ' lehetőségre.',
      ),
    iosWebApp: (b: Strong) =>
      rich(
        'Ha megjelenik, kapcsold be a ',
        b('Megnyitás webappként'),
        ' beállítást, majd koppints a ',
        b('Hozzáadás'),
        ' gombra.',
      ),
    safariDock: (b: Strong) =>
      rich(
        'A Safariban válaszd a ',
        b('Fájl → Hozzáadás a Dockhoz'),
        ' menüpontot, majd kattints a ',
        b('Hozzáadás'),
        ' gombra. Ha nincs ilyen menüpont, próbáld meg Chrome vagy Edge böngészőben.',
      ),
    androidMenu: (b: Strong) =>
      rich(
        'Nyisd meg a böngésző menüjét, és keresd az ',
        b('Alkalmazás telepítése'),
        ' vagy a ',
        b('Hozzáadás a kezdőképernyőhöz'),
        ' lehetőséget.',
      ),
    browserMenu: (b: Strong) =>
      rich(
        'Nyisd meg a böngésző menüjét, és keresd az ',
        b('Alkalmazás telepítése'),
        ' lehetőséget, vagy egy olyat, amellyel alkalmazásként telepítheted ezt az oldalt.',
      ),
    addressBar: 'A címsorban telepítési ikon is megjelenhet.',
    fallback:
      'Ha nem látsz telepítési lehetőséget, nyisd meg ezt az oldalt Chrome vagy Edge böngészőben. A Calorie Counter a böngészőben is ugyanúgy használható.',
    done: 'Kész',
  },
})
