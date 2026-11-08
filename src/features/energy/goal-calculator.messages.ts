import type { ReactNode } from 'react'

import { defineMessages, rich } from '@/i18n/messages'

type Direction = 'lose' | 'gain'

export const messages = defineMessages({
  en: {
    title: 'Find a daily goal',
    description: (name: string) =>
      `A suggested daily goal for ${name || 'a new person'}. Nothing changes until you use it.`,
    about: (name: string) => (name ? `About ${name}` : 'About this person'),
    adultsOnly: 'For adults who aren’t pregnant or breastfeeding.',
    sex: 'Sex for the formula',
    female: 'Female',
    male: 'Male',
    birthYear: 'Year of birth',
    birthYearPlaceholder: 'e.g. 1990',
    height: 'Height',
    heightPlaceholder: 'e.g. 170',
    weight: 'Weight',
    weightPlaceholder: 'e.g. 75',
    birthYearError: (min: number, max: number) =>
      `Enter a year between ${min} and ${max}.`,
    heightError: (min: number, max: number) =>
      `Enter a height between ${min} and ${max} cm.`,
    weightError: (min: number, max: number) =>
      `Enter a weight between ${min} and ${max} kg.`,
    targetError: 'Enter a target weight in kilograms, like 75.',
    todaysWeighIn: 'From today’s weigh-in.',
    weighInOn: (date: string) => `From the weigh-in on ${date}.`,
    notSaved: 'Used for this estimate only, not saved as a weigh-in.',
    minor: (bold: (text: string) => ReactNode, name: string) =>
      rich(
        bold('This is for adults.'),
        ' Teens need extra energy to grow, so adult formulas don’t fit. A doctor or dietitian can suggest ',
        name ? `${name}’s goal` : 'a goal',
        '; you can still enter it by hand.',
      ),
    typicalDay: 'On a typical day',
    toMaintain: 'To maintain',
    activity: {
      inactive: {
        title: 'Mostly sitting',
        description: 'Desk job, little exercise beyond chores',
      },
      lowActive: {
        title: 'Lightly active',
        description: 'About an hour of walking a day, or on your feet at work',
      },
      active: {
        title: 'Active',
        description: 'Daily walking plus a workout most days',
      },
      veryActive: {
        title: 'Very active',
        description: 'Hard training most days, or physical work',
      },
    },
    lowerActivity:
      'Unsure? Pick the lower one. Most people overestimate, and check-ins correct it.',
    goal: 'Goal',
    lose: 'Lose',
    maintain: 'Maintain',
    gain: 'Gain',
    noLossBelowBmi: (bmi: string) =>
      `Losing weight isn’t offered below a BMI of ${bmi}.`,
    pace: 'Pace',
    dailyGoal: 'Daily goal',
    paces: {
      lose: { 0.25: 'Gentle', 0.5: 'Steady', 0.75: 'Faster', 1: 'Fastest' },
      gain: { 0.25: 'Slow', 0.5: 'Steady' },
    },
    yourPlan: 'Your plan',
    suggested: 'Suggested',
    paceDetail: (percent: string, kg: string) => `${percent}% · ${kg} a week`,
    pacePercent: (percent: string) => `${percent}% a week`,
    minimum: 'minimum',
    fromMaintenance: (kcal: number) => `From ≈ ${kcal} kcal a day maintenance.`,
    target: 'Target weight (optional)',
    optional: 'Optional',
    projection: (kg: string, date: string, weeks: number) =>
      `Reach ${kg} kg around ${date}, in about ${weeks} weeks`,
    kcalADay: 'kcal a day',
    noSuggestionForMinors: 'No suggestion under 18',
    missingWords: {
      sex: 'sex',
      birthYear: 'year of birth',
      height: 'height',
      weight: 'weight',
      activity: 'activity',
      goal: 'a goal',
    },
    addMore: (first: string, second: string, more: number) =>
      `Add ${first}, ${second} and ${more} more`,
    add: (list: string) => `Add ${list}`,
    checkDetails: 'Check the details above',
    keepsWeight: 'Keeps weight steady',
    perWeek: (direction: Direction, kg: string) =>
      `${direction === 'lose' ? 'Loses' : 'Gains'} ${kg} kg a week`,
    useGoal: 'Use goal',
    // energyPlanIssue's kinds; English matches the server's energyPlanProblem.
    problems: {
      birthYear: (min: number, max: number) =>
        `Year of birth must be between ${min} and ${max}.`,
      height: (min: number, max: number) =>
        `Height must be between ${min} and ${max} cm.`,
      targetInvalid: 'Enter a target weight in kilograms.',
      adults: 'Goal plans are for adults.',
      pace: 'Choose one of the offered paces.',
      noLoss: (bmi: string) =>
        `Losing weight isn't offered below a BMI of ${bmi}.`,
      belowHealthy: (kg: string) =>
        `The target is below a healthy weight for this height (${kg} kg).`,
      notBelow: 'The target is not below the current weight.',
      notAbove: 'The target is not above the current weight.',
    },
    howItAddsUp: 'How it adds up',
    maintenance: (closeness: string) => `Maintenance, ${closeness}`,
    likely: (low: number, high: number) => `likely ${low}–${high}`,
    forChange: (kg: string) => `For ${kg} a week`,
    heldAtMinimum: (kcal: number) =>
      `Held at the ${kcal} kcal minimum, so the pace will be slower.`,
    startingEstimate: (name: string) =>
      `A starting estimate. After two weeks of logs and weigh-ins, the Weight page checks it against ${name ? `${name}’s` : 'the'} real trend.`,
  },
  hu: {
    title: 'Napi cél kiszámítása',
    description: (name: string) =>
      name
        ? `${name}: javasolt napi cél. Amíg nem állítod be, semmi sem változik.`
        : 'Javasolt napi cél egy új személynek. Amíg nem állítod be, semmi sem változik.',
    about: (name: string) => (name ? `Adatok · ${name}` : 'A személy adatai'),
    adultsOnly: 'Felnőtteknek, akik nem várandósak és nem szoptatnak.',
    sex: 'Nem (a képlethez)',
    female: 'Nő',
    male: 'Férfi',
    birthYear: 'Születési év',
    birthYearPlaceholder: 'pl. 1990',
    height: 'Testmagasság',
    heightPlaceholder: 'pl. 170',
    weight: 'Testsúly',
    weightPlaceholder: 'pl. 75',
    birthYearError: (min: number, max: number) =>
      `Adj meg egy évet ${min} és ${max} között.`,
    heightError: (min: number, max: number) =>
      `Adj meg ${min} és ${max} cm közötti testmagasságot.`,
    weightError: (min: number, max: number) =>
      `Adj meg ${min} és ${max} kg közötti testsúlyt.`,
    targetError: 'Add meg a céltestsúlyt kilogrammban, pl. 75.',
    todaysWeighIn: 'A mai mérésből.',
    weighInOn: (date: string) => `A legutóbbi mérésből (${date}).`,
    notSaved: 'Csak ehhez a becsléshez használjuk, mérésként nem mentjük.',
    // The name would need a suffix here, and the sheet already names them.
    minor: (bold: (text: string) => ReactNode) =>
      rich(
        bold('Ez felnőtteknek szól.'),
        ' A kamaszoknak a növekedéshez több energia kell, ezért a felnőttekre készült képletek nem illenek rájuk. Napi célt orvos vagy dietetikus tud javasolni; kézzel továbbra is megadhatod.',
      ),
    typicalDay: 'Egy átlagos napon',
    toMaintain: 'Szinten tartáshoz',
    activity: {
      inactive: {
        title: 'Többnyire ülő',
        description: 'Ülőmunka, a házimunkán túl kevés mozgás',
      },
      lowActive: {
        title: 'Enyhén aktív',
        description: 'Napi kb. egy óra séta, vagy állómunka',
      },
      active: {
        title: 'Aktív',
        description: 'Napi séta, és a legtöbb napon edzés',
      },
      veryActive: {
        title: 'Nagyon aktív',
        description: 'Kemény edzés a legtöbb napon, vagy fizikai munka',
      },
    },
    lowerActivity:
      'Bizonytalan vagy? Válaszd az alacsonyabbat. A legtöbben túlbecsülik, és az ellenőrzések kiigazítják.',
    goal: 'Cél',
    lose: 'Fogyás',
    maintain: 'Szinten tartás',
    gain: 'Hízás',
    noLossBelowBmi: (bmi: string) =>
      `${bmi} alatti BMI esetén nem ajánlunk fogyást.`,
    pace: 'Tempó',
    dailyGoal: 'Napi cél',
    paces: {
      lose: {
        0.25: 'Kíméletes',
        0.5: 'Egyenletes',
        0.75: 'Gyorsabb',
        1: 'Leggyorsabb',
      },
      gain: { 0.25: 'Lassú', 0.5: 'Egyenletes' },
    },
    yourPlan: 'A terved',
    suggested: 'Javasolt',
    paceDetail: (percent: string, kg: string) => `Heti ${percent}% · ${kg}`,
    pacePercent: (percent: string) => `Heti ${percent}%`,
    minimum: 'minimum',
    fromMaintenance: (kcal: number) =>
      `≈ ${kcal} kcal/nap fenntartó kalóriából számolva.`,
    target: 'Céltestsúly (nem kötelező)',
    optional: 'Nem kötelező',
    projection: (kg: string, date: string, weeks: number) =>
      `${kg} kg várhatóan ${date} táján, nagyjából ${weeks} hét alatt`,
    kcalADay: 'kcal/nap',
    noSuggestionForMinors: '18 év alatt nincs javaslat',
    // With their articles, as the footer lists them after "Hiányzik".
    missingWords: {
      sex: 'a nem',
      birthYear: 'a születési év',
      height: 'a testmagasság',
      weight: 'a testsúly',
      activity: 'az aktivitási szint',
      goal: 'a cél',
    },
    addMore: (first: string, second: string, more: number) =>
      `Hiányzik ${first}, ${second} és még ${more} adat`,
    add: (list: string) => `Hiányzik ${list}`,
    checkDetails: 'Ellenőrizd a fenti adatokat',
    keepsWeight: 'Szinten tartja a testsúlyt',
    perWeek: (direction: Direction, kg: string) =>
      `Heti ${kg} kg ${direction === 'lose' ? 'fogyás' : 'hízás'}`,
    useGoal: 'Cél beállítása',
    problems: {
      birthYear: (min: number, max: number) =>
        `A születési év ${min} és ${max} között lehet.`,
      height: (min: number, max: number) =>
        `A testmagasság ${min} és ${max} cm között lehet.`,
      targetInvalid: 'Add meg a céltestsúlyt kilogrammban.',
      adults: 'A célterv felnőtteknek szól.',
      pace: 'Válassz a felkínált tempók közül.',
      noLoss: (bmi: string) => `${bmi} alatti BMI esetén nem ajánlunk fogyást.`,
      belowHealthy: (kg: string) =>
        `A cél ennél a testmagasságnál az egészséges testsúly alatt van (${kg} kg).`,
      notBelow: 'A cél nem kisebb a jelenlegi testsúlynál.',
      notAbove: 'A cél nem nagyobb a jelenlegi testsúlynál.',
    },
    howItAddsUp: 'Így jön ki',
    maintenance: (closeness: string) => `Fenntartó kalória, ${closeness}`,
    likely: (low: number, high: number) => `valószínűleg ${low}–${high}`,
    forChange: (kg: string) => `Heti ${kg} változáshoz`,
    heldAtMinimum: (kcal: number) =>
      `A cél nem mehet ${kcal} kcal alá, ezért lassabb lesz a tempó.`,
    startingEstimate: () =>
      'Ez kiinduló becslés. Két hét rögzítés és mérés után a Testsúly oldal összeveti a valós súlytrenddel.',
  },
})
