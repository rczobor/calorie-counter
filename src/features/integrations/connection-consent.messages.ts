import { defineMessages } from '@/i18n/messages'

type Scope = { name: string; description: string }

// Keyed by the server's exact English (convex/mcp.ts scopes). When that text
// changes, the screen shows the new English rather than a translation that may
// no longer list everything a permission allows.
export const HUNGARIAN_SCOPE_DESCRIPTIONS: Partial<Record<string, string>> = {
  'Read people, body weights, daily goals, foods, recipes, meals, and calorie totals in your households':
    'Személyek, testsúlyok, napi célok, ételek, receptek, étkezések és kalóriaösszesítések olvasása a háztartásaidban',
  'Record and correct meals and body weights, change daily goals, save reusable foods, and set logging preferences':
    'Étkezések és testsúlyok rögzítése és javítása, napi célok módosítása, mentett ételek létrehozása és a rögzítési alapértelmezések beállítása',
  'Record cooking sessions and correct cooked-food finished weights':
    'Főzések rögzítése és a főtt ételek kész tömegének javítása',
}

export const messages = defineMessages({
  en: {
    title: 'Connect an AI assistant',
    description:
      'Grant access to the households your Calorie Counter account belongs to.',
    framed: 'Open this page directly to approve a connection.',
    finished: 'You can return to your assistant.',
    noRequest:
      'Start the connection from your assistant using the MCP URL in Settings, AI assistants.',
    loading: 'Loading connection request',
    expired:
      'This request has expired or was already handled. Start again from your assistant.',
    unsupported:
      'This connection method is not enabled. Start a browser OAuth connection from your assistant.',
    clientName: 'Client name (unverified):',
    clientWarning:
      'Approve only a connection you started. The client supplies its name; it has not been verified by Calorie Counter.',
    returnTo: 'Return to:',
    fullReturnAddress: 'Full return address',
    localApplication:
      'A local application will receive this connection. Approve only if you started it.',
    // The server's English text is also what assistants show for each scope.
    scopeDescription: (scope: Scope) => scope.description,
    accessSummary:
      'The assistant can access people, meals, goals, history, catalog, and cooking in all households you belong to, including households you join later, within the permissions above. It chooses the household explicitly for each request. You can disconnect it in Settings, AI assistants.',
    allow: 'Allow access',
    deny: 'Deny',
  },
  hu: {
    title: 'AI-asszisztens csatlakoztatása',
    description:
      'Adj hozzáférést azokhoz a háztartásokhoz, amelyeknek a Calorie Counter-fiókod a tagja.',
    framed: 'A kapcsolat jóváhagyásához nyisd meg közvetlenül ezt az oldalt.',
    finished: 'Visszatérhetsz az asszisztensedhez.',
    noRequest:
      'Indítsd el a kapcsolódást az asszisztensedből. Az MCP URL-t a Beállítások, AI-asszisztensek oldalon találod.',
    loading: 'Kapcsolódási kérés betöltése',
    expired:
      'Ez a kérés lejárt, vagy már feldolgozták. Kezdd újra az asszisztensedből.',
    unsupported:
      'Ez a kapcsolódási mód nincs engedélyezve. Indíts böngészős OAuth-kapcsolódást az asszisztensedből.',
    clientName: 'Kliens neve (nem ellenőrzött):',
    clientWarning:
      'Csak olyan kapcsolatot hagyj jóvá, amelyet te indítottál. A nevet maga a kliens adja meg, a Calorie Counter nem ellenőrizte.',
    returnTo: 'Visszatérés ide:',
    fullReturnAddress: 'Teljes visszatérési cím',
    localApplication:
      'Ezt a kapcsolatot egy helyi alkalmazás kapja meg. Csak akkor hagyd jóvá, ha te indítottad.',
    scopeDescription: (scope: Scope) =>
      HUNGARIAN_SCOPE_DESCRIPTIONS[scope.description] ?? scope.description,
    accessSummary:
      'Az asszisztens a fenti engedélyek keretein belül hozzáfér a személyekhez, az étkezésekhez, a célokhoz, az előzményekhez, az ételtárhoz és a főzésekhez minden háztartásban, amelynek tagja vagy, azokban is, amelyekhez később csatlakozol. Minden kérésnél kifejezetten kiválasztja a háztartást. A Beállítások, AI-asszisztensek oldalon leválaszthatod.',
    allow: 'Engedélyezés',
    deny: 'Elutasítás',
  },
})
