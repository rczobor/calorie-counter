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
    notSaved: 'Used for this estimate only, not saved as a weigh‑in.',
    minor: (bold: (text: string) => ReactNode, name: string) =>
      rich(
        bold('This is for adults.'),
        ' Teens need extra energy to grow, so adult formulas don’t fit. A doctor or dietitian can suggest ',
        name ? `${name}’s goal` : 'a goal',
        '; you can still enter it by hand.',
      ),
    typicalDay: 'On a typical day',
    toMaintain: 'Maintenance',
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
      'Unsure? Pick the lower one. Most people overestimate their activity.',
    goal: 'Weight goal',
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
    target: 'Target weight (optional)',
    optional: 'Optional',
    reachBy: (kg: string, date: string) => `Reach ${kg} kg around ${date}`,
    // The target field sits right above, so the row gives only the date.
    arrives: (date: string) => `around ${date}`,
    kcalADay: 'kcal a day',
    keepsWeight: 'Keeps weight steady',
    perWeek: (direction: Direction, kg: string) =>
      `${direction === 'lose' ? 'Loses' : 'Gains'} ${kg} kg a week`,
    useGoal: (kcal: number) => `Use ${kcal} kcal`,
    // Why Next waits, in the footer.
    missingWords: {
      birthYear: 'year of birth',
      height: 'height',
      weight: 'weight',
    },
    // Sex is chosen, the rest typed in.
    missingDetails: (sex: boolean, list: string) =>
      sex
        ? list
          ? `Choose sex, then add ${list}`
          : 'Choose sex'
        : `Add ${list}`,
    chooseActivity: 'Choose a typical day',
    chooseGoal: 'Choose a goal',
    noSuggestionForMinors: 'No suggestion under 18',
    next: 'Next',
    seeGoal: 'See daily goal',
    back: 'Back',
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
    suggestedGoal: 'Suggested daily goal',
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
    // The likely range is on the number line above.
    maintenance: (closeness: string) => `Maintenance, ${closeness}`,
    // A screen-reader verb before a working row, which opens its step.
    change: 'Change',
    // The result's number line.
    range: {
      current: (kcal: number) => `current ${kcal}`,
      // The estimate is the working's figure.
      maintenance: (low: number, high: number) =>
        `maintenance, likely ${low}–${high}`,
    },
    // The working's first row: what the formula was given.
    bodyDetail: (sex: string, year: number, height: string, weight: string) =>
      `${sex} · born ${year} · ${height} cm · ${weight} kg`,
    heldAtMinimum: (kcal: number) =>
      `Held at the ${kcal} kcal minimum, so the pace will be slower.`,
    startingEstimate: (name: string) =>
      `A starting estimate. After two weeks, the Weight page checks it against ${name ? `${name}’s` : 'the'} real trend.`,
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
    toMaintain: 'Fenntartó kalória',
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
      'Bizonytalan vagy? Válaszd az alacsonyabbat. A legtöbben túlbecsülik az aktivitásukat.',
    goal: 'Testsúlycél',
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
    target: 'Céltestsúly (nem kötelező)',
    optional: 'Nem kötelező',
    reachBy: (kg: string, date: string) => `${kg} kg várhatóan ${date} táján`,
    arrives: (date: string) => `${date} táján`,
    kcalADay: 'kcal/nap',
    keepsWeight: 'Szinten tartja a testsúlyt',
    perWeek: (direction: Direction, kg: string) =>
      `Heti ${kg} kg ${direction === 'lose' ? 'fogyás' : 'hízás'}`,
    useGoal: (kcal: number) => `${kcal} kcal beállítása`,
    // With their articles, as the footer lists them after "Hiányzik".
    missingWords: {
      birthYear: 'a születési év',
      height: 'a testmagasság',
      weight: 'a testsúly',
    },
    missingDetails: (sex: boolean, list: string) =>
      sex
        ? list
          ? `Válaszd ki a nemet; hiányzik ${list}`
          : 'Válaszd ki a nemet'
        : `Hiányzik ${list}`,
    chooseActivity: 'Válassz egy átlagos napot',
    chooseGoal: 'Válassz célt',
    noSuggestionForMinors: '18 év alatt nincs javaslat',
    next: 'Tovább',
    // Not "Napi cél": the goal step's column already says that.
    seeGoal: 'Eredmény',
    back: 'Vissza',
    stepOf: (step: number, total: number) => `${step}/${total}. lépés`,
    suggestedGoal: 'Javasolt napi cél',
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
    change: 'Módosítás',
    range: {
      current: (kcal: number) => `jelenlegi ${kcal}`,
      maintenance: (low: number, high: number) =>
        `fenntartó, valószínűleg ${low}–${high}`,
    },
    bodyDetail: (sex: string, year: number, height: string, weight: string) =>
      `${sex} · szül. ${year} · ${height} cm · ${weight} kg`,
    heldAtMinimum: (kcal: number) =>
      `A cél nem mehet ${kcal} kcal alá, ezért lassabb lesz a tempó.`,
    startingEstimate: () =>
      'Kiinduló becslés. Két hét után a Testsúly oldal összeveti a valós súlytrenddel.',
  },
})
