import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    scopes: {
      nutritionRead: 'Read nutrition',
      mealsWrite: 'Log meals',
      cookingWrite: 'Record cooking',
    },
    title: 'AI assistants',
    intro: 'Log meals and cooking by chatting with ChatGPT or Claude.',
    connections: 'Connections',
    loadingConnections: 'Loading connected agents',
    noConnections: 'No assistants connected.',
    disconnecting: 'Disconnecting…',
    disconnect: 'Disconnect',
    setup: 'Connection setup',
    loadingSetup: 'Loading integration settings',
    disabled:
      'AI assistant connections have not been enabled for this deployment.',
    serverUrl: 'MCP server URL',
    assistant: 'Assistant',
    chatgptSteps: [
      'In ChatGPT Plugins, choose Add custom MCP server.',
      'Paste this URL and select OAuth authentication.',
      'Choose permissions, sign in to Calorie Counter, and review the connection request.',
      'Enable the integration in a conversation and describe your meal or cooking.',
    ],
    chatgptNote:
      'Availability depends on your ChatGPT account and workspace settings. To connect with read-only access, request only nutrition:read. Recording meals or cooking also requires its write permission.',
    claudeSteps: [
      'In Claude, open Customize, then Connectors, and choose Add custom connector.',
      'Paste this URL, keep the default sign-in settings, and add the connector.',
      'Select Connect, sign in to Calorie Counter, and review the connection request.',
      'In a conversation, turn the connector on from the + menu under Connectors, then describe your meal or cooking.',
    ],
    claudeNote:
      'On Team and Enterprise plans, an organization Owner first adds the connector in Organization settings, then Connectors. Each member then connects it from Customize, then Connectors.',
    dataSharing:
      'Food names, portions, and nutrition data returned by the tools are shared with the assistant you connect. Review estimates and portions before saving or correcting a meal. Use Calorie Counter to replace or remove foods.',
    disconnectTitle: (name?: string) => `Disconnect ${name ?? 'connection'}?`,
    disconnectDescription:
      'This connection will lose access. Recorded meals and cooking will remain.',
  },
  hu: {
    scopes: {
      nutritionRead: 'Táplálkozási adatok olvasása',
      mealsWrite: 'Étkezések rögzítése',
      cookingWrite: 'Főzések rögzítése',
    },
    title: 'AI-asszisztensek',
    intro:
      'Étkezéseidet és főzéseidet a ChatGPT-vel vagy a Claude-dal csevegve is rögzítheted.',
    connections: 'Kapcsolatok',
    loadingConnections: 'Csatlakoztatott asszisztensek betöltése',
    noConnections: 'Nincs csatlakoztatott asszisztens.',
    disconnecting: 'Leválasztás…',
    disconnect: 'Leválasztás',
    setup: 'Kapcsolat beállítása',
    loadingSetup: 'Integrációs beállítások betöltése',
    disabled:
      'Ebben a példányban nincs engedélyezve az AI-asszisztensek csatlakoztatása.',
    serverUrl: 'MCP-szerver URL-je',
    assistant: 'Asszisztens',
    chatgptSteps: [
      'A ChatGPT bővítményeinél (Plugins) válaszd egy egyéni MCP-szerver hozzáadását.',
      'Illeszd be ezt az URL-t, és válaszd az OAuth-hitelesítést.',
      'Válaszd ki az engedélyeket, jelentkezz be a Calorie Counter alkalmazásba, és nézd át a kapcsolódási kérést.',
      'Kapcsold be az integrációt egy beszélgetésben, és írd le, mit ettél vagy főztél.',
    ],
    chatgptNote:
      'Az elérhetőség a ChatGPT-fiókodtól és a munkaterület beállításaitól függ. Csak olvasási hozzáféréshez kizárólag a nutrition:read engedélyt kérd. Az étkezések vagy a főzések rögzítéséhez a megfelelő írási engedély is kell.',
    claudeSteps: [
      'A Claude-ban nyisd meg a Testreszabás, majd az Összekötők menüt, és válaszd egy egyéni összekötő hozzáadását.',
      'Illeszd be ezt az URL-t, hagyd meg az alapértelmezett bejelentkezési beállításokat, és add hozzá az összekötőt.',
      'Válaszd a Csatlakozás lehetőséget, jelentkezz be a Calorie Counter alkalmazásba, és nézd át a kapcsolódási kérést.',
      'Egy beszélgetésben kapcsold be az összekötőt a + menü Összekötők részében, majd írd le, mit ettél vagy főztél.',
    ],
    claudeNote:
      'Team és Enterprise csomagban előbb a szervezet tulajdonosa adja hozzá az összekötőt a Szervezeti beállítások, majd az Összekötők alatt. Ezután minden tag a Testreszabás, majd az Összekötők alatt csatlakoztatja.',
    dataSharing:
      'Az eszközök által visszaadott ételnevek, adagok és tápértékadatok eljutnak a csatlakoztatott asszisztenshez. Egy étkezés mentése vagy javítása előtt nézd át a becsléseket és az adagokat. Ételt cserélni vagy eltávolítani a Calorie Counter alkalmazásban tudsz.',
    disconnectTitle: (name?: string) =>
      name
        ? `Leválasztod ezt a kapcsolatot: ${name}?`
        : 'Leválasztod ezt a kapcsolatot?',
    disconnectDescription:
      'A kapcsolat elveszíti a hozzáférését. A rögzített étkezések és főzések megmaradnak.',
  },
})
