// A fuller synthetic data set for design reviews, selected with
// VITE_E2E_SCENARIO=design in e2e mode. Its shape follows real use: an
// assistant logs most meals, often with descriptive names; most meals hold one
// or two foods, with the occasional six-item plate; batch-cooked dishes are
// eaten over several days; most days end slightly over goal; nothing was
// logged before nine days ago; and the second person logs short, generic,
// single-food entries. All names and numbers are invented.
// Records depend only on `now`'s calendar day, so captures of two builds made
// on the same day show identical data. Browser tests keep the default seed.
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  createCookSessionDoc,
  createCookedFoodDoc,
  createIngredientDoc,
} from '@/tests/factories'
import type { MockState } from './convex-react-adapter'

type Provenance = NonNullable<Doc<'mealItems'>['nutritionProvenance']>
type Macros = { proteinG: number; carbsG: number; fatG: number }
const macroGrams = ([proteinG, carbsG, fatG]: readonly [
  number,
  number,
  number,
]) => ({
  proteinG,
  carbsG,
  fatG,
})
type FoodIdentity = NonNullable<Doc<'mealItems'>['foodIdentity']>

type ItemSpec =
  | { from: 'ingredient'; id: keyof typeof ingredients; amount: number }
  | { from: 'cooked'; id: keyof typeof cooked; grams: number }
  | {
      from: 'custom'
      name: string
      kcalPer100: number
      grams: number
      brand?: string
      provenance?: Provenance
      macros?: Macros
    }
  | {
      from: 'fixed'
      name: string
      calories: number
      servings?: number
      servingLabel?: string
      brand?: string
      provenance?: Provenance
      macros?: Macros
    }

type MealSpec = { name: string; at: string; items: ItemSpec[] }

const estimate = (assumptions: string): Provenance => ({
  kind: 'estimate',
  origin: 'generic',
  source: 'Assistant estimate',
  assumptions,
})
const label = (assumptions: string): Provenance => ({
  kind: 'provided',
  origin: 'label',
  source: 'Packaging label',
  assumptions,
})

const ingredients = {
  egg: ['Egg', 147],
  butter: ['Butter', 717],
  cheddar: ['Cheddar', 403],
  banana: ['Banana', 89],
  apple: ['Apple', 52],
  yogurt: ['Greek yogurt 2%', 73],
  oats: ['Rolled oats', 379],
  milk: ['Semi-skimmed milk', 46, 'ml'],
  rice: ['Basmati rice, cooked', 130],
  honey: ['Honey', 304],
  peanutButter: ['Peanut butter, smooth', 588],
  oil: ['Olive oil', 884],
  sourCream: ['Sour cream', 193],
  potatoes: ['Potatoes, boiled', 87],
  spinach: ['Spinach', 23],
} as const satisfies Record<string, readonly [string, number, ('g' | 'ml')?]>

// Protein, carbs and fat per 100 g (or ml). Like a real catalog part way
// through filling in macros, some foods have none: the day card then says how
// much of the day the grams cover.
const ingredientMacros: Partial<
  Record<keyof typeof ingredients, readonly [number, number, number]>
> = {
  egg: [12.6, 0.7, 9.9],
  butter: [0.9, 0.1, 81],
  cheddar: [25, 1.3, 33],
  banana: [1.1, 22.8, 0.3],
  apple: [0.3, 13.8, 0.2],
  yogurt: [9.7, 3.9, 2],
  oats: [13.2, 67.7, 6.5],
  milk: [3.4, 4.8, 1.7],
  rice: [2.7, 28.2, 0.3],
  honey: [0.3, 82.4, 0],
  peanutButter: [25, 20, 50],
  sourCream: [2.4, 4.6, 19],
}

