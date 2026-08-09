import type { Doc, Id, TableNames } from '../../convex/_generated/dataModel'

const OWNER_TOKEN_IDENTIFIER = 'user-1|token'

export function asId<TableName extends TableNames>(value: string) {
  return value as Id<TableName>
}

export function createPersonDoc(
  id: string,
  name: string,
  overrides: Partial<Doc<'people'>> = {},
): Doc<'people'> {
  return {
    _id: asId<'people'>(id),
    _creationTime: 1,
    ownerTokenIdentifier: OWNER_TOKEN_IDENTIFIER,
    name,
    notes: undefined,
    currentDailyGoalKcal: 2000,
    archived: false,
    createdAt: 1,
    ...overrides,
  }
}

export function createFoodGroupDoc(
  id: string,
  name: string,
  overrides: Partial<Doc<'foodGroups'>> = {},
): Doc<'foodGroups'> {
  return {
    _id: asId<'foodGroups'>(id),
    _creationTime: 1,
    ownerTokenIdentifier: OWNER_TOKEN_IDENTIFIER,
    name,
    appliesTo: 'cookedFood',
    archived: false,
    createdAt: 1,
    ...overrides,
  }
}

export function createPersonGoalHistoryDoc(
  id: string,
  personId: string,
  overrides: Partial<Doc<'personGoalHistory'>> = {},
): Doc<'personGoalHistory'> {
  return {
    _id: asId<'personGoalHistory'>(id),
    _creationTime: 1,
    ownerTokenIdentifier: OWNER_TOKEN_IDENTIFIER,
    personId: asId<'people'>(personId),
    effectiveDate: '2026-04-04',
    goalKcal: 2000,
    reason: undefined,
    createdAt: 1,
    ...overrides,
  }
}

export function createIngredientDoc(
  id: string,
  name: string,
  overrides: Partial<Doc<'ingredients'>> = {},
): Doc<'ingredients'> {
  return {
    _id: asId<'ingredients'>(id),
    _creationTime: 1,
    ownerTokenIdentifier: OWNER_TOKEN_IDENTIFIER,
    name,
    brand: undefined,
    kcalPer100: 100,
    kcalBasisUnit: 'g',
    ignoreCalories: false,
    groupId: undefined,
    notes: undefined,
    archived: false,
    createdAt: 1,
    ...overrides,
  }
}

export function createCookSessionDoc(
  id: string,
  label: string,
  overrides: Partial<Doc<'cookSessions'>> = {},
): Doc<'cookSessions'> {
  return {
    _id: asId<'cookSessions'>(id),
    _creationTime: 1,
    ownerTokenIdentifier: OWNER_TOKEN_IDENTIFIER,
    label,
    searchText: `2026-04-04 ${label}`,
    cookedAt: 1,
    cookedByPersonId: asId<'people'>('person-1'),
    notes: undefined,
    archived: false,
    updatedAt: 1,
    createdAt: 1,
    ...overrides,
  }
}

export function createCookedFoodDoc(
  id: string,
  sessionId: string,
  name: string,
  overrides: Partial<Doc<'cookedFoods'>> = {},
): Doc<'cookedFoods'> {
  return {
    _id: asId<'cookedFoods'>(id),
    _creationTime: 1,
    ownerTokenIdentifier: OWNER_TOKEN_IDENTIFIER,
    cookSessionId: asId<'cookSessions'>(sessionId),
    name,
    recipeId: undefined,
    recipeVersionId: undefined,
    groupId: asId<'foodGroups'>('group-1'),
    finishedWeightGrams: 300,
    totalRawWeightGrams: 300,
    totalCalories: 900,
    kcalPer100: 300,
    notes: undefined,
    archived: false,
    createdAt: 1,
    ...overrides,
  }
}

type IngredientCookedFoodLine = Extract<
  Doc<'cookedFoodIngredients'>,
  { sourceType: 'ingredient' }
>
type CustomCookedFoodLine = Extract<
  Doc<'cookedFoodIngredients'>,
  { sourceType: 'custom' }
>
type IngredientCookedFoodLineOverrides = Partial<
  Omit<
    IngredientCookedFoodLine,
    '_id' | '_creationTime' | 'ownerTokenIdentifier' | 'cookedFoodId'
  >
> & { sourceType?: 'ingredient' }
type CustomCookedFoodLineOverrides = Partial<
  Omit<
    CustomCookedFoodLine,
    '_id' | '_creationTime' | 'ownerTokenIdentifier' | 'cookedFoodId'
  >
> & { sourceType: 'custom' }

