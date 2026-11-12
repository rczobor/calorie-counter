import { defineMessages } from '@/i18n/messages'

type Direction = 'lose' | 'gain'

export const messages = defineMessages({
  en: {
    loading: 'Loading maintenance',
    heading: 'Maintenance',
    learning: 'Learning',
    progress: (shown: number, of: number) => `${shown} of ${of}`,
    appearsAfter: (name: string) =>
      `${name}’s measured maintenance appears after two weeks of logs and six weigh-ins.`,
    loggedDays: 'Logged days',
    weighIns: 'Weigh-ins',
    spanTwoWeeks: 'The weigh-ins need to span at least two weeks.',
    formulaGuess: 'Until then, the formula’s guess',
    approxPerDay: (kcal: number) => `≈ ${kcal} kcal a day`,
    currentGoal: 'Current goal',
    perDay: (kcal: number) => `${kcal} kcal a day`,
    editPlan: 'Edit plan',
    weighInTip: 'Weigh in most mornings, before eating. ',
    daysLeftOut: 'Days without a log are left out, not counted as zero.',
    choosePace: 'Choose a pace to get a suggested goal.',
    addDetails:
      'Add height and activity for a starting estimate and a suggested goal.',
    findGoal: 'Find a daily goal',
    checkInReason: (kcal: number) => `Check-in: maintenance ≈ ${kcal} kcal`,
    goalUpdated: 'Goal updated.',
    onTrack: 'On track',
    goal: 'Goal',
    now: (kcal: number) => `Now ${kcal}`,
    close: 'Close',
    kcalADay: 'kcal a day',
    likely: (
      low: number,
      high: number,
      closeness: string,
      formula: number | null,
    ) =>
      `Likely ${low}–${high}: ${closeness}.${formula === null ? '' : ` The formula guessed ${formula}.`}`,
    averageIntake: 'Average logged intake',
    weightTrend: 'Weight trend',
    plan: 'Plan',
    kgAWeek: 'kg a week',
    skippedDay: (date: string, kcal: number) =>
      `${date} (only ${kcal} kcal logged)`,
    basis: (days: number, weighIns: number, weeks: number) =>
      `From ${days} logged days and ${weighIns} weigh-ins in the last ${weeks} weeks.`,
    skipped: (days: string, more: number) =>
      ` Skipped as incomplete: ${days}${more > 0 ? ` and ${more} more` : ''}.`,
    suggestedGoal: 'Suggested goal',
    heldAtMinimum: (kcal: number) => `Held at the ${kcal} kcal minimum.`,
    updateGoal: 'Update goal',
    targetReached: (name: string, kg: string) =>
      `${name} reached ${kg} kg, so this keeps weight steady.`,
    belowHealthyWeight: (name: string) =>
      `${name} is below a healthy weight for their height, so this keeps weight steady.`,
    aimMaintain: 'Maintenance, to keep weight steady',
    aim: (
      maintenance: number,
      step: string,
      direction: Direction,
      percent: string,
      kg: string,
    ) =>
      `${maintenance} ${step} kcal to ${direction} ${percent}% a week (${kg} kg)`,
    onPace: (aim: string) => `${aim}; the trend is on pace.`,
    weightMoving: (aim: string, falling: boolean) =>
      `${aim}; weight is ${falling ? 'falling' : 'rising'}.`,
    trendPace: (aim: string, slower: boolean) =>
      `${aim}; the trend is ${slower ? 'slower' : 'faster'} than planned.`,
    chartLabel: (
      first: { kcal: number; day: string },
      last: { kcal: number; day: string },
      formula: number | null,
    ) =>
      `Estimate from ${first.kcal} kcal on ${first.day} to ${last.kcal} kcal on ${last.day}${formula === null ? '' : `, against the formula’s ${formula}`}`,
    formula: (kcal: number) => `Formula ${kcal}`,
  },
  hu: {
    loading: 'Fenntartó kalória betöltése',
    heading: 'Fenntartó kalória',
    learning: 'Adatgyűjtés',
    progress: (shown: number, of: number) => `${shown} / ${of}`,
    appearsAfter: (name: string) =>
      `${name}: a mért fenntartó kalória két hét rögzítés és hat mérés után jelenik meg.`,
    loggedDays: 'Rögzített napok',
    weighIns: 'Mérések',
    spanTwoWeeks: 'A méréseknek legalább két hetet kell átfogniuk.',
    formulaGuess: 'Addig a képlet becslése',
    approxPerDay: (kcal: number) => `≈ ${kcal} kcal/nap`,
    currentGoal: 'Jelenlegi cél',
    perDay: (kcal: number) => `${kcal} kcal/nap`,
    editPlan: 'Terv szerkesztése',
    weighInTip: 'Mérd meg magad a legtöbb reggel, evés előtt. ',
    daysLeftOut:
      'A rögzítés nélküli napok kimaradnak, nem nullának számítanak.',
    choosePace: 'Válassz tempót, és javaslunk egy célt.',
    addDetails:
      'Add meg a testmagasságot és az aktivitási szintet a kiinduló becsléshez és a javasolt célhoz.',
    findGoal: 'Napi cél kiszámítása',
    checkInReason: (kcal: number) =>
      `Ellenőrzés: fenntartó kalória ≈ ${kcal} kcal`,
    goalUpdated: 'Cél frissítve.',
    onTrack: 'Rendben',
    goal: 'Cél',
    now: (kcal: number) => `Jelenleg ${kcal}`,
    close: 'Bezárás',
    kcalADay: 'kcal/nap',
    likely: (
      low: number,
      high: number,
      closeness: string,
      formula: number | null,
    ) =>
      `Valószínűleg ${low}–${high}: ${closeness}.${formula === null ? '' : ` A képlet becslése ${formula} volt.`}`,
    averageIntake: 'Átlagos rögzített bevitel',
    weightTrend: 'Súlytrend',
    plan: 'Terv',
    kgAWeek: 'kg/hét',
    skippedDay: (date: string, kcal: number) =>
      `${date} (csak ${kcal} kcal rögzítve)`,
    basis: (days: number, weighIns: number, weeks: number) =>
      `Az elmúlt ${weeks} hét ${days} rögzített napja és ${weighIns} mérése alapján.`,
    skipped: (days: string, more: number) =>
      ` Hiányosként kihagyva: ${days}${more > 0 ? ` és még ${more} nap` : ''}.`,
    suggestedGoal: 'Javasolt cél',
    heldAtMinimum: (kcal: number) => `A cél nem mehet ${kcal} kcal alá.`,
    updateGoal: 'Cél frissítése',
    targetReached: (name: string, kg: string) =>
      `${name} elérte a célt (${kg} kg), ezért ez a cél szinten tartja a testsúlyt.`,
    belowHealthyWeight: (name: string) =>
      `${name}: a testsúly ehhez a testmagassághoz az egészséges tartomány alatt van, ezért ez a cél szinten tartja.`,
    aimMaintain: 'Fenntartó kalória a szinten tartáshoz',
    aim: (
      maintenance: number,
      step: string,
      direction: Direction,
      percent: string,
      kg: string,
    ) =>
      `${maintenance} ${step} kcal a heti ${percent}% (${kg} kg) ${direction === 'lose' ? 'fogyáshoz' : 'hízáshoz'}`,
    onPace: (aim: string) => `${aim}; a súlytrend tartja a tempót.`,
    weightMoving: (aim: string, falling: boolean) =>
      `${aim}; a testsúly ${falling ? 'csökken' : 'nő'}.`,
    trendPace: (aim: string, slower: boolean) =>
      `${aim}; a súlytrend ${slower ? 'lassabb' : 'gyorsabb'} a tervezettnél.`,
    chartLabel: (
      first: { kcal: number; day: string },
      last: { kcal: number; day: string },
      formula: number | null,
    ) =>
      `Becslés: ${first.kcal} kcal (${first.day}), majd ${last.kcal} kcal (${last.day})${formula === null ? '' : `; a képlet becslése ${formula} kcal`}`,
    formula: (kcal: number) => `Képlet ${kcal}`,
  },
})