// One batch per cooking session, named after the dish, cooked `daysAgo`.
const cooked = {
  lasagna: {
    name: 'Homemade beef lasagna',
    grams: 2600,
    kcal: 5200,
    daysAgo: 1,
    macros: [11, 17, 10],
  },
  chili: {
    name: 'Chili con carne',
    grams: 2400,
    kcal: 2880,
    daysAgo: 3,
    macros: [9, 8, 5.5],
  },
  dahl: {
    name: 'Red lentil dahl',
    grams: 1800,
    kcal: 1980,
    daysAgo: 5,
    macros: [6, 15, 3],
  },
  tikka: {
    name: 'Chicken tikka masala',
    grams: 2400,
    kcal: 3360,
    daysAgo: 6,
    macros: [12, 6, 7.5],
  },
  soup: { name: 'Pumpkin soup', grams: 2000, kcal: 1100, daysAgo: 8 },
  traybake: {
    name: 'Roasted vegetable tray bake',
    grams: 1200,
    kcal: 1080,
    daysAgo: 8,
  },
} as const

const ing = (id: keyof typeof ingredients, amount: number): ItemSpec => ({
  from: 'ingredient',
  id,
  amount,
})
const batch = (id: keyof typeof cooked, grams: number): ItemSpec => ({
  from: 'cooked',
  id,
  grams,
})
const fixed = (
  name: string,
  calories: number,
  provenance: Provenance,
  serving?: { count: number; label: string; brand?: string },
  macros?: Macros,
): ItemSpec => ({
  from: 'fixed',
  name,
  calories,
  provenance,
  servings: serving?.count,
  servingLabel: serving?.label,
  brand: serving?.brand,
  macros,
})
const sourdough = (grams: number): ItemSpec => ({
  from: 'custom',
  name: 'Sourdough bread',
  kcalPer100: 254,
  grams,
  brand: 'Corner Bakery',
  provenance: label('254 kcal per 100 g.'),
  macros: macroGrams([9, 50, 1.5]),
})
const flatWhite = fixed(
  'Flat white',
  130,
  estimate('Medium café flat white with semi-skimmed milk.'),
)

