import type { Doc, Id, TableNames } from '../../convex/_generated/dataModel'

import type { ManagementData } from '@/hooks/use-management-data'

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
    ownerUserId: 'user-1',
    name,
    notes: undefined,
    currentDailyGoalKcal: 2000,
    active: true,
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
    ownerUserId: 'user-1',
    name,
    appliesTo: 'cookedFood',
    archived: false,
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
    ownerUserId: 'user-1',
    name,
    brand: undefined,
    kcalPer100: 100,
    kcalBasisUnit: 'g',
    ignoreCalories: false,
    groupIds: [],
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
    ownerUserId: 'user-1',
    label,
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
    ownerUserId: 'user-1',
    cookSessionId: asId<'cookSessions'>(sessionId),
    name,
    recipeId: undefined,
    recipeVersionId: undefined,
    groupIds: [asId<'foodGroups'>('group-1')],
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

export function createCookedFoodIngredientDoc(
  id: string,
  cookedFoodId: string,
  overrides: Partial<Doc<'cookedFoodIngredients'>> = {},
): Doc<'cookedFoodIngredients'> {
  return {
    _id: asId<'cookedFoodIngredients'>(id),
    _creationTime: 1,
    ownerUserId: 'user-1',
    cookedFoodId: asId<'cookedFoods'>(cookedFoodId),
    sourceType: 'ingredient',
    ingredientId: asId<'ingredients'>('ingredient-1'),
    ingredientNameSnapshot: 'Ingredient',
    referenceAmount: 100,
    referenceUnit: 'g',
    countedAmount: 100,
    rawWeightGrams: 100,
    ingredientKcalPer100Snapshot: 200,
    ingredientKcalBasisUnitSnapshot: 'g',
    ignoreCaloriesSnapshot: false,
    ingredientCaloriesSnapshot: 200,
    ...overrides,
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
    ownerUserId: 'user-1',
    personId: asId<'people'>(personId),
    name: undefined,
    eatenOn: '2026-04-04',
    notes: undefined,
    archived: false,
    createdAt: 1,
    ...overrides,
  }
}

export function createMealItemDoc(
  id: string,
  mealId: string,
  overrides: Partial<Doc<'mealItems'>> = {},
): Doc<'mealItems'> {
  return {
    _id: asId<'mealItems'>(id),
    _creationTime: 1,
    ownerUserId: 'user-1',
    mealId: asId<'meals'>(mealId),
    sourceType: 'custom',
    ingredientId: undefined,
    cookedFoodId: undefined,
    nameSnapshot: 'Meal item',
    kcalPer100Snapshot: 100,
    kcalBasisUnitSnapshot: 'g',
    ignoreCaloriesSnapshot: false,
    consumedWeightGrams: 100,
    caloriesSnapshot: 100,
    notes: undefined,
    ...overrides,
  }
}

export function createEmptyManagementData(
  overrides: Partial<ManagementData> = {},
): ManagementData {
  return {
    people: [],
    personGoalHistory: [],
    foodGroups: [],
    ingredients: [],
    recipes: [],
    recipeVersions: [],
    recipeVersionIngredients: [],
    cookSessions: [],
    cookedFoods: [],
    cookedFoodIngredients: [],
    meals: [],
    mealItems: [],
    ...overrides,
  }
}

export function createManagementData(
  overrides: Partial<ManagementData> = {},
): ManagementData {
  return {
    ...createEmptyManagementData(),
    people: [createPersonDoc('person-1', 'Alex')],
    foodGroups: [createFoodGroupDoc('group-1', 'Fridge stock')],
    ...overrides,
  }
}
