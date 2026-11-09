import type { ReactNode } from 'react'
import { defineMessages, rich } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    title: 'Privacy notice',
    updated: (date: string) => `Last updated ${date}`,
    intro:
      'This notice explains what Calorie Counter stores about you, why, and what you can do about it.',
    controllerHeading: 'Who is responsible',
    controller: (name: string, email: ReactNode) =>
      rich(
        `Calorie Counter is run by ${name}, who decides how your data is used. Write to `,
        email,
        ' with any question or request.',
      ),
    storesHeading: 'What the app stores',
    stores: [
      'Your sign-in: your name and email address, from Clerk.',
      'What you enter: the people you track, their meals and foods, calories, body weights, daily goals and the details used to suggest a goal (sex, birth year, height and activity level), and your food library, recipes and cooking.',
      'Your settings: your language and the logging defaults AI assistants use.',
      'AI assistant connections: which assistants you connected, and the requests they made.',
      'Usage: when and how often you log, and whether in the app or through an assistant. Visits and page speed are measured with Vercel Web Analytics and Speed Insights, which use no cookies.',
    ],
    healthHeading: 'Health data',
    health:
      'Calories eaten, body weight and calorie goals are health data. The app processes them only with your explicit consent, which you give before you start. You can withdraw it at any time by deleting your account.',
    whyHeading: 'Why',
    why: [
      'To run the app: store your entries, add up your days and suggest goals.',
      'To share a household’s data with the people you invite to it.',
      'To let AI assistants you connect read and record data for you.',
      'To improve the app. The operator can see which accounts log regularly and, for everyone together, how people log and how often days end near their goals. Never what anyone ate.',
    ],
    basis:
      'The legal basis is your explicit consent (GDPR Article 6(1)(a) and Article 9(2)(a)), which covers everything this notice describes. The cookieless visit and speed statistics rely on legitimate interest (Article 6(1)(f)).',
    whoHeading: 'Who else sees it',
    who: [
      'Members of a household you share see that household’s data, with one exception: once you mark a person as yourself, only you see that person’s body weight and only you can change their goal.',
      'AI assistants you connect, such as ChatGPT or Claude, receive what they ask for on your behalf. Their own privacy terms apply to it.',
      'The service providers that run the app: Clerk (sign-in), Convex (database) and Vercel (hosting and statistics). They process data only on the operator’s instructions, under data processing agreements. Some are based in the United States; transfers rely on the safeguards in those agreements, such as standard contractual clauses or the EU–US Data Privacy Framework.',
      'Nobody else. Your data is never sold or used for advertising.',
    ],
    keepHeading: 'How long it is kept',
    keep: 'Until you delete it or your account. Deleting your account removes it, and every household only you belong to, within minutes. Copies in the providers’ backups disappear as those backups expire.',
    shared:
      'Data in a household you share stays with its other members when you leave or delete your account. The person marked as you keeps their goal, but their body weight and the details behind the goal are deleted. Ask a household admin to remove the rest, or write to the address above.',
    rightsHeading: 'Your rights',
    rights: (email: ReactNode) =>
      rich(
        'You can ask to see, correct, export or delete your data, restrict or object to its use, and withdraw your consent at any time. You can see, correct and delete your data in the app; for anything else, write to ',
        email,
        '. You can also complain to your data protection authority; in Hungary that is the NAIH (naih.hu).',
      ),
    medicalHeading: 'Not medical advice',
    medical:
      'Calorie counts, goals and suggestions are estimates to help you keep track. They are not medical advice. Talk to a doctor before large changes to how you eat, especially if you are pregnant, under 18 or have a medical condition.',
    asIs: 'The app is free and provided as is, without a promise that it is always available or free of errors.',
    changesHeading: 'Changes',
    changes:
      'If this notice changes in a way that matters, the app asks for your consent again.',
  },
  hu: {
    title: 'Adatvédelmi tájékoztató',
    updated: (date: string) => `Utolsó módosítás: ${date}`,
    intro:
      'Ez a tájékoztató leírja, mit tárol rólad a Calorie Counter, miért, és mit tehetsz ezzel kapcsolatban.',
    controllerHeading: 'Ki felel az adataidért',
    controller: (name: string, email: ReactNode) =>
      rich(
        `A Calorie Counter üzemeltetője ${name}, aki az adataid kezeléséről dönt. Kérdéseiddel és kéréseiddel írj a következő címre: `,
        email,
        '.',
      ),
    storesHeading: 'Mit tárol az alkalmazás',
    stores: [
      'A bejelentkezésedet: a nevedet és az e-mail-címedet, a Clerk szolgáltatótól.',
      'Amit megadsz: a követett személyeket, az étkezéseiket és ételeiket, a kalóriákat, a testsúlyt, a napi célokat és a célajánláshoz használt adatokat (nem, születési év, magasság, aktivitási szint), valamint az ételtárat, a recepteket és a főzéseket.',
      'A beállításaidat: a nyelvet és az AI-asszisztensek rögzítési alapértelmezéseit.',
      'Az AI-asszisztens-kapcsolatokat: mely asszisztenseket kapcsoltad össze, és milyen kéréseket küldtek.',
      'A használatot: mikor és milyen gyakran rögzítesz, és hogy az alkalmazásban vagy asszisztenssel. A látogatásokat és az oldalsebességet a Vercel Web Analytics és Speed Insights méri, sütik nélkül.',
    ],
    healthHeading: 'Egészségügyi adatok',
    health:
      'Az elfogyasztott kalória, a testsúly és a kalóriacél egészségügyi adat. Az alkalmazás csak a kifejezett hozzájárulásoddal kezeli őket, amelyet a használat megkezdése előtt adsz meg. Bármikor visszavonhatod a fiókod törlésével.',
    whyHeading: 'Mire használjuk',
    why: [
      'Az alkalmazás működtetésére: tárolja a bejegyzéseidet, összesíti a napjaidat és célt javasol.',
      'Hogy egy háztartás adatait megoszthasd azokkal, akiket meghívsz.',
      'Hogy az összekapcsolt AI-asszisztensek adatokat olvashassanak és rögzíthessenek helyetted.',
      'Az alkalmazás fejlesztésére. Az üzemeltető látja, mely fiókok rögzítenek rendszeresen, és mindenkire összesítve azt, hogyan rögzítenek az emberek, és milyen gyakran zárulnak a napok a cél közelében. Azt soha, hogy ki mit evett.',
    ],
    basis:
      'A jogalap a kifejezett hozzájárulásod (GDPR 6. cikk (1) bekezdés a) pont és 9. cikk (2) bekezdés a) pont), amely mindenre kiterjed, amit ez a tájékoztató leír. A sütik nélküli látogatási és sebességstatisztikák jogalapja a jogos érdek (6. cikk (1) bekezdés f) pont).',
    whoHeading: 'Ki fér még hozzá',
    who: [
      'A közös háztartásod tagjai látják a háztartás adatait, egy kivétellel: ha egy személyt magadként jelölsz meg, a testsúlyát csak te látod, és a célját csak te módosíthatod.',
      'Az összekapcsolt AI-asszisztensek (például a ChatGPT vagy a Claude) megkapják, amit a nevedben lekérnek. Ezekre a saját adatvédelmi feltételeik vonatkoznak.',
      'Az alkalmazást működtető szolgáltatók: a Clerk (bejelentkezés), a Convex (adatbázis) és a Vercel (tárhely és statisztikák). Csak az üzemeltető utasítására, adatfeldolgozási szerződés alapján kezelik az adatokat. Egyesek az Egyesült Államokban működnek; az adattovábbítást a szerződésekben foglalt garanciák, például általános adatvédelmi kikötések vagy az EU–USA adatvédelmi keret védik.',
      'Senki más. Az adataidat soha nem adjuk el, és nem használjuk hirdetésre.',
    ],
    keepHeading: 'Meddig őrizzük',
    keep: 'Amíg nem törlöd őket vagy a fiókodat. A fiók törlése perceken belül eltávolítja a fiókodat és minden olyan háztartást, amelynek csak te vagy a tagja. A szolgáltatók biztonsági mentéseiben lévő másolatok a mentések lejártával törlődnek.',
    shared:
      'Egy közös háztartás adatai a többi tagnál maradnak, ha kilépsz vagy törlöd a fiókodat. A magadként megjelölt személy célja megmarad, de a testsúlya és a cél mögötti adatok törlődnek. A többi adat eltávolítását kérd a háztartás adminisztrátorától, vagy írj a fenti címre.',
    rightsHeading: 'A jogaid',
    rights: (email: ReactNode) =>
      rich(
        'Kérheted az adataid megtekintését, helyesbítését, kiadását vagy törlését, kezelésük korlátozását, tiltakozhatsz ellene, és bármikor visszavonhatod a hozzájárulásodat. Az adataidat az alkalmazásban megtekintheted, javíthatod és törölheted; minden máshoz írj a következő címre: ',
        email,
        '. Panaszt tehetsz az adatvédelmi hatóságnál is; Magyarországon ez a NAIH (naih.hu).',
      ),
    medicalHeading: 'Nem orvosi tanács',
    medical:
      'A kalóriaértékek, a célok és a javaslatok becslések, amelyek a nyomon követést segítik. Nem minősülnek orvosi tanácsnak. Mielőtt jelentősen változtatsz az étkezéseden, beszélj orvossal, különösen ha várandós vagy, 18 év alatti vagy, vagy valamilyen betegséged van.',
    asIs: 'Az alkalmazás ingyenes, és úgy használható, ahogy van: nem garantáljuk, hogy mindig elérhető és hibátlan.',
    changesHeading: 'Változások',
    changes:
      'Ha ez a tájékoztató lényegesen megváltozik, az alkalmazás újra kéri a hozzájárulásodat.',
  },
})