const meals = {
  // The main person: mostly assistant-logged, descriptive names.
  eggPlate: {
    name: 'Scrambled eggs on sourdough with tomato, cucumber and cheddar',
    at: '08:20',
    items: [
      ing('egg', 152),
      ing('butter', 6),
      sourdough(68),
      {
        from: 'custom',
        name: 'Tomato',
        kcalPer100: 22,
        grams: 164,
        provenance: estimate('One large tomato.'),
      },
      {
        from: 'custom',
        name: 'Cucumber',
        kcalPer100: 15,
        grams: 55,
        provenance: estimate('About a fifth of a cucumber.'),
      },
      ing('cheddar', 8),
    ],
  },
  cafeBreakfast: {
    name: 'Corner Café breakfast — granola bowl and flat white',
    at: '08:40',
    items: [
      fixed(
        'Granola bowl with yogurt and berries',
        420,
        estimate('Café portion, about 300 g.'),
      ),
      flatWhite,
    ],
  },
  oats: {
    name: 'Overnight oats with banana and honey',
    at: '07:50',
    items: [
      ing('oats', 60),
      ing('milk', 200),
      ing('banana', 100),
      ing('honey', 15),
    ],
  },
  yogurtBowl: {
    name: 'Greek yogurt with banana and honey',
    at: '08:10',
    items: [ing('yogurt', 200), ing('banana', 100), ing('honey', 10)],
  },
  coffee: { name: 'Flat white', at: '10:30', items: [flatWhite] },
  lasagna: {
    name: 'Homemade beef lasagna',
    at: '19:20',
    items: [batch('lasagna', 350)],
  },
  lasagnaExtra: {
    name: 'Homemade beef lasagna – extra portion',
    at: '20:45',
    items: [batch('lasagna', 125)],
  },
  chili: {
    name: 'Chili con carne with rice',
    at: '13:00',
    items: [batch('chili', 350), ing('rice', 150)],
  },
  // As long as the longest real names an assistant writes.
  chiliSecond: {
    name: 'Second portion — homemade chili con carne with sour cream, cheddar and bread',
    at: '20:30',
    items: [
      batch('chili', 250),
      ing('sourCream', 30),
      ing('cheddar', 20),
      sourdough(50),
    ],
  },
  dahl: {
    name: 'Red lentil dahl with rice',
    at: '13:10',
    items: [batch('dahl', 400), ing('rice', 150)],
  },
  tikka: {
    name: 'Chicken tikka masala with basmati rice',
    at: '19:00',
    items: [batch('tikka', 350), ing('rice', 180)],
  },
  soup: {
    name: 'Pumpkin soup with bread',
    at: '12:45',
    items: [batch('soup', 400), sourdough(70)],
  },
  traybake: {
    name: 'Roasted vegetable tray bake with halloumi',
    at: '19:30',
    items: [
      batch('traybake', 400),
      {
        from: 'custom',
        name: 'Halloumi',
        kcalPer100: 321,
        grams: 80,
        provenance: label('321 kcal per 100 g.'),
      },
    ],
  },
  cafeLunch: {
    name: 'Corner Café — chicken pesto panini and an iced americano',
    at: '12:30',
    items: [
      fixed('Chicken pesto panini', 520, estimate('Café panini, about 220 g.')),
      fixed('Iced americano', 10, estimate('Black coffee over ice.')),
    ],
  },
  cookie: {
    name: 'Homemade oat cookie',
    at: '16:00',
    items: [
      fixed(
        'Oat cookie',
        112,
        estimate('One soft homemade cookie, about 25 g.'),
      ),
    ],
  },
  banana: { name: 'Banana', at: '15:30', items: [ing('banana', 120)] },
  applePb: {
    name: 'Apple with peanut butter',
    at: '16:20',
    items: [ing('apple', 180), ing('peanutButter', 20)],
  },
  shake: {
    name: 'Protein shake',
    at: '18:00',
    items: [
      fixed(
        'Chocolate protein shake',
        180,
        label('180 kcal per 330 ml bottle.'),
        { count: 1, label: 'bottle', brand: 'Shake Co.' },
        macroGrams([20, 15, 4.5]),
      ),
    ],
  },
  chocolate: {
    name: 'Dark chocolate',
    at: '21:15',
    items: [
      fixed('Dark chocolate 70%', 110, label('55 kcal per square.'), {
        count: 2,
        label: 'squares',
      }),
    ],
  },
  // The second person: short, generic, mostly single-food entries.
  vBreakfast: {
    name: 'Breakfast',
    at: '07:30',
    items: [fixed('Oatmeal with milk', 310, estimate('One bowl.'))],
  },
  vCoffee: {
    name: 'Coffee',
    at: '09:30',
    items: [fixed('Cappuccino', 90, estimate('Regular cup.'))],
  },
  vBanana: { name: 'Snack', at: '11:00', items: [ing('banana', 120)] },
  vCookie: {
    name: 'Snack',
    at: '16:00',
    items: [
      fixed(
        'Oat cookie',
        112,
        estimate('One soft homemade cookie, about 25 g.'),
      ),
    ],
  },
  vLasagna: { name: 'Lunch', at: '12:30', items: [batch('lasagna', 250)] },
  vDahl: { name: 'Lunch', at: '12:30', items: [batch('dahl', 300)] },
  vSoup: { name: 'Lunch', at: '12:30', items: [batch('soup', 400)] },
  vSalad: {
    name: 'Dinner',
    at: '19:00',
    items: [fixed('Chicken salad', 420, estimate('Large bowl with dressing.'))],
  },
  vChili: {
    name: 'Dinner',
    at: '19:00',
    items: [batch('chili', 250), ing('rice', 100)],
  },
  vDrink: {
    name: 'Drink',
    at: '15:00',
    items: [fixed('Orange juice', 110, estimate('250 ml glass.'))],
  },
  vTea: {
    name: 'Tea',
    at: '21:00',
    items: [fixed('Tea with honey', 40, estimate('One teaspoon of honey.'))],
  },
} as const satisfies Record<string, MealSpec>

type MealKey = keyof typeof meals