export function createCookedFoodIngredientDoc(
  id: string,
  cookedFoodId: string,
  overrides?: IngredientCookedFoodLineOverrides,
): IngredientCookedFoodLine
export function createCookedFoodIngredientDoc(
  id: string,
  cookedFoodId: string,
  overrides: CustomCookedFoodLineOverrides,
): CustomCookedFoodLine
export function createCookedFoodIngredientDoc(
  id: string,
  cookedFoodId: string,
  overrides:
    IngredientCookedFoodLineOverrides | CustomCookedFoodLineOverrides = {},
): Doc<'cookedFoodIngredients'> {
  const common = {
    _id: asId<'cookedFoodIngredients'>(id),
    _creationTime: 1,
    ownerTokenIdentifier: OWNER_TOKEN_IDENTIFIER,
    cookedFoodId: asId<'cookedFoods'>(cookedFoodId),
    ingredientNameSnapshot: 'Ingredient',
    referenceAmount: 100,
    referenceUnit: 'g' as const,
    countedAmount: 100,
    ingredientKcalPer100Snapshot: 200,
    ingredientKcalBasisUnitSnapshot: 'g' as const,
    ignoreCaloriesSnapshot: false,
    ingredientCaloriesSnapshot: 200,
  }
  if (overrides.sourceType === 'custom') {
    return {
      ...common,
      ingredientId: undefined,
      ...overrides,
      sourceType: 'custom',
    }
  }
  return {
    ...common,
    ingredientId: asId<'ingredients'>('ingredient-1'),
    ...overrides,
    sourceType: 'ingredient',
  }
}

export function createMealDoc(
  id: string,
  personId: string,
  overrides: Partial<Doc<'meals'>> = {},
): Doc<'meals'> {
  return {
    _id: asId<'meals'>(id),
    _creationTime: 1,
    ownerTokenIdentifier: OWNER_TOKEN_IDENTIFIER,
    personId: asId<'people'>(personId),
    name: undefined,
    eatenOn: '2026-04-04',
    notes: undefined,
    archived: false,
    totalCalories: 100,
    itemCount: 1,
    createdAt: 1,
    ...overrides,
  }
}

type IngredientMealItem = Extract<
  Doc<'mealItems'>,
  { sourceType: 'ingredient' }
>
type CustomMealItem = Extract<
  Doc<'mealItems'>,
  { sourceType: 'customByWeight' }
>
type CookedFoodMealItem = Extract<
  Doc<'mealItems'>,
  { sourceType: 'cookedFood' }
>
type FixedCaloriesMealItem = Extract<
  Doc<'mealItems'>,
  { sourceType: 'fixedCalories' }
>
type MealItemOverrides<TItem extends Doc<'mealItems'>> = Partial<
  Omit<TItem, '_id' | '_creationTime' | 'ownerTokenIdentifier' | 'mealId'>
>
type IngredientMealItemOverrides = MealItemOverrides<IngredientMealItem> & {
  sourceType: 'ingredient'
}
type CustomMealItemOverrides = MealItemOverrides<CustomMealItem> & {
  sourceType?: 'customByWeight'
}
type CookedFoodMealItemOverrides = MealItemOverrides<CookedFoodMealItem> & {
  sourceType: 'cookedFood'
}
type FixedCaloriesMealItemOverrides =
  MealItemOverrides<FixedCaloriesMealItem> & {
    sourceType: 'fixedCalories'
  }

export function createMealItemDoc(
  id: string,
  mealId: string,
  overrides?: CustomMealItemOverrides,
): CustomMealItem
export function createMealItemDoc(
  id: string,
  mealId: string,
  overrides: IngredientMealItemOverrides,
): IngredientMealItem
export function createMealItemDoc(
  id: string,
  mealId: string,
  overrides: CookedFoodMealItemOverrides,
): CookedFoodMealItem
export function createMealItemDoc(
  id: string,
  mealId: string,
  overrides: FixedCaloriesMealItemOverrides,
): FixedCaloriesMealItem
export function createMealItemDoc(
  id: string,
  mealId: string,
  overrides:
    | CustomMealItemOverrides
    | IngredientMealItemOverrides
    | CookedFoodMealItemOverrides
    | FixedCaloriesMealItemOverrides = {},
): Doc<'mealItems'> {
  const common = {
    _id: asId<'mealItems'>(id),
    _creationTime: 1,
    ownerTokenIdentifier: OWNER_TOKEN_IDENTIFIER,
    mealId: asId<'meals'>(mealId),
    nameSnapshot: 'Meal item',
    caloriesSnapshot: 100,
    notes: undefined,
  }
  if (overrides.sourceType === 'fixedCalories') {
    return {
      ...common,
      ...overrides,
      sourceType: 'fixedCalories',
    }
  }
  const weighted = {
    ...common,
    kcalPer100Snapshot: 100,
    kcalBasisUnitSnapshot: 'g' as const,
    ignoreCaloriesSnapshot: false,
    consumedWeightGrams: 100,
  }
  if (overrides.sourceType === 'ingredient') {
    return {
      ...weighted,
      ingredientId: asId<'ingredients'>('ingredient-1'),
      ...overrides,
      sourceType: 'ingredient',
    }
  }
  if (overrides.sourceType === 'cookedFood') {
    return {
      ...weighted,
      cookedFoodId: asId<'cookedFoods'>('cooked-food-1'),
      ...overrides,
      sourceType: 'cookedFood',
    }
  }
  return {
    ...weighted,
    ingredientId: undefined,
    ...overrides,
    sourceType: 'customByWeight',
  }
}
