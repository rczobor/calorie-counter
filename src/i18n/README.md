# Interface languages

The app speaks English (`en`, the fallback) and Hungarian (`hu`). A signed-in
account's choice from Settings wins; until it picks one, the first browser
language the app speaks applies. The prerendered shell is English and switches
right after hydration.

## Writing interface text

Every string a person can see or hear (text, `aria-label`, `title`,
placeholder, toast) lives in a `<module>.messages.ts` file next to the module
that shows it:

```ts
// meal-editor.messages.ts
import { defineMessages } from '@/i18n/messages'

export const messages = defineMessages({
  en: {
    title: 'Log meal',
    foodCount: (count: number) => `${count} ${count === 1 ? 'food' : 'foods'}`,
  },
  hu: {
    title: 'Étkezés rögzítése',
    foodCount: (count: number) => `${count} étel`,
  },
})
```

```tsx
const t = useMessages(messages)
return <h2>{t.title}</h2>
```

- English sets the shape and Hungarian must match it, so type checking catches a
  missing, extra or differently shaped translation.
- Messages with values are functions, so each language keeps its own word order.
  Never build a sentence by concatenating translated fragments.
- Code outside a component render, such as option lists, column definitions and
  helpers, takes a `locale: Locale` (from `useLocale()`) and reads
  `messages[locale]`. Do not leave English in module-level constants.
- Text that people typed (food, person and household names, notes) and data
  from the server stay as they are. Text the app suggests and saves for later
  reading, such as a goal-history reason, is saved in the language it was shown
  in, like typed text. The AI assistant writes its reasons in English.
- Tests render in English, so existing assertions keep their English text.

## Dates and numbers

- Show a calendar date with `formatDate(value, locale)` from `@/lib/dates`, the
  app's one date format ("Sun, Nov 8" or "nov. 8., vasárnap").
- English follows the browser's English region when it has one ("8 Nov" in
  en-GB), else US conventions; `intlLocale(locale)` gives the tag.
- For any other date shape, use `Intl` with `intlLocale(locale)`. Never pass
  `undefined` or `'en-US'`, and do not show date-fns `format()` output, whose
  patterns are English-only. date-fns is still fine for date arithmetic.
- Decimals follow the language: `82.4` in English, `82,4` in Hungarian. An
  entered amount keeps all its digits with `formatAmount(value, locale)` from
  `@/i18n/format`. Whole numbers stay ungrouped in both (`2150 kcal`).
  Calorie figures are whole kcal with `formatKcal(value)` from `@/lib/nutrition`.

## Hungarian style

- Address the person informally (te): "Válassz egy személyt", "Próbáld újra".
- Buttons and menu items are nouns where Hungarian interfaces expect them:
  "Mentés", "Mégse", "Törlés", "Szerkesztés", "Archiválás".
- Sentence case, like the English text. Hungarian quotation marks („…”), and
  "…" for ellipses.
- A noun after a number stays singular: "3 étel", "1 év", "30 nap".
- Do not attach suffixes to interpolated names or values. Hungarian suffixes and
  the article ("a"/"az") change with the word, so "Goal for {name}" becomes
  "Napi cél · Anna" or "Anna: napi cél", not "Anna napi célja".
- Keep short labels short; the phone tab bar and buttons have little room.

## Glossary

Use these terms everywhere so the same thing always has the same name.

| English                       | Magyar                                 |
| ----------------------------- | -------------------------------------- |
| Today                         | Ma                                     |
| Yesterday                     | Tegnap                                 |
| History                       | Előzmények                             |
| Settings                      | Beállítások                            |
| meal                          | étkezés                                |
| Log meal                      | Étkezés rögzítése                      |
| log (a meal, verb)            | rögzít                                 |
| food (an item in a meal)      | étel                                   |
| Food library (catalog)        | Ételtár                                |
| Reusable foods / saved food   | Mentett ételek / mentett étel          |
| Meal template                 | Étkezéssablon                          |
| ingredient                    | alapanyag                              |
| recipe / recipe version       | recept / receptváltozat                |
| food group                    | élelmiszercsoport                      |
| batch (a cooking session)     | főzés                                  |
| cooked food                   | főtt étel                              |
| Cooked batches (page)         | Főtt ételek                            |
| recover (a draft)             | helyreállítás                          |
| finished weight               | kész tömeg                             |
| raw / cooked                  | nyers / főtt                           |
| portion / serving             | adag                                   |
| intake                        | bevitel                                |
| weigh-in                      | mérés                                  |
| amount (grams)                | mennyiség                              |
| weight (of food, grams)       | tömeg                                  |
| body weight                   | testsúly                               |
| Weight (page)                 | Testsúly                               |
| calories                      | kalória                                |
| kcal                          | kcal                                   |
| kcal per 100 g                | kcal/100 g                             |
| daily goal                    | napi cél                               |
| kcal left / kcal over         | kcal maradt / kcal túllépés            |
| Goal reached                  | Cél elérve                             |
| Reached (a macro, short)      | Elérve                                 |
| macros / macro goals          | makrók / makrócélok                    |
| protein / carbs / fat         | fehérje / szénhidrát / zsír            |
| g/kg (of body weight)         | g/ttkg                                 |
| People & goals                | Személyek és célok                     |
| person / people               | személy / személyek                    |
| household                     | háztartás                              |
| member / admin                | tag / adminisztrátor                   |
| invitation                    | meghívó                                |
| AI assistants                 | AI-asszisztensek                       |
| Logging defaults              | Rögzítési alapértelmezések             |
| estimate / estimated          | becslés / becsült                      |
| Nutrition source              | Tápértékforrás                         |
| note                          | megjegyzés                             |
| draft                         | piszkozat                              |
| discard                       | elvetés                                |
| archive / archived / restore  | archiválás / archivált / visszaállítás |
| Show archived                 | Archiváltak megjelenítése              |
| Active / Archived (status)    | Aktív / Archivált                      |
| Food and meals (Settings)     | Ételek és étkezések                    |
| Save / Cancel / Delete        | Mentés / Mégse / Törlés                |
| Edit / Close / Back           | Szerkesztés / Bezárás / Vissza         |
| Add / Remove                  | Hozzáadás / Eltávolítás                |
| Loading… / Saving…            | Betöltés… / Mentés…                    |
| Try again / Retry             | Próbáld újra                           |
| Something went wrong          | Hiba történt                           |
| Search                        | Keresés                                |
| Light / Dark / System (theme) | Világos / Sötét / Rendszer             |
| Language                      | Nyelv                                  |
| Add to your device (install)  | Hozzáadás az eszközhöz                 |
| Home Screen                   | kezdőképernyő                          |

The product name "Calorie Counter" is not translated.