// Days ago → meals. Alex's goal is 2000 kcal: today is in progress and under
// goal, seven of the eight days before it end over goal, and the two days
// before those have nothing logged. Older days follow below.
const alexDays: Record<number, MealKey[]> = {
  0: ['oats', 'coffee', 'chili'],
  1: ['cafeBreakfast', 'eggPlate', 'cookie', 'lasagna', 'lasagnaExtra'],
  2: ['yogurtBowl', 'coffee', 'tikka', 'applePb', 'chiliSecond', 'shake'],
  3: ['oats', 'cafeLunch', 'banana', 'chili', 'cookie'],
  4: [
    'eggPlate',
    'coffee',
    'dahl',
    'chocolate',
    'traybake',
    'applePb',
    'shake',
  ],
  5: ['cafeBreakfast', 'dahl', 'banana', 'tikka', 'cookie', 'chocolate'],
  6: [
    'yogurtBowl',
    'coffee',
    'soup',
    'applePb',
    'tikka',
    'chocolate',
    'cookie',
    'banana',
    'shake',
  ],
  7: ['oats', 'cafeLunch', 'traybake', 'shake', 'chocolate', 'applePb'],
  8: ['eggPlate', 'soup', 'banana', 'traybake', 'coffee', 'cookie', 'shake'],
}

// Five weeks before that, Alex logged a little under goal most days, so the
// Weight page's check-in has four weeks of data. A few days have no log, and
// one has only a coffee and a banana: an unfinished day the check-in skips.
const olderAlexDays: MealKey[][] = [
  ['oats', 'cafeLunch', 'dahl', 'banana', 'applePb'],
  ['eggPlate', 'coffee', 'soup', 'tikka', 'cookie'],
  ['yogurtBowl', 'chili', 'coffee', 'traybake', 'banana', 'applePb'],
  ['cafeBreakfast', 'soup', 'chili', 'shake', 'cookie'],
  ['oats', 'coffee', 'lasagna', 'applePb', 'chocolate', 'banana', 'shake'],
]
for (let daysAgo = 11; daysAgo <= 44; daysAgo++) {
  if ([13, 20, 26, 33, 38].includes(daysAgo)) continue
  alexDays[daysAgo] =
    daysAgo === 17
      ? ['coffee', 'banana']
      : olderAlexDays[daysAgo % olderAlexDays.length]
}

// Viki's goal is 1500 kcal; one day ends over goal.
const vikiDays: Record<number, MealKey[]> = {
  0: ['vBreakfast', 'vCoffee', 'vBanana'],
  1: [
    'vBreakfast',
    'vCoffee',
    'vBanana',
    'vLasagna',
    'vCookie',
    'vSalad',
    'vTea',
  ],
  2: ['vBreakfast', 'vCoffee', 'vBanana', 'vDahl', 'vDrink', 'vChili', 'vTea'],
  3: [
    'vBreakfast',
    'vCoffee',
    'vCookie',
    'vSoup',
    'vBanana',
    'vSalad',
    'vTea',
    'vDrink',
  ],
  4: ['vBreakfast', 'vCoffee', 'vDahl', 'vBanana', 'vSalad', 'vTea'],
  5: ['vBreakfast', 'vCoffee', 'vBanana', 'vSoup', 'vCookie', 'vSalad', 'vTea'],
  6: ['vBreakfast', 'vCoffee', 'vBanana', 'vSoup', 'vDrink', 'vSalad', 'vTea'],
  7: ['vBreakfast', 'vCoffee', 'vSoup', 'vBanana', 'vSalad', 'vTea', 'vCookie'],
}

const alexId = 'aaaaaaaaaaaaaaaaaaaa' as Id<'people'>
const vikiId = 'bbbbbbbbbbbbbbbbbbbb' as Id<'people'>
// Sam is another member's own person: weighs in, and linked to their account.
const samId = 'cccccccccccccccccccc' as Id<'people'>
const samUserId = 'e2e-sam' as Id<'users'>

// Grams eaten per item, summed with the kcal of the items that had macros.
function mealMacros(items: Array<Doc<'mealItems'>>) {
  let total: Doc<'meals'>['macros']
  for (const item of items) {
    if (!item.macrosSnapshot) continue
    const scale =
      item.sourceType === 'fixedCalories' ? 1 : item.consumedWeightGrams / 100
    total = {
      proteinG: (total?.proteinG ?? 0) + item.macrosSnapshot.proteinG * scale,
      carbsG: (total?.carbsG ?? 0) + item.macrosSnapshot.carbsG * scale,
      fatG: (total?.fatG ?? 0) + item.macrosSnapshot.fatG * scale,
      coveredCalories: (total?.coveredCalories ?? 0) + item.caloriesSnapshot,
    }
  }
  return total
}

function dateKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function createDesignData(
  now: number,
  ownerUserId: Id<'users'>,
  householdId: Id<'households'>,
): Pick<
  MockState,
  'dashboard' | 'mealDetails' | 'templates' | 'savedFoodArchived' | 'weights'
> {
  const today = new Date(now)
  const at = (daysAgo: number, time = '12:00') => {
    const [hours, minutes] = time.split(':').map(Number)
    return new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - daysAgo,
      hours,
      minutes,
    )
  }
  const owner = { ownerUserId, householdId }

  const ingredientDocs = (
    Object.keys(ingredients) as Array<keyof typeof ingredients>
  ).map((id) => {
    const [name, kcalPer100, unit] = ingredients[id]
    const macros = ingredientMacros[id]
    return createIngredientDoc(`design-ingredient-${id}`, name, {
      ...owner,
      kcalPer100,
      kcalBasisUnit: unit ?? 'g',
      macros: macros && {
        ...macroGrams(macros),
        nutritionProvenance: label('Per 100 g as printed.'),
      },
    })
  })
  const sessionDocs = Object.entries(cooked).map(([id, food]) => {
    const cookedAt = at(food.daysAgo, '17:30')
    return createCookSessionDoc(`design-session-${id}`, food.name, {
      ...owner,
      cookedAt: cookedAt.getTime(),
      searchText: `${dateKey(cookedAt)} ${food.name}`,
      cookedByPersonId: alexId,
    })
  })
  const cookedDocs = Object.entries(cooked).map(([id, food]) =>
    createCookedFoodDoc(
      `design-cooked-${id}`,
      `design-session-${id}`,
      food.name,
      {
        ...owner,
        finishedWeightGrams: food.grams,
        totalRawWeightGrams: food.grams,
        totalCalories: food.kcal,
        kcalPer100: (food.kcal / food.grams) * 100,
        macros: 'macros' in food ? macroGrams(food.macros) : undefined,
        createdAt: at(food.daysAgo, '18:30').getTime(),
      },
    ),
  )

  function itemDoc(
    spec: ItemSpec,
    mealId: Id<'meals'>,
    index: number,
    createdAt: number,
  ) {
    const common = {
      _id: `${mealId}-item-${index}` as Id<'mealItems'>,
      _creationTime: createdAt,
      ownerUserId,
      householdId,
      mealId,
    }
    if (spec.from === 'ingredient') {
      const [name, kcalPer100, unit] = ingredients[spec.id]
      return {
        ...common,
        sourceType: 'ingredient',
        ingredientId: `design-ingredient-${spec.id}` as Id<'ingredients'>,
        nameSnapshot: name,
        caloriesSnapshot: Math.round((spec.amount * kcalPer100) / 100),
        consumedWeightGrams: spec.amount,
        kcalPer100Snapshot: kcalPer100,
        kcalBasisUnitSnapshot: unit ?? 'g',
        ignoreCaloriesSnapshot: false,
        macrosSnapshot:
          ingredientMacros[spec.id] && macroGrams(ingredientMacros[spec.id]!),
      } satisfies Doc<'mealItems'>
    }
    if (spec.from === 'cooked') {
      const food = cooked[spec.id]
      const kcalPer100 = (food.kcal / food.grams) * 100
      return {
        ...common,
        sourceType: 'cookedFood',
        cookedFoodId: `design-cooked-${spec.id}` as Id<'cookedFoods'>,
        nameSnapshot: food.name,
        caloriesSnapshot: Math.round((spec.grams * kcalPer100) / 100),
        consumedWeightGrams: spec.grams,
        kcalPer100Snapshot: kcalPer100,
        kcalBasisUnitSnapshot: 'g',
        ignoreCaloriesSnapshot: false,
        macrosSnapshot: 'macros' in food ? macroGrams(food.macros) : undefined,
      } satisfies Doc<'mealItems'>
    }
    if (spec.from === 'custom') {
      return {
        ...common,
        sourceType: 'customByWeight',
        nameSnapshot: spec.name,
        caloriesSnapshot: Math.round((spec.grams * spec.kcalPer100) / 100),
        consumedWeightGrams: spec.grams,
        kcalPer100Snapshot: spec.kcalPer100,
        kcalBasisUnitSnapshot: 'g',
        ignoreCaloriesSnapshot: false,
        macrosSnapshot: spec.macros,
        nutritionProvenance: spec.provenance,
        foodIdentity: spec.brand
          ? { basis: 'g', brand: spec.brand }
          : undefined,
      } satisfies Doc<'mealItems'>
    }
    const foodIdentity: FoodIdentity | undefined =
      spec.servingLabel || spec.brand
        ? {
            basis: 'serving',
            servingLabel: spec.servingLabel,
            brand: spec.brand,
          }
        : undefined
    return {
      ...common,
      sourceType: 'fixedCalories',
      nameSnapshot: spec.name,
      caloriesSnapshot: spec.calories,
      macrosSnapshot: spec.macros,
      servingCount: spec.servings,
      nutritionProvenance: spec.provenance,
      foodIdentity,
    } satisfies Doc<'mealItems'>
  }

  const mealDocs: Array<Doc<'meals'>> = []
  const mealDetails: MockState['mealDetails'] = {}
  function addMeal(
    personId: Id<'people'>,
    daysAgo: number,
    key: MealKey,
    archived = false,
  ) {
    const spec: MealSpec = meals[key]
    const createdAt = at(daysAgo, spec.at).getTime()
    const mealId =
      `design-meal-${personId.slice(0, 1)}-${daysAgo}-${key}${archived ? '-archived' : ''}` as Id<'meals'>
    const items: Array<Doc<'mealItems'>> = spec.items.map((item, index) =>
      itemDoc(item, mealId, index, createdAt),
    )
    const meal: Doc<'meals'> = {
      _id: mealId,
      _creationTime: createdAt,
      ownerUserId,
      householdId,
      personId,
      name: spec.name,
      eatenOn: dateKey(at(daysAgo)),
      archived,
      totalCalories: items.reduce(
        (sum, item) => sum + item.caloriesSnapshot,
        0,
      ),
      macros: mealMacros(items),
      itemCount: items.length,
      editRevision: 0,
      createdAt,
    }
    mealDocs.push(meal)
    mealDetails[mealId] = { meal, items }
  }
  for (const [personId, days] of [
    [alexId, alexDays],
    [vikiId, vikiDays],
  ] as const) {
    for (const [daysAgo, keys] of Object.entries(days)) {
      for (const key of keys) addMeal(personId, Number(daysAgo), key)
    }
  }
  // An assistant logged dinner twice; the duplicate was archived.
  addMeal(alexId, 2, 'tikka', true)

  // Alex weighs in most mornings and is slowly losing weight; Viki never has.
  // A ten-day holiday a month and a half ago left a gap.
  const weights: Array<Doc<'weightEntries'>> = []
  const wobble = (daysAgo: number) =>
    0.35 * Math.sin(daysAgo * 1.7) + 0.2 * Math.sin(daysAgo * 0.45)
  for (let daysAgo = 120; daysAgo >= 0; daysAgo--) {
    const skipped =
      daysAgo > 1 &&
      ([3, 5].includes(daysAgo % 7) || (daysAgo >= 40 && daysAgo <= 49))
    if (skipped) continue
    const weightKg =
      Math.round((82.4 + daysAgo * 0.03 + wobble(daysAgo) - wobble(0)) * 10) /
      10
    const measuredAt = at(daysAgo, '07:15').getTime()
    weights.push({
      _id: `design-weight-a-${daysAgo}` as Id<'weightEntries'>,
      _creationTime: measuredAt,
      ...owner,
      personId: alexId,
      measuredOn: dateKey(at(daysAgo)),
      weightKg,
      editRevision: 0,
      createdAt: measuredAt,
      updatedAt: measuredAt,
    })
  }

  for (let daysAgo = 9; daysAgo >= 0; daysAgo--) {
    const measuredAt = at(daysAgo, '06:50').getTime()
    weights.push({
      _id: `design-weight-s-${daysAgo}` as Id<'weightEntries'>,
      _creationTime: measuredAt,
      ...owner,
      personId: samId,
      measuredOn: dateKey(at(daysAgo)),
      weightKg: Math.round((71.2 - daysAgo * 0.05) * 10) / 10,
      editRevision: 0,
      createdAt: measuredAt,
      updatedAt: measuredAt,
    })
  }

  const person = (
    _id: Id<'people'>,
    name: string,
    goal: number,
    energy: Pick<Doc<'people'>, 'energyProfile' | 'goalPlan'>,
  ): Doc<'people'> => ({
    _id,
    _creationTime: at(9).getTime(),
    ownerUserId,
    householdId,
    name,
    currentDailyGoalKcal: goal,
    ...energy,
    archived: false,
    editRevision: 0,
    createdAt: at(9).getTime(),
  })

  return {
    dashboard: {
      people: [
        // Alex is the signed-in account and used the goal calculator to lose
        // 0.5% a week.
        {
          ...person(alexId, 'Alex', 2000, {
            energyProfile: {
              sex: 'female',
              birthYear: 1988,
              heightCm: 170,
              activity: 'lowActive',
            },
            goalPlan: {
              direction: 'lose',
              percentPerWeek: 0.5,
              targetWeightKg: 75,
            },
          }),
          // Protein follows body weight; carbs have no goal.
          macroGoals: { proteinGPerKg: 1.6, fatG: 70 },
          userId: ownerUserId,
        },
        // Viki keeps weight steady and has never weighed in here.
        person(vikiId, 'Viki', 1500, {
          energyProfile: {
            sex: 'female',
            birthYear: 1994,
            heightCm: 163,
            activity: 'inactive',
          },
          goalPlan: { direction: 'maintain' },
        }),
        {
          ...person(samId, 'Sam', 2600, {
            goalPlan: { direction: 'gain', percentPerWeek: 0.25 },
          }),
          userId: samUserId,
        },
      ],
      ingredients: ingredientDocs,
      cookSessions: sessionDocs,
      cookedFoods: cookedDocs,
      // Newest first, like meals created through the adapter.
      meals: mealDocs.sort((a, b) => b.createdAt - a.createdAt),
      mealItems: [],
    },
    mealDetails,
    templates: [
      {
        _id: 'design-template-oats' as Id<'mealTemplates'>,
        _creationTime: 1,
        name: 'Workday overnight oats',
        sourceMealId: 'design-meal-a-3-oats' as Id<'meals'>,
        sourceItemIds: [],
        ingredientIds: [],
        cookedFoodIds: [],
        savedFoodIds: [],
        editRevision: 0,
        createdAt: 1,
        items: [
          {
            sourceType: 'customByWeight',
            name: 'Rolled oats',
            kcalPer100: 379,
            ignoreCalories: false,
            consumedWeightGrams: 60,
          },
          {
            sourceType: 'customByWeight',
            name: 'Banana',
            kcalPer100: 89,
            ignoreCalories: false,
            consumedWeightGrams: 100,
          },
        ],
      },
      {
        _id: 'design-template-cafe' as Id<'mealTemplates'>,
        _creationTime: 1,
        name: 'Corner Café breakfast',
        sourceMealId: 'design-meal-a-1-cafeBreakfast' as Id<'meals'>,
        sourceItemIds: [],
        ingredientIds: [],
        cookedFoodIds: [],
        savedFoodIds: [],
        editRevision: 0,
        createdAt: 1,
        items: [
          {
            sourceType: 'fixedCalories',
            name: 'Granola bowl with yogurt and berries',
            calories: 420,
          },
          { sourceType: 'fixedCalories', name: 'Flat white', calories: 130 },
        ],
      },
    ],
    // Real households had no reusable foods yet; the adapter's only one is archived.
    savedFoodArchived: true,
    weights,
  }
}
